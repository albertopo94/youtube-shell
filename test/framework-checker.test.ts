import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkFrameworkIntegrity } from "../src/checks/framework-checker.ts";

test("checkFrameworkIntegrity passes on the packaged canonical techniques registry", () => {
  const report = checkFrameworkIntegrity();
  assert.equal(report.result, "PASS");
  assert.ok(report.techniquesCount >= 21);
  const check = report.checks.find((c) => c.id === "techniques_registry_coherence")!;
  assert.equal(check.result, "PASS");
  assert.match(check.evidence?.[0] ?? "", /21 técnicas válidas/);
});

test("checkFrameworkIntegrity fails if registry file does not exist", () => {
  const report = checkFrameworkIntegrity({ techniquesPath: "/nonexistent/registro-tecnicas.md" });
  assert.equal(report.result, "FAIL");
  const check = report.checks.find((c) => c.id === "techniques_registry_presence")!;
  assert.equal(check.result, "FAIL");
  assert.match(check.details ?? "", /no encontrado/);
});

test("checkFrameworkIntegrity fails on duplicate technique IDs", (t) => {
  const root = mkdtempSync(join(tmpdir(), "yts-tech-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const techPath = join(root, "registro-tecnicas.md");

  writeFileSync(
    techPath,
    [
      "| ID | Técnica | Fundamento | Validación Propia | Fuerza Operativa | Ámbito | Ubicación | Fuente | Próxima Acción de Validación |",
      "| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- | :--- |",
      "| **`GATE-001`** | Timecodes | CONTRATO INTERNO | VERIFICADA_DETERMINÍSTICAMENTE | **COMPUERTA** | Videos | script | fuente | Verificador = check-contrato; Evidencia = exit code 0; Excepción = ninguna |",
      "| **`GATE-001`** | Duplicado | FUENTE | SIN_PROBAR | **RECOMENDADA** | Videos | script | fuente | Acción |",
    ].join("\n"),
    "utf8",
  );

  const report = checkFrameworkIntegrity({ techniquesPath: techPath });
  assert.equal(report.result, "FAIL");
  const check = report.checks.find((c) => c.id === "techniques_registry_coherence")!;
  assert.equal(check.result, "FAIL");
  assert.match(check.details ?? "", /duplicados.*GATE-001/i);
});

test("checkFrameworkIntegrity fails on invalid operational strength or enums", (t) => {
  const root = mkdtempSync(join(tmpdir(), "yts-tech-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const techPath = join(root, "registro-tecnicas.md");

  writeFileSync(
    techPath,
    [
      "| ID | Técnica | Fundamento | Validación Propia | Fuerza Operativa | Ámbito | Ubicación | Fuente | Próxima Acción de Validación |",
      "| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- | :--- |",
      "| **`GATE-001`** | Timecodes | CONTRATO_INVALIDO | VERIFICADA_DETERMINÍSTICAMENTE | **FUERZA_INVALIDA** | Videos | script | fuente | Verificador = check-contrato; Evidencia = exit 0; Excepción = ninguna |",
    ].join("\n"),
    "utf8",
  );

  const report = checkFrameworkIntegrity({ techniquesPath: techPath });
  assert.equal(report.result, "FAIL");
  const check = report.checks.find((c) => c.id === "techniques_registry_coherence")!;
  assert.equal(check.result, "FAIL");
  assert.match(check.details ?? "", /fundamento inválido|fuerza operativa inválida/);
});

test("checkFrameworkIntegrity fails if a COMPUERTA row omits Verificador, Evidencia or Excepción", (t) => {
  const root = mkdtempSync(join(tmpdir(), "yts-tech-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const techPath = join(root, "registro-tecnicas.md");

  // Missing 'Excepción ='
  writeFileSync(
    techPath,
    [
      "| ID | Técnica | Fundamento | Validación Propia | Fuerza Operativa | Ámbito | Ubicación | Fuente | Próxima Acción de Validación |",
      "| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- | :--- |",
      "| **`GATE-001`** | Timecodes | CONTRATO INTERNO | VERIFICADA_DETERMINÍSTICAMENTE | **COMPUERTA** | Videos | script | fuente | Verificador = check; Evidencia = log |",
    ].join("\n"),
    "utf8",
  );

  const report = checkFrameworkIntegrity({ techniquesPath: techPath });
  assert.equal(report.result, "FAIL");
  const check = report.checks.find((c) => c.id === "techniques_registry_coherence")!;
  assert.equal(check.result, "FAIL");
  assert.match(check.details ?? "", /COMPUERTA.*no declara Verificador, Evidencia y Excepción/i);
});

test("checkFrameworkIntegrity fails if roles reference an ID missing in the registry", (t) => {
  const root = mkdtempSync(join(tmpdir(), "yts-tech-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const techPath = join(root, "registro-tecnicas.md");
  const rolesDir = join(root, "roles");
  mkdirSync(rolesDir, { recursive: true });

  writeFileSync(
    techPath,
    [
      "| ID | Técnica | Fundamento | Validación Propia | Fuerza Operativa | Ámbito | Ubicación | Fuente | Próxima Acción de Validación |",
      "| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- | :--- |",
      "| **`GATE-001`** | Timecodes | CONTRATO INTERNO | VERIFICADA_DETERMINÍSTICAMENTE | **COMPUERTA** | Videos | script | fuente | Verificador = check; Evidencia = log; Excepción = ninguna |",
    ].join("\n"),
    "utf8",
  );

  writeFileSync(
    join(rolesDir, "01-rol.md"),
    "Regla referenciada [VID-IA-999] que no existe en el registro.",
    "utf8",
  );

  const report = checkFrameworkIntegrity({ techniquesPath: techPath, rolesDir });
  assert.equal(report.result, "FAIL");
  const check = report.checks.find((c) => c.id === "techniques_registry_coherence")!;
  assert.equal(check.result, "FAIL");
  assert.match(check.details ?? "", /VID-IA-999.*AUSENTE/);
});
