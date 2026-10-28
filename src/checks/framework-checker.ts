import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CheckVerdict } from "../core/types.ts";

export interface FrameworkIntegrityItem {
  id: string;
  result: CheckVerdict;
  details?: string;
  evidence?: string[];
}

export interface FrameworkIntegrityReport {
  result: CheckVerdict;
  checks: FrameworkIntegrityItem[];
  techniquesCount: number;
}

export interface FrameworkIntegrityOptions {
  techniquesPath?: string;
  rolesDir?: string;
}

const VALID_FUNDAMENTO = new Set(["FUENTE", "HIPÓTESIS", "DERIVACIÓN", "CONTRATO INTERNO"]);
const VALID_VALIDACION = new Set([
  "SIN_PROBAR",
  "PILOTO_PARCIAL",
  "PILOTO_VALIDADO",
  "REPETIDA",
  "VERIFICADA_DETERMINÍSTICAMENTE",
]);
const VALID_OPERATIVA = new Set(["INFORMATIVA", "RECOMENDADA", "OBLIGATORIA", "COMPUERTA"]);

function resolveDefaultTechniquesPath(): string {
  // src/checks -> ../../skills/yts-orquestador/references/registro-tecnicas.md
  const currentDir = typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : dirname(fileURLToPath(import.meta.url));
  return join(currentDir, "..", "..", "skills", "yts-orquestador", "references", "registro-tecnicas.md");
}

function resolveDefaultRolesDir(): string | undefined {
  const currentDir = typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : dirname(fileURLToPath(import.meta.url));
  const candidate = join(currentDir, "..", "..", "skills");
  return existsSync(candidate) ? candidate : undefined;
}

export function checkFrameworkIntegrity(
  options: FrameworkIntegrityOptions = {},
): FrameworkIntegrityReport {
  const techPath = options.techniquesPath ?? resolveDefaultTechniquesPath();
  const rolesDir = options.rolesDir ?? resolveDefaultRolesDir();

  const checks: FrameworkIntegrityItem[] = [];

  if (!existsSync(techPath)) {
    const item: FrameworkIntegrityItem = {
      id: "techniques_registry_presence",
      result: "FAIL",
      details: `Archivo registro-tecnicas.md no encontrado en: ${techPath}`,
    };
    return {
      result: "FAIL",
      checks: [item],
      techniquesCount: 0,
    };
  }

  const lines = readFileSync(techPath, "utf8").split(/\r?\n/);
  const rows = lines.filter((l) => /^\|\s*\*\*/.test(l));

  if (rows.length === 0) {
    const item: FrameworkIntegrityItem = {
      id: "techniques_registry_content",
      result: "FAIL",
      details: "registro-tecnicas.md no contiene filas de técnicas registradas.",
    };
    return {
      result: "FAIL",
      checks: [item],
      techniquesCount: 0,
    };
  }

  const ids: string[] = [];
  const problems: string[] = [];

  for (const line of rows) {
    const cols = line.split("|");
    const rawId = (cols[1] ?? "").replace(/[\*`\s]/g, "");
    if (!rawId) continue;
    ids.push(rawId);

    const fund = (cols[3] ?? "").trim();
    const val = (cols[4] ?? "").trim();
    const op = (cols[5] ?? "").replace(/[\*`\s]/g, "");
    const actionCol = (cols[8] ?? "") + " " + line;

    if (!VALID_FUNDAMENTO.has(fund)) {
      problems.push(`'${rawId}': fundamento inválido '${fund}'`);
    }
    if (!VALID_VALIDACION.has(val)) {
      problems.push(`'${rawId}': validación propia inválida '${val}'`);
    }
    if (!VALID_OPERATIVA.has(op)) {
      problems.push(`'${rawId}': fuerza operativa inválida '${op}'`);
    }

    // COMPUERTA rules must declare Verificador, Evidencia and Excepción
    if (op === "COMPUERTA") {
      const hasVerifier = /verificador\s*=/i.test(actionCol);
      const hasEvidence = /evidencia\s*=/i.test(actionCol);
      const hasException = /excepci[oó]n\s*=/i.test(actionCol);
      if (!hasVerifier || !hasEvidence || !hasException) {
        problems.push(
          `'${rawId}' es COMPUERTA pero no declara Verificador, Evidencia y Excepción en su definición`,
        );
      }
    }
  }

  // Duplicate IDs
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      dups.add(id);
    }
    seen.add(id);
  }
  if (dups.size > 0) {
    problems.unshift(`IDs duplicados encontrados: ${[...dups].join(", ")}`);
  }

  // Role coverage
  if (rolesDir && existsSync(rolesDir)) {
    const idSet = new Set(ids);
    const missingInRegistry = new Set<string>();

    function scanDir(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(full);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          const content = readFileSync(full, "utf8");
          const matches = content.matchAll(/\[(GATE|PACK|GUI|VID-IA)-[0-9]{3}\]/g);
          for (const m of matches) {
            const roleId = m[0].replace(/[\[\]]/g, "");
            if (!idSet.has(roleId)) {
              missingInRegistry.add(roleId);
            }
          }
        }
      }
    }

    scanDir(rolesDir);

    for (const missingId of missingInRegistry) {
      problems.push(`ID '${missingId}' referenciado en roles/skills pero AUSENTE en registro-tecnicas.md`);
    }
  }

  if (problems.length > 0) {
    checks.push({
      id: "techniques_registry_coherence",
      result: "FAIL",
      details: problems.join("; "),
      evidence: [`${techPath} (${ids.length} técnicas)`],
    });
    return {
      result: "FAIL",
      checks,
      techniquesCount: ids.length,
    };
  }

  checks.push({
    id: "techniques_registry_coherence",
    result: "PASS",
    evidence: [`${techPath} (${ids.length} técnicas válidas)`],
  });

  return {
    result: "PASS",
    checks,
    techniquesCount: ids.length,
  };
}
