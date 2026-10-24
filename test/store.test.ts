import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFsReader, loadRegistry, registryPath, saveRegistry } from "../src/store/fs-store.ts";
import { approvePhase, createRegistry, evaluate, startPhase, submitPhase } from "../src/core/machine.ts";
import type { Registry, Result } from "../src/core/types.ts";

const TEMPLATES = join(import.meta.dirname, "..", "templates", "pipeline-video");

function tempVideo(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), "yts-store-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const video = join(root, "01-video");
  cpSync(TEMPLATES, video, { recursive: true });
  return { root, video };
}
const ok = (r: Result): Registry => {
  if (!r.ok) assert.fail(r.reasons.join(" | "));
  return r.registry;
};

test("fingerprints a whole file as sha256 of its bytes", (t) => {
  const { video } = tempVideo(t);
  const bytes = readFileSync(join(video, "01-packaging.md"));
  const r = createFsReader(video).fingerprint({ file: "01-packaging.md" });
  assert.deepEqual(r, { ok: true, hash: `sha256:${createHash("sha256").update(bytes).digest("hex")}` });
});

test("a section fingerprint changes only when that section changes", (t) => {
  const { video } = tempVideo(t);
  const reader = createFsReader(video);
  const file = join(video, "06-fuentes-y-verificacion.md");
  const p1 = reader.fingerprint({ file: "06-fuentes-y-verificacion.md", section: "Parte 1" });
  appendFileSync(file, "\n| B09 | nueva afirmación |\n"); // lands in the last section (Checkpoints de Rigor)
  assert.deepEqual(reader.fingerprint({ file: "06-fuentes-y-verificacion.md", section: "Parte 1" }), p1);
  writeFileSync(file, readFileSync(file, "utf8").replace("Fuentes de Partida Identificadas", "Fuentes de partida"));
  assert.notDeepEqual(reader.fingerprint({ file: "06-fuentes-y-verificacion.md", section: "Parte 1" }), p1);
});

test("missing files, unknown sections and escaping paths are errors, never hashes", (t) => {
  const { root, video } = tempVideo(t);
  writeFileSync(join(root, "fuera.md"), "secreto");
  symlinkSync(join(root, "fuera.md"), join(video, "enlace.md"));
  const reader = createFsReader(video);
  for (const ref of [
    { file: "no-existe.md" },
    { file: "01-packaging.md", section: "Sección inventada" },
    { file: "../fuera.md" },
    { file: join(root, "fuera.md") },
    { file: "enlace.md" },
  ]) {
    const r = reader.fingerprint(ref);
    assert.equal(r.ok, false, JSON.stringify(ref));
  }
});

test("a missing registry starts a fresh production; save and load round-trip atomically", (t) => {
  const { video } = tempVideo(t);
  const reg = loadRegistry(video, { videoId: "01-video", now: "2026-10-21T00:00:00Z" });
  assert.equal(reg.phases.P01_PACKAGING.status, "NO_INICIADO");
  saveRegistry(video, reg);
  assert.deepEqual(loadRegistry(video, { videoId: "01-video", now: "later" }), reg);
  assert.deepEqual(readdirSync(join(video, ".youtube-shell")), ["registro.json"]);
});

test("a corrupt or tampered registry fails closed instead of resetting", (t) => {
  const { video } = tempVideo(t);
  saveRegistry(video, createRegistry("01-video", "2026-10-21T00:00:00Z"));
  const opts = { videoId: "01-video", now: "x" };

  writeFileSync(registryPath(video), "{ no es json");
  assert.throws(() => loadRegistry(video, opts), /registro/);

  const forged = createRegistry("01-video", "x") as unknown as { phases: Record<string, { status: string }> };
  forged.phases.P01_PACKAGING.status = "COMPLETADO";
  writeFileSync(registryPath(video), JSON.stringify(forged));
  assert.throws(() => loadRegistry(video, opts), /COMPLETADO/);

  const approvedWithoutRecord = createRegistry("01-video", "x");
  approvedWithoutRecord.phases.P01_PACKAGING.status = "APROBADO";
  writeFileSync(registryPath(video), JSON.stringify(approvedWithoutRecord));
  assert.throws(() => loadRegistry(video, opts), /APROBADO/);

  saveRegistry(video, createRegistry("otro-video", "x"));
  assert.throws(() => loadRegistry(video, opts), /otro-video/);
});

test("end to end on disk: approve packaging from the template, then an edit makes it obsolete", (t) => {
  const { video } = tempVideo(t);
  const reader = createFsReader(video);
  const agent = { actor: { kind: "agent" as const }, reader, now: "2026-10-21T10:00:00Z" };
  let reg = loadRegistry(video, { videoId: "01-video", now: agent.now });
  reg = ok(startPhase(reg, "P01_PACKAGING", agent));
  reg = ok(
    submitPhase(
      reg,
      "P01_PACKAGING",
      { checks: [{ id: "packaging_structure", result: "PASS", verifiedBy: "runtime" }], evidence: [] },
      agent,
    ),
  );
  reg = ok(approvePhase(reg, "P01_PACKAGING", {}, { ...agent, actor: { kind: "creator", channel: "test" } }));
  saveRegistry(video, reg);

  const reloaded = loadRegistry(video, { videoId: "01-video", now: "x" });
  assert.equal(evaluate(reloaded, reader).phases[0].effective, "APROBADO");
  appendFileSync(join(video, "01-packaging.md"), "\n- título 6\n");
  assert.equal(evaluate(reloaded, reader).phases[0].effective, "OBSOLETO");
});

test("registryPath lives inside the video folder", (t) => {
  const { video } = tempVideo(t);
  mkdirSync(join(video, "exports"));
  assert.equal(registryPath(video), join(video, ".youtube-shell", "registro.json"));
});

test("syncStatusView writes PUBLICADO only when all phases are approved under videos-publicados", (t) => {
  const root = mkdtempSync(join(tmpdir(), "yts-store-pub-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const studyDir = join(root, "mis-canales", "canal-x", "videos-en-estudio", "01-video");
  const pubDir = join(root, "mis-canales", "canal-x", "videos-publicados", "01-video");
  cpSync(TEMPLATES, studyDir, { recursive: true });
  cpSync(TEMPLATES, pubDir, { recursive: true });

  const makeAllApproved = (id: string): Registry => {
    const reg = createRegistry(id, "2026-10-24T00:00:00Z");
    for (const phaseId of Object.keys(reg.phases) as Array<keyof typeof reg.phases>) {
      reg.phases[phaseId].status = "APROBADO";
      reg.phases[phaseId].approvals.push({
        phase: phaseId,
        contractVersion: 1,
        approvedAt: "2026-10-24T01:00:00Z",
        actor: { kind: "creator", channel: "test" },
        artifacts: [],
        checks: [],
        acknowledgedWarns: [],
      });
    }
    return reg;
  };

  saveRegistry(studyDir, makeAllApproved("01-video"));
  saveRegistry(pubDir, makeAllApproved("01-video"));

  assert.match(
    readFileSync(join(studyDir, "00-estado-produccion.md"), "utf8"),
    /\*\*Estado actual:\*\*\s*`APROBADO`/,
  );
  assert.match(
    readFileSync(join(pubDir, "00-estado-produccion.md"), "utf8"),
    /\*\*Estado actual:\*\*\s*`PUBLICADO`/,
  );
});
