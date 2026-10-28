import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createYoutubeShellExtension, renderStartupPanel } from "../src/gate/pi-extension.ts";
import { DEFAULT_CAPABILITIES, type ToolCapabilityEntry } from "../src/gate/capabilities.ts";
import { createFsReader, loadRegistry, registryPath } from "../src/store/fs-store.ts";
import { evaluate } from "../src/core/machine.ts";

const TEMPLATES = join(import.meta.dirname, "..", "templates", "pipeline-video");

interface HarnessOptions {
  videoDir: string;
  hasUI?: boolean;
  confirmResult?: boolean;
  extraCapabilities?: ToolCapabilityEntry[];
  techniquesPath?: string;
  rolesDir?: string;
}

/**
 * Harness that wires the real Pi extension lifecycle (`before_agent_start`,
 * `tool_call`, registered tools, and human commands) and executes the underlying
 * tool side effect ONLY when `tool_call` does not return `{ block: true }`.
 */
function createPiHarness(opts: HarnessOptions) {
  const hooks = new Map<string, Array<(event: any, ctx: any) => any>>();
  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const allTools = ["read", "write", "edit", "bash", "mcp_unknown_mutate"];
  let activeTools = [...allTools];
  const notifications: Array<{ message: string; level: string }> = [];
  const confirmations: Array<{ title: string; message: string }> = [];
  const statusUpdates: Array<{ key: string; text: string | undefined }> = [];
  const titles: string[] = [];
  let headerFactory: ((tui: any, theme: any) => { render: (w: number) => string[]; invalidate: () => void }) | undefined;
  let backendSideEffects = 0;

  const pi = {
    on(event: string, handler: (event: any, ctx: any) => any) {
      const list = hooks.get(event) ?? [];
      list.push(handler);
      hooks.set(event, list);
    },
    registerTool(def: any) {
      tools.set(def.name, def);
      if (!allTools.includes(def.name)) {
        allTools.push(def.name);
      }
      if (!activeTools.includes(def.name)) {
        activeTools.push(def.name);
      }
    },
    registerCommand(name: string, def: any) {
      commands.set(name, def);
    },
    getActiveTools() {
      return [...activeTools];
    },
    setActiveTools(next: string[]) {
      activeTools = [...next];
    },
    getAllTools() {
      return allTools.map((name) => ({ name }));
    },
  };

  const ext = createYoutubeShellExtension({
    extraCapabilities: opts.extraCapabilities,
    techniquesPath: opts.techniquesPath,
    rolesDir: opts.rolesDir,
  });
  ext(pi);

  const makeCtx = (overrides?: Partial<{ hasUI: boolean; confirmResult: boolean }>) => {
    const hasUI = overrides?.hasUI ?? opts.hasUI ?? true;
    const confirmResult = overrides?.confirmResult ?? opts.confirmResult ?? true;
    return {
      cwd: opts.videoDir,
      hasUI,
      mode: hasUI ? "tui" : "print",
      ui: {
        notify(message: string, level = "info") {
          notifications.push({ message, level });
        },
        async confirm(title: string, message: string) {
          confirmations.push({ title, message });
          return confirmResult;
        },
        setStatus(key: string, text: string | undefined) {
          statusUpdates.push({ key, text });
        },
        setTitle(title: string) {
          titles.push(title);
        },
        setHeader(factory: any) {
          headerFactory = factory;
        },
      },
    };
  };

  async function runBeforeAgentStart(systemPrompt = "Base prompt", prompt = "Hola") {
    const ctx = makeCtx();
    let currentPrompt = systemPrompt;
    for (const handler of hooks.get("before_agent_start") ?? []) {
      const res = await handler(
        {
          prompt,
          systemPrompt: currentPrompt,
          systemPromptOptions: { selectedTools: activeTools, cwd: opts.videoDir },
        },
        ctx,
      );
      if (res?.systemPrompt) currentPrompt = res.systemPrompt;
    }
    return { systemPrompt: currentPrompt, activeTools: [...activeTools] };
  }

  /**
   * Simulates a real tool call through Pi's `tool_call` hook:
   * - If any handler returns `{ block: true }`, the side effect NEVER runs.
   * - Otherwise, executes the built-in fs/shell effect or custom tool `execute`.
   */
  async function invokeTool(
    toolName: string,
    input: Record<string, any>,
    ctxOverrides?: Partial<{ hasUI: boolean; confirmResult: boolean }>,
  ) {
    const ctx = makeCtx(ctxOverrides);
    const event = { toolCallId: "tc-1", toolName, input: structuredClone(input) };

    for (const handler of hooks.get("tool_call") ?? []) {
      const decision = await handler(event, ctx);
      if (decision?.block) {
        return { blocked: true as const, reason: String(decision.reason ?? "blocked") };
      }
    }

    // Not blocked: execute real effect to verify positive/negative effect guarantees
    if (toolName === "write") {
      const target = join(opts.videoDir, event.input.path);
      writeFileSync(target, String(event.input.content ?? ""), "utf8");
      return { blocked: false as const, result: "written" };
    }
    if (toolName === "edit") {
      const target = join(opts.videoDir, event.input.path);
      const prev = readFileSync(target, "utf8");
      const next = prev.replace(String(event.input.oldText), String(event.input.newText));
      writeFileSync(target, next, "utf8");
      return { blocked: false as const, result: "edited" };
    }
    if (toolName === "bash") {
      writeFileSync(join(opts.videoDir, "bash-ran.txt"), "pwned", "utf8");
      return { blocked: false as const, result: "bash-ran" };
    }
    if (tools.has(toolName)) {
      const tool = tools.get(toolName);
      const out = await tool.execute("tc-1", event.input, undefined, undefined, ctx);
      return { blocked: false as const, result: out };
    }

    backendSideEffects += 1;
    return { blocked: false as const, result: "external-effect" };
  }

  async function invokeCommand(
    name: string,
    args = "",
    ctxOverrides?: Partial<{ hasUI: boolean; confirmResult: boolean }>,
  ) {
    const cmd = commands.get(name);
    assert.ok(cmd, `Command ${name} is not registered`);
    const ctx = makeCtx(ctxOverrides);
    await cmd.handler(args, ctx);
  }

  async function runSessionStart() {
    const ctx = makeCtx();
    for (const handler of hooks.get("session_start") ?? []) {
      await handler({ type: "session_start" }, ctx);
    }
  }

  return {
    pi,
    tools,
    commands,
    notifications,
    confirmations,
    statusUpdates,
    titles,
    getHeaderFactory: () => headerFactory,
    getBackendSideEffects: () => backendSideEffects,
    runSessionStart,
    runBeforeAgentStart,
    invokeTool,
    invokeCommand,
  };
}

function setupTempVideo(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), "yts-pi-gate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const videoDir = join(root, "01-video");
  cpSync(TEMPLATES, videoDir, { recursive: true });
  return { root, videoDir };
}

function resolveFactcheckOnDisk(videoDir: string) {
  const fuentesPath = join(videoDir, "06-fuentes-y-verificacion.md");
  const orig = readFileSync(fuentesPath, "utf8");
  const resolved = orig
    .replaceAll("[Insertar DOI o URL real]", "https://doi.org/10.1000/xyz123")
    .replaceAll("`PENDIENTE`", "`VERIFICADO`");
  writeFileSync(fuentesPath, resolved, "utf8");
}

function syncStoryboardBlocksOnDisk(videoDir: string) {
  const storyPath = join(videoDir, "03-storyboard-y-edicion.md");
  const orig = readFileSync(storyPath, "utf8");
  const extraRows = [
    "| **04** | `[B04_La_Revelacion_del_Mecanismo]` | `← derivar` | *\"...\"* | 🖼️ Imagen | `[gen]` | `Prompt` | SFX |",
    "| **05** | `[B05_La_Prueba_o_Experimento]` | `← derivar` | *\"...\"* | 🖼️ Imagen | `[gen]` | `Prompt` | SFX |",
    "| **06** | `[B06_Payoff_Reencuadre_Mental]` | `← derivar` | *\"...\"* | 🖼️ Imagen | `[gen]` | `Prompt` | SFX |",
    "| **07** | `[B07_Cierre_CTA]` | `← derivar` | *\"...\"* | 🖼️ Imagen | `[gen]` | `Prompt` | SFX |",
  ].join("\n");
  writeFileSync(
    storyPath,
    orig.replace("| **...** | ... | ... | ... | ... | ... | ... | ... |", extraRows),
    "utf8",
  );
}

function renderValidMasterAndSheetOnDisk(videoDir: string) {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=320x180:r=24:d=1",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=1",
      "-af",
      "volume=-18dB",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      join(videoDir, "master.mp4"),
    ],
    { stdio: "ignore" },
  );
  writeFileSync(
    join(videoDir, "aceptacion.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        videoId: "01-video",
        approvedBy: "creador",
        approvedAt: "2020-01-01T00:00:00Z",
        approvedBeforeRender: true,
        loudness: {
          targetLufs: -23,
          toleranceLu: 25,
          maxTruePeakDbtp: 0,
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

test("before_agent_start removes bash, uncataloged tools, and write/edit when no phase is active", async (t) => {
  const { videoDir } = setupTempVideo(t);
  const h = createPiHarness({ videoDir });

  const { activeTools, systemPrompt } = await h.runBeforeAgentStart("Prompt base");
  assert.ok(!activeTools.includes("bash"), "bash must be removed from active tools");
  assert.ok(!activeTools.includes("mcp_unknown_mutate"), "uncataloged MCP tool must be removed");
  assert.ok(!activeTools.includes("write"), "write must be inactive before starting a phase");
  assert.ok(!activeTools.includes("edit"), "edit must be inactive before starting a phase");
  assert.ok(activeTools.includes("read"));
  assert.ok(activeTools.includes("yts_status"));
  assert.ok(activeTools.includes("yts_transition"));
  assert.match(systemPrompt, /P01_PACKAGING/);
});

test("model attempt to write in a phase that is not active or not allowed is blocked with zero file effect", async (t) => {
  const { videoDir } = setupTempVideo(t);
  const h = createPiHarness({ videoDir });

  const packagingPath = join(videoDir, "01-packaging.md");
  const scriptPath = join(videoDir, "02-guion.md");
  const origPackaging = readFileSync(packagingPath, "utf8");
  const origScript = readFileSync(scriptPath, "utf8");

  // 1. Before P01_PACKAGING is started, even writing 01-packaging.md is blocked
  const beforeStart = await h.invokeTool("write", { path: "01-packaging.md", content: "hack" });
  assert.equal(beforeStart.blocked, true);
  assert.equal(readFileSync(packagingPath, "utf8"), origPackaging);

  // 2. Start P01_PACKAGING
  const startRes = await h.invokeTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  assert.equal(startRes.blocked, false);

  // 3. Writing 02-guion.md during P01_PACKAGING is blocked and 02-guion.md is untouched
  const wrongPhaseWrite = await h.invokeTool("write", { path: "02-guion.md", content: "guion prematuro" });
  assert.equal(wrongPhaseWrite.blocked, true);
  assert.match(wrongPhaseWrite.reason, /02-guion\.md/);
  assert.equal(readFileSync(scriptPath, "utf8"), origScript);

  // 4. Writing 01-packaging.md during P01_PACKAGING is allowed and updates disk
  const validWrite = await h.invokeTool("write", {
    path: "01-packaging.md",
    content: `${origPackaging}\n<!-- editado en P01 -->\n`,
  });
  assert.equal(validWrite.blocked, false);
  assert.match(readFileSync(packagingPath, "utf8"), /editado en P01/);
});

test("starting a phase with pending prerequisite is blocked and leaves registry untouched", async (t) => {
  const { videoDir } = setupTempVideo(t);
  const h = createPiHarness({ videoDir });

  const res = await h.invokeTool("yts_transition", { action: "start", phase: "P03_SCRIPT" });
  assert.equal(res.blocked, true);
  assert.match(res.reason, /P02_RESEARCH.*aprobación/);
  assert.equal(existsSync(registryPath(videoDir)), false);
});

test("model cannot self-approve a phase: no approval tool exists and forged transition is blocked", async (t) => {
  const { videoDir } = setupTempVideo(t);
  const h = createPiHarness({ videoDir });

  assert.ok(!h.tools.has("yts_approve"), "must not register a model-callable approval tool");

  await h.invokeTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  await h.invokeTool("yts_transition", { action: "submit", phase: "P01_PACKAGING" });

  const forged = await h.invokeTool("yts_transition", { action: "approve", phase: "P01_PACKAGING" });
  assert.equal(forged.blocked, true);
  assert.match(forged.reason, /creador|aprobar/i);

  const reg = loadRegistry(videoDir, { videoId: "01-video", now: "x" });
  assert.equal(reg.phases.P01_PACKAGING.status, "PENDIENTE_APROBACION");
  assert.equal(reg.phases.P01_PACKAGING.approvals.length, 0);
});

test("human command /yts-approve approves a pending phase, and subsequent edit to approved section is blocked or invalidates", async (t) => {
  const { videoDir } = setupTempVideo(t);
  const h = createPiHarness({ videoDir });

  await h.invokeTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  await h.invokeTool("yts_transition", { action: "submit", phase: "P01_PACKAGING" });

  // Creator approves via UI command
  await h.invokeCommand("yts-approve", "P01_PACKAGING Aprobado el packaging");
  assert.equal(h.confirmations.length, 1);

  const regAfterApprove = loadRegistry(videoDir, { videoId: "01-video", now: "x" });
  assert.equal(regAfterApprove.phases.P01_PACKAGING.status, "APROBADO");
  assert.equal(regAfterApprove.phases.P01_PACKAGING.approvals.length, 1);

  // Agent tries to overwrite approved 01-packaging.md -> blocked before execution
  const beforeContent = readFileSync(join(videoDir, "01-packaging.md"), "utf8");
  const editApproved = await h.invokeTool("write", { path: "01-packaging.md", content: "cambio furtivo" });
  assert.equal(editApproved.blocked, true);
  assert.equal(readFileSync(join(videoDir, "01-packaging.md"), "utf8"), beforeContent);

  // If the file is modified on disk outside the tool, P01 becomes OBSOLETO and blocks starting P02
  writeFileSync(join(videoDir, "01-packaging.md"), `${beforeContent}\nmodificación externa\n`, "utf8");
  const ev = evaluate(regAfterApprove, createFsReader(videoDir));
  assert.equal(ev.phases[0].effective, "OBSOLETO");

  const startP02 = await h.invokeTool("yts_transition", { action: "start", phase: "P02_RESEARCH" });
  assert.equal(startP02.blocked, true);
  assert.match(startP02.reason, /P01_PACKAGING/);
});

test("in shared 06-fuentes-y-verificacion.md, P04_FACTCHECK cannot overwrite approved P02_RESEARCH sections", async (t) => {
  const { videoDir } = setupTempVideo(t);
  const h = createPiHarness({ videoDir });

  // Complete and approve P01 and P02
  await h.invokeTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  await h.invokeTool("yts_transition", { action: "submit", phase: "P01_PACKAGING" });
  await h.invokeCommand("yts-approve", "P01_PACKAGING");

  await h.invokeTool("yts_transition", { action: "start", phase: "P02_RESEARCH" });
  await h.invokeTool("yts_transition", { action: "submit", phase: "P02_RESEARCH" });
  await h.invokeCommand("yts-approve", "P02_RESEARCH");

  await h.invokeTool("yts_transition", { action: "start", phase: "P03_SCRIPT" });
  await h.invokeTool("yts_transition", {
    action: "submit",
    phase: "P03_SCRIPT",
  });
  await h.invokeCommand("yts-approve", "P03_SCRIPT");

  await h.invokeTool("yts_transition", { action: "start", phase: "P04_FACTCHECK" });

  const fuentesPath = join(videoDir, "06-fuentes-y-verificacion.md");
  const originalFuentes = readFileSync(fuentesPath, "utf8");

  // Trying to alter Parte 1 during P04_FACTCHECK is blocked before writing
  const tamperParte1 = await h.invokeTool("edit", {
    path: "06-fuentes-y-verificacion.md",
    oldText: "Fuentes de Partida Identificadas",
    newText: "Fuentes adulteradas después de aprobar P02",
  });
  assert.equal(tamperParte1.blocked, true);
  assert.match(tamperParte1.reason, /P02_RESEARCH/);
  assert.equal(readFileSync(fuentesPath, "utf8"), originalFuentes);

  // Editing Parte 2 during P04_FACTCHECK is allowed and keeps P02_RESEARCH APROBADO
  const validFactCheckEdit = await h.invokeTool("edit", {
    path: "06-fuentes-y-verificacion.md",
    oldText: "| `[B01_Hook]` |",
    newText: "| `[B01_Hook_Verificado]` |",
  });
  assert.equal(validFactCheckEdit.blocked, false);
  const reg = loadRegistry(videoDir, { videoId: "01-video", now: "x" });
  assert.equal(evaluate(reg, createFsReader(videoDir)).phases[1].effective, "APROBADO");
});

test("creator cancelling a sensitive confirmation or running without UI blocks the operation with zero side effects", async (t) => {
  const { videoDir } = setupTempVideo(t);
  const publishTool: ToolCapabilityEntry = {
    id: "studio_publish",
    capability: "publish",
    allowedPhases: ["P07_CLOSE"],
    requiresHumanConfirmation: true,
    evidenceStatus: "documentada",
  };
  const h = createPiHarness({ videoDir, extraCapabilities: [publishTool] });

  // Advance to P07_CLOSE EN_CURSO
  for (const id of [
    "P01_PACKAGING",
    "P02_RESEARCH",
    "P03_SCRIPT",
    "P04_FACTCHECK",
    "P05_ANIMATIC",
    "P06_ASSEMBLY",
  ] as const) {
    await h.invokeTool("yts_transition", { action: "start", phase: id });
    if (id === "P04_FACTCHECK") {
      resolveFactcheckOnDisk(videoDir);
    }
    if (id === "P05_ANIMATIC") {
      writeFileSync(join(videoDir, "scratch.wav"), "audio");
    }
    if (id === "P06_ASSEMBLY") {
      syncStoryboardBlocksOnDisk(videoDir);
      renderValidMasterAndSheetOnDisk(videoDir);
      await h.invokeCommand("yts-approve-sheet", "aceptacion.json");
    }
    await h.invokeTool("yts_transition", {
      action: "submit",
      phase: id,
      evidence:
        id === "P05_ANIMATIC"
          ? [{ role: "scratch_track", path: "scratch.wav" }]
          : id === "P06_ASSEMBLY"
            ? [
                { role: "master", path: "master.mp4" },
                { role: "acceptance_sheet", path: "aceptacion.json" },
              ]
            : [],
    });
    await h.invokeCommand("yts-approve", id);
  }
  await h.invokeTool("yts_transition", { action: "start", phase: "P07_CLOSE" });

  // 1. Headless mode (hasUI: false) fails closed without invoking backend
  const noUi = await h.invokeTool("studio_publish", { video: "master.mp4" }, { hasUI: false });
  assert.equal(noUi.blocked, true);
  assert.match(noUi.reason, /hasUI|interfaz/i);
  assert.equal(h.getBackendSideEffects(), 0);

  // 2. Creator cancels confirmation (confirmResult: false) -> blocked, zero backend side effects
  const cancelled = await h.invokeTool(
    "studio_publish",
    { video: "master.mp4" },
    { hasUI: true, confirmResult: false },
  );
  assert.equal(cancelled.blocked, true);
  assert.match(cancelled.reason, /cancelad/i);
  assert.equal(h.getBackendSideEffects(), 0);

  // 3. Creator confirms -> allowed, backend executes once
  const confirmed = await h.invokeTool(
    "studio_publish",
    { video: "master.mp4" },
    { hasUI: true, confirmResult: true },
  );
  assert.equal(confirmed.blocked, false);
  assert.equal(h.getBackendSideEffects(), 1);
});

test("unknown MCP tool and arbitrary bash are blocked before execution with zero side effects", async (t) => {
  const { videoDir } = setupTempVideo(t);
  const h = createPiHarness({ videoDir });

  await h.invokeTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });

  const mcpRes = await h.invokeTool("mcp_unknown_mutate", { target: "01-packaging.md" });
  assert.equal(mcpRes.blocked, true);
  assert.match(mcpRes.reason, /catálogo|no está registrada/i);
  assert.equal(h.getBackendSideEffects(), 0);

  const bashRes = await h.invokeTool("bash", { command: "echo pwned > bash-ran.txt" });
  assert.equal(bashRes.blocked, true);
  assert.match(bashRes.reason, /bash|shell/i);
  assert.equal(existsSync(join(videoDir, "bash-ran.txt")), false);
});

test("attempts to escape authorized video folder via .., absolute path, symlink, or internal registry path are blocked", async (t) => {
  const { root, videoDir } = setupTempVideo(t);
  const h = createPiHarness({ videoDir });

  await h.invokeTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });

  const outsideFile = join(root, "outside.md");
  writeFileSync(outsideFile, "intacto", "utf8");
  symlinkSync(outsideFile, join(videoDir, "01-packaging-link.md"));

  for (const badPath of [
    "../outside.md",
    outsideFile,
    "01-packaging-link.md",
    ".youtube-shell/registro.json",
    "00-estado-produccion.md",
  ]) {
    const res = await h.invokeTool("write", { path: badPath, content: "malicioso" });
    assert.equal(res.blocked, true, `expected ${badPath} to be blocked`);
  }
  assert.equal(readFileSync(outsideFile, "utf8"), "intacto");
  assert.equal( DEFAULT_CAPABILITIES.some((c) => c.id === "bash"), false);
});

test("corrupt registry fails closed and blocks all tool calls", async (t) => {
  const { videoDir } = setupTempVideo(t);
  const h = createPiHarness({ videoDir });

  await h.invokeTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  writeFileSync(registryPath(videoDir), "{ corrupt json", "utf8");

  const readRes = await h.invokeTool("read", { path: "01-packaging.md" });
  assert.equal(readRes.blocked, true);
  assert.match(readRes.reason, /registro|corrupto/i);
});

test("yts_check_contract is exposed and yts_transition(submit) auto-verifies contract checks on disk", async (t) => {
  const { videoDir } = setupTempVideo(t);
  const h = createPiHarness({ videoDir });

  // 1. yts_check_contract is registered and callable in any phase
  const contractRes = await h.invokeTool("yts_check_contract", {});
  assert.equal(contractRes.blocked, false);
  assert.ok(Array.isArray(contractRes.result.details.checks));

  // 2. Advance P01 -> P02 -> P03 -> P04
  await h.invokeTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  await h.invokeTool("yts_transition", { action: "submit", phase: "P01_PACKAGING" });
  await h.invokeCommand("yts-approve", "P01_PACKAGING");

  await h.invokeTool("yts_transition", { action: "start", phase: "P02_RESEARCH" });
  await h.invokeTool("yts_transition", { action: "submit", phase: "P02_RESEARCH" });
  await h.invokeCommand("yts-approve", "P02_RESEARCH");

  await h.invokeTool("yts_transition", { action: "start", phase: "P03_SCRIPT" });
  // P03_SCRIPT auto-runs script_block_ids from 02-guion.md on disk without explicit checks param
  const scriptSubmit = await h.invokeTool("yts_transition", { action: "submit", phase: "P03_SCRIPT" });
  assert.equal(scriptSubmit.blocked, false);
  await h.invokeCommand("yts-approve", "P03_SCRIPT");

  await h.invokeTool("yts_transition", { action: "start", phase: "P04_FACTCHECK" });
  // Submitting P04_FACTCHECK while 06-fuentes Parte 2 still has PENDIENTE fails auto-check
  const badFactcheckSubmit = await h.invokeTool("yts_transition", { action: "submit", phase: "P04_FACTCHECK" });
  assert.equal(badFactcheckSubmit.blocked, true);
  assert.match(badFactcheckSubmit.reason, /factcheck_resolved/);
});

test("FilmCraft MCP inventory is gated by phase and blocks unsafe engine commands or path escapes", async (t) => {
  const { videoDir } = setupTempVideo(t);
  const h = createPiHarness({ videoDir });

  // 1. Read-only FilmCraft inspection is allowed in any phase
  const inspectRes = await h.invokeTool("sequence_inspect", {});
  assert.equal(inspectRes.blocked, false);

  // 2. Mutating FilmCraft command_run is blocked during P01_PACKAGING
  await h.invokeTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  const earlyRun = await h.invokeTool("command_run", {
    id: "file.newSequence",
    params: { name: "Pilot" },
  });
  assert.equal(earlyRun.blocked, true);
  assert.equal(h.getBackendSideEffects(), 1); // only sequence_inspect ran

  // Advance to P05_ANIMATIC EN_CURSO
  await h.invokeTool("yts_transition", { action: "submit", phase: "P01_PACKAGING" });
  await h.invokeCommand("yts-approve", "P01_PACKAGING");
  await h.invokeTool("yts_transition", { action: "start", phase: "P02_RESEARCH" });
  await h.invokeTool("yts_transition", { action: "submit", phase: "P02_RESEARCH" });
  await h.invokeCommand("yts-approve", "P02_RESEARCH");
  await h.invokeTool("yts_transition", { action: "start", phase: "P03_SCRIPT" });
  await h.invokeTool("yts_transition", { action: "submit", phase: "P03_SCRIPT" });
  await h.invokeCommand("yts-approve", "P03_SCRIPT");
  await h.invokeTool("yts_transition", { action: "start", phase: "P04_FACTCHECK" });
  resolveFactcheckOnDisk(videoDir);
  await h.invokeTool("yts_transition", {
    action: "submit",
    phase: "P04_FACTCHECK",
  });
  await h.invokeCommand("yts-approve", "P04_FACTCHECK");
  await h.invokeTool("yts_transition", { action: "start", phase: "P05_ANIMATIC" });

  // 3. Safe FilmCraft timeline command is allowed in P05_ANIMATIC
  const okRun = await h.invokeTool("command_run", {
    id: "file.newSequence",
    params: { name: "Animatic", video: 2, audio: 3 },
  });
  assert.equal(okRun.blocked, false);

  // 4. Unsafe FilmCraft command (prefs.reset or exporting over a Markdown artifact / escaping videoDir) is blocked
  const badPref = await h.invokeTool("command_run", { id: "prefs.reset", params: {} });
  assert.equal(badPref.blocked, true);

  const badExportOverwrite = await h.invokeTool("command_run", {
    id: "file.exportMedia",
    params: { path: "02-guion.md" },
  });
  assert.equal(badExportOverwrite.blocked, true);

  const badBatchEscape = await h.invokeTool("command_batch", {
    steps: [{ id: "file.saveAs", params: { path: "../outside.fcproj" } }],
  });
  assert.equal(badBatchEscape.blocked, true);
});

test("EffectCraft and SoundCraft MCP inventories are gated by phase and block unsafe engine commands, path escapes, and markdown overwrites", async (t) => {
  const { videoDir } = setupTempVideo(t);
  const h = createPiHarness({ videoDir });

  // 1. Read-only inspection is allowed in any phase
  const inspectEffect = await h.invokeTool("describe_command", { id: "comp.new" });
  assert.equal(inspectEffect.blocked, false);

  const inspectSound = await h.invokeTool("inspect_session", {});
  assert.equal(inspectSound.blocked, false);

  // 2. Mutating operations are blocked during P01_PACKAGING
  await h.invokeTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  const earlyEffect = await h.invokeTool("execute_command", { id: "comp.new", params: { name: "Intro" } });
  assert.equal(earlyEffect.blocked, true);

  const earlySound = await h.invokeTool("bounce_mix", { out: "mix.wav" });
  assert.equal(earlySound.blocked, true);

  // Advance to P05_ANIMATIC
  await h.invokeTool("yts_transition", { action: "submit", phase: "P01_PACKAGING" });
  await h.invokeCommand("yts-approve", "P01_PACKAGING");
  await h.invokeTool("yts_transition", { action: "start", phase: "P02_RESEARCH" });
  await h.invokeTool("yts_transition", { action: "submit", phase: "P02_RESEARCH" });
  await h.invokeCommand("yts-approve", "P02_RESEARCH");
  await h.invokeTool("yts_transition", { action: "start", phase: "P03_SCRIPT" });
  await h.invokeTool("yts_transition", { action: "submit", phase: "P03_SCRIPT" });
  await h.invokeCommand("yts-approve", "P03_SCRIPT");
  await h.invokeTool("yts_transition", { action: "start", phase: "P04_FACTCHECK" });
  resolveFactcheckOnDisk(videoDir);
  await h.invokeTool("yts_transition", { action: "submit", phase: "P04_FACTCHECK" });
  await h.invokeCommand("yts-approve", "P04_FACTCHECK");
  await h.invokeTool("yts_transition", { action: "start", phase: "P05_ANIMATIC" });

  // 3. In P05_ANIMATIC: EffectCraft motion graphics is allowed, SoundCraft mixing is still blocked
  const animaticEffect = await h.invokeTool("execute_command", { id: "comp.new", params: { name: "Plates" } });
  assert.equal(animaticEffect.blocked, false);

  const animaticSound = await h.invokeTool("bounce_mix", { out: "stems.wav" });
  assert.equal(animaticSound.blocked, true, "SoundCraft mixing must stay blocked until P06_ASSEMBLY");

  // Advance to P06_ASSEMBLY
  writeFileSync(join(videoDir, "scratch.wav"), "RIFF-scratch", "utf8");
  await h.invokeTool("yts_transition", {
    action: "submit",
    phase: "P05_ANIMATIC",
    evidence: [{ role: "scratch_track", path: "scratch.wav" }],
  });
  await h.invokeCommand("yts-approve", "P05_ANIMATIC");
  await h.invokeTool("yts_transition", { action: "start", phase: "P06_ASSEMBLY" });

  // 4. In P06_ASSEMBLY: Both are allowed with safe parameters
  const assemblyEffect = await h.invokeTool("save_project", { path: "animatic.ecproj" });
  assert.equal(assemblyEffect.blocked, false);

  const assemblySound = await h.invokeTool("bounce_mix", { out: "master_audio.wav" });
  assert.equal(assemblySound.blocked, false);

  // 5. Unsafe commands, Markdown overwrites and path escapes are blocked
  const badEffectCmd = await h.invokeTool("execute_command", { id: "prefs.reset" });
  assert.equal(badEffectCmd.blocked, true);

  const badSoundCmd = await h.invokeTool("execute", { cmd: "app.quit" });
  assert.equal(badSoundCmd.blocked, true);

  const badEffectOverwrite = await h.invokeTool("save_project", { path: "02-guion.md" });
  assert.equal(badEffectOverwrite.blocked, true);

  const badSoundOverwrite = await h.invokeTool("bounce_mix", { out: "03-storyboard-y-edicion.md" });
  assert.equal(badSoundOverwrite.blocked, true);

  const badEffectEscape = await h.invokeTool("open_project", { path: "../outside.ecproj" });
  assert.equal(badEffectEscape.blocked, true);

  const badSoundEscape = await h.invokeTool("save_session", { path: "../outside.scraft" });
  assert.equal(badSoundEscape.blocked, true);
});

test("renderStartupPanel renders wide and narrow studio panels and session_start + /yts-status refresh UI", async (t) => {
  const { videoDir } = setupTempVideo(t);
  const h = createPiHarness({ videoDir });

  await h.runSessionStart();
  assert.ok(h.titles.some((title) => title.includes("YouTube Shell") && title.includes("01-video")));
  assert.ok(h.statusUpdates.some((s) => s.key === "youtube-shell" && s.text?.includes("P01_PACKAGING")));

  const factory = h.getHeaderFactory();
  assert.ok(factory, "session_start must register a TUI header factory via ctx.ui.setHeader");

  const reg = loadRegistry(videoDir, { videoId: "01-video", now: "2026-10-24T12:00:00Z" });
  const ev = evaluate(reg, createFsReader(videoDir));

  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

  const wideLines = renderStartupPanel(videoDir, ev, 110, "0.5.0");
  for (const line of wideLines) {
    assert.ok(stripAnsi(line).length <= 110, `wide line exceeded 110 cols: ${stripAnsi(line).length}`);
  }
  const widePlain = wideLines.map(stripAnsi).join("\n");
  assert.match(widePlain, /YouTube Shell/);
  assert.match(widePlain, /01-video/);
  assert.match(widePlain, /Pipeline 7 Fases/);
  assert.match(widePlain, /P01_PACKAGING/);
  assert.match(widePlain, /P07_CLOSE/);
  assert.equal(widePlain.includes("[Skills]"), false);
  assert.match(widePlain, /\/yts-approve/);

  const narrowLines = renderStartupPanel(videoDir, ev, 70, "0.5.0");
  for (const line of narrowLines) {
    assert.ok(stripAnsi(line).length <= 70, `narrow line exceeded 70 cols: ${stripAnsi(line).length}`);
  }
  const narrowPlain = narrowLines.map(stripAnsi).join("\n");
  assert.match(narrowPlain, /Pipeline 7 Fases/);
  assert.match(narrowPlain, /P01_PACKAGING/);

  // /yts-status command notifies with a compact 7-phase summary and refreshes status bar
  await h.invokeCommand("yts-status");
  assert.ok(h.notifications.some((n) => n.message.includes("P01_PACKAGING") && n.message.includes("P07_CLOSE")));
});

test("agent cannot bypass contract or master checks by injecting forged PASS results in yts_transition(submit)", async (t) => {
  const { videoDir } = setupTempVideo(t);
  const h = createPiHarness({ videoDir });

  // 1. Tool schema does not advertise `checks` on yts_transition
  const transitionTool = h.tools.get("yts_transition");
  assert.ok(transitionTool);
  assert.equal("checks" in (transitionTool.parameters?.properties ?? {}), false);

  // 2. Advance to P04_FACTCHECK EN_CURSO (leaving PENDIENTE rows in 06-fuentes-y-verificacion.md)
  await h.invokeTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  await h.invokeTool("yts_transition", { action: "submit", phase: "P01_PACKAGING" });
  await h.invokeCommand("yts-approve", "P01_PACKAGING");

  await h.invokeTool("yts_transition", { action: "start", phase: "P02_RESEARCH" });
  await h.invokeTool("yts_transition", { action: "submit", phase: "P02_RESEARCH" });
  await h.invokeCommand("yts-approve", "P02_RESEARCH");

  await h.invokeTool("yts_transition", { action: "start", phase: "P03_SCRIPT" });
  await h.invokeTool("yts_transition", { action: "submit", phase: "P03_SCRIPT" });
  await h.invokeCommand("yts-approve", "P03_SCRIPT");

  await h.invokeTool("yts_transition", { action: "start", phase: "P04_FACTCHECK" });
  const beforeForgedReg = loadRegistry(videoDir, { videoId: "01-video", now: "x" });

  // Forged PASS for factcheck_resolved is rejected and registry is unchanged
  const forgedFactcheck = await h.invokeTool("yts_transition", {
    action: "submit",
    phase: "P04_FACTCHECK",
    checks: [{ id: "factcheck_resolved", result: "PASS" }],
  });
  assert.equal(forgedFactcheck.blocked, true);
  assert.match(forgedFactcheck.reason, /no puede inyectar ni sustituir resultados de checks/i);
  assert.deepEqual(loadRegistry(videoDir, { videoId: "01-video", now: "x" }), beforeForgedReg);

  // Resolve on disk and advance to P06_ASSEMBLY
  resolveFactcheckOnDisk(videoDir);
  const cleanFactcheck = await h.invokeTool("yts_transition", { action: "submit", phase: "P04_FACTCHECK" });
  assert.equal(cleanFactcheck.blocked, false);
  await h.invokeCommand("yts-approve", "P04_FACTCHECK");

  await h.invokeTool("yts_transition", { action: "start", phase: "P05_ANIMATIC" });
  writeFileSync(join(videoDir, "scratch.wav"), "RIFF-scratch", "utf8");
  await h.invokeTool("yts_transition", {
    action: "submit",
    phase: "P05_ANIMATIC",
    evidence: [{ role: "scratch_track", path: "scratch.wav" }],
  });
  await h.invokeCommand("yts-approve", "P05_ANIMATIC");

  // 3. In P06_ASSEMBLY, a master that fails the acceptance sheet cannot pass via forged checks nor via normal submit
  await h.invokeTool("yts_transition", { action: "start", phase: "P06_ASSEMBLY" });
  syncStoryboardBlocksOnDisk(videoDir);
  renderValidMasterAndSheetOnDisk(videoDir);
  writeFileSync(join(videoDir, "aceptacion.json"), "{}", "utf8");

  const forgedMaster = await h.invokeTool("yts_transition", {
    action: "submit",
    phase: "P06_ASSEMBLY",
    checks: [
      { id: "script_storyboard_ids", result: "PASS" },
      { id: "master_measurement", result: "PASS" },
    ],
    evidence: [
      { role: "master", path: "master.mp4" },
      { role: "acceptance_sheet", path: "aceptacion.json" },
    ],
  });
  assert.equal(forgedMaster.blocked, true);
  assert.match(forgedMaster.reason, /no puede inyectar ni sustituir resultados de checks/i);

  const realMasterFail = await h.invokeTool("yts_transition", {
    action: "submit",
    phase: "P06_ASSEMBLY",
    evidence: [
      { role: "master", path: "master.mp4" },
      { role: "acceptance_sheet", path: "aceptacion.json" },
    ],
  });
  assert.equal(realMasterFail.blocked, true);
  assert.match(realMasterFail.reason, /master_measurement.*FAIL/);

  // 4. Agent can write aceptacion.json during P06_ASSEMBLY, but submitting WITHOUT /yts-approve-sheet fails even if JSON says approvedBeforeRender=true
  renderValidMasterAndSheetOnDisk(videoDir);
  const validSheetJson = readFileSync(join(videoDir, "aceptacion.json"), "utf8");
  const writeSheetRes = await h.invokeTool("write", {
    path: "aceptacion.json",
    content: validSheetJson,
  });
  assert.equal(writeSheetRes.blocked, false, "P06_ASSEMBLY must allow writing aceptacion.json");

  const unapprovedSheetSubmit = await h.invokeTool("yts_transition", {
    action: "submit",
    phase: "P06_ASSEMBLY",
    evidence: [
      { role: "master", path: "master.mp4" },
      { role: "acceptance_sheet", path: "aceptacion.json" },
    ],
  });
  assert.equal(unapprovedSheetSubmit.blocked, true);
  assert.match(unapprovedSheetSubmit.reason, /\/yts-approve-sheet/);

  // 5. Creator approves the sheet via /yts-approve-sheet, then agent tampers with aceptacion.json -> hash mismatch blocks submit
  await h.invokeCommand("yts-approve-sheet", "aceptacion.json");
  await h.invokeTool("write", {
    path: "aceptacion.json",
    content: `${validSheetJson}\n`,
  });
  const tamperedSheetSubmit = await h.invokeTool("yts_transition", {
    action: "submit",
    phase: "P06_ASSEMBLY",
    evidence: [
      { role: "master", path: "master.mp4" },
      { role: "acceptance_sheet", path: "aceptacion.json" },
    ],
  });
  assert.equal(tamperedSheetSubmit.blocked, true);
  assert.match(tamperedSheetSubmit.reason, /\/yts-approve-sheet|modificad|cambi/i);

  // 6. Creator re-approves the exact sheet on disk -> runtime measures and stamps verifiedBy="runtime"
  await h.invokeCommand("yts-approve-sheet", "aceptacion.json");
  const realMasterPass = await h.invokeTool("yts_transition", {
    action: "submit",
    phase: "P06_ASSEMBLY",
    evidence: [
      { role: "master", path: "master.mp4" },
      { role: "acceptance_sheet", path: "aceptacion.json" },
    ],
  });
  assert.equal(realMasterPass.blocked, false);
  const regAfterAssembly = loadRegistry(videoDir, { videoId: "01-video", now: "x" });
  const masterCheck = regAfterAssembly.phases.P06_ASSEMBLY.submission?.checks.find(
    (c) => c.id === "master_measurement",
  );
  assert.equal(masterCheck?.result, "PASS");
  assert.equal(masterCheck?.verifiedBy, "runtime");
});

test("read_only consultation during an active phase removes write/edit from active tools and blocks writing or editing an otherwise-allowed file", async (t) => {
  const { videoDir } = setupTempVideo(t);
  const h = createPiHarness({ videoDir });

  // Advance to P03_SCRIPT EN_CURSO so 02-guion.md is an allowed file for the active phase
  await h.invokeTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  await h.invokeTool("yts_transition", { action: "submit", phase: "P01_PACKAGING" });
  await h.invokeCommand("yts-approve", "P01_PACKAGING");
  await h.invokeTool("yts_transition", { action: "start", phase: "P02_RESEARCH" });
  await h.invokeTool("yts_transition", { action: "submit", phase: "P02_RESEARCH" });
  await h.invokeCommand("yts-approve", "P02_RESEARCH");
  await h.invokeTool("yts_transition", { action: "start", phase: "P03_SCRIPT" });

  const scriptPath = join(videoDir, "02-guion.md");
  const origScript = readFileSync(scriptPath, "utf8");

  // Creator sends a read-only consultation prompt while P03_SCRIPT is EN_CURSO
  const turn = await h.runBeforeAgentStart(
    "Prompt base",
    "consulta: revisa este guion y dime qué mejorarías",
  );
  assert.match(turn.systemPrompt, /Ruta de solo lectura/);
  assert.equal(turn.activeTools.includes("write"), false, "write must be removed in read_only mode");
  assert.equal(turn.activeTools.includes("edit"), false, "edit must be removed in read_only mode");
  assert.equal(turn.activeTools.includes("yts_transition"), false, "yts_transition must be removed in read_only mode");
  assert.equal(turn.activeTools.includes("read"), true, "read must stay active in read_only mode");
  assert.equal(turn.activeTools.includes("yts_status"), true, "yts_status must stay active in read_only mode");

  // Even if the model invokes write or edit on the active phase file 02-guion.md, tool_call blocks it
  const writeAttempt = await h.invokeTool("write", {
    path: "02-guion.md",
    content: "Guion sobrescrito durante una consulta",
  });
  assert.equal(writeAttempt.blocked, true);
  assert.match(writeAttempt.reason, /solo lectura/i);
  assert.equal(readFileSync(scriptPath, "utf8"), origScript);

  const editAttempt = await h.invokeTool("edit", {
    path: "02-guion.md",
    oldText: "B01",
    newText: "B99",
  });
  assert.equal(editAttempt.blocked, true);
  assert.match(editAttempt.reason, /solo lectura/i);
  assert.equal(readFileSync(scriptPath, "utf8"), origScript);
});

test("read_only consultation blocks yts_transition at tool_call and direct execute with zero registry side effects", async (t) => {
  const { videoDir } = setupTempVideo(t);
  const h = createPiHarness({ videoDir });

  // Start P01_PACKAGING in production mode first
  await h.runBeforeAgentStart("Prompt base", "Inicia P01_PACKAGING");
  const startRes = await h.invokeTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  assert.equal(startRes.blocked, false);
  const regBefore = readFileSync(registryPath(videoDir), "utf8");

  // Switch to a read-only consultation turn
  await h.runBeforeAgentStart("Prompt base", "consulta: audita el estado actual sin tocar nada");

  // 1. Attempting yts_transition via tool_call is blocked
  const submitAttempt = await h.invokeTool("yts_transition", {
    action: "submit",
    phase: "P01_PACKAGING",
  });
  assert.equal(submitAttempt.blocked, true);
  assert.match(submitAttempt.reason, /solo lectura/i);
  assert.equal(readFileSync(registryPath(videoDir), "utf8"), regBefore);

  // 2. Even direct invocation of yts_transition.execute is rejected in read_only mode
  const transitionTool = h.tools.get("yts_transition");
  assert.ok(transitionTool);
  const directOut = await transitionTool.execute(
    "tc-direct",
    { action: "submit", phase: "P01_PACKAGING" },
    undefined,
    undefined,
    { cwd: videoDir, hasUI: true },
  );
  assert.equal(directOut.isError, true);
  assert.equal(readFileSync(registryPath(videoDir), "utf8"), regBefore);

  // 3. Subsequent production turn restores production capabilities
  const prodTurn = await h.runBeforeAgentStart(
    "Prompt base",
    "Envía P01_PACKAGING a revisión con submit",
  );
  assert.equal(prodTurn.activeTools.includes("write"), true);
  assert.equal(prodTurn.activeTools.includes("yts_transition"), true);
  const prodSubmit = await h.invokeTool("yts_transition", {
    action: "submit",
    phase: "P01_PACKAGING",
  });
  assert.equal(prodSubmit.blocked, false);
});

test("corrupt or invalid framework techniques registry fails closed and blocks transitions and mutations in the runtime", async (t) => {
  const { root, videoDir } = setupTempVideo(t);
  const badTechPath = join(root, "bad-registro-tecnicas.md");
  writeFileSync(
    badTechPath,
    [
      "| ID | Técnica | Fundamento | Validación Propia | Fuerza Operativa | Ámbito | Ubicación | Fuente | Próxima Acción |",
      "| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- | :--- |",
      "| **`GATE-001`** | Inválida | CONTRATO_ROTO | SIN_PROBAR | **FUERZA_ERRONEA** | Ámbito | Ubicación | Fuente | Acción |",
    ].join("\n"),
    "utf8",
  );

  const h = createPiHarness({
    videoDir,
    techniquesPath: badTechPath,
  });

  // 1. Tool call hook blocks yts_transition when framework integrity fails
  const transBlock = await h.invokeTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  assert.equal(transBlock.blocked, true);
  assert.match(transBlock.reason, /integridad del framework ha fallado/);

  // 2. Direct execute of yts_transition also returns error without mutating registry
  assert.equal(existsSync(registryPath(videoDir)), false);
  const transitionTool = h.tools.get("yts_transition");
  const directOut = await transitionTool.execute(
    "tc-1",
    { action: "start", phase: "P01_PACKAGING" },
    undefined,
    undefined,
    { cwd: videoDir, hasUI: true },
  );
  assert.equal(directOut.isError, true);
  assert.match(directOut.content[0].text, /integridad del framework ha fallado/);
  assert.equal(existsSync(registryPath(videoDir)), false);

  // 3. Mutating write tools are also blocked
  const writeBlock = await h.invokeTool("write", { path: "01-packaging.md", content: "hack" });
  assert.equal(writeBlock.blocked, true);
  assert.match(writeBlock.reason, /integridad del framework ha fallado/);
});




