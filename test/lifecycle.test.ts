import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendLifecycleEvent,
  buildLifecycleTimeline,
  formatLifecycleTimeline,
  HUMAN_COMMAND_LIFECYCLE_KINDS,
  lifecyclePath,
  readLifecycleEvents,
} from "../src/store/lifecycle.ts";

test("S4 §4.B: lifecycle.jsonl appends human commands durably, tolerates corrupted lines, and builds a unified chronology", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-lifecycle-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  assert.equal(existsSync(lifecyclePath(tmp)), false);

  appendLifecycleEvent(tmp, {
    at: "2026-11-01T14:00:00Z",
    kind: "human_command",
    command: "/yts-init",
  });
  appendLifecycleEvent(tmp, {
    at: "2026-11-01T14:05:00Z",
    kind: "human_command",
    command: "/yts-approve P01_PACKAGING",
    phaseId: "P01_PACKAGING",
    runId: "run-20261101T140400Z-aabbcc",
  });

  // Corrupted line in the middle must not destroy the valid events around it.
  const path = lifecyclePath(tmp);
  writeFileSync(path, `${readFileSync(path, "utf8")}{not-json\n`, "utf8");
  appendLifecycleEvent(tmp, {
    at: "2026-11-01T14:09:00Z",
    kind: "human_command",
    command: "/yts-reject P02_RESEARCH",
    phaseId: "P02_RESEARCH",
  });

  const events = readLifecycleEvents(tmp);
  assert.equal(events.length, 3, "corrupted line skipped, valid events recovered");
  assert.equal(events[0].command, "/yts-init");
  assert.equal(events[2].phaseId, "P02_RESEARCH");

  const timeline = buildLifecycleTimeline(events, [
    {
      runId: "run-20261101T140400Z-aabbcc",
      startedAt: "2026-11-01T14:04:00Z",
      targetPhase: "P01_PACKAGING",
      status: "PASSED",
    },
  ]);

  // Unified chronology must interleave agent run and human commands in time order:
  // init -> run -> approve -> reject
  assert.deepEqual(
    timeline.map((e) => e.source),
    ["human_command", "agent_run", "human_command", "human_command"],
  );
  assert.match(timeline[1].label, /run-20261101T140400Z-aabbcc.*P01_PACKAGING.*PASSED/);
  assert.match(formatLifecycleTimeline(timeline), /Cronología de producción \(agente \+ creador\)/);

  // The six human command kinds are the only ones the lifecycle recorders will emit.
  assert.deepEqual(HUMAN_COMMAND_LIFECYCLE_KINDS, [
    "yts_init",
    "yts_approve",
    "yts_reject",
    "yts_approve_sheet",
    "yts_mode",
    "yts_link",
  ]);
});

test("S4 §4.B: buildLifecycleTimeline is stable and empty-safe", () => {
  assert.equal(buildLifecycleTimeline([], []).length, 0);
  assert.match(formatLifecycleTimeline([]), /Sin cronología/);

  const single = buildLifecycleTimeline(
    [{ at: "2026-11-01T09:00:00Z", kind: "note", detail: "Publicación registrada" }],
    [],
  );
  assert.equal(single[0].source, "note");
  assert.match(formatLifecycleTimeline(single), /Publicación registrada/);
});
