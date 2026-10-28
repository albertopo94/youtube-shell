import {
  CONTRACT_VERSION,
  detectProductionMode,
  getPhase,
  getPhaseEvidence,
  isAllowedEvidenceRole,
  P05_EVIDENCE_BY_MODE,
  PHASE_IDS,
  PHASES,
} from "./phases.ts";
import type {
  Actor,
  ArtifactReader,
  ArtifactRef,
  CheckRun,
  Context,
  DeclaredEvidence,
  EffectiveStatus,
  FingerprintedArtifact,
  PhaseId,
  PhaseRecord,
  Registry,
  Result,
  StoredStatus,
} from "./types.ts";
import { refKey } from "./types.ts";

export interface PhaseEvaluation {
  id: PhaseId;
  stored: StoredStatus;
  effective: EffectiveStatus;
  canStart: boolean;
  canWork: boolean;
  reasons: string[];
}

export interface Evaluation {
  phases: PhaseEvaluation[];
  nextAction: string;
}

export interface SubmitInput {
  checks: CheckRun[];
  evidence: DeclaredEvidence[];
}

export interface ApproveOptions {
  acknowledgeWarnings?: boolean;
  note?: string;
}

export function createRegistry(videoId: string, now: string): Registry {
  const phases = {} as Record<PhaseId, PhaseRecord>;
  for (const id of PHASE_IDS) {
    phases[id] = { status: "NO_INICIADO", approvals: [] };
  }
  return {
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    videoId,
    createdAt: now,
    updatedAt: now,
    phases,
    history: [],
  };
}

export function isSafeEvidencePath(relPath: string): { ok: true } | { ok: false; reason: string } {
  if (!relPath || typeof relPath !== "string" || relPath.includes("\0")) {
    return { ok: false, reason: "La ruta de evidencia está vacía o es inválida." };
  }
  if (relPath.startsWith("/") || relPath.startsWith("\\") || /^[A-Za-z]:/.test(relPath)) {
    return { ok: false, reason: `La ruta "${relPath}" debe ser relativa a la carpeta del video.` };
  }
  const segments = relPath.split(/[\\/]/);
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === ".." || seg === ".youtube-shell") {
      return { ok: false, reason: `La ruta "${relPath}" no puede escapar ni apuntar a registros internos.` };
    }
  }
  if (relPath === "00-estado-produccion.md") {
    return { ok: false, reason: `La ruta "${relPath}" es una vista, no una evidencia.` };
  }
  return { ok: true };
}

export function evaluate(reg: Registry, reader: ArtifactReader): Evaluation {
  const byId = new Map<PhaseId, PhaseEvaluation>();

  for (const def of PHASES) {
    const rec = reg.phases[def.id];
    const reasons: string[] = [];
    const prereqReasons: string[] = [];

    for (const reqId of def.requires) {
      const reqEval = byId.get(reqId);
      if (!reqEval || reqEval.effective !== "APROBADO") {
        prereqReasons.push(
          `${reqId} aún no tiene aprobación humana vigente (estado: ${reqEval ? reqEval.effective : "DESCONOCIDO"}).`,
        );
      }
    }

    let effective: EffectiveStatus = rec.status;

    if (rec.status === "APROBADO") {
      const latest = rec.approvals.at(-1);
      if (!latest) {
        reasons.push("No consta ningún registro de aprobación humana.");
      } else {
        for (const item of latest.artifacts) {
          const current = reader.fingerprint(item.ref);
          if (!current.ok) {
            reasons.push(`Artefacto aprobado inaccesible (${refKey(item.ref)}): ${current.reason}`);
          } else if (current.hash !== item.hash) {
            reasons.push(`El artefacto aprobado ${refKey(item.ref)} cambió desde la aprobación.`);
          }
        }
      }
      reasons.push(...prereqReasons);
      if (reasons.length > 0) {
        effective = "OBSOLETO";
      }
    } else {
      if (rec.status === "BLOQUEADO" && rec.blockReason) {
        reasons.push(`Bloqueado: ${rec.blockReason}`);
      }
      reasons.push(...prereqReasons);
    }

    const canStart = effective === "NO_INICIADO" && prereqReasons.length === 0;
    const canWork = effective === "EN_CURSO" && prereqReasons.length === 0;

    byId.set(def.id, {
      id: def.id,
      stored: rec.status,
      effective,
      canStart,
      canWork,
      reasons,
    });
  }

  const phases = PHASE_IDS.map((id) => byId.get(id)!);
  return {
    phases,
    nextAction: computeNextAction(reg, phases),
  };
}

function computeNextAction(reg: Registry, phases: PhaseEvaluation[]): string {
  for (const p of phases) {
    if (p.effective === "APROBADO") continue;
    if (p.effective === "OBSOLETO") {
      return `Reabrir y revalidar ${p.id}: ${p.reasons.join(" ")}`;
    }
    if (p.effective === "BLOQUEADO") {
      return `Resolver bloqueo en ${p.id}: ${reg.phases[p.id].blockReason ?? "sin motivo registrado"}`;
    }
    if (p.effective === "PENDIENTE_APROBACION") {
      return `Esperando revisión y aprobación humana de ${p.id}`;
    }
    if (p.effective === "EN_CURSO") {
      return `Completar entregables de ${p.id} y enviar a revisión`;
    }
    if (p.effective === "NO_INICIADO") {
      return `Iniciar ${p.id}`;
    }
  }
  return "Producción completada con todas las fases aprobadas.";
}

export function startPhase(reg: Registry, id: PhaseId, ctx: Context): Result {
  const ev = evaluate(reg, ctx.reader);
  const pe = ev.phases.find((p) => p.id === id)!;

  if (pe.effective !== "NO_INICIADO") {
    return {
      ok: false,
      reasons: [`No puede comenzar ${id}: su estado actual es ${pe.effective}.`],
    };
  }
  if (!pe.canStart) {
    return {
      ok: false,
      reasons: pe.reasons.length > 0 ? pe.reasons : [`No puede comenzar ${id}.`],
    };
  }

  const next = structuredClone(reg);
  next.phases[id].status = "EN_CURSO";
  next.updatedAt = ctx.now;
  next.history.push({
    at: ctx.now,
    phase: id,
    event: "start",
    actor: ctx.actor.kind,
  });
  return { ok: true, registry: next };
}

export function submitPhase(reg: Registry, id: PhaseId, input: SubmitInput, ctx: Context): Result {
  const def = getPhase(id);
  const ev = evaluate(reg, ctx.reader);
  const pe = ev.phases.find((p) => p.id === id)!;

  if (pe.effective !== "EN_CURSO" && pe.effective !== "PENDIENTE_APROBACION") {
    return {
      ok: false,
      reasons: [`No se puede enviar ${id} a revisión desde el estado ${pe.effective}.`],
    };
  }

  for (const reqId of def.requires) {
    const reqEval = ev.phases.find((p) => p.id === reqId)!;
    if (reqEval.effective !== "APROBADO") {
      return {
        ok: false,
        reasons: [`${reqId} aún no tiene aprobación humana vigente.`],
      };
    }
  }

  const reasons: string[] = [];
  const artifacts: FingerprintedArtifact[] = [];

  for (const doc of def.documents) {
    const refs: ArtifactRef[] = doc.sections
      ? doc.sections.map((section) => ({ file: doc.file, section }))
      : [{ file: doc.file }];
    for (const ref of refs) {
      const fp = ctx.reader.fingerprint(ref);
      if (!fp.ok) {
        reasons.push(`Documento obligatorio ausente o incompleto (${refKey(ref)}): ${fp.reason}`);
      } else {
        artifacts.push({ ref, hash: fp.hash });
      }
    }
  }

  let mode: ProductionMode | undefined = reg.productionMode;
  let detectionError: string | undefined;

  if (typeof ctx.reader.readContent === "function") {
    const text = ctx.reader.readContent("00-estado-produccion.md");
    if (text) {
      const detected = detectProductionMode(text);
      if (detected.ok) {
        if (reg.productionMode && detected.mode !== reg.productionMode) {
          return {
            ok: false,
            reasons: [
              `Discrepancia de flujo: el registro autoritativo indica "${reg.productionMode}", pero 00-estado-produccion.md marca "${detected.mode}". El registro es la única autoridad de estado. Ejecute /yts-mode o sincronice la vista Markdown antes de enviar.`,
            ],
          };
        }
        if (!reg.productionMode) {
          mode = detected.mode;
        }
      } else if (detected.kind === "ambiguous") {
        return { ok: false, reasons: [detected.reason] };
      } else {
        detectionError = detected.reason;
      }
    }
  }

  if (id === "P05_ANIMATIC" && !mode) {
    return {
      ok: false,
      reasons: [
        detectionError ??
          "Para enviar P05_ANIMATIC a revisión debe seleccionarse exactamente un Flujo Audiovisual en 00-estado-produccion.md ([x] Audio-First / [ ] Screen-First / [ ] Speaker-First / [ ] Music-First).",
      ],
    };
  }

  const effectiveMode: ProductionMode = mode ?? "audio_first";

  const expectedEvidence = getPhaseEvidence(id, effectiveMode);
  const seenPrimaryRoles = new Set<string>();

  for (const item of input.evidence) {
    if (!isAllowedEvidenceRole(id, item.role, effectiveMode)) {
      reasons.push(
        `Rol de evidencia no declarado en el contrato de ${id} para el modo ${effectiveMode}: "${item.role}".`,
      );
      continue;
    }

    const primaryRole = id === "P05_ANIMATIC"
      ? (P05_EVIDENCE_BY_MODE[effectiveMode]?.primaryRole ?? item.role)
      : item.role;

    if (seenPrimaryRoles.has(primaryRole)) {
      reasons.push(`Rol de evidencia duplicado para ${primaryRole}: "${item.role}".`);
      continue;
    }
    seenPrimaryRoles.add(primaryRole);

    const safe = isSafeEvidencePath(item.path);
    if (!safe.ok) {
      reasons.push(safe.reason);
      continue;
    }
    const ref: ArtifactRef = { file: item.path };
    const fp = ctx.reader.fingerprint(ref);
    if (!fp.ok) {
      reasons.push(`Evidencia "${item.role}" (${item.path}) no localizada: ${fp.reason}`);
    } else {
      artifacts.push({ ref, hash: fp.hash });
    }
  }

  for (const spec of expectedEvidence) {
    if (!seenPrimaryRoles.has(spec.role)) {
      reasons.push(`Falta evidencia obligatoria "${spec.role}" (${spec.description}).`);
    }
  }

  const checkById = new Map<string, CheckRun>();
  for (const run of input.checks) {
    checkById.set(run.id, run);
  }

  for (const checkId of def.checks) {
    const run = checkById.get(checkId);
    if (!run) {
      reasons.push(`Check obligatorio "${checkId}" sin resultado: NOT_EVALUABLE.`);
    } else if (run.verifiedBy !== "runtime") {
      reasons.push(
        `Check obligatorio "${checkId}" rechazado: el resultado debe proceder del verificador del runtime (verifiedBy="runtime").`,
      );
    } else if (run.result === "FAIL" || run.result === "NOT_EVALUABLE") {
      reasons.push(
        `Check "${checkId}" con resultado ${run.result}${run.details ? `: ${run.details}` : ""}.`,
      );
    }
  }

  for (const run of input.checks) {
    if (!def.checks.includes(run.id)) {
      if (run.verifiedBy !== "runtime") {
        reasons.push(
          `Check "${run.id}" rechazado: el resultado debe proceder del verificador del runtime (verifiedBy="runtime").`,
        );
      } else if (run.result === "FAIL" || run.result === "NOT_EVALUABLE") {
        reasons.push(
          `Check "${run.id}" con resultado ${run.result}${run.details ? `: ${run.details}` : ""}.`,
        );
      }
    }
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  const next = structuredClone(reg);
  next.productionMode = effectiveMode;
  next.phases[id].status = "PENDIENTE_APROBACION";
  next.phases[id].submission = {
    submittedAt: ctx.now,
    artifacts,
    evidence: structuredClone(input.evidence),
    checks: structuredClone(input.checks),
  };
  next.updatedAt = ctx.now;
  next.history.push({
    at: ctx.now,
    phase: id,
    event: "submit",
    actor: ctx.actor.kind,
  });
  return { ok: true, registry: next };
}

export function approvePhase(
  reg: Registry,
  id: PhaseId,
  options: ApproveOptions,
  ctx: Context,
): Result {
  if (ctx.actor.kind !== "creator") {
    return {
      ok: false,
      reasons: ["Solo el creador puede aprobar una fase."],
    };
  }

  const ev = evaluate(reg, ctx.reader);
  const pe = ev.phases.find((p) => p.id === id)!;
  const rec = reg.phases[id];

  if (pe.effective !== "PENDIENTE_APROBACION" || !rec.submission) {
    return {
      ok: false,
      reasons: [`La fase ${id} no está pendiente de aprobación (estado: ${pe.effective}).`],
    };
  }

  const reasons: string[] = [];
  for (const reqId of getPhase(id).requires) {
    const reqEval = ev.phases.find((p) => p.id === reqId)!;
    if (reqEval.effective !== "APROBADO") {
      reasons.push(`${reqId} aún no tiene aprobación humana vigente.`);
    }
  }

  for (const item of rec.submission.artifacts) {
    const current = ctx.reader.fingerprint(item.ref);
    if (!current.ok) {
      reasons.push(`Artefacto ${refKey(item.ref)} inaccesible al aprobar: ${current.reason}`);
    } else if (current.hash !== item.hash) {
      reasons.push(`El artefacto ${refKey(item.ref)} cambió después de enviarse a revisión.`);
    }
  }

  const warnings = rec.submission.checks
    .filter((c) => c.result === "WARN")
    .map((c) => c.id);

  if (warnings.length > 0 && !options.acknowledgeWarnings) {
    reasons.push(
      `Existen avisos WARN (${warnings.join(", ")}) que requieren confirmación expresa del creador.`,
    );
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  const next = structuredClone(reg);
  next.phases[id].status = "APROBADO";
  next.phases[id].approvals.push({
    actor: ctx.actor,
    approvedAt: ctx.now,
    contractVersion: CONTRACT_VERSION,
    artifacts: structuredClone(rec.submission.artifacts),
    checks: structuredClone(rec.submission.checks),
    acknowledgedWarnings: warnings,
    ...(options.note ? { note: options.note } : {}),
  });
  next.updatedAt = ctx.now;
  next.history.push({
    at: ctx.now,
    phase: id,
    event: "approve",
    actor: "creator",
    ...(options.note ? { note: options.note } : {}),
  });
  return { ok: true, registry: next };
}

export function requestChanges(
  reg: Registry,
  id: PhaseId,
  note: string,
  ctx: Context,
): Result {
  if (ctx.actor.kind !== "creator") {
    return {
      ok: false,
      reasons: ["Solo el creador puede devolver una fase con cambios solicitados."],
    };
  }
  const trimmed = note.trim();
  if (!trimmed) {
    return {
      ok: false,
      reasons: ["Debe indicar una nota con los cambios solicitados."],
    };
  }
  if (reg.phases[id].status !== "PENDIENTE_APROBACION") {
    return {
      ok: false,
      reasons: [`La fase ${id} no está en PENDIENTE_APROBACION.`],
    };
  }

  const next = structuredClone(reg);
  next.phases[id].status = "EN_CURSO";
  next.updatedAt = ctx.now;
  next.history.push({
    at: ctx.now,
    phase: id,
    event: "request_changes",
    actor: "creator",
    note: trimmed,
  });
  return { ok: true, registry: next };
}

export function reopenPhase(
  reg: Registry,
  id: PhaseId,
  reason: string,
  ctx: Context,
): Result {
  const trimmed = reason.trim();
  if (!trimmed) {
    return {
      ok: false,
      reasons: ["Debe registrar el motivo para reabrir la fase."],
    };
  }

  const ev = evaluate(reg, ctx.reader);
  const pe = ev.phases.find((p) => p.id === id)!;

  if (pe.effective === "APROBADO" && ctx.actor.kind !== "creator") {
    return {
      ok: false,
      reasons: ["Solo el creador puede reabrir una fase con aprobación vigente."],
    };
  }
  if (pe.effective !== "OBSOLETO" && pe.effective !== "APROBADO") {
    return {
      ok: false,
      reasons: [`Solo se puede reabrir una fase OBSOLETO o APROBADO (actual: ${pe.effective}).`],
    };
  }

  const next = structuredClone(reg);
  next.phases[id].status = "EN_CURSO";
  next.updatedAt = ctx.now;
  next.history.push({
    at: ctx.now,
    phase: id,
    event: "reopen",
    actor: ctx.actor.kind,
    note: trimmed,
  });
  return { ok: true, registry: next };
}

export function changeProductionMode(
  reg: Registry,
  newMode: ProductionMode,
  ctx: Context,
): Result {
  if (reg.productionMode === newMode) {
    return { ok: true, registry: reg };
  }

  const p03 = reg.phases.P03_SCRIPT;
  const p05 = reg.phases.P05_ANIMATIC;

  if (p05 && p05.status !== "NO_INICIADO") {
    return {
      ok: false,
      reasons: [
        `No se puede cambiar el flujo a "${newMode}" porque P05_ANIMATIC ya está en ${p05.status} con el flujo "${reg.productionMode ?? "audio_first"}". Para cambiar el modo, primero reabra o cancele P05_ANIMATIC formalmente.`,
      ],
    };
  }

  if (p03 && p03.status !== "NO_INICIADO") {
    return {
      ok: false,
      reasons: [
        `No se puede cambiar el flujo a "${newMode}" porque P03_SCRIPT ya está en ${p03.status} (concebido bajo el flujo "${reg.productionMode ?? "audio_first"}"). El flujo audiovisual debe definirse antes de iniciar el guion, o reabrir formalmente la fase.`,
      ],
    };
  }

  const next = structuredClone(reg);
  next.productionMode = newMode;
  next.updatedAt = ctx.now;
  next.history.push({
    at: ctx.now,
    phase: "P01_PACKAGING",
    event: "submit",
    actor: ctx.actor.kind,
    note: `Flujo audiovisual configurado a ${newMode}`,
  });

  return { ok: true, registry: next };
}

export function blockPhase(
  reg: Registry,
  id: PhaseId,
  reason: string,
  ctx: Context,
): Result {
  const trimmed = reason.trim();
  if (!trimmed) {
    return {
      ok: false,
      reasons: ["Debe registrar el motivo del bloqueo."],
    };
  }
  if (reg.phases[id].status !== "EN_CURSO") {
    return {
      ok: false,
      reasons: [`Solo se puede bloquear una fase EN_CURSO (actual: ${reg.phases[id].status}).`],
    };
  }

  const next = structuredClone(reg);
  next.phases[id].status = "BLOQUEADO";
  next.phases[id].blockReason = trimmed;
  next.updatedAt = ctx.now;
  next.history.push({
    at: ctx.now,
    phase: id,
    event: "block",
    actor: ctx.actor.kind,
    note: trimmed,
  });
  return { ok: true, registry: next };
}

export function unblockPhase(
  reg: Registry,
  id: PhaseId,
  resolution: string,
  ctx: Context,
): Result {
  const trimmed = resolution.trim();
  if (!trimmed) {
    return {
      ok: false,
      reasons: ["Debe registrar la resolución del bloqueo."],
    };
  }
  if (reg.phases[id].status !== "BLOQUEADO") {
    return {
      ok: false,
      reasons: [`La fase ${id} no está en estado BLOQUEADO.`],
    };
  }

  const next = structuredClone(reg);
  next.phases[id].status = "EN_CURSO";
  delete next.phases[id].blockReason;
  next.updatedAt = ctx.now;
  next.history.push({
    at: ctx.now,
    phase: id,
    event: "unblock",
    actor: ctx.actor.kind,
    note: trimmed,
  });
  return { ok: true, registry: next };
}

export function approveAcceptanceSheet(
  reg: Registry,
  input: {
    path: string;
    sha256: string;
    actor: Actor;
    now?: string;
  },
): Result {
  if (input.actor.kind !== "creator") {
    return {
      ok: false,
      reasons: ["Solo el creador puede aprobar la hoja de aceptación pre-render."],
    };
  }
  const safe = isSafeEvidencePath(input.path);
  if (!safe.ok) {
    return { ok: false, reasons: [safe.reason] };
  }
  if (!input.sha256 || !input.sha256.startsWith("sha256:")) {
    return {
      ok: false,
      reasons: ["Huella SHA-256 inválida para la hoja de aceptación pre-render."],
    };
  }

  const nowIso = input.now ?? new Date().toISOString();
  const next = structuredClone(reg);
  next.acceptanceSheetApproval = {
    path: input.path,
    sha256: input.sha256,
    approvedAt: nowIso,
    actor: input.actor,
  };
  next.updatedAt = nowIso;
  return { ok: true, registry: next };
}
