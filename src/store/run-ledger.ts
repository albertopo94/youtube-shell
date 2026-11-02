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
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const PACKAGE_ROOT_DEFAULT = join(import.meta.dirname, "..", "..");
import {
  buildContextAttestation,
  buildExpectedChecksForPhase,
  classifyRequestKind,
  evaluateProductionLifecycle,
  evaluateRunAssurance,
  inspectDeliverableApplicationEvidence,
  loadDefaultEnvironmentInfo,
  type OrphanOutcome,
  type RunIncident,
  type RunLedgerEvent,
  type RunManifest,
  type RunProcessBinding,
} from "../core/assurance.ts";
import {
  evaluateAtomicLearnings,
  loadAtomicLearningsRegistry,
} from "../core/learning-evaluator.ts";
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

export const RUN_ID_PATTERN = /^run-\d{8}T\d{6}Z-[a-f0-9]{6,16}$/;

export function isValidRunId(runId: string): boolean {
  return typeof runId === "string" && RUN_ID_PATTERN.test(runId);
}

export function generateRunId(nowIso: string): string {
  const digits = nowIso.replace(/[^0-9]/g, "");
  const stamp =
    digits.length >= 14 ? `${digits.slice(0, 8)}T${digits.slice(8, 14)}Z` : "19700101T000000Z";
  const rand = randomBytes(3).toString("hex");
  return `run-${stamp}-${rand}`;
}

const SANITIZED_PATH_KEYS = new Set([
  "resolvedPath",
  "targetPath",
  "path",
  "masterPath",
  "acceptanceSheetPath",
]);

export interface PathSanitizer {
  tag(value: string): string;
}

/**
 * Privacy (§4.E): the ledger must never persist the operator's OS home or raw external
 * absolute paths. Values are rewritten relative to their owner: <video>, <pkg>, <office>,
 * or <external>/<basename> when nothing owns them. Idempotent: already-tagged values pass
 * through untouched, so re-saving a loaded manifest never double-prefixes.
 */
export function createPathSanitizer(options: {
  videoDir: string;
  packageRoot?: string;
  officeRoot?: string;
  channelDir?: string;
}): PathSanitizer {
  const roots: Array<[string, string]> = [];
  const add = (root: string | undefined, tag: string) => {
    if (!root) return;
    const norm = root.replace(/\/+$/, "");
    if (norm) roots.push([norm, tag]);
  };
  add(options.videoDir, "<video>");
  add(options.packageRoot ?? PACKAGE_ROOT_DEFAULT, "<pkg>");
  add(options.channelDir, "<office>");
  add(options.officeRoot, "<office>");
  // Longest root first so a nested channel dir wins over its office parent.
  roots.sort((a, b) => b[0].length - a[0].length);

  return {
    tag(value: string): string {
      if (typeof value !== "string" || !value) return value;
      if (value.startsWith("<video>/") || value.startsWith("<pkg>/") || value.startsWith("<office>/") || value.startsWith("<external>/")) {
        return value;
      }
      if (!value.startsWith("/")) return value;
      const norm = value.replace(/\/+$/, "");
      for (const [root, tag] of roots) {
        if (norm === root) return tag;
        if (norm.startsWith(`${root}/`)) return `${tag}/${norm.slice(root.length + 1)}`;
      }
      return `<external>/${norm.slice(norm.lastIndexOf("/") + 1)}`;
    },
  };
}

function sanitizeValue(
  value: unknown,
  sanitizer: PathSanitizer,
  key?: string,
): unknown {
  if (typeof value === "string") {
    if (key && SANITIZED_PATH_KEYS.has(key)) return sanitizer.tag(value);
    if (key === "command") {
      // Engine commands embed absolute paths as whitespace-delimited tokens; tag each one.
      return value
        .split(/(\s+)/)
        .map((token) => (token.startsWith("/") ? sanitizer.tag(token) : token))
        .join("");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, sanitizer));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeValue(v, sanitizer, k);
    }
    return out;
  }
  return value;
}

export function sanitizeLedgerValue<T>(value: T, sanitizer: PathSanitizer): T {
  return sanitizeValue(value, sanitizer) as T;
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

function workspaceRootsFor(videoDir: string): { officeRoot?: string; channelDir?: string } {
  try {
    const regPath = join(videoDir, ".youtube-shell", "registro.json");
    if (!existsSync(regPath)) return {};
    const parsed = JSON.parse(readFileSync(regPath, "utf8")) as {
      workspaceLink?: { officeRoot?: string; channelDir?: string };
    };
    return {
      ...(parsed.workspaceLink?.officeRoot ? { officeRoot: parsed.workspaceLink.officeRoot } : {}),
      ...(parsed.workspaceLink?.channelDir ? { channelDir: parsed.workspaceLink.channelDir } : {}),
    };
  } catch {
    return {};
  }
}

export function ledgerSanitizerFor(videoDir: string): PathSanitizer {
  return createPathSanitizer({
    videoDir,
    packageRoot: PACKAGE_ROOT_DEFAULT,
    ...workspaceRootsFor(videoDir),
  });
}

export function saveRunManifest(videoDir: string, manifest: RunManifest): void {
  if (!existsSync(videoDir)) return;
  manifest.context.applicationEvidence = inspectDeliverableApplicationEvidence(
    videoDir,
    manifest.targetPhase,
  );
  // Dynamic per-learning evaluation (S4 §4.C) and the second reporting dimension (S4 §4.D)
  // are recomputed on every persist so a resumed or audited run always shows current facts.
  const registry = loadAtomicLearningsRegistry(PACKAGE_ROOT_DEFAULT);
  if (registry) {
    manifest.learningEvaluations = evaluateAtomicLearnings(manifest, registry.learnings);
  }
  manifest.production = evaluateProductionLifecycle(manifest);
  const assurance = evaluateRunAssurance(manifest);
  manifest.status = assurance.status;
  manifest.statusReason = assurance.reason;
  manifest.assurance = assurance;

  const target = runManifestPath(videoDir, manifest.runId);
  const dir = dirname(target);
  mkdirSync(dir, { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  // §4.E: persist privacy-sanitized bytes; the in-memory manifest keeps real paths so
  // live read-matching in the gate continues to work during the session.
  const persisted = sanitizeLedgerValue(manifest, ledgerSanitizerFor(videoDir));
  const data = `${JSON.stringify(persisted, null, 2)}\n`;
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

export const MAX_EVENTS_PER_RUN = 2000;

export interface AppendRunEventOptions {
  maxEvents?: number;
}

export function appendRunEvent(
  videoDir: string,
  runId: string,
  event: RunLedgerEvent,
  options: AppendRunEventOptions = {},
): void {
  if (!existsSync(videoDir) || !isValidRunId(runId)) return;
  const target = runEventsPath(videoDir, runId);
  mkdirSync(dirname(target), { recursive: true });

  const maxEvents = options.maxEvents ?? MAX_EVENTS_PER_RUN;
  const line = `${JSON.stringify(sanitizeLedgerValue(event, ledgerSanitizerFor(videoDir)))}\n`;

  // §4.E storage cap: keep the newest events, drop the oldest head lines.
  let head: string[] = [];
  try {
    if (existsSync(target)) {
      const existing = readFileSync(target, "utf8").split("\n").filter((l) => l.trim().length > 0);
      if (existing.length >= maxEvents) head = existing.slice(Math.max(0, existing.length - maxEvents + 1));
    }
  } catch {
    head = [];
  }

  const fd = openSync(target, head.length > 0 ? "w" : "a", 0o600);
  try {
    if (head.length > 0) writeFileSync(fd, `${head.join("\n")}\n`, "utf8");
    appendFileSync(fd, line, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
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
  // §4.F.1: never build a path from an identifier the ledger would never have written.
  if (!isValidRunId(runId)) return undefined;
  const path = runManifestPath(videoDir, runId);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as RunManifest;
    if (!parsed || parsed.runId !== runId) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export interface RunEventsLoadResult {
  events: RunLedgerEvent[];
  corruptedLines: number[];
}

export function loadRunEventsDetailed(videoDir: string, runId: string): RunEventsLoadResult {
  if (!isValidRunId(runId)) return { events: [], corruptedLines: [] };
  const path = runEventsPath(videoDir, runId);
  if (!existsSync(path)) return { events: [], corruptedLines: [] };
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return { events: [], corruptedLines: [] };
  }
  const events: RunLedgerEvent[] = [];
  const corruptedLines: number[] = [];
  // §4.F.2: one corrupted line must never erase the events around it.
  raw.split("\n").forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed) as RunLedgerEvent;
      if (parsed && typeof parsed.type === "string" && typeof parsed.at === "string") {
        events.push(parsed);
      } else {
        corruptedLines.push(index + 1);
      }
    } catch {
      corruptedLines.push(index + 1);
    }
  });
  return { events, corruptedLines };
}

export function loadRunEvents(videoDir: string, runId: string): RunLedgerEvent[] {
  return loadRunEventsDetailed(videoDir, runId).events;
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
    if (!isValidRunId(name)) continue;
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

export interface PruneOldRunsOptions {
  keep?: number;
  protectedRunIds?: readonly string[];
}

export interface PruneOldRunsResult {
  pruned: string[];
  kept: number;
}

const DEFAULT_RUN_RETENTION = 50;

/**
 * §4.E retention: the ledger must not grow without bound, but pruning may never destroy
 * evidence that is still live — an unsettled run, or a run whose approvals are referenced
 * by registro.json — regardless of how old it is.
 */
export function pruneOldRuns(
  videoDir: string,
  options: PruneOldRunsOptions = {},
): PruneOldRunsResult {
  const keepRaw = options.keep ?? DEFAULT_RUN_RETENTION;
  const keep = Number.isInteger(keepRaw) && keepRaw > 0 ? keepRaw : DEFAULT_RUN_RETENTION;
  const result: PruneOldRunsResult = { pruned: [], kept: 0 };

  const manifests = listRunManifests(videoDir);
  if (manifests.length === 0) return result;

  let registryText = "";
  try {
    const regPath = join(videoDir, ".youtube-shell", "registro.json");
    if (existsSync(regPath)) registryText = readFileSync(regPath, "utf8");
  } catch {
    registryText = "";
  }

  const protectedIds = new Set(options.protectedRunIds ?? []);
  // Oldest first; the newest `keep` survive, and anything still live is pinned.
  const deletable: string[] = [];
  const pinned = new Set<string>();
  for (const m of manifests) {
    const live =
      !m.finishedAt || protectedIds.has(m.runId) || registryText.includes(m.runId);
    if (live) pinned.add(m.runId);
    else deletable.push(m.runId);
  }

  // The cap governs prunable history only: pinned evidence is never traded away to meet it,
  // so the on-disk total may exceed `keep` while approvals or live runs are outstanding.
  const toDelete = deletable.slice(0, Math.max(0, deletable.length - keep));

  for (const runId of toDelete) {
    if (!isValidRunId(runId)) continue;
    try {
      rmSyncSafe(runDir(videoDir, runId));
      result.pruned.push(runId);
    } catch {
      // A directory we cannot remove stays on disk; never fail the session over retention.
    }
  }

  result.kept = manifests.length - result.pruned.length;
  return result;
}

function rmSyncSafe(path: string): void {
  // Local import to avoid widening the top-level fs import list for one recursive removal.
  rmSync(path, { recursive: true, force: true });
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
