import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  listRunManifests,
  loadRunEvents,
  loadRunManifest,
  runEventsPath,
  runManifestPath,
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
    runId: "run-degraded-1",
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
    runId: "run-001",
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
  assert.equal(existsSync(runManifestPath(tmp, "run-001")), true);
  assert.equal(existsSync(runEventsPath(tmp, "run-001")), true);

  const finalized = finalizeRunRecord(tmp, manifest, {
    finishedAt: "2026-11-01T12:00:05Z",
    aborted: false,
  });

  assert.equal(finalized.status, "NOT_APPLICABLE");
  const loaded = loadRunManifest(tmp, "run-001");
  assert.equal(loaded?.status, "NOT_APPLICABLE");

  const events = loadRunEvents(tmp, "run-001");
  assert.equal(events.length, 2);
  assert.equal(events[0].type, "run_started");
  assert.equal(events[1].type, "run_settled");

  const allRuns = listRunManifests(tmp);
  assert.equal(allRuns.length, 1);
  assert.equal(allRuns[0].runId, "run-001");

  const reportText = formatRunAuditReport(loaded!);
  assert.match(reportText, /run-001/);
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
    runId: "run-unread-skill",
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
    runId: "run-no-app-evidence",
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
    runId: "run-20261101T151000Z-a1b2c3d4",
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

