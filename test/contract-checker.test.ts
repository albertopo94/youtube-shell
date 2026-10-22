import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkVideoContract } from "../src/checks/contract-checker.ts";

function makeValidFixture(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), "yts-contract-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const videoDir = join(root, "01-video");
  mkdirSync(videoDir, { recursive: true });

  writeFileSync(
    join(videoDir, "00-estado-produccion.md"),
    "**Estado actual:** `EN_CURSO`\n",
    "utf8",
  );
  writeFileSync(join(videoDir, "01-packaging.md"), "# 01 Packaging\n", "utf8");
  writeFileSync(
    join(videoDir, "02-guion.md"),
    [
      "# 02 Guion",
      "### [B01_Gancho] — Bloque uno",
      "- **Tiempo estimado:** `00:00 - 00:15`",
      "### [B02_Cuerpo] — Bloque dos",
      "- **Tiempo estimado:** `00:15 - 01:00`",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(videoDir, "03-storyboard-y-edicion.md"),
    [
      "# 03 Storyboard",
      "| **01** | `[B01_Gancho]` | `00:00 - 00:15` |",
      "| **02** | `[B02_Cuerpo]` | `00:15 - 01:00` |",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(join(videoDir, "04-registro-recursos.md"), "# 04 Recursos\n", "utf8");
  writeFileSync(join(videoDir, "05-metricas-retencion.md"), "# 05 Métricas\n", "utf8");
  writeFileSync(
    join(videoDir, "06-fuentes-y-verificacion.md"),
    [
      "# 06 Fuentes",
      "## 🔬 Parte 1: Investigación Previa",
      "1. https://doi.org/10.1000/xyz123",
      "## 📋 Parte 2: Verificación del Borrador del Guion",
      "| `[B01_Gancho]` | Afirmación real | https://doi.org/10.1000/xyz123 | 21/10/2026 | N/A | `VERIFICADO` | Matiz |",
      "## Checkpoints de Rigor",
      "- [x] Revisado",
    ].join("\n"),
    "utf8",
  );

  const catalogPath = join(root, "herramientas-y-apis.md");
  writeFileSync(
    catalogPath,
    [
      "| Herramienta / Servicio | Fase de Uso | Función en la Oficina | Estado en este Entorno | Acciones Específicamente Probadas | Limitaciones / Condiciones de Uso |",
      "| :--- | :---: | :--- | :---: | :--- | :--- |",
      "| **Alfa** | `01` | Herramienta A | 🟢 PROBADA EN ENTORNO | Operación real ejecutada y resultado inspeccionado. | Límite de prueba. |",
      "| **Beta** | `02` | Herramienta B | 🟡 DOCUMENTADA | Descripción de capacidad documentada. | No probada localmente. |",
    ].join("\n"),
    "utf8",
  );

  return { root, videoDir, catalogPath };
}

test("f0: valid video tree and catalog pass all contract checks", (t) => {
  const { videoDir, catalogPath } = makeValidFixture(t);
  const report = checkVideoContract(videoDir, { catalogPath });
  assert.equal(report.contract_version, 1);
  assert.equal(report.result, "PASS");
  assert.ok(report.checks.every((c) => c.result === "PASS" || c.result === "NOT_EVALUABLE"));
  const canonical = report.checks.find((c) => c.id === "canonical_files")!;
  assert.equal(canonical.result, "PASS");
  assert.equal(canonical.evidence?.length, 7);
});

test("missing canonical file fails canonical_files check", (t) => {
  const { videoDir } = makeValidFixture(t);
  unlinkSync(join(videoDir, "04-registro-recursos.md"));
  const report = checkVideoContract(videoDir);
  assert.equal(report.result, "FAIL");
  const check = report.checks.find((c) => c.id === "canonical_files")!;
  assert.equal(check.result, "FAIL");
  assert.match(check.details ?? "", /04-registro-recursos\.md/);
});

test("f1: unnormalized state ('HECHO') on Estado actual or Fase activa fails normalized_state", (t) => {
  const { videoDir } = makeValidFixture(t);
  for (const label of ["Estado actual", "Fase activa"]) {
    writeFileSync(join(videoDir, "00-estado-produccion.md"), `**${label}:** \`HECHO\`\n`, "utf8");
    const report = checkVideoContract(videoDir);
    assert.equal(report.result, "FAIL");
    const check = report.checks.find((c) => c.id === "normalized_state")!;
    assert.equal(check.result, "FAIL");
    assert.match(check.details ?? "", /HECHO/);
  }
});

test("missing Estado actual / Fase activa line is FAIL, never a silent OK", (t) => {
  const { videoDir } = makeValidFixture(t);
  writeFileSync(join(videoDir, "00-estado-produccion.md"), "# Sin línea de estado\n", "utf8");
  const report = checkVideoContract(videoDir);
  const check = report.checks.find((c) => c.id === "normalized_state")!;
  assert.equal(check.result, "FAIL");
});

test("f2: script block missing in storyboard fails script_storyboard_ids", (t) => {
  const { videoDir } = makeValidFixture(t);
  writeFileSync(
    join(videoDir, "03-storyboard-y-edicion.md"),
    "| **01** | `[B01_Gancho]` | `00:00 - 00:15` |\n",
    "utf8",
  );
  const report = checkVideoContract(videoDir);
  assert.equal(report.result, "FAIL");
  const check = report.checks.find((c) => c.id === "script_storyboard_ids")!;
  assert.equal(check.result, "FAIL");
  assert.match(check.details ?? "", /B02_Cuerpo/);
});

test("f3: inconsistent timecodes between script and storyboard fail script_storyboard_ids", (t) => {
  const { videoDir } = makeValidFixture(t);
  writeFileSync(
    join(videoDir, "03-storyboard-y-edicion.md"),
    [
      "| **01** | `[B01_Gancho]` | `00:00 - 00:15` |",
      "| **02** | `[B02_Cuerpo]` | `00:15 - 01:30` |",
    ].join("\n"),
    "utf8",
  );
  const report = checkVideoContract(videoDir);
  assert.equal(report.result, "FAIL");
  const check = report.checks.find((c) => c.id === "script_storyboard_ids")!;
  assert.equal(check.result, "FAIL");
  assert.match(check.details ?? "", /00:15 - 01:00.*00:15 - 01:30/);
});

test("f4: green catalog entry without a named tested operation (< 3 words) fails catalog_coherence", (t) => {
  const { videoDir, catalogPath } = makeValidFixture(t);
  writeFileSync(
    catalogPath,
    [
      "| Herramienta / Servicio | Fase de Uso | Función | Estado | Acciones | Límites |",
      "| **Alfa** | `01` | A | 🟢 PROBADA EN ENTORNO | — | — |",
    ].join("\n"),
    "utf8",
  );
  const report = checkVideoContract(videoDir, { catalogPath });
  assert.equal(report.result, "FAIL");
  const check = report.checks.find((c) => c.id === "catalog_coherence")!;
  assert.equal(check.result, "FAIL");
  assert.match(check.details ?? "", /Alfa/);
});

test("f5: green catalog entry without PROBADA or yellow without DOCUMENTADA fails catalog_coherence", (t) => {
  const { videoDir, catalogPath } = makeValidFixture(t);
  writeFileSync(
    catalogPath,
    [
      "| Herramienta / Servicio | Fase | Función | Estado | Acciones | Límites |",
      "| **Alfa** | `01` | A | 🟢 DISPONIBLE / MCP | Operación real ejecutada en entorno local. | — |",
    ].join("\n"),
    "utf8",
  );
  const report1 = checkVideoContract(videoDir, { catalogPath });
  assert.equal(report1.checks.find((c) => c.id === "catalog_coherence")?.result, "FAIL");

  writeFileSync(
    catalogPath,
    [
      "| Herramienta / Servicio | Fase | Función | Estado | Acciones | Límites |",
      "| **Beta** | `02` | B | 🟡 PENDIENTE | Descripción de capacidad documentada. | — |",
    ].join("\n"),
    "utf8",
  );
  const report2 = checkVideoContract(videoDir, { catalogPath });
  assert.equal(report2.checks.find((c) => c.id === "catalog_coherence")?.result, "FAIL");
});

test("unresolved PENDIENTE or template placeholder in 06-fuentes Parte 2 fails factcheck_resolved", (t) => {
  const { videoDir } = makeValidFixture(t);
  writeFileSync(
    join(videoDir, "06-fuentes-y-verificacion.md"),
    [
      "# 06 Fuentes",
      "## 📋 Parte 2: Verificación del Borrador del Guion",
      "| `[B01_Gancho]` | Texto | `[Insertar DOI o URL real]` | `DD/MM/AAAA` | N/A | `PENDIENTE` | Matiz |",
    ].join("\n"),
    "utf8",
  );
  const report = checkVideoContract(videoDir);
  const check = report.checks.find((c) => c.id === "factcheck_resolved")!;
  assert.equal(check.result, "FAIL");
  assert.match(check.details ?? "", /PENDIENTE|Insertar DOI/);
});

test("approval_authority reports NOT_EVALUABLE when no runtime registry exists yet", (t) => {
  const { videoDir } = makeValidFixture(t);
  const report = checkVideoContract(videoDir);
  const check = report.checks.find((c) => c.id === "approval_authority")!;
  assert.equal(check.result, "NOT_EVALUABLE");
  assert.match(check.details ?? "", /casilla Markdown no acredita/);
});
