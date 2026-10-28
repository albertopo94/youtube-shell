import test from "node:test";
import assert from "node:assert/strict";
import {
  approveAcceptanceSheet,
  approvePhase,
  blockPhase,
  changeProductionMode,
  createRegistry,
  evaluate,
  reopenPhase,
  requestChanges,
  startPhase,
  submitPhase,
  unblockPhase,
} from "../src/core/machine.ts";
import { getPhase, PHASE_IDS } from "../src/core/phases.ts";
import type { Actor, ArtifactReader, ArtifactRef, CheckRun, Context, PhaseId, Registry, Result } from "../src/core/types.ts";
import { refKey } from "../src/core/types.ts";

const AGENT: Actor = { kind: "agent" };
const CREATOR: Actor = { kind: "creator", channel: "test" };

/** In-memory project: artifact key -> content. Fingerprint is derived from content. */
class FakeProject implements ArtifactReader {
  files = new Map<string, string>();
  fingerprint(ref: ArtifactRef) {
    const c = this.files.get(refKey(ref));
    return c === undefined ? { ok: false as const, reason: `no existe ${refKey(ref)}` } : { ok: true as const, hash: `h:${c}` };
  }
  readContent(file: string): string | undefined {
    return this.files.get(file);
  }
  /** Fill every document and evidence a phase needs. */
  fill(id: PhaseId, tag = "v1") {
    for (const d of getPhase(id).documents) {
      for (const k of d.sections ? d.sections.map((s) => `${d.file}#${s}`) : [d.file]) this.files.set(k, `${k}:${tag}`);
    }
    for (const e of getPhase(id).evidence) this.files.set(evidencePath(e.role), `${e.role}:${tag}`);
  }
}

const evidencePath = (role: string) => `exports/${role}.bin`;
const passingChecks = (id: PhaseId): CheckRun[] =>
  getPhase(id).checks.map((c) => ({ id: c, result: "PASS", verifiedBy: "runtime" }));
const allEvidence = (id: PhaseId) => getPhase(id).evidence.map((e) => ({ role: e.role, path: evidencePath(e.role) }));

let clock = 0;
const ctx = (project: FakeProject, actor: Actor = AGENT): Context => ({
  actor,
  reader: project,
  now: new Date(Date.UTC(2026, 9, 21, 12, 0, clock++)).toISOString(),
});

function ok(r: Result): Registry {
  if (!r.ok) assert.fail(`expected ok, got: ${r.reasons.join(" | ")}`);
  return r.registry;
}
function denied(r: Result, pattern: RegExp): string[] {
  if (r.ok) assert.fail("expected denial");
  assert.ok(r.reasons.some((x) => pattern.test(x)), `no reason matches ${pattern}: ${r.reasons.join(" | ")}`);
  return r.reasons;
}

function approveThrough(project: FakeProject, last: PhaseId, start: Registry = createRegistry("vid", "2026-10-21T00:00:00Z")) {
  let reg = start;
  for (const id of PHASE_IDS.slice(0, PHASE_IDS.indexOf(last) + 1)) {
    project.fill(id);
    reg = ok(startPhase(reg, id, ctx(project)));
    reg = ok(submitPhase(reg, id, { checks: passingChecks(id), evidence: allEvidence(id) }, ctx(project)));
    reg = ok(approvePhase(reg, id, {}, ctx(project, CREATOR)));
  }
  return reg;
}
const view = (reg: Registry, project: FakeProject, id: PhaseId) => evaluate(reg, project).phases.find((p) => p.id === id)!;

test("a new production only allows starting packaging", () => {
  const project = new FakeProject();
  const ev = evaluate(createRegistry("vid", "2026-10-21T00:00:00Z"), project);
  assert.deepEqual(ev.phases.filter((p) => p.canStart).map((p) => p.id), ["P01_PACKAGING"]);
  assert.ok(ev.phases.every((p) => p.effective === "NO_INICIADO"));
  assert.match(ev.nextAction, /P01_PACKAGING/);
});

test("a phase cannot start while its prerequisite lacks a current approval, and the registry is untouched", () => {
  const project = new FakeProject();
  const reg = createRegistry("vid", "2026-10-21T00:00:00Z");
  const before = structuredClone(reg);
  denied(startPhase(reg, "P03_SCRIPT", ctx(project)), /P02_RESEARCH.*aprobación/);
  assert.deepEqual(reg, before);
});

test("starting an already started phase is denied", () => {
  const project = new FakeProject();
  const reg = ok(startPhase(createRegistry("vid", "x"), "P01_PACKAGING", ctx(project)));
  denied(startPhase(reg, "P01_PACKAGING", ctx(project)), /EN_CURSO/);
});

test("submission requires every document section, reporting each missing one", () => {
  const project = new FakeProject();
  const reg = ok(startPhase(createRegistry("vid", "x"), "P01_PACKAGING", ctx(project)));
  denied(submitPhase(reg, "P01_PACKAGING", { checks: [], evidence: [] }, ctx(project)), /01-packaging\.md/);
});

test("a required check that did not run is NOT_EVALUABLE and blocks submission", () => {
  const project = new FakeProject();
  let reg = approveThrough(project, "P02_RESEARCH");
  project.fill("P03_SCRIPT");
  reg = ok(startPhase(reg, "P03_SCRIPT", ctx(project)));
  denied(submitPhase(reg, "P03_SCRIPT", { checks: [], evidence: [] }, ctx(project)), /script_block_ids.*NOT_EVALUABLE/);
});

test("submitPhase rejects a required check that lacks verifiedBy=runtime provenance", () => {
  const project = new FakeProject();
  let reg = approveThrough(project, "P02_RESEARCH");
  project.fill("P03_SCRIPT");
  reg = ok(startPhase(reg, "P03_SCRIPT", ctx(project)));
  denied(
    submitPhase(
      reg,
      "P03_SCRIPT",
      { checks: [{ id: "script_block_ids", result: "PASS" }], evidence: [] },
      ctx(project),
    ),
    /script_block_ids.*verifiedBy="runtime"/,
  );
});

test("a FAIL or NOT_EVALUABLE check blocks submission", () => {
  const project = new FakeProject();
  let reg = approveThrough(project, "P02_RESEARCH");
  project.fill("P03_SCRIPT");
  reg = ok(startPhase(reg, "P03_SCRIPT", ctx(project)));
  for (const result of ["FAIL", "NOT_EVALUABLE"] as const) {
    denied(
      submitPhase(
        reg,
        "P03_SCRIPT",
        { checks: [{ id: "script_block_ids", result, details: "B04 sin ID", verifiedBy: "runtime" }], evidence: [] },
        ctx(project),
      ),
      new RegExp(`script_block_ids.*${result}.*B04`),
    );
  }
});

test("a WARN never passes silently: the creator must acknowledge it when approving", () => {
  const project = new FakeProject();
  let reg = approveThrough(project, "P02_RESEARCH");
  project.fill("P03_SCRIPT");
  reg = ok(startPhase(reg, "P03_SCRIPT", ctx(project)));
  reg = ok(
    submitPhase(
      reg,
      "P03_SCRIPT",
      { checks: [{ id: "script_block_ids", result: "WARN", details: "plantilla antigua", verifiedBy: "runtime" }], evidence: [] },
      ctx(project),
    ),
  );
  denied(approvePhase(reg, "P03_SCRIPT", {}, ctx(project, CREATOR)), /WARN/);
  reg = ok(approvePhase(reg, "P03_SCRIPT", { acknowledgeWarnings: true }, ctx(project, CREATOR)));
  assert.deepEqual(reg.phases.P03_SCRIPT.approvals.at(-1)?.acknowledgedWarnings, ["script_block_ids"]);
});

test("the agent cannot approve a phase, and nothing is recorded", () => {
  const project = new FakeProject();
  project.fill("P01_PACKAGING");
  let reg = ok(startPhase(createRegistry("vid", "x"), "P01_PACKAGING", ctx(project)));
  reg = ok(submitPhase(reg, "P01_PACKAGING", { checks: passingChecks("P01_PACKAGING"), evidence: [] }, ctx(project)));
  const before = structuredClone(reg);
  denied(approvePhase(reg, "P01_PACKAGING", {}, ctx(project, AGENT)), /Solo el creador/);
  assert.deepEqual(reg, before);
  assert.equal(view(reg, project, "P01_PACKAGING").effective, "PENDIENTE_APROBACION");
});

test("approval is denied if an artifact changed after submission", () => {
  const project = new FakeProject();
  project.fill("P01_PACKAGING");
  let reg = ok(startPhase(createRegistry("vid", "x"), "P01_PACKAGING", ctx(project)));
  reg = ok(submitPhase(reg, "P01_PACKAGING", { checks: passingChecks("P01_PACKAGING"), evidence: [] }, ctx(project)));
  project.fill("P01_PACKAGING", "edited");
  denied(approvePhase(reg, "P01_PACKAGING", {}, ctx(project, CREATOR)), /01-packaging\.md cambió/);
  reg = ok(submitPhase(reg, "P01_PACKAGING", { checks: passingChecks("P01_PACKAGING"), evidence: [] }, ctx(project)));
  ok(approvePhase(reg, "P01_PACKAGING", {}, ctx(project, CREATOR)));
});

test("the approval records fingerprints, checks, contract version and actor", () => {
  const project = new FakeProject();
  const reg = approveThrough(project, "P01_PACKAGING");
  const a = reg.phases.P01_PACKAGING.approvals.at(-1)!;
  assert.deepEqual(a.actor, CREATOR);
  assert.equal(a.contractVersion, 1);
  assert.deepEqual(a.artifacts, [{ ref: { file: "01-packaging.md" }, hash: "h:01-packaging.md:v1" }]);
});

test("editing an approved artifact makes the phase OBSOLETO and cascades to dependants", () => {
  const project = new FakeProject();
  const reg = approveThrough(project, "P03_SCRIPT");
  project.files.set("01-packaging.md", "título cambiado");
  const ev = evaluate(reg, project);
  const byId = Object.fromEntries(ev.phases.map((p) => [p.id, p]));
  assert.equal(byId.P01_PACKAGING.effective, "OBSOLETO");
  assert.match(byId.P01_PACKAGING.reasons.join(), /01-packaging\.md cambió/);
  assert.equal(byId.P02_RESEARCH.effective, "OBSOLETO");
  assert.equal(byId.P03_SCRIPT.effective, "OBSOLETO");
  assert.match(byId.P03_SCRIPT.reasons.join(), /P02_RESEARCH/);
  assert.equal(byId.P04_FACTCHECK.canStart, false);
  assert.match(ev.nextAction, /P01_PACKAGING/);
});

test("editing fact-check sections of the shared file does not invalidate approved research", () => {
  const project = new FakeProject();
  let reg = approveThrough(project, "P03_SCRIPT");
  reg = ok(startPhase(reg, "P04_FACTCHECK", ctx(project)));
  project.files.set("06-fuentes-y-verificacion.md#Parte 2", "B01 VERIFICADO");
  assert.equal(view(reg, project, "P02_RESEARCH").effective, "APROBADO");
  assert.equal(view(reg, project, "P04_FACTCHECK").canWork, true);
});

test("an obsolete phase is reopened with a reason and keeps its approval history", () => {
  const project = new FakeProject();
  let reg = approveThrough(project, "P01_PACKAGING");
  denied(reopenPhase(reg, "P01_PACKAGING", "quiero cambiar", ctx(project)), /creador/);
  project.files.set("01-packaging.md", "otro título");
  denied(reopenPhase(reg, "P01_PACKAGING", "", ctx(project)), /motivo/);
  reg = ok(reopenPhase(reg, "P01_PACKAGING", "nuevo ángulo de título", ctx(project)));
  assert.equal(reg.phases.P01_PACKAGING.status, "EN_CURSO");
  assert.equal(reg.phases.P01_PACKAGING.approvals.length, 1);
  assert.equal(view(reg, project, "P01_PACKAGING").effective, "EN_CURSO");
  assert.equal(reg.history.at(-1)?.event, "reopen");
});

test("the creator can revoke a current approval", () => {
  const project = new FakeProject();
  let reg = approveThrough(project, "P01_PACKAGING");
  reg = ok(reopenPhase(reg, "P01_PACKAGING", "cambio de estrategia", ctx(project, CREATOR)));
  assert.equal(reg.phases.P01_PACKAGING.status, "EN_CURSO");
});

test("the creator can request changes on a pending phase, with a note", () => {
  const project = new FakeProject();
  project.fill("P01_PACKAGING");
  let reg = ok(startPhase(createRegistry("vid", "x"), "P01_PACKAGING", ctx(project)));
  reg = ok(submitPhase(reg, "P01_PACKAGING", { checks: passingChecks("P01_PACKAGING"), evidence: [] }, ctx(project)));
  denied(requestChanges(reg, "P01_PACKAGING", "más contraste", ctx(project, AGENT)), /Solo el creador/);
  denied(requestChanges(reg, "P01_PACKAGING", " ", ctx(project, CREATOR)), /nota/);
  reg = ok(requestChanges(reg, "P01_PACKAGING", "miniatura B con más contraste", ctx(project, CREATOR)));
  assert.equal(reg.phases.P01_PACKAGING.status, "EN_CURSO");
});

test("blocking requires a reason and unblocking a resolution", () => {
  const project = new FakeProject();
  let reg = ok(startPhase(createRegistry("vid", "x"), "P01_PACKAGING", ctx(project)));
  denied(blockPhase(reg, "P01_PACKAGING", "", ctx(project)), /motivo/);
  reg = ok(blockPhase(reg, "P01_PACKAGING", "falta referencia de miniatura", ctx(project)));
  assert.equal(view(reg, project, "P01_PACKAGING").canWork, false);
  assert.match(evaluate(reg, project).nextAction, /falta referencia de miniatura/);
  denied(unblockPhase(reg, "P01_PACKAGING", "", ctx(project)), /resolución/);
  reg = ok(unblockPhase(reg, "P01_PACKAGING", "el creador mandó la referencia", ctx(project)));
  assert.equal(reg.phases.P01_PACKAGING.status, "EN_CURSO");
});

test("declared evidence must cover every required role with a safe relative path", () => {
  const project = new FakeProject();
  let reg = approveThrough(project, "P05_ANIMATIC");
  project.fill("P06_ASSEMBLY");
  reg = ok(startPhase(reg, "P06_ASSEMBLY", ctx(project)));
  const checks = passingChecks("P06_ASSEMBLY");
  denied(submitPhase(reg, "P06_ASSEMBLY", { checks, evidence: [] }, ctx(project)), /master/);
  for (const bad of ["../otro-video/master.mp4", "/Users/x/master.mp4", "exports/../../x.mp4", ".youtube-shell/registro.json"]) {
    const evidence = allEvidence("P06_ASSEMBLY").map((e) => (e.role === "master" ? { ...e, path: bad } : e));
    denied(submitPhase(reg, "P06_ASSEMBLY", { checks, evidence }, ctx(project)), /ruta/);
  }
  denied(
    submitPhase(reg, "P06_ASSEMBLY", { checks, evidence: [...allEvidence("P06_ASSEMBLY"), { role: "extra", path: "a.mp4" }] }, ctx(project)),
    /extra/,
  );
  ok(submitPhase(reg, "P06_ASSEMBLY", { checks, evidence: allEvidence("P06_ASSEMBLY") }, ctx(project)));
});

test("replacing an approved master makes assembly obsolete", () => {
  const project = new FakeProject();
  const reg = approveThrough(project, "P06_ASSEMBLY");
  project.files.set(evidencePath("master"), "otro render");
  assert.equal(view(reg, project, "P06_ASSEMBLY").effective, "OBSOLETO");
});

test("the whole pipeline can be approved end to end, and history records every step", () => {
  const project = new FakeProject();
  const reg = approveThrough(project, "P07_CLOSE");
  const ev = evaluate(reg, project);
  assert.ok(ev.phases.every((p) => p.effective === "APROBADO"));
  assert.equal(reg.history.length, 7 * 3);
  assert.ok(reg.history.filter((h) => h.event === "approve").every((h) => h.actor === "creator"));
});

test("only the creator can approve a pre-render acceptance sheet, binding its path and sha256 in the registry", () => {
  const reg = createRegistry("vid", "2026-10-24T00:00:00Z");
  denied(
    approveAcceptanceSheet(reg, {
      path: "aceptacion.json",
      sha256: "sha256:abc123",
      actor: AGENT,
      now: "2026-10-24T01:00:00Z",
    }),
    /Solo el creador/,
  );

  const approved = ok(
    approveAcceptanceSheet(reg, {
      path: "aceptacion.json",
      sha256: "sha256:abc123",
      actor: CREATOR,
      now: "2026-10-24T01:00:00Z",
    }),
  );
  assert.deepEqual(approved.acceptanceSheetApproval, {
    path: "aceptacion.json",
    sha256: "sha256:abc123",
    approvedAt: "2026-10-24T01:00:00Z",
    actor: CREATOR,
  });
});

test("production modes adapt required evidence in P05_ANIMATIC (screen_first, speaker_first, music_first, audio_first)", () => {
  const modes = [
    { mode: "screen_first" as const, role: "screen_recording", file: "capture.mp4" },
    { mode: "speaker_first" as const, role: "speaker_track", file: "aroll.mp4" },
    { mode: "music_first" as const, role: "music_bed", file: "beat.wav" },
    { mode: "audio_first" as const, role: "scratch_track", file: "voice.wav" },
  ];

  for (const { mode, role, file } of modes) {
    const project = new FakeProject();
    let reg = approveThrough(project, "P04_FACTCHECK");
    project.fill("P05_ANIMATIC");
    reg.productionMode = mode;
    reg = ok(startPhase(reg, "P05_ANIMATIC", ctx(project)));

    project.files.set(file, "content");

    // Denies wrong evidence role for this mode
    denied(
      submitPhase(reg, "P05_ANIMATIC", { checks: [], evidence: [{ role: "wrong_role", path: file }] }, ctx(project)),
      /Rol de evidencia no declarado/,
    );

    // Accepts correct evidence role for this mode
    const subRes = submitPhase(reg, "P05_ANIMATIC", { checks: [], evidence: [{ role, path: file }] }, ctx(project));
    const subReg = ok(subRes);
    assert.equal(subReg.productionMode, mode);
  }

  // Also verify alias support (e.g. action_draft for screen_first)
  const projectAlias = new FakeProject();
  let regAlias = approveThrough(projectAlias, "P04_FACTCHECK");
  projectAlias.fill("P05_ANIMATIC");
  regAlias.productionMode = "screen_first";
  regAlias = ok(startPhase(regAlias, "P05_ANIMATIC", ctx(projectAlias)));
  projectAlias.files.set("draft.mp4", "content");
  const aliasRes = submitPhase(regAlias, "P05_ANIMATIC", { checks: [], evidence: [{ role: "action_draft", path: "draft.mp4" }] }, ctx(projectAlias));
  ok(aliasRes);
});

test("submitting P05_ANIMATIC fails when mode is unselected or ambiguous in 00-estado-produccion.md", () => {
  // 1. Unselected mode in P05_ANIMATIC
  const pUnselected = new FakeProject();
  let rUnselected = approveThrough(pUnselected, "P04_FACTCHECK");
  pUnselected.fill("P05_ANIMATIC");
  delete (rUnselected as any).productionMode;
  pUnselected.files.set(
    "00-estado-produccion.md",
    "- **Flujo Audiovisual seleccionado:** `[ ] Audio-First` / `[ ] Screen-First` / `[ ] Speaker-First` / `[ ] Music-First`",
  );
  rUnselected = ok(startPhase(rUnselected, "P05_ANIMATIC", ctx(pUnselected)));
  denied(
    submitPhase(rUnselected, "P05_ANIMATIC", { checks: [], evidence: [{ role: "scratch_track", path: "exports/scratch_track.bin" }] }, ctx(pUnselected)),
    /No se ha seleccionado ningún Flujo Audiovisual/i,
  );

  // 2. Ambiguous mode (multiple selected)
  const pAmbiguous = new FakeProject();
  let rAmbiguous = approveThrough(pAmbiguous, "P04_FACTCHECK");
  pAmbiguous.fill("P05_ANIMATIC");
  delete (rAmbiguous as any).productionMode;
  pAmbiguous.files.set(
    "00-estado-produccion.md",
    "- **Flujo Audiovisual seleccionado:** `[x] Audio-First` / `[x] Screen-First` / `[ ] Speaker-First` / `[ ] Music-First`",
  );
  rAmbiguous = ok(startPhase(rAmbiguous, "P05_ANIMATIC", ctx(pAmbiguous)));
  denied(
    submitPhase(rAmbiguous, "P05_ANIMATIC", { checks: [], evidence: [{ role: "scratch_track", path: "exports/scratch_track.bin" }] }, ctx(pAmbiguous)),
    /Selección ambigua en 00-estado-produccion\.md/i,
  );
});

test("changeProductionMode allows setting mode before P03 and denies changes once P03 or P05 are approved", () => {
  const project = new FakeProject();
  let reg = createRegistry("vid", "2026-10-21T00:00:00Z");

  // 1. Setting mode before P03 succeeds
  reg = ok(changeProductionMode(reg, "screen_first", ctx(project)));
  assert.equal(reg.productionMode, "screen_first");

  // Setting same mode is no-op ok
  reg = ok(changeProductionMode(reg, "screen_first", ctx(project)));

  // Changing to speaker_first succeeds
  reg = ok(changeProductionMode(reg, "speaker_first", ctx(project)));
  assert.equal(reg.productionMode, "speaker_first");

  // Advance through P03_SCRIPT APROBADO
  reg = approveThrough(project, "P03_SCRIPT", reg);

  // 2. Changing mode once P03_SCRIPT is approved is denied
  denied(
    changeProductionMode(reg, "screen_first", ctx(project)),
    /No se puede cambiar el flujo.*porque P03_SCRIPT ya está en APROBADO/,
  );

  // 2b. Also denied when P03_SCRIPT is EN_CURSO or PENDIENTE_APROBACION
  const p3Active = createRegistry("vid", "2026-10-21T00:00:00Z");
  p3Active.phases.P01_PACKAGING.status = "APROBADO";
  p3Active.phases.P02_RESEARCH.status = "APROBADO";
  p3Active.phases.P03_SCRIPT.status = "EN_CURSO";
  denied(
    changeProductionMode(p3Active, "screen_first", ctx(project)),
    /No se puede cambiar el flujo.*porque P03_SCRIPT ya está en EN_CURSO/,
  );
  p3Active.phases.P03_SCRIPT.status = "PENDIENTE_APROBACION";
  denied(
    changeProductionMode(p3Active, "screen_first", ctx(project)),
    /No se puede cambiar el flujo.*porque P03_SCRIPT ya está en PENDIENTE_APROBACION/,
  );

  // Advance through P05_ANIMATIC APROBADO
  const project2 = new FakeProject();
  let reg2 = approveThrough(project2, "P04_FACTCHECK");
  reg2.productionMode = "speaker_first";
  project2.fill("P05_ANIMATIC");
  reg2 = ok(startPhase(reg2, "P05_ANIMATIC", ctx(project2)));
  const evidenceRole = "speaker_track";
  project2.files.set("exports/speaker_track.bin", "content");
  reg2 = ok(
    submitPhase(
      reg2,
      "P05_ANIMATIC",
      { checks: [], evidence: [{ role: evidenceRole, path: "exports/speaker_track.bin" }] },
      ctx(project2),
    ),
  );
  reg2 = ok(approvePhase(reg2, "P05_ANIMATIC", {}, ctx(project2, CREATOR)));

  // 3. Changing mode once P05_ANIMATIC is approved is denied
  denied(
    changeProductionMode(reg2, "music_first", ctx(project2)),
    /No se puede cambiar el flujo.*porque P05_ANIMATIC ya está en APROBADO/,
  );

  // 3b. Also denied when P05_ANIMATIC is EN_CURSO or PENDIENTE_APROBACION
  const p5Active = createRegistry("vid", "2026-10-21T00:00:00Z");
  p5Active.phases.P05_ANIMATIC.status = "EN_CURSO";
  denied(
    changeProductionMode(p5Active, "music_first", ctx(project2)),
    /No se puede cambiar el flujo.*porque P05_ANIMATIC ya está en EN_CURSO/,
  );
  p5Active.phases.P05_ANIMATIC.status = "PENDIENTE_APROBACION";
  denied(
    changeProductionMode(p5Active, "music_first", ctx(project2)),
    /No se puede cambiar el flujo.*porque P05_ANIMATIC ya está en PENDIENTE_APROBACION/,
  );
});

test("submitPhase rejects discrepancy between authoritative registry mode and markdown view selection", () => {
  const project = new FakeProject();
  let reg = approveThrough(project, "P04_FACTCHECK");
  reg.productionMode = "audio_first";
  project.fill("P05_ANIMATIC");
  project.files.set(
    "00-estado-produccion.md",
    "- **Flujo Audiovisual seleccionado:** `[ ] Audio-First` / `[x] Screen-First` / `[ ] Speaker-First` / `[ ] Music-First`",
  );
  reg = ok(startPhase(reg, "P05_ANIMATIC", ctx(project)));
  project.files.set("exports/scratch_track.bin", "content");
  denied(
    submitPhase(
      reg,
      "P05_ANIMATIC",
      { checks: [], evidence: [{ role: "scratch_track", path: "exports/scratch_track.bin" }] },
      ctx(project),
    ),
    /Discrepancia de flujo: el registro autoritativo indica "audio_first", pero 00-estado-produccion\.md marca "screen_first"/i,
  );
});
