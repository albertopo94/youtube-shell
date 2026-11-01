import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const lock = JSON.parse(readFileSync(join(ROOT, "upstream-lock.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

const sha256 = (path: string) => createHash("sha256").update(readFileSync(join(ROOT, path))).digest("hex");

test("the lock pins all upstreams (youtube, pi, filmcraft, effectcraft, soundcraft) to an exact reviewed commit", () => {
  assert.equal(lock.schema, "youtube-shell.upstream-lock/v1");
  const expectedUpstreams = ["youtube", "pi", "filmcraft", "effectcraft", "soundcraft"] as const;
  for (const name of expectedUpstreams) {
    const u = lock.upstreams[name];
    assert.ok(u, `missing upstream ${name}`);
    assert.match(u.reviewed.commit, /^[0-9a-f]{40}$/, `${name}: reviewed.commit must be a full SHA`);
    assert.ok(Array.isArray(u.affects_us) && u.affects_us.length > 0, `${name}: affects_us must list paths`);
    if (name !== "youtube") {
      assert.match(u.reviewed.version, /^\d+\.\d+\.\d+$/, `${name}: reviewed.version must be semver`);
    }
  }
});

test("media engine binaries (filmcraft-cli, effectcraft-cli, soundcraft-cli) match reviewed version when installed locally", () => {
  const engines = [
    { name: "filmcraft", bin: "filmcraft-cli" },
    { name: "effectcraft", bin: "effectcraft-cli" },
    { name: "soundcraft", bin: "soundcraft-cli" },
  ] as const;

  for (const { name, bin } of engines) {
    const expectedVersion = lock.upstreams[name]?.reviewed?.version;
    assert.ok(expectedVersion, `missing reviewed version for ${name}`);

    const res = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (res.error) {
      // If binary is not installed in the current environment (e.g. CI without macOS/Rust tools), skip check gracefully
      continue;
    }
    const output = (res.stdout || "") + (res.stderr || "");
    const versionPattern = new RegExp(`\\b${expectedVersion.replace(/\./g, "\\.")}\\b`);
    assert.match(
      output,
      versionPattern,
      `binary ${bin} output ("${output.trim()}") does not match reviewed version ${expectedVersion}`,
    );
  }
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

test("the declared consumer version stays coherent across lock, package.json and the upstream compatibility document", () => {
  // Auditoría 12 P1: the compatibility document used to claim the consumer was on an older
  // version than package.json, so "aligned" was asserted from a stale document. The declared
  // version now lives in the lock and is cross-checked here instead of being prose-only.
  const contract = lock.upstreams.youtube.normative_sources.find(
    (s: { upstream_path: string }) => s.upstream_path === "_framework/compatibilidad-consumidores.md",
  );
  assert.ok(contract, "compatibilidad-consumidores.md must be tracked in normative_sources");
  const declared = /youtube-shell v(\d+\.\d+\.\d+)/.exec(String(contract.role));
  assert.ok(declared, "the consumer_contract role must declare 'consumer version declared: youtube-shell vX.Y.Z'");
  assert.equal(declared![1], pkg.version, "the version declared upstream must match package.json");

  // When the office clone is available locally (creator machines), the compatibility document
  // itself must declare the same consumer version and must not leave a pending consumer action.
  const officeCandidates = [
    process.env["YOUTUBE_OFFICE_ROOT"],
    join(ROOT, "..", "youtube"),
  ].filter(Boolean) as string[];
  const compatPath = officeCandidates
    .map((root) => join(root, "_framework", "compatibilidad-consumidores.md"))
    .find((candidate) => existsSync(candidate));
  if (!compatPath) return;

  const compat = readFileSync(compatPath, "utf8");
  assert.match(
    compat,
    new RegExp(`youtube-shell v${pkg.version.replace(/\./g, "\\.")}`),
    `${compatPath} must declare the consumer at v${pkg.version}`,
  );
  const pending = /### Acción pendiente en el consumidor\r?\n\r?\n([^\n]+)/.exec(compat);
  assert.ok(pending, "compatibilidad-consumidores.md must keep the pending-action section");
  assert.match(pending![1], /^Ninguna pendiente/, `the upstream doc still reports a pending consumer action: ${pending![1]}`);
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
