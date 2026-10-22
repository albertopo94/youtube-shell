import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  evaluateMasterAcceptance,
  measureMasterFile,
  PILOT_ARCHIVED_METRICS,
  type AcceptanceSheet,
  type MediaMetrics,
} from "../src/checks/media-measurement.ts";

test("pilot negative fixture: fails loudness (-17.5 vs -23 LUFS) and 3-track mix, while ducking without music is NOT_EVALUABLE", () => {
  const preRenderSheet: AcceptanceSheet = {
    schemaVersion: 1,
    videoId: "01-olvido-activo-microglia",
    approvedBy: "creador",
    approvedAt: "2026-10-21T16:00:00Z",
    approvedBeforeRender: true,
    loudness: {
      targetLufs: -23,
      toleranceLu: 2,
      maxTruePeakDbtp: -1.5,
    },
    audioMix: {
      requiredTracks: 3,
      requireDucking: true,
    },
    maxBlackFrames: 0,
    maxSilenceSec: 1.0,
    pacing: {
      maxAverageShotSec: 7.0,
    },
  };

  const report = evaluateMasterAcceptance(PILOT_ARCHIVED_METRICS, preRenderSheet, {
    masterCreatedAt: "2026-10-21T16:30:00Z",
  });

  assert.equal(report.result, "FAIL");
  const byId = new Map(report.checks.map((c) => [c.id, c]));

  assert.equal(byId.get("acceptance_sheet_validity")?.result, "PASS");
  assert.equal(byId.get("container_integrity")?.result, "PASS");
  assert.equal(byId.get("loudness_target")?.result, "FAIL");
  assert.match(byId.get("loudness_target")?.details ?? "", /-17\.5/);
  assert.equal(byId.get("multi_track_mix")?.result, "FAIL");
  assert.equal(byId.get("audio_ducking")?.result, "NOT_EVALUABLE");
  assert.match(byId.get("audio_ducking")?.details ?? "", /música/i);
  assert.equal(byId.get("black_frames")?.result, "PASS");
  assert.equal(byId.get("silence_gaps")?.result, "PASS");
  assert.equal(byId.get("visual_pacing")?.result, "FAIL");
  assert.match(byId.get("visual_pacing")?.details ?? "", /41\.19/);
});

test("without a versioned pre-render acceptance sheet, rules return NOT_EVALUABLE instead of invented verdicts", () => {
  const report = evaluateMasterAcceptance(PILOT_ARCHIVED_METRICS, null);
  assert.equal(report.result, "NOT_EVALUABLE");
  for (const check of report.checks) {
    if (check.id !== "container_integrity") {
      assert.equal(check.result, "NOT_EVALUABLE");
    }
  }
});

test("post-hoc acceptance sheet written after the master render fails acceptance_sheet_validity", () => {
  // Reproduces the 2026-10-21 pilot audit finding: rule written 28 minutes AFTER the render
  const postHocSheet: AcceptanceSheet = {
    schemaVersion: 1,
    videoId: "01-olvido-activo-microglia",
    approvedBy: "creador",
    approvedAt: "2026-10-21T16:58:00Z",
    approvedBeforeRender: true,
    loudness: {
      targetLufs: -17.5,
      toleranceLu: 2,
      maxTruePeakDbtp: -1.0,
    },
  };

  const report = evaluateMasterAcceptance(PILOT_ARCHIVED_METRICS, postHocSheet, {
    masterCreatedAt: "2026-10-21T16:30:00Z",
  });

  assert.equal(report.result, "FAIL");
  const validity = report.checks.find((c) => c.id === "acceptance_sheet_validity");
  assert.equal(validity?.result, "FAIL");
  assert.match(validity?.details ?? "", /después del render|posterior/i);
});

test("single AAC stream in MP4 without stems or timeline evidence is NOT_EVALUABLE for 3-track requirement", () => {
  const mp4OnlyMetrics: MediaMetrics = {
    ...PILOT_ARCHIVED_METRICS,
    integratedLufs: -23.0,
    truePeakDbtp: -3.0,
    declaredTimelineTracks: undefined,
    hasMusicTrack: undefined,
    hasSfxTrack: undefined,
  };

  const sheet: AcceptanceSheet = {
    schemaVersion: 1,
    videoId: "01-video",
    approvedBy: "creador",
    approvedAt: "2026-10-21T10:00:00Z",
    approvedBeforeRender: true,
    loudness: { targetLufs: -23, toleranceLu: 2, maxTruePeakDbtp: -1.5 },
    audioMix: { requiredTracks: 3 },
  };

  const report = evaluateMasterAcceptance(mp4OnlyMetrics, sheet);
  const mixCheck = report.checks.find((c) => c.id === "multi_track_mix");
  assert.equal(mixCheck?.result, "NOT_EVALUABLE");
  assert.equal(report.result, "NOT_EVALUABLE");
});

test("pre-approved creative exception in acceptance sheet yields WARN instead of FAIL", () => {
  const contemplativeMetrics: MediaMetrics = {
    ...PILOT_ARCHIVED_METRICS,
    integratedLufs: -23.0,
    truePeakDbtp: -2.5,
    declaredTimelineTracks: 3,
    hasMusicTrack: true,
    hasSfxTrack: true,
    duckingVerified: true,
    durationSec: 120,
    visualSegments: 10, // 12s average shot (> 5s default)
  };

  const sheetWithException: AcceptanceSheet = {
    schemaVersion: 1,
    videoId: "02-ensayo-contemplativo",
    approvedBy: "creador",
    approvedAt: "2026-10-21T10:00:00Z",
    approvedBeforeRender: true,
    loudness: { targetLufs: -23, toleranceLu: 2, maxTruePeakDbtp: -1.5 },
    audioMix: { requiredTracks: 3, requireDucking: true },
    pacing: { maxAverageShotSec: 5.0 },
    exceptions: {
      pacing: {
        reason: "Bloque de payoff emocional contemplativo; la quietud visual es el recurso narrativo.",
        approvedBy: "creador",
      },
    },
  };

  const report = evaluateMasterAcceptance(contemplativeMetrics, sheetWithException);
  const pacingCheck = report.checks.find((c) => c.id === "visual_pacing");
  assert.equal(pacingCheck?.result, "WARN");
  assert.equal(report.result, "WARN");
});

test("measureMasterFile runs real ffprobe and ffmpeg (execFileSync, no shell) on a local MP4 and evaluates acceptance", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-media-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const masterPath = join(tmp, "sample-master.mp4");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=320x180:r=24:d=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=2",
      "-af",
      "volume=-18dB",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      masterPath,
    ],
    { stdio: "ignore" },
  );

  const measured = measureMasterFile(masterPath);
  assert.equal(measured.ok, true);
  if (!measured.ok) return;

  assert.equal(measured.metrics.videoStreams, 1);
  assert.equal(measured.metrics.audioStreams, 1);
  assert.equal(measured.metrics.videoCodec, "h264");
  assert.equal(measured.metrics.audioCodec, "aac");
  assert.ok(measured.metrics.durationSec >= 1.8 && measured.metrics.durationSec <= 2.2);
  assert.equal(typeof measured.metrics.integratedLufs, "number");
  assert.equal(typeof measured.metrics.truePeakDbtp, "number");
  assert.equal(measured.metrics.blackFrameCount, 0);

  const sheet: AcceptanceSheet = {
    schemaVersion: 1,
    videoId: "sample-video",
    approvedBy: "creador",
    approvedAt: "2020-01-01T00:00:00Z",
    approvedBeforeRender: true,
    loudness: {
      targetLufs: measured.metrics.integratedLufs,
      toleranceLu: 3.0,
      maxTruePeakDbtp: 0,
    },
    maxBlackFrames: 0,
  };

  const evalReport = evaluateMasterAcceptance(measured.metrics, sheet);
  assert.equal(evalReport.result, "PASS");
});
