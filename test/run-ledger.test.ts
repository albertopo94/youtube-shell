import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildContextAttestation,
  evaluateRunAssurance,
  formatRunAuditReport,
  recordReferenceReadInAttestation,
  RUN_STATUSES,
} from "../src/core/assurance.ts";
import { resolveWorkflowContext } from "../src/core/context-resolver.ts";
import { createRegistry, evaluate } from "../src/core/machine.ts";
import { createFsReader, registryPath, scaffoldVideoDir } from "../src/store/fs-store.ts";
import {
  appendRunEvent,
  createRunRecord,
  finalizeRunRecord,
  generateRunId,
  listRunManifests,
  loadRunEvents,
  loadRunEventsDetailed,
  loadRunManifest,
  pruneOldRuns,
  reconcileOrphanedRuns,
  runDir,
  runEventsPath,
  runManifestPath,
  RUN_ID_PATTERN,
  saveRunManifest,
} from "../src/store/run-ledger.ts";

test("RUN_STATUSES covers all 9 states specified in the harness assurance design", () => {
  assert.deepEqual(RUN_STATUSES, [
    "NOT_APPLICABLE",
    "STARTED",
    "PARTIAL",
    "COMPLETED_UNVERIFIED",
    "PASSED",
    "FAILED",
    "BLOCKED",
    "ABORTED",
    "DEGRADED",
  ]);
});

test("buildContextAttestation hashes assigned skill and mandatory references, and never marks them read merely by appearing in prompt", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-attest-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const now = "2026-11-01T10:00:00Z";
  const { registry: reg } = scaffoldVideoDir(tmp, { now });
  const reader = createFsReader(tmp);
  const ev = evaluate(reg, reader);

  const wf = resolveWorkflowContext({
    videoDir: tmp,
    promptText: "Redacta las opciones de packaging",
    reg,
    evaluation: ev,
    hasRegistry: true,
  });

  const att = buildContextAttestation(wf, {
    promptDelivered: true,
    promptHash: "sha256:1234",
  });

  assert.equal(att.expectedSkill.name, "yts-packaging-miniaturas");
  assert.equal(att.expectedSkill.exists, true);
  assert.match(att.expectedSkill.sha256 ?? "", /^sha256:[0-9a-f]{64}$/);
  assert.equal(att.expectedSkill.deliveredInPrompt, true);
  assert.equal(att.expectedSkill.readByAgent, false);

  const packagingRef = att.mandatoryReferences.find((r) => r.targetFile === "01-packaging.md");
  assert.ok(packagingRef, "must include 01-packaging.md as mandatory reference in P01_PACKAGING");
  assert.equal(packagingRef.exists, true);
  assert.match(packagingRef.sha256 ?? "", /^sha256:[0-9a-f]{64}$/);
  assert.equal(packagingRef.readByAgent, false);

  // Simulate completed read tool execution on the skill and deliverable
  recordReferenceReadInAttestation(att, tmp, att.expectedSkill.resolvedPath);
  recordReferenceReadInAttestation(att, tmp, "01-packaging.md");

  assert.equal(att.expectedSkill.readByAgent, true);
  assert.equal(packagingRef.readByAgent, true);
});

test("missing mandatory reference marks context attestation incomplete and evaluates run as DEGRADED", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-degraded-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const now = "2026-11-01T10:00:00Z";
  const { registry: reg } = scaffoldVideoDir(tmp, { now });
  unlinkSync(join(tmp, "01-packaging.md"));

  const reader = createFsReader(tmp);
  const ev = evaluate(reg, reader);
  const wf = resolveWorkflowContext({
    videoDir: tmp,
    promptText: "Inicia packaging",
    reg,
    evaluation: ev,
    hasRegistry: true,
  });

  const manifest = createRunRecord({
    runId: "run-20261101T100000Z-aa11bb22",
    videoDir: tmp,
    startedAt: now,
    promptText: "Inicia packaging",
    resolvedWorkflow: wf,
    promptDelivered: true,
    promptHash: "sha256:abcd",
  });

  const evaluation = evaluateRunAssurance(manifest);
  assert.equal(evaluation.status, "DEGRADED");
  assert.match(evaluation.reason, /referencia obligatoria|ausente/i);
});

test("RunLedger persists manifest.json and events.jsonl under .youtube-shell/runs/<run-id> without touching registro.json", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-ledger-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const now = "2026-11-01T12:00:00Z";
  const reg = createRegistry("video-demo", now);
  const reader = createFsReader(tmp);
  const ev = evaluate(reg, reader);
  const wf = resolveWorkflowContext({
    videoDir: tmp,
    promptText: "consulta: qué estado tiene el proyecto",
    reg,
    evaluation: ev,
    hasRegistry: false,
  });

  const manifest = createRunRecord({
    runId: "run-20261101T120000Z-cc33dd44",
    videoDir: tmp,
    startedAt: now,
    promptText: "consulta: qué estado tiene el proyecto",
    resolvedWorkflow: wf,
    promptDelivered: true,
    promptHash: "sha256:ef01",
  });

  saveRunManifest(tmp, manifest);
  appendRunEvent(tmp, manifest.runId, {
    at: now,
    type: "run_started",
    phase: manifest.targetPhase,
    workMode: manifest.workMode,
    details: { requestKind: manifest.requestKind },
  });

  // Must NOT have created .youtube-shell/registro.json
  assert.equal(existsSync(registryPath(tmp)), false);
  assert.equal(existsSync(runManifestPath(tmp, manifest.runId)), true);
  assert.equal(existsSync(runEventsPath(tmp, manifest.runId)), true);

  const finalized = finalizeRunRecord(tmp, manifest, {
    finishedAt: "2026-11-01T12:00:05Z",
    aborted: false,
  });

  assert.equal(finalized.status, "NOT_APPLICABLE");
  const loaded = loadRunManifest(tmp, manifest.runId);
  assert.equal(loaded?.status, "NOT_APPLICABLE");

  const events = loadRunEvents(tmp, manifest.runId);
  assert.equal(events.length, 2);
  assert.equal(events[0].type, "run_started");
  assert.equal(events[1].type, "run_settled");

  const allRuns = listRunManifests(tmp);
  assert.equal(allRuns.length, 1);
  assert.equal(allRuns[0].runId, manifest.runId);

  const reportText = formatRunAuditReport(loaded!);
  assert.match(reportText, new RegExp(manifest.runId));
  assert.match(reportText, /NOT_APPLICABLE/);
  assert.match(reportText, /Controles con evidencia satisfactoria/);
});

test("Detalle 1: submitting a production phase without reading the assigned skill evaluates as DEGRADED, never PASSED", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-unread-skill-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const now = "2026-11-01T13:00:00Z";
  const { registry: reg } = scaffoldVideoDir(tmp, { now });
  const reader = createFsReader(tmp);
  const ev = evaluate(reg, reader);
  const wf = resolveWorkflowContext({
    videoDir: tmp,
    promptText: "Envía P01_PACKAGING a revisión",
    reg,
    evaluation: ev,
    hasRegistry: true,
  });

  const manifest = createRunRecord({
    runId: "run-20261101T130000Z-ee55ff66",
    videoDir: tmp,
    startedAt: now,
    promptText: "Envía P01_PACKAGING a revisión",
    resolvedWorkflow: wf,
    promptDelivered: true,
    promptHash: "sha256:1111",
  });

  // Agent executed the check and submitted the phase, but NEVER read skills/yts-packaging-miniaturas/SKILL.md
  manifest.phaseSubmitted = true;
  manifest.phaseStatusAtEnd = "PENDIENTE_APROBACION";
  manifest.finishedAt = "2026-11-01T13:00:10Z";
  for (const chk of manifest.checks) {
    chk.executed = true;
    chk.verdict = "PASS";
    chk.verified_by = "runtime";
  }

  const evaluation = evaluateRunAssurance(manifest);
  const skillControl = evaluation.controls.find((c) => c.control === "Skill leída");
  assert.equal(skillControl?.satisfied, false, "Skill leída must not be satisfied just because its path was in the prompt");
  assert.equal(evaluation.status, "DEGRADED", "Submitting without reading the assigned skill must degrade the run");
  assert.match(evaluation.diagnosis, /skill asignada.*no tiene evidencia de lectura/i);
});

test("Detalle 4: inspectDeliverableApplicationEvidence checks phase deliverable application evidence and reports it in controls", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-app-evidence-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const now = "2026-11-01T13:10:00Z";
  const { registry: reg } = scaffoldVideoDir(tmp, { now });
  // Strip title lever / emotional trigger evidence from 01-packaging.md
  writeFileSync(join(tmp, "01-packaging.md"), "# 01 Packaging\n\nTexto vacío sin palancas ni conceptos.\n", "utf8");

  const reader = createFsReader(tmp);
  const ev = evaluate(reg, reader);
  const wf = resolveWorkflowContext({
    videoDir: tmp,
    promptText: "Completa P01_PACKAGING",
    reg,
    evaluation: ev,
    hasRegistry: true,
  });

  const manifest = createRunRecord({
    runId: "run-20261101T131000Z-aa00bb11",
    videoDir: tmp,
    startedAt: now,
    promptText: "Completa P01_PACKAGING",
    resolvedWorkflow: wf,
    promptDelivered: true,
    promptHash: "sha256:2222",
  });

  recordReferenceReadInAttestation(manifest.context, tmp, manifest.context.expectedSkill.resolvedPath);
  manifest.phaseSubmitted = true;
  manifest.phaseStatusAtEnd = "PENDIENTE_APROBACION";
  manifest.finishedAt = "2026-11-01T13:10:10Z";
  for (const chk of manifest.checks) {
    chk.executed = true;
    chk.verdict = "PASS";
    chk.verified_by = "runtime";
  }

  const evaluation = evaluateRunAssurance(manifest);
  const appControl = evaluation.controls.find((c) => c.control === "Evidencia de aplicación");
  assert.ok(appControl, "controls must include 'Evidencia de aplicación'");
  assert.equal(appControl.satisfied, false);
  assert.equal(evaluation.status, "DEGRADED");
});

test("Detalle 5: high factual risk (ALTO) in 06-fuentes-y-verificacion.md requires reading gobernanza-evidencia.md", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-high-risk-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const now = "2026-11-01T13:20:00Z";
  const { registry: reg } = scaffoldVideoDir(tmp, { now });
  const fuentesPath = join(tmp, "06-fuentes-y-verificacion.md");
  const fuentesContent = readFileSync(fuentesPath, "utf8").replace(
    "[ ] Alto (salud/financiero/polémico)",
    "[x] Alto (salud/financiero/polémico)",
  );
  writeFileSync(fuentesPath, fuentesContent, "utf8");

  const reader = createFsReader(tmp);
  const ev = evaluate(reg, reader);
  const wf = resolveWorkflowContext({
    videoDir: tmp,
    promptText: "Inicia investigación P02_RESEARCH",
    reg,
    evaluation: ev,
    hasRegistry: true,
  });
  // Force targetPhase to P02_RESEARCH to inspect high-risk research attestation
  wf.targetPhase = "P02_RESEARCH";

  const att = buildContextAttestation(wf, {
    promptDelivered: true,
    promptHash: "sha256:3333",
  });

  const gobRef = att.conditionalReferences.find((r) =>
    r.targetFile.includes("gobernanza-evidencia.md"),
  );
  assert.ok(
    gobRef,
    "When factual risk is ALTO in P02_RESEARCH, gobernanza-evidencia.md must be tracked in conditionalReferences",
  );
  assert.equal(gobRef.applicable, true);
  assert.match(gobRef.reason, /ALTO/i);
});

test("S1 (v0.16.0): inspectDeliverableApplicationEvidence returns verified=false on untouched canonical templates for all 7 phases and verified=true when genuinely filled", async (t) => {
  const { inspectDeliverableApplicationEvidence } = await import("../src/core/assurance.ts");
  const { PHASE_IDS } = await import("../src/core/phases.ts");

  const tmp = mkdtempSync(join(tmpdir(), "yts-s1-templates-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  scaffoldVideoDir(tmp, { now: "2026-11-01T15:00:00Z" });

  // 1. Every untouched canonical template MUST evaluate to verified: false (zero false positives)
  for (const phaseId of PHASE_IDS) {
    const ev = inspectDeliverableApplicationEvidence(tmp, phaseId);
    assert.equal(
      ev.verified,
      false,
      `Untouched template for ${phaseId} (${ev.targetFile}) must NOT pass application evidence; got summary: ${ev.summary}`,
    );
  }

  // 2. Fill P01_PACKAGING with 5 real titles + levers, selected title + justification, and 3 distinct thumbnails
  writeFileSync(
    join(tmp, "01-packaging.md"),
    `# 01 - Packaging: Títulos y Miniaturas
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
`,
    "utf8",
  );
  assert.equal(inspectDeliverableApplicationEvidence(tmp, "P01_PACKAGING").verified, true);

  // 3. Fill P07_CLOSE with real entregable-final.md sections and 05-metricas-retencion.md closing learning
  writeFileSync(
    join(tmp, "entregable-final.md"),
    `# Plantilla: Entregable Final del Video Publicado
- **Canal:** Ciencia Viva
- **Video ID / URL en YouTube:** https://youtube.com/watch?v=abc123xyz00
- **Fecha y hora de publicación:** 2026-11-01 18:00 UTC

## 1. Metadata Definitiva Publicada
- **Título Oficial:** El error oculto que casi apaga el GPS mundial
- **Miniatura Ganadora (Thumbnail):** \`miniatura_a_final.png\`
- **Descripción completa de YouTube (con capítulos/marcas de tiempo):**
\`\`\`text
00:00 El fallo de sincronización
02:15 Cómo funciona el reloj de cesio
\`\`\`
- **Tags / Palabras clave:** reloj atomico, gps, fisica

## 2. Archivo Master y Assets
- **Archivo de video final:** \`renders/master.mp4\`
- **Miniatura en alta resolución:** \`thumbnail_master.png\`
- **Pista de subtítulos / SRT:** \`subtitulos_es.srt\`

## 3. Créditos y Licencias en Descripción
Música CC-BY 4.0 por Estudio Sonoro.
`,
    "utf8",
  );
  const m05 = readFileSync(join(tmp, "05-metricas-retencion.md"), "utf8").replace(
    /`\[UNA sola mejora concreta[^\]]*\]`/,
    "Recortar la introducción contextual de 22s a 9s tras observar la retención de los primeros 30s.",
  );
  writeFileSync(join(tmp, "05-metricas-retencion.md"), m05, "utf8");
  assert.equal(
    inspectDeliverableApplicationEvidence(tmp, "P07_CLOSE").verified,
    true,
    "Completed entregable-final.md + 05-metricas-retencion.md must pass P07_CLOSE without false negative",
  );
});

test("S2 (v0.16.0): mandatory references require full read before submit, partial read degrades run, and compound references decompose atomically", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-s2-refs-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const officeRoot = join(tmp, "office");
  const channelDir = join(officeRoot, "mis-canales", "canal-test");
  const videoDir = join(channelDir, "videos-en-estudio", "v01");
  mkdirSync(join(officeRoot, "_framework"), { recursive: true });
  writeFileSync(join(officeRoot, "ideas.md"), "# Ideas\nLínea 2\nLínea 3\n", "utf8");
  writeFileSync(join(officeRoot, "referentes.md"), "# Referentes\n", "utf8");
  mkdirSync(videoDir, { recursive: true });
  writeFileSync(join(channelDir, "backlog-ideas.md"), "# Backlog\nLínea 2\n", "utf8");
  writeFileSync(join(channelDir, "banco-de-titulos.md"), "# Banco\n", "utf8");

  const now = "2026-11-01T15:10:00Z";
  const { registry: reg } = scaffoldVideoDir(videoDir, { now });
  // Fill P01 deliverable so applicationEvidence is true
  writeFileSync(
    join(videoDir, "01-packaging.md"),
    `# 01 Packaging\n## 2. Opciones de Títulos\n1. Relojes en órbita (palanca usada: Curiosidad)\n2. El fallo de sincronía (palanca usada: Miedo)\n3. Precisión cuántica (palanca usada: Deseo)\n4. Mecánico vs atómico (palanca usada: Contraste)\n5. El nuevo estándar (palanca usada: Novedad)\n- **Título Principal Seleccionado:** El fallo de sincronía\n- **Justificación del título elegido:** Sólida evidencia de demanda.\n### Miniatura A\n- **Punto focal principal (Hero):** Reloj atómico\n- **Prompt para generador de imágenes / boceto:** Foto macro realista\n### Miniatura B\n- **Concepto diferencial respecto a la Variante A:** Mapa en apagón\n- **Prompt / boceto:** Mapa global técnico\n### Miniatura C\n- **Concepto diferencial:** Comparativa visual\n- **Prompt / boceto:** Lado a lado\n` +
      Array.from({ length: 25 }, (_, i) => `Línea extra ${i + 1}`).join("\n"),
    "utf8",
  );

  const reader = createFsReader(videoDir);
  const ev = evaluate(reg, reader);
  const wf = resolveWorkflowContext({
    videoDir,
    promptText: "Redacta y envía P01_PACKAGING",
    reg,
    evaluation: ev,
    hasRegistry: true,
  });

  const manifest = createRunRecord({
    runId: "run-20261101T151000Z-a1b2c3",
    videoDir,
    startedAt: now,
    promptText: "Redacta y envía P01_PACKAGING",
    resolvedWorkflow: wf,
    promptDelivered: true,
    promptHash: "sha256:4444",
  });

  // Verify atomic decomposition of conditional and optional references
  const condFiles = manifest.context.conditionalReferences.map((r) => r.targetFile);
  assert.ok(condFiles.includes("ideas.md"), "ideas.md must be attested individually");
  assert.ok(condFiles.includes("backlog-ideas.md"), "backlog-ideas.md must be attested individually");
  assert.ok(
    Array.isArray(manifest.context.optionalReferences) &&
      manifest.context.optionalReferences.some((r) => r.targetFile === "banco-de-titulos.md"),
    "optionalReferences must be attested as a distinct 4th tier",
  );

  // Read skill with partial limit (5 lines of a >40 line file)
  recordReferenceReadInAttestation(
    manifest.context,
    manifest.context.expectedSkill.resolvedPath,
    videoDir,
    { offset: 1, limit: 5 },
  );
  assert.equal(manifest.context.expectedSkill.readScope, "partial");

  manifest.phaseSubmitted = true;
  manifest.phaseStatusAtEnd = "PENDIENTE_APROBACION";
  manifest.finishedAt = "2026-11-01T15:11:00Z";
  for (const chk of manifest.checks) {
    chk.executed = true;
    chk.verdict = "PASS";
    chk.verified_by = "runtime";
  }

  // Partial skill read + unread mandatory reference 01-packaging.md must evaluate as DEGRADED
  const evalPartial = evaluateRunAssurance(manifest);
  assert.equal(evalPartial.status, "DEGRADED");

  // Now read skill completely, but still leave mandatory reference 01-packaging.md unread
  recordReferenceReadInAttestation(
    manifest.context,
    manifest.context.expectedSkill.resolvedPath,
    videoDir,
  );
  assert.equal(manifest.context.expectedSkill.readScope, "full");
  const evalUnreadMandatory = evaluateRunAssurance(manifest);
  assert.equal(
    evalUnreadMandatory.status,
    "DEGRADED",
    "Unread mandatory reference 01-packaging.md must keep run DEGRADED on submit",
  );

  // Now read mandatory reference 01-packaging.md and applicable conditional references completely
  for (const ref of manifest.context.mandatoryReferences) {
    if (ref.resolvedPath) {
      recordReferenceReadInAttestation(manifest.context, ref.resolvedPath, videoDir);
    }
  }
  for (const ref of manifest.context.conditionalReferences.filter((r) => r.applicable)) {
    if (ref.resolvedPath) {
      recordReferenceReadInAttestation(manifest.context, ref.resolvedPath, videoDir);
    }
  }

  const evalFull = evaluateRunAssurance(manifest);
  assert.equal(evalFull.status, "PASSED");

  // 4th tier: an unread optional reference is reported but never blocks approval
  const optControl = evalFull.controls.find((c) => c.control === "Referencia opcional");
  assert.ok(optControl, "controls must report the optional reference tier");
  assert.equal(optControl.satisfied, true, "optional references must never block approval");
  assert.match(optControl.result, /no bloquea aprobaci[óo]n/i);
  const optionalRef = manifest.context.optionalReferences!.find(
    (r) => r.targetFile === "banco-de-titulos.md",
  );
  assert.ok(optionalRef, "banco-de-titulos.md must be attested as its own reference entry");
  assert.equal(optionalRef.kind, "optional");
  assert.equal(optionalRef.readByAgent, false, "optional reference was never read");
});


test("S3 (v0.16.0): reconcileOrphanedRuns keeps live runs STARTED, orphans dead pids as ABORTED, and marks unverifiable pids DEGRADED", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-orphan-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const now = "2026-11-01T16:00:00Z";
  const { registry: reg } = scaffoldVideoDir(tmp, { now });
  const reader = createFsReader(tmp);
  const ev = evaluate(reg, reader);
  const wf = resolveWorkflowContext({
    videoDir: tmp,
    promptText: "Inicia P01_PACKAGING",
    reg,
    evaluation: ev,
    hasRegistry: true,
  });

  const makeRun = (runId: string, process?: Parameters<typeof createRunRecord>[0]["process"]) => {
    const m = createRunRecord({
      runId,
      videoDir: tmp,
      startedAt: now,
      promptText: "Inicia P01_PACKAGING",
      resolvedWorkflow: wf,
      promptDelivered: true,
      ...(process ? { process } : {}),
    });
    saveRunManifest(tmp, m);
    return m;
  };

  makeRun("run-20261101T160000Z-a1a1a1", { pid: 4242, launchedViaWrapper: true });
  makeRun("run-20261101T160001Z-b2b2b2", { pid: 4343, launchedViaWrapper: true });
  makeRun("run-20261101T160002Z-c3c3c3"); // no process binding at all
  const finished = makeRun("run-20261101T160003Z-d4d4d4", { pid: 9999 });
  finalizeRunRecord(tmp, finished, { finishedAt: "2026-11-01T16:00:30Z", aborted: false });

  const res = reconcileOrphanedRuns(tmp, {
    now: "2026-11-01T16:01:00Z",
    isPidAlive: (pid) => pid === 4242, // 4242 alive; 4343 dead; 9999 dead but run finished
  });

  assert.equal(res.inspected, 3, "finished runs must be skipped");
  assert.deepEqual(res.active, ["run-20261101T160000Z-a1a1a1"]);
  assert.deepEqual(res.orphaned, ["run-20261101T160001Z-b2b2b2"]);
  assert.deepEqual(res.unknown, ["run-20261101T160002Z-c3c3c3"]);

  const alive = loadRunManifest(tmp, "run-20261101T160000Z-a1a1a1")!;
  assert.equal(alive.status, "STARTED");
  assert.equal(alive.reconciliation?.outcome, "ACTIVE");

  const orphan = loadRunManifest(tmp, "run-20261101T160001Z-b2b2b2")!;
  assert.equal(orphan.status, "ABORTED");
  assert.equal(orphan.reconciliation?.outcome, "ORPHANED");
  assert.ok(orphan.incidents.some((i) => i.kind === "orphaned_process"));
  assert.ok(loadRunEvents(tmp, orphan.runId).some((e) => e.type === "run_settled"));

  const unknown = loadRunManifest(tmp, "run-20261101T160002Z-c3c3c3")!;
  assert.equal(unknown.status, "DEGRADED");
  assert.equal(unknown.reconciliation?.outcome, "UNKNOWN");
  assert.match(unknown.statusReason, /UNKNOWN_PROCESS_STATE/);

  const done = loadRunManifest(tmp, "run-20261101T160003Z-d4d4d4")!;
  assert.equal(done.reconciliation, undefined, "settled runs are never reconciled");
});

test("S3 (v0.16.0): activation-state sequence accumulates the 6-state handshake in order", async (t) => {
  const { advanceActivationState, diagnoseActivationState, readActivationState, ACTIVATION_STATES } =
    await import("../src/store/activation.ts");

  const tmp = mkdtempSync(join(tmpdir(), "yts-actseq-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  assert.deepEqual(ACTIVATION_STATES, [
    "NOT_STARTED",
    "PREFLIGHT_FAILED",
    "HOST_STARTED",
    "EXTENSION_NOT_CONFIRMED",
    "EXTENSION_ACTIVATED",
    "RUN_STARTED",
  ]);

  advanceActivationState({
    videoDir: tmp,
    state: "HOST_STARTED",
    at: "2026-11-01T17:00:00Z",
    activationId: "act-20261101T170000Z-00aa11",
    launchedViaWrapper: true,
    pid: 123,
  });
  advanceActivationState({
    videoDir: tmp,
    state: "EXTENSION_ACTIVATED",
    at: "2026-11-01T17:00:05Z",
    activationId: "act-20261101T170000Z-00aa11",
    launchedViaWrapper: true,
    pid: 123,
    sessionId: "ses_abc",
  });
  advanceActivationState({
    videoDir: tmp,
    state: "RUN_STARTED",
    at: "2026-11-01T17:00:10Z",
    activationId: "act-20261101T170000Z-00aa11",
    launchedViaWrapper: true,
    pid: 123,
    sessionId: "ses_abc",
  });

  const state = readActivationState(tmp)!;
  assert.deepEqual(
    state.sequence.map((s) => s.state),
    ["HOST_STARTED", "EXTENSION_ACTIVATED", "RUN_STARTED"],
  );
  assert.equal(state.sessionId, "ses_abc");

  // A wrapper-launched host that stopped at HOST_STARTED must be diagnosed as EXTENSION_NOT_CONFIRMED
  const tmp2 = mkdtempSync(join(tmpdir(), "yts-actseq2-"));
  t.after(() => rmSync(tmp2, { recursive: true, force: true }));
  advanceActivationState({
    videoDir: tmp2,
    state: "HOST_STARTED",
    at: "2026-11-01T17:01:00Z",
    activationId: "act-20261101T170100Z-22bb33",
    launchedViaWrapper: true,
    pid: 124,
  });
  const diag = diagnoseActivationState(tmp2, { now: "2026-11-01T17:02:00Z" })!;
  assert.equal(diag.state, "EXTENSION_NOT_CONFIRMED");
  assert.match(diag.conclusion, /EXTENSION_NOT_CONFIRMED/);
  const after = readActivationState(tmp2)!;
  assert.deepEqual(
    after.sequence.map((s) => s.state),
    ["HOST_STARTED", "EXTENSION_NOT_CONFIRMED"],
  );

  // An already-activated state must be left untouched by diagnosis
  const diag2 = diagnoseActivationState(tmp, { now: "2026-11-01T17:00:20Z" })!;
  assert.equal(diag2.state, "RUN_STARTED");
  assert.equal(readActivationState(tmp)!.sequence.length, 3);
});

test("S5 §4.F.1: runId is canonical and only canonical identifiers reach the filesystem", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-runid-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const generated = generateRunId("2026-11-01T21:22:23Z");
  assert.match(generated, RUN_ID_PATTERN, "generateRunId must emit the canonical shape");
  assert.equal(generated, "run-20261101T212223Z-" + generated.slice(-6));

  // A legacy/non-canonical id must never be loadable (also blocks ../ traversal).
  const now = "2026-11-01T21:00:00Z";
  const { registry: reg } = scaffoldVideoDir(tmp, { now });
  const reader = createFsReader(tmp);
  const ev = evaluate(reg, reader);
  const wf = resolveWorkflowContext({
    videoDir: tmp,
    promptText: "consulta rápida",
    reg,
    evaluation: ev,
    hasRegistry: true,
  });
  const manifest = createRunRecord({
    videoDir: tmp,
    startedAt: now,
    promptText: "consulta rápida",
    resolvedWorkflow: wf,
    promptDelivered: true,
  });
  saveRunManifest(tmp, manifest);

  assert.equal(loadRunManifest(tmp, "run-001"), undefined);
  assert.deepEqual(loadRunEvents(tmp, "../evil"), []);
  assert.equal(loadRunManifest(tmp, "../../etc"), undefined);
  assert.ok(loadRunManifest(tmp, manifest.runId), "the canonical run must load");

  // A manifest whose stored runId no longer matches its directory must not load.
  const dir = runDir(tmp, manifest.runId);
  const tampered = { ...manifest, runId: "run-20261101T210000Z-ffffff" };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(tampered), "utf8");
  assert.equal(loadRunManifest(tmp, manifest.runId), undefined);
});

test("S5 §4.F.2/§4.F.3: loadRunEvents recovers every valid line and appendRunEvent caps events durably", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-events-robust-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const runId = "run-20261101T213000Z-aabbcc";
  const mk = (n: number): any => ({ at: `2026-11-01T21:30:${String(n).padStart(2, "0")}Z`, type: "tool_completed", toolName: `t${n}` });

  for (let i = 1; i <= 3; i += 1) appendRunEvent(tmp, runId, mk(i));
  const eventsFile = runEventsPath(tmp, runId);
  writeFileSync(eventsFile, readFileSync(eventsFile, "utf8") + "{no-es-json\n", "utf8");
  appendRunEvent(tmp, runId, mk(4));

  const detailed = loadRunEventsDetailed(tmp, runId);
  assert.equal(detailed.events.length, 4, "corrupted line must not erase valid events");
  assert.deepEqual(detailed.corruptedLines, [4], "corrupted line number must be reported");

  // Head-trim cap: newest events survive, oldest are dropped.
  const cappedRun = "run-20261101T213100Z-dddeee";
  for (let i = 5; i <= 12; i += 1) appendRunEvent(tmp, cappedRun, mk(i), { maxEvents: 5 });
  const capped = loadRunEventsDetailed(tmp, cappedRun);
  assert.equal(capped.events.length, 5);
  assert.deepEqual(capped.corruptedLines, []);
  assert.equal(capped.events.at(-1)?.toolName, "t12", "newest event must survive");
  assert.equal(capped.events[0]?.toolName, "t8", "oldest events must be pruned first");
});

test("S5 §4.E: the ledger never persists the OS home or raw absolute paths in manifest.json or events.jsonl", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-privacy-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const now = "2026-11-01T22:00:00Z";
  const { registry: reg } = scaffoldVideoDir(tmp, { now });
  const reader = createFsReader(tmp);
  const ev = evaluate(reg, reader);
  const wf = resolveWorkflowContext({
    videoDir: tmp,
    promptText: "Inicia P01_PACKAGING",
    reg,
    evaluation: ev,
    hasRegistry: true,
  });
  const manifest = createRunRecord({
    videoDir: tmp,
    startedAt: now,
    promptText: "Inicia P01_PACKAGING",
    resolvedWorkflow: wf,
    promptDelivered: true,
    promptHash: "sha256:privacy",
  });
  recordReferenceReadInAttestation(manifest.context, manifest.context.expectedSkill.resolvedPath, tmp);
  saveRunManifest(tmp, manifest);
  appendRunEvent(tmp, manifest.runId, {
    at: now,
    type: "tool_completed",
    toolName: "write",
    details: { path: join(tmp, "01-packaging.md"), masterPath: "/Volumes/Studio/renders/master.mp4" },
  });

  const manifestBytes = readFileSync(runManifestPath(tmp, manifest.runId), "utf8");
  const eventsBytes = readFileSync(runEventsPath(tmp, manifest.runId), "utf8");

  assert.ok(!manifestBytes.includes(tmp), "manifest.json must not contain the video absolute path");
  assert.ok(!eventsBytes.includes(tmp), "events.jsonl must not contain the video absolute path");
  const home = homedir();
  if (home && home !== "/") {
    assert.ok(!manifestBytes.includes(home), "manifest.json must not leak os.homedir()");
    assert.ok(!eventsBytes.includes(home), "events.jsonl must not leak os.homedir()");
  }
  assert.match(manifestBytes, /"resolvedPath":\s*"<pkg>\//, "skill path must be tagged <pkg>/");
  assert.match(eventsBytes, /"path":\s*"<video>\//, "video-relative path must be tagged <video>/");
  assert.match(
    eventsBytes,
    /"masterPath":\s*"<external>\/master\.mp4"/,
    "foreign absolute path must be tagged <external>/",
  );

  // Idempotence: re-saving a loaded manifest must never double-prefix already tagged values.
  const reloaded = loadRunManifest(tmp, manifest.runId)!;
  saveRunManifest(tmp, reloaded);
  const again = readFileSync(runManifestPath(tmp, manifest.runId), "utf8");
  assert.ok(
    !again.includes("<pkg>/<pkg>/") && !again.includes("<video>/<video>/"),
    "tagging must be idempotent",
  );
  assert.match(again, /"resolvedPath":\s*"<pkg>\//);
});

test("S5 §4.E: pruneOldRuns keeps the newest runs and never prunes live or registro-referenced runs", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-retention-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const now = "2026-11-01T23:00:00Z";
  const { registry: reg } = scaffoldVideoDir(tmp, { now });
  const reader = createFsReader(tmp);
  const wf = resolveWorkflowContext({
    videoDir: tmp,
    promptText: "consulta",
    reg,
    evaluation: evaluate(reg, reader),
    hasRegistry: true,
  });

  const ids = [
    "run-20261101T230000Z-000000aa",
    "run-20261101T230100Z-111111aa",
    "run-20261101T230200Z-222222aa",
    "run-20261101T230300Z-333333aa",
  ];
  for (const runId of ids) {
    const m = createRunRecord({
      runId,
      videoDir: tmp,
      startedAt: now,
      promptText: "consulta",
      resolvedWorkflow: wf,
      promptDelivered: true,
    });
    finalizeRunRecord(tmp, m, { finishedAt: now, aborted: false });
  }
  // One unfinished run is always pinned.
  const live = createRunRecord({
    runId: "run-20261101T225900Z-444444aa",
    videoDir: tmp,
    startedAt: "2026-11-01T22:59:00Z",
    promptText: "consulta",
    resolvedWorkflow: wf,
    promptDelivered: true,
  });
  saveRunManifest(tmp, live);

  // One finished run is referenced by registro.json, so it is also pinned.
  const regPath = registryPath(tmp);
  writeFileSync(regPath, readFileSync(regPath, "utf8") + `\n<!-- refs ${ids[1]} -->\n`, "utf8");

  // The cap applies to prunable history: 3 finished+unreferenced runs with keep=2 drops the oldest one.
  const res = pruneOldRuns(tmp, { keep: 2 });
  assert.deepEqual(res.pruned, [ids[0]], "only the oldest unprotected finished run may go");
  assert.equal(existsSync(runDir(tmp, ids[0])), false);
  assert.equal(existsSync(runDir(tmp, ids[1])), true, "registro-referenced run survives");
  assert.equal(existsSync(runDir(tmp, ids[2])), true);
  assert.equal(existsSync(runDir(tmp, ids[3])), true, "newest run survives");
  assert.equal(existsSync(runDir(tmp, "run-20261101T225900Z-444444aa")), true, "unsettled run survives");
  assert.equal(res.kept, 4);

  // A tighter cap prunes further but still never touches pinned evidence.
  const res2 = pruneOldRuns(tmp, { keep: 1 });
  assert.deepEqual(res2.pruned, [ids[2]]);
  assert.equal(existsSync(runDir(tmp, ids[1])), true, "registro-referenced run still survives");
  assert.equal(existsSync(runDir(tmp, ids[3])), true);
  assert.equal(listRunManifests(tmp).length, res2.kept);
});

test("S5 §4.E: absolute path tokens inside engine command strings are tagged too", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-cmd-privacy-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const runId = "run-20261101T235900Z-cafe01";
  appendRunEvent(tmp, runId, {
    at: "2026-11-01T23:59:00Z",
    type: "tool_completed",
    toolName: "filmcraft_render_sequence",
    details: { command: `render -i ${join(tmp, "seq.fc.json")} -o /Volumes/Studio/out/master.mp4 --w 1920` },
  });

  const raw = readFileSync(runEventsPath(tmp, runId), "utf8");
  assert.ok(!raw.includes(tmp), "command must not leak the video absolute path");
  assert.match(raw, /-i <video>\/seq\.fc\.json/, "input token must be tagged <video>/");
  assert.match(raw, /-o <external>\/master\.mp4/, "output token must be tagged <external>/");
  assert.match(raw, /--w 1920/, "non-path tokens stay untouched");
});
