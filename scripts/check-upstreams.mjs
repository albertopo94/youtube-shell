#!/usr/bin/env node
// Online report: has anything changed upstream, since the reviewed commit, in a
// path that affects youtube-shell? Reads upstream-lock.json (the only place the
// reviewed versions live) and queries the public GitHub API without credentials.
//
// Exit codes: 0 = nothing that affects us, 1 = review needed, 2 = could not check,
// 3 = the reviewed commit is not published on the remote yet (local-only pinned state).

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const lock = JSON.parse(readFileSync(join(ROOT, "upstream-lock.json"), "utf8"));

// Optional `--only a,b` to gate one subset of upstreams (CI uses it to hard-fail on the
// domain knowledge source while treating the fast-moving engines as advisory).
const onlyArgIndex = process.argv.indexOf("--only");
const only =
  onlyArgIndex >= 0 && process.argv[onlyArgIndex + 1]
    ? process.argv[onlyArgIndex + 1].split(",").map((s) => s.trim()).filter(Boolean)
    : null;
if (only) {
  const unknown = only.filter((name) => !lock.upstreams[name]);
  if (unknown.length) {
    console.error(`--only: upstream desconocido: ${unknown.join(", ")}`);
    process.exit(2);
  }
}

let authToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!authToken) {
  try {
    const { execFileSync } = await import("node:child_process");
    authToken = execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch {}
}

async function gh(path) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "youtube-shell-upstreams-check",
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status} on ${path}`);
  return res.json();
}

/**
 * The reviewed commit exists only in the local office clone until it is pushed, and then the
 * public API cannot resolve it. That is a distinct, actionable state: the pinned state is real
 * but CI cannot confirm it, so it must be reported as such instead of a generic API failure.
 */
class UnpublishedCommit extends Error {}

const slug = (repoUrl) => new URL(repoUrl).pathname.replace(/^\/|\/$/g, "");

/** Commits on `ref` that touched `path` after the reviewed commit. */
async function commitsTouching(repo, ref, path, since, reviewedSha) {
  const list = await gh(`/repos/${repo}/commits?sha=${ref}&path=${encodeURIComponent(path)}&since=${since}&per_page=100`);
  return list.filter((c) => c.sha !== reviewedSha);
}

async function checkUpstream(name, u) {
  const repo = slug(u.repo);
  let reviewed;
  try {
    reviewed = await gh(`/repos/${repo}/commits/${u.reviewed.commit}`);
  } catch (err) {
    if (/GitHub API 4[02][24] on \/repos\/.+\/commits\//.test(err.message)) {
      throw new UnpublishedCommit(
        `${name}: el commit revisado ${u.reviewed.commit.slice(0, 7)} todavía no existe en ${repo}.\n` +
          `   El lock fija un estado revisado solo en el clon local; publica esa rama para que la deriva sea verificable.`,
      );
    }
    throw err;
  }
  const since = reviewed.commit.committer.date;
  const head = await gh(`/repos/${repo}/commits/HEAD`);
  console.log(`\n== ${name} (${repo})`);
  console.log(`   revisado: ${u.reviewed.version ?? u.reviewed.ref} @ ${u.reviewed.commit.slice(0, 7)} (${since})`);
  console.log(`   HEAD:     ${head.sha.slice(0, 7)} (${head.commit.committer.date})`);

  if (u.reviewed.tag || u.reviewed.version) {
    const [latest] = await gh(`/repos/${repo}/tags?per_page=1`);
    const expectedTag = u.reviewed.tag ?? `v${u.reviewed.version}`;
    const isNew = latest && latest.name !== expectedTag;
    console.log(`   última release: ${latest?.name ?? "?"}${isNew ? `  <- más nueva que la revisada (${expectedTag})` : ""}`);
  }

  const hits = [];
  for (const path of u.affects_us) {
    for (const c of await commitsTouching(repo, "HEAD", path, since, u.reviewed.commit)) {
      hits.push({ path, sha: c.sha.slice(0, 7), date: c.commit.committer.date, msg: c.commit.message.split("\n")[0] });
    }
  }
  if (hits.length === 0) {
    console.log("   sin cambios en rutas que nos afectan");
  } else {
    console.log(`   ${hits.length} commit(s) tocan rutas que nos afectan:`);
    for (const h of hits) console.log(`   - ${h.sha} ${h.date} [${h.path}] ${h.msg}`);
  }
  return hits.length;
}

try {
  let total = 0;
  for (const [name, u] of Object.entries(lock.upstreams)) {
    if (only && !only.includes(name)) continue;
    total += await checkUpstream(name, u);
  }
  const scope = only ? ` (${only.join(", ")})` : "";
  console.log(total === 0 ? `\nResultado${scope}: nada upstream afecta a youtube-shell.` : `\nResultado${scope}: hay cambios upstream que revisar (ver docs/upstreams.md).`);
  process.exit(total === 0 ? 0 : 1);
} catch (err) {
  if (err instanceof UnpublishedCommit) {
    console.error(`\nCommit revisado no publicado: ${err.message}`);
    process.exit(3);
  }
  console.error(`\nNo se pudo comprobar upstream: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}
