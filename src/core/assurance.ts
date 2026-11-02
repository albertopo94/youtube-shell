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
  readScope?: "full" | "partial";
}

export interface ReferenceAttestation {
  label: string;
  targetFile: string;
  resolvedPath?: string;
  kind: "mandatory" | "conditional" | "optional";
  applicable: boolean;
  reason: string;
  exists: boolean;
  sha256?: string;
  deliveredInPrompt: boolean;
  readByAgent: boolean;
  readScope?: "full" | "partial";
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
  optionalReferences?: ReferenceAttestation[];
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

function extractTargetFilesFromReferenceLabel(label: string): string[] {
  const cleaned = label.trim();
  const beforeParen = cleaned.split(/\s+\(/)[0].trim();
  const beforeHash = beforeParen.split("#")[0].trim();
  if (beforeHash.startsWith("skills/")) {
    return [beforeHash];
  }
  const tokens = beforeHash
    .split(/[,]|(?:\s+y\s+)|(?:\s+e\s+)/)
    .map((s) => s.trim())
    .filter((s) => s.endsWith(".md") || s.endsWith(".json"));
  return tokens.length > 0 ? tokens : [beforeHash];
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

  const single = targetFile.trim();
  const matchOffice = resolved.layer3.officeFiles.find((f) => f.name === single && f.exists);
  if (matchOffice) {
    const st = sha256FileIfPresent(matchOffice.path);
    return { resolvedPath: matchOffice.path, ...st };
  }
  const matchChannel = resolved.layer3.channelFiles.find((f) => f.name === single && f.exists);
  if (matchChannel) {
    const st = sha256FileIfPresent(matchChannel.path);
    return { resolvedPath: matchChannel.path, ...st };
  }

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

function hasNonPlaceholderFieldValue(text: string, labelRegex: RegExp): boolean {
  const match = text.match(labelRegex);
  if (!match) return false;
  const rawVal = (match[1] ?? "")
    .replace(/\*\([^)]*\)\*:\s*/g, "")
    .replace(/\*\([^)]*\)\*/g, "")
    .trim();
  if (!rawVal || rawVal.length < 3) return false;
  if (/^(?:TBD|\.\.\.|____+|`?\[[^\]]*\]`?)$/i.test(rawVal)) return false;
  if (/\[Insertar|\[Pegar aqu[íi]|\[Enlace\s*\/|\[UNA sola mejora|\[VERIFICAR/i.test(rawVal)) {
    return false;
  }
  return true;
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
      // Must have 5 numbered candidate titles without template placeholder "(palanca usada: ____)"
      const candidateLines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => /^[1-5]\.\s+\S+/.test(l));
      const validTitleCandidates = candidateLines.filter(
        (l) =>
          !/T[íi]tulo\s+[1-5]:\s*\(palanca usada:\s*____\)/i.test(l) &&
          !/____|\[Insertar|\bTBD\b/i.test(l) &&
          l.replace(/^[1-5]\.\s+/, "").trim().length >= 8,
      );
      const hasSelectedTitle = hasNonPlaceholderFieldValue(
        text,
        /-\s*\*\*T[íi]tulo Principal Seleccionado:\*\*\s*([^\n]+)/i,
      );
      const hasJustification = hasNonPlaceholderFieldValue(
        text,
        /-\s*\*\*Justificaci[óo]n del t[íi]tulo elegido:\*\*\s*([^\n]+)/i,
      );
      const extractSection = (headingRe: RegExp): string => {
        const m = text.match(headingRe);
        if (!m || m.index === undefined) return "";
        const rest = text.slice(m.index + m[0].length);
        const nextIdx = rest.search(/\n###\s+|\n##\s+|\n---\s*\n/);
        return nextIdx === -1 ? rest : rest.slice(0, nextIdx);
      };
      const thumbA = extractSection(/###\s+Miniatura A[^\n]*/i);
      const thumbB = extractSection(/###\s+Miniatura B[^\n]*/i);
      const thumbC = extractSection(/###\s+Miniatura C[^\n]*/i);
      const hasThumbContent = (sec: string): boolean =>
        hasNonPlaceholderFieldValue(sec, /-\s*\*\*(?:Punto focal principal[^*]*|Concepto diferencial[^*]*|Prompt[^*]*):\*\*\s*([^\n]+)/i);

      const verified =
        validTitleCandidates.length >= 5 &&
        hasSelectedTitle &&
        hasJustification &&
        hasThumbContent(thumbA) &&
        hasThumbContent(thumbB) &&
        hasThumbContent(thumbC);
      return {
        expected: true,
        verified,
        targetFile,
        summary: verified
          ? "5 opciones de título con palanca, título seleccionado justificado y 3 miniaturas completas en 01-packaging.md"
          : "Faltan 5 títulos reales sin '____', título seleccionado justificado o desarrollo de Miniaturas A/B/C en 01-packaging.md",
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
      const part1Text = text.split(/##\s+Parte 2/i)[0] ?? text;
      const hasCheckedRegime =
        /\[[xX]\]\s*(?:Bajo|Medio|Alto|Zona Verde|Zona Amarilla|Zona Roja|N\/A\s*-\s*Ficci[óo]n Pura)/i.test(
          part1Text,
        ) ||
        hasNonPlaceholderFieldValue(
          part1Text,
          /-\s*\*\*(?:Riesgo factual|Nivel de riesgo factual|Grado de controversia[^*]*):\*\*\s*([^\n]+)/i,
        );
      const hasUnfilledSourcePlaceholder = /\[Enlace\s*\/\s*DOI de fuente primaria/i.test(part1Text);
      const hasRealSourceOrExemption =
        /https?:\/\/(?!\.\.\.)[^\s)\]]+/i.test(part1Text) ||
        /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i.test(part1Text) ||
        /\[[xX]\]\s*\*\*N\/A\s*-\s*Ficci[óo]n Pura/i.test(part1Text);
      const hasFacts = hasNonPlaceholderFieldValue(
        part1Text,
        /-\s*\*\*Hechos Comprobados de Base:\*\*\s*([^\n]+)/i,
      );
      const hasLimits = hasNonPlaceholderFieldValue(
        part1Text,
        /-\s*\*\*L[íi]mites de la Evidencia:\*\*\s*([^\n]+)/i,
      );
      const verified =
        hasCheckedRegime &&
        !hasUnfilledSourcePlaceholder &&
        hasRealSourceOrExemption &&
        (hasFacts || hasLimits);
      return {
        expected: true,
        verified,
        targetFile,
        summary: verified
          ? "Régimen de verificación marcado y fuentes primarias / límites documentados en Parte 1 de 06-fuentes-y-verificacion.md"
          : "Falta marcar el régimen de riesgo factual o sustituir los placeholders de fuentes primarias en Parte 1 de 06-fuentes-y-verificacion.md",
      };
    }
    case "P03_SCRIPT": {
      const targetFile = "02-guion.md";
      const text = readSafe(targetFile);
      if (!text) {
        return { expected: true, verified: false, targetFile, summary: "02-guion.md ausente" };
      }
      const hasPlotPromise = hasNonPlaceholderFieldValue(
        text,
        /-\s*\*\*Promesa de Trama[^*]*:\*\*\s*([^\n]+)/i,
      );
      const hasOpeningChecks =
        /\[[xX]\]\s*\*\*Claridad de Contexto|\|\s*\*\*¿El t[íi]tulo hace una pregunta[^|]*\|\s*[^|\s][^|]*\|/i.test(
          text,
        );
      const b01Idx = text.search(/###\s+\[B01\]/);
      const b01Body = b01Idx >= 0 ? text.slice(b01Idx, b01Idx + 600) : "";
      const hasRealB01Dialogue =
        b01Idx >= 0 &&
        !/^\s*>\s*\*"\.\.\."\*\s*$/m.test(b01Body) &&
        b01Body.replace(/###\s+\[B01\][^\n]*/, "").trim().length >= 25;
      const verified = hasPlotPromise && hasOpeningChecks && hasRealB01Dialogue;
      return {
        expected: true,
        verified,
        targetFile,
        summary: verified
          ? "Promesa de trama, puerta de arranque y bloques [Bxx] con locución real en 02-guion.md"
          : "Falta promesa de trama, puerta de arranque respondida o locución real sin placeholder '... ' en [B01] de 02-guion.md",
      };
    }
    case "P04_FACTCHECK": {
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
      const part2Split = text.split(/##\s+Parte 2/i);
      const part2 = part2Split[1] ?? "";
      const hasTemplatePlaceholders =
        /\[Insertar DOI o URL real\]|"\[Texto literal del guion\]"|\bDD\/MM\/AAAA\b/i.test(part2);
      const tableRows = part2
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.startsWith("|") && /\[B\d{2,3}\]/.test(l));
      const hasPendingRow = tableRows.some((r) => /\bPENDIENTE\b/i.test(r));
      const hasResolvedRow = tableRows.some((r) =>
        /\b(?:VERIFICADO|CORREGIDO|MODIFICADO|ELIMINADO|EN_DEBATE)\b/i.test(r),
      );
      const verified =
        part2.length > 0 && !hasTemplatePlaceholders && !hasPendingRow && hasResolvedRow;
      return {
        expected: true,
        verified,
        targetFile,
        summary: verified
          ? "Parte 2 de verificación factual resuelta sin PENDIENTE ni placeholders en 06-fuentes-y-verificacion.md"
          : "Parte 2 de 06-fuentes-y-verificacion.md mantiene filas en PENDIENTE, sin [Bxx] resueltos o con placeholders de plantilla",
      };
    }
    case "P05_ANIMATIC": {
      const targetFile = "03-storyboard-y-edicion.md";
      const text = readSafe(targetFile);
      if (!text) {
        return {
          expected: true,
          verified: false,
          targetFile,
          summary: "03-storyboard-y-edicion.md ausente",
        };
      }
      const hasTemplateStylePlaceholder = /`\[ej\.\s*Cinematic 35mm/i.test(text);
      const hasAnimaticGateChecked = /\[[xX]\]\s*\*\*(?:Radio Edit completado|Wireframe visual|Aprobado para producci[óo]n definitiva)/i.test(
        text,
      );
      const sceneRows = text
        .split(/\r?\n/)
        .filter((l) => l.trim().startsWith("|") && /\[B01\]/.test(l));
      const hasCleanSceneRow = sceneRows.some(
        (r) => !/←\s*derivar|\*"\.\.\."\*|`\[Prompt con anclajes/i.test(r),
      );
      const verified = !hasTemplateStylePlaceholder && (hasAnimaticGateChecked || hasCleanSceneRow);
      return {
        expected: true,
        verified,
        targetFile,
        summary: verified
          ? "Consistencia visual y montaje preliminar / animática completados en 03-storyboard-y-edicion.md"
          : "03-storyboard-y-edicion.md conserva placeholders de plantilla en §1/§2 sin validar animática",
      };
    }
    case "P06_ASSEMBLY": {
      const targetFile = "03-storyboard-y-edicion.md";
      const text = readSafe(targetFile);
      const resText = readSafe("04-registro-recursos.md");
      if (!text || !resText) {
        return {
          expected: true,
          verified: false,
          targetFile,
          summary: "Falta 03-storyboard-y-edicion.md o 04-registro-recursos.md",
        };
      }
      const sceneRows = text
        .split(/\r?\n/)
        .filter((l) => l.trim().startsWith("|") && /\[B\d{2,3}\]/.test(l));
      const hasValidScenes =
        sceneRows.length > 0 &&
        sceneRows.every((r) => !/←\s*derivar|\*"\.\.\."\*|`\[Prompt con anclajes/i.test(r));
      const hasCleanResources =
        !/\[VERIFICAR|SIN LICENCIA|https:\/\/\.\.\./i.test(resText) &&
        !/`\s*`/.test(resText);
      const verified = hasValidScenes && hasCleanResources;
      return {
        expected: true,
        verified,
        targetFile,
        summary: verified
          ? "Tabla de escenas [Bxx] sincronizada y 04-registro-recursos.md con licencias limpias"
          : "03-storyboard-y-edicion.md o 04-registro-recursos.md aún contienen marcadores '← derivar', '[Prompt...]' o '[VERIFICAR]'",
      };
    }
    case "P07_CLOSE": {
      const targetFile = "entregable-final.md";
      const text = readSafe(targetFile);
      const metricsText = readSafe("05-metricas-retencion.md");
      if (!text) {
        return {
          expected: true,
          verified: false,
          targetFile,
          summary: "entregable-final.md ausente",
        };
      }
      const hasOfficialTitle = hasNonPlaceholderFieldValue(
        text,
        /-\s*\*\*T[íi]tulo Oficial:\*\*\s*([^\n]+)/i,
      );
      const hasSections =
        /##\s+1\.\s+Metadata Definitiva Publicada/i.test(text) &&
        /##\s+2\.\s+Archivo Master y Assets/i.test(text) &&
        /##\s+3\.\s+Cr[ée]ditos y Licencias en Descripci[óo]n/i.test(text);
      const hasUnfilledFinalPlaceholders =
        /\[Pegar aqu[íi] la descripci[óo]n exacta subida a YouTube\]|ruta-o-archivo-de-miniatura\.png|ruta-al-archivo-final\.mp4/i.test(
          text,
        );
      const hasMetricsClosed =
        Boolean(metricsText) && !/\[UNA sola mejora concreta/i.test(metricsText ?? "");
      const verified =
        hasOfficialTitle && hasSections && !hasUnfilledFinalPlaceholders && hasMetricsClosed;
      return {
        expected: true,
        verified,
        targetFile,
        summary: verified
          ? "Metadata definitiva publicada en entregable-final.md y aprendizaje de cierre en 05-metricas-retencion.md verificados"
          : "entregable-final.md o 05-metricas-retencion.md conservan placeholders de plantilla sin completar",
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

  const mandatoryReferences: ReferenceAttestation[] = resolved.playbook.mandatoryReferences.flatMap(
    (label) => {
      const targetFiles = extractTargetFilesFromReferenceLabel(label);
      return targetFiles.map((targetFile) => {
        const disk = resolveReferenceOnDisk(targetFile, resolved.videoDir, resolved, pkgRoot);
        return {
          label,
          targetFile,
          ...(disk.resolvedPath ? { resolvedPath: disk.resolvedPath } : {}),
          kind: "mandatory" as const,
          applicable: true,
          reason: `Requerida por el playbook de ${resolved.targetPhase}`,
          exists: disk.exists,
          ...(disk.sha256 ? { sha256: disk.sha256 } : {}),
          deliveredInPrompt: options.promptDelivered,
          readByAgent: false,
        };
      });
    },
  );

  const highFactualRisk = detectHighFactualRisk(resolved.videoDir);

  const conditionalReferences: ReferenceAttestation[] = resolved.playbook.conditionalReferences.flatMap(
    (label) => {
      const targetFiles = extractTargetFilesFromReferenceLabel(label);
      return targetFiles.map((targetFile) => {
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
            : "No aplicable: archivo condicional no presente en oficina/canal";

        return {
          label,
          targetFile,
          ...(disk.resolvedPath ? { resolvedPath: disk.resolvedPath } : {}),
          kind: "conditional" as const,
          applicable,
          reason,
          exists: disk.exists,
          ...(disk.sha256 ? { sha256: disk.sha256 } : {}),
          deliveredInPrompt: options.promptDelivered && applicable,
          readByAgent: false,
        };
      });
    },
  );

  const optionalReferences: ReferenceAttestation[] = (
    resolved.playbook.optionalReferences ?? []
  ).flatMap((label) => {
    const targetFiles = extractTargetFilesFromReferenceLabel(label);
    return targetFiles.map((targetFile) => {
      const disk = resolveReferenceOnDisk(targetFile, resolved.videoDir, resolved, pkgRoot);
      return {
        label,
        targetFile,
        ...(disk.resolvedPath ? { resolvedPath: disk.resolvedPath } : {}),
        kind: "optional" as const,
        applicable: false,
        reason: disk.exists
          ? "Opcional disponible en oficina/canal (no bloquea aprobación)"
          : "Opcional no presente (no requerido)",
        exists: disk.exists,
        ...(disk.sha256 ? { sha256: disk.sha256 } : {}),
        deliveredInPrompt: options.promptDelivered && disk.exists,
        readByAgent: false,
      };
    });
  });

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
    optionalReferences,
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

function computeReadScope(
  fullPath: string | undefined,
  previousScope: "full" | "partial" | undefined,
  readParams?: { offset?: number; limit?: number },
): "full" | "partial" {
  if (previousScope === "full") return "full";
  if (!readParams || (readParams.offset === undefined && readParams.limit === undefined)) {
    return "full";
  }
  const startLine = Math.max(1, readParams.offset ?? 1);
  if (!fullPath || !existsSync(fullPath)) {
    return startLine === 1 && (readParams.limit ?? 2000) >= 200 ? "full" : "partial";
  }
  try {
    const totalLines = readFileSync(fullPath, "utf8").split(/\r?\n/).length;
    const endLine =
      readParams.limit !== undefined ? startLine + readParams.limit - 1 : totalLines;
    if (startLine <= 1 && endLine >= totalLines) {
      return "full";
    }
    return "partial";
  } catch {
    return "partial";
  }
}

export function recordReferenceReadInAttestation(
  attestation: ContextAttestation,
  videoDirOrReadPath: string,
  readPathOrVideoDir: string,
  readParams?: { offset?: number; limit?: number },
): boolean {
  if (!videoDirOrReadPath || !readPathOrVideoDir) return false;
  // Support both (attestation, videoDir, readPath) and (attestation, readPath, videoDir)
  let videoDir = videoDirOrReadPath;
  let readPath = readPathOrVideoDir;
  if (
    /\.(md|json)(#.*)?$/i.test(videoDirOrReadPath) &&
    !/\.(md|json)(#.*)?$/i.test(readPathOrVideoDir)
  ) {
    videoDir = readPathOrVideoDir;
    readPath = videoDirOrReadPath;
  }

  const absRead = normalizeComparablePath(videoDir, readPath);
  const normalizedRaw = readPath.split("#")[0].replace(/\\/g, "/").trim();
  let matched = false;

  if (
    resolve(attestation.expectedSkill.resolvedPath) === absRead ||
    normalizedRaw === attestation.expectedSkill.relativePath ||
    normalizedRaw.endsWith(`/${attestation.expectedSkill.relativePath}`)
  ) {
    attestation.expectedSkill.readByAgent = true;
    attestation.expectedSkill.readScope = computeReadScope(
      attestation.expectedSkill.resolvedPath,
      attestation.expectedSkill.readScope,
      readParams,
    );
    matched = true;
  }

  const allRefs = [
    ...attestation.mandatoryReferences,
    ...attestation.conditionalReferences,
    ...(attestation.optionalReferences ?? []),
  ];
  for (const ref of allRefs) {
    if (ref.resolvedPath && resolve(ref.resolvedPath) === absRead) {
      ref.readByAgent = true;
      ref.readScope = computeReadScope(ref.resolvedPath, ref.readScope, readParams);
      matched = true;
      continue;
    }
    if (
      normalizedRaw === ref.targetFile ||
      normalizedRaw.endsWith(`/${ref.targetFile}`) ||
      resolve(videoDir, ref.targetFile) === absRead
    ) {
      ref.readByAgent = true;
      ref.readScope = computeReadScope(
        ref.resolvedPath ?? resolve(videoDir, ref.targetFile),
        ref.readScope,
        readParams,
      );
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

  // 3. Skill read (in production mode, a route in the prompt or partial read does NOT count as full skill read)
  const skillFullRead =
    manifest.context.expectedSkill.readByAgent &&
    manifest.context.expectedSkill.readScope !== "partial";
  const skillReadSatisfied =
    manifest.workMode === "read_only"
      ? manifest.context.expectedSkill.deliveredInPrompt
      : skillFullRead;
  controls.push({
    control: "Skill leída",
    result: skillFullRead
      ? "Verificado (lectura completa)"
      : manifest.context.expectedSkill.readByAgent &&
        manifest.context.expectedSkill.readScope === "partial"
      ? "Lectura parcial (insuficiente)"
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

  // 5. Mandatory references availability AND full read when phaseSubmitted in production
  const missingMandatory = manifest.context.mandatoryReferences.filter((r) => !r.exists);
  const unreadMandatory = manifest.context.mandatoryReferences.filter(
    (r) => r.exists && (!r.readByAgent || r.readScope === "partial"),
  );
  const mandatoryExistsOk =
    manifest.workMode === "read_only"
      ? manifest.context.expectedSkill.exists
      : missingMandatory.length === 0;
  const mandatoryReadOk =
    manifest.workMode === "production" && manifest.phaseSubmitted
      ? unreadMandatory.length === 0
      : true;
  const mandatoryOk = mandatoryExistsOk && mandatoryReadOk;
  controls.push({
    control: "Referencias obligatorias",
    result:
      missingMandatory.length > 0
        ? `Incompletas (faltan: ${missingMandatory.map((r) => r.targetFile).join(", ")})`
        : !mandatoryReadOk
        ? `Sin lectura completa (${unreadMandatory.map((r) => r.targetFile).join(", ")})`
        : "Completas y verificadas",
    satisfied: mandatoryOk,
  });

  // 6. Conditional references
  const applicableCond = manifest.context.conditionalReferences.filter((r) => r.applicable);
  const missingCond = applicableCond.filter((r) => !r.exists);
  const unreadCond = applicableCond.filter(
    (r) => r.exists && (!r.readByAgent || r.readScope === "partial"),
  );
  let condResult = "No aplicable";
  let condSatisfied = true;
  if (applicableCond.length > 0) {
    if (missingCond.length > 0) {
      condResult = `Ausente (${missingCond.map((r) => r.targetFile).join(", ")})`;
      condSatisfied = false;
    } else if (manifest.workMode === "production" && manifest.phaseSubmitted && unreadCond.length > 0) {
      condResult = `Sin lectura completa (${unreadCond.map((r) => r.targetFile).join(", ")})`;
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

  // 6b. Optional references (4th tier): surfaced for transparency, never an approval requirement
  const optionalRefs = manifest.context.optionalReferences ?? [];
  const presentOptional = optionalRefs.filter((r) => r.exists);
  const readOptional = presentOptional.filter((r) => r.readByAgent);
  controls.push({
    control: "Referencia opcional",
    result:
      optionalRefs.length === 0
        ? "Ninguna declarada"
        : presentOptional.length === 0
        ? `No disponible (${optionalRefs.map((r) => r.targetFile).join(", ")}) — no requerida`
        : `${readOptional.length}/${presentOptional.length} leídas (${presentOptional
            .map((r) => r.targetFile)
            .join(", ")}) — no bloquea aprobación`,
    satisfied: true,
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
  if (!manifest.context.expectedSkill.exists || !mandatoryExistsOk || hasMissingRefIncident) {
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
    !skillFullRead ||
    !mandatoryReadOk ||
    !appEvSatisfied
  ) {
    let reason: string;
    if (hasWarnChecks) {
      reason =
        "Las verificaciones finalizaron con advertencia WARN que exige reconocimiento explícito del creador (--ack-warn).";
    } else if (!skillFullRead) {
      reason = `Se completó el trabajo estructural y las verificaciones automáticas, pero la skill asignada (${manifest.context.expectedSkill.name}) no tiene evidencia de lectura completa.`;
    } else if (!mandatoryReadOk) {
      reason = `Se completó el trabajo estructural y las verificaciones automáticas, pero faltó lectura completa de referencias obligatorias (${unreadMandatory.map((r) => r.targetFile).join(", ")}).`;
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

export interface ObservedRunsSummary {
  totalRuns: number;
  statusCounts: Record<string, number>;
  unreadSkillProductionRuns: string[];
  unreadMandatoryReferenceRuns: string[];
  missingApplicationEvidenceRuns: string[];
  blockedToolCount: number;
  failedCheckCount: number;
}

export function summarizeObservedRuns(manifests: readonly RunManifest[]): ObservedRunsSummary {
  const statusCounts: Record<string, number> = {};
  const unreadSkillProductionRuns: string[] = [];
  const unreadMandatoryReferenceRuns: string[] = [];
  const missingApplicationEvidenceRuns: string[] = [];
  let blockedToolCount = 0;
  let failedCheckCount = 0;

  for (const m of manifests) {
    const assurance = m.assurance ?? evaluateRunAssurance(m);
    statusCounts[assurance.status] = (statusCounts[assurance.status] ?? 0) + 1;
    if (m.workMode === "production" && !m.context.expectedSkill.readByAgent) {
      unreadSkillProductionRuns.push(m.runId);
    }
    if (
      m.workMode === "production" &&
      m.context.mandatoryReferences.some((r) => r.exists && !r.readByAgent)
    ) {
      unreadMandatoryReferenceRuns.push(m.runId);
    }
    if (
      m.workMode === "production" &&
      m.context.applicationEvidence &&
      !m.context.applicationEvidence.verified
    ) {
      missingApplicationEvidenceRuns.push(m.runId);
    }
    blockedToolCount += m.incidents.filter((i) => i.kind === "tool_blocked").length;
    failedCheckCount += m.checks.filter(
      (c) => c.result === "FAIL" || c.result === "NOT_EVALUABLE",
    ).length;
  }

  return {
    totalRuns: manifests.length,
    statusCounts,
    unreadSkillProductionRuns,
    unreadMandatoryReferenceRuns,
    missingApplicationEvidenceRuns,
    blockedToolCount,
    failedCheckCount,
  };
}

export function formatObservedRunsReport(manifests: readonly RunManifest[]): string {
  if (manifests.length === 0) {
    return "No existen ejecuciones registradas en .youtube-shell/runs/.";
  }
  const rows = manifests.map((m) => {
    const a = m.assurance ?? evaluateRunAssurance(m);
    return `${m.runId} · ${a.status} · ${m.targetPhase} (${m.workMode}) · ${a.satisfiedCount}/${a.totalControls} controles · ${m.startedAt}`;
  });
  const summary = summarizeObservedRuns(manifests);
  const statusBreakdown = Object.entries(summary.statusCounts)
    .map(([st, count]) => `${st}: ${count}`)
    .join(", ");

  return [
    `Historial de ejecuciones (${summary.totalRuns} total):`,
    ...rows,
    "",
    "Resumen de observación:",
    `- Distribución de estados: ${statusBreakdown || "ninguno"}`,
    `- Runs de producción sin lectura de skill asignada: ${summary.unreadSkillProductionRuns.length}`,
    `- Runs de producción con referencias obligatorias no leídas: ${summary.unreadMandatoryReferenceRuns.length}`,
    `- Runs de producción con evidencia de aplicación incompleta: ${summary.missingApplicationEvidenceRuns.length}`,
    `- Llamadas a herramientas bloqueadas por la compuerta: ${summary.blockedToolCount}`,
    `- Verificaciones fallidas o no evaluables: ${summary.failedCheckCount}`,
  ].join("\n");
}

export function formatRunAuditReport(manifest: RunManifest): string {
  const assurance = manifest.assurance ?? evaluateRunAssurance(manifest);
  const modeLabel =
    manifest.workMode === "read_only"
      ? "Consulta / Solo lectura"
      : `Producción (${manifest.activation.productionMode})`;

  const lines: string[] = [
    "Informe de Ejecución (youtube-shell)",
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
