import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PHASE_PLAYBOOKS,
  buildThreeLayerPrompt,
  classifyWorkMode,
  detectWorkspaceLink,
  resolveLayer3References,
  resolveWorkflowContext,
} from "../src/core/context-resolver.ts";
import { createRegistry, evaluate, startPhase } from "../src/core/machine.ts";
import { PHASE_IDS } from "../src/core/phases.ts";
import { createFsReader, loadRegistry, scaffoldVideoDir } from "../src/store/fs-store.ts";
import { createYoutubeShellExtension } from "../src/gate/pi-extension.ts";

const ROOT = join(import.meta.dirname, "..");
const TEMPLATES = join(ROOT, "templates", "pipeline-video");

test("classifyWorkMode distinguishes read-only consultations/audits from production requests", () => {
  assert.equal(classifyWorkMode(" Produce el guion de la fase 3", false), "read_only");
  assert.equal(classifyWorkMode("consulta: ¿en qué fase estamos?", true), "read_only");
  assert.equal(classifyWorkMode("Audita el estado del proyecto en solo lectura", true), "read_only");
  assert.equal(classifyWorkMode("Explica qué estado tiene el video actual", true), "read_only");
  assert.equal(classifyWorkMode("Revisa en modo lectura las fuentes", true), "read_only");

  assert.equal(classifyWorkMode("Inicia P01_PACKAGING y redacta los 5 títulos", true), "production");
  assert.equal(classifyWorkMode("Audita y edita 02-guion.md para corregir el bloque B01", true), "production");
  assert.equal(classifyWorkMode("Continúa con la producción del video", true), "production");
});

test("PHASE_PLAYBOOKS maps all 7 phases to their primary skill and specialized role", () => {
  for (const id of PHASE_IDS) {
    const pb = PHASE_PLAYBOOKS[id];
    assert.ok(pb, `missing playbook for ${id}`);
    assert.ok(pb.skill.startsWith("yts-"), `${id}: invalid skill ${pb.skill}`);
    assert.ok(pb.role.length > 5, `${id}: role must be descriptive`);
    assert.ok(
      Array.isArray(pb.mandatoryReferences) && pb.mandatoryReferences.length > 0,
      `${id}: must declare mandatoryReferences`,
    );
    assert.ok(
      Array.isArray(pb.conditionalReferences) && pb.conditionalReferences.length > 0,
      `${id}: must declare conditionalReferences`,
    );
    assert.ok(
      typeof pb.requiredDeliverableEvidence === "string" && pb.requiredDeliverableEvidence.length >= 15,
      `${id}: must declare requiredDeliverableEvidence`,
    );
    assert.ok(
      pb.verificationBoundary &&
        pb.verificationBoundary.runtimeDeterministic.length >= 10 &&
        pb.verificationBoundary.humanEditorial.length >= 10,
      `${id}: must declare verificationBoundary (runtimeDeterministic + humanEditorial)`,
    );
  }
  assert.equal(PHASE_PLAYBOOKS.P01_PACKAGING.skill, "yts-packaging-miniaturas");
  assert.equal(PHASE_PLAYBOOKS.P02_RESEARCH.skill, "yts-investigacion-ideas");
  assert.equal(PHASE_PLAYBOOKS.P03_SCRIPT.skill, "yts-guion-narrativa");
  assert.equal(PHASE_PLAYBOOKS.P04_FACTCHECK.skill, "yts-guion-narrativa");
  assert.equal(PHASE_PLAYBOOKS.P05_ANIMATIC.skill, "yts-direccion-edicion");
  assert.equal(PHASE_PLAYBOOKS.P06_ASSEMBLY.skill, "yts-direccion-edicion");
  assert.equal(PHASE_PLAYBOOKS.P07_CLOSE.skill, "yts-orquestador");
});

test("detectWorkspaceLink auto-detects officeRoot and channelDir from mis-canales or canales-en-estudio hierarchy, and scaffoldVideoDir persists it", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-ctx-office-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const officeRoot = join(tmp, "youtube-office");
  const channelDir = join(officeRoot, "mis-canales", "canal-ciencia");
  const videoDir = join(channelDir, "videos-en-estudio", "01-piloto");
  mkdirSync(join(officeRoot, "_framework"), { recursive: true });
  writeFileSync(join(officeRoot, "ideas.md"), "# Ideas globales y vetadas\n", "utf8");
  writeFileSync(join(officeRoot, "referentes.md"), "# Referentes\n", "utf8");
  mkdirSync(channelDir, { recursive: true });
  writeFileSync(join(channelDir, "backlog-ideas.md"), "# Backlog del canal\n", "utf8");
  writeFileSync(join(channelDir, "banco-de-titulos.md"), "# Banco de títulos\n", "utf8");

  const detected = detectWorkspaceLink(videoDir);
  assert.ok(detected);
  assert.equal(detected.officeRoot, officeRoot);
  assert.equal(detected.channelDir, channelDir);

  const { registry } = scaffoldVideoDir(videoDir, { now: "2026-10-24T10:00:00Z" });
  assert.ok(registry.workspaceLink);
  assert.equal(registry.workspaceLink.officeRoot, officeRoot);
  assert.equal(registry.workspaceLink.channelDir, channelDir);
  assert.equal(registry.workspaceLink.linkedAt, "2026-10-24T10:00:00Z");

  const layer3 = resolveLayer3References(videoDir, registry, "P02_RESEARCH");
  assert.equal(layer3.officeFiles.some((f) => f.name === "ideas.md" && f.exists), true);
  assert.equal(layer3.officeFiles.some((f) => f.name === "banco-visual.md" && !f.exists), true);
  assert.equal(layer3.channelFiles.some((f) => f.name === "backlog-ideas.md" && f.exists), true);
  assert.equal(layer3.frameworkReferences.length >= 2, true);
});

test("buildThreeLayerPrompt renders Layer 1 (Orchestrator), Layer 2 (Active Phase Playbook), and Layer 3 (References & Workspace Link)", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-ctx-prompt-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const videoDir = join(tmp, "01-video");
  cpSync(TEMPLATES, videoDir, { recursive: true });

  const reader = createFsReader(videoDir);
  let reg = createRegistry("01-video", "2026-10-24T10:00:00Z");
  const started = startPhase(reg, "P01_PACKAGING", {
    actor: { kind: "agent" },
    reader,
    now: "2026-10-24T10:01:00Z",
  });
  assert.equal(started.ok, true);
  if (!started.ok) return;
  reg = started.registry;

  const ev = evaluate(reg, reader);
  const resolved = resolveWorkflowContext({
    videoDir,
    promptText: "Redacta las 5 opciones de títulos en 01-packaging.md",
    reg,
    evaluation: ev,
    hasRegistry: true,
  });

  assert.equal(resolved.workMode, "production");
  assert.equal(resolved.targetPhase, "P01_PACKAGING");
  assert.equal(resolved.playbook.skill, "yts-packaging-miniaturas");

  const prompt = buildThreeLayerPrompt(resolved);
  assert.match(prompt, /\[Capa 1 — Orquestador Permanente\]/);
  assert.match(prompt, /Ruta de producción audiovisual/);
  assert.match(prompt, /\[Capa 2 — Playbook de Fase Activa\]/);
  assert.match(prompt, /yts-packaging-miniaturas/);
  assert.match(prompt, /01-packaging\.md/);
  assert.match(prompt, /Referencias obligatorias de la fase:/);
  assert.match(prompt, /Referencias condicionales:/);
  assert.match(prompt, /Constancia de aplicación exigida en el entregable:/);
  assert.match(prompt, /Frontera de verificación \(Runtime vs\. Editorial humano\):/);
  assert.match(prompt, /\[Capa 3 — Referencias Bajo Demanda y Vínculo de Oficina\/Canal\]/);
  assert.match(prompt, /\/yts-link/);
});

test("/yts-link command links an isolated video folder to an office and channel directory and updates before_agent_start prompt", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-link-cmd-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const officeDir = join(tmp, "oficina");
  const channelDir = join(officeDir, "mis-canales", "canal-x");
  const videoDir = join(tmp, "carpeta-aislada", "01-video");
  mkdirSync(channelDir, { recursive: true });
  writeFileSync(join(officeDir, "ideas.md"), "# Ideas\n", "utf8");
  writeFileSync(join(channelDir, "backlog-ideas.md"), "# Backlog\n", "utf8");
  scaffoldVideoDir(videoDir, { now: "2026-10-24T12:00:00Z" });

  const commands = new Map<string, any>();
  const hooks = new Map<string, Array<(event: any, ctx: any) => any>>();
  const notifications: Array<{ message: string; level: string }> = [];

  const ext = createYoutubeShellExtension({ now: () => "2026-10-24T12:05:00Z" });
  ext({
    on(event: string, fn: any) {
      const list = hooks.get(event) ?? [];
      list.push(fn);
      hooks.set(event, list);
    },
    registerTool() {},
    registerCommand(name: string, def: any) {
      commands.set(name, def);
    },
    getAllTools: () => [{ name: "read" }],
    setActiveTools() {},
  });

  const ctx = {
    cwd: videoDir,
    hasUI: true,
    ui: {
      notify(message: string, level = "info") {
        notifications.push({ message, level });
      },
      async confirm() {
        return true;
      },
    },
  };

  const linkCmd = commands.get("yts-link");
  assert.ok(linkCmd, "/yts-link command must be registered");
  await linkCmd.handler(`${officeDir} ${channelDir}`, ctx);

  const reg = loadRegistry(videoDir, { videoId: "01-video", now: "2026-10-24T12:06:00Z" });
  assert.ok(reg.workspaceLink);
  assert.equal(reg.workspaceLink.officeRoot, officeDir);
  assert.equal(reg.workspaceLink.channelDir, channelDir);
  assert.ok(notifications.some((n) => n.level === "info" && n.message.includes(officeDir)));

  const beforeStart = hooks.get("before_agent_start")?.[0];
  assert.ok(beforeStart);
  const out = await beforeStart({ prompt: "consulta: revisa el estado", systemPrompt: "Base" }, ctx);
  assert.match(out.systemPrompt, /Ruta de solo lectura/);
  assert.match(out.systemPrompt, new RegExp(officeDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("buildThreeLayerPrompt adapts P05_ANIMATIC evidence to the active production mode (Screen-First)", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-ctx-mode-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const videoDir = join(tmp, "01-video");
  cpSync(TEMPLATES, videoDir, { recursive: true });

  // Mark Screen-First in 00-estado-produccion.md
  const statusFile = join(videoDir, "00-estado-produccion.md");
  const orig = readFileSync(statusFile, "utf8");
  writeFileSync(
    statusFile,
    orig.replace(
      "- **Flujo Audiovisual seleccionado:** `[ ] Audio-First` / `[ ] Screen-First` / `[ ] Speaker-First` / `[ ] Music-First`",
      "- **Flujo Audiovisual seleccionado:** `[ ] Audio-First` / `[x] Screen-First` / `[ ] Speaker-First` / `[ ] Music-First`",
    ),
    "utf8",
  );

  const reader = createFsReader(videoDir);
  let reg = createRegistry("01-video", "2026-10-24T10:00:00Z");
  // Set P05 as active
  reg.phases.P01_PACKAGING.status = "APROBADO";
  reg.phases.P01_PACKAGING.approvals = [{
    actor: { kind: "creator", channel: "test" },
    approvedAt: "2026-10-24T10:01:00Z",
    contractVersion: 1,
    artifacts: [],
    checks: [],
    acknowledgedWarnings: [],
  }];
  reg.phases.P02_RESEARCH.status = "APROBADO";
  reg.phases.P02_RESEARCH.approvals = [reg.phases.P01_PACKAGING.approvals[0]];
  reg.phases.P03_SCRIPT.status = "APROBADO";
  reg.phases.P03_SCRIPT.approvals = [reg.phases.P01_PACKAGING.approvals[0]];
  reg.phases.P04_FACTCHECK.status = "APROBADO";
  reg.phases.P04_FACTCHECK.approvals = [reg.phases.P01_PACKAGING.approvals[0]];
  reg.phases.P05_ANIMATIC.status = "EN_CURSO";

  const ev = evaluate(reg, reader);
  const resolved = resolveWorkflowContext({
    videoDir,
    promptText: "montar animatic de pantalla",
    reg,
    evaluation: ev,
    hasRegistry: true,
  });

  assert.equal(resolved.targetPhase, "P05_ANIMATIC");
  assert.equal(resolved.layer3.productionMode, "screen_first");

  const prompt = buildThreeLayerPrompt(resolved);
  assert.match(prompt, /Flujo audiovisual activo: Screen-First \/ Action-First/);
  assert.match(prompt, /screen_recording/);
  assert.equal(prompt.includes("scratch_track"), false, "Prompt for Screen-First must not demand scratch_track");
});
