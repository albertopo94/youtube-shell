export type PhaseId =
  | "P01_PACKAGING"
  | "P02_RESEARCH"
  | "P03_SCRIPT"
  | "P04_FACTCHECK"
  | "P05_ANIMATIC"
  | "P06_ASSEMBLY"
  | "P07_CLOSE";

export type StoredStatus =
  | "NO_INICIADO"
  | "EN_CURSO"
  | "BLOQUEADO"
  | "PENDIENTE_APROBACION"
  | "APROBADO";

export type EffectiveStatus = StoredStatus | "OBSOLETO";

export type CheckVerdict = "PASS" | "FAIL" | "WARN" | "NOT_EVALUABLE";

export type Actor =
  | { kind: "agent" }
  | { kind: "creator"; channel: string };

export interface ArtifactRef {
  file: string;
  section?: string;
}

export function refKey(ref: ArtifactRef): string {
  return ref.section ? `${ref.file}#${ref.section}` : ref.file;
}

export type FingerprintResult =
  | { ok: true; hash: string }
  | { ok: false; reason: string };

export interface ArtifactReader {
  fingerprint(ref: ArtifactRef): FingerprintResult;
}

export interface CheckRun {
  id: string;
  result: CheckVerdict;
  details?: string;
}

export interface DeclaredEvidence {
  role: string;
  path: string;
}

export interface FingerprintedArtifact {
  ref: ArtifactRef;
  hash: string;
}

export interface Submission {
  submittedAt: string;
  artifacts: FingerprintedArtifact[];
  evidence: DeclaredEvidence[];
  checks: CheckRun[];
}

export interface Approval {
  actor: { kind: "creator"; channel: string };
  approvedAt: string;
  contractVersion: number;
  artifacts: FingerprintedArtifact[];
  checks: CheckRun[];
  acknowledgedWarnings: string[];
  note?: string;
}

export interface PhaseRecord {
  status: StoredStatus;
  blockReason?: string;
  submission?: Submission;
  approvals: Approval[];
}

export type HistoryEvent =
  | "start"
  | "block"
  | "unblock"
  | "submit"
  | "approve"
  | "request_changes"
  | "reopen";

export interface HistoryEntry {
  at: string;
  phase: PhaseId;
  event: HistoryEvent;
  actor: "agent" | "creator";
  note?: string;
}

export interface Registry {
  schemaVersion: 1;
  contractVersion: 1;
  videoId: string;
  createdAt: string;
  updatedAt: string;
  phases: Record<PhaseId, PhaseRecord>;
  history: HistoryEntry[];
}

export interface Context {
  actor: Actor;
  reader: ArtifactReader;
  now: string;
}

export type Result =
  | { ok: true; registry: Registry }
  | { ok: false; reasons: string[] };
