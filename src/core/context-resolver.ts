import { existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type { Evaluation } from "./machine.ts";
import { getPhase, type PhaseDefinition } from "./phases.ts";
import { PREAMBLE } from "./sections.ts";
import type { PhaseId, ProductionMode, Registry, WorkspaceLink } from "./types.ts";

export type WorkMode = "read_only" | "production";

export type SkillId =
  | "yts-orquestador"
  | "yts-packaging-miniaturas"
  | "yts-investigacion-ideas"
  | "yts-guion-narrativa"
  | "yts-direccion-edicion";

export interface PhaseVerificationBoundary {
  runtimeDeterministic: string;
  humanEditorial: string;
}

export interface PhasePlaybook {
  phase: PhaseId;
  skill: SkillId;
  role: string;
  summary: string;
  mandatoryReferences: string[];
  conditionalReferences: string[];
  requiredDeliverableEvidence: string;
  verificationBoundary: PhaseVerificationBoundary;
}

export const PHASE_PLAYBOOKS: Record<PhaseId, PhasePlaybook> = {
  P01_PACKAGING: {
    phase: "P01_PACKAGING",
    skill: "yts-packaging-miniaturas",
    role: "Estratega de Packaging y Miniaturas",
    summary:
      "5 títulos con ángulos distintos, 3 conceptos de miniatura diferenciados y promesa de trama en 01-packaging.md.",
    mandatoryReferences: [
      "01-packaging.md",
      "skills/yts-packaging-miniaturas/SKILL.md",
    ],
    conditionalReferences: [
      "ideas.md y backlog-ideas.md (si hay vínculo de oficina/canal, para verificar territorios vetados)",
      "banco-de-titulos.md y referentes.md (si existen en el canal/oficina, para alinear ángulos y estilo visual)",
    ],
    requiredDeliverableEvidence:
      "Secciones §1 (Estrategia Psicológica y Promesa de Trama), §2 (5 opciones de título numeradas y justificación), §3 (Miniatura A, B y C con ficha técnica) y §4 (Control de Calidad Pre-Guion) completas en 01-packaging.md.",
    verificationBoundary: {
      runtimeDeterministic:
        "packaging_structure valida 5 títulos numerados, encabezados de Miniatura A/B/C y sección §4 sin marcadores de plantilla vacíos.",
      humanEditorial:
        "El creador evalúa que los 5 ángulos sean genuinamente distintos y que las 3 miniaturas funcionen visualmente en el feed antes de /yts-approve P01_PACKAGING.",
    },
  },
  P02_RESEARCH: {
    phase: "P02_RESEARCH",
    skill: "yts-investigacion-ideas",
    role: "Investigador y Arquitecto de Ideas",
    summary:
      "Calibración de demanda, barrido DFS, declaración de riesgo factual y fuentes primarias de partida en 06-fuentes-y-verificacion.md (Preámbulo y Parte 1).",
    mandatoryReferences: [
      "01-packaging.md (aprobado en P01_PACKAGING)",
      "06-fuentes-y-verificacion.md (Preámbulo y Parte 1)",
      "skills/yts-investigacion-ideas/SKILL.md",
    ],
    conditionalReferences: [
      "skills/yts-orquestador/references/contingencia-y-politicas-sensibles.md (obligatorio si el contenido toca salud, finanzas, ciencia o Zona Roja YMYL)",
      "ideas.md y backlog-ideas.md (para linter de enfoques vetados y estrategia de mercados lingüísticos)",
    ],
    requiredDeliverableEvidence:
      "Declaración explícita del Régimen de Verificación (riesgo factual separado del formato) en el Preámbulo y tabla/lista de Fuentes de Partida con URL/DOI y limitaciones metodológicas en la Parte 1 de 06-fuentes-y-verificacion.md.",
    verificationBoundary: {
      runtimeDeterministic:
        "research_sources_structure comprueba la declaración de riesgo factual y la presencia de fuentes estructuradas o exención justificada en Parte 1.",
      humanEditorial:
        "El creador verifica que los enlaces existan, sean fuentes primarias pertinentes y respalden la tesis antes de /yts-approve P02_RESEARCH.",
    },
  },
  P03_SCRIPT: {
    phase: "P03_SCRIPT",
    skill: "yts-guion-narrativa",
    role: "Guionista Narrativo",
    summary:
      "Puerta de Correspondencia del Arranque (§0), Puerta de Control Editorial (§1) y bloques atómicos [Bxx] con timecodes en 02-guion.md.",
    mandatoryReferences: [
      "01-packaging.md (promesa de título y miniatura aprobada)",
      "06-fuentes-y-verificacion.md#Parte 1 (fuentes primarias aprobadas en P02_RESEARCH)",
      "02-guion.md",
      "skills/yts-guion-narrativa/SKILL.md",
    ],
    conditionalReferences: [
      "skills/yts-orquestador/references/contingencia-y-politicas-sensibles.md (para léxico blindado YMYL y matización de estudios en modelos animales)",
    ],
    requiredDeliverableEvidence:
      "Modo de progresión declarado en cabecera, tabla §0 (Puerta de Correspondencia del Arranque), §1 (Puerta de Control Editorial y Congruencia Promesa-Contenido) y bloques ### [Bxx] con timecodes MM:SS - MM:SS en 02-guion.md.",
    verificationBoundary: {
      runtimeDeterministic:
        "script_block_ids exige la sección Puerta de Control Editorial, identificadores únicos [Bxx] y timecodes MM:SS válidos sin marcadores vacíos.",
      humanEditorial:
        "El creador juzga la fuerza del arranque, el cumplimiento real de la promesa y la calidad dramática de la voz antes de /yts-approve P03_SCRIPT.",
    },
  },
  P04_FACTCHECK: {
    phase: "P04_FACTCHECK",
    skill: "yts-guion-narrativa",
    role: "Auditor de Verificación Factual y Derechos",
    summary:
      "Verificación línea por línea sin PENDIENTE ni marcadores de plantilla en 06-fuentes-y-verificacion.md (Parte 2 y Checkpoints de Rigor).",
    mandatoryReferences: [
      "02-guion.md (aprobado en P03_SCRIPT)",
      "06-fuentes-y-verificacion.md (Parte 2 y Checkpoints de Rigor)",
      "skills/yts-orquestador/references/contingencia-y-politicas-sensibles.md",
    ],
    conditionalReferences: [
      "01-packaging.md (si una matización factual obliga a revisar la congruencia con la promesa de entrada)",
    ],
    requiredDeliverableEvidence:
      "Tabla de Parte 2 (Verificación de Afirmaciones del Borrador) con cada bloque [Bxx] resuelto en VERIFICADO/MODIFICADO/ELIMINADO con DOI/URL real y Checkpoints de Rigor marcados en 06-fuentes-y-verificacion.md, manteniendo intacta la Parte 1.",
    verificationBoundary: {
      runtimeDeterministic:
        "factcheck_resolved bloquea cualquier fila en PENDIENTE o marcador de plantilla y el gate SHA-256 impide alterar el Preámbulo o la Parte 1 aprobados en P02_RESEARCH.",
      humanEditorial:
        "El creador confirma que la evidencia citada sostiene cada afirmación concreta del guion antes de /yts-approve P04_FACTCHECK.",
    },
  },
  P05_ANIMATIC: {
    phase: "P05_ANIMATIC",
    skill: "yts-direccion-edicion",
    role: "Director Audiovisual — Animática",
    summary:
      "Anclajes de consistencia visual, montaje preliminar en 03-storyboard-y-edicion.md (§§1-2) y locución provisional neuronal (scratch_track).",
    mandatoryReferences: [
      "02-guion.md (aprobado en P03_SCRIPT)",
      "03-storyboard-y-edicion.md (secciones §1 Consistencia Visual y §2 Montaje Preliminar)",
      "skills/yts-direccion-edicion/SKILL.md",
    ],
    conditionalReferences: [
      "skills/yts-orquestador/references/herramientas-y-apis.md (para seleccionar motor TTS neuronal y herramientas visuales según estado PROBADA/DOCUMENTADA)",
      "banco-visual.md e identidad-visual.md (si existen en la oficina/canal)",
    ],
    requiredDeliverableEvidence:
      "Secciones §1 Consistencia Visual (anclajes y referencias de continuidad) y §2 Fase 1: Montaje Preliminar completas en 03-storyboard-y-edicion.md más archivo de audio declarado en evidence(scratch_track).",
    verificationBoundary: {
      runtimeDeterministic:
        "El runtime exige que exista el archivo de audio scratch_track no vacío dentro de la carpeta del video y sella las huellas SHA-256 de §§1-2 de 03-storyboard-y-edicion.md.",
      humanEditorial:
        "El creador escucha el Radio Edit / Animatic para validar cadencia, pausas e intención expresiva antes de /yts-approve P05_ANIMATIC.",
    },
  },
  P06_ASSEMBLY: {
    phase: "P06_ASSEMBLY",
    skill: "yts-direccion-edicion",
    role: "Director Audiovisual — Montaje y Master",
    summary:
      "Tabla de escenas sincronizada con bloques [Bxx], las 4 capas de pulido, registro de licencias (04-registro-recursos.md), hoja de aceptación aprobada (/yts-approve-sheet) y medición ffprobe/ffmpeg.",
    mandatoryReferences: [
      "02-guion.md (bloques [Bxx] aprobados)",
      "03-storyboard-y-edicion.md (secciones §3 Tabla de Escenas y §4 Las 4 Capas Obligatorias)",
      "04-registro-recursos.md",
      "aceptacion.json (aprobado antes del render mediante /yts-approve-sheet)",
      "skills/yts-direccion-edicion/SKILL.md",
    ],
    conditionalReferences: [
      "skills/yts-orquestador/references/herramientas-y-apis.md (capacidades FilmCraft MCP y límites de proveedores)",
      "skills/yts-orquestador/references/contingencia-y-politicas-sensibles.md (§3 Copyright vs. Permiso vs. Monetización)",
    ],
    requiredDeliverableEvidence:
      "Tabla de Escenas (§3) con todos los [Bxx] y timecodes sin '← derivar', §4 Capas Obligatorias, 04-registro-recursos.md con licencias y costos verificados, aceptacion.json sellado con /yts-approve-sheet y archivo master medido por ffprobe/ffmpeg.",
    verificationBoundary: {
      runtimeDeterministic:
        "script_storyboard_ids, resource_license_log y master_measurement (con verificación SHA-256 de /yts-approve-sheet) validan trazabilidad de bloques, licencias y parámetros técnicos del master.",
      humanEditorial:
        "El creador inspecciona la narrativa visual, el diseño sonoro y la vigencia real de las licencias antes de /yts-approve P06_ASSEMBLY.",
    },
  },
  P07_CLOSE: {
    phase: "P07_CLOSE",
    skill: "yts-orquestador",
    role: "Orquestador de Entrega y Retención",
    summary:
      "Cierre de métricas y retrospectiva en 05-metricas-retencion.md, ficha de publicación en entregable-final.md y archivo en videos-publicados/.",
    mandatoryReferences: [
      "01-packaging.md (título y miniaturas A/B/C para Prueba y Compara)",
      "04-registro-recursos.md (atribuciones y licencias verificadas)",
      "05-metricas-retencion.md",
      "entregable-final.md",
      "skills/yts-orquestador/SKILL.md",
    ],
    conditionalReferences: [
      "skills/yts-orquestador/references/contingencia-y-politicas-sensibles.md (§6 Plan de Contingencia ante avisos en YouTube Studio)",
      "ideas.md, backlog-ideas.md y banco-de-titulos.md (para volcar aprendizajes al siguiente ciclo)",
    ],
    requiredDeliverableEvidence:
      "05-metricas-retencion.md completo (incluyendo §5 Mejora Única Nombrada y §8 Protocolo de no republicar archivos idénticos) y entregable-final.md con ficha de publicación y especificaciones técnicas verificadas.",
    verificationBoundary: {
      runtimeDeterministic:
        "close_deliverables valida la estructura de 05-metricas-retencion.md y entregable-final.md, y normalized_state solo admite PUBLICADO bajo mis-canales/<canal>/videos-publicados/<video>/ con las 7 fases aprobadas.",
      humanEditorial:
        "El creador ejecuta la subida y Prueba y Compara en YouTube Studio, interpreta las curvas reales de retención y aprueba el cierre con /yts-approve P07_CLOSE.",
    },
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
  productionMode: ProductionMode;
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
    "gobernanza-evidencia.md",
    "registro-tecnicas.md",
  ].map((name) => {
    const full = join(refDir, name);
    return { name, path: full, exists: existsSync(full) };
  });

  const productionMode: ProductionMode = reg?.productionMode ?? "audio_first";

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
    productionMode,
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

  const prodModeLabels: Record<ProductionMode, string> = {
    audio_first: "Audio-First (la voz es la columna vertebral; evidencia P05: scratch_track)",
    screen_first: "Screen-First / Action-First (la interacción en pantalla manda; evidencia P05: screen_recording)",
    speaker_first: "Speaker-First (presentador a cámara A-roll; evidencia P05: speaker_track)",
    music_first: "Music-First / Ambient (la música/atmósfera dicta el ritmo; evidencia P05: music_bed)",
  };

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
    `Flujo audiovisual activo: ${prodModeLabels[resolved.layer3.productionMode] ?? resolved.layer3.productionMode}`,
    `Skill asignada: ${resolved.playbook.skill} (${resolved.playbook.role})`,
    `Foco de la fase: ${resolved.playbook.summary}`,
    `Superficie editable permitida: ${resolved.editableTargets.join("; ")}`,
    `Referencias obligatorias de la fase: ${resolved.playbook.mandatoryReferences.join("; ")}`,
    `Referencias condicionales: ${resolved.playbook.conditionalReferences.join("; ")}`,
    `Constancia de aplicación exigida en el entregable: ${resolved.playbook.requiredDeliverableEvidence}`,
    `Evidencia requerida al enviar: ${evidenceLabel}`,
    `Verificadores deterministas de salida: ${checksLabel}`,
    `Frontera de verificación (Runtime vs. Editorial humano): Runtime=${resolved.playbook.verificationBoundary.runtimeDeterministic} | Editorial=${resolved.playbook.verificationBoundary.humanEditorial}`,
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
