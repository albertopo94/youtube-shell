import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
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
