import type { PhaseId } from "../core/types.ts";

export type ToolCapability =
  | "read"
  | "research"
  | "write_artifact"
  | "render"
  | "measure"
  | "publish"
  | "delete"
  | "paid_action"
  | "state_control";

export interface ToolCapabilityEntry {
  id: string;
  capability: ToolCapability;
  allowedPhases: PhaseId[] | "ALL" | "ANY_ACTIVE";
  requiresHumanConfirmation: boolean;
  evidenceStatus: "documentada" | "probada";
  validationMethod?: string;
  readOnly?: boolean;
}

export function isReadOnlyCapability(entry: ToolCapabilityEntry): boolean {
  if (typeof entry.readOnly === "boolean") {
    return entry.readOnly;
  }
  return (
    entry.capability === "read" ||
    entry.capability === "research" ||
    entry.capability === "measure"
  );
}

export const FILMCRAFT_MCP_CAPABILITIES: readonly ToolCapabilityEntry[] = [
  // Read-only FilmCraft 0.9.0 inspection tools
  ...([
    "command_list",
    "doc_inspect",
    "project_inspect",
    "sequence_inspect",
    "render_frame",
    "render_preview",
    "ui_elements",
    "ui_inspect",
    "ui_screenshot",
  ] as const).map(
    (id): ToolCapabilityEntry => ({
      id,
      capability: "read",
      allowedPhases: "ALL",
      requiresHumanConfirmation: false,
      evidenceStatus: "probada",
    }),
  ),
  // Headless timeline & render operations (gated to P05_ANIMATIC / P06_ASSEMBLY + command/path guard)
  ...(["media_import", "command_run", "command_batch"] as const).map(
    (id): ToolCapabilityEntry => ({
      id,
      capability: "render",
      allowedPhases: ["P05_ANIMATIC", "P06_ASSEMBLY"],
      requiresHumanConfirmation: false,
      evidenceStatus: "probada",
      validationMethod: "filmcraft_command_guard",
    }),
  ),
  // Live desktop bridge UI controls (require active assembly phase + human confirmation)
  ...(["ui_click", "ui_control", "ui_drag", "ui_key", "ui_type"] as const).map(
    (id): ToolCapabilityEntry => ({
      id,
      capability: "render",
      allowedPhases: ["P05_ANIMATIC", "P06_ASSEMBLY"],
      requiresHumanConfirmation: true,
      evidenceStatus: "documentada",
    }),
  ),
];

export const DEFAULT_CAPABILITIES: readonly ToolCapabilityEntry[] = [
  {
    id: "read",
    capability: "read",
    allowedPhases: "ALL",
    requiresHumanConfirmation: false,
    evidenceStatus: "probada",
  },
  {
    id: "write",
    capability: "write_artifact",
    allowedPhases: "ANY_ACTIVE",
    requiresHumanConfirmation: false,
    evidenceStatus: "probada",
    validationMethod: "sha256_section_fingerprint",
  },
  {
    id: "edit",
    capability: "write_artifact",
    allowedPhases: "ANY_ACTIVE",
    requiresHumanConfirmation: false,
    evidenceStatus: "probada",
    validationMethod: "sha256_section_fingerprint",
  },
  {
    id: "yts_status",
    capability: "read",
    allowedPhases: "ALL",
    requiresHumanConfirmation: false,
    evidenceStatus: "probada",
  },
  {
    id: "yts_check_contract",
    capability: "read",
    allowedPhases: "ALL",
    requiresHumanConfirmation: false,
    evidenceStatus: "probada",
    validationMethod: "contract_checker",
  },
  {
    id: "yts_measure_master",
    capability: "measure",
    allowedPhases: "ALL",
    requiresHumanConfirmation: false,
    evidenceStatus: "probada",
    validationMethod: "ffprobe_ffmpeg_loudnorm",
  },
  {
    id: "yts_transition",
    capability: "state_control",
    allowedPhases: "ALL",
    requiresHumanConfirmation: false,
    evidenceStatus: "probada",
    validationMethod: "state_machine",
  },
  ...FILMCRAFT_MCP_CAPABILITIES,
];

export function buildCapabilityCatalog(
  extra: readonly ToolCapabilityEntry[] = [],
): Map<string, ToolCapabilityEntry> {
  const map = new Map<string, ToolCapabilityEntry>();
  for (const entry of [...DEFAULT_CAPABILITIES, ...extra]) {
    if (entry.id === "bash") {
      throw new Error("El shell arbitrario (bash) no puede registrarse en el catálogo de producción.");
    }
    map.set(entry.id, entry);
  }
  return map;
}
