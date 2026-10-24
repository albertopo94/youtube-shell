import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const lock = JSON.parse(readFileSync(join(ROOT, "upstream-lock.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

const sha256 = (path: string) => createHash("sha256").update(readFileSync(join(ROOT, path))).digest("hex");

test("the lock pins both upstreams to an exact reviewed commit", () => {
  assert.equal(lock.schema, "youtube-shell.upstream-lock/v1");
  for (const name of ["youtube", "pi"]) {
    const u = lock.upstreams[name];
    assert.ok(u, `missing upstream ${name}`);
    assert.match(u.reviewed.commit, /^[0-9a-f]{40}$/, `${name}: reviewed.commit must be a full SHA`);
    assert.ok(Array.isArray(u.affects_us) && u.affects_us.length > 0, `${name}: affects_us must list paths`);
  }
  assert.match(lock.upstreams.pi.reviewed.version, /^\d+\.\d+\.\d+$/);
});

test("every mirrored file still matches the reviewed upstream bytes", () => {
  for (const [local, entry] of Object.entries<{ source: string; sha256: string }>(lock.upstreams.youtube.mirrored)) {
    assert.equal(sha256(local), entry.sha256, `${local} drifted from ${entry.source}; re-sync it or update the lock`);
  }
});

test("normative_sources tracks all non-template framework sources with SHA-256 and existing local targets", () => {
  const sources = lock.upstreams.youtube.normative_sources;
  assert.ok(Array.isArray(sources) && sources.length >= 7, "normative_sources must list AGENTS.md, 4 roles, policies, and tools");
  const expectedUpstreamPaths = [
    "AGENTS.md",
    "_framework/roles/01-investigacion-ideas.md",
    "_framework/roles/02-packaging-miniaturas.md",
    "_framework/roles/03-guion-y-narrativa.md",
    "_framework/roles/04-direccion-y-edicion.md",
    "_framework/contingencia-y-politicas-sensibles.md",
    "_framework/herramientas-y-apis.md",
  ];
  const seenUpstream = new Set<string>();
  for (const entry of sources) {
    assert.equal(typeof entry.upstream_path, "string");
    assert.match(entry.upstream_sha256, /^[0-9a-f]{64}$/, `invalid sha256 for ${entry.upstream_path}`);
    assert.equal(typeof entry.local_target, "string");
    assert.equal(typeof entry.role, "string");
    assert.equal(existsSync(join(ROOT, entry.local_target)), true, `missing local_target: ${entry.local_target}`);
    if (entry.local_target.includes("/references/")) {
      assert.equal(
        sha256(entry.local_target),
        entry.upstream_sha256,
        `mirrored reference ${entry.local_target} drifted from ${entry.upstream_path}`,
      );
    }
    seenUpstream.add(entry.upstream_path);
  }
  for (const req of expectedUpstreamPaths) {
    assert.equal(seenUpstream.has(req), true, `missing normative source ${req} in upstream-lock.json`);
  }
});

test("no file under templates/ escapes the lock", () => {
  const mirrored = new Set(Object.keys(lock.upstreams.youtube.mirrored));
  for (const name of readdirSync(join(ROOT, "templates", "pipeline-video"))) {
    const local = `templates/pipeline-video/${name}`;
    assert.ok(mirrored.has(local), `${local} is not recorded in upstream-lock.json`);
  }
});

test("the pi peer range is derived from the reviewed version, never a second literal", () => {
  const range = pkg.peerDependencies?.[lock.upstreams.pi.package];
  assert.equal(range, `>=${lock.upstreams.pi.reviewed.version}`);
  assert.equal(pkg.peerDependenciesMeta?.[lock.upstreams.pi.package]?.optional, true, "pi must stay an optional peer so `pi install` never pulls a second runtime");
});

test("every pi API the extension touches is listed as reviewed", () => {
  const src = readFileSync(join(ROOT, "src", "gate", "pi-extension.ts"), "utf8");
  const used = new Set<string>();
  for (const m of src.matchAll(/\bpi\.on\(\s*"([a-z_]+)"/g)) used.add(`pi.on:${m[1]}`);
  for (const m of src.matchAll(/\bpi\.([A-Za-z]+)(?:\?\.)?\(/g)) if (m[1] !== "on") used.add(`pi.${m[1]}`);
  for (const m of src.matchAll(/\bctx\.(ui\.[A-Za-z]+|[A-Za-z]+)/g)) used.add(`ctx.${m[1]}`);
  const reviewed = new Set<string>(lock.upstreams.pi.api_used);
  const unreviewed = [...used].filter((api) => !reviewed.has(api));
  assert.deepEqual(unreviewed, [], `new pi API in use; review it against pi ${lock.upstreams.pi.reviewed.version} and add it to api_used`);
});
