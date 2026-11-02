import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createYoutubeShellExtension } from "../src/gate/pi-extension.ts";
import { evaluate, submitPhase } from "../src/core/machine.ts";
import { createFsReader, loadRegistry, saveRegistry } from "../src/store/fs-store.ts";
import { listRunManifests, loadRunEvents, loadRunManifest } from "../src/store/run-ledger.ts";

interface ScriptedHarnessOptions {
  videoDir: string;
  hasUI?: boolean;
  confirmResult?: boolean;
  packageRoot?: string;
}

function createScriptedAssuranceHarness(opts: ScriptedHarnessOptions) {
  const hooks = new Map<string, Array<(event: any, ctx: any) => any>>();
  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const allTools = ["read", "write", "edit", "bash"];
  let activeTools = [...allTools];
  const notifications: Array<{ message: string; level: string }> = [];
  let clockSeq = 0;

  const nextNow = () => {
    clockSeq += 1;
    const sec = String(clockSeq % 60).padStart(2, "0");
    const min = String(Math.floor(clockSeq / 60) % 60).padStart(2, "0");
    return `2026-11-01T15:${min}:${sec}Z`;
  };

  const pi = {
    on(event: string, handler: (event: any, ctx: any) => any) {
      const list = hooks.get(event) ?? [];
      list.push(handler);
      hooks.set(event, list);
    },
    registerTool(def: any) {
      tools.set(def.name, def);
      if (!allTools.includes(def.name)) allTools.push(def.name);
      if (!activeTools.includes(def.name)) activeTools.push(def.name);
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
    now: nextNow,
    packageRoot: opts.packageRoot,
  });
  ext(pi);

  const makeCtx = () => ({
    cwd: opts.videoDir,
    hasUI: opts.hasUI ?? true,
    mode: "tui",
    ui: {
      notify(message: string, level = "info") {
        notifications.push({ message, level });
      },
      async confirm(_title: string, _message: string) {
        return opts.confirmResult ?? true;
      },
      setStatus() {},
      setTitle() {},
      setHeader() {},
    },
  });

  let callCounter = 0;

  async function startAgentRun(prompt: string) {
    const ctx = makeCtx();
    let currentPrompt = "Base system prompt";
    for (const handler of hooks.get("before_agent_start") ?? []) {
      const res = await handler(
        {
          type: "before_agent_start",
          messageType: "user",
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

  async function callTool(toolName: string, input: Record<string, any>) {
    callCounter += 1;
    const toolCallId = `tc-${callCounter}`;
    const ctx = makeCtx();
    const callEvent = { type: "tool_call", toolCallId, toolName, input: structuredClone(input) };

    for (const handler of hooks.get("tool_call") ?? []) {
      const decision = await handler(callEvent, ctx);
      if (decision?.block) {
        return { blocked: true as const, reason: String(decision.reason ?? "blocked") };
      }
    }

    let result: any;
    let isError = false;

    if (toolName === "read") {
      const repoRoot = opts.packageRoot ?? join(import.meta.dirname, "..");
      const candidateInVideo = input.path.startsWith("/") ? input.path : join(opts.videoDir, input.path);
      const candidateInPkg = input.path.startsWith("/") ? input.path : join(repoRoot, input.path);
      const target = existsSync(candidateInVideo) ? candidateInVideo : candidateInPkg;
      if (!existsSync(target)) {
        isError = true;
        result = { content: [{ type: "text", text: "ENOENT" }], isError: true };
      } else {
        const text = readFileSync(target, "utf8");
        result = { content: [{ type: "text", text }] };
      }
    } else if (toolName === "write") {
      const target = join(opts.videoDir, input.path);
      writeFileSync(target, String(input.content ?? ""), "utf8");
      result = { content: [{ type: "text", text: "written" }] };
    } else if (toolName === "edit") {
      const target = join(opts.videoDir, input.path);
      const prev = readFileSync(target, "utf8");
      const next = prev.replace(String(input.oldText), String(input.newText));
      writeFileSync(target, next, "utf8");
      result = { content: [{ type: "text", text: "edited" }] };
    } else if (tools.has(toolName)) {
      const def = tools.get(toolName);
      result = await def.execute(toolCallId, callEvent.input, undefined, undefined, ctx);
      isError = Boolean(result?.isError);
    }

    for (const handler of hooks.get("tool_result") ?? []) {
      await handler(
        {
          type: "tool_result",
          toolCallId,
          toolName,
          input: callEvent.input,
          content: result?.content ?? [],
          isError,
          details: result?.details,
        },
        ctx,
      );
    }

    for (const handler of hooks.get("tool_execution_end") ?? []) {
      await handler(
        {
          type: "tool_execution_end",
          toolCallId,
          toolName,
          result,
          isError,
          durationMs: 5,
        },
        ctx,
      );
    }

    return { blocked: false as const, isError, result };
  }

  async function settleAgentRun(aborted = false) {
    const ctx = makeCtx();
    for (const handler of hooks.get("agent_settled") ?? []) {
      await handler({ type: "agent_settled", aborted }, ctx);
    }
  }

  async function runCommand(name: string, args = "") {
    const cmd = commands.get(name);
    assert.ok(cmd, `Command /${name} is not registered`);
    await cmd.handler(args, makeCtx());
  }

  return {
    notifications,
    startAgentRun,
    callTool,
    settleAgentRun,
    runCommand,
  };
}

test("Scenario 1 (Consulta en modo lectura): disables write tools and settles run as NOT_APPLICABLE", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-e2e-s1-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const h = createScriptedAssuranceHarness({ videoDir: tmp });
  await h.runCommand("yts-init");

  const start = await h.startAgentRun("consulta: qué estado tiene este video");
  assert.equal(start.activeTools.includes("write"), false);
  assert.equal(start.activeTools.includes("edit"), false);
  assert.equal(start.activeTools.includes("yts_transition"), false);
  assert.equal(start.activeTools.includes("yts_status"), true);

  await h.callTool("yts_status", {});
  await h.settleAgentRun(false);

  const runs = listRunManifests(tmp);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].workMode, "read_only");
  assert.equal(runs[0].status, "NOT_APPLICABLE");

  await h.runCommand("yts-audit");
  const lastNote = h.notifications.at(-1);
  assert.match(lastNote?.message ?? "", /NOT_APPLICABLE/);
  assert.match(lastNote?.message ?? "", /Solo lectura/);
});

test("Scenario 2 (Inicio y envío verificado de P01): attests skill/references, observes read, executes check and settles as PASSED", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-e2e-s2-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const h = createScriptedAssuranceHarness({ videoDir: tmp });
  await h.runCommand("yts-init");

  await h.startAgentRun("Inicia y completa el packaging en P01_PACKAGING");
  await h.callTool("read", { path: "skills/yts-packaging-miniaturas/SKILL.md" });
  await h.callTool("read", { path: "01-packaging.md" });
  const trStart = await h.callTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  assert.equal(trStart.blocked, false);

  const completedPkg = `# 01 - Packaging: Títulos y Miniaturas
## 1. Estrategia Psicológica y Promesa de Trama (Pre-Guion)
- **Ángulo Psicológico Principal:** Curiosidad y mecanismo oculto
- **Promesa Central del Video (Plot Promise):** Explicar por qué una deriva de 30 nanosegundos en un oscilador de cesio colapsaría la sincronización global.
- ** Filtro Anti-Clickbait:** El experimento de deriva se resuelve en el minuto 4 con datos del BIPM.

## 2. Opciones de Títulos (Mínimo 5 Alternativas Creativas)
1. Por qué los relojes atómicos pierden un segundo (palanca usada: Curiosidad / Paradoja)
2. El error oculto que casi apaga el GPS mundial (palanca usada: Miedo / Riesgo sistémico)
3. Cómo una oscilación de cesio sostiene Internet (palanca usada: Mecanismo oculto)
4. 30 nanosegundos: el límite físico de la red eléctrica (palanca usada: Especificidad numérica)
5. Lo que la física cuántica cambió en tu teléfono hoy (palanca usada: Relevancia directa)

- **Título Principal Seleccionado:** El error oculto que casi apaga el GPS mundial
- **Justificación del título elegido:** Conecta un riesgo cotidiano tangible con el mecanismo físico real del oscilador de cesio.

## 3. Variantes de Miniatura (Thumbnails)
### Miniatura A (Principal)
- **Brecha de Curiosidad:** Story
- **Punto focal principal (Hero):** Satélite GPS con reloj digital marcando ERROR -0.00003s
- **Texto en miniatura:** 30 NANOSEGUNDOS
- **Prompt para generador de imágenes / boceto:** Fotografía macro realista de reloj atómico de cesio con alerta roja.

### Miniatura B (Variante de Contraste - para Prueba Nativa en Video Largo o histórico)
- **Brecha de Curiosidad:** Result
- **Concepto diferencial respecto a la Variante A:** Mapa mundial apagándose por zonas horarias.
- **Prompt / boceto:** Ilustración técnica de red global perdiendo sincronización.

### Miniatura C (Variante Radical - para Prueba Nativa en Video Largo o histórico)
- **Brecha de Curiosidad:** Novelty
- **Concepto diferencial:** Comparativa visual entre un reloj mecánico suizo y una trampa láser de átomos.
- **Prompt / boceto:** Split screen macro entre engranaje mecánico y haz láser azul en cámara de vacío.

## 4. Control de Calidad Pre-Guion (Checklist)
- [x] **Coherencia con el Canal:** ¿Este empaque encaja naturalmente con los pilares del canal?
- [x] **Prueba del Scroll (Mobile Test):** ¿La miniatura A y B se entienden perfectamente reducidas al tamaño de un sello postal?
- [x] **No-Redundancia:** ¿El texto de la miniatura es diferente a las palabras exactas del título?
`;
  const wrPkg = await h.callTool("write", { path: "01-packaging.md", content: completedPkg });
  assert.equal(wrPkg.blocked, false);

  const trSubmit = await h.callTool("yts_transition", { action: "submit", phase: "P01_PACKAGING" });
  assert.equal(trSubmit.blocked, false);
  await h.settleAgentRun(false);

  const runs = listRunManifests(tmp);
  assert.equal(runs.length, 1);
  const run = runs[0];
  assert.equal(run.assignedSkill, "yts-packaging-miniaturas");
  assert.equal(run.context.expectedSkill.exists, true);
  assert.equal(run.context.expectedSkill.deliveredInPrompt, true);
  assert.equal(run.context.expectedSkill.readByAgent, true);
  assert.equal(
    run.context.mandatoryReferences.find((r) => r.targetFile === "01-packaging.md")?.readByAgent,
    true,
  );
  const pkgCheck = run.checks.find((c) => c.check_id === "packaging_structure");
  assert.equal(pkgCheck?.executed, true);
  assert.equal(pkgCheck?.verdict, "PASS");
  assert.equal(pkgCheck?.verified_by, "runtime");
  assert.equal(run.status, "PASSED");

  const events = loadRunEvents(tmp, run.runId);
  assert.ok(events.some((e) => e.type === "context_attested"));
  assert.ok(events.some((e) => e.type === "reference_read"));
  assert.ok(events.some((e) => e.type === "check_executed"));
  assert.ok(events.some((e) => e.type === "phase_transition"));
  assert.ok(events.some((e) => e.type === "run_settled"));
});

test("Scenario 3 (Fase incorrecta): blocks unallowed tool or phase jump and settles run as BLOCKED", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-e2e-s3-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const h = createScriptedAssuranceHarness({ videoDir: tmp });
  await h.runCommand("yts-init");

  await h.startAgentRun("Salta directo a redactar el guion P03_SCRIPT");
  const blockedJump = await h.callTool("yts_transition", { action: "start", phase: "P03_SCRIPT" });
  assert.equal(blockedJump.blocked, true);

  const blockedWrite = await h.callTool("write", {
    path: "02-guion.md",
    content: "# Intento ilegal",
  });
  assert.equal(blockedWrite.blocked, true);
  await h.settleAgentRun(false);

  const run = listRunManifests(tmp).at(-1)!;
  assert.equal(run.status, "BLOCKED");
  assert.equal(run.actions.blockedTools.length, 2);
  assert.ok(run.incidents.some((i) => i.kind === "transition_denied"));
  assert.ok(run.incidents.some((i) => i.kind === "tool_blocked"));
});

test("Scenario 4 (Referencia obligatoria ausente): records missing_reference incident and classifies run as DEGRADED", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-e2e-s4-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const h = createScriptedAssuranceHarness({ videoDir: tmp });
  await h.runCommand("yts-init");
  unlinkSync(join(tmp, "01-packaging.md"));

  await h.startAgentRun("Avanza packaging");
  await h.settleAgentRun(false);

  const run = listRunManifests(tmp).at(-1)!;
  assert.equal(run.status, "DEGRADED");
  assert.ok(run.incidents.some((i) => i.kind === "missing_reference"));

  await h.runCommand("yts-audit", run.runId);
  assert.match(h.notifications.at(-1)?.message ?? "", /DEGRADED/);
  assert.match(h.notifications.at(-1)?.message ?? "", /Incompletas \(faltan: 01-packaging\.md\)/);
});

test("Scenario 5 (Cambio tras aprobación): fingerprint mismatch invalidates approval to OBSOLETO", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-e2e-s5-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const h = createScriptedAssuranceHarness({ videoDir: tmp });
  await h.runCommand("yts-init");

  await h.startAgentRun("Completa packaging");
  await h.callTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  await h.callTool("yts_transition", { action: "submit", phase: "P01_PACKAGING" });
  await h.settleAgentRun(false);

  await h.runCommand("yts-approve", "P01_PACKAGING");

  // Mutate approved file on disk after approval
  const pkgPath = join(tmp, "01-packaging.md");
  writeFileSync(pkgPath, `${readFileSync(pkgPath, "utf8")}\n<!-- edición posterior -->\n`, "utf8");

  const reg = loadRegistry(tmp, { videoId: basename(tmp), now: "2026-11-01T16:00:00Z" });
  const ev = evaluate(reg, createFsReader(tmp));
  assert.equal(ev.phases.find((p) => p.id === "P01_PACKAGING")?.effective, "OBSOLETO");

  // Starting P02_RESEARCH must now be blocked because P01 is OBSOLETO
  await h.startAgentRun("Inicia investigación P02_RESEARCH");
  const blockedP02 = await h.callTool("yts_transition", { action: "start", phase: "P02_RESEARCH" });
  assert.equal(blockedP02.blocked, true);
  await h.settleAgentRun(false);

  const lastRun = listRunManifests(tmp).at(-1)!;
  assert.equal(lastRun.status, "BLOCKED");
});

test("Scenario 6 (WARN): requires explicit human --ack-warn when approving", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-e2e-s6-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const h = createScriptedAssuranceHarness({ videoDir: tmp });
  await h.runCommand("yts-init");

  await h.startAgentRun("Inicia P01");
  await h.callTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  await h.settleAgentRun(false);

  // Submit P01 with a runtime WARN check in the registry
  const now = "2026-11-01T16:10:00Z";
  const reader = createFsReader(tmp);
  const reg = loadRegistry(tmp, { videoId: basename(tmp), now });
  const sub = submitPhase(
    reg,
    "P01_PACKAGING",
    {
      checks: [
        {
          id: "packaging_structure",
          result: "WARN",
          details: "Excepción creativa preaprobada",
          verifiedBy: "runtime",
        },
      ],
      evidence: [],
    },
    { actor: { kind: "agent" }, reader, now },
  );
  assert.equal(sub.ok, true);
  if (sub.ok) saveRegistry(tmp, sub.registry);

  // Approving without --ack-warn must fail
  await h.runCommand("yts-approve", "P01_PACKAGING");
  assert.match(h.notifications.at(-1)?.message ?? "", /No se pudo aprobar|--ack-warn|advertencia/i);

  // Approving with --ack-warn succeeds
  await h.runCommand("yts-approve", "P01_PACKAGING --ack-warn");
  assert.match(h.notifications.at(-1)?.message ?? "", /APROBADA/i);
});

test("Scenario 7 (NOT_EVALUABLE / FAIL): never converts missing master or failing check into approval or PASSED", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-e2e-s7-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const h = createScriptedAssuranceHarness({ videoDir: tmp });
  await h.runCommand("yts-init");

  await h.startAgentRun("Mide un master inexistente");
  const measured = await h.callTool("yts_measure_master", {
    masterPath: "no-existe.mp4",
    acceptanceSheetPath: "aceptacion.json",
  });
  assert.equal(measured.blocked, false);
  assert.equal(measured.isError, true);
  assert.equal(measured.result?.details?.result, "NOT_EVALUABLE");
  await h.settleAgentRun(false);

  const run = listRunManifests(tmp).at(-1)!;
  assert.equal(run.status, "FAILED");
  const masterChk = run.checks.find((c) => c.check_id === "master_measurement");
  assert.equal(masterChk?.verdict, "NOT_EVALUABLE");
});

test("Scenario 8 (Interrupción y ejecución incompleta): distinguishes ABORTED, PARTIAL, and COMPLETED_UNVERIFIED from PASSED", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-e2e-s8-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const h = createScriptedAssuranceHarness({ videoDir: tmp });
  await h.runCommand("yts-init");

  // 8a: Production run that finishes without mutating or verifying -> COMPLETED_UNVERIFIED
  await h.startAgentRun("Revisa y avanza packaging");
  await h.callTool("read", { path: "01-packaging.md" });
  await h.settleAgentRun(false);
  assert.equal(listRunManifests(tmp).at(-1)?.status, "COMPLETED_UNVERIFIED");

  // 8b: Production run that starts phase and edits file but stops before submit -> PARTIAL
  await h.startAgentRun("Empieza P01_PACKAGING pero deja pendiente el submit");
  await h.callTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  await h.settleAgentRun(false);
  assert.equal(listRunManifests(tmp).at(-1)?.status, "PARTIAL");

  // 8c: Run interrupted with aborted=true -> ABORTED
  await h.startAgentRun("Continúa con el packaging");
  await h.settleAgentRun(true);
  assert.equal(listRunManifests(tmp).at(-1)?.status, "ABORTED");
});

test("Scenario 9 (Reanudación): recovers active phase, classifies requestKind=resumption, completes submit as PASSED, and lists all runs in /yts-runs", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-e2e-s9-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const h = createScriptedAssuranceHarness({ videoDir: tmp });
  await h.runCommand("yts-init");

  // Run 1: partial start
  await h.startAgentRun("Inicia P01_PACKAGING");
  await h.callTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  await h.settleAgentRun(false);
  assert.equal(listRunManifests(tmp).at(-1)?.status, "PARTIAL");

  // Run 2: resumption that finishes and submits P01_PACKAGING
  await h.startAgentRun("Reanuda y envía P01_PACKAGING a revisión");
  await h.callTool("read", { path: "skills/yts-packaging-miniaturas/SKILL.md" });
  await h.callTool("read", { path: "01-packaging.md" });
  await h.callTool("write", {
    path: "01-packaging.md",
    content: `# 01 - Packaging: Títulos y Miniaturas
## 1. Estrategia Psicológica y Promesa de Trama (Pre-Guion)
- **Ángulo Psicológico Principal:** Curiosidad y mecanismo oculto
- **Promesa Central del Video (Plot Promise):** Demostrar cómo el estándar de cesio sostiene la sincronización de redes.
- ** Filtro Anti-Clickbait:** Se entrega la demostración completa en el bloque B02.

## 2. Opciones de Títulos (Mínimo 5 Alternativas Creativas)
1. Por qué los relojes atómicos pierden un segundo (palanca usada: Curiosidad / Paradoja)
2. El error oculto que casi apaga el GPS mundial (palanca usada: Miedo / Riesgo sistémico)
3. Cómo una oscilación de cesio sostiene Internet (palanca usada: Mecanismo oculto)
4. 30 nanosegundos: el límite físico de la red eléctrica (palanca usada: Especificidad numérica)
5. Lo que la física cuántica cambió en tu teléfono hoy (palanca usada: Relevancia directa)

- **Título Principal Seleccionado:** El error oculto que casi apaga el GPS mundial
- **Justificación del título elegido:** Conecta un riesgo cotidiano tangible con el mecanismo físico real del oscilador de cesio.

## 3. Variantes de Miniatura (Thumbnails)
### Miniatura A (Principal)
- **Punto focal principal (Hero):** Satélite GPS con reloj digital marcando ERROR -0.00003s
- **Prompt para generador de imágenes / boceto:** Fotografía macro realista de reloj atómico de cesio con alerta roja.

### Miniatura B (Variante de Contraste - para Prueba Nativa en Video Largo o histórico)
- **Concepto diferencial respecto a la Variante A:** Mapa mundial apagándose por zonas horarias.
- **Prompt / boceto:** Ilustración técnica de red global perdiendo sincronización.

### Miniatura C (Variante Radical - para Prueba Nativa en Video Largo o histórico)
- **Concepto diferencial:** Comparativa visual entre un reloj mecánico suizo y una trampa láser de átomos.
- **Prompt / boceto:** Split screen macro entre engranaje mecánico y haz láser azul en cámara de vacío.

## 4. Control de Calidad Pre-Guion (Checklist)
- [x] **Coherencia con el Canal:** Sí
- [x] **Prueba del Scroll (Mobile Test):** Sí
- [x] **No-Redundancia:** Sí
`,
  });
  await h.callTool("yts_transition", { action: "submit", phase: "P01_PACKAGING" });
  await h.settleAgentRun(false);

  const runs = listRunManifests(tmp);
  assert.equal(runs.length, 2);
  const resumedRun = loadRunManifest(tmp, runs[1].runId)!;
  assert.equal(resumedRun.requestKind, "resumption");
  assert.equal(resumedRun.targetPhase, "P01_PACKAGING");
  assert.equal(resumedRun.phaseStatusAtStart, "EN_CURSO");
  assert.equal(resumedRun.phaseStatusAtEnd, "PENDIENTE_APROBACION");
  assert.equal(resumedRun.status, "PASSED");

  await h.runCommand("yts-runs");
  const runsListNote = h.notifications.at(-1)?.message ?? "";
  assert.match(runsListNote, /Historial de ejecuciones \(2 total\)/);
  assert.match(runsListNote, /PARTIAL/);
  assert.match(runsListNote, /PASSED/);
});

test("Scenario 10 (S4 §4.B cronología unificada): human commands persist to lifecycle.jsonl and /yts-runs reconstructs the full sequence", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-e2e-s10-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const { readLifecycleEvents } = await import("../src/store/lifecycle.ts");

  const h = createScriptedAssuranceHarness({ videoDir: tmp });
  await h.runCommand("yts-init");

  await h.startAgentRun("Inicia y envía P01_PACKAGING");
  await h.callTool("read", { path: "skills/yts-packaging-miniaturas/SKILL.md" });
  await h.callTool("read", { path: "01-packaging.md" });
  const trStart = await h.callTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  assert.equal(trStart.blocked, false);
  const wr = await h.callTool("write", {
    path: "01-packaging.md",
    content: `# 01 - Packaging: Títulos y Miniaturas
## 1. Estrategia Psicológica y Promesa de Trama (Pre-Guion)
- **Ángulo Psicológico Principal:** Curiosidad y mecanismo oculto
- **Promesa Central del Video (Plot Promise):** Explicar por qué una deriva de 30 nanosegundos en un oscilador de cesio colapsaría la sincronización global.
- ** Filtro Anti-Clickbait:** El experimento de deriva se resuelve en el minuto 4 con datos del BIPM.

## 2. Opciones de Títulos (Mínimo 5 Alternativas Creativas)
1. Por qué los relojes atómicos pierden un segundo (palanca usada: Curiosidad / Paradoja)
2. El error oculto que casi apaga el GPS mundial (palanca usada: Miedo / Riesgo sistémico)
3. Cómo una oscilación de cesio sostiene Internet (palanca usada: Mecanismo oculto)
4. 30 nanosegundos: el límite físico de la red eléctrica (palanca usada: Especificidad numérica)
5. Lo que la física cuántica cambió en tu teléfono hoy (palanca usada: Relevancia directa)

- **Título Principal Seleccionado:** El error oculto que casi apaga el GPS mundial
- **Justificación del título elegido:** Conecta un riesgo cotidiano tangible con el mecanismo físico real del oscilador de cesio.

## 3. Variantes de Miniatura (Thumbnails)
### Miniatura A (Principal)
- **Brecha de Curiosidad:** Story
- **Punto focal principal (Hero):** Satélite GPS con reloj digital marcando ERROR -0.00003s
- **Texto en miniatura:** 30 NANOSEGUNDOS
- **Prompt para generador de imágenes / boceto:** Fotografía macro realista de reloj atómico de cesio con alerta roja.

### Miniatura B (Variante de Contraste - para Prueba Nativa en Video Largo o histórico)
- **Brecha de Curiosidad:** Result
- **Concepto diferencial respecto a la Variante A:** Mapa mundial apagándose por zonas horarias.
- **Prompt / boceto:** Ilustración técnica de red global perdiendo sincronización.

### Miniatura C (Variante Radical - para Prueba Nativa en Video Largo o histórico)
- **Brecha de Curiosidad:** Novelty
- **Concepto diferencial:** Comparativa visual entre un reloj mecánico suizo y una trampa láser de átomos.
- **Prompt / boceto:** Split screen macro entre engranaje mecánico y haz láser azul en cámara de vacío.

## 4. Control de Calidad Pre-Guion (Checklist)
- [x] **Coherencia con el Canal:** ¿Este empaque encaja naturalmente con los pilares del canal?
- [x] **Prueba del Scroll (Mobile Test):** ¿La miniatura A y B se entienden perfectamente reducidas al tamaño de un sello postal?
- [x] **No-Redundancia:** ¿El texto de la miniatura es diferente a las palabras exactas del título?
`,
  });
  assert.equal(wr.blocked, false);
  const trSubmit = await h.callTool("yts_transition", { action: "submit", phase: "P01_PACKAGING" });
  assert.equal(trSubmit.blocked, false, `submit must succeed: ${trSubmit.reason ?? ""}`);
  await h.settleAgentRun(false);

  await h.runCommand("yts-approve", "P01_PACKAGING");

  const humanCommands = readLifecycleEvents(tmp).filter((e) => e.kind === "human_command");
  assert.ok(
    humanCommands.some((e) => e.command === "/yts-init"),
    "/yts-init must be persisted in lifecycle.jsonl",
  );
  const approveEv = humanCommands.find((e) => e.command?.startsWith("/yts-approve"));
  assert.ok(approveEv, "/yts-approve must be persisted in lifecycle.jsonl");
  assert.equal(approveEv.phaseId, "P01_PACKAGING");

  await h.runCommand("yts-runs");
  const note = h.notifications.at(-1)?.message ?? "";
  assert.match(note, /Cronología de producción \(agente \+ creador\)/);
  assert.match(note, /Creador: \/yts-approve P01_PACKAGING/);
});
