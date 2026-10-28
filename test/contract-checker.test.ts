import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkVideoContract } from "../src/checks/contract-checker.ts";

function makeValidFixture(
  t: { after: (fn: () => void) => void },
  location: string = "videos-en-estudio",
) {
  const root = mkdtempSync(join(tmpdir(), "yts-contract-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const videoDir = join(root, "mis-canales", "canal-x", location, "01-video");
  mkdirSync(videoDir, { recursive: true });

  writeFileSync(
    join(videoDir, "00-estado-produccion.md"),
    "**Estado actual:** `EN_CURSO`\n",
    "utf8",
  );
  writeFileSync(
    join(videoDir, "01-packaging.md"),
    [
      "# 01 Packaging",
      "## 2. Opciones de Títulos (Mínimo 5 Alternativas Creativas)",
      "1. Título 1",
      "2. Título 2",
      "3. Título 3",
      "4. Título 4",
      "5. Título 5",
      "## 3. Variantes de Miniatura (Thumbnails)",
      "### Miniatura A (Principal)",
      "- Hero A",
      "### Miniatura B (Variante de Contraste)",
      "- Hero B",
      "### Miniatura C (Variante Radical)",
      "- Hero C",
      "## 4. Checklist de Control de Calidad",
      "- [x] Clarity Test",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(videoDir, "02-guion.md"),
    [
      "# 02 Guion",
      "## 1. Puerta de Control Editorial y Monetización (Obligatorio)",
      "- [x] Aportación Original",
      "## 2. Guion Maestro Estructurado por Bloques Atómicos (IDs Estables)",
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
  writeFileSync(
    join(videoDir, "04-registro-recursos.md"),
    [
      "# 04 Recursos",
      "## 1. Material de Stock y Archivo Externo (Video y Fotos)",
      "| Archivo Local | Plataforma | URL | Autor | Licencia |",
      "| :--- | :--- | :--- | :--- | :--- |",
      "| `clips/intro.mp4` | Coverr | https://coverr.co/1 | Autor X | Comercial verificada |",
      "## 2. Activos Visuales Generados por IA",
      "| `thumb_v1.png` | Imagen 3 | — | Pro | $0.04 | Comercial |",
      "## 3. Locución y Voz Sintética / TTS",
      "| `audio/voz.wav` | AI Studio | Gemini TTS | Biblioteca | Comercial |",
      "## 4. Música y Efectos Sonoros (SFX)",
      "| `audio/track1.mp3` | YouTube Audio Library | Track A | Libre |",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(videoDir, "05-metricas-retencion.md"),
    [
      "# 05 Métricas",
      "## 1. Registro de Intervalos de Consulta (Datos Comparables)",
      "| **Primeras 24 Horas** | `22/10/2026` | 1000 | 8.5% |",
      "## 5. Retrospectiva Editorial: Evaluación de Satisfacción e Hipótesis",
      "- **Mejora Única Nombrada para el Siguiente Video:** Acortar B01.",
      "## 6. Diagnóstico de Cuellos de Botella del Embudo (*Bottleneck Analysis*)",
      "- [x] Sin cuello de botella en empaque.",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(videoDir, "06-fuentes-y-verificacion.md"),
    [
      "# 06 Fuentes",
      "- **Riesgo factual del contenido:** `[x] Afirmaciones factuales verificables`",
      "- **Grado de controversia o riesgo:** `[x] Medio (cifras/datos técnicos)`",
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

test("f2: PUBLICADO archived under videos-publicados passes normalized_state", (t) => {
  const { videoDir, catalogPath } = makeValidFixture(t, "videos-publicados");
  writeFileSync(join(videoDir, "00-estado-produccion.md"), "**Estado actual:** `PUBLICADO`\n", "utf8");
  const report = checkVideoContract(videoDir, { catalogPath });
  assert.equal(report.result, "PASS");
  const check = report.checks.find((c) => c.id === "normalized_state")!;
  assert.equal(check.result, "PASS");
});

test("f3: PUBLICADO inside videos-en-estudio fails normalized_state", (t) => {
  const { videoDir } = makeValidFixture(t, "videos-en-estudio");
  writeFileSync(join(videoDir, "00-estado-produccion.md"), "**Estado actual:** `PUBLICADO`\n", "utf8");
  const report = checkVideoContract(videoDir);
  assert.equal(report.result, "FAIL");
  const check = report.checks.find((c) => c.id === "normalized_state")!;
  assert.equal(check.result, "FAIL");
  assert.match(check.details ?? "", /videos-publicados/);
});

test("f4: missing or unformatted general state line is FAIL, never inferred from prose or tables", (t) => {
  const { videoDir } = makeValidFixture(t);
  writeFileSync(
    join(videoDir, "00-estado-produccion.md"),
    "| Estado actual | NO_INICIADO |\n",
    "utf8",
  );
  const report = checkVideoContract(videoDir);
  const check = report.checks.find((c) => c.id === "normalized_state")!;
  assert.equal(check.result, "FAIL");
});

test("f5: state with invalid suffix or extra text outside backticks fails normalized_state", (t) => {
  const { videoDir } = makeValidFixture(t);
  writeFileSync(
    join(videoDir, "00-estado-produccion.md"),
    "**Estado actual:** `EN_CURSO_INVALIDO`\n",
    "utf8",
  );
  const report1 = checkVideoContract(videoDir);
  assert.equal(report1.checks.find((c) => c.id === "normalized_state")?.result, "FAIL");

  writeFileSync(
    join(videoDir, "00-estado-produccion.md"),
    "**Estado actual:** `EN_CURSO` extra\n",
    "utf8",
  );
  const report2 = checkVideoContract(videoDir);
  assert.equal(report2.checks.find((c) => c.id === "normalized_state")?.result, "FAIL");
});

test("f6: script block missing in storyboard fails script_storyboard_ids", (t) => {
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

test("f7: inconsistent timecodes between script and storyboard fail script_storyboard_ids", (t) => {
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

test("f8: green catalog entry without a named tested operation (< 3 words) fails catalog_coherence", (t) => {
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

test("f9: green catalog entry without PROBADA or yellow without DOCUMENTADA fails catalog_coherence", (t) => {
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

test("packaging_structure fails when fewer than 5 titles or 3 thumbnail concepts are present in 01-packaging.md", (t) => {
  const { videoDir } = makeValidFixture(t);
  writeFileSync(
    join(videoDir, "01-packaging.md"),
    [
      "# 01 Packaging",
      "## 2. Opciones de Títulos",
      "1. Solo uno",
      "2. Solo dos",
      "## 3. Variantes de Miniatura",
      "### Miniatura A",
      "### Miniatura B",
      "## 4. Checklist de Control de Calidad",
      "- [x] Ok",
    ].join("\n"),
    "utf8",
  );
  const report = checkVideoContract(videoDir);
  const check = report.checks.find((c) => c.id === "packaging_structure")!;
  assert.ok(check, "packaging_structure check must exist");
  assert.equal(check.result, "FAIL");
  assert.match(check.details ?? "", /5|Miniatura C/);
});

test("research_sources_structure fails when risk header or Parte 1 sources are missing in 06-fuentes-y-verificacion.md", (t) => {
  const { videoDir } = makeValidFixture(t);
  writeFileSync(
    join(videoDir, "06-fuentes-y-verificacion.md"),
    [
      "# 06 Fuentes sin declaración de riesgo",
      "## 🔬 Parte 1: Investigación Previa",
      "Sin fuentes listadas.",
      "## 📋 Parte 2: Verificación del Borrador del Guion",
    ].join("\n"),
    "utf8",
  );
  const report = checkVideoContract(videoDir);
  const check = report.checks.find((c) => c.id === "research_sources_structure")!;
  assert.ok(check, "research_sources_structure check must exist");
  assert.equal(check.result, "FAIL");
});

test("script_block_ids fails when Puerta de Control Editorial is removed from 02-guion.md", (t) => {
  const { videoDir } = makeValidFixture(t);
  writeFileSync(
    join(videoDir, "02-guion.md"),
    [
      "# 02 Guion",
      "## 2. Guion Maestro",
      "### [B01_Gancho] — Bloque uno",
      "- **Tiempo estimado:** `00:00 - 00:15`",
    ].join("\n"),
    "utf8",
  );
  const report = checkVideoContract(videoDir);
  const check = report.checks.find((c) => c.id === "script_block_ids")!;
  assert.equal(check.result, "FAIL");
  assert.match(check.details ?? "", /Puerta de Control Editorial/);
});

test("resource_license_log fails when mandatory license sections are missing or a resource has a prohibited license (CC-BY-NC / SIN LICENCIA)", (t) => {
  const { videoDir } = makeValidFixture(t);
  writeFileSync(
    join(videoDir, "04-registro-recursos.md"),
    [
      "# 04 Recursos",
      "## 1. Material de Stock",
      "| `clip.mp4` | Web | URL | Autor | CC-BY-NC (No Comercial) |",
      "## 2. Activos Visuales Generados por IA",
      "| `img.png` | IA | — | Plan | $0 | Comercial |",
      "## 3. Locución y Voz Sintética / TTS",
      "| `voz.wav` | TTS | Voz | Biblioteca | Comercial |",
    ].join("\n"),
    "utf8",
  );
  const report = checkVideoContract(videoDir);
  const check = report.checks.find((c) => c.id === "resource_license_log")!;
  assert.ok(check, "resource_license_log check must exist");
  assert.equal(check.result, "FAIL");
  assert.match(check.details ?? "", /CC-BY-NC|licencia/i);
});

test("close_deliverables fails when 05-metricas-retencion.md or entregable-final.md lacks required closing sections", (t) => {
  const { videoDir } = makeValidFixture(t);
  writeFileSync(join(videoDir, "05-metricas-retencion.md"), "# 05 Métricas vacío\n", "utf8");
  const report1 = checkVideoContract(videoDir);
  const check1 = report1.checks.find((c) => c.id === "close_deliverables")!;
  assert.ok(check1, "close_deliverables check must exist");
  assert.equal(check1.result, "FAIL");

  // Restore valid 05-metricas-retencion.md but write incomplete entregable-final.md
  writeFileSync(
    join(videoDir, "05-metricas-retencion.md"),
    [
      "# 05 Métricas",
      "## 1. Registro de Intervalos de Consulta",
      "| **Primeras 24 Horas** | `22/10/2026` |",
      "## 5. Retrospectiva Editorial",
      "- Mejora única.",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(join(videoDir, "entregable-final.md"), "# Entregable incompleto sin secciones\n", "utf8");
  const report2 = checkVideoContract(videoDir);
  const check2 = report2.checks.find((c) => c.id === "close_deliverables")!;
  assert.equal(check2.result, "FAIL");
  assert.match(check2.details ?? "", /entregable-final\.md/);
});

test("f10: duplicate ID in registro-tecnicas.md fails techniques_registry_coherence", (t) => {
  const { root, videoDir } = makeValidFixture(t);
  const techPath = join(root, "registro-tecnicas.md");
  writeFileSync(
    techPath,
    [
      "| ID | Técnica | Fundamento | Validación Propia | Fuerza Operativa | Ámbito | Ubicación | Fuente | Acción |",
      "| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- | :--- |",
      "| **`GATE-001`** | Timecodes | CONTRATO INTERNO | VERIFICADA_DETERMINÍSTICAMENTE | **COMPUERTA** | Ámbito | `roles/01` | Fuente | Acción |",
      "| **`GATE-001`** | Duplicado | FUENTE | SIN_PROBAR | **RECOMENDADA** | Ámbito | `roles/01` | Fuente | Acción |",
    ].join("\n"),
    "utf8",
  );
  const report = checkVideoContract(videoDir, { techniquesPath: techPath });
  assert.equal(report.result, "FAIL");
  const check = report.checks.find((c) => c.id === "techniques_registry_coherence")!;
  assert.equal(check.result, "FAIL");
  assert.match(check.details ?? "", /duplicados.*GATE-001/);
});

test("f11: invalid operational strength in registro-tecnicas.md fails techniques_registry_coherence", (t) => {
  const { root, videoDir } = makeValidFixture(t);
  const techPath = join(root, "registro-tecnicas.md");
  writeFileSync(
    techPath,
    [
      "| ID | Técnica | Fundamento | Validación Propia | Fuerza Operativa | Ámbito | Ubicación | Fuente | Acción |",
      "| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- | :--- |",
      "| **`GATE-001`** | Timecodes | CONTRATO INTERNO | VERIFICADA_DETERMINÍSTICAMENTE | **FUERZA_INVALIDA** | Ámbito | `roles/01` | Fuente | Acción |",
    ].join("\n"),
    "utf8",
  );
  const report = checkVideoContract(videoDir, { techniquesPath: techPath });
  assert.equal(report.result, "FAIL");
  const check = report.checks.find((c) => c.id === "techniques_registry_coherence")!;
  assert.equal(check.result, "FAIL");
  assert.match(check.details ?? "", /fuerza operativa inválida/);
});

test("unresolved Declaración de Contenido Sintético in 02-guion.md fails script_block_ids", (t) => {
  const { videoDir } = makeValidFixture(t);
  const guionText = [
    "# 02 Guion",
    "## 1. Puerta de Control Editorial y Monetización (Obligatorio)",
    "- [x] Aportación Original",
    "- [ ] **Declaración de Contenido Sintético / IA (YouTube Policy):**",
    "  - [ ] **No requiere declaración:** Animación o estilo ficticio.",
    "  - [ ] **Revisar y declarar en Studio cuando corresponda:** Muestra personas reales.",
    "## 2. Guion Maestro Estructurado por Bloques Atómicos (IDs Estables)",
    "### [B01_Gancho] — Bloque uno",
    "- **Tiempo estimado:** `00:00 - 00:15`",
    "### [B02_Cuerpo] — Bloque dos",
    "- **Tiempo estimado:** `00:15 - 01:00`",
  ].join("\n");

  writeFileSync(join(videoDir, "02-guion.md"), guionText, "utf8");
  const report = checkVideoContract(videoDir);
  assert.equal(report.result, "FAIL");
  const check = report.checks.find((c) => c.id === "script_block_ids")!;
  assert.equal(check.result, "FAIL");
  assert.match(check.details ?? "", /Declaración de Contenido Sintético/i);

  // When resolved by checking one box, it passes
  const resolvedGuionText = guionText.replace("[ ] **No requiere declaración:**", "[x] **No requiere declaración:**");
  writeFileSync(join(videoDir, "02-guion.md"), resolvedGuionText, "utf8");
  const reportResolved = checkVideoContract(videoDir);
  const checkResolved = reportResolved.checks.find((c) => c.id === "script_block_ids")!;
  assert.equal(checkResolved.result, "PASS");
});
