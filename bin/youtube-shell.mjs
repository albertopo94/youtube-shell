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
  recordLauncherActivation,
  resolveAgentHome,
  resolvePiBinary,
} = await import("../src/cli/launcher.ts");

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "..");

const parsed = parseLauncherArgs(process.argv.slice(2));
let lastActivationId;

if (parsed.help) {
  process.stdout.write(`${formatLauncherHelp()}\n`);
  process.exit(0);
}

if (parsed.runs) {
  const { listRunManifests, reconcileOrphanedRuns, pruneOldRuns } = await import("../src/store/run-ledger.ts");
  const { formatObservedRunsReport } = await import("../src/core/assurance.ts");
  const reconciliation = reconcileOrphanedRuns(process.cwd(), {
    now: new Date().toISOString(),
  });
  if (reconciliation.orphaned.length > 0 || reconciliation.unknown.length > 0) {
    process.stderr.write(
      `Reconciliación de corridas no asentadas: ${reconciliation.orphaned.length} huérfana(s), ${reconciliation.unknown.length} con estado de proceso desconocido.\n`,
    );
  }
  const retention = Number.parseInt(process.env.YOUTUBE_SHELL_RUN_RETENTION ?? "", 10);
  pruneOldRuns(process.cwd(), {
    keep: Number.isInteger(retention) && retention > 0 ? retention : 50,
  });
  const runs = listRunManifests(process.cwd());
  const { readLifecycleEvents, buildLifecycleTimeline, formatLifecycleTimeline } = await import(
    "../src/store/lifecycle.ts"
  );
  const timeline = buildLifecycleTimeline(readLifecycleEvents(process.cwd()), runs);
  process.stdout.write(
    `${formatObservedRunsReport(runs)}\n\n${formatLifecycleTimeline(timeline)}\n`,
  );
  process.exit(0);
}

if (parsed.audit) {
  const { listRunManifests, loadRunManifest, saveRunManifest, reconcileOrphanedRuns } = await import(
    "../src/store/run-ledger.ts"
  );
  reconcileOrphanedRuns(process.cwd(), { now: new Date().toISOString() });
  const { evaluateRunAssurance, formatRunAuditReport } = await import("../src/core/assurance.ts");
  const manifest = parsed.auditRunId
    ? loadRunManifest(process.cwd(), parsed.auditRunId)
    : listRunManifests(process.cwd()).at(-1);
  if (!manifest) {
    process.stderr.write(
      parsed.auditRunId
        ? `No se encontró la ejecución "${parsed.auditRunId}" en .youtube-shell/runs/.\n`
        : "No existen ejecuciones registradas en .youtube-shell/runs/.\n",
    );
    process.exit(1);
  }
  const assurance = evaluateRunAssurance(manifest);
  manifest.status = assurance.status;
  manifest.statusReason = assurance.reason;
  manifest.assurance = assurance;
  saveRunManifest(process.cwd(), manifest);
  const { readLifecycleEvents, buildLifecycleTimeline, formatLifecycleTimeline } = await import(
    "../src/store/lifecycle.ts"
  );
  const timeline = buildLifecycleTimeline(readLifecycleEvents(process.cwd()), [manifest]);
  process.stdout.write(
    `${formatRunAuditReport(manifest)}\n\n${formatLifecycleTimeline(timeline)}\n`,
  );
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

if (!parsed.piSubcommand) {
  const activation = recordLauncherActivation(PACKAGE_ROOT, process.cwd(), () => new Date().toISOString());
  if (!activation.ok) {
    process.stderr.write(`Error de integridad pre-vuelo: ${activation.reason}\n`);
    process.exit(1);
  }
  lastActivationId = activation.activationId;
}

const invocation = buildPiInvocation({
  piCommand: piBin,
  packageRoot: PACKAGE_ROOT,
  homeDir: home.dir,
  parsed,
  baseEnv: process.env,
  ...(lastActivationId ? { activationId: lastActivationId, videoDir: process.cwd() } : {}),
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
