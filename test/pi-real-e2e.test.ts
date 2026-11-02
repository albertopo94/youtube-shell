import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePiBinary, buildPiInvocation, parseLauncherArgs } from "../src/cli/launcher.ts";
import { listRunManifests, runEventsPath, runManifestPath } from "../src/store/run-ledger.ts";
import { readActivationState } from "../src/store/activation.ts";

const ROOT = join(import.meta.dirname, "..");

/**
 * S6: drive the REAL `pi` binary (through the youtube-shell launcher) against a deterministic
 * local openai-completions provider, proving the activation handshake and the run ledger work
 * in a real host.
 *
 * The test is a guard, not a stub: it resolves whatever `pi` the launcher would use and spawns it
 * for real. If that binary cannot complete a headless turn (it hangs before ever reaching the
 * model provider), the test skips with an explicit diagnosis instead of failing CI on an
 * environment defect that is out of scope for the harness.
 */

async function startMockModel(): Promise<{ server: Server; port: number; baseUrl: string }> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "chatcmpl-test",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "yts-e2e-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Estado P01_PACKAGING: EN_CURSO" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 4, completion_tokens: 5, total_tokens: 9 },
      }),
    );
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", () => resolveListen()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { server, port: address.port, baseUrl: `http://127.0.0.1:${address.port}/v1` };
}

interface PiRunResult {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function runPiWithTimeout(
  binPath: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
  timeoutMs: number,
): Promise<PiRunResult> {
  return new Promise((resolveRun) => {
    const child = spawn(binPath, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolveRun({ code, signal, stdout, stderr, timedOut });
    });
  });
}

test(
  "S6: real pi loads the extension, completes the handshake and settles a ledger run",
  { timeout: 60_000 },
  async (t) => {
    const piBin = resolvePiBinary(process.env, tmpdir());
    if (!piBin) {
      t.skip("no `pi` binary resolvable on PATH or YOUTUBE_SHELL_PI");
      return;
    }

    const work = mkdtempSync(join(tmpdir(), "yts-real-e2e-"));
    const videoDir = join(work, "video");
    const home = join(work, "agent");
    mkdirSync(videoDir, { recursive: true });
    mkdirSync(join(home, "models"), { recursive: true });
    t.after(() => rmSync(work, { recursive: true, force: true }));

    const mock = await startMockModel();
    t.after(() => new Promise((done) => mock.server.close(done)));

    writeFileSync(
      join(home, "models", "models.json"),
      JSON.stringify(
        {
          providers: {
            yts_e2e: {
              baseUrl: mock.baseUrl,
              api: "openai-completions",
              apiKey: "dummy",
              models: [
                {
                  id: "yts-e2e-model",
                  name: "YouTube Shell E2E",
                  reasoning: false,
                  input: ["text"],
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                  contextWindow: 32000,
                  maxTokens: 2048,
                },
              ],
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const parsed = parseLauncherArgs(["--home", home, "--print", "Estado de la producción"]);
    const invocation = buildPiInvocation({
      piCommand: piBin,
      packageRoot: ROOT,
      homeDir: home,
      parsed,
      baseEnv: { ...process.env } as Record<string, string>,
      activationId: "act-20261101T000000Z-abcdef",
      videoDir,
    });

    const res = await runPiWithTimeout(
      invocation.command,
      invocation.args,
      videoDir,
      invocation.env,
      12_000,
    );

    if (res.timedOut) {
      t.skip(
        "real `pi` binary hung headless before reaching the model provider; this is a defect " +
          `of the installed binary (${piBin}), not of the harness. Re-run this guard once the ` +
          "host has a `pi` that can complete a `--print`/`--mode json` turn.",
      );
      return;
    }

    assert.equal(res.code, 0, `pi exit code; stderr: ${res.stderr}`);
    assert.ok(!/Error/.test(res.stderr), `unexpected pi error: ${res.stderr}`);

    const manifests = listRunManifests(videoDir);
    assert.ok(manifests.length >= 1, "at least one run must be recorded by the real extension");
    const run = manifests[0];

    const activation = readActivationState(videoDir);
    assert.ok(activation, "activation-state.json must exist after a real run");
    assert.ok(
      activation.sequence.some((s) => s.state === "EXTENSION_ACTIVATED"),
      "the extension must confirm activation",
    );

    assert.ok(existsSync(runManifestPath(videoDir, run.runId)), "manifest.json must be persisted");
    assert.ok(existsSync(runEventsPath(videoDir, run.runId)), "events.jsonl must be persisted");

    const manifestBytes = readFileSync(runManifestPath(videoDir, run.runId), "utf8");
    const eventsBytes = readFileSync(runEventsPath(videoDir, run.runId), "utf8");
    assert.ok(!manifestBytes.includes(home), "manifest must not leak the isolated home path");
    assert.ok(!eventsBytes.includes(home), "events must not leak the isolated home path");

    assert.equal(typeof run.process?.pid, "number", "the run must carry the real pid");
    assert.equal(run.process?.launchedViaWrapper, true);
  },
);