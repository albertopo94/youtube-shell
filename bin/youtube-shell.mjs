#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir as getHomedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.removeAllListeners("warning");

const {
  buildPiInvocation,
  formatLauncherHelp,
  parseLauncherArgs,
  prepareIsolatedHome,
  resolveAgentHome,
  resolvePiBinary,
} = await import("../src/cli/launcher.ts");

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "..");

const parsed = parseLauncherArgs(process.argv.slice(2));

if (parsed.help) {
  process.stdout.write(`${formatLauncherHelp()}\n`);
  process.exit(0);
}

const homedir = getHomedir();
const home = resolveAgentHome({
  args: { link: parsed.link, home: parsed.home },
  env: process.env,
  homedir,
});

const piBin = resolvePiBinary(process.env, homedir);

if (parsed.version) {
  const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));
  let piVersion = "not-found";
  if (piBin) {
    try {
      piVersion = execFileSync(piBin, ["--version"], { encoding: "utf8" }).trim();
    } catch {
      piVersion = "unknown";
    }
  }
  process.stdout.write(
    [
      `youtube-shell ${pkg.version}`,
      `pi ${piVersion}${piBin ? ` (${piBin})` : ""}`,
      `home ${home.mode} ${home.dir}`,
    ].join("\n") + "\n",
  );
  process.exit(0);
}

if (!piBin) {
  process.stderr.write(
    [
      "Error: no se encontró el binario 'pi' en PATH ni en YOUTUBE_SHELL_PI.",
      "Instala @earendil-works/pi-coding-agent o define YOUTUBE_SHELL_PI=/ruta/a/pi.",
    ].join("\n") + "\n",
  );
  process.exit(1);
}

if (home.mode === "isolated" || home.mode === "custom") {
  prepareIsolatedHome({
    targetDir: home.dir,
    candidateSourceDirs: [join(homedir, ".pi", "agent")],
  });
}

const invocation = buildPiInvocation({
  piCommand: piBin,
  packageRoot: PACKAGE_ROOT,
  homeDir: home.dir,
  parsed,
  baseEnv: process.env,
});

const child = spawn(invocation.command, invocation.args, {
  stdio: "inherit",
  env: invocation.env,
});

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    if (!child.killed) {
      child.kill(sig);
    }
  });
}

child.on("error", (err) => {
  process.stderr.write(`Error al iniciar pi: ${err.message}\n`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
