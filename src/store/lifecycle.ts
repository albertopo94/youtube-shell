import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const HUMAN_COMMAND_LIFECYCLE_KINDS = [
  "yts_init",
  "yts_approve",
  "yts_reject",
  "yts_approve_sheet",
  "yts_mode",
  "yts_link",
] as const;

export type HumanCommandKind = (typeof HUMAN_COMMAND_LIFECYCLE_KINDS)[number];

export interface LifecycleEvent {
  at: string;
  kind: "human_command" | "note";
  command?: string;
  phaseId?: string;
  runId?: string;
  detail?: string;
}

export function lifecyclePath(videoDir: string): string {
  return join(videoDir, ".youtube-shell", "runs", "lifecycle.jsonl");
}

/**
 * Durable append to the unified human/agent chronology. Human commands are the events the
 * agent cannot emit itself; persisting them makes `/yts-audit` reconstruct the full sequence:
 * run -> checks -> submit -> human inspection -> approval/reject -> next run -> publication.
 */
export function appendLifecycleEvent(videoDir: string, event: LifecycleEvent): void {
  if (!existsSync(videoDir)) return;
  const target = lifecyclePath(videoDir);
  mkdirSync(dirname(target), { recursive: true });
  const fd = openSync(target, "a", 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(event)}\n`, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Line-by-line tolerant read: corrupted lines are skipped, valid ones always recovered. */
export function readLifecycleEvents(videoDir: string): LifecycleEvent[] {
  const path = lifecyclePath(videoDir);
  if (!existsSync(path)) return [];
  const events: LifecycleEvent[] = [];
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as LifecycleEvent;
      if (parsed && typeof parsed.at === "string" && typeof parsed.kind === "string") {
        events.push(parsed);
      }
    } catch {
      // Skip corrupted line; never lose the valid ones around it.
    }
  }
  return events;
}

export interface TimelineEntry {
  at: string;
  source: "agent_run" | "human_command" | "note";
  label: string;
  runId?: string;
  phaseId?: string;
}

/**
 * Merge human lifecycle events with settled agent runs into one chronological timeline
 * used by /yts-runs, /yts-audit and youtube-shell --runs/--audit.
 */
export function buildLifecycleTimeline(
  lifecycleEvents: readonly LifecycleEvent[],
  manifests: readonly Array<{ runId: string; startedAt: string; targetPhase: string; status: string }>,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const m of manifests) {
    entries.push({
      at: m.startedAt,
      source: "agent_run",
      label: `Ejecución ${m.runId} sobre ${m.targetPhase} — ${m.status}`,
      runId: m.runId,
      phaseId: m.targetPhase,
    });
  }

  for (const ev of lifecycleEvents) {
    if (ev.kind === "human_command") {
      entries.push({
        at: ev.at,
        source: "human_command",
        label: `Creador: ${ev.command}${ev.phaseId ? ` (${ev.phaseId})` : ""}`,
        ...(ev.runId ? { runId: ev.runId } : {}),
        ...(ev.phaseId ? { phaseId: ev.phaseId } : {}),
      });
    } else if (ev.detail) {
      entries.push({
        at: ev.at,
        source: "note",
        label: ev.detail,
        ...(ev.runId ? { runId: ev.runId } : {}),
      });
    }
  }

  entries.sort((a, b) => a.at.localeCompare(b.at));
  return entries;
}

export function formatLifecycleTimeline(entries: readonly TimelineEntry[]): string {
  if (entries.length === 0) return "Sin cronología registrada.";
  const lines = entries.map((e) => `- [${e.at}] (${e.source}) ${e.label}`);
  return ["Cronología de producción (agente + creador):", ...lines].join("\n");
}
