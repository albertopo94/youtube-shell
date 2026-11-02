import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  PI_SUBCOMMANDS,
  buildPiInvocation,
  parseLauncherArgs,
  prepareIsolatedHome,
  recordLauncherActivation,
  resolveAgentHome,
  resolvePiBinary,
  verifyHarnessPreflight,
} from "../src/cli/launcher.ts";
import { advanceActivationState, diagnoseActivationState, readActivationState } from "../src/store/activation.ts";
import { reconcileOrphanedRuns } from "../src/store/run-ledger.ts";

const ROOT = join(import.meta.dirname, "..");

test("parseLauncherArgs extracts launcher flags, detects pi subcommands, and preserves passthrough args", () => {
  assert.ok(PI_SUBCOMMANDS.includes("mcp"));
  assert.ok(PI_SUBCOMMANDS.includes("auth"));

  const basic = parseLauncherArgs(["--print", "Hola"]);
  assert.equal(basic.help, false);
  assert.equal(basic.version, false);
  assert.equal(basic.link, false);
  assert.equal(basic.home, undefined);
  assert.equal(basic.piSubcommand, undefined);
  assert.deepEqual(basic.passthrough, ["--print", "Hola"]);

  const withHome = parseLauncherArgs(["--home", "/tmp/custom-yts", "-p", "Test"]);
  assert.equal(withHome.home, "/tmp/custom-yts");
  assert.deepEqual(withHome.passthrough, ["-p", "Test"]);

  const withHomeEq = parseLauncherArgs(["--home=/tmp/eq-yts", "--link", "--version", "-h"]);
  assert.equal(withHomeEq.home, "/tmp/eq-yts");
  assert.equal(withHomeEq.link, true);
  assert.equal(withHomeEq.version, true);
  assert.equal(withHomeEq.help, true);

  const sub = parseLauncherArgs(["mcp", "list"]);
  assert.equal(sub.piSubcommand, "mcp");
  assert.deepEqual(sub.passthrough, ["mcp", "list"]);
});

test("resolveAgentHome selects isolated, link, or custom home deterministically", () => {
  const homedir = "/Users/creator";

  const isolatedDefault = resolveAgentHome({
    args: { link: false },
    env: {},
    homedir,
  });
  assert.deepEqual(isolatedDefault, {
    mode: "isolated",
    dir: "/Users/creator/.youtube-shell/agent",
  });

  const isolatedEnv = resolveAgentHome({
    args: { link: false },
    env: { YOUTUBE_SHELL_HOME: "/Volumes/Studio/yts-agent" },
    homedir,
  });
  assert.deepEqual(isolatedEnv, {
    mode: "isolated",
    dir: "/Volumes/Studio/yts-agent",
  });

  const linked = resolveAgentHome({
    args: { link: true },
    env: {},
    homedir,
  });
  assert.deepEqual(linked, {
    mode: "link",
    dir: "/Users/creator/.pi/agent",
  });

  const custom = resolveAgentHome({
    args: { link: false, home: "/tmp/my-yts-home" },
    env: {},
    homedir,
  });
  assert.deepEqual(custom, {
    mode: "custom",
    dir: resolve("/tmp/my-yts-home"),
  });
});

test("prepareIsolatedHome seeds credentials and sanitizes settings.json to exclude coding extensions/packages", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-launcher-home-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const emptyCandidate = join(tmp, "empty-pi");
  mkdirSync(emptyCandidate, { recursive: true });
  writeFileSync(join(emptyCandidate, "auth.json"), "{}", "utf8"); // <= 10 bytes

  const richCandidate = join(tmp, "user-pi");
  mkdirSync(richCandidate, { recursive: true });
  writeFileSync(join(richCandidate, "auth.json"), JSON.stringify({ provider: "configured-token-placeholder" }), "utf8");
  writeFileSync(join(richCandidate, "models.json"), JSON.stringify({ models: ["m1"] }), "utf8");
  writeFileSync(join(richCandidate, "mcp.json"), JSON.stringify({ mcpServers: { filmcraft: {} } }), "utf8");
  writeFileSync(
    join(richCandidate, "settings.json"),
    JSON.stringify({
      defaultProvider: "google-antigravity",
      defaultModel: "claude-opus-4-6-thinking",
      defaultThinkingLevel: "high",
      theme: "external-custom-theme",
      packages: ["npm:external-pkg"],
      extensions: ["/some/coding/ext.ts"],
      skills: ["/some/coding/skills"],
    }),
    "utf8",
  );

  const targetDir = join(tmp, "isolated-yts");
  prepareIsolatedHome({
    targetDir,
    candidateSourceDirs: [emptyCandidate, richCandidate],
  });

  assert.equal(existsSync(join(targetDir, "auth.json")), true);
  assert.equal(existsSync(join(targetDir, "models.json")), true);
  assert.equal(existsSync(join(targetDir, "mcp.json")), true);

  const authMode = statSync(join(targetDir, "auth.json")).mode & 0o777;
  assert.equal(authMode, 0o600);

  const cleanSettings = JSON.parse(readFileSync(join(targetDir, "settings.json"), "utf8"));
  assert.deepEqual(cleanSettings, {
    defaultProvider: "google-antigravity",
    defaultModel: "claude-opus-4-6-thinking",
    defaultThinkingLevel: "high",
  });
  assert.equal("theme" in cleanSettings, false);
  assert.equal("packages" in cleanSettings, false);
  assert.equal("extensions" in cleanSettings, false);
  assert.equal("skills" in cleanSettings, false);

  const binSource = readFileSync(join(ROOT, "bin", "youtube-shell.mjs"), "utf8");
  assert.equal(binSource.includes("gentle-shell"), false);
});

test("buildPiInvocation isolates extensions and skills for interactive runs and passes subcommands cleanly", () => {
  const interactive = buildPiInvocation({
    piCommand: "/usr/local/bin/pi",
    packageRoot: "/repo/youtube-shell",
    homeDir: "/Users/creator/.youtube-shell/agent",
    parsed: parseLauncherArgs(["--print", "Hola"]),
    baseEnv: { PATH: "/usr/bin" },
  });

  assert.equal(interactive.command, "/usr/local/bin/pi");
  assert.equal(interactive.env.PI_CODING_AGENT_DIR, "/Users/creator/.youtube-shell/agent");
  assert.deepEqual(interactive.args, [
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "-e",
    "/repo/youtube-shell",
    "--skill",
    "/repo/youtube-shell/skills",
    "--print",
    "Hola",
  ]);

  const subcommand = buildPiInvocation({
    piCommand: "/usr/local/bin/pi",
    packageRoot: "/repo/youtube-shell",
    homeDir: "/Users/creator/.youtube-shell/agent",
    parsed: parseLauncherArgs(["mcp", "list"]),
    baseEnv: { PATH: "/usr/bin" },
  });

  assert.deepEqual(subcommand.args, ["mcp", "list"]);
});

test("S3 (v0.16.0): buildPiInvocation injects activation env for normal runs and not for pi subcommands", () => {
  const parsedNormal: Parameters<typeof buildPiInvocation>[0]["parsed"] = {
    help: false,
    version: false,
    link: false,
    runs: false,
    audit: false,
    piSubcommand: undefined,
    passthrough: ["--print", "Hola"],
  };
  const parsedSub: Parameters<typeof buildPiInvocation>[0]["parsed"] = {
    help: false,
    version: false,
    link: false,
    runs: false,
    audit: false,
    piSubcommand: "mcp",
    passthrough: ["mcp", "list"],
  };
  const baseOptions = {
    piCommand: "/usr/local/bin/pi",
    packageRoot: "/repo/youtube-shell",
    homeDir: "/Users/creator/.youtube-shell/agent",
    videoDir: "/Users/creator/video",
    baseEnv: { PATH: "/usr/bin" },
  };

  const normal = buildPiInvocation({ ...baseOptions, parsed: parsedNormal, activationId: "act-20261101T140000Z-ab12cd" });
  assert.equal(normal.env.YOUTUBE_SHELL_ACTIVATION_ID, "act-20261101T140000Z-ab12cd");
  assert.equal(normal.env.YOUTUBE_SHELL_VIDEO_DIR, "/Users/creator/video");

  const sub = buildPiInvocation({ ...baseOptions, parsed: parsedSub, activationId: "act-20261101T140000Z-ab12cd" });
  assert.ok(!("YOUTUBE_SHELL_ACTIVATION_ID" in sub.env), "pi subcommands must not receive the activation env");
});

test("S3 (v0.16.0): recordLauncherActivation persists HOST_STARTED on a valid harness and PREFLIGHT_FAILED on a broken one", (t) => {
  const videoDir = mkdtempSync(join(tmpdir(), "yts-activation-"));
  t.after(() => rmSync(videoDir, { recursive: true, force: true }));

  const okRes = recordLauncherActivation(ROOT, videoDir, () => "2026-11-01T14:00:00Z");
  assert.equal(okRes.ok, true);
  if (okRes.ok) {
    assert.match(okRes.activationId, /^act-\d{8}T\d{6}Z-[0-9a-f]{6}$/);
  }
  const okState = readActivationState(videoDir);
  assert.equal(okState?.state, "HOST_STARTED");
  assert.equal(okState?.launchedViaWrapper, true);
  assert.equal(okState?.pid, process.pid);
  assert.match(okState?.activationId ?? "", /^act-\d{8}T\d{6}Z-[0-9a-f]{6}$/);
  assert.deepEqual(okState?.sequence.map((s) => s.state), ["HOST_STARTED"]);

  const brokenRoot = mkdtempSync(join(tmpdir(), "yts-preflight-broken2-"));
  t.after(() => rmSync(brokenRoot, { recursive: true, force: true }));
  const videoDir2 = mkdtempSync(join(tmpdir(), "yts-activation2-"));
  t.after(() => rmSync(videoDir2, { recursive: true, force: true }));

  const badRes = recordLauncherActivation(brokenRoot, videoDir2, () => "2026-11-01T14:00:01Z");
  assert.equal(badRes.ok, false);
  if (!badRes.ok) {
    assert.match(badRes.reason, /NOT_TRIGGERED/);
  }
  const badState = readActivationState(videoDir2);
  assert.equal(badState?.state, "PREFLIGHT_FAILED");
  assert.equal(badState?.launchedViaWrapper, true);
  assert.equal(badState?.pid, process.pid);
  assert.deepEqual(badState?.sequence.map((s) => s.state), ["PREFLIGHT_FAILED"]);
});

test("resolvePiBinary honors YOUTUBE_SHELL_PI and PATH lookup", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-pi-bin-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const fakePi = join(tmp, "pi");
  writeFileSync(fakePi, "#!/bin/sh\necho 1.3.0\n", "utf8");
  chmodSync(fakePi, 0o755);

  assert.equal(resolvePiBinary({ YOUTUBE_SHELL_PI: fakePi }, tmp), fakePi);
  assert.equal(resolvePiBinary({ PATH: tmp }, tmp), fakePi);
});

test("bin/youtube-shell.mjs responds to --help and --version", () => {
  const binPath = join(ROOT, "bin", "youtube-shell.mjs");
  const helpOut = execFileSync(process.execPath, [binPath, "--help"], { encoding: "utf8" });
  assert.match(helpOut, /youtube-shell/);
  assert.match(helpOut, /--link/);

  const verOut = execFileSync(process.execPath, [binPath, "--version"], { encoding: "utf8" });
  assert.match(verOut, /^youtube-shell \d+\.\d+\.\d+/m);
  assert.match(verOut, /^home (isolated|link|custom) /m);
});

test("verifyHarnessPreflight validates extension and all 5 role skills and detects NOT_TRIGGERED when missing", (t) => {
  const okRes = verifyHarnessPreflight(ROOT);
  assert.equal(okRes.ok, true);

  const brokenRoot = mkdtempSync(join(tmpdir(), "yts-preflight-broken-"));
  t.after(() => rmSync(brokenRoot, { recursive: true, force: true }));

  const failRes = verifyHarnessPreflight(brokenRoot);
  assert.equal(failRes.ok, false);
  if (!failRes.ok) {
    assert.match(failRes.reason, /NOT_TRIGGERED/);
  }
});

test("bin/youtube-shell.mjs supports --runs and --audit [run-id] outside the Pi TUI with aggregated observation summary", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-cli-audit-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const { createFsReader, scaffoldVideoDir } = await import("../src/store/fs-store.ts");
  const { evaluate } = await import("../src/core/machine.ts");
  const { resolveWorkflowContext } = await import("../src/core/context-resolver.ts");
  const { recordReferenceReadInAttestation } = await import("../src/core/assurance.ts");
  const { createRunRecord, finalizeRunRecord } = await import("../src/store/run-ledger.ts");

  const now = "2026-11-01T14:00:00Z";
  const { registry: reg } = scaffoldVideoDir(tmp, { now });
  const evaluation = evaluate(reg, createFsReader(tmp));
  const resolved = resolveWorkflowContext({
    videoDir: tmp,
    evaluation,
    userPrompt: "Diseña las opciones de título y miniatura de P01",
  });
  const manifest = createRunRecord({
    videoDir: tmp,
    startedAt: now,
    promptText: "Diseña las opciones de título y miniatura de P01",
    promptDelivered: true,
    resolvedWorkflow: resolved,
  });
  recordReferenceReadInAttestation(
    manifest.context,
    join(ROOT, "skills", "yts-packaging-miniaturas", "SKILL.md"),
    tmp,
  );
  finalizeRunRecord(tmp, manifest, now);

  const binPath = join(ROOT, "bin", "youtube-shell.mjs");
  const runsOut = execFileSync(process.execPath, [binPath, "--runs"], {
    cwd: tmp,
    encoding: "utf8",
  });
  assert.match(runsOut, new RegExp(manifest.runId));
  assert.match(runsOut, /Resumen de observación/i);

  const auditOut = execFileSync(process.execPath, [binPath, "--audit", manifest.runId], {
    cwd: tmp,
    encoding: "utf8",
  });
  assert.match(auditOut, /Informe de Ejecución \(youtube-shell\)/);
  assert.match(auditOut, new RegExp(manifest.runId));
});


