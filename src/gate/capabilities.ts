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

export const EFFECTCRAFT_MCP_CAPABILITIES: readonly ToolCapabilityEntry[] = [
  // Read-only EffectCraft 0.11.1 inspection tools (bare and prefixed)
  ...([
    "describe_command",
    "get_project",
    "get_comp",
    "get_layer",
    "get_property",
    "list_effects",
    "list_fonts",
    "get_state",
    "history",
  ] as const).flatMap(
    (id): ToolCapabilityEntry[] => [
      {
        id,
        capability: "read",
        allowedPhases: "ALL",
        requiresHumanConfirmation: false,
        evidenceStatus: "documentada",
      },
      {
        id: `effectcraft_${id}`,
        capability: "read",
        allowedPhases: "ALL",
        requiresHumanConfirmation: false,
        evidenceStatus: "documentada",
      },
    ],
  ),
  // Prefixed read-only tools shared with FilmCraft
  ...([
    "command_list",
    "doc_inspect",
    "render_frame",
    "render_preview",
  ] as const).map(
    (id): ToolCapabilityEntry => ({
      id: `effectcraft_${id}`,
      capability: "read",
      allowedPhases: "ALL",
      requiresHumanConfirmation: false,
      evidenceStatus: "documentada",
    }),
  ),
  // Headless motion graphics & compositing operations (gated to P05_ANIMATIC / P06_ASSEMBLY)
  ...([
    "execute_command",
    "set_property",
    "add_keyframe",
    "add_effect",
    "open_project",
    "save_project",
    "undo",
    "redo",
    "batch",
  ] as const).flatMap(
    (id): ToolCapabilityEntry[] => [
      {
        id,
        capability: "render",
        allowedPhases: ["P05_ANIMATIC", "P06_ASSEMBLY"],
        requiresHumanConfirmation: false,
        evidenceStatus: "documentada",
        validationMethod: "effectcraft_command_guard",
      },
      {
        id: `effectcraft_${id}`,
        capability: "render",
        allowedPhases: ["P05_ANIMATIC", "P06_ASSEMBLY"],
        requiresHumanConfirmation: false,
        evidenceStatus: "documentada",
        validationMethod: "effectcraft_command_guard",
      },
    ],
  ),
  // Prefixed headless operations shared with FilmCraft
  ...([
    "command_run",
    "command_batch",
  ] as const).map(
    (id): ToolCapabilityEntry => ({
      id: `effectcraft_${id}`,
      capability: "render",
      allowedPhases: ["P05_ANIMATIC", "P06_ASSEMBLY"],
      requiresHumanConfirmation: false,
      evidenceStatus: "documentada",
      validationMethod: "effectcraft_command_guard",
    }),
  ),
  // Sensitive JSX script evaluation (requires P06_ASSEMBLY and explicit human confirmation)
  ...(["run_script", "script_ui"] as const).flatMap(
    (id): ToolCapabilityEntry[] => [
      {
        id,
        capability: "render",
        allowedPhases: ["P06_ASSEMBLY"],
        requiresHumanConfirmation: true,
        evidenceStatus: "documentada",
        validationMethod: "effectcraft_command_guard",
      },
      {
        id: `effectcraft_${id}`,
        capability: "render",
        allowedPhases: ["P06_ASSEMBLY"],
        requiresHumanConfirmation: true,
        evidenceStatus: "documentada",
        validationMethod: "effectcraft_command_guard",
      },
    ],
  ),
];

export const SOUNDCRAFT_MCP_CAPABILITIES: readonly ToolCapabilityEntry[] = [
  // Read-only SoundCraft 0.8.0 inspection tools (bare and prefixed)
  ...([
    "inspect_session",
    "parity",
    "screenshot",
  ] as const).flatMap(
    (id): ToolCapabilityEntry[] => [
      {
        id,
        capability: "read",
        allowedPhases: "ALL",
        requiresHumanConfirmation: false,
        evidenceStatus: "documentada",
      },
      {
        id: `soundcraft_${id}`,
        capability: "read",
        allowedPhases: "ALL",
        requiresHumanConfirmation: false,
        evidenceStatus: "documentada",
      },
    ],
  ),
  // Prefixed read-only tools that share names
  ...([
    "list_commands",
    "ui_inspect",
  ] as const).map(
    (id): ToolCapabilityEntry => ({
      id: `soundcraft_${id}`,
      capability: "read",
      allowedPhases: "ALL",
      requiresHumanConfirmation: false,
      evidenceStatus: "documentada",
    }),
  ),
  // Headless multitrack audio operations (gated to P06_ASSEMBLY)
  ...([
    "execute",
    "new_session",
    "open_session",
    "save_session",
    "import_audio",
    "bounce_mix",
  ] as const).flatMap(
    (id): ToolCapabilityEntry => [
      {
        id,
        capability: "render",
        allowedPhases: ["P06_ASSEMBLY"],
        requiresHumanConfirmation: false,
        evidenceStatus: "documentada",
        validationMethod: "soundcraft_command_guard",
      },
      {
        id: `soundcraft_${id}`,
        capability: "render",
        allowedPhases: ["P06_ASSEMBLY"],
        requiresHumanConfirmation: false,
        evidenceStatus: "documentada",
        validationMethod: "soundcraft_command_guard",
      },
    ],
  ),
  // Prefixed batch tool for SoundCraft
  {
    id: "soundcraft_batch",
    capability: "render",
    allowedPhases: ["P06_ASSEMBLY"],
    requiresHumanConfirmation: false,
    evidenceStatus: "documentada",
    validationMethod: "soundcraft_command_guard",
  },
  // Desktop bridge UI controls (require active P06_ASSEMBLY + human confirmation)
  ...(["ui_set", "menu_invoke", "click", "drag", "key"] as const).flatMap(
    (id): ToolCapabilityEntry[] => [
      {
        id,
        capability: "render",
        allowedPhases: ["P06_ASSEMBLY"],
        requiresHumanConfirmation: true,
        evidenceStatus: "documentada",
      },
      {
        id: `soundcraft_${id}`,
        capability: "render",
        allowedPhases: ["P06_ASSEMBLY"],
        requiresHumanConfirmation: true,
        evidenceStatus: "documentada",
      },
    ],
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
  ...EFFECTCRAFT_MCP_CAPABILITIES,
  ...SOUNDCRAFT_MCP_CAPABILITIES,
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
