import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createYoutubeShellExtension } from "../src/gate/pi-extension.ts";
import { DEFAULT_CAPABILITIES, type ToolCapabilityEntry } from "../src/gate/capabilities.ts";
import { createFsReader, loadRegistry, registryPath } from "../src/store/fs-store.ts";
import { evaluate } from "../src/core/machine.ts";

const TEMPLATES = join(import.meta.dirname, "..", "templates", "pipeline-video");

interface HarnessOptions {
  videoDir: string;
  hasUI?: boolean;
  confirmResult?: boolean;
  extraCapabilities?: ToolCapabilityEntry[];
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
  let activeTools = ["read", "write", "edit", "bash", "mcp_unknown_mutate"];
  const notifications: Array<{ message: string; level: string }> = [];
  const confirmations: Array<{ title: string; message: string }> = [];
  let backendSideEffects = 0;

  const pi = {
    on(event: string, handler: (event: any, ctx: any) => any) {
      const list = hooks.get(event) ?? [];
      list.push(handler);
      hooks.set(event, list);
    },
    registerTool(def: any) {
      tools.set(def.name, def);
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
      return activeTools.map((name) => ({ name }));
    },
  };

  const ext = createYoutubeShellExtension({
    extraCapabilities: opts.extraCapabilities,
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
      },
    };
  };

  async function runBeforeAgentStart(systemPrompt = "Base prompt") {
    const ctx = makeCtx();
    let currentPrompt = systemPrompt;
    for (const handler of hooks.get("before_agent_start") ?? []) {
      const res = await handler(
        {
          prompt: "Hola",
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

  return {
    pi,
    tools,
    commands,
    notifications,
    confirmations,
    getBackendSideEffects: () => backendSideEffects,
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
    checks: [{ id: "script_block_ids", result: "PASS" }],
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
    if (id === "P05_ANIMATIC") {
      writeFileSync(join(videoDir, "scratch.wav"), "audio");
    }
    if (id === "P06_ASSEMBLY") {
      writeFileSync(join(videoDir, "master.mp4"), "video");
      writeFileSync(join(videoDir, "aceptacion.json"), "{}");
    }
    await h.invokeTool("yts_transition", { action: "start", phase: id });
    await h.invokeTool("yts_transition", {
      action: "submit",
      phase: id,
      checks:
        id === "P03_SCRIPT"
          ? [{ id: "script_block_ids", result: "PASS" }]
          : id === "P04_FACTCHECK"
            ? [{ id: "factcheck_resolved", result: "PASS" }]
            : id === "P06_ASSEMBLY"
              ? [
                  { id: "script_storyboard_ids", result: "PASS" },
                  { id: "master_measurement", result: "PASS" },
                ]
              : [],
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
  await h.invokeTool("yts_transition", {
    action: "submit",
    phase: "P04_FACTCHECK",
    checks: [{ id: "factcheck_resolved", result: "PASS" }],
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


