import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { ResolvedWorkflowContext, WorkMode } from "./context-resolver.ts";
import { getPhase } from "./phases.ts";
import type { CheckVerdict, PhaseId, ProductionMode } from "./types.ts";

export const RUN_STATUSES = [
  "NOT_APPLICABLE",
  "STARTED",
  "PARTIAL",
  "COMPLETED_UNVERIFIED",
  "PASSED",
  "FAILED",
  "BLOCKED",
  "ABORTED",
  "DEGRADED",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export type RequestKind = "production" | "consultation" | "audit" | "resumption";

export interface SkillAttestation {
  name: string;
  role: string;
  relativePath: string;
  resolvedPath: string;
  exists: boolean;
  sha256?: string;
  deliveredInPrompt: boolean;
  readByAgent: boolean;
}

export interface ReferenceAttestation {
  label: string;
  targetFile: string;
  resolvedPath?: string;
  kind: "mandatory" | "conditional";
  applicable: boolean;
  reason: string;
  exists: boolean;
  sha256?: string;
  deliveredInPrompt: boolean;
  readByAgent: boolean;
}

export interface DeliverableApplicationEvidence {
  expected: boolean;
  verified: boolean;
  targetFile: string;
  summary: string;
}

export interface ContextAttestation {
  expectedSkill: SkillAttestation;
  mandatoryReferences: ReferenceAttestation[];
  conditionalReferences: ReferenceAttestation[];
  applicationEvidence?: DeliverableApplicationEvidence;
  highFactualRisk?: boolean;
  promptHash?: string;
}

export interface ExpectedCheckRecord {
  check_id: string;
  expected: boolean;
  executed: boolean;
  verdict?: CheckVerdict;
  verified_by?: "runtime";
  details?: string;
  evidence?: {
    artifact_hash?: string;
    phase: PhaseId;
  };
}

export interface CompletedToolRecord {
  toolCallId?: string;
  toolName: string;
  at: string;
  durationMs?: number;
  isError: boolean;
  targetPath?: string;
}

export interface BlockedToolRecord {
  toolCallId?: string;
  toolName: string;
  at: string;
  reason: string;
}

export interface RunActionsRecord {
  allowedTools: string[];
  attemptedTools: string[];
  completedTools: CompletedToolRecord[];
  blockedTools: BlockedToolRecord[];
}

export type IncidentKind =
  | "tool_blocked"
  | "tool_error"
  | "missing_reference"
  | "check_failed"
  | "transition_denied"
  | "integrity_failure"
  | "aborted";

export interface RunIncident {
  at: string;
  kind: IncidentKind;
  summary: string;
}

export interface RunEnvironmentInfo {
  youtubeShellVersion: string;
  piReviewedVersion: string;
  upstreamYoutubeCommit: string;
}

export interface AssuranceControlItem {
  control: string;
  result: string;
  satisfied: boolean;
}

export interface AssuranceEvaluation {
  status: RunStatus;
  reason: string;
  satisfiedCount: number;
  totalControls: number;
  controls: AssuranceControlItem[];
  diagnosis: string;
}

export interface RunManifest {
  schema: "youtube-shell.run-manifest/v1";
  runId: string;
  startedAt: string;
  finishedAt?: string;
  aborted?: boolean;
  environment: RunEnvironmentInfo;
  requestKind: RequestKind;
  workMode: WorkMode;
  activation: {
    productionMode: ProductionMode;
    reason: string;
  };
  targetPhase: PhaseId;
  phaseStatusAtStart: string;
  phaseStatusAtEnd?: string;
  phaseSubmitted?: boolean;
  assignedSkill: string;
  context: ContextAttestation;
  actions: RunActionsRecord;
  checks: ExpectedCheckRecord[];
  incidents: RunIncident[];
  status: RunStatus;
  statusReason: string;
  assurance?: AssuranceEvaluation;
}

export type RunEventType =
  | "run_started"
  | "context_attested"
  | "tool_attempted"
  | "tool_blocked"
  | "tool_completed"
  | "reference_read"
  | "check_executed"
  | "phase_transition"
  | "run_settled";

export interface RunLedgerEvent {
  at: string;
  type: RunEventType;
  phase?: PhaseId;
  workMode?: WorkMode;
  toolName?: string;
  toolCallId?: string;
  isError?: boolean;
  durationMs?: number;
  details?: Record<string, unknown>;
}

const PACKAGE_ROOT = resolve(import.meta.dirname, "..", "..");

function sha256FileIfPresent(fullPath: string): { exists: boolean; sha256?: string } {
  try {
    if (!existsSync(fullPath)) return { exists: false };
    const st = statSync(fullPath);
    if (!st.isFile()) return { exists: false };
    const bytes = readFileSync(fullPath);
    return {
      exists: true,
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    };
  } catch {
    return { exists: false };
  }
}

export function loadDefaultEnvironmentInfo(): RunEnvironmentInfo {
  let youtubeShellVersion = "0.0.0";
  let piReviewedVersion = "unknown";
  let upstreamYoutubeCommit = "unknown";
  try {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
      version?: string;
    };
    if (pkg.version) youtubeShellVersion = pkg.version;
  } catch {}
  try {
    const lock = JSON.parse(readFileSync(join(PACKAGE_ROOT, "upstream-lock.json"), "utf8")) as {
      upstreams?: {
        pi?: { reviewed?: { version?: string } };
        youtube?: { reviewed?: { commit?: string } };
      };
    };
    piReviewedVersion = lock.upstreams?.pi?.reviewed?.version ?? piReviewedVersion;
    upstreamYoutubeCommit = lock.upstreams?.youtube?.reviewed?.commit ?? upstreamYoutubeCommit;
  } catch {}
  return { youtubeShellVersion, piReviewedVersion, upstreamYoutubeCommit };
}

export function classifyRequestKind(
  promptText: string,
  workMode: WorkMode,
  hasActiveOrPriorProgress: boolean,
): RequestKind {
  const text = (promptText ?? "").trim();
  if (/\b(audita|auditor[ií]a|audit)\b/i.test(text)) {
    return "audit";
  }
  if (workMode === "read_only") {
    return "consultation";
  }
  if (
    hasActiveOrPriorProgress &&
    /\b(reanuda|contin[uú]a|retoma|sigue|resume)\b/i.test(text)
  ) {
    return "resumption";
  }
  return "production";
}

function extractTargetFileFromReferenceLabel(label: string): string {
  const cleaned = label.trim();
  const beforeParen = cleaned.split(/\s+\(/)[0].trim();
  const beforeHash = beforeParen.split("#")[0].trim();
  return beforeHash;
}

function resolveReferenceOnDisk(
  targetFile: string,
  videoDir: string,
  resolved: ResolvedWorkflowContext,
  packageRoot: string,
): { resolvedPath?: string; exists: boolean; sha256?: string } {
  if (targetFile.startsWith("skills/")) {
    const full = join(packageRoot, targetFile);
    const stat = sha256FileIfPresent(full);
    return { resolvedPath: full, ...stat };
  }

  // Check if it is an office/channel file list (e.g. "ideas.md y backlog-ideas.md")
  const tokens = targetFile
    .split(/[,/]|(?:\s+y\s+)|(?:\s+e\s+)/)
    .map((s) => s.trim())
    .filter((s) => s.endsWith(".md") || s.endsWith(".json"));

  if (tokens.length === 1) {
    const single = tokens[0];
    const inVideo = join(videoDir, single);
    const stVideo = sha256FileIfPresent(inVideo);
    if (stVideo.exists) {
      return { resolvedPath: inVideo, ...stVideo };
    }
    if (resolved.layer3.workspaceLink?.channelDir) {
      const inChannel = join(resolved.layer3.workspaceLink.channelDir, single);
      const stChannel = sha256FileIfPresent(inChannel);
      if (stChannel.exists) return { resolvedPath: inChannel, ...stChannel };
    }
    if (resolved.layer3.workspaceLink?.officeRoot) {
      const inOffice = join(resolved.layer3.workspaceLink.officeRoot, single);
      const stOffice = sha256FileIfPresent(inOffice);
      if (stOffice.exists) return { resolvedPath: inOffice, ...stOffice };
    }
    return { resolvedPath: inVideo, exists: false };
  }

  if (tokens.length > 1) {
    // Multi-file conditional reference (e.g., "ideas.md y backlog-ideas.md")
    for (const tok of tokens) {
      const matchOffice = resolved.layer3.officeFiles.find((f) => f.name === tok && f.exists);
      if (matchOffice) {
        const st = sha256FileIfPresent(matchOffice.path);
        return { resolvedPath: matchOffice.path, ...st };
      }
      const matchChannel = resolved.layer3.channelFiles.find((f) => f.name === tok && f.exists);
      if (matchChannel) {
        const st = sha256FileIfPresent(matchChannel.path);
        return { resolvedPath: matchChannel.path, ...st };
      }
      const inVideo = join(videoDir, tok);
      const stVideo = sha256FileIfPresent(inVideo);
      if (stVideo.exists) {
        return { resolvedPath: inVideo, ...stVideo };
      }
    }
    return { exists: false };
  }

  const fallback = join(videoDir, targetFile);
  const st = sha256FileIfPresent(fallback);
  return { resolvedPath: fallback, ...st };
}

export function detectHighFactualRisk(videoDir: string): boolean {
  const fuentesPath = join(videoDir, "06-fuentes-y-verificacion.md");
  if (!existsSync(fuentesPath)) return false;
  try {
    const content = readFileSync(fuentesPath, "utf8");
    if (/\[[xX]\]\s*(?:Zona Roja YMYL|Alto\b)/i.test(content)) {
      return true;
    }
    return /(?:Nivel de riesgo factual|Riesgo factual|Grado de controversia o riesgo)[^\n]*:\s*(?:\*\*)?`?ALTO`?(?:\*\*)?\s*$/im.test(
      content,
    );
  } catch {
    return false;
  }
}

export function inspectDeliverableApplicationEvidence(
  videoDir: string,
  phase: PhaseId,
): DeliverableApplicationEvidence {
  const readSafe = (rel: string): string | undefined => {
    const full = join(videoDir, rel);
    if (!existsSync(full)) return undefined;
    try {
      return readFileSync(full, "utf8");
    } catch {
      return undefined;
    }
  };

  switch (phase) {
    case "P01_PACKAGING": {
      const targetFile = "01-packaging.md";
      const text = readSafe(targetFile);
      if (!text) {
        return { expected: true, verified: false, targetFile, summary: "01-packaging.md ausente" };
      }
      const hasTitles = /Opciones de T[íi]tulo/i.test(text);
      const hasLevers = /(?:Palanca|Gatillo|Emoci[óo]n|Curiosidad|Miedo|Deseo|Contraste|Miniatura)/i.test(
        text,
      );
      const verified = hasTitles && hasLevers;
      return {
        expected: true,
        verified,
        targetFile,
        summary: verified
          ? "Palancas de título y conceptos de miniatura documentados en 01-packaging.md"
          : "Falta documentar opciones de título o palancas/conceptos de miniatura en 01-packaging.md",
      };
    }
    case "P02_RESEARCH": {
      const targetFile = "06-fuentes-y-verificacion.md";
      const text = readSafe(targetFile);
      if (!text) {
        return {
          expected: true,
          verified: false,
          targetFile,
          summary: "06-fuentes-y-verificacion.md ausente",
        };
      }
      const hasRisk = /Riesgo factual|R[ée]gimen de Verificaci[óo]n|Nivel de Riesgo Factual/i.test(
        text,
      );
      const hasSources = /Parte 1|Fuentes|Barrido|mediana/i.test(text);
      const verified = hasRisk && hasSources;
      return {
        expected: true,
        verified,
        targetFile,
        summary: verified
          ? "Riesgo factual y fuentes de Parte 1 documentados en 06-fuentes-y-verificacion.md"
          : "Falta declarar riesgo factual o fuentes de Parte 1 en 06-fuentes-y-verificacion.md",
      };
    }
    case "P03_SCRIPT": {
      const targetFile = "02-guion.md";
      const text = readSafe(targetFile);
      if (!text) {
        return { expected: true, verified: false, targetFile, summary: "02-guion.md ausente" };
      }
      const hasBlocks = /\[B01\]/.test(text);
      const hasGate = /Puerta de Control Editorial|Apertura|Gancho/i.test(text);
      const verified = hasBlocks && hasGate;
      return {
        expected: true,
        verified,
        targetFile,
        summary: verified
          ? "Bloques [Bxx] y Puerta de Control Editorial presentes en 02-guion.md"
          : "Faltan bloques [B01] o Puerta de Control Editorial en 02-guion.md",
      };
    }
    case "P04_FACTCHECK": {
      const targetFile = "06-fuentes-y-verificacion.md";
      const text = readSafe(targetFile);
      const verified = Boolean(text && /Parte 2|Afirmaciones/i.test(text));
      return {
        expected: true,
        verified,
        targetFile,
        summary: verified
          ? "Parte 2 de verificación factual presente en 06-fuentes-y-verificacion.md"
          : "Falta Parte 2 en 06-fuentes-y-verificacion.md",
      };
    }
    case "P05_ANIMATIC":
    case "P06_ASSEMBLY": {
      const targetFile = "03-storyboard-y-edicion.md";
      const text = readSafe(targetFile);
      const verified = Boolean(text && /\[B01\]|Storyboard|Checklist/i.test(text));
      return {
        expected: true,
        verified,
        targetFile,
        summary: verified
          ? "Trazabilidad de bloques y storyboard presente en 03-storyboard-y-edicion.md"
          : "Falta trazabilidad de storyboard en 03-storyboard-y-edicion.md",
      };
    }
    case "P07_CLOSE": {
      const targetFile = "entregable-final.md";
      const text = readSafe(targetFile);
      const verified = Boolean(text && /Paquete de Publicaci[óo]n|Aprendizajes/i.test(text));
      return {
        expected: true,
        verified,
        targetFile,
        summary: verified
          ? "Paquete de publicación y aprendizajes documentados en entregable-final.md"
          : "Falta paquete de publicación o aprendizajes en entregable-final.md",
      };
    }
  }
}

export interface BuildAttestationOptions {
  promptDelivered: boolean;
  promptHash?: string;
  packageRoot?: string;
}

export function buildContextAttestation(
  resolved: ResolvedWorkflowContext,
  options: BuildAttestationOptions,
): ContextAttestation {
  const pkgRoot = options.packageRoot ?? PACKAGE_ROOT;
  const skillRel = join("skills", resolved.playbook.skill, "SKILL.md").replace(/\\/g, "/");
  const skillFull = join(pkgRoot, skillRel);
  const skillStat = sha256FileIfPresent(skillFull);

  const expectedSkill: SkillAttestation = {
    name: resolved.playbook.skill,
    role: resolved.playbook.role,
    relativePath: skillRel,
    resolvedPath: skillFull,
    exists: skillStat.exists,
    ...(skillStat.sha256 ? { sha256: skillStat.sha256 } : {}),
    deliveredInPrompt: options.promptDelivered && skillStat.exists,
    readByAgent: false,
  };

  const mandatoryReferences: ReferenceAttestation[] = resolved.playbook.mandatoryReferences.map(
    (label) => {
      const targetFile = extractTargetFileFromReferenceLabel(label);
      const disk = resolveReferenceOnDisk(targetFile, resolved.videoDir, resolved, pkgRoot);
      return {
        label,
        targetFile,
        ...(disk.resolvedPath ? { resolvedPath: disk.resolvedPath } : {}),
        kind: "mandatory",
        applicable: true,
        reason: `Requerida por el playbook de ${resolved.targetPhase}`,
        exists: disk.exists,
        ...(disk.sha256 ? { sha256: disk.sha256 } : {}),
        deliveredInPrompt: options.promptDelivered,
        readByAgent: false,
      };
    },
  );

  const highFactualRisk = detectHighFactualRisk(resolved.videoDir);

  const conditionalReferences: ReferenceAttestation[] = resolved.playbook.conditionalReferences.map(
    (label) => {
      const targetFile = extractTargetFileFromReferenceLabel(label);
      const isFrameworkRef = targetFile.startsWith("skills/");
      const hasWorkspaceLink = Boolean(resolved.layer3.workspaceLink);
      const disk = resolveReferenceOnDisk(targetFile, resolved.videoDir, resolved, pkgRoot);
      const isGovRef = targetFile.includes("gobernanza-evidencia.md");
      const applicable =
        isGovRef && highFactualRisk
          ? true
          : isFrameworkRef
          ? true
          : hasWorkspaceLink && disk.exists;
      const reason =
        isGovRef && highFactualRisk
          ? "Riesgo factual ALTO detectado en 06-fuentes-y-verificacion.md (verificación reforzada obligatoria)"
          : isFrameworkRef
          ? `Referencia normativa disponible para ${resolved.targetPhase}`
          : !hasWorkspaceLink
          ? "No aplicable: sin vínculo de oficina/canal (/yts-link)"
          : disk.exists
          ? "Aplicable: archivo detectado en oficina/canal vinculado"
          : "No aplicable: archivo opcional no presente en oficina/canal";

      return {
        label,
        targetFile,
        ...(disk.resolvedPath ? { resolvedPath: disk.resolvedPath } : {}),
        kind: "conditional",
        applicable,
        reason,
        exists: disk.exists,
        ...(disk.sha256 ? { sha256: disk.sha256 } : {}),
        deliveredInPrompt: options.promptDelivered && applicable,
        readByAgent: false,
      };
    },
  );

  // If factual risk is ALTO in P02_RESEARCH, P03_SCRIPT, or P04_FACTCHECK, ensure gobernanza-evidencia.md is tracked
  if (
    highFactualRisk &&
    (resolved.targetPhase === "P02_RESEARCH" ||
      resolved.targetPhase === "P03_SCRIPT" ||
      resolved.targetPhase === "P04_FACTCHECK") &&
    !conditionalReferences.some((r) => r.targetFile.includes("gobernanza-evidencia.md"))
  ) {
    const govTarget = "skills/yts-orquestador/references/gobernanza-evidencia.md";
    const disk = resolveReferenceOnDisk(govTarget, resolved.videoDir, resolved, pkgRoot);
    conditionalReferences.push({
      label: `${govTarget} (verificación reforzada por riesgo factual ALTO)`,
      targetFile: govTarget,
      ...(disk.resolvedPath ? { resolvedPath: disk.resolvedPath } : {}),
      kind: "conditional",
      applicable: true,
      reason:
        "Riesgo factual ALTO detectado en 06-fuentes-y-verificacion.md (verificación reforzada obligatoria)",
      exists: disk.exists,
      ...(disk.sha256 ? { sha256: disk.sha256 } : {}),
      deliveredInPrompt: options.promptDelivered,
      readByAgent: false,
    });
  }

  const applicationEvidence = inspectDeliverableApplicationEvidence(
    resolved.videoDir,
    resolved.targetPhase,
  );

  return {
    expectedSkill,
    mandatoryReferences,
    conditionalReferences,
    applicationEvidence,
    highFactualRisk,
    ...(options.promptHash ? { promptHash: options.promptHash } : {}),
  };
}

function normalizeComparablePath(videoDir: string, rawPath: string): string {
  const cleaned = rawPath.split("#")[0].trim();
  if (isAbsolute(cleaned)) {
    return resolve(cleaned);
  }
  return resolve(videoDir, cleaned);
}

export function recordReferenceReadInAttestation(
  attestation: ContextAttestation,
  videoDir: string,
  readPath: string,
): boolean {
  if (!readPath || typeof readPath !== "string") return false;
  const absRead = normalizeComparablePath(videoDir, readPath);
  const normalizedRaw = readPath.replace(/\\/g, "/").trim();
  let matched = false;

  if (
    resolve(attestation.expectedSkill.resolvedPath) === absRead ||
    normalizedRaw === attestation.expectedSkill.relativePath ||
    normalizedRaw.endsWith(`/${attestation.expectedSkill.relativePath}`)
  ) {
    attestation.expectedSkill.readByAgent = true;
    matched = true;
  }

  for (const ref of [...attestation.mandatoryReferences, ...attestation.conditionalReferences]) {
    if (ref.resolvedPath && resolve(ref.resolvedPath) === absRead) {
      ref.readByAgent = true;
      matched = true;
      continue;
    }
    if (
      normalizedRaw === ref.targetFile ||
      normalizedRaw.endsWith(`/${ref.targetFile}`) ||
      resolve(videoDir, ref.targetFile) === absRead
    ) {
      ref.readByAgent = true;
      matched = true;
    }
  }

  return matched;
}

export function buildExpectedChecksForPhase(phase: PhaseId): ExpectedCheckRecord[] {
  const def = getPhase(phase);
  return def.checks.map((checkId) => ({
    check_id: checkId,
    expected: true,
    executed: false,
    evidence: {
      phase,
    },
  }));
}

export function evaluateRunAssurance(manifest: RunManifest): AssuranceEvaluation {
  const controls: AssuranceControlItem[] = [];

  // 1. Assigned skill
  controls.push({
    control: "Skill asignada",
    result: manifest.context.expectedSkill.name,
    satisfied: Boolean(manifest.context.expectedSkill.name),
  });

  // 2. Skill available on disk with SHA-256
  controls.push({
    control: "Skill disponible",
    result: manifest.context.expectedSkill.exists ? "Sí" : "No (ausente en disco)",
    satisfied: manifest.context.expectedSkill.exists,
  });

  // 3. Skill read (in production mode, a route in the prompt does NOT count as reading the skill)
  const skillReadSatisfied =
    manifest.workMode === "read_only"
      ? manifest.context.expectedSkill.deliveredInPrompt
      : manifest.context.expectedSkill.readByAgent;
  controls.push({
    control: "Skill leída",
    result: manifest.context.expectedSkill.readByAgent
      ? "Verificado"
      : manifest.workMode === "read_only"
      ? "No requerida (modo lectura)"
      : manifest.context.expectedSkill.deliveredInPrompt
      ? "No verificada (solo ruta en prompt)"
      : "No verificada",
    satisfied: skillReadSatisfied,
  });

  // 4. Deliverable application evidence
  const appEv = manifest.context.applicationEvidence;
  const appEvSatisfied =
    manifest.workMode === "read_only" ? true : appEv ? appEv.verified : true;
  controls.push({
    control: "Evidencia de aplicación",
    result:
      manifest.workMode === "read_only"
        ? "N/A (consulta)"
        : !appEv
        ? "No evaluada"
        : appEv.verified
        ? `Verificada (${appEv.targetFile})`
        : `Incompleta (${appEv.summary})`,
    satisfied: appEvSatisfied,
  });

  // 4. Mandatory references availability
  // In P06_ASSEMBLY before render, aceptacion.json may be created during the phase; count it missing only if it still doesn't exist
  const missingMandatory = manifest.context.mandatoryReferences.filter((r) => !r.exists);
  const mandatoryOk =
    manifest.workMode === "read_only"
      ? manifest.context.expectedSkill.exists
      : missingMandatory.length === 0;
  controls.push({
    control: "Referencias obligatorias",
    result:
      missingMandatory.length === 0
        ? "Completas"
        : `Incompletas (faltan: ${missingMandatory.map((r) => r.targetFile).join(", ")})`,
    satisfied: mandatoryOk,
  });

  // 5. Conditional references
  const applicableCond = manifest.context.conditionalReferences.filter((r) => r.applicable);
  const missingCond = applicableCond.filter((r) => !r.exists);
  const unreadCond = applicableCond.filter((r) => r.exists && !r.readByAgent);
  let condResult = "No aplicable";
  let condSatisfied = true;
  if (applicableCond.length > 0) {
    if (missingCond.length > 0) {
      condResult = `Ausente (${missingCond.map((r) => r.targetFile).join(", ")})`;
      condSatisfied = false;
    } else if (manifest.workMode === "production" && manifest.phaseSubmitted && unreadCond.length > 0) {
      condResult = "No verificada";
      condSatisfied = false;
    } else if (unreadCond.length === 0) {
      condResult = "Verificada";
      condSatisfied = true;
    } else {
      condResult = "Disponible en Capa 3";
      condSatisfied = true;
    }
  }
  controls.push({
    control: "Referencia condicional",
    result: condResult,
    satisfied: condSatisfied,
  });

  // 6. Phase tools policy
  const writeToolsExposedInReadOnly =
    manifest.workMode === "read_only" &&
    manifest.actions.allowedTools.some((t) => t === "write" || t === "edit" || t === "yts_transition");
  controls.push({
    control: "Herramientas de fase",
    result: writeToolsExposedInReadOnly
      ? "Incumplido (escritura expuesta en modo lectura)"
      : manifest.workMode === "read_only"
      ? "Solo lectura (escritura retirada)"
      : "Permitidas",
    satisfied: !writeToolsExposedInReadOnly,
  });

  // 7. Runtime blocks
  const blockCount = manifest.actions.blockedTools.length;
  controls.push({
    control: "Bloqueos de runtime",
    result: String(blockCount),
    satisfied: blockCount === 0,
  });

  // 8. Expected deterministic checks for the target phase
  for (const chk of manifest.checks) {
    const checkPassed = chk.executed && chk.verdict === "PASS";
    controls.push({
      control: chk.check_id,
      result: chk.executed ? (chk.verdict ?? "EXECUTED") : manifest.workMode === "read_only" ? "N/A (consulta)" : "NO_EJECUTADO",
      satisfied: manifest.workMode === "read_only" ? true : checkPassed,
    });
  }

  const satisfiedCount = controls.filter((c) => c.satisfied).length;
  const totalControls = controls.length;

  // Determine RunStatus
  if (manifest.aborted) {
    return {
      status: "ABORTED",
      reason: "La ejecución fue interrumpida o abortada antes de completarse.",
      satisfiedCount,
      totalControls,
      controls,
      diagnosis:
        "La corrida se interrumpió antes de finalizar. No se asume éxito; reanude la fase para verificar los artefactos pendientes.",
    };
  }

  const hasIntegrityOrToolFailure = manifest.incidents.some(
    (inc) => inc.kind === "integrity_failure" || inc.kind === "tool_error",
  );
  const failedChecks = manifest.checks.filter(
    (c) => c.executed && (c.verdict === "FAIL" || c.verdict === "NOT_EVALUABLE"),
  );
  if (hasIntegrityOrToolFailure || failedChecks.length > 0) {
    const failedNames = failedChecks.map((c) => `${c.check_id}=${c.verdict}`).join(", ");
    const reason = failedNames
      ? `Comprobación determinista fallida o no evaluable (${failedNames}).`
      : "Se produjo un fallo de herramienta o de integridad del framework durante la ejecución.";
    return {
      status: "FAILED",
      reason,
      satisfiedCount,
      totalControls,
      controls,
      diagnosis: reason,
    };
  }

  const hasMissingRefIncident = manifest.incidents.some((inc) => inc.kind === "missing_reference");
  if (!manifest.context.expectedSkill.exists || !mandatoryOk || hasMissingRefIncident) {
    const missingList = !manifest.context.expectedSkill.exists
      ? manifest.context.expectedSkill.relativePath
      : missingMandatory.map((r) => r.targetFile).join(", ");
    const reason = `Contexto incompleto: falta referencia obligatoria o skill (${missingList || "no disponible"}).`;
    return {
      status: "DEGRADED",
      reason,
      satisfiedCount,
      totalControls,
      controls,
      diagnosis:
        "El agente operó sin la totalidad de las referencias obligatorias o la skill asignada en disco. La ejecución no puede certificarse como completa.",
    };
  }

  if (
    blockCount > 0 ||
    manifest.incidents.some((inc) => inc.kind === "tool_blocked" || inc.kind === "transition_denied")
  ) {
    const lastBlock =
      manifest.actions.blockedTools.at(-1)?.reason ??
      manifest.incidents.find((i) => i.kind === "tool_blocked" || i.kind === "transition_denied")
        ?.summary ??
      "Operación bloqueada por el gate de fase.";
    return {
      status: "BLOCKED",
      reason: lastBlock,
      satisfiedCount,
      totalControls,
      controls,
      diagnosis: `El gate de youtube-shell bloqueó una operación no permitida (${lastBlock}). Ningún artefacto protegido fue alterado.`,
    };
  }

  if (manifest.workMode === "read_only") {
    return {
      status: "NOT_APPLICABLE",
      reason:
        "Turno de consulta o auditoría en modo lectura; el flujo de mutación de producción no aplica y las herramientas de escritura permanecieron retiradas.",
      satisfiedCount,
      totalControls,
      controls,
      diagnosis:
        "Consulta en modo de solo lectura ejecutada sin exponer herramientas de escritura ni alterar el registro de producción.",
    };
  }

  if (!manifest.finishedAt) {
    return {
      status: "STARTED",
      reason: `Ejecución en curso sobre ${manifest.targetPhase}.`,
      satisfiedCount,
      totalControls,
      controls,
      diagnosis: `La ejecución comenzó en ${manifest.targetPhase} y aún no se ha asentado.`,
    };
  }

  // Production run that finished: evaluate verification completeness
  const expectedChecks = manifest.checks.filter((c) => c.expected);
  const allChecksExecuted = expectedChecks.every((c) => c.executed);
  const hasWarnChecks = expectedChecks.some((c) => c.executed && c.verdict === "WARN");
  const didMutateOrTransition =
    manifest.actions.completedTools.some(
      (t) =>
        t.toolName === "write" ||
        t.toolName === "edit" ||
        t.toolName === "yts_transition" ||
        t.toolName === "yts_check_contract" ||
        t.toolName === "yts_measure_master",
    ) || Boolean(manifest.phaseSubmitted);

  if (!didMutateOrTransition) {
    return {
      status: "COMPLETED_UNVERIFIED",
      reason:
        "El turno de producción terminó sin ejecutar verificaciones deterministas ni mutaciones verificadas sobre la fase activa.",
      satisfiedCount,
      totalControls,
      controls,
      diagnosis:
        "El agente finalizó sin ejecutar comprobaciones ni dejar evidencia verificable del procedimiento de la fase.",
    };
  }

  if (expectedChecks.length > 0 && !allChecksExecuted) {
    if (manifest.phaseStatusAtEnd === "EN_CURSO") {
      return {
        status: "PARTIAL",
        reason: `Trabajo parcial en ${manifest.targetPhase}; faltan ejecutar comprobaciones de salida (${expectedChecks
          .filter((c) => !c.executed)
          .map((c) => c.check_id)
          .join(", ")}).`,
        satisfiedCount,
        totalControls,
        controls,
        diagnosis:
          "Se avanzó en la fase activa, pero las comprobaciones obligatorias de salida aún no se ejecutaron.",
      };
    }
    return {
      status: "COMPLETED_UNVERIFIED",
      reason: `El agente terminó sin ejecutar todas las comprobaciones esperadas de ${manifest.targetPhase}.`,
      satisfiedCount,
      totalControls,
      controls,
      diagnosis:
        "No existe evidencia de que todas las verificaciones deterministas de la fase se hayan ejecutado en esta corrida.",
    };
  }

  if (!manifest.phaseSubmitted && manifest.phaseStatusAtEnd === "EN_CURSO") {
    return {
      status: "PARTIAL",
      reason: `Se ejecutaron operaciones en ${manifest.targetPhase}, pero la fase permanece EN_CURSO sin envío a revisión (submit).`,
      satisfiedCount,
      totalControls,
      controls,
      diagnosis:
        "Se ejecutó parte del trabajo y de los controles, pero la fase sigue abierta y pendiente de envío a revisión del creador.",
    };
  }

  if (
    hasWarnChecks ||
    !condSatisfied ||
    !manifest.context.expectedSkill.readByAgent ||
    !appEvSatisfied
  ) {
    let reason: string;
    if (hasWarnChecks) {
      reason =
        "Las verificaciones finalizaron con advertencia WARN que exige reconocimiento explícito del creador (--ack-warn).";
    } else if (!manifest.context.expectedSkill.readByAgent) {
      reason = `Se completó el trabajo estructural y las verificaciones automáticas, pero la skill asignada (${manifest.context.expectedSkill.name}) no tiene evidencia de lectura efectiva.`;
    } else if (!appEvSatisfied) {
      reason = `Se completó el trabajo estructural y las verificaciones automáticas, pero falta evidencia de aplicación en el entregable (${appEv?.summary ?? "incompleta"}).`;
    } else {
      reason =
        "Se completó el trabajo estructural y las verificaciones automáticas, pero una referencia condicional aplicable no tiene evidencia de lectura.";
    }
    return {
      status: "DEGRADED",
      reason,
      satisfiedCount,
      totalControls,
      controls,
      diagnosis: reason,
    };
  }

  return {
    status: "PASSED",
    reason: `Todos los controles verificables de ${manifest.targetPhase} se ejecutaron con evidencia satisfactoria.`,
    satisfiedCount,
    totalControls,
    controls,
    diagnosis:
      "Se completó el trabajo estructural, el contexto normativo estuvo disponible y todas las verificaciones automáticas de la fase resultaron PASS.",
  };
}

export function formatRunAuditReport(manifest: RunManifest): string {
  const assurance = manifest.assurance ?? evaluateRunAssurance(manifest);
  const modeLabel =
    manifest.workMode === "read_only"
      ? "Consulta / Solo lectura"
      : `Producción (${manifest.activation.productionMode})`;

  const lines: string[] = [
    `Ejecución ${manifest.runId}`,
    `${assurance.status}`,
    "",
    `${manifest.targetPhase} · ${modeLabel} · ${manifest.startedAt}`,
    "",
    `${assurance.satisfiedCount} / ${assurance.totalControls}`,
    "Controles con evidencia satisfactoria",
    "",
    "Control | Resultado",
    "--- | ---",
  ];

  for (const item of assurance.controls) {
    lines.push(`${item.control} | ${item.result}`);
  }

  lines.push("");
  lines.push("Diagnóstico");
  lines.push(assurance.diagnosis);

  return lines.join("\n");
}
