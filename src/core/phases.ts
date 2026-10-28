import { PREAMBLE } from "./sections.ts";
import type { PhaseId, ProductionMode } from "./types.ts";

export const CONTRACT_VERSION = 1;

export type { ProductionMode };

export interface PhaseDocumentSpec {
  file: string;
  sections?: string[];
}

export interface PhaseEvidenceSpec {
  role: string;
  description: string;
}

export interface EvidenceRoleDefinition {
  primaryRole: string;
  aliases: string[];
  description: string;
}

export const P05_EVIDENCE_BY_MODE: Record<ProductionMode, EvidenceRoleDefinition> = {
  audio_first: {
    primaryRole: "scratch_track",
    aliases: ["scratch_track", "radio_edit", "scratch_voice"],
    description: "Locución de prueba / radio edit",
  },
  screen_first: {
    primaryRole: "screen_recording",
    aliases: ["screen_recording", "screencast_raw", "action_draft"],
    description: "Grabación preliminar de pantalla / captura de acción",
  },
  speaker_first: {
    primaryRole: "speaker_track",
    aliases: ["speaker_track", "a_roll_take", "presenter_audio"],
    description: "Toma de referencia o A-roll de presentador",
  },
  music_first: {
    primaryRole: "music_bed",
    aliases: ["music_bed", "soundtrack_draft", "ambient_track"],
    description: "Pista musical guía / maqueta sonora",
  },
};

export function detectProductionMode(content: string): ProductionMode {
  const match = /Flujo Audiovisual seleccionado:\*\*\s*(.+)$/im.exec(content);
  if (match) {
    const line = match[1];
    if (/\[x\]\s*(Screen-First|Action-First)/i.test(line)) return "screen_first";
    if (/\[x\]\s*(Speaker-First|A-Roll)/i.test(line)) return "speaker_first";
    if (/\[x\]\s*(Music-First|Ambient)/i.test(line)) return "music_first";
    if (/\[x\]\s*Audio-First/i.test(line)) return "audio_first";
  }

  const directMatch = /\*\*(Modo de producci[oó]n|Flujo audiovisual):\*\*\s*`?([A-Za-z_-]+)`?/i.exec(content);
  if (directMatch) {
    const val = directMatch[2].toLowerCase();
    if (val.includes("screen") || val.includes("action")) return "screen_first";
    if (val.includes("speaker") || val.includes("roll")) return "speaker_first";
    if (val.includes("music") || val.includes("ambient")) return "music_first";
    if (val.includes("audio")) return "audio_first";
  }

  return "audio_first";
}

export function getPhaseEvidence(
  id: PhaseId,
  mode: ProductionMode = "audio_first",
): PhaseEvidenceSpec[] {
  if (id === "P05_ANIMATIC") {
    const spec = P05_EVIDENCE_BY_MODE[mode] ?? P05_EVIDENCE_BY_MODE.audio_first;
    return [{ role: spec.primaryRole, description: spec.description }];
  }
  return getPhase(id).evidence;
}

export function isAllowedEvidenceRole(
  phaseId: PhaseId,
  role: string,
  mode: ProductionMode = "audio_first",
): boolean {
  if (phaseId === "P05_ANIMATIC") {
    const spec = P05_EVIDENCE_BY_MODE[mode] ?? P05_EVIDENCE_BY_MODE.audio_first;
    return spec.aliases.includes(role);
  }
  const def = getPhase(phaseId);
  return def.evidence.some((e) => e.role === role);
}

export interface PhaseDefinition {
  id: PhaseId;
  name: string;
  requires: PhaseId[];
  documents: PhaseDocumentSpec[];
  evidence: PhaseEvidenceSpec[];
  checks: string[];
  checkpointLabel: string;
}

export const PHASE_IDS: PhaseId[] = [
  "P01_PACKAGING",
  "P02_RESEARCH",
  "P03_SCRIPT",
  "P04_FACTCHECK",
  "P05_ANIMATIC",
  "P06_ASSEMBLY",
  "P07_CLOSE",
];

export const PHASES: PhaseDefinition[] = [
  {
    id: "P01_PACKAGING",
    name: "Packaging",
    requires: [],
    documents: [{ file: "01-packaging.md" }],
    evidence: [],
    checks: ["packaging_structure"],
    checkpointLabel: "Aprobado por creador",
  },
  {
    id: "P02_RESEARCH",
    name: "Investigación previa",
    requires: ["P01_PACKAGING"],
    documents: [
      {
        file: "06-fuentes-y-verificacion.md",
        sections: [PREAMBLE, "Parte 1"],
      },
    ],
    evidence: [],
    checks: ["research_sources_structure"],
    checkpointLabel: "Verificado",
  },
  {
    id: "P03_SCRIPT",
    name: "Guion y originalidad",
    requires: ["P02_RESEARCH"],
    documents: [{ file: "02-guion.md" }],
    evidence: [],
    checks: ["script_block_ids"],
    checkpointLabel: "Aprobado por creador",
  },
  {
    id: "P04_FACTCHECK",
    name: "Fact-checking del borrador",
    requires: ["P03_SCRIPT"],
    documents: [
      {
        file: "06-fuentes-y-verificacion.md",
        sections: ["Parte 2", "Checkpoints de Rigor"],
      },
    ],
    evidence: [],
    checks: ["factcheck_resolved"],
    checkpointLabel: "Verificado",
  },
  {
    id: "P05_ANIMATIC",
    name: "Animatic y scratch",
    requires: ["P04_FACTCHECK"],
    documents: [
      {
        file: "03-storyboard-y-edicion.md",
        sections: ["Consistencia Visual", "Montaje Preliminar"],
      },
    ],
    evidence: [{ role: "scratch_track", description: "Locución de prueba / radio edit" }],
    checks: [],
    checkpointLabel: "Aprobado por creador",
  },
  {
    id: "P06_ASSEMBLY",
    name: "Montaje y licencias",
    requires: ["P05_ANIMATIC"],
    documents: [
      {
        file: "03-storyboard-y-edicion.md",
        sections: ["Tabla de Escenas", "Capas Obligatorias"],
      },
      { file: "04-registro-recursos.md" },
    ],
    evidence: [
      { role: "master", description: "Render master candidato" },
      { role: "acceptance_sheet", description: "Hoja de aceptación previa al render" },
    ],
    checks: ["script_storyboard_ids", "resource_license_log", "master_measurement"],
    checkpointLabel: "Inspeccionado",
  },
  {
    id: "P07_CLOSE",
    name: "Publicación y cierre",
    requires: ["P06_ASSEMBLY"],
    documents: [
      { file: "05-metricas-retencion.md" },
      { file: "entregable-final.md" },
    ],
    evidence: [],
    checks: ["close_deliverables"],
    checkpointLabel: "Publicado en Studio",
  },
];

const BY_ID = new Map<PhaseId, PhaseDefinition>(PHASES.map((p) => [p.id, p]));

export function getPhase(id: PhaseId): PhaseDefinition {
  const found = BY_ID.get(id);
  if (!found) {
    throw new Error(`Fase desconocida: ${id}`);
  }
  return found;
}
