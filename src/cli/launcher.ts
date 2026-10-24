import { accessSync, chmodSync, constants, copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";

export const PI_SUBCOMMANDS = [
  "install",
  "remove",
  "uninstall",
  "update",
  "list",
  "config",
  "auth",
  "mcp",
] as const;

export type PiSubcommand = (typeof PI_SUBCOMMANDS)[number];

export interface ParsedLauncherArgs {
  help: boolean;
  version: boolean;
  link: boolean;
  home?: string;
  piSubcommand?: PiSubcommand;
  passthrough: string[];
}

export interface AgentHomeResolution {
  mode: "isolated" | "link" | "custom";
  dir: string;
}

const SHARED_CREDENTIAL_FILES = ["auth.json", "models.json", "models-store.json", "mcp.json"] as const;
const SAFE_SETTINGS_KEYS = ["defaultProvider", "defaultModel", "defaultThinkingLevel", "theme"] as const;

function isPiSubcommand(token: string): token is PiSubcommand {
  return (PI_SUBCOMMANDS as readonly string[]).includes(token);
}

export function parseLauncherArgs(argv: readonly string[]): ParsedLauncherArgs {
  let help = false;
  let version = false;
  let link = false;
  let home: string | undefined;
  let piSubcommand: PiSubcommand | undefined;
  let seenPositional = false;
  const passthrough: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--version" || arg === "-v") {
      version = true;
      continue;
    }
    if (arg === "--link") {
      link = true;
      continue;
    }
    if (arg === "--home" && i + 1 < argv.length) {
      home = argv[++i];
      continue;
    }
    if (arg.startsWith("--home=")) {
      home = arg.slice("--home=".length);
      continue;
    }

    if (!seenPositional && !arg.startsWith("-")) {
      seenPositional = true;
      if (isPiSubcommand(arg)) {
        piSubcommand = arg;
      }
    }
    passthrough.push(arg);
  }

  return {
    help,
    version,
    link,
    home,
    piSubcommand,
    passthrough,
  };
}

export function resolveAgentHome(options: {
  args: { link: boolean; home?: string };
  env: Record<string, string | undefined>;
  homedir: string;
}): AgentHomeResolution {
  if (options.args.home) {
    return { mode: "custom", dir: resolve(options.args.home) };
  }
  if (options.args.link) {
    return {
      mode: "link",
      dir: options.env.PI_CODING_AGENT_DIR || join(options.homedir, ".pi", "agent"),
    };
  }
  return {
    mode: "isolated",
    dir: options.env.YOUTUBE_SHELL_HOME || join(options.homedir, ".youtube-shell", "agent"),
  };
}

function hasUsableAuthFile(dir: string): boolean {
  const authPath = join(dir, "auth.json");
  try {
    return existsSync(authPath) && statSync(authPath).size > 10;
  } catch {
    return false;
  }
}

export function prepareIsolatedHome(options: {
  targetDir: string;
  candidateSourceDirs: readonly string[];
}): { seededFrom: string | null } {
  mkdirSync(options.targetDir, { recursive: true, mode: 0o700 });

  let sourceDir: string | null = null;
  for (const candidate of options.candidateSourceDirs) {
    if (hasUsableAuthFile(candidate)) {
      sourceDir = candidate;
      break;
    }
  }
  if (!sourceDir) {
    for (const candidate of options.candidateSourceDirs) {
      if (existsSync(candidate)) {
        sourceDir = candidate;
        break;
      }
    }
  }

  if (!sourceDir || resolve(sourceDir) === resolve(options.targetDir)) {
    return { seededFrom: null };
  }

  for (const file of SHARED_CREDENTIAL_FILES) {
    const srcFile = join(sourceDir, file);
    const dstFile = join(options.targetDir, file);
    if (!existsSync(srcFile)) continue;

    const shouldCopy =
      !existsSync(dstFile) ||
      (file === "auth.json" && !hasUsableAuthFile(options.targetDir) && hasUsableAuthFile(sourceDir));

    if (shouldCopy) {
      copyFileSync(srcFile, dstFile);
      chmodSync(dstFile, 0o600);
    }
  }

  const dstSettings = join(options.targetDir, "settings.json");
  const srcSettings = join(sourceDir, "settings.json");
  if (!existsSync(dstSettings) && existsSync(srcSettings)) {
    try {
      const parsed = JSON.parse(readFileSync(srcSettings, "utf8")) as Record<string, unknown>;
      const clean: Record<string, unknown> = {};
      for (const key of SAFE_SETTINGS_KEYS) {
        if (parsed[key] !== undefined) {
          clean[key] = parsed[key];
        }
      }
      writeFileSync(dstSettings, `${JSON.stringify(clean, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    } catch {
      // Ignore malformed upstream settings.json; Pi will initialize defaults.
    }
  }

  return { seededFrom: sourceDir };
}

export function buildPiInvocation(options: {
  piCommand: string;
  packageRoot: string;
  homeDir: string;
  parsed: ParsedLauncherArgs;
  baseEnv: Record<string, string | undefined>;
}): {
  command: string;
  args: string[];
  env: Record<string, string | undefined>;
} {
  const env: Record<string, string | undefined> = {
    ...options.baseEnv,
    PI_CODING_AGENT_DIR: options.homeDir,
  };

  if (options.parsed.piSubcommand) {
    return {
      command: options.piCommand,
      args: [...options.parsed.passthrough],
      env,
    };
  }

  return {
    command: options.piCommand,
    args: [
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "-e",
      options.packageRoot,
      "--skill",
      join(options.packageRoot, "skills"),
      ...options.parsed.passthrough,
    ],
    env,
  };
}

function isExecutable(filePath: string): boolean {
  try {
    const st = statSync(filePath);
    if (!st.isFile()) return false;
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolvePiBinary(
  env: Record<string, string | undefined>,
  homedir: string,
): string | null {
  if (env.YOUTUBE_SHELL_PI && isExecutable(env.YOUTUBE_SHELL_PI)) {
    return env.YOUTUBE_SHELL_PI;
  }

  const pathDirs = (env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    const candidate = join(dir, "pi");
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  const fallbacks = [
    join(homedir, "Library", "pnpm", "pi"),
    join(homedir, ".local", "bin", "pi"),
  ];
  for (const candidate of fallbacks) {
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function formatLauncherHelp(): string {
  return [
    "youtube-shell — Studio de producción audiovisual gobernado por contrato sobre Pi",
    "",
    "Uso:",
    "  youtube-shell [opciones] [argumentos de pi...]",
    "  youtube-shell <mcp|auth|config|list|install|remove|update> [args...]",
    "",
    "Opciones de youtube-shell:",
    "  --home <dir>   Usar un directorio de agente personalizado",
    "  --link         Usar directamente ~/.pi/agent sin aislar el home",
    "  -v, --version  Mostrar versión de youtube-shell, pi y ruta del home activo",
    "  -h, --help     Mostrar esta ayuda",
    "",
    "Comandos dentro de la sesión interactiva:",
    "  /yts-init                    Inicializar plantillas 00..06 y registro en la carpeta actual",
    "  /yts-status                  Ver panel de estado de las 7 fases y siguiente acción",
    "  /yts-approve <FASE> [nota]   Aprobar fase en PENDIENTE_APROBACION (exclusivo creador)",
    "  /yts-reject <FASE> <nota>    Devolver fase a EN_CURSO con cambios solicitados",
  ].join("\n");
}
