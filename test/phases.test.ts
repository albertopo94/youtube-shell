import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PHASES, PHASE_IDS } from "../src/core/phases.ts";
import { extractSection } from "../src/core/sections.ts";

const TEMPLATES = join(import.meta.dirname, "..", "templates", "pipeline-video");

test("the contract defines the 7 phases in order with linear prerequisites", () => {
  assert.deepEqual(PHASE_IDS, [
    "P01_PACKAGING",
    "P02_RESEARCH",
    "P03_SCRIPT",
    "P04_FACTCHECK",
    "P05_ANIMATIC",
    "P06_ASSEMBLY",
    "P07_CLOSE",
  ]);
  PHASES.forEach((p, i) => {
    assert.deepEqual(p.requires, i === 0 ? [] : [PHASE_IDS[i - 1]]);
  });
});

test("no phase claims 00-estado-produccion.md: it is a view, not evidence", () => {
  for (const p of PHASES) {
    assert.ok(p.documents.every((d) => d.file !== "00-estado-produccion.md"), p.id);
  }
});

test("every section selector resolves exactly once in the shipped templates", () => {
  for (const p of PHASES) {
    for (const d of p.documents) {
      let text: string;
      try {
        text = readFileSync(join(TEMPLATES, d.file), "utf8");
      } catch {
        // entregable-final.md has no template yet (contract assumption 2).
        assert.equal(d.file, "entregable-final.md", `${p.id}: missing template ${d.file}`);
        continue;
      }
      for (const s of d.sections ?? []) {
        const r = extractSection(text, s);
        assert.ok(r.ok, `${p.id}: ${d.file} § ${s} — ${!r.ok ? r.reason : ""}`);
      }
    }
  }
});

test("shared files are split so phases never fingerprint the same section", () => {
  const claims = PHASES.flatMap((p) =>
    p.documents.flatMap((d) =>
      d.sections ? d.sections.map((s) => ({ phase: p.id, file: d.file, section: s })) : [{ phase: p.id, file: d.file, section: undefined }],
    ),
  );
  for (const [i, a] of claims.entries()) {
    for (const b of claims.slice(i + 1)) {
      if (a.file !== b.file) continue;
      const overlap = a.section === undefined || b.section === undefined || a.section === b.section;
      assert.ok(!overlap, `${a.phase} and ${b.phase} both fingerprint ${a.file} ${a.section ?? ""} / ${b.section ?? ""}`);
    }
  }
});
