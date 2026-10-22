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
} from "../core/machine.ts";
import { getPhase, PHASE_IDS } from "../core/phases.ts";
import { extractSection } from "../core/sections.ts";
import type { CheckRun, Context, DeclaredEvidence, PhaseId, Result } from "../core/types.ts";
import { createFsReader, loadRegistry, saveRegistry } from "../store/fs-store.ts";
import { CANONICAL_FILES, checkVideoContract } from "../checks/contract-checker.ts";
import {
  evaluateMasterAcceptance,
  measureMasterFile,
  type AcceptanceSheet,
} from "../checks/media-measurement.ts";
import { buildCapabilityCatalog, type ToolCapabilityEntry } from "./capabilities.ts";

export interface YoutubeShellExtensionOptions {
  extraCapabilities?: readonly ToolCapabilityEntry[];
  now?: () => string;
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

  return function youtubeShellExtension(pi: any) {
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
        return {
          content: [{ type: "text", text: `Fase ${String(params.phase)} actualizada. Siguiente: ${ev.nextAction}` }],
          details: ev,
        };
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
      const statusBlock = `\n\n[youtube-shell runtime]\nFases:\n${phaseLines}\nSiguiente acción permitida: ${ev.nextAction}`;
      return {
        systemPrompt: `${String(event.systemPrompt ?? "")}${statusBlock}`,
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
