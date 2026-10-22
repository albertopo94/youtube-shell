import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { CONTRACT_VERSION } from "../core/phases.ts";
import { extractSection } from "../core/sections.ts";
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

const VALID_STATE_PATTERN = /\b(NO_INICIADO|EN_CURSO|BLOQUEADO|PENDIENTE_APROBACION|APROBADO)\b/;

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
  const stateLines = lines.filter((line) => /(Estado actual|Fase activa)/.test(line));
  if (stateLines.length === 0) {
    return {
      id: "normalized_state",
      result: "FAIL",
      details: "00-estado-produccion.md no contiene ninguna línea 'Estado actual' o 'Fase activa'.",
    };
  }
  const invalid = stateLines.filter((line) => !VALID_STATE_PATTERN.test(line));
  if (invalid.length > 0) {
    return {
      id: "normalized_state",
      result: "FAIL",
      details: `Estado no reconocido: ${invalid[0].slice(0, 80)}`,
    };
  }
  return {
    id: "normalized_state",
    result: "PASS",
    evidence: ["00-estado-produccion.md"],
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

  const blocks = parseScriptBlocks(readFileSync(guionPath, "utf8"));
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

export function checkVideoContract(
  videoDir: string,
  options: ContractCheckOptions = {},
): ContractCheckReport {
  const { scriptIds, crossCheck } = checkScriptAndStoryboard(videoDir);
  const checks: ContractCheckItem[] = [
    checkCanonicalFiles(videoDir),
    checkNormalizedState(videoDir),
    scriptIds,
    crossCheck,
    checkFactcheckResolved(videoDir),
    checkApprovalAuthority(videoDir),
  ];

  if (options.catalogPath) {
    checks.push(checkCatalogCoherence(options.catalogPath));
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
