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

interface ReferencePolicy {
  level: "mandatory" | "conditional";
  when: string;
  references: string[];
  required_evidence: string;
}

interface VerificationScope {
  deterministic_in_runtime: string;
  editorial_or_human_review: string;
}

interface SourceInventoryEntry {
  upstream_path: string;
  disposition:
    | "enforced_in_runtime"
    | "consumed_in_skill"
    | "bundled_reference"
    | "mirrored_template"
    | "deliberately_external_office_or_channel_data"
    | "deliberately_external_raw_transcripts_and_audits"
    | "test_fixture_only";
  consumed_what: string;
  excluded_what: string;
}

interface ConsolidatedSourceEntry {
  upstream_path: string;
  upstream_sha256: string;
  target_rule_ids: string[];
  target_skills: string[];
  disposition_summary: string;
}

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
  required_skill_terms: string[];
  reference_policy: ReferencePolicy;
  verification_scope: VerificationScope;
}

interface FrameworkMap {
  schema: string;
  upstream_commit: string;
  source_inventory: SourceInventoryEntry[];
  consolidated_or_legacy_sources: ConsolidatedSourceEntry[];
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

test("source_inventory and consolidated_or_legacy_sources cover all upstream sources including reglas-sistema, ciclo-produccion, estrategia-idiomas, and case studies", () => {
  const map = loadFrameworkMap();
  const lock = JSON.parse(readFileSync(join(ROOT, "upstream-lock.json"), "utf8"));

  assert.ok(Array.isArray(map.source_inventory) && map.source_inventory.length >= 12);
  const inventoriedPaths = new Set(map.source_inventory.map((e) => e.upstream_path));

  for (const src of lock.upstreams.youtube.normative_sources) {
    assert.equal(
      inventoriedPaths.has(src.upstream_path),
      true,
      `normative source ${src.upstream_path} must be documented in framework-map.json source_inventory`,
    );
  }

  for (const aff of lock.upstreams.youtube.affects_us) {
    if (!aff.endsWith("/")) {
      assert.equal(
        inventoriedPaths.has(aff),
        true,
        `affects_us path ${aff} must be documented in framework-map.json source_inventory`,
      );
    }
  }

  for (const entry of map.source_inventory) {
    assert.ok(entry.consumed_what && entry.consumed_what.length >= 10, `${entry.upstream_path}: missing consumed_what`);
    assert.ok(entry.excluded_what && entry.excluded_what.length >= 10, `${entry.upstream_path}: missing excluded_what`);
  }

  assert.ok(
    map.source_inventory.some((e) => e.disposition === "deliberately_external_office_or_channel_data"),
    "source_inventory must explicitly declare deliberately external office/channel data",
  );

  assert.ok(
    map.source_inventory.some((e) => e.disposition === "deliberately_external_raw_transcripts_and_audits"),
    "source_inventory must explicitly declare deliberately external raw transcripts and historical audits",
  );

  assert.ok(Array.isArray(map.consolidated_or_legacy_sources) && map.consolidated_or_legacy_sources.length >= 4);
  const consolidatedPaths = new Set(map.consolidated_or_legacy_sources.map((c) => c.upstream_path));
  for (const requiredDoc of [
    "_framework/reglas-sistema.md",
    "_framework/ciclo-produccion.md",
    "_framework/estrategia-idiomas.md",
    "_framework/referencias/sintesis-casos-shorts.md",
  ]) {
    assert.equal(
      consolidatedPaths.has(requiredDoc),
      true,
      `consolidated_or_legacy_sources must document ${requiredDoc}`,
    );
    assert.equal(
      map.rules.some((r) => r.source.file === requiredDoc),
      true,
      `rules must include at least one traced rule from ${requiredDoc}`,
    );
  }
});

test("every rule in framework-map.json verifies semantic fidelity in its target skill, reference policy, and runtime vs editorial verification scope", () => {
  const map = loadFrameworkMap();
  for (const r of map.rules) {
    assert.ok(
      Array.isArray(r.required_skill_terms) && r.required_skill_terms.length >= 3,
      `${r.id}: must declare at least 3 required_skill_terms for semantic verification`,
    );
    const skillText = readFileSync(join(ROOT, "skills", r.skill, "SKILL.md"), "utf8").toLowerCase();
    for (const term of r.required_skill_terms) {
      assert.equal(
        skillText.includes(term.toLowerCase()),
        true,
        `${r.id}: skill ${r.skill}/SKILL.md is missing required semantic term "${term}"`,
      );
    }

    assert.ok(r.reference_policy, `${r.id}: missing reference_policy`);
    assert.ok(
      r.reference_policy.level === "mandatory" || r.reference_policy.level === "conditional",
      `${r.id}: invalid reference_policy.level`,
    );
    assert.ok(r.reference_policy.when.length >= 10, `${r.id}: reference_policy.when must be descriptive`);
    assert.ok(
      Array.isArray(r.reference_policy.references) && r.reference_policy.references.length > 0,
      `${r.id}: reference_policy.references must be non-empty`,
    );
    assert.ok(
      r.reference_policy.required_evidence.length >= 10,
      `${r.id}: reference_policy.required_evidence must specify deliverable evidence`,
    );

    assert.ok(r.verification_scope, `${r.id}: missing verification_scope`);
    assert.ok(
      r.verification_scope.deterministic_in_runtime.length >= 10,
      `${r.id}: missing verification_scope.deterministic_in_runtime`,
    );
    assert.ok(
      r.verification_scope.editorial_or_human_review.length >= 10,
      `${r.id}: missing verification_scope.editorial_or_human_review`,
    );
  }
});

