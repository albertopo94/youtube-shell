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
  resolveAgentHome,
  resolvePiBinary,
} from "../src/cli/launcher.ts";

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

  const richCandidate = join(tmp, "gentle-pi");
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
      theme: "dark",
      packages: ["npm:gentle-pi"],
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
    theme: "dark",
  });
  assert.equal("packages" in cleanSettings, false);
  assert.equal("extensions" in cleanSettings, false);
  assert.equal("skills" in cleanSettings, false);
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
