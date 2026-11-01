#!/usr/bin/env node
// Print the MCP tool surface each installed media engine actually exposes, with the sha256 that
// `upstream-lock.json` records in `reviewed.mcp_surface_sha256`.
//
// Run this right after upgrading filmcraft-cli / effectcraft-cli / soundcraft-cli, then paste the
// printed values into the lock (`reviewed.version`, `.tag`, `.commit`, `.mcp_surface_sha256`).
// The governed surface, not the version number, is what the gate is checked against.
//
// Exit codes: 0 = every engine read, 1 = an engine disagrees with the lock, 2 = an engine missing.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const lock = JSON.parse(readFileSync(join(ROOT, "upstream-lock.json"), "utf8"));

const ENGINES = [
  { name: "filmcraft", bin: "filmcraft-cli" },
  { name: "effectcraft", bin: "effectcraft-cli" },
  { name: "soundcraft", bin: "soundcraft-cli" },
];

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

function liveTools(bin) {
  const res = spawnSync(bin, ["mcp"], { input: MCP_REQUEST, encoding: "utf8", timeout: 20000 });
  if (res.error) return null;
  for (const line of String(res.stdout ?? "").split("\n").filter(Boolean)) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (Array.isArray(msg?.result?.tools)) {
      return msg.result.tools.map((t) => t.name).sort();
    }
  }
  return null;
}

let missing = 0;
let drifted = 0;

for (const { name, bin } of ENGINES) {
  const version = /\b(\d+\.\d+\.\d+)\b/.exec(String(spawnSync(bin, ["--version"], { encoding: "utf8" }).stdout ?? ""))?.[1];
  const tools = liveTools(bin);
  if (!tools) {
    console.log(`${name}: ${bin} no responde por MCP (instalado: ${version ?? "no"})`);
    missing++;
    continue;
  }
  const surface = createHash("sha256").update(tools.join("\n")).digest("hex");
  const reviewed = lock.upstreams[name]?.reviewed ?? {};
  const same = reviewed.mcp_surface_sha256 === surface;
  if (!same) drifted++;
  console.log(`\n== ${name}: instalado ${version ?? "?"} | revisado en el lock ${reviewed.version ?? "?"}`);
  console.log(`   tools (${tools.length}): ${tools.join(" ")}`);
  console.log(`   mcp_surface_sha256: ${surface}${same ? "  (= lock)" : "  != lock -> actualizar tras revisar"}`);
}

console.log(
  missing
    ? "\nFaltan motores instalados para verificar toda la superficie gobernada."
    : drifted
      ? "\nLa superficie de al menos un motor no coincide con upstream-lock.json: revisar el diff y actualizar el lock."
      : "\nLa superficie MCP de los tres motores coincide con upstream-lock.json.",
);
process.exit(missing ? 2 : drifted ? 1 : 0);
