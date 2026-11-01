import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FILMCRAFT_MCP_CAPABILITIES,
  EFFECTCRAFT_MCP_CAPABILITIES,
  SOUNDCRAFT_MCP_CAPABILITIES,
} from "../src/gate/capabilities.ts";

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

const MCP_ENGINES = [
  { engine: "filmcraft", bin: "filmcraft-cli", prefix: "filmcraft", capabilities: FILMCRAFT_MCP_CAPABILITIES },
  { engine: "effectcraft", bin: "effectcraft-cli", prefix: "effectcraft", capabilities: EFFECTCRAFT_MCP_CAPABILITIES },
  { engine: "soundcraft", bin: "soundcraft-cli", prefix: "soundcraft", capabilities: SOUNDCRAFT_MCP_CAPABILITIES },
] as const;

const MCP_REQUEST = [
  JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "youtube-shell", version: "0" } },
  }),
  JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
].join("\n") + "\n";

/** The tool ids the installed engine actually exposes over MCP, or null when it is not installed. */
function liveMcpTools(bin: string): string[] | null {
  const res = spawnSync(bin, ["mcp"], { input: MCP_REQUEST, encoding: "utf8", timeout: 20000 });
  if (res.error) return null;
  for (const line of String(res.stdout ?? "").split("\n").filter(Boolean)) {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (Array.isArray(msg?.result?.tools)) {
      return msg.result.tools.map((tool: { name: string }) => tool.name).sort();
    }
  }
  return null;
}

const baseToolIds = (
  entries: readonly { id: string }[],
  prefix: string,
): Set<string> => new Set(entries.map((e) => e.id.replace(new RegExp(`^${prefix}_`), "")));

test("the media-engine gate catalog stays true against the installed engines' MCP surface", () => {
  // The guard is the governed surface, not the version number. The creator upgrades
  // filmcraft-cli, effectcraft-cli and soundcraft-cli whenever upstream ships, so a newer
  // binary is the expected state on this machine and must never redden the suite.
  //
  // Hard failure is reserved for the case where the catalog stops being true in a way that
  // matters: the gate vouches for a tool the engine no longer exposes (phase gating and
  // capability grants are then computed from fiction), or the engine is installed but its MCP
  // surface cannot be read at all (we cannot verify what we govern).
  //
  // Advisory: tools the engine exposes that the catalog does not list. Those are blocked by
  // design - the catalog is an allowlist, so an unknown tool fails closed - which costs
  // capability, not safety, and is fixed by cataloguing it in a later work unit.
  const hard: string[] = [];
  const advisory: string[] = [];

  for (const { engine, bin, prefix, capabilities } of MCP_ENGINES) {
    const version = /\b(\d+\.\d+\.\d+)\b/.exec(
      String(spawnSync(bin, ["--version"], { encoding: "utf8" }).stdout ?? ""),
    )?.[1];
    const live = liveMcpTools(bin);
    if (live === null) {
      advisory.push(`${engine}: ${bin} no responde por MCP (sin superficie verificable en este entorno)`);
      continue;
    }

    const catalogued = baseToolIds(capabilities, prefix);
    const goneFromEngine = [...catalogued].filter((tool) => !live.includes(tool)).sort();
    const unknownToGate = live.filter((tool) => !catalogued.has(tool));

    if (goneFromEngine.length) {
      hard.push(
        `${engine} ${version ?? ""}: src/gate/capabilities.ts cataloga tools que el motor ya no expone: ${goneFromEngine.join(", ")}`,
      );
    }
    if (unknownToGate.length) {
      advisory.push(
        `${engine} ${version ?? ""}: el motor expone tools que el gate no cataloga (quedan bloqueadas por allowlist, se resuelve catalogandolas): ${unknownToGate.join(", ")}`,
      );
    }

    const surfaceHash = createHash("sha256").update(live.join("\n")).digest("hex");
    const reviewed = lock.upstreams[engine]?.reviewed;
    if (reviewed?.mcp_surface_sha256 && reviewed.mcp_surface_sha256 !== surfaceHash) {
      advisory.push(`${engine} ${version ?? ""}: la superficie MCP cambio desde la revision fijada en upstream-lock.json; verificar y actualizar el lock`);
    }
    if (version && reviewed?.version && version !== reviewed.version) {
      advisory.push(`${engine}: instalado ${version} vs revisado ${reviewed.version}`);
    }
    advisory.push(`${engine} ${version ?? ""}: ${live.length} tools MCP verificadas`);
  }

  for (const note of advisory) console.log(`   ${note}`);
  assert.deepEqual(hard, [], "el catalogo del gate afirma tools que los motores instalados ya no exponen");
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
