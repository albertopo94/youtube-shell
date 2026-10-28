import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import {
  buildThreeLayerPrompt,
  detectWorkspaceLink,
  resolveWorkflowContext,
  type WorkMode,
} from "../core/context-resolver.ts";
import {
  approveAcceptanceSheet,
  approvePhase,
  blockPhase,
  evaluate,
  isSafeEvidencePath,
  reopenPhase,
  requestChanges,
  startPhase,
  submitPhase,
  unblockPhase,
  type Evaluation,
} from "../core/machine.ts";
import { getPhase, PHASE_IDS } from "../core/phases.ts";
import { extractSection } from "../core/sections.ts";
import type { CheckRun, Context, DeclaredEvidence, EffectiveStatus, PhaseId, Result } from "../core/types.ts";
import { createFsReader, loadRegistry, registryPath, saveRegistry, scaffoldVideoDir } from "../store/fs-store.ts";
import { CANONICAL_FILES, checkVideoContract } from "../checks/contract-checker.ts";
import {
  evaluateMasterAcceptance,
  measureMasterFile,
  type AcceptanceSheet,
} from "../checks/media-measurement.ts";
import {
  buildCapabilityCatalog,
  isReadOnlyCapability,
  type ToolCapabilityEntry,
} from "./capabilities.ts";

export type EvaluationResult = Evaluation;

export interface YoutubeShellExtensionOptions {
  extraCapabilities?: readonly ToolCapabilityEntry[];
  now?: () => string;
}

const DEFAULT_PKG_VERSION = (() => {
  try {
    const pkgPath = join(import.meta.dirname, "..", "..", "package.json");
    const parsed = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const ANSI_RESET = "\x1b[0m";
const ANSI_RED = "\x1b[1;38;2;255;75;75m";
const ANSI_AMBER = "\x1b[1;38;2;245;166;35m";
const ANSI_CYAN = "\x1b[1;38;2;86;182;194m";
const ANSI_GREEN = "\x1b[1;38;2;152;195;121m";
const ANSI_MUTED = "\x1b[38;2;140;148;163m";
const ANSI_WHITE = "\x1b[1;38;2;235;239;245m";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

function truncateAnsi(text: string, maxCols: number): string {
  if (maxCols <= 0) return "";
  if (visibleLength(text) <= maxCols) return text;
  const plain = stripAnsi(text);
  if (maxCols <= 1) return plain.slice(0, maxCols);
  return `${plain.slice(0, maxCols - 1)}…`;
}

function padRightAnsi(text: string, targetCols: number): string {
  const truncated = truncateAnsi(text, targetCols);
  const pad = Math.max(0, targetCols - visibleLength(truncated));
  return `${truncated}${" ".repeat(pad)}`;
}

function wrapPlain(text: string, maxCols: number): string[] {
  const width = Math.max(10, maxCols);
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if (!current) {
      current = w.length > width ? `${w.slice(0, width - 1)}…` : w;
    } else if (current.length + 1 + w.length <= width) {
      current = `${current} ${w}`;
    } else {
      lines.push(current);
      current = w.length > width ? `${w.slice(0, width - 1)}…` : w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function formatEffectiveBadge(status: EffectiveStatus): string {
  switch (status) {
    case "APROBADO":
      return `${ANSI_GREEN}✓ APROBADO${ANSI_RESET}`;
    case "EN_CURSO":
      return `${ANSI_AMBER}● EN_CURSO${ANSI_RESET}`;
    case "PENDIENTE_APROBACION":
      return `${ANSI_CYAN}◐ PENDIENTE_APROBACION${ANSI_RESET}`;
    case "OBSOLETO":
      return `${ANSI_AMBER}⚠ OBSOLETO${ANSI_RESET}`;
    case "BLOQUEADO":
      return `${ANSI_RED}✖ BLOQUEADO${ANSI_RESET}`;
    default:
      return `${ANSI_MUTED}○ NO_INICIADO${ANSI_RESET}`;
  }
}

const PUBLISHED_VIDEO_PATH_RE = /(?:^|\/)mis-canales\/[^/]+\/videos-publicados\/[^/]+\/?$/;

function computeOverallStatus(videoDir: string, ev: Evaluation): string {
  const normalizedDir = videoDir.replace(/\\/g, "/");
  if (ev.phases.every((p) => p.effective === "APROBADO")) {
    return PUBLISHED_VIDEO_PATH_RE.test(normalizedDir) ? "PUBLICADO" : "APROBADO";
  }
  if (ev.phases.some((p) => p.effective === "PENDIENTE_APROBACION")) return "EN_REVISION";
  if (ev.phases.some((p) => p.effective === "EN_CURSO")) return "EN_CURSO";
  if (ev.phases.some((p) => p.effective === "APROBADO")) return "APROBADO";
  return "EN_CURSO";
}

function selectActivePhaseSummary(ev: Evaluation): string {
  const active =
    ev.phases.find(
      (p) =>
        p.effective === "EN_CURSO" ||
        p.effective === "PENDIENTE_APROBACION" ||
        p.effective === "BLOQUEADO" ||
        p.effective === "OBSOLETO",
    ) ??
    ev.phases.find((p) => p.effective === "NO_INICIADO") ??
    ev.phases.at(-1);
  return active ? `${active.id} (${active.effective})` : "COMPLETADO";
}

function buildPhaseCard(ev: Evaluation, cardWidth: number): string[] {
  const w = Math.max(28, cardWidth);
  const inner = w - 4;
  const title = " ▶ Pipeline 7 Fases ";
  const topDashes = Math.max(0, w - 2 - title.length);
  const lines: string[] = [];

  lines.push(
    truncateAnsi(
      `${ANSI_MUTED}╭─${ANSI_WHITE}${title}${ANSI_MUTED}${"─".repeat(Math.max(0, topDashes - 1))}╮${ANSI_RESET}`,
      w,
    ),
  );

  for (const p of ev.phases) {
    const idCol = p.id.padEnd(14, " ");
    const row = `${ANSI_WHITE}${idCol}${ANSI_RESET} ${formatEffectiveBadge(p.effective)}`;
    lines.push(`${ANSI_MUTED}│${ANSI_RESET} ${padRightAnsi(row, inner)} ${ANSI_MUTED}│${ANSI_RESET}`);
  }

  lines.push(`${ANSI_MUTED}├${"─".repeat(w - 2)}┤${ANSI_RESET}`);
  for (const wrapped of wrapPlain(`Siguiente: ${ev.nextAction}`, inner)) {
    lines.push(
      `${ANSI_MUTED}│${ANSI_RESET} ${padRightAnsi(`${ANSI_CYAN}${wrapped}${ANSI_RESET}`, inner)} ${ANSI_MUTED}│${ANSI_RESET}`,
    );
  }
  lines.push(`${ANSI_MUTED}╰${"─".repeat(w - 2)}╯${ANSI_RESET}`);
  return lines.map((l) => truncateAnsi(l, w));
}

export function renderStartupPanel(
  videoDir: string,
  ev: Evaluation,
  width: number,
  version: string = DEFAULT_PKG_VERSION,
): string[] {
  const safeWidth = Math.max(40, width);
  const videoName = basename(videoDir) || "video";
  const overall = computeOverallStatus(videoDir, ev);
  const activeSummary = selectActivePhaseSummary(ev);

  const topBar = truncateAnsi(
    `${ANSI_RED}▶ YouTube Shell${ANSI_RESET} ${ANSI_MUTED}│${ANSI_RESET} ${ANSI_WHITE}${videoName}${ANSI_RESET} ${ANSI_MUTED}│${ANSI_RESET} ${ANSI_AMBER}${activeSummary}${ANSI_RESET}`,
    safeWidth,
  );
  const divider = `${ANSI_MUTED}${"─".repeat(safeWidth)}${ANSI_RESET}`;

  const leftRows = [
    `${ANSI_RED}▛▀▀▀▀▀▀▀▀▀▜${ANSI_RESET}  ${ANSI_RED}YOUTUBE${ANSI_RESET} ${ANSI_WHITE}SHELL${ANSI_RESET} ${ANSI_MUTED}v${version}${ANSI_RESET}`,
    `${ANSI_RED}▌  ▶▶     ▐${ANSI_RESET}  ${ANSI_AMBER}VIDEO:${ANSI_RESET}  ${videoName}`,
    `${ANSI_RED}▙▄▄▄▄▄▄▄▄▄▟${ANSI_RESET}  ${ANSI_AMBER}PATH:${ANSI_RESET}   ${videoDir}`,
    `             ${ANSI_AMBER}STATUS:${ANSI_RESET} ${overall}`,
    `             ${ANSI_AMBER}SKILLS:${ANSI_RESET} 5 loaded (yts-*)`,
    `             ${ANSI_AMBER}TOOLS:${ANSI_RESET}  4 custom + gate`,
    "",
    `${ANSI_CYAN}[Commands]${ANSI_RESET}`,
    `  • /yts-init                  • /yts-status`,
    `  • /yts-approve <FASE>        • /yts-reject <FASE> <nota>`,
    `  • /yts-approve-sheet         • /yts-link <oficina> [canal]`,
  ];

  if (safeWidth >= 88) {
    const gap = 2;
    const leftWidth = Math.max(42, Math.floor(safeWidth * 0.52));
    const rightWidth = safeWidth - leftWidth - gap;
    const cardLines = buildPhaseCard(ev, rightWidth);
    const totalRows = Math.max(leftRows.length, cardLines.length);
    const combined: string[] = [topBar, divider];

    for (let i = 0; i < totalRows; i++) {
      const l = padRightAnsi(leftRows[i] ?? "", leftWidth);
      const r = cardLines[i] ? truncateAnsi(cardLines[i], rightWidth) : "";
      combined.push(truncateAnsi(r ? `${l}${" ".repeat(gap)}${r}` : l.trimEnd(), safeWidth));
    }
    return combined;
  }

  const cardLines = buildPhaseCard(ev, safeWidth);
  return [
    topBar,
    divider,
    ...leftRows.map((l) => truncateAnsi(l, safeWidth)),
    "",
    ...cardLines,
  ];
}

const AGENT_ACTIONS = new Set(["start", "submit", "block", "unblock", "reopen"]);

function sha256Text(text: string): string {
  return `sha256:${createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")}`;
}

function isPhaseId(value: unknown): value is PhaseId {
  return typeof value === "string" && (PHASE_IDS as string[]).includes(value);
}

function executeAgentTransition(
  videoDir: string,
  input: Record<string, unknown>,
  nowIso: string,
): Result {
  const action = String(input.action ?? "");
  const phase = input.phase;
  if (!isPhaseId(phase)) {
    return { ok: false, reasons: [`Fase inválida o desconocida: "${String(phase)}".`] };
  }
  if (!AGENT_ACTIONS.has(action)) {
    return {
      ok: false,
      reasons: [
        `Acción "${action}" no permitida para el agente. Solo el creador puede aprobar fases mediante /yts-approve.`,
      ],
    };
  }

  const reader = createFsReader(videoDir);
  const reg = loadRegistry(videoDir, { videoId: basename(videoDir), now: nowIso });
  const ctx: Context = { actor: { kind: "agent" }, reader, now: nowIso };

  if (action === "start") {
    return startPhase(reg, phase, ctx);
  }
  if (action === "submit") {
    if (input.checks !== undefined) {
      return {
        ok: false,
        reasons: [
          'El agente no puede inyectar ni sustituir resultados de checks en "yts_transition(submit)"; el runtime calcula todos los checks directamente sobre el disco.',
        ],
      };
    }
    const evidence = Array.isArray(input.evidence) ? (input.evidence as DeclaredEvidence[]) : [];
    const phaseCheckIds = new Set(getPhase(phase).checks);
    const checks: CheckRun[] = checkVideoContract(videoDir)
      .checks.filter((c) => phaseCheckIds.has(c.id))
      .map((c) => ({
        id: c.id,
        result: c.result,
        details: c.details,
        verifiedBy: "runtime" as const,
      }));

    if (phaseCheckIds.has("master_measurement")) {
      const masterItem = evidence.find((e) => e.role === "master");
      const sheetItem = evidence.find((e) => e.role === "acceptance_sheet");
      if (
        masterItem &&
        sheetItem &&
        isSafeEvidencePath(masterItem.path).ok &&
        isSafeEvidencePath(sheetItem.path).ok
      ) {
        const masterFullPath = join(videoDir, masterItem.path);
        const sheetFullPath = join(videoDir, sheetItem.path);
        const sheetFp = reader.fingerprint({ file: sheetItem.path });
        const approvedSheet = reg.acceptanceSheetApproval;
        if (!approvedSheet || approvedSheet.path !== sheetItem.path) {
          checks.push({
            id: "master_measurement",
            result: "FAIL",
            details: `La hoja de aceptación "${sheetItem.path}" requiere aprobación humana previa al render mediante /yts-approve-sheet.`,
            verifiedBy: "runtime",
          });
        } else if (!sheetFp.ok || sheetFp.hash !== approvedSheet.sha256) {
          checks.push({
            id: "master_measurement",
            result: "FAIL",
            details: `La hoja de aceptación "${sheetItem.path}" fue modificada después de su aprobación humana; ejecute /yts-approve-sheet nuevamente.`,
            verifiedBy: "runtime",
          });
        } else {
          const measured = measureMasterFile(masterFullPath);
          if (!measured.ok) {
            checks.push({
              id: "master_measurement",
              result: "NOT_EVALUABLE",
              details: measured.reason,
              verifiedBy: "runtime",
            });
          } else {
            let sheet: AcceptanceSheet | null = null;
            try {
              if (existsSync(sheetFullPath)) {
                sheet = JSON.parse(readFileSync(sheetFullPath, "utf8")) as AcceptanceSheet;
              }
            } catch {
              sheet = null;
            }
            let masterCreatedAt: string | undefined;
            try {
              masterCreatedAt = statSync(masterFullPath).mtime.toISOString();
            } catch {
              masterCreatedAt = undefined;
            }
            const report = evaluateMasterAcceptance(measured.metrics, sheet, { masterCreatedAt });
            const nonPassingDetails = report.checks
              .filter((c) => c.result !== "PASS")
              .map((c) => `${c.id}: ${c.details}`)
              .join("; ");
            checks.push({
              id: "master_measurement",
              result: report.result,
              details: nonPassingDetails || "Master medido por el runtime.",
              verifiedBy: "runtime",
            });
          }
        }
      }
    }

    return submitPhase(reg, phase, { checks, evidence }, ctx);
  }
  if (action === "block") {
    return blockPhase(reg, phase, String(input.reason ?? ""), ctx);
  }
  if (action === "unblock") {
    return unblockPhase(reg, phase, String(input.resolution ?? ""), ctx);
  }
  return reopenPhase(reg, phase, String(input.reason ?? ""), ctx);
}

function verifyWriteTargetAndSharedSections(
  videoDir: string,
  toolName: string,
  input: Record<string, unknown>,
  activeWorkPhases: PhaseId[],
  nowIso: string,
): { ok: true } | { ok: false; reason: string } {
  const targetPath = String(input.path ?? "");
  const safe = isSafeEvidencePath(targetPath);
  if (!safe.ok) {
    return { ok: false, reason: `Operación bloqueada: ${safe.reason}` };
  }

  let realRoot: string;
  try {
    realRoot = realpathSync(videoDir);
  } catch {
    return { ok: false, reason: "Operación bloqueada: el directorio del video no es accesible." };
  }

  const fullCandidate = join(realRoot, targetPath);
  try {
    const parentReal = realpathSync(dirname(fullCandidate));
    if (parentReal !== realRoot && !parentReal.startsWith(realRoot + sep)) {
      return {
        ok: false,
        reason: `Operación bloqueada: la ruta "${targetPath}" escapa de la carpeta del video.`,
      };
    }
    if (existsSync(fullCandidate)) {
      const st = lstatSync(fullCandidate);
      if (st.isSymbolicLink()) {
        return {
          ok: false,
          reason: `Operación bloqueada: no se permite escribir a través de enlaces simbólicos ("${targetPath}").`,
        };
      }
      const targetReal = realpathSync(fullCandidate);
      if (targetReal !== realRoot && !targetReal.startsWith(realRoot + sep)) {
        return {
          ok: false,
          reason: `Operación bloqueada: "${targetPath}" apunta fuera del área autorizada.`,
        };
      }
    }
  } catch {
    return {
      ok: false,
      reason: `Operación bloqueada: no se pudo verificar la ruta canónica de "${targetPath}".`,
    };
  }

  const allowedFiles = new Set<string>();
  for (const phaseId of activeWorkPhases) {
    for (const doc of getPhase(phaseId).documents) {
      allowedFiles.add(doc.file);
    }
  }
  const isAssemblyAcceptanceSheet =
    activeWorkPhases.includes("P06_ASSEMBLY") &&
    (targetPath === "aceptacion.json" || /^[^/\\]+\.acceptance\.json$/.test(targetPath));

  if (!allowedFiles.has(targetPath) && !isAssemblyAcceptanceSheet) {
    return {
      ok: false,
      reason: `Operación bloqueada: no se permite modificar "${targetPath}" en la fase activa (${activeWorkPhases.join(", ") || "ninguna"}). Archivos permitidos: ${Array.from(allowedFiles).join(", ") || "ninguno"}.`,
    };
  }

  // Check if any currently APROBADO phase owns protected sections in this shared file
  const reader = createFsReader(videoDir);
  const reg = loadRegistry(videoDir, { videoId: basename(videoDir), now: nowIso });
  const ev = evaluate(reg, reader);

  let proposedText: string | null = null;
  if (toolName === "write") {
    proposedText = String(input.content ?? "");
  } else if (toolName === "edit" && existsSync(fullCandidate)) {
    const currentText = readFileSync(fullCandidate, "utf8");
    const oldText = String(input.oldText ?? "");
    const newText = String(input.newText ?? "");
    if (!oldText || !currentText.includes(oldText)) {
      return {
        ok: false,
        reason: `Operación bloqueada: el fragmento a reemplazar no existe en "${targetPath}".`,
      };
    }
    proposedText = currentText.replace(oldText, newText);
  }

  if (proposedText !== null) {
    for (const pe of ev.phases) {
      if (pe.effective !== "APROBADO") continue;
      const latestApproval = reg.phases[pe.id].approvals.at(-1);
      if (!latestApproval) continue;

      for (const art of latestApproval.artifacts) {
        if (art.ref.file !== targetPath) continue;
        if (art.ref.section === undefined) {
          return {
            ok: false,
            reason: `Operación bloqueada: "${targetPath}" está aprobado bajo ${pe.id}.`,
          };
        }
        const extracted = extractSection(proposedText, art.ref.section);
        if (!extracted.ok || sha256Text(extracted.text) !== art.hash) {
          return {
            ok: false,
            reason: `Operación bloqueada: la edición en "${targetPath}" alteraría la sección "${art.ref.section}" ya aprobada en ${pe.id}.`,
          };
        }
      }
    }
  }

  return { ok: true };
}

const BLOCKED_FILMCRAFT_COMMANDS = new Set([
  "prefs.set",
  "prefs.reset",
  "file.discardRecovery",
  "file.closeAllProjects",
  "file.closeAllOtherProjects",
]);

function verifyFilmcraftCommandStep(
  id: string,
  params: Record<string, unknown> | null | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!id || BLOCKED_FILMCRAFT_COMMANDS.has(id)) {
    return {
      ok: false,
      reason: `Operación bloqueada: el comando de FilmCraft "${id}" no está permitido en el flujo controlado.`,
    };
  }
  const pathVal = params && typeof params === "object" ? params.path : undefined;
  if (typeof pathVal === "string") {
    const safe = isSafeEvidencePath(pathVal);
    if (!safe.ok) {
      return { ok: false, reason: `Operación bloqueada en FilmCraft (${id}): ${safe.reason}` };
    }
    if ((CANONICAL_FILES as readonly string[]).includes(pathVal) || pathVal.endsWith(".md")) {
      return {
        ok: false,
        reason: `Operación bloqueada en FilmCraft (${id}): no puede sobrescribir documentos Markdown ("${pathVal}").`,
      };
    }
  }
  return { ok: true };
}

function verifyFilmcraftCall(
  toolName: string,
  input: Record<string, unknown>,
): { ok: true } | { ok: false; reason: string } {
  if (toolName === "command_run") {
    const id = String(input.id ?? "");
    const params = (input.params as Record<string, unknown> | null | undefined) ?? undefined;
    return verifyFilmcraftCommandStep(id, params);
  }
  if (toolName === "command_batch") {
    const steps = Array.isArray(input.steps) ? input.steps : [];
    if (steps.length === 0) {
      return { ok: false, reason: "Operación bloqueada: command_batch requiere al menos un paso." };
    }
    for (const step of steps) {
      const check = verifyFilmcraftCommandStep(
        String(step?.id ?? ""),
        (step?.params as Record<string, unknown> | null | undefined) ?? undefined,
      );
      if (!check.ok) return check;
    }
  }
  return { ok: true };
}

const BLOCKED_EFFECTCRAFT_COMMANDS = new Set([
  "prefs.set",
  "prefs.reset",
  "app.quit",
  "system.exec",
]);

function verifyEffectcraftCommandStep(
  id: string,
  params: Record<string, unknown> | null | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (id && BLOCKED_EFFECTCRAFT_COMMANDS.has(id)) {
    return {
      ok: false,
      reason: `Operación bloqueada: el comando de EffectCraft "${id}" no está permitido en el flujo controlado.`,
    };
  }
  if (params && typeof params === "object") {
    for (const key of ["path", "file", "project", "footage", "out", "template"] as const) {
      const pathVal = params[key];
      if (typeof pathVal === "string") {
        const safe = isSafeEvidencePath(pathVal);
        if (!safe.ok) {
          return { ok: false, reason: `Operación bloqueada en EffectCraft (${id || key}): ${safe.reason}` };
        }
        if ((CANONICAL_FILES as readonly string[]).includes(pathVal) || pathVal.endsWith(".md")) {
          return {
            ok: false,
            reason: `Operación bloqueada en EffectCraft (${id || key}): no puede sobrescribir documentos Markdown ("${pathVal}").`,
          };
        }
      }
    }
  }
  return { ok: true };
}

function verifyEffectcraftCall(
  toolName: string,
  input: Record<string, unknown>,
): { ok: true } | { ok: false; reason: string } {
  const cmdId = String(input.id ?? input.command ?? toolName);
  if (BLOCKED_EFFECTCRAFT_COMMANDS.has(cmdId)) {
    return {
      ok: false,
      reason: `Operación bloqueada: el comando de EffectCraft "${cmdId}" no está permitido en el flujo controlado.`,
    };
  }

  for (const key of ["path", "file", "project", "footage", "out", "template"] as const) {
    const pathVal = input[key];
    if (typeof pathVal === "string") {
      const safe = isSafeEvidencePath(pathVal);
      if (!safe.ok) {
        return { ok: false, reason: `Operación bloqueada en EffectCraft (${toolName}): ${safe.reason}` };
      }
      if ((CANONICAL_FILES as readonly string[]).includes(pathVal) || pathVal.endsWith(".md")) {
        return {
          ok: false,
          reason: `Operación bloqueada en EffectCraft (${toolName}): no puede sobrescribir documentos Markdown ("${pathVal}").`,
        };
      }
    }
  }

  const params = (input.params as Record<string, unknown> | null | undefined) ?? undefined;
  const paramCheck = verifyEffectcraftCommandStep(cmdId, params);
  if (!paramCheck.ok) return paramCheck;

  if (
    toolName === "command_batch" ||
    toolName === "batch" ||
    toolName === "effectcraft_command_batch" ||
    toolName === "effectcraft_batch"
  ) {
    const steps = Array.isArray(input.steps)
      ? input.steps
      : Array.isArray(input.commands)
      ? input.commands
      : [];
    if (steps.length === 0 && Array.isArray(input.steps)) {
      return { ok: false, reason: "Operación bloqueada: batch requiere al menos un paso." };
    }
    for (const step of steps) {
      const stepId = String(step?.id ?? step?.command ?? "");
      const stepParams = (step?.params as Record<string, unknown> | null | undefined) ?? step;
      const check = verifyEffectcraftCommandStep(stepId, stepParams);
      if (!check.ok) return check;
    }
  }

  return { ok: true };
}

const BLOCKED_SOUNDCRAFT_COMMANDS = new Set([
  "prefs.set",
  "prefs.reset",
  "app.quit",
  "system.exec",
]);

function verifySoundcraftCommandStep(
  id: string,
  params: Record<string, unknown> | null | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (id && BLOCKED_SOUNDCRAFT_COMMANDS.has(id)) {
    return {
      ok: false,
      reason: `Operación bloqueada: el comando de SoundCraft "${id}" no está permitido en el flujo controlado.`,
    };
  }
  if (params && typeof params === "object") {
    for (const key of ["path", "file", "in", "bounce", "out", "session"] as const) {
      const pathVal = params[key];
      if (typeof pathVal === "string") {
        const safe = isSafeEvidencePath(pathVal);
        if (!safe.ok) {
          return { ok: false, reason: `Operación bloqueada en SoundCraft (${id || key}): ${safe.reason}` };
        }
        if ((CANONICAL_FILES as readonly string[]).includes(pathVal) || pathVal.endsWith(".md")) {
          return {
            ok: false,
            reason: `Operación bloqueada en SoundCraft (${id || key}): no puede sobrescribir documentos Markdown ("${pathVal}").`,
          };
        }
      }
    }
  }
  return { ok: true };
}

function verifySoundcraftCall(
  toolName: string,
  input: Record<string, unknown>,
): { ok: true } | { ok: false; reason: string } {
  const cmdId = String(input.id ?? input.cmd ?? input.command ?? toolName);
  if (BLOCKED_SOUNDCRAFT_COMMANDS.has(cmdId)) {
    return {
      ok: false,
      reason: `Operación bloqueada: el comando de SoundCraft "${cmdId}" no está permitido en el flujo controlado.`,
    };
  }

  for (const key of ["path", "file", "in", "bounce", "out", "session"] as const) {
    const pathVal = input[key];
    if (typeof pathVal === "string") {
      const safe = isSafeEvidencePath(pathVal);
      if (!safe.ok) {
        return { ok: false, reason: `Operación bloqueada en SoundCraft (${toolName}): ${safe.reason}` };
      }
      if ((CANONICAL_FILES as readonly string[]).includes(pathVal) || pathVal.endsWith(".md")) {
        return {
          ok: false,
          reason: `Operación bloqueada en SoundCraft (${toolName}): no puede sobrescribir documentos Markdown ("${pathVal}").`,
        };
      }
    }
  }

  const params = (input.params as Record<string, unknown> | null | undefined) ?? undefined;
  const paramCheck = verifySoundcraftCommandStep(cmdId, params);
  if (!paramCheck.ok) return paramCheck;

  if (toolName === "batch" || toolName === "soundcraft_batch") {
    const steps = Array.isArray(input.steps)
      ? input.steps
      : Array.isArray(input.commands)
      ? input.commands
      : [];
    if (steps.length === 0 && Array.isArray(input.steps)) {
      return { ok: false, reason: "Operación bloqueada: batch requiere al menos un paso." };
    }
    for (const step of steps) {
      const stepId = String(step?.id ?? step?.cmd ?? step?.command ?? "");
      const stepParams = (step?.params as Record<string, unknown> | null | undefined) ?? step;
      const check = verifySoundcraftCommandStep(stepId, stepParams);
      if (!check.ok) return check;
    }
  }

  return { ok: true };
}

function extractPromptText(event: any): string {
  if (typeof event?.prompt === "string") return event.prompt;
  if (typeof event?.input === "string") return event.input;
  if (typeof event?.text === "string") return event.text;
  if (Array.isArray(event?.messages)) {
    for (let i = event.messages.length - 1; i >= 0; i--) {
      const msg = event.messages[i];
      if (msg?.role === "user") {
        if (typeof msg.content === "string") return msg.content;
        if (Array.isArray(msg.content)) {
          return msg.content
            .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
            .join(" ")
            .trim();
        }
      }
    }
  }
  return "";
}

export function createYoutubeShellExtension(options: YoutubeShellExtensionOptions = {}) {
  const catalog = buildCapabilityCatalog(options.extraCapabilities);
  const nowFn = options.now ?? (() => new Date().toISOString());
  let activeWorkMode: WorkMode = "production";

  function refreshUi(ctx: any): void {
    if (!ctx || !ctx.hasUI) return;
    try {
      const reader = createFsReader(ctx.cwd);
      const reg = loadRegistry(ctx.cwd, { videoId: basename(ctx.cwd), now: nowFn() });
      const ev = evaluate(reg, reader);
      const activeSummary = selectActivePhaseSummary(ev);
      ctx.ui.setTitle?.(`YouTube Shell · ${basename(ctx.cwd)}`);
      ctx.ui.setStatus?.("youtube-shell", `▶ ${activeSummary} · ${ev.nextAction}`);
      ctx.ui.setHeader?.((_tui: any, _theme: any) => ({
        render: (w: number) => {
          const currentReg = loadRegistry(ctx.cwd, { videoId: basename(ctx.cwd), now: nowFn() });
          const currentEv = evaluate(currentReg, createFsReader(ctx.cwd));
          return renderStartupPanel(ctx.cwd, currentEv, w, DEFAULT_PKG_VERSION);
        },
        invalidate() {},
      }));
    } catch {
      // Ignore UI refresh errors when registry is temporarily unreadable.
    }
  }

  return function youtubeShellExtension(pi: any) {
    pi.on("session_start", async (_event: any, ctx: any) => {
      refreshUi(ctx);
    });

    pi.registerTool({
      name: "yts_status",
      label: "Estado de Producción YouTube-Shell",
      description: "Devuelve el estado determinista de las 7 fases y la siguiente acción permitida.",
      parameters: {
        type: "object",
        properties: {},
      },
      async execute(_toolCallId: string, _params: Record<string, unknown>, _signal: unknown, _onUpdate: unknown, ctx: any) {
        const reader = createFsReader(ctx.cwd);
        const reg = loadRegistry(ctx.cwd, { videoId: basename(ctx.cwd), now: nowFn() });
        const ev = evaluate(reg, reader);
        return {
          content: [{ type: "text", text: JSON.stringify(ev, null, 2) }],
          details: ev,
        };
      },
    });

    pi.registerTool({
      name: "yts_check_contract",
      label: "Verificador de Contrato YouTube-Shell",
      description:
        "Ejecuta las verificaciones deterministas del contrato de producción sobre la carpeta activa del video.",
      parameters: {
        type: "object",
        properties: {},
      },
      async execute(_toolCallId: string, _params: Record<string, unknown>, _signal: unknown, _onUpdate: unknown, ctx: any) {
        const report = checkVideoContract(ctx.cwd);
        return {
          content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
          details: report,
        };
      },
    });

    pi.registerTool({
      name: "yts_measure_master",
      label: "Medición de Master YouTube-Shell",
      description:
        "Mide el archivo master con ffprobe/ffmpeg contra una hoja de aceptación versionada antes del render.",
      parameters: {
        type: "object",
        properties: {
          masterPath: { type: "string" },
          acceptanceSheetPath: { type: "string" },
        },
        required: ["masterPath", "acceptanceSheetPath"],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>, _signal: unknown, _onUpdate: unknown, ctx: any) {
        const masterRel = String(params.masterPath ?? "");
        const sheetRel = String(params.acceptanceSheetPath ?? "");
        const safeMaster = isSafeEvidencePath(masterRel);
        const safeSheet = isSafeEvidencePath(sheetRel);
        if (!safeMaster.ok || !safeSheet.ok) {
          return {
            content: [{ type: "text", text: "Ruta de master o de hoja de aceptación inválida." }],
            isError: true,
          };
        }
        const measured = measureMasterFile(join(ctx.cwd, masterRel));
        if (!measured.ok) {
          return {
            content: [{ type: "text", text: measured.reason }],
            details: { result: "NOT_EVALUABLE", reason: measured.reason },
            isError: true,
          };
        }
        const sheetFull = join(ctx.cwd, sheetRel);
        const sheet = existsSync(sheetFull)
          ? (JSON.parse(readFileSync(sheetFull, "utf8")) as AcceptanceSheet)
          : null;
        const report = evaluateMasterAcceptance(measured.metrics, sheet);
        return {
          content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
          details: report,
        };
      },
    });

    pi.registerTool({
      name: "yts_transition",
      label: "Transición de Fase YouTube-Shell",
      description:
        "Solicita una transición operativa de fase (start, submit, block, unblock, reopen). No permite aprobar fases.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["start", "submit", "block", "unblock", "reopen"],
          },
          phase: {
            type: "string",
            enum: PHASE_IDS,
          },
          reason: { type: "string" },
          resolution: { type: "string" },
          evidence: { type: "array" },
        },
        required: ["action", "phase"],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>, _signal: unknown, _onUpdate: unknown, ctx: any) {
        if (activeWorkMode === "read_only") {
          const reason =
            "Modo de solo lectura activo (consulta/auditoría): no se permiten transiciones de fase en este turno.";
          return {
            content: [{ type: "text", text: `Transición denegada: ${reason}` }],
            details: { ok: false, reasons: [reason] },
            isError: true,
          };
        }
        const res = executeAgentTransition(ctx.cwd, params, nowFn());
        if (!res.ok) {
          return {
            content: [{ type: "text", text: `Transición denegada: ${res.reasons.join(" ")}` }],
            details: res,
            isError: true,
          };
        }
        saveRegistry(ctx.cwd, res.registry);
        const ev = evaluate(res.registry, createFsReader(ctx.cwd));
        refreshUi(ctx);
        return {
          content: [{ type: "text", text: `Fase ${String(params.phase)} actualizada. Siguiente: ${ev.nextAction}` }],
          details: ev,
        };
      },
    });

    pi.registerCommand("yts-init", {
      description: "Inicializa las 7 plantillas canónicas (00..06) y el registro de producción en la carpeta actual.",
      handler: async (_args: string, ctx: any) => {
        const { createdFiles } = scaffoldVideoDir(ctx.cwd, { now: nowFn() });
        const summary =
          createdFiles.length > 0
            ? `Creados: ${createdFiles.join(", ")}`
            : "Plantillas ya presentes; registro sincronizado.";
        refreshUi(ctx);
        ctx.ui.notify(`Video inicializado en ${basename(ctx.cwd)}. ${summary}`, "info");
      },
    });

    pi.registerCommand("yts-status", {
      description: "Muestra el estado determinista de las 7 fases y refresca el panel visual de producción.",
      handler: async (_args: string, ctx: any) => {
        refreshUi(ctx);
        const reader = createFsReader(ctx.cwd);
        const reg = loadRegistry(ctx.cwd, { videoId: basename(ctx.cwd), now: nowFn() });
        const ev = evaluate(reg, reader);
        const summary = ev.phases.map((p) => `${p.id}: ${p.effective}`).join(" · ");
        ctx.ui.notify(`${basename(ctx.cwd)} — ${summary} | Siguiente: ${ev.nextAction}`, "info");
      },
    });

    pi.registerCommand("yts-approve", {
      description: "Acción exclusiva del creador para aprobar una fase en PENDIENTE_APROBACION.",
      handler: async (args: string, ctx: any) => {
        if (!ctx.hasUI) {
          throw new Error("Aprobación denegada: /yts-approve requiere interfaz interactiva (hasUI=true).");
        }
        const tokens = args.trim().split(/\s+/).filter(Boolean);
        const ackWarn = tokens.includes("--ack-warn");
        const cleanTokens = tokens.filter((t) => t !== "--ack-warn");
        const phase = cleanTokens[0];
        const note = cleanTokens.slice(1).join(" ") || undefined;

        if (!isPhaseId(phase)) {
          ctx.ui.notify(`Uso: /yts-approve <FASE> [--ack-warn] [nota]`, "error");
          return;
        }

        const nowIso = nowFn();
        const reader = createFsReader(ctx.cwd);
        const reg = loadRegistry(ctx.cwd, { videoId: basename(ctx.cwd), now: nowIso });
        const submission = reg.phases[phase].submission;
        const summary = submission
          ? submission.artifacts.map((a) => `${a.ref.file}${a.ref.section ? `#${a.ref.section}` : ""} (${a.hash.slice(0, 19)}…)`).join(", ")
          : "sin envío";

        const confirmed = await ctx.ui.confirm(
          `Aprobar ${phase}`,
          `¿Confirma aprobar ${phase}? Evidencia: ${summary}`,
        );
        if (!confirmed) {
          ctx.ui.notify(`Aprobación de ${phase} cancelada por el creador.`, "warning");
          return;
        }

        const res = approvePhase(
          reg,
          phase,
          { acknowledgeWarnings: ackWarn, note },
          { actor: { kind: "creator", channel: "pi-command" }, reader, now: nowIso },
        );
        if (!res.ok) {
          ctx.ui.notify(`No se pudo aprobar ${phase}: ${res.reasons.join(" ")}`, "error");
          return;
        }
        saveRegistry(ctx.cwd, res.registry);
        refreshUi(ctx);
        ctx.ui.notify(`Fase ${phase} APROBADA por el creador.`, "info");
      },
    });

    pi.registerCommand("yts-reject", {
      description: "Acción exclusiva del creador para devolver una fase pendiente con cambios solicitados.",
      handler: async (args: string, ctx: any) => {
        if (!ctx.hasUI) {
          throw new Error("Operación denegada: /yts-reject requiere interfaz interactiva.");
        }
        const [phase, ...rest] = args.trim().split(/\s+/);
        const note = rest.join(" ");
        if (!isPhaseId(phase)) {
          ctx.ui.notify("Uso: /yts-reject <FASE> <nota>", "error");
          return;
        }
        const nowIso = nowFn();
        const reader = createFsReader(ctx.cwd);
        const reg = loadRegistry(ctx.cwd, { videoId: basename(ctx.cwd), now: nowIso });
        const res = requestChanges(reg, phase, note, {
          actor: { kind: "creator", channel: "pi-command" },
          reader,
          now: nowIso,
        });
        if (!res.ok) {
          ctx.ui.notify(`No se pudo rechazar ${phase}: ${res.reasons.join(" ")}`, "error");
          return;
        }
        saveRegistry(ctx.cwd, res.registry);
        refreshUi(ctx);
        ctx.ui.notify(`Fase ${phase} devuelta a EN_CURSO.`, "info");
      },
    });

    pi.registerCommand("yts-link", {
      description: "Vincula la carpeta del video con la oficina de producción y el directorio del canal.",
      handler: async (args: string, ctx: any) => {
        const nowIso = nowFn();
        const tokens = args.trim().split(/\s+/).filter(Boolean);
        let officeRoot: string | undefined;
        let channelDir: string | undefined;

        if (tokens.length === 0 || tokens[0] === "auto") {
          const detected = detectWorkspaceLink(ctx.cwd);
          if (!detected) {
            ctx.ui.notify(
              "No se pudo autodetectar la oficina. Uso: /yts-link <ruta-oficina> [ruta-canal]",
              "error",
            );
            return;
          }
          officeRoot = detected.officeRoot;
          channelDir = detected.channelDir;
        } else {
          officeRoot = resolve(ctx.cwd, tokens[0]);
          if (!existsSync(officeRoot)) {
            ctx.ui.notify(`La ruta de oficina no existe: ${officeRoot}`, "error");
            return;
          }
          if (tokens[1]) {
            channelDir = resolve(ctx.cwd, tokens[1]);
            if (!existsSync(channelDir)) {
              ctx.ui.notify(`La ruta de canal no existe: ${channelDir}`, "error");
              return;
            }
          }
        }

        const reg = loadRegistry(ctx.cwd, { videoId: basename(ctx.cwd), now: nowIso });
        reg.workspaceLink = {
          officeRoot,
          ...(channelDir ? { channelDir } : {}),
          linkedAt: nowIso,
        };
        reg.updatedAt = nowIso;
        saveRegistry(ctx.cwd, reg);
        refreshUi(ctx);
        ctx.ui.notify(
          `Vínculo registrado: oficina=${officeRoot}${channelDir ? ` · canal=${channelDir}` : ""}`,
          "info",
        );
      },
    });

    pi.registerCommand("yts-approve-sheet", {
      description:
        "Acción exclusiva del creador para aprobar criptográficamente la hoja de aceptación pre-render (aceptacion.json).",
      handler: async (args: string, ctx: any) => {
        if (!ctx.hasUI) {
          throw new Error(
            "Aprobación denegada: /yts-approve-sheet requiere interfaz interactiva (hasUI=true).",
          );
        }
        const sheetRel = args.trim() || "aceptacion.json";
        const safe = isSafeEvidencePath(sheetRel);
        if (!safe.ok) {
          ctx.ui.notify(`Ruta inválida para hoja de aceptación: ${safe.reason}`, "error");
          return;
        }
        const sheetFull = join(ctx.cwd, sheetRel);
        if (!existsSync(sheetFull)) {
          ctx.ui.notify(`No existe la hoja de aceptación "${sheetRel}".`, "error");
          return;
        }
        let parsed: AcceptanceSheet;
        try {
          parsed = JSON.parse(readFileSync(sheetFull, "utf8")) as AcceptanceSheet;
        } catch {
          ctx.ui.notify(`"${sheetRel}" no contiene JSON válido.`, "error");
          return;
        }
        if (
          !parsed ||
          parsed.approvedBeforeRender !== true ||
          typeof parsed.approvedBy !== "string" ||
          !parsed.approvedBy.trim() ||
          Number.isNaN(Date.parse(parsed.approvedAt))
        ) {
          ctx.ui.notify(
            `La hoja "${sheetRel}" debe declarar approvedBeforeRender=true, approvedBy y approvedAt válido.`,
            "error",
          );
          return;
        }

        const reader = createFsReader(ctx.cwd);
        const fp = reader.fingerprint({ file: sheetRel });
        if (!fp.ok) {
          ctx.ui.notify(`No se pudo calcular la huella de "${sheetRel}": ${fp.reason}`, "error");
          return;
        }

        const confirmed = await ctx.ui.confirm(
          "Aprobar hoja de aceptación pre-render",
          `¿Confirma aprobar "${sheetRel}" (${fp.hash.slice(0, 19)}…) antes del render del master?`,
        );
        if (!confirmed) {
          ctx.ui.notify(`Aprobación de "${sheetRel}" cancelada por el creador.`, "warning");
          return;
        }

        const nowIso = nowFn();
        const reg = loadRegistry(ctx.cwd, { videoId: basename(ctx.cwd), now: nowIso });
        const res = approveAcceptanceSheet(reg, {
          path: sheetRel,
          sha256: fp.hash,
          actor: { kind: "creator", channel: "pi-command" },
          now: nowIso,
        });
        if (!res.ok) {
          ctx.ui.notify(`No se pudo aprobar "${sheetRel}": ${res.reasons.join(" ")}`, "error");
          return;
        }
        saveRegistry(ctx.cwd, res.registry);
        refreshUi(ctx);
        ctx.ui.notify(
          `Hoja de aceptación pre-render "${sheetRel}" APROBADA por el creador (${fp.hash.slice(0, 19)}…).`,
          "info",
        );
      },
    });

    pi.on("before_agent_start", async (event: any, ctx: any) => {
      const nowIso = nowFn();
      const reader = createFsReader(ctx.cwd);
      const hasRegistry =
        existsSync(registryPath(ctx.cwd)) || existsSync(join(ctx.cwd, "00-estado-produccion.md"));
      const reg = loadRegistry(ctx.cwd, { videoId: basename(ctx.cwd), now: nowIso });
      const ev = evaluate(reg, reader);
      const activeWorkPhases = ev.phases.filter((p) => p.canWork).map((p) => p.id);

      const resolvedWorkflow = resolveWorkflowContext({
        videoDir: ctx.cwd,
        promptText: extractPromptText(event),
        reg,
        evaluation: ev,
        hasRegistry,
      });
      activeWorkMode = resolvedWorkflow.workMode;

      const candidateTools: string[] = (pi.getAllTools?.() ?? []).map((t: { name: string }) => t.name);
      const allowedTools = candidateTools.filter((name) => {
        const entry = catalog.get(name);
        if (!entry) return false;
        if (resolvedWorkflow.workMode === "read_only" && !isReadOnlyCapability(entry)) {
          return false;
        }
        if (entry.allowedPhases === "ALL") return true;
        if (entry.allowedPhases === "ANY_ACTIVE") return activeWorkPhases.length > 0;
        return entry.allowedPhases.some((p) => activeWorkPhases.includes(p));
      });
      pi.setActiveTools?.(allowedTools);

      const governanceBlock = buildThreeLayerPrompt(resolvedWorkflow);
      return {
        systemPrompt: `${String(event.systemPrompt ?? "")}\n\n${governanceBlock}`,
      };
    });

    pi.on("tool_call", async (event: any, ctx: any) => {
      const toolName = String(event.toolName ?? "");
      if (toolName === "bash") {
        return {
          block: true,
          reason:
            "Operación bloqueada: el shell arbitrario (bash) no está expuesto durante el flujo de producción controlado.",
        };
      }

      const cap = catalog.get(toolName);
      if (!cap) {
        return {
          block: true,
          reason: `Operación bloqueada: la herramienta "${toolName}" no está registrada en el catálogo de capacidades de youtube-shell.`,
        };
      }

      if (activeWorkMode === "read_only" && !isReadOnlyCapability(cap)) {
        return {
          block: true,
          reason:
            "Operación bloqueada: modo de solo lectura activo (consulta/auditoría); no se permiten escrituras, ediciones ni transiciones de fase en este turno.",
        };
      }

      const nowIso = nowFn();
      let reg;
      let ev;
      try {
        const reader = createFsReader(ctx.cwd);
        reg = loadRegistry(ctx.cwd, { videoId: basename(ctx.cwd), now: nowIso });
        ev = evaluate(reg, reader);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          block: true,
          reason: `Operación bloqueada: fallo al verificar el registro de estado (${msg}).`,
        };
      }

      const activeWorkPhases = ev.phases.filter((p) => p.canWork).map((p) => p.id);

      if (cap.allowedPhases === "ANY_ACTIVE" && activeWorkPhases.length === 0) {
        return {
          block: true,
          reason: `Operación bloqueada: "${toolName}" requiere al menos una fase EN_CURSO activa. Siguiente acción permitida: ${ev.nextAction}`,
        };
      }

      if (
        Array.isArray(cap.allowedPhases) &&
        !cap.allowedPhases.some((phaseId) => activeWorkPhases.includes(phaseId))
      ) {
        return {
          block: true,
          reason: `Operación bloqueada: "${toolName}" solo está permitida en ${cap.allowedPhases.join(", ")}. Siguiente acción permitida: ${ev.nextAction}`,
        };
      }

      if (toolName === "yts_transition") {
        const check = executeAgentTransition(ctx.cwd, event.input ?? {}, nowIso);
        if (!check.ok) {
          return {
            block: true,
            reason: `Operación bloqueada: ${check.reasons.join(" ")}`,
          };
        }
      }

      if (cap.capability === "write_artifact") {
        const check = verifyWriteTargetAndSharedSections(
          ctx.cwd,
          toolName,
          event.input ?? {},
          activeWorkPhases,
          nowIso,
        );
        if (!check.ok) {
          return { block: true, reason: check.reason };
        }
      }

      if (cap.validationMethod === "filmcraft_command_guard") {
        const check = verifyFilmcraftCall(toolName, event.input ?? {});
        if (!check.ok) {
          return { block: true, reason: check.reason };
        }
      }

      if (cap.validationMethod === "effectcraft_command_guard") {
        const check = verifyEffectcraftCall(toolName, event.input ?? {});
        if (!check.ok) {
          return { block: true, reason: check.reason };
        }
      }

      if (cap.validationMethod === "soundcraft_command_guard") {
        const check = verifySoundcraftCall(toolName, event.input ?? {});
        if (!check.ok) {
          return { block: true, reason: check.reason };
        }
      }

      const needsConfirm =
        cap.requiresHumanConfirmation ||
        cap.capability === "publish" ||
        cap.capability === "delete" ||
        cap.capability === "paid_action";

      if (needsConfirm) {
        if (!ctx.hasUI) {
          return {
            block: true,
            reason: `Operación bloqueada: "${toolName}" requiere confirmación humana explícita y la sesión actual no tiene interfaz interactiva (hasUI=false).`,
          };
        }
        const ok = await ctx.ui.confirm(
          `Confirmación requerida: ${toolName}`,
          `¿Autoriza al agente a ejecutar "${toolName}" en ${basename(ctx.cwd)}?`,
        );
        if (!ok) {
          return {
            block: true,
            reason: `Operación cancelada por el creador al solicitar confirmación para "${toolName}".`,
          };
        }
      }

      return undefined;
    });
  };
}

export default createYoutubeShellExtension();
