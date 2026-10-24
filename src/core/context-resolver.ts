import { existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type { Evaluation } from "./machine.ts";
import { getPhase, type PhaseDefinition } from "./phases.ts";
import { PREAMBLE } from "./sections.ts";
import type { PhaseId, Registry, WorkspaceLink } from "./types.ts";

export type WorkMode = "read_only" | "production";

export type SkillId =
  | "yts-orquestador"
  | "yts-packaging-miniaturas"
  | "yts-investigacion-ideas"
  | "yts-guion-narrativa"
  | "yts-direccion-edicion";

export interface PhasePlaybook {
  phase: PhaseId;
  skill: SkillId;
  role: string;
  summary: string;
}

export const PHASE_PLAYBOOKS: Record<PhaseId, PhasePlaybook> = {
  P01_PACKAGING: {
    phase: "P01_PACKAGING",
    skill: "yts-packaging-miniaturas",
    role: "Estratega de Packaging y Miniaturas",
    summary:
      "5 títulos con ángulos distintos, 3 conceptos de miniatura diferenciados y promesa de trama en 01-packaging.md.",
  },
  P02_RESEARCH: {
    phase: "P02_RESEARCH",
    skill: "yts-investigacion-ideas",
    role: "Investigador y Arquitecto de Ideas",
    summary:
      "Calibración de demanda, barrido DFS, declaración de riesgo factual y fuentes primarias de partida en 06-fuentes-y-verificacion.md (Preámbulo y Parte 1).",
  },
  P03_SCRIPT: {
    phase: "P03_SCRIPT",
    skill: "yts-guion-narrativa",
    role: "Guionista Narrativo",
    summary:
      "Puerta de Correspondencia del Arranque (§0), Puerta de Control Editorial (§1) y bloques atómicos [Bxx] con timecodes en 02-guion.md.",
  },
  P04_FACTCHECK: {
    phase: "P04_FACTCHECK",
    skill: "yts-guion-narrativa",
    role: "Auditor de Verificación Factual y Derechos",
    summary:
      "Verificación línea por línea sin PENDIENTE ni marcadores de plantilla en 06-fuentes-y-verificacion.md (Parte 2 y Checkpoints de Rigor).",
  },
  P05_ANIMATIC: {
    phase: "P05_ANIMATIC",
    skill: "yts-direccion-edicion",
    role: "Director Audiovisual — Animática",
    summary:
      "Anclajes de consistencia visual, montaje preliminar en 03-storyboard-y-edicion.md (§§1-2) y locución provisional neuronal (scratch_track).",
  },
  P06_ASSEMBLY: {
    phase: "P06_ASSEMBLY",
    skill: "yts-direccion-edicion",
    role: "Director Audiovisual — Montaje y Master",
    summary:
      "Tabla de escenas sincronizada con bloques [Bxx], las 4 capas de pulido, registro de licencias (04-registro-recursos.md), hoja de aceptación aprobada (/yts-approve-sheet) y medición ffprobe/ffmpeg.",
  },
  P07_CLOSE: {
    phase: "P07_CLOSE",
    skill: "yts-orquestador",
    role: "Orquestador de Entrega y Retención",
    summary:
      "Cierre de métricas y retrospectiva en 05-metricas-retencion.md, ficha de publicación en entregable-final.md y archivo en videos-publicados/.",
  },
};

const READ_ONLY_PREFIX_RE = /^\s*(consulta\s*:|modo\s+lectura\b|solo\s+lectura\b)/i;
const READ_ONLY_INTENT_RE =
  /\b(consulta|audita|auditor[ií]a|explica|revisa\s+en\s+modo\s+lectura|qu[eé]\s+estado\s+tiene|cu[aá]l\s+es\s+el\s+estado|solo\s+lectura|inspecciona)\b/i;
const MUTATION_INTENT_RE =
  /\b(escribe|edita|modifica|crea|genera|inicia|avanza|env[ií]a|submit|start|produce|redacta|completa|actualiza|corrige)\b/i;

export function classifyWorkMode(promptText: string, hasRegistry: boolean): WorkMode {
  if (!hasRegistry) {
    return "read_only";
  }
  const text = (promptText ?? "").trim();
  if (!text) {
    return "production";
  }
  if (READ_ONLY_PREFIX_RE.test(text)) {
    return "read_only";
  }
  if (READ_ONLY_INTENT_RE.test(text) && !MUTATION_INTENT_RE.test(text)) {
    return "read_only";
  }
  return "production";
}

const OFFICE_MARKER_FILES = ["ideas.md", "referentes.md", "banco-visual.md"] as const;
const CHANNEL_MARKER_FILES = [
  "backlog-ideas.md",
  "banco-de-titulos.md",
  "identidad-visual.md",
  "00-estrategia-y-adn.md",
  "estudio-mercado.md",
  "propuesta-branding.md",
] as const;

export function detectWorkspaceLink(
  videoDir: string,
): { officeRoot: string; channelDir?: string } | undefined {
  const absVideo = resolve(videoDir);
  const parts = absVideo.split(sep);

  for (let i = parts.length - 1; i >= 1; i--) {
    const folder = parts[i];
    if (
      (folder === "mis-canales" || folder === "canales-en-estudio") &&
      i + 1 < parts.length
    ) {
      const officeRoot = parts.slice(0, i).join(sep) || sep;
      const channelDir = parts.slice(0, i + 2).join(sep);
      if (existsSync(officeRoot)) {
        return {
          officeRoot,
          ...(existsSync(channelDir) ? { channelDir } : {}),
        };
      }
    }
  }

  let current = dirname(absVideo);
  let detectedOffice: string | undefined;
  let detectedChannel: string | undefined;

  while (current && current !== dirname(current)) {
    const hasChannelMarker = CHANNEL_MARKER_FILES.some((f) => existsSync(join(current, f)));
    if (hasChannelMarker && !detectedChannel) {
      detectedChannel = current;
    }
    const hasOfficeMarker =
      existsSync(join(current, "_framework")) ||
      OFFICE_MARKER_FILES.some((f) => existsSync(join(current, f)));
    if (hasOfficeMarker) {
      detectedOffice = current;
      break;
    }
    current = dirname(current);
  }

  if (!detectedOffice) {
    return undefined;
  }
  return {
    officeRoot: detectedOffice,
    ...(detectedChannel ? { channelDir: detectedChannel } : {}),
  };
}

export interface Layer3FileStatus {
  name: string;
  path: string;
  exists: boolean;
}

export interface Layer3Resolution {
  workspaceLink?: WorkspaceLink;
  officeFiles: Layer3FileStatus[];
  channelFiles: Layer3FileStatus[];
  frameworkReferences: Layer3FileStatus[];
}

export function resolveLayer3References(
  videoDir: string,
  reg?: Registry,
  _activePhase?: PhaseId,
): Layer3Resolution {
  const repoRoot = resolve(import.meta.dirname, "..", "..");
  const refDir = join(repoRoot, "skills", "yts-orquestador", "references");
  const frameworkReferences: Layer3FileStatus[] = [
    "contingencia-y-politicas-sensibles.md",
    "herramientas-y-apis.md",
  ].map((name) => {
    const full = join(refDir, name);
    return { name, path: full, exists: existsSync(full) };
  });

  let link = reg?.workspaceLink;
  if (!link) {
    const detected = detectWorkspaceLink(videoDir);
    if (detected) {
      link = {
        ...detected,
        linkedAt: reg?.updatedAt ?? new Date(0).toISOString(),
      };
    }
  }

  const officeFiles: Layer3FileStatus[] = link
    ? OFFICE_MARKER_FILES.map((name) => {
        const full = join(link!.officeRoot, name);
        return { name, path: full, exists: existsSync(full) };
      })
    : [];

  const channelFiles: Layer3FileStatus[] =
    link?.channelDir
      ? CHANNEL_MARKER_FILES.map((name) => {
          const full = join(link!.channelDir!, name);
          return { name, path: full, exists: existsSync(full) };
        })
      : [];

  return {
    workspaceLink: link,
    officeFiles,
    channelFiles,
    frameworkReferences,
  };
}

export interface ResolvedWorkflowContext {
  videoDir: string;
  workMode: WorkMode;
  targetPhase: PhaseId;
  phaseDefinition: PhaseDefinition;
  playbook: PhasePlaybook;
  editableTargets: string[];
  evaluation: Evaluation;
  layer3: Layer3Resolution;
  hasAcceptanceSheetApproval: boolean;
}

export function selectTargetPhase(ev: Evaluation): PhaseId {
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
  return active ? active.id : "P07_CLOSE";
}

function formatEditableTargets(phaseDef: PhaseDefinition): string[] {
  const list = phaseDef.documents.map((d) => {
    if (!d.sections || d.sections.length === 0) {
      return `${d.file} (documento completo)`;
    }
    const labels = d.sections.map((s) => (s === PREAMBLE ? "Preámbulo" : s));
    return `${d.file} [secciones: ${labels.join(", ")}]`;
  });
  if (phaseDef.id === "P06_ASSEMBLY") {
    list.push("aceptacion.json / *.acceptance.json (hoja de aceptación pre-render)");
  }
  return list;
}

export function resolveWorkflowContext(options: {
  videoDir: string;
  promptText?: string;
  reg: Registry;
  evaluation: Evaluation;
  hasRegistry?: boolean;
}): ResolvedWorkflowContext {
  const hasRegistry = options.hasRegistry ?? true;
  const workMode = classifyWorkMode(options.promptText ?? "", hasRegistry);
  const targetPhase = selectTargetPhase(options.evaluation);
  const phaseDefinition = getPhase(targetPhase);
  const playbook = PHASE_PLAYBOOKS[targetPhase];
  const editableTargets = formatEditableTargets(phaseDefinition);
  const layer3 = resolveLayer3References(options.videoDir, options.reg, targetPhase);
  const hasAcceptanceSheetApproval = Boolean(options.reg as Record<string, unknown>) &&
    Boolean((options.reg as unknown as { acceptanceSheetApproval?: unknown }).acceptanceSheetApproval);

  return {
    videoDir: options.videoDir,
    workMode,
    targetPhase,
    phaseDefinition,
    playbook,
    editableTargets,
    evaluation: options.evaluation,
    layer3,
    hasAcceptanceSheetApproval,
  };
}

export function buildThreeLayerPrompt(resolved: ResolvedWorkflowContext): string {
  const phaseLines = resolved.evaluation.phases
    .map((p) => `- ${p.id}: ${p.effective}`)
    .join("\n");
  const modeLabel =
    resolved.workMode === "read_only"
      ? "Ruta de solo lectura (consulta/auditoría — no iniciar ni modificar artefactos sin solicitud de producción)"
      : "Ruta de producción audiovisual (ejecución gobernada por fase)";

  const checksLabel =
    resolved.phaseDefinition.checks.length > 0
      ? resolved.phaseDefinition.checks.join(", ")
      : "ninguno (validación documental y aprobación humana)";

  const evidenceLabel =
    resolved.phaseDefinition.evidence.length > 0
      ? resolved.phaseDefinition.evidence.map((e) => `${e.role} (${e.description})`).join(", ")
      : "ninguna evidencia binaria adicional";

  const linkLines: string[] = [];
  if (resolved.layer3.workspaceLink) {
    linkLines.push(`- Oficina vinculada: ${resolved.layer3.workspaceLink.officeRoot}`);
    if (resolved.layer3.workspaceLink.channelDir) {
      linkLines.push(`- Canal vinculado: ${resolved.layer3.workspaceLink.channelDir}`);
    }
    const presentOffice = resolved.layer3.officeFiles.filter((f) => f.exists).map((f) => f.name);
    if (presentOffice.length > 0) {
      linkLines.push(`- Archivos de oficina detectados: ${presentOffice.join(", ")}`);
    }
    const presentChannel = resolved.layer3.channelFiles.filter((f) => f.exists).map((f) => f.name);
    if (presentChannel.length > 0) {
      linkLines.push(`- Archivos de canal detectados: ${presentChannel.join(", ")}`);
    }
  } else {
    linkLines.push(
      "- Sin vínculo de oficina/canal registrado. Si necesitas consultar ideas.md o backlog-ideas.md fuera de esta carpeta, indica al creador que ejecute `/yts-link <ruta-oficina> [ruta-canal]`.",
    );
  }

  for (const ref of resolved.layer3.frameworkReferences) {
    if (ref.exists) {
      linkLines.push(`- Referencia normativa (${ref.name}): ${ref.path}`);
    }
  }

  return [
    "[youtube-shell — Gobernanza y Persona]",
    "[Capa 1 — Orquestador Permanente]",
    "Rol: Director Creativo y de Producción Audiovisual.",
    `Modo de enrutamiento: ${modeLabel}`,
    "Comunicación ejecutiva: hablar en términos de entregables tangibles, ritmo narrativo y experiencia de escucha/visión; evitar jerga de terminal o fontanería interna salvo pedido explícito.",
    "Reglas estructurales:",
    "- La autoridad de estado vive en .youtube-shell/registro.json; 00-estado-produccion.md es una vista legible.",
    "- Ninguna fase comienza sin las fases previas en APROBADO con huellas SHA-256 vigentes.",
    "- Solo el creador aprueba fases mediante /yts-approve (y la hoja pre-render mediante /yts-approve-sheet); el agente solicita revisión con yts_transition(submit).",
    "- Prohibido usar voces mecánicas del sistema (/usr/bin/say) o dejar afirmaciones fácticas en PENDIENTE.",
    "",
    "[Capa 2 — Playbook de Fase Activa]",
    `Fase objetivo: ${resolved.targetPhase} — ${resolved.phaseDefinition.name}`,
    `Skill asignada: ${resolved.playbook.skill} (${resolved.playbook.role})`,
    `Foco de la fase: ${resolved.playbook.summary}`,
    ` Superficie editable permitida: ${resolved.editableTargets.join("; ")}`,
    `Evidencia requerida al enviar: ${evidenceLabel}`,
    `Verificadores deterministas de salida: ${checksLabel}`,
    "",
    "[Capa 3 — Referencias Bajo Demanda y Vínculo de Oficina/Canal]",
    ...linkLines,
    "",
    "[youtube-shell runtime]",
    "Fases:",
    phaseLines,
    `Siguiente acción permitida: ${resolved.evaluation.nextAction}`,
  ].join("\n");
}
