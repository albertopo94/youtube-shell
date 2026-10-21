import { PREAMBLE } from "./sections.ts";
import type { PhaseId } from "./types.ts";

export const CONTRACT_VERSION = 1;

export interface PhaseDocumentSpec {
  file: string;
  sections?: string[];
}

export interface PhaseEvidenceSpec {
  role: string;
  description: string;
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
    checks: [],
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
    checks: [],
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
    checks: ["script_storyboard_ids", "master_measurement"],
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
    checks: [],
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
