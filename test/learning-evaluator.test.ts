import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  evaluateAtomicLearnings,
  LEARNING_EVAL_STATUSES,
  loadAtomicLearningsRegistry,
  summarizeLearningEvaluations,
} from "../src/core/learning-evaluator.ts";
import { evaluateRunAssurance, recordReferenceReadInAttestation } from "../src/core/assurance.ts";
import { resolveWorkflowContext } from "../src/core/context-resolver.ts";
import { evaluate } from "../src/core/machine.ts";
import { createFsReader, scaffoldVideoDir } from "../src/store/fs-store.ts";
import { createRunRecord, finalizeRunRecord, loadRunManifest } from "../src/store/run-ledger.ts";

const ROOT = join(import.meta.dirname, "..");

test("S4 §4.C: every one of the 53 atomic learnings receives exactly one explicit status per run", () => {
  const registry = loadAtomicLearningsRegistry(ROOT);
  assert.ok(registry, "framework-map.json atomic_learnings must load");
  assert.equal(registry.learnings.length, 53, "the registry must evaluate all 53 learnings");

  const tmp = mkdtempSync(join(tmpdir(), "yts-learnings-"));
  try {
    const now = "2026-11-01T18:00:00Z";
    const { registry: reg } = scaffoldVideoDir(tmp, { now });
    const wf = resolveWorkflowContext({
      videoDir: tmp,
      promptText: "Inicia P01_PACKAGING",
      reg,
      evaluation: evaluate(reg, createFsReader(tmp)),
      hasRegistry: true,
    });

    const manifest = createRunRecord({
      runId: "run-20261101T180000Z-aa11bb22",
      videoDir: tmp,
      startedAt: now,
      promptText: "Inicia P01_PACKAGING",
      resolvedWorkflow: wf,
      promptDelivered: true,
      promptHash: "sha256:learn",
    });

    const evals = evaluateAtomicLearnings(manifest, registry.learnings);
    assert.equal(evals.length, 53);
    const statuses = new Set<string>();
    for (const e of evals) {
      assert.ok(
        (LEARNING_EVAL_STATUSES as readonly string[]).includes(e.status),
        `${e.learning_id}: status ${e.status} not in ${LEARNING_EVAL_STATUSES.join("|")}`,
      );
      assert.ok(e.reason.length > 5, `${e.learning_id}: reason must be descriptive`);
      statuses.add(e.status);
    }

    // A P01 run: P02-only learnings must be NOT_APPLICABLE, packaging/global ones applicable.
    const resLearning = evals.find((e) => e.learning_id === "RES-MEDIANA-RECIENTE");
    assert.equal(resLearning?.applicable, false);
    assert.equal(resLearning?.status, "NOT_APPLICABLE");

    const summary = summarizeLearningEvaluations(evals);
    assert.equal(summary.total, 53);
    assert.equal(summary.notApplicable > 0, true, "P02..P07 learnings are not applicable in P01");
    assert.equal(summary.applicable + summary.notApplicable, 53);
    assert.ok(statuses.size >= 2, "at least two distinct statuses expected");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("S4 §4.C: RunManifest persists learningEvaluations after finalize with skill delivery as DELIVERED", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-learnings-persist-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const now = "2026-11-01T18:10:00Z";
  const { registry: reg } = scaffoldVideoDir(tmp, { now });
  writeFileSync(
    join(tmp, "01-packaging.md"),
    [
      "# 01 - Packaging: Títulos y Miniaturas",
      "## 2. Opciones de Títulos",
      "1. Relojes atómicos que pierden un segundo (palanca usada: Curiosidad)",
      "2. El fallo de sincronía del GPS mundial (palanca usada: Miedo)",
      "3. La oscilación de cesio que sostiene Internet (palanca usada: Mecanismo)",
      "4. 30 nanosegundos de límite físico (palanca usada: Especificidad)",
      "5. Lo que la física cuántica cambió hoy (palanca usada: Relevancia)",
      "- **Título Principal Seleccionado:** El fallo de sincronía del GPS mundial",
      "- **Justificación del título elegido:** Une un riesgo cotidiano con el mecanismo real del cesio.",
      "### Miniatura A",
      "- **Punto focal principal (Hero):** Reloj atómico con alerta roja",
      "### Miniatura B",
      "- **Concepto diferencial respecto a la Variante A:** Mapa mundial en apagón",
      "### Miniatura C",
      "- **Concepto diferencial:** Reloj mecánico contra trampa de átomos",
    ].join("\n"),
    "utf8",
  );
  const wf = resolveWorkflowContext({
    videoDir: tmp,
    promptText: "Inicia P01_PACKAGING",
    reg,
    evaluation: evaluate(reg, createFsReader(tmp)),
    hasRegistry: true,
  });

  const manifest = createRunRecord({
    runId: "run-20261101T181000Z-cc22dd33",
    videoDir: tmp,
    startedAt: now,
    promptText: "Inicia P01_PACKAGING",
    resolvedWorkflow: wf,
    promptDelivered: true,
    promptHash: "sha256:learn2",
  });

  // Simulate the agent fully reading the assigned packaging skill and passing its gate.
  recordReferenceReadInAttestation(
    manifest.context,
    manifest.context.expectedSkill.resolvedPath,
    tmp,
  );
  for (const ref of manifest.context.mandatoryReferences) {
    if (ref.resolvedPath) recordReferenceReadInAttestation(manifest.context, ref.resolvedPath, tmp);
  }
  manifest.phaseSubmitted = true;
  manifest.phaseStatusAtEnd = "PENDIENTE_APROBACION";
  for (const chk of manifest.checks) {
    chk.executed = true;
    chk.verdict = "PASS";
    chk.verified_by = "runtime";
  }
  finalizeRunRecord(tmp, manifest, { finishedAt: "2026-11-01T18:11:00Z", aborted: false });

  const stored = loadRunManifest(tmp, "run-20261101T181000Z-cc22dd33")!;
  assert.ok(Array.isArray(stored.learningEvaluations), "run must persist learningEvaluations");
  assert.equal(stored.learningEvaluations!.length, 53);
  // PKG-CAJA-PALANCAS is a P01 DELIVERED learning owned by the assigned packaging skill.
  const pkgLearning = stored.learningEvaluations!.find((e) => e.learning_id === "PKG-CAJA-PALANCAS");
  assert.ok(pkgLearning, "P01 packaging learning must be evaluated");
  assert.equal(pkgLearning.applicable, true);
  assert.equal(pkgLearning.status, "DELIVERED");

  // PKG-5-DISTINTOS is HUMAN_JUDGED: submitted but not approved must stay pending human review.
  const judged = stored.learningEvaluations!.find((e) => e.learning_id === "PKG-5-DISTINTOS");
  assert.equal(judged?.status, "APPLICABLE", "human judgment is still pending after submit");

  // Two explicit dimensions (S4 §4.D) must be reported for the run.
  assert.ok(stored.production, "run must report the production lifecycle dimension");
  assert.equal(stored.production.submitted, true);
  assert.equal(stored.production.approved, false);
  assert.match(stored.production.summary, /enviada a revisión/);
  assert.equal(evaluateRunAssurance(stored).status, "PASSED");
});

test("S4 §5: engine mutations without a later inspection or measurement never certify PASSED", (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-engine-outcome-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const now = "2026-11-01T19:00:00Z";
  const { registry: reg } = scaffoldVideoDir(tmp, { now });
  const wf = resolveWorkflowContext({
    videoDir: tmp,
    promptText: "Completa P01_PACKAGING",
    reg,
    evaluation: evaluate(reg, createFsReader(tmp)),
    hasRegistry: true,
  });

  const buildManifest = (runId: string) => {
    const m = createRunRecord({
      runId,
      videoDir: tmp,
      startedAt: now,
      promptText: "Completa P01_PACKAGING",
      resolvedWorkflow: wf,
      promptDelivered: true,
      promptHash: "sha256:engine",
    });
    recordReferenceReadInAttestation(m.context, m.context.expectedSkill.resolvedPath, tmp);
    for (const ref of m.context.mandatoryReferences) {
      if (ref.resolvedPath) recordReferenceReadInAttestation(m.context, ref.resolvedPath, tmp);
    }
    m.phaseSubmitted = true;
    m.phaseStatusAtEnd = "PENDIENTE_APROBACION";
    m.finishedAt = "2026-11-01T19:00:30Z";
    for (const chk of m.checks) {
      chk.executed = true;
      chk.verdict = "PASS";
      chk.verified_by = "runtime";
    }
    return m;
  };

  // A. mutation with no follow-up verification -> engine control unsatisfied, run DEGRADED
  const unverified = buildManifest("run-20261101T190000Z-ee44ff55");
  unverified.actions.completedTools.push(
    { toolName: "effectcraft_execute_command", at: now, isError: false },
    { toolName: "soundcraft_batch", at: now, isError: false },
  );
  const evalUnverified = evaluateRunAssurance(unverified);
  const engineControl = evalUnverified.controls.find((c) =>
    c.control.includes("motores de medios"),
  );
  assert.ok(engineControl, "controls must report media-engine outcome verification");
  assert.equal(engineControl.satisfied, false);
  assert.equal(evalUnverified.status, "DEGRADED");
  assert.match(evalUnverified.reason, /sin verificar el resultado/);

  // B. read-only engine calls alone do not require verification
  const noMutation = buildManifest("run-20261101T190001Z-ff66aa77");
  noMutation.actions.completedTools.push(
    { toolName: "effectcraft_get_comp", at: now, isError: false },
    { toolName: "filmcraft_doc_inspect", at: now, isError: false },
  );
  const evalNoMutation = evaluateRunAssurance(noMutation);
  assert.equal(
    evalNoMutation.controls.find((c) => c.control.includes("motores de medios"))?.satisfied,
    true,
  );
  assert.match(
    evalNoMutation.controls.find((c) => c.control.includes("motores de medios"))?.result ?? "",
    /N\/A/,
  );

  // C. inspection after the mutation satisfies the control
  const verified = buildManifest("run-20261101T190002Z-aa88bb99");
  verified.actions.completedTools.push(
    { toolName: "effectcraft_execute_command", at: now, isError: false },
    { toolName: "effectcraft_get_state", at: now, isError: false },
  );
  const evalVerified = evaluateRunAssurance(verified);
  const verifiedControl = evalVerified.controls.find((c) =>
    c.control.includes("motores de medios"),
  );
  assert.equal(verifiedControl?.satisfied, true);
  assert.match(verifiedControl?.result ?? "", /effectcraft_get_state/);

  // D. measurement via yts_measure_master also counts as outcome verification
  const measured = buildManifest("run-20261101T190003Z-cc00dd11");
  measured.actions.completedTools.push(
    { toolName: "filmcraft_render_sequence", at: now, isError: false },
    { toolName: "yts_measure_master", at: now, isError: false },
  );
  assert.equal(
    evaluateRunAssurance(measured).controls.find((c) => c.control.includes("motores de medios"))
      ?.satisfied,
    true,
  );
});

test("S4 §4.D: the audit report separates Run assurance from Production lifecycle and disclaims PASSED", async (t) => {
  const { formatRunAuditReport } = await import("../src/core/assurance.ts");
  const tmp = mkdtempSync(join(tmpdir(), "yts-two-dims-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));

  const now = "2026-11-01T20:00:00Z";
  const { registry: reg } = scaffoldVideoDir(tmp, { now });
  const wf = resolveWorkflowContext({
    videoDir: tmp,
    promptText: "Inicia P01_PACKAGING",
    reg,
    evaluation: evaluate(reg, createFsReader(tmp)),
    hasRegistry: true,
  });
  const manifest = createRunRecord({
    runId: "run-20261101T200000Z-ab12cd34",
    videoDir: tmp,
    startedAt: now,
    promptText: "Inicia P01_PACKAGING",
    resolvedWorkflow: wf,
    promptDelivered: true,
    promptHash: "sha256:dims",
  });
  manifest.phaseStatusAtEnd = "EN_CURSO";
  finalizeRunRecord(tmp, manifest, { finishedAt: "2026-11-01T20:01:00Z", aborted: false });

  const report = formatRunAuditReport(manifest);
  assert.match(report, /Dimensión 1 — Run assurance/);
  assert.match(report, /Dimensión 2 — Production lifecycle/);
  assert.match(report, /Aprendizajes atómicos evaluados en esta corrida: 53/);
  assert.match(
    report,
    /No es una aprobación editorial ni un certificado de publicación/,
    "PASSED must never read as an approval or publication certificate",
  );
});
