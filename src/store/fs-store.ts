import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, sep } from "node:path";
import { createRegistry, isSafeEvidencePath } from "../core/machine.ts";
import { CONTRACT_VERSION, PHASE_IDS } from "../core/phases.ts";
import { extractSection } from "../core/sections.ts";
import type { ArtifactReader, ArtifactRef, FingerprintResult, Registry, StoredStatus } from "../core/types.ts";

const VALID_STATUSES = new Set<StoredStatus>([
  "NO_INICIADO",
  "EN_CURSO",
  "BLOQUEADO",
  "PENDIENTE_APROBACION",
  "APROBADO",
]);

export function registryPath(videoDir: string): string {
  return join(videoDir, ".youtube-shell", "registro.json");
}

function sha256Hex(data: Buffer | string): string {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

export function createFsReader(videoDir: string): ArtifactReader {
  return {
    fingerprint(ref: ArtifactRef): FingerprintResult {
      const safe = isSafeEvidencePath(ref.file);
      if (!safe.ok) {
        return { ok: false, reason: safe.reason };
      }

      let realRoot: string;
      let realTarget: string;
      try {
        realRoot = realpathSync(videoDir);
        realTarget = realpathSync(join(realRoot, ref.file));
      } catch {
        return { ok: false, reason: `El archivo "${ref.file}" no existe.` };
      }

      if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) {
        return {
          ok: false,
          reason: `El archivo "${ref.file}" apunta fuera de la carpeta autorizada del video.`,
        };
      }

      let bytes: Buffer;
      try {
        const st = statSync(realTarget);
        if (!st.isFile()) {
          return { ok: false, reason: `"${ref.file}" no es un archivo regular.` };
        }
        bytes = readFileSync(realTarget);
      } catch {
        return { ok: false, reason: `No se pudo leer "${ref.file}".` };
      }

      if (ref.section === undefined) {
        return { ok: true, hash: sha256Hex(bytes) };
      }

      const sec = extractSection(bytes.toString("utf8"), ref.section);
      if (!sec.ok) {
        return { ok: false, reason: sec.reason };
      }
      return { ok: true, hash: sha256Hex(Buffer.from(sec.text, "utf8")) };
    },
  };
}

export interface LoadRegistryOptions {
  videoId: string;
  now: string;
}

export function validateRegistry(raw: unknown, expectedVideoId?: string): Registry {
  if (!raw || typeof raw !== "object") {
    throw new Error("El registro de producción no es un objeto válido.");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== 1 || obj.contractVersion !== CONTRACT_VERSION) {
    throw new Error("Versión de esquema o contrato no reconocida en el registro.");
  }
  if (typeof obj.videoId !== "string" || !obj.videoId) {
    throw new Error("El registro no tiene un videoId válido.");
  }
  if (expectedVideoId !== undefined && obj.videoId !== expectedVideoId) {
    throw new Error(
      `El registro pertenece al video "${obj.videoId}", no a "${expectedVideoId}".`,
    );
  }
  if (!obj.phases || typeof obj.phases !== "object") {
    throw new Error("El registro no contiene la tabla de fases.");
  }
  if (!Array.isArray(obj.history)) {
    throw new Error("El registro no contiene un historial válido.");
  }

  const phases = obj.phases as Record<string, unknown>;
  for (const id of PHASE_IDS) {
    const rec = phases[id] as Record<string, unknown> | undefined;
    if (!rec || typeof rec !== "object") {
      throw new Error(`Falta la fase ${id} en el registro.`);
    }
    const status = rec.status as StoredStatus;
    if (!VALID_STATUSES.has(status)) {
      throw new Error(`Estado inválido en el registro para ${id}: "${String(rec.status)}".`);
    }
    if (!Array.isArray(rec.approvals)) {
      throw new Error(`Lista de aprobaciones inválida en el registro para ${id}.`);
    }
    if (status === "APROBADO" && rec.approvals.length === 0) {
      throw new Error(
        `La fase ${id} figura como APROBADO en el registro sin evidencia de aprobación humana.`,
      );
    }
    for (const app of rec.approvals as Array<Record<string, unknown>>) {
      const actor = app?.actor as Record<string, unknown> | undefined;
      if (!actor || actor.kind !== "creator" || !Array.isArray(app.artifacts)) {
        throw new Error(`Registro de aprobación inválido en ${id}.`);
      }
    }
  }

  return raw as Registry;
}

export function loadRegistry(videoDir: string, options: LoadRegistryOptions): Registry {
  const path = registryPath(videoDir);
  if (!existsSync(path)) {
    return createRegistry(options.videoId, options.now);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("El registro de producción está corrupto o no es JSON válido.");
  }
  return validateRegistry(parsed, options.videoId);
}

export function saveRegistry(videoDir: string, reg: Registry): void {
  validateRegistry(reg, reg.videoId);
  const target = registryPath(videoDir);
  const dir = dirname(target);
  mkdirSync(dir, { recursive: true });

  const tmp = join(dir, `.registro.json.tmp.${process.pid}.${Date.now()}`);
  const payload = `${JSON.stringify(reg, null, 2)}\n`;
  let fd: number | undefined;
  try {
    fd = openSync(tmp, "w", 0o600);
    writeFileSync(fd, payload, "utf8");
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(tmp, target);
  } catch (err) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // ignore close error on failure path
      }
    }
    try {
      unlinkSync(tmp);
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}
