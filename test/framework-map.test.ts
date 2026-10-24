import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PHASES, PHASE_IDS } from "../src/core/phases.ts";

const ROOT = join(import.meta.dirname, "..");

const VALID_CLASSIFICATIONS = new Set([
  "deterministic_gate",
  "editorial_check",
  "context_reference",
  "human_approval",
]);

const VALID_SKILLS = new Set([
  "yts-orquestador",
  "yts-packaging-miniaturas",
  "yts-investigacion-ideas",
  "yts-guion-narrativa",
  "yts-direccion-edicion",
]);

const VALID_PHASE_TARGETS = new Set<string>([...PHASE_IDS, "GLOBAL"]);

interface FrameworkRule {
  id: string;
  title: string;
  source: { file: string; section: string };
  classification: string;
  phases: string[];
  skill: string;
  consumer: string;
  enforcement: string;
  tests: string[];
}

interface FrameworkMap {
  schema: string;
  upstream_commit: string;
  rules: FrameworkRule[];
}

function loadFrameworkMap(): FrameworkMap {
  const raw = readFileSync(join(ROOT, "framework-map.json"), "utf8");
  return JSON.parse(raw) as FrameworkMap;
}

test("framework-map.json has valid schema, unique rule IDs, and matches upstream-lock commit", () => {
  const map = loadFrameworkMap();
  const lock = JSON.parse(readFileSync(join(ROOT, "upstream-lock.json"), "utf8"));
  assert.equal(map.schema, "youtube-shell.framework-map/v1");
  assert.equal(map.upstream_commit, lock.upstreams.youtube.reviewed.commit);
  assert.ok(Array.isArray(map.rules) && map.rules.length >= 15, "rules array must contain core rules");

  const ids = new Set<string>();
  for (const r of map.rules) {
    assert.ok(r.id && typeof r.id === "string", "rule must have a string id");
    assert.equal(ids.has(r.id), false, `duplicate rule id: ${r.id}`);
    ids.add(r.id);

    assert.ok(r.title && typeof r.title === "string", `${r.id}: missing title`);
    assert.ok(r.source && typeof r.source.file === "string" && typeof r.source.section === "string", `${r.id}: invalid source`);
    assert.equal(VALID_CLASSIFICATIONS.has(r.classification), true, `${r.id}: invalid classification ${r.classification}`);
    assert.equal(VALID_SKILLS.has(r.skill), true, `${r.id}: invalid skill ${r.skill}`);
    assert.ok(Array.isArray(r.phases) && r.phases.length > 0, `${r.id}: phases must be non-empty`);
    for (const p of r.phases) {
      assert.equal(VALID_PHASE_TARGETS.has(p), true, `${r.id}: invalid phase ${p}`);
    }
  }
});

test("every PhaseId (P01_PACKAGING..P07_CLOSE) and GLOBAL has mapped rules in framework-map.json", () => {
  const map = loadFrameworkMap();
  for (const phaseId of [...PHASE_IDS, "GLOBAL"]) {
    const matching = map.rules.filter((r) => r.phases.includes(phaseId));
    assert.ok(matching.length > 0, `no rules mapped for ${phaseId}`);
  }
});

test("every skill, consumer path, and test file referenced in framework-map.json exists on disk", () => {
  const map = loadFrameworkMap();
  for (const r of map.rules) {
    const skillPath = join(ROOT, "skills", r.skill, "SKILL.md");
    assert.equal(existsSync(skillPath), true, `${r.id}: missing skill file skills/${r.skill}/SKILL.md`);
    assert.equal(existsSync(join(ROOT, r.consumer)), true, `${r.id}: missing consumer path ${r.consumer}`);
    assert.ok(Array.isArray(r.tests) && r.tests.length > 0, `${r.id}: must reference at least one test file`);
    for (const testRel of r.tests) {
      assert.equal(existsSync(join(ROOT, testRel)), true, `${r.id}: missing test file ${testRel}`);
    }
  }
});

test("every deterministic check in src/core/phases.ts is represented in framework-map.json", () => {
  const map = loadFrameworkMap();
  const allChecks = new Set(PHASES.flatMap((p) => p.checks));
  for (const checkId of allChecks) {
    const found = map.rules.some(
      (r) => r.classification === "deterministic_gate" && r.enforcement.includes(checkId),
    );
    assert.equal(found, true, `deterministic check "${checkId}" from PHASES is missing in framework-map.json`);
  }
});
