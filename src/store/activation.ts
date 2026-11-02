import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ACTIVATION_STATES = [
  "NOT_STARTED",
  "PREFLIGHT_FAILED",
  "HOST_STARTED",
  "EXTENSION_NOT_CONFIRMED",
  "EXTENSION_ACTIVATED",
  "RUN_STARTED",
] as const;

export type ActivationState = (typeof ACTIVATION_STATES)[number];

export interface ActivationTransition {
  state: ActivationState;
  at: string;
  detail?: string;
}

export interface ActivationStateRecord {
  schema: "youtube-shell.activation-state/v1";
  state: ActivationState;
  activationId: string;
  launchedViaWrapper: boolean;
  updatedAt: string;
  pid?: number;
  sessionId?: string;
  sequence: ActivationTransition[];
}

export const ACTIVATION_ID_ENV = "YOUTUBE_SHELL_ACTIVATION_ID";

export function activationStatePath(videoDir: string): string {
  return join(videoDir, ".youtube-shell", "runs", "activation-state.json");
}

export function generateActivationId(nowIso: string): string {
  const digits = nowIso.replace(/[^0-9]/g, "");
  const stamp =
    digits.length >= 14 ? `${digits.slice(0, 8)}T${digits.slice(8, 14)}Z` : "19700101T000000Z";
  return `act-${stamp}-${randomBytes(3).toString("hex")}`;
}

export function readActivationState(videoDir: string): ActivationStateRecord | undefined {
  const path = activationStatePath(videoDir);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as ActivationStateRecord;
    if (parsed?.schema !== "youtube-shell.activation-state/v1") return undefined;
    if (!ACTIVATION_STATES.includes(parsed.state)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export interface AdvanceActivationOptions {
  videoDir: string;
  state: ActivationState;
  at: string;
  activationId?: string;
  launchedViaWrapper?: boolean;
  pid?: number;
  sessionId?: string;
  detail?: string;
}

export function advanceActivationState(options: AdvanceActivationOptions): ActivationStateRecord {
  const existing = readActivationState(options.videoDir);
  const record: ActivationStateRecord = {
    schema: "youtube-shell.activation-state/v1",
    state: options.state,
    activationId: options.activationId ?? existing?.activationId ?? generateActivationId(options.at),
    launchedViaWrapper:
      options.launchedViaWrapper ?? existing?.launchedViaWrapper ?? false,
    updatedAt: options.at,
    ...(options.pid !== undefined ? { pid: options.pid } : existing?.pid !== undefined ? { pid: existing.pid } : {}),
    ...(options.sessionId ? { sessionId: options.sessionId } : existing?.sessionId ? { sessionId: existing.sessionId } : {}),
    sequence: [
      ...(existing?.sequence ?? []),
      { state: options.state, at: options.at, ...(options.detail ? { detail: options.detail } : {}) },
    ],
  };

  const target = activationStatePath(options.videoDir);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return record;
}

export interface ActivationDiagnosis {
  state: ActivationState;
  launchedViaWrapper: boolean;
  conclusion: string;
}

/**
 * Diagnose whether the harness really took over the host. A wrapper launch that never
 * reached EXTENSION_ACTIVATED means pi started but the extension never confirmed itself,
 * which is reported as EXTENSION_NOT_CONFIRMED instead of assuming success.
 */
export function diagnoseActivationState(
  videoDir: string,
  options: { now?: string; hostStartedViaWrapper?: boolean } = {},
): ActivationDiagnosis | undefined {
  const existing = readActivationState(videoDir);
  const viaWrapper = options.hostStartedViaWrapper ?? existing?.launchedViaWrapper ?? false;

  if (!existing) {
    if (!viaWrapper) return undefined;
    const at = options.now ?? new Date().toISOString();
    const recorded = advanceActivationState({
      videoDir,
      state: "EXTENSION_NOT_CONFIRMED",
      at,
      launchedViaWrapper: true,
      detail: "pi lanzado mediante youtube-shell sin confirmación de la extensión",
    });
    return {
      state: recorded.state,
      launchedViaWrapper: true,
      conclusion:
        "EXTENSION_NOT_CONFIRMED: el lanzador inició pi pero la extensión nunca confirmó su carga.",
    };
  }

  if (
    existing.launchedViaWrapper &&
    (existing.state === "HOST_STARTED" || existing.state === "PREFLIGHT_FAILED")
  ) {
    const nextState: ActivationState =
      existing.state === "PREFLIGHT_FAILED" ? "PREFLIGHT_FAILED" : "EXTENSION_NOT_CONFIRMED";
    const at = options.now ?? new Date().toISOString();
    const recorded = advanceActivationState({
      videoDir,
      state: nextState,
      at,
      activationId: existing.activationId,
      launchedViaWrapper: true,
      detail:
        nextState === "EXTENSION_NOT_CONFIRMED"
          ? "host iniciado vía youtube-shell sin evidencia de carga de la extensión"
          : existing.sequence.find((s) => s.state === "PREFLIGHT_FAILED")?.detail,
    });
    return {
      state: recorded.state,
      launchedViaWrapper: true,
      conclusion:
        nextState === "EXTENSION_NOT_CONFIRMED"
          ? "EXTENSION_NOT_CONFIRMED: pi se lanzó mediante youtube-shell pero la extensión no confirmó activación."
          : "PREFLIGHT_FAILED: el lanzador detectó un harness incompleto antes de lanzar pi.",
    };
  }

  return {
    state: existing.state,
    launchedViaWrapper: existing.launchedViaWrapper,
    conclusion: `Estado de activación: ${existing.state}`,
  };
}
