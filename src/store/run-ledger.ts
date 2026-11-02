import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  buildContextAttestation,
  buildExpectedChecksForPhase,
  classifyRequestKind,
  evaluateRunAssurance,
  inspectDeliverableApplicationEvidence,
  loadDefaultEnvironmentInfo,
  type OrphanOutcome,
  type RunIncident,
  type RunLedgerEvent,
  type RunManifest,
  type RunProcessBinding,
} from "../core/assurance.ts";
import type { ResolvedWorkflowContext } from "../core/context-resolver.ts";

export function runsRootDir(videoDir: string): string {
  return join(videoDir, ".youtube-shell", "runs");
}

export function runDir(videoDir: string, runId: string): string {
  return join(runsRootDir(videoDir), runId);
}

export function runManifestPath(videoDir: string, runId: string): string {
  return join(runDir(videoDir, runId), "manifest.json");
}

export function runEventsPath(videoDir: string, runId: string): string {
  return join(runDir(videoDir, runId), "events.jsonl");
}

export function generateRunId(nowIso: string): string {
  const stamp = nowIso.replace(/[-:.TZ]/g, "").slice(0, 14) || "00000000000000";
  const rand = randomBytes(3).toString("hex");
  return `run-${stamp}-${rand}`;
}

export interface CreateRunRecordOptions {
  runId?: string;
  videoDir: string;
  startedAt: string;
  promptText?: string;
  resolvedWorkflow: ResolvedWorkflowContext;
  allowedTools?: string[];
  promptDelivered: boolean;
  promptHash?: string;
  packageRoot?: string;
  process?: RunProcessBinding;
}

export function createRunRecord(options: CreateRunRecordOptions): RunManifest {
  const wf = options.resolvedWorkflow;
  const runId = options.runId ?? generateRunId(options.startedAt);
  const env = loadDefaultEnvironmentInfo();

  const targetPhaseEval = wf.evaluation.phases.find((p) => p.id === wf.targetPhase);
  const phaseStatusAtStart = targetPhaseEval?.effective ?? "NO_INICIADO";
  const hasPriorProgress = wf.evaluation.phases.some((p) => p.effective !== "NO_INICIADO");
  const requestKind = classifyRequestKind(
    options.promptText ?? "",
    wf.workMode,
    hasPriorProgress,
  );

  const context = buildContextAttestation(wf, {
    promptDelivered: options.promptDelivered,
    promptHash: options.promptHash,
    packageRoot: options.packageRoot,
  });

  const incidents: RunIncident[] = [];
  if (!context.expectedSkill.exists) {
    incidents.push({
      at: options.startedAt,
      kind: "missing_reference",
      summary: `Skill asignada ausente en disco: ${context.expectedSkill.relativePath}`,
    });
  }
  if (wf.workMode === "production") {
    for (const ref of context.mandatoryReferences) {
      if (!ref.exists) {
        incidents.push({
          at: options.startedAt,
          kind: "missing_reference",
          summary: `Referencia obligatoria ausente al iniciar ${wf.targetPhase}: ${ref.targetFile}`,
        });
      }
    }
  }

  const manifest: RunManifest = {
    schema: "youtube-shell.run-manifest/v1",
    runId,
    startedAt: options.startedAt,
    environment: env,
    requestKind,
    workMode: wf.workMode,
    activation: {
      productionMode: wf.layer3.productionMode,
      reason:
        wf.workMode === "read_only"
          ? "Petición clasificada como consulta/auditoría en modo lectura; se retiran herramientas de mutación."
          : `Fase activa/objetivo ${wf.targetPhase} (${phaseStatusAtStart}) con flujo ${wf.layer3.productionMode}.`,
    },
    targetPhase: wf.targetPhase,
    phaseStatusAtStart,
    ...(options.process ? { process: options.process } : {}),
    assignedSkill: wf.playbook.skill,
    context,
    actions: {
      allowedTools: [...(options.allowedTools ?? [])],
      attemptedTools: [],
      completedTools: [],
      blockedTools: [],
    },
    checks: buildExpectedChecksForPhase(wf.targetPhase),
    incidents,
    status: "STARTED",
    statusReason: `Ejecución iniciada sobre ${wf.targetPhase}.`,
  };

  const assurance = evaluateRunAssurance(manifest);
  manifest.status = assurance.status;
  manifest.statusReason = assurance.reason;
  manifest.assurance = assurance;
  return manifest;
}

export function saveRunManifest(videoDir: string, manifest: RunManifest): void {
  if (!existsSync(videoDir)) return;
  manifest.context.applicationEvidence = inspectDeliverableApplicationEvidence(
    videoDir,
    manifest.targetPhase,
  );
  const assurance = evaluateRunAssurance(manifest);
  manifest.status = assurance.status;
  manifest.statusReason = assurance.reason;
  manifest.assurance = assurance;

  const target = runManifestPath(videoDir, manifest.runId);
  const dir = dirname(target);
  mkdirSync(dir, { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  const data = `${JSON.stringify(manifest, null, 2)}\n`;
  let fd: number | undefined;
  try {
    fd = openSync(tmp, "w", 0o600);
    writeFileSync(fd, data, "utf8");
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(tmp, target);
  } catch (err) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {}
    }
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {}
    throw err;
  }
}

export function appendRunEvent(
  videoDir: string,
  runId: string,
  event: RunLedgerEvent,
): void {
  if (!existsSync(videoDir)) return;
  const target = runEventsPath(videoDir, runId);
  mkdirSync(dirname(target), { recursive: true });
  appendFileSync(target, `${JSON.stringify(event)}\n`, "utf8");
}

export function finalizeRunRecord(
  videoDir: string,
  manifest: RunManifest,
  options: {
    finishedAt: string;
    aborted?: boolean;
    phaseStatusAtEnd?: string;
  },
): RunManifest {
  manifest.finishedAt = options.finishedAt;
  if (options.aborted) {
    manifest.aborted = true;
    manifest.incidents.push({
      at: options.finishedAt,
      kind: "aborted",
      summary: "Ejecución interrumpida antes de asentarse.",
    });
  }
  if (options.phaseStatusAtEnd) {
    manifest.phaseStatusAtEnd = options.phaseStatusAtEnd;
  }
  const assurance = evaluateRunAssurance(manifest);
  manifest.status = assurance.status;
  manifest.statusReason = assurance.reason;
  manifest.assurance = assurance;

  saveRunManifest(videoDir, manifest);
  appendRunEvent(videoDir, manifest.runId, {
    at: options.finishedAt,
    type: "run_settled",
    phase: manifest.targetPhase,
    workMode: manifest.workMode,
    details: {
      status: manifest.status,
      reason: manifest.statusReason,
      aborted: Boolean(options.aborted),
      satisfiedControls: assurance.satisfiedCount,
      totalControls: assurance.totalControls,
    },
  });
  return manifest;
}

export function loadRunManifest(videoDir: string, runId: string): RunManifest | undefined {
  const path = runManifestPath(videoDir, runId);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RunManifest;
  } catch {
    return undefined;
  }
}

export function loadRunEvents(videoDir: string, runId: string): RunLedgerEvent[] {
  const path = runEventsPath(videoDir, runId);
  if (!existsSync(path)) return [];
  try {
    return readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l) as RunLedgerEvent);
  } catch {
    return [];
  }
}

export function listRunManifests(videoDir: string): RunManifest[] {
  const root = runsRootDir(videoDir);
  if (!existsSync(root)) return [];
  let entries: string[] = [];
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }
  const manifests: RunManifest[] = [];
  for (const name of entries) {
    const m = loadRunManifest(videoDir, name);
    if (m && m.schema === "youtube-shell.run-manifest/v1") {
      manifests.push(m);
    }
  }
  manifests.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.runId.localeCompare(b.runId));
  return manifests;
}

export interface ReconcileOrphanedRunsOptions {
  now: string;
  /** Injectable liveness probe so tests never depend on real OS processes. */
  isPidAlive?: (pid: number) => boolean;
}

export interface ReconcileOrphanedRunsResult {
  inspected: number;
  active: string[];
  orphaned: string[];
  unknown: string[];
}

function defaultPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to another user.
    return (err as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

/**
 * Three-outcome reconciliation of runs that never settled:
 * - pid alive            -> keep STARTED (the run is still in flight)
 * - pid known and dead   -> ORPHANED (abnormal termination, persisted as ABORTED)
 * - pid missing/invalid  -> UNKNOWN_PROCESS_STATE (persisted as DEGRADED, never success)
 */
export function reconcileOrphanedRuns(
  videoDir: string,
  options: ReconcileOrphanedRunsOptions,
): ReconcileOrphanedRunsResult {
  const result: ReconcileOrphanedRunsResult = {
    inspected: 0,
    active: [],
    orphaned: [],
    unknown: [],
  };
  const alive = options.isPidAlive ?? defaultPidAlive;

  for (const manifest of listRunManifests(videoDir)) {
    if (manifest.finishedAt) continue;
    result.inspected += 1;

    const pid = manifest.process?.pid;
    let outcome: OrphanOutcome;
    let reason: string;
    let pidAlive: boolean | undefined;

    if (typeof pid === "number" && Number.isInteger(pid) && pid > 0) {
      pidAlive = alive(pid);
      if (pidAlive) {
        outcome = "ACTIVE";
        reason = `El proceso pi (pid=${pid}) de la ejecución sigue activo; la corrida permanece STARTED.`;
      } else {
        outcome = "ORPHANED";
        reason = `El proceso pi (pid=${pid}) que creó la ejecución ya no existe y la corrida nunca se asentó.`;
      }
    } else {
      outcome = "UNKNOWN";
      reason =
        "UNKNOWN_PROCESS_STATE: la ejecución no registra un pid verificable, por lo que no se puede probar su término limpio.";
    }

    manifest.reconciliation = {
      reconciledAt: options.now,
      outcome,
      reason,
      ...(pidAlive !== undefined ? { pidAlive } : {}),
    };

    if (outcome === "ORPHANED") {
      result.orphaned.push(manifest.runId);
      manifest.incidents.push({ at: options.now, kind: "orphaned_process", summary: reason });
    } else if (outcome === "UNKNOWN") {
      result.unknown.push(manifest.runId);
    } else {
      result.active.push(manifest.runId);
      saveRunManifest(videoDir, manifest);
      continue;
    }

    saveRunManifest(videoDir, manifest);
    appendRunEvent(videoDir, manifest.runId, {
      at: options.now,
      type: "run_settled",
      phase: manifest.targetPhase,
      workMode: manifest.workMode,
      details: { reconciliation: outcome, reason, status: manifest.status },
    });
  }

  return result;
}

export function sanitizeToolInputForLedger(
  toolName: string,
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const summary: Record<string, unknown> = {};
  for (const key of ["path", "phase", "action", "masterPath", "acceptanceSheetPath", "id", "command"]) {
    if (typeof input[key] === "string") {
      summary[key] = input[key];
    }
  }
  if (toolName === "write" && typeof input.content === "string") {
    summary.contentLength = input.content.length;
  }
  if (toolName === "edit" && typeof input.newText === "string") {
    summary.newTextLength = input.newText.length;
  }
  if (Array.isArray(input.evidence)) {
    summary.evidenceRoles = input.evidence.map((e: any) => e?.role).filter(Boolean);
  }
  return summary;
}
