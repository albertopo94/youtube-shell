import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";
import {
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
import { createFsReader, loadRegistry, saveRegistry, scaffoldVideoDir } from "../store/fs-store.ts";
import { CANONICAL_FILES, checkVideoContract } from "../checks/contract-checker.ts";
import {
  evaluateMasterAcceptance,
  measureMasterFile,
  type AcceptanceSheet,
} from "../checks/media-measurement.ts";
import { buildCapabilityCatalog, type ToolCapabilityEntry } from "./capabilities.ts";

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
    `             ${ANSI_AMBER}SKILLS:${ANSI_RESET} 4 loaded (yts-*)`,
    `             ${ANSI_AMBER}TOOLS:${ANSI_RESET}  4 custom + gate`,
    "",
    `${ANSI_CYAN}[Skills]${ANSI_RESET}`,
    `  • yts-investigacion-ideas    • yts-packaging-miniaturas`,
    `  • yts-guion-narrativa        • yts-direccion-edicion`,
    `${ANSI_CYAN}[Commands]${ANSI_RESET}`,
    `  • /yts-init                  • /yts-status`,
    `  • /yts-approve <FASE>        • /yts-reject <FASE> <nota>`,
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
    const explicitChecks = Array.isArray(input.checks) ? (input.checks as CheckRun[]) : [];
    const explicitIds = new Set(explicitChecks.map((c) => c.id));
    const phaseCheckIds = new Set(getPhase(phase).checks);
    const autoChecks: CheckRun[] = checkVideoContract(videoDir)
      .checks.filter((c) => phaseCheckIds.has(c.id) && !explicitIds.has(c.id))
      .map((c) => ({ id: c.id, result: c.result, details: c.details }));
    const checks = [...explicitChecks, ...autoChecks];
    const evidence = Array.isArray(input.evidence) ? (input.evidence as DeclaredEvidence[]) : [];
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

  if (!allowedFiles.has(targetPath)) {
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

export function createYoutubeShellExtension(options: YoutubeShellExtensionOptions = {}) {
  const catalog = buildCapabilityCatalog(options.extraCapabilities);
  const nowFn = options.now ?? (() => new Date().toISOString());

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
          checks: { type: "array" },
          evidence: { type: "array" },
        },
        required: ["action", "phase"],
      },
      async execute(_toolCallId: string, params: Record<string, unknown>, _signal: unknown, _onUpdate: unknown, ctx: any) {
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

    pi.on("before_agent_start", async (event: any, ctx: any) => {
      const nowIso = nowFn();
      const reader = createFsReader(ctx.cwd);
      const reg = loadRegistry(ctx.cwd, { videoId: basename(ctx.cwd), now: nowIso });
      const ev = evaluate(reg, reader);
      const activeWorkPhases = ev.phases.filter((p) => p.canWork).map((p) => p.id);

      const candidateTools: string[] = (pi.getAllTools?.() ?? []).map((t: { name: string }) => t.name);
      const allowedTools = candidateTools.filter((name) => {
        const entry = catalog.get(name);
        if (!entry) return false;
        if (entry.allowedPhases === "ALL") return true;
        if (entry.allowedPhases === "ANY_ACTIVE") return activeWorkPhases.length > 0;
        return entry.allowedPhases.some((p) => activeWorkPhases.includes(p));
      });
      pi.setActiveTools?.(allowedTools);

      const phaseLines = ev.phases.map((p) => `- ${p.id}: ${p.effective}`).join("\n");
      const governanceBlock = [
        "[youtube-shell — Gobernanza y Persona]",
        "Rol: Director Creativo y de Producción Audiovisual.",
        "Comunicación ejecutiva: hablar en términos de entregables tangibles, ritmo narrativo y experiencia de escucha/visión; evitar jerga de terminal o fontanería interna salvo pedido explícito.",
        "Reglas estructurales:",
        "- La autoridad de estado vive en .youtube-shell/registro.json; 00-estado-produccion.md es una vista legible.",
        "- Ninguna fase comienza sin las fases previas en APROBADO con huellas SHA-256 vigentes.",
        "- Solo el creador aprueba fases mediante /yts-approve; el agente solicita revisión con yts_transition(submit).",
        "- Prohibido usar voces mecánicas del sistema (/usr/bin/say) o dejar afirmaciones fácticas en PENDIENTE.",
        "",
        "[youtube-shell runtime]",
        "Fases:",
        phaseLines,
        `Siguiente acción permitida: ${ev.nextAction}`,
      ].join("\n");
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
