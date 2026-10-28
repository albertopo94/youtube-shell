import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { CONTRACT_VERSION } from "../core/phases.ts";
import { extractSection, PREAMBLE } from "../core/sections.ts";
import type { CheckVerdict } from "../core/types.ts";
import { loadRegistry, registryPath } from "../store/fs-store.ts";

export const CANONICAL_FILES = [
  "00-estado-produccion.md",
  "01-packaging.md",
  "02-guion.md",
  "03-storyboard-y-edicion.md",
  "04-registro-recursos.md",
  "05-metricas-retencion.md",
  "06-fuentes-y-verificacion.md",
] as const;

const STATE_DECLARATION_RE = /^\*\*(Estado actual|Fase activa):\*\*\s*`([^`]+)`\s*$/;
const ACTIVE_PRODUCTION_STATES = new Set([
  "NO_INICIADO",
  "EN_CURSO",
  "BLOQUEADO",
  "PENDIENTE_APROBACION",
  "APROBADO",
]);
const ARCHIVED_PUBLISHED_DIR_RE = /(?:^|\/)mis-canales\/[^/]+\/videos-publicados\/[^/]+\/?$/;

export interface ContractCheckItem {
  id: string;
  result: CheckVerdict;
  evidence?: string[];
  details?: string;
}

export interface ContractCheckReport {
  contract_version: number;
  result: CheckVerdict;
  checks: ContractCheckItem[];
}

export interface ContractCheckOptions {
  catalogPath?: string;
  techniquesPath?: string;
  rolesDir?: string;
}

function checkCanonicalFiles(videoDir: string): ContractCheckItem {
  const present: string[] = [];
  const missing: string[] = [];
  for (const file of CANONICAL_FILES) {
    if (existsSync(join(videoDir, file))) {
      present.push(file);
    } else {
      missing.push(file);
    }
  }
  if (missing.length > 0) {
    return {
      id: "canonical_files",
      result: "FAIL",
      evidence: present,
      details: `Faltan archivos canónicos: ${missing.join(", ")}`,
    };
  }
  return {
    id: "canonical_files",
    result: "PASS",
    evidence: present,
  };
}

function checkNormalizedState(videoDir: string): ContractCheckItem {
  const estadoPath = join(videoDir, "00-estado-produccion.md");
  if (!existsSync(estadoPath)) {
    return {
      id: "normalized_state",
      result: "NOT_EVALUABLE",
      details: "No existe 00-estado-produccion.md.",
    };
  }
  const lines = readFileSync(estadoPath, "utf8").split(/\r?\n/);
  let match: RegExpExecArray | null = null;
  for (const line of lines) {
    const m = STATE_DECLARATION_RE.exec(line);
    if (m) {
      match = m;
      break;
    }
  }
  if (!match) {
    return {
      id: "normalized_state",
      result: "FAIL",
      details:
        "00-estado-produccion.md — falta un estado general con formato '**Estado actual:** `VALOR`'.",
    };
  }
  const value = match[2];
  if (ACTIVE_PRODUCTION_STATES.has(value)) {
    return {
      id: "normalized_state",
      result: "PASS",
      evidence: ["00-estado-produccion.md"],
    };
  }
  if (value === "PUBLICADO") {
    const normalizedDir = videoDir.replace(/\\/g, "/");
    if (ARCHIVED_PUBLISHED_DIR_RE.test(normalizedDir)) {
      return {
        id: "normalized_state",
        result: "PASS",
        evidence: ["00-estado-produccion.md"],
      };
    }
    return {
      id: "normalized_state",
      result: "FAIL",
      details:
        "PUBLICADO solo es válido dentro de mis-canales/<canal>/videos-publicados/<video>/.",
    };
  }
  return {
    id: "normalized_state",
    result: "FAIL",
    details: `Estado no reconocido: ${value}`,
  };
}

interface ScriptBlock {
  id: string;
  timecode: string;
}

function parseScriptBlocks(guionText: string): ScriptBlock[] {
  const lines = guionText.split(/\r?\n/);
  const blocks: ScriptBlock[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const headerMatch = /^###\s+\[(B[0-9]{2}_[A-Za-z0-9_]+)\]/.exec(lines[i]);
    if (!headerMatch) continue;
    const id = headerMatch[1];
    const nextLine = lines[i + 1] ?? "";
    const tcMatch = /`([0-9]{2}:[0-9]{2}\s*-\s*[0-9]{2}:[0-9]{2})`/.exec(nextLine);
    blocks.push({
      id,
      timecode: tcMatch ? tcMatch[1].replace(/\s+/g, " ") : "",
    });
  }
  return blocks;
}

function checkPackagingStructure(videoDir: string): ContractCheckItem {
  const pkgPath = join(videoDir, "01-packaging.md");
  if (!existsSync(pkgPath)) {
    return {
      id: "packaging_structure",
      result: "NOT_EVALUABLE",
      details: "No existe 01-packaging.md.",
    };
  }
  const text = readFileSync(pkgPath, "utf8");
  const titlesSec = extractSection(text, "Opciones de Títulos");
  const thumbsSec = extractSection(text, "Miniatura");
  const qualitySec =
    extractSection(text, "4.").ok
      ? extractSection(text, "4.")
      : extractSection(text, "Selección Final");

  const problems: string[] = [];
  if (!titlesSec.ok) {
    problems.push("falta la sección '## 2. Opciones de Títulos'");
  } else {
    const numberedItems = titlesSec.text
      .split(/\r?\n/)
      .filter((line) => /^\s*[1-9]\d*\.\s+\S+/.test(line));
    if (numberedItems.length < 5) {
      problems.push(
        `se requieren al menos 5 opciones de títulos numeradas (encontradas: ${numberedItems.length})`,
      );
    }
  }

  if (!thumbsSec.ok) {
    problems.push("falta la sección de conceptos/variantes de miniatura");
  } else {
    for (const label of ["### Miniatura A", "### Miniatura B", "### Miniatura C"]) {
      if (!thumbsSec.text.includes(label)) {
        problems.push(`falta el concepto '${label}'`);
      }
    }
  }

  if (!qualitySec.ok) {
    problems.push("falta la sección '## 4.' de control de calidad o selección final");
  }

  if (problems.length > 0) {
    return {
      id: "packaging_structure",
      result: "FAIL",
      details: `01-packaging.md incompleto: ${problems.join("; ")}.`,
    };
  }

  return {
    id: "packaging_structure",
    result: "PASS",
    evidence: ["01-packaging.md"],
  };
}

function checkResearchSourcesStructure(videoDir: string): ContractCheckItem {
  const fuentesPath = join(videoDir, "06-fuentes-y-verificacion.md");
  if (!existsSync(fuentesPath)) {
    return {
      id: "research_sources_structure",
      result: "NOT_EVALUABLE",
      details: "No existe 06-fuentes-y-verificacion.md.",
    };
  }
  const text = readFileSync(fuentesPath, "utf8");
  const preamble = extractSection(text, PREAMBLE);
  const parte1 = extractSection(text, "Parte 1");

  const problems: string[] = [];
  if (
    !preamble.ok ||
    !/Riesgo factual|R[ée]gimen de Verificaci[óo]n|Nivel de Riesgo Factual/i.test(preamble.text)
  ) {
    problems.push(
      "el preámbulo debe declarar el régimen/riesgo factual del contenido",
    );
  }

  if (!parte1.ok) {
    problems.push("falta la sección 'Parte 1' de investigación previa");
  } else {
    const hasSourceItems = parte1.text
      .split(/\r?\n/)
      .some(
        (line) =>
          /^\s*[1-9]\d*\.\s+\S+/.test(line) ||
          (line.trim().startsWith("|") && !line.includes("---")),
      );
    if (!hasSourceItems) {
      problems.push("Parte 1 no registra ninguna fuente primaria o elemento numerado/tabla");
    }
  }

  if (problems.length > 0) {
    return {
      id: "research_sources_structure",
      result: "FAIL",
      details: `06-fuentes-y-verificacion.md (P02_RESEARCH): ${problems.join("; ")}.`,
    };
  }

  return {
    id: "research_sources_structure",
    result: "PASS",
    evidence: ["06-fuentes-y-verificacion.md#Parte 1"],
  };
}

function checkScriptAndStoryboard(videoDir: string): {
  scriptIds: ContractCheckItem;
  crossCheck: ContractCheckItem;
} {
  const guionPath = join(videoDir, "02-guion.md");
  const storyPath = join(videoDir, "03-storyboard-y-edicion.md");

  if (!existsSync(guionPath)) {
    const missing: ContractCheckItem = {
      id: "script_block_ids",
      result: "NOT_EVALUABLE",
      details: "No existe 02-guion.md.",
    };
    return {
      scriptIds: missing,
      crossCheck: { ...missing, id: "script_storyboard_ids" },
    };
  }

  const guionText = readFileSync(guionPath, "utf8");
  const editorialGate = extractSection(guionText, "Puerta de Control Editorial");
  const blocks = parseScriptBlocks(guionText);
  if (!editorialGate.ok) {
    return {
      scriptIds: {
        id: "script_block_ids",
        result: "FAIL",
        details: "02-guion.md debe incluir la sección 'Puerta de Control Editorial'.",
      },
      crossCheck: {
        id: "script_storyboard_ids",
        result: "NOT_EVALUABLE",
        details: "02-guion.md no supera la validación estructural de guion.",
      },
    };
  }
  if (blocks.length === 0 || blocks.some((b) => !b.timecode)) {
    return {
      scriptIds: {
        id: "script_block_ids",
        result: "FAIL",
        details: "02-guion.md no define bloques [Bxx_Nombre] con timecode válido.",
      },
      crossCheck: {
        id: "script_storyboard_ids",
        result: "NOT_EVALUABLE",
        details: "No se pueden cruzar timecodes sin bloques válidos en 02-guion.md.",
      },
    };
  }

  const scriptIds: ContractCheckItem = {
    id: "script_block_ids",
    result: "PASS",
    evidence: blocks.map((b) => b.id),
  };

  if (!existsSync(storyPath)) {
    return {
      scriptIds,
      crossCheck: {
        id: "script_storyboard_ids",
        result: "NOT_EVALUABLE",
        details: "No existe 03-storyboard-y-edicion.md.",
      },
    };
  }

  const storyLines = readFileSync(storyPath, "utf8").split(/\r?\n/);
  const storyMap = new Map<string, string>();
  for (const line of storyLines) {
    const idMatch = /`\[(B[0-9]{2}_[A-Za-z0-9_]+)\]`/.exec(line);
    if (!idMatch) continue;
    const id = idMatch[1];
    const tcMatch = /`([0-9]{2}:[0-9]{2}\s*-\s*[0-9]{2}:[0-9]{2}|← derivar)`/.exec(line);
    if (tcMatch) {
      storyMap.set(id, tcMatch[1].replace(/\s+/g, " "));
    }
  }

  const problems: string[] = [];
  for (const b of blocks) {
    const stc = storyMap.get(b.id);
    if (stc === undefined) {
      problems.push(`${b.id} existe en guion pero NO en storyboard`);
    } else if (stc !== "← derivar" && stc !== b.timecode) {
      problems.push(`${b.id}: guion '${b.timecode}' vs storyboard '${stc}'`);
    }
  }

  if (problems.length > 0) {
    return {
      scriptIds,
      crossCheck: {
        id: "script_storyboard_ids",
        result: "FAIL",
        details: problems.join("; "),
      },
    };
  }

  return {
    scriptIds,
    crossCheck: {
      id: "script_storyboard_ids",
      result: "PASS",
      evidence: ["02-guion.md", "03-storyboard-y-edicion.md"],
    },
  };
}

function checkFactcheckResolved(videoDir: string): ContractCheckItem {
  const fuentesPath = join(videoDir, "06-fuentes-y-verificacion.md");
  if (!existsSync(fuentesPath)) {
    return {
      id: "factcheck_resolved",
      result: "NOT_EVALUABLE",
      details: "No existe 06-fuentes-y-verificacion.md.",
    };
  }

  const text = readFileSync(fuentesPath, "utf8");
  const sec = extractSection(text, "Parte 2");
  if (!sec.ok) {
    return {
      id: "factcheck_resolved",
      result: "FAIL",
      details: sec.reason,
    };
  }

  const rows = sec.text
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|") && !line.includes("---") && !line.includes("Bloque Guion"));

  const unresolved = rows.filter(
    (row) => /`?PENDIENTE`?/.test(row) || /\[Insertar DOI/i.test(row),
  );
  if (unresolved.length > 0) {
    return {
      id: "factcheck_resolved",
      result: "FAIL",
      details: `Afirmaciones sin verificar o con plantilla pendiente en Parte 2: ${unresolved[0].slice(0, 90)}`,
    };
  }

  return {
    id: "factcheck_resolved",
    result: "PASS",
    evidence: ["06-fuentes-y-verificacion.md#Parte 2"],
  };
}

function checkCatalogCoherence(catalogPath: string): ContractCheckItem {
  if (!existsSync(catalogPath)) {
    return {
      id: "catalog_coherence",
      result: "FAIL",
      details: `Catálogo no encontrado en ${catalogPath}.`,
    };
  }

  const rows = readFileSync(catalogPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => /^\|\s*\*\*/.test(line));

  if (rows.length === 0) {
    return {
      id: "catalog_coherence",
      result: "WARN",
      details: "No se encontraron filas de herramientas en el catálogo.",
    };
  }

  const problems: string[] = [];
  for (const row of rows) {
    const cols = row.split("|");
    const tool = (cols[1] ?? "").trim();
    const status = (cols[4] ?? "").trim();
    const actions = (cols[5] ?? "").trim();

    if (status.includes("🟢")) {
      if (!status.includes("PROBADA")) {
        problems.push(`catálogo — '${tool}': color 🟢 con texto '${status}'; exige PROBADA`);
      }
      const words = actions
        .replace(/[—\-]/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (words.length < 3) {
        problems.push(
          `catálogo — '${tool}': 🟢 sin operación probada nombrada (columna Acciones vacía; debería ser 🟡 DOCUMENTADA)`,
        );
      }
    } else if (status.includes("🟡")) {
      if (!status.includes("DOCUMENTA")) {
        problems.push(`catálogo — '${tool}': color 🟡 con texto '${status}'; exige DOCUMENTADA`);
      }
    }
  }

  if (problems.length > 0) {
    return {
      id: "catalog_coherence",
      result: "FAIL",
      details: problems.join("; "),
    };
  }

  return {
    id: "catalog_coherence",
    result: "PASS",
    evidence: [catalogPath],
  };
}

function checkApprovalAuthority(videoDir: string): ContractCheckItem {
  const regFile = registryPath(videoDir);
  if (!existsSync(regFile)) {
    return {
      id: "approval_authority",
      result: "NOT_EVALUABLE",
      details: "la casilla Markdown no acredita una aprobación del runtime",
    };
  }
  try {
    loadRegistry(videoDir, { videoId: basename(videoDir), now: new Date().toISOString() });
    return {
      id: "approval_authority",
      result: "PASS",
      evidence: [".youtube-shell/registro.json"],
    };
  } catch (err) {
    return {
      id: "approval_authority",
      result: "FAIL",
      details: err instanceof Error ? err.message : String(err),
    };
  }
}

function checkResourceLicenseLog(videoDir: string): ContractCheckItem {
  const recursosPath = join(videoDir, "04-registro-recursos.md");
  if (!existsSync(recursosPath)) {
    return {
      id: "resource_license_log",
      result: "NOT_EVALUABLE",
      details: "No existe 04-registro-recursos.md.",
    };
  }
  const text = readFileSync(recursosPath, "utf8");
  const sec1 = extractSection(text, "1.");
  const sec2 = extractSection(text, "2.");
  const sec3 = extractSection(text, "3.");

  const problems: string[] = [];
  if (!sec1.ok || !sec2.ok || !sec3.ok) {
    problems.push(
      "faltan secciones obligatorias de registro de recursos y licencias (## 1, ## 2, ## 3)",
    );
  }

  const tableRows = text
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|") && !line.includes("---"));
  if (tableRows.length === 0) {
    problems.push("no existen tablas de trazabilidad de recursos en 04-registro-recursos.md");
  }

  const forbiddenRow = tableRows.find((row) =>
    /\b(CC-BY-NC|SIN\s+LICENCIA|ILEGAL|RECHAZAD[OA])\b/i.test(row),
  );
  if (forbiddenRow) {
    problems.push(
      `recurso con licencia incompatible o prohibida para monetización: ${forbiddenRow.slice(0, 90)}`,
    );
  }

  if (problems.length > 0) {
    return {
      id: "resource_license_log",
      result: "FAIL",
      details: `04-registro-recursos.md: ${problems.join("; ")}.`,
    };
  }

  return {
    id: "resource_license_log",
    result: "PASS",
    evidence: ["04-registro-recursos.md"],
  };
}

function checkCloseDeliverables(videoDir: string): ContractCheckItem {
  const metricasPath = join(videoDir, "05-metricas-retencion.md");
  if (!existsSync(metricasPath)) {
    return {
      id: "close_deliverables",
      result: "NOT_EVALUABLE",
      details: "No existe 05-metricas-retencion.md.",
    };
  }

  const problems: string[] = [];
  const metricasText = readFileSync(metricasPath, "utf8");
  const intervalsSec =
    extractSection(metricasText, "Intervalos de Consulta").ok
      ? extractSection(metricasText, "Intervalos de Consulta")
      : extractSection(metricasText, "Expectativas vs. Realidad");
  const retroSec =
    extractSection(metricasText, "Retrospectiva").ok
      ? extractSection(metricasText, "Retrospectiva")
      : extractSection(metricasText, "Diagnóstico");

  if (!intervalsSec.ok || !retroSec.ok) {
    problems.push(
      "05-metricas-retencion.md debe conservar las secciones de intervalos de consulta y retrospectiva/diagnóstico",
    );
  }

  const entregablePath = join(videoDir, "entregable-final.md");
  if (existsSync(entregablePath)) {
    const entText = readFileSync(entregablePath, "utf8");
    const hasMeta =
      extractSection(entText, "Metadata").ok || extractSection(entText, "Ficha del Video").ok;
    const hasAssetsOrChecklist =
      extractSection(entText, "Archivo Master").ok ||
      extractSection(entText, "Créditos").ok ||
      extractSection(entText, "Checklist").ok;
    if (!hasMeta || !hasAssetsOrChecklist) {
      problems.push(
        "entregable-final.md debe incluir la metadata/ficha publicada y la sección de master/créditos/checklist",
      );
    }
  }

  if (problems.length > 0) {
    return {
      id: "close_deliverables",
      result: "FAIL",
      details: problems.join("; "),
    };
  }

  return {
    id: "close_deliverables",
    result: "PASS",
    evidence: existsSync(entregablePath)
      ? ["05-metricas-retencion.md", "entregable-final.md"]
      : ["05-metricas-retencion.md"],
  };
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

export function checkTechniquesRegistryCoherence(
  techniquesPath: string,
  rolesDir?: string,
): ContractCheckItem {
  if (!existsSync(techniquesPath)) {
    return {
      id: "techniques_registry_coherence",
      result: "WARN",
      details: "registro-tecnicas — archivo no encontrado (se salta comprobación)",
    };
  }

  const lines = readFileSync(techniquesPath, "utf8").split(/\r?\n/);
  const rows = lines.filter((l) => /^\|\s*\*\*/.test(l));

  if (rows.length === 0) {
    return {
      id: "techniques_registry_coherence",
      result: "FAIL",
      details: "registro-tecnicas — no se encontraron filas de técnicas registradas",
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

    if (!VALID_FUNDAMENTO.has(fund)) {
      problems.push(`registro-tecnicas — '${rawId}': fundamento inválido '${fund}'`);
    }
    if (!VALID_VALIDACION.has(val)) {
      problems.push(`registro-tecnicas — '${rawId}': validación propia inválida '${val}'`);
    }
    if (!VALID_OPERATIVA.has(op)) {
      problems.push(`registro-tecnicas — '${rawId}': fuerza operativa inválida '${op}'`);
    }
  }

  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      dups.add(id);
    }
    seen.add(id);
  }
  if (dups.size > 0) {
    problems.unshift(`registro-tecnicas — IDs duplicados encontrados: ${[...dups].join(" ")}`);
  }

  if (rolesDir && existsSync(rolesDir)) {
    const roleFiles = readdirSync(rolesDir).filter((f) => f.endsWith(".md"));
    const idSet = new Set(ids);
    const missingInRegistry = new Set<string>();
    for (const rf of roleFiles) {
      const content = readFileSync(join(rolesDir, rf), "utf8");
      const matches = content.matchAll(/\[(GATE|PACK|GUI|VID-IA)-[0-9]{3}\]/g);
      for (const m of matches) {
        const roleId = m[0].replace(/[\[\]]/g, "");
        if (!idSet.has(roleId)) {
          missingInRegistry.add(roleId);
        }
      }
    }
    for (const roleId of missingInRegistry) {
      problems.push(`roles — ID '${roleId}' referenciado en roles/ pero AUSENTE en registro-tecnicas.md`);
    }
  }

  if (problems.length > 0) {
    return {
      id: "techniques_registry_coherence",
      result: "FAIL",
      details: problems.join("; "),
    };
  }

  return {
    id: "techniques_registry_coherence",
    result: "PASS",
    evidence: [`${techniquesPath} (${ids.length} técnicas)`],
  };
}

export function checkVideoContract(
  videoDir: string,
  options: ContractCheckOptions = {},
): ContractCheckReport {
  const { scriptIds, crossCheck } = checkScriptAndStoryboard(videoDir);
  const checks: ContractCheckItem[] = [
    checkCanonicalFiles(videoDir),
    checkNormalizedState(videoDir),
    checkPackagingStructure(videoDir),
    checkResearchSourcesStructure(videoDir),
    scriptIds,
    crossCheck,
    checkFactcheckResolved(videoDir),
    checkResourceLicenseLog(videoDir),
    checkCloseDeliverables(videoDir),
    checkApprovalAuthority(videoDir),
  ];

  if (options.catalogPath) {
    checks.push(checkCatalogCoherence(options.catalogPath));
  }

  const defaultTechPath = join(videoDir, "_framework", "registro-tecnicas.md");
  const techPath = options.techniquesPath ?? (existsSync(defaultTechPath) ? defaultTechPath : undefined);
  if (techPath) {
    const rolesDir =
      options.rolesDir ??
      (existsSync(join(videoDir, "_framework", "roles"))
        ? join(videoDir, "_framework", "roles")
        : undefined);
    checks.push(checkTechniquesRegistryCoherence(techPath, rolesDir));
  }

  let overall: CheckVerdict = "PASS";
  if (checks.some((c) => c.result === "FAIL")) {
    overall = "FAIL";
  } else if (checks.some((c) => c.result === "WARN")) {
    overall = "WARN";
  }

  return {
    contract_version: CONTRACT_VERSION,
    result: overall,
    checks,
  };
}
