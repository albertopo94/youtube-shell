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
}

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
    id: "yts_transition",
    capability: "state_control",
    allowedPhases: "ALL",
    requiresHumanConfirmation: false,
    evidenceStatus: "probada",
    validationMethod: "state_machine",
  },
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
