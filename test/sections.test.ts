import test from "node:test";
import assert from "node:assert/strict";
import { extractSection, PREAMBLE } from "../src/core/sections.ts";

const doc = [
  "# 06 - Fuentes",
  "",
  "- **Régimen:** 2",
  "",
  "## 🔬 Parte 1: Investigación Previa",
  "Fuente A",
  "### Detalle",
  "sub",
  "",
  "## 📋 Parte 2: Verificación",
  "| B01 | x |",
  "",
  "```md",
  "## Parte 3 dentro de un bloque de código",
  "```",
  "## Checkpoints de Rigor",
  "- [ ] uno",
].join("\n");

test("extracts a level-2 section up to the next heading of the same or higher level", () => {
  const r = extractSection(doc, "Parte 1");
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.text, "## 🔬 Parte 1: Investigación Previa\nFuente A\n### Detalle\nsub\n");
});

test("ignores headings inside fenced code blocks", () => {
  const r = extractSection(doc, "Parte 2");
  assert.equal(r.ok, true);
  assert.ok(r.ok && r.text.includes("## Parte 3 dentro de un bloque de código"));
  assert.ok(r.ok && !r.text.includes("Checkpoints"));
  assert.equal(extractSection(doc, "Parte 3").ok, false);
});

test("the last section runs to the end of the file", () => {
  const r = extractSection(doc, "Checkpoints de Rigor");
  assert.equal(r.ok && r.text, "## Checkpoints de Rigor\n- [ ] uno");
});

test("preamble is everything before the first level-2 heading", () => {
  const r = extractSection(doc, PREAMBLE);
  assert.equal(r.ok && r.text, "# 06 - Fuentes\n\n- **Régimen:** 2\n\n");
});

test("a missing or ambiguous selector is an error, never an empty match", () => {
  const missing = extractSection(doc, "Parte 9");
  assert.equal(missing.ok, false);
  assert.match(!missing.ok ? missing.reason : "", /no existe/);
  const ambiguous = extractSection(doc, "Parte");
  assert.equal(ambiguous.ok, false);
  assert.match(!ambiguous.ok ? ambiguous.reason : "", /ambigua/);
});

test("CRLF line endings are handled", () => {
  const r = extractSection("# T\r\n## A\r\nx\r\n## B\r\ny\r\n", "A");
  assert.equal(r.ok && r.text, "## A\r\nx\r\n");
});
