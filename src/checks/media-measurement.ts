import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { CheckVerdict } from "../core/types.ts";

export interface MediaMetrics {
  durationSec: number;
  videoStreams: number;
  audioStreams: number;
  videoCodec: string;
  audioCodec: string;
  width: number;
  height: number;
  integratedLufs: number;
  truePeakDbtp: number;
  loudnessRangeLu: number;
  blackFrameCount: number;
  maxSilenceSec: number;
  visualSegments: number;
  /**
   * Longest detected interval between two consecutive FFmpeg scene cuts (or the
   * file end). Scene detection at `scene>0.3` is a macro-level approximation, not
   * a reliable editorial cut identification: a slow Ken Burns or a continuous
   * animation may not fire the threshold at all, and a hard light flash may fire
   * it without an editorial cut. The per-shot editorial rule (e.g. ≤5s static
   * shot) therefore stays a human review item; this metric is a diagnostic signal.
   */
  maxSegmentSec: number;
  decodeErrors: number;
  /**
   * Optional timeline/stems evidence when exported from the editor.
   * Counting streams in the final MP4 alone does not prove how many timeline tracks existed.
   */
  declaredTimelineTracks?: number;
  hasMusicTrack?: boolean;
  hasSfxTrack?: boolean;
  duckingVerified?: boolean;
}

export interface AcceptanceException {
  reason: string;
  approvedBy: string;
}

export interface AcceptanceSheet {
  schemaVersion: 1;
  videoId: string;
  approvedBy: string;
  approvedAt: string;
  approvedBeforeRender: boolean;
  loudness?: {
    targetLufs: number;
    toleranceLu: number;
    maxTruePeakDbtp: number;
  };
  audioMix?: {
    requiredTracks: number;
    requireDucking?: boolean;
  };
  maxBlackFrames?: number;
  maxSilenceSec?: number;
  pacing?: {
    maxAverageShotSec: number;
    /**
     * Optional per-segment limit in seconds for the longest detected interval
     * between cuts. When declared, the automatic verdict also enforces this cap;
     * the editorial per-shot rule (duration of each individual static shot) is
     * still a human review item, because FFmpeg scene detection is approximate.
     */
    maxShotSec?: number;
  };
  exceptions?: {
    loudness?: AcceptanceException;
    audioMix?: AcceptanceException;
    pacing?: AcceptanceException;
  };
}

export interface MediaCheckItem {
  id: string;
  result: CheckVerdict;
  details: string;
}

export interface MasterAcceptanceReport {
  result: CheckVerdict;
  metrics: MediaMetrics;
  checks: MediaCheckItem[];
}

/**
 * Archived measurement of the pilot `01-olvido-activo-microglia`
 * (`_framework/referencias/evidencia-piloto/medicion-master-piloto.md` in `albertopo94/youtube`).
 * Used strictly as a negative test fixture against a pre-render acceptance sheet.
 */
export const PILOT_ARCHIVED_METRICS: MediaMetrics = {
  durationSec: 576.682,
  videoStreams: 1,
  audioStreams: 1,
  videoCodec: "h264",
  audioCodec: "aac",
  width: 1920,
  height: 1080,
  integratedLufs: -17.5,
  truePeakDbtp: -7.3,
  loudnessRangeLu: 1.8,
  blackFrameCount: 0,
  maxSilenceSec: 0,
  visualSegments: 14,
  maxSegmentSec: 120.5,
  decodeErrors: 0,
  declaredTimelineTracks: 1,
  hasMusicTrack: false,
  hasSfxTrack: false,
  duckingVerified: false,
};

function hasValidException(exc?: AcceptanceException): boolean {
  return Boolean(
    exc &&
      typeof exc.reason === "string" &&
      exc.reason.trim().length >= 5 &&
      typeof exc.approvedBy === "string" &&
      exc.approvedBy.trim().length > 0,
  );
}

export function measureMasterFile(
  masterPath: string,
  timelineEvidence?: Pick<
    MediaMetrics,
    "declaredTimelineTracks" | "hasMusicTrack" | "hasSfxTrack" | "duckingVerified"
  >,
): { ok: true; metrics: MediaMetrics } | { ok: false; reason: string } {
  if (!existsSync(masterPath)) {
    return { ok: false, reason: `Archivo master no encontrado: "${masterPath}".` };
  }

  let probeJson: any;
  try {
    const rawProbe = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", masterPath],
      { encoding: "utf8" },
    );
    probeJson = JSON.parse(rawProbe);
  } catch (err) {
    return {
      ok: false,
      reason: `ffprobe no pudo inspeccionar "${masterPath}": ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const streams: any[] = Array.isArray(probeJson.streams) ? probeJson.streams : [];
  const videoStream = streams.find((s) => s.codec_type === "video");
  const audioStream = streams.find((s) => s.codec_type === "audio");
  const videoStreams = streams.filter((s) => s.codec_type === "video").length;
  const audioStreams = streams.filter((s) => s.codec_type === "audio").length;
  const durationSec = Number(probeJson.format?.duration ?? videoStream?.duration ?? 0);

  return parseFfmpegMeasurement(masterPath, {
    durationSec,
    videoStreams,
    audioStreams,
    videoCodec: String(videoStream?.codec_name ?? "unknown"),
    audioCodec: String(audioStream?.codec_name ?? "unknown"),
    width: Number(videoStream?.width ?? 0),
    height: Number(videoStream?.height ?? 0),
    decodeErrors: 0,
    timelineEvidence,
  });
}

function parseFfmpegMeasurement(
  masterPath: string,
  base: {
    durationSec: number;
    videoStreams: number;
    audioStreams: number;
    videoCodec: string;
    audioCodec: string;
    width: number;
    height: number;
    decodeErrors: number;
    timelineEvidence?: Pick<
      MediaMetrics,
      "declaredTimelineTracks" | "hasMusicTrack" | "hasSfxTrack" | "duckingVerified"
    >;
  },
): { ok: true; metrics: MediaMetrics } | { ok: false; reason: string } {
  const proc = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      masterPath,
      "-af",
      "loudnorm=print_format=json,silencedetect=n=-50dB:d=1.0",
      "-vf",
      "blackdetect=d=0.1:pix_th=0.10,select='gt(scene,0.3)',showinfo",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );

  if (proc.error) {
    return { ok: false, reason: `No se pudo ejecutar ffmpeg: ${proc.error.message}` };
  }

  const stderr = String(proc.stderr ?? "");
  const decodeErrors = proc.status !== 0 ? 1 : base.decodeErrors;

  const jsonMatch = stderr.match(/\{\s*"input_i"\s*:[\s\S]*?\}/);
  let integratedLufs = Number.NaN;
  let truePeakDbtp = Number.NaN;
  let loudnessRangeLu = 0;

  if (jsonMatch) {
    try {
      const loudnorm = JSON.parse(jsonMatch[0]);
      integratedLufs = Number(loudnorm.input_i);
      truePeakDbtp = Number(loudnorm.input_tp);
      loudnessRangeLu = Number(loudnorm.input_lra ?? 0);
    } catch {
      // leave NaN so evaluation marks NOT_EVALUABLE
    }
  }

  const blackMatches = stderr.match(/black_start:/g);
  const blackFrameCount = blackMatches ? blackMatches.length : 0;

  let maxSilenceSec = 0;
  for (const m of stderr.matchAll(/silence_duration:\s*([0-9.]+)/g)) {
    const dur = Number(m[1]);
    if (Number.isFinite(dur) && dur > maxSilenceSec) {
      maxSilenceSec = dur;
    }
  }

  const sceneMatches = stderr.match(/pts_time:/g);
  const visualSegments = (sceneMatches ? sceneMatches.length : 0) + 1;

  // Longest gap between consecutive detected cuts (and to the file end).
  const cutTimes: number[] = [];
  for (const m of stderr.matchAll(/pts_time:(\d+(?:\.\d+)?)/g)) {
    const t = Number(m[1]);
    if (Number.isFinite(t) && t >= 0) cutTimes.push(t);
  }
  cutTimes.sort((a, b) => a - b);
  let maxSegmentSec = 0;
  if (cutTimes.length > 0) {
    for (let i = 1; i < cutTimes.length; i++) {
      maxSegmentSec = Math.max(maxSegmentSec, cutTimes[i] - cutTimes[i - 1]);
    }
    if (base.durationSec > 0) {
      maxSegmentSec = Math.max(maxSegmentSec, base.durationSec - cutTimes[cutTimes.length - 1]);
    }
  }

  return {
    ok: true,
    metrics: {
      durationSec: base.durationSec,
      videoStreams: base.videoStreams,
      audioStreams: base.audioStreams,
      videoCodec: base.videoCodec,
      audioCodec: base.audioCodec,
      width: base.width,
      height: base.height,
      integratedLufs,
      truePeakDbtp,
      loudnessRangeLu,
      blackFrameCount,
      maxSilenceSec,
      visualSegments,
      maxSegmentSec,
      decodeErrors,
      ...base.timelineEvidence,
    },
  };
}

export function evaluateMasterAcceptance(
  metrics: MediaMetrics,
  sheet: AcceptanceSheet | null | undefined,
  options: { masterCreatedAt?: string } = {},
): MasterAcceptanceReport {
  const checks: MediaCheckItem[] = [];

  // 1. Container & decode integrity
  if (
    metrics.decodeErrors > 0 ||
    metrics.videoStreams < 1 ||
    metrics.audioStreams < 1 ||
    !(metrics.durationSec > 0)
  ) {
    checks.push({
      id: "container_integrity",
      result: "FAIL",
      details: `Integridad de contenedor inválida (videoStreams=${metrics.videoStreams}, audioStreams=${metrics.audioStreams}, duration=${metrics.durationSec}s, decodeErrors=${metrics.decodeErrors}).`,
    });
  } else {
    checks.push({
      id: "container_integrity",
      result: "PASS",
      details: `${metrics.videoCodec}/${metrics.audioCodec}, ${metrics.durationSec}s, 0 errores de decodificación.`,
    });
  }

  // 2. Acceptance sheet validity (must exist and precede render)
  if (!sheet) {
    for (const id of [
      "acceptance_sheet_validity",
      "loudness_target",
      "multi_track_mix",
      "audio_ducking",
      "black_frames",
      "silence_gaps",
      "visual_pacing",
    ]) {
      checks.push({
        id,
        result: "NOT_EVALUABLE",
        details: "No existe hoja de aceptación versionada aplicable antes del render.",
      });
    }
    return { result: "NOT_EVALUABLE", metrics, checks };
  }

  const approvedMs = Date.parse(sheet.approvedAt);
  const renderMs = options.masterCreatedAt ? Date.parse(options.masterCreatedAt) : Number.NaN;
  if (
    !sheet.approvedBeforeRender ||
    !sheet.approvedBy.trim() ||
    Number.isNaN(approvedMs) ||
    (!Number.isNaN(renderMs) && approvedMs > renderMs)
  ) {
    checks.push({
      id: "acceptance_sheet_validity",
      result: "FAIL",
      details:
        "La hoja de aceptación es inválida o fue fechada después del render (prohibido definir el estándar a posteriori).",
    });
  } else {
    checks.push({
      id: "acceptance_sheet_validity",
      result: "PASS",
      details: `Hoja aprobada antes del render por ${sheet.approvedBy} (${sheet.approvedAt}).`,
    });
  }

  // 3. Loudness target (LUFS + True Peak)
  if (!sheet.loudness) {
    checks.push({
      id: "loudness_target",
      result: "NOT_EVALUABLE",
      details: "La hoja de aceptación no especifica objetivo de sonoridad.",
    });
  } else if (!Number.isFinite(metrics.integratedLufs) || !Number.isFinite(metrics.truePeakDbtp)) {
    checks.push({
      id: "loudness_target",
      result: "NOT_EVALUABLE",
      details: "No se pudo medir LUFS o True Peak del archivo.",
    });
  } else {
    const diff = Math.abs(metrics.integratedLufs - sheet.loudness.targetLufs);
    const lufsOk = diff <= sheet.loudness.toleranceLu;
    const tpOk = metrics.truePeakDbtp <= sheet.loudness.maxTruePeakDbtp;
    if (lufsOk && tpOk) {
      checks.push({
        id: "loudness_target",
        result: "PASS",
        details: `Medido ${metrics.integratedLufs} LUFS / ${metrics.truePeakDbtp} dBTP dentro del objetivo (${sheet.loudness.targetLufs} ± ${sheet.loudness.toleranceLu} LUFS, máx ${sheet.loudness.maxTruePeakDbtp} dBTP).`,
      });
    } else if (hasValidException(sheet.exceptions?.loudness)) {
      checks.push({
        id: "loudness_target",
        result: "WARN",
        details: `Fuera de perfil por defecto (${metrics.integratedLufs} LUFS / ${metrics.truePeakDbtp} dBTP), con excepción preaprobada: ${sheet.exceptions!.loudness!.reason}`,
      });
    } else {
      checks.push({
        id: "loudness_target",
        result: "FAIL",
        details: `Sonoridad fuera de rango: medido ${metrics.integratedLufs} LUFS / ${metrics.truePeakDbtp} dBTP frente a objetivo ${sheet.loudness.targetLufs} ± ${sheet.loudness.toleranceLu} LUFS (máx ${sheet.loudness.maxTruePeakDbtp} dBTP).`,
      });
    }
  }

  // 4. Multi-track mix & ducking
  if (sheet.audioMix) {
    if (metrics.declaredTimelineTracks === undefined) {
      checks.push({
        id: "multi_track_mix",
        result: "NOT_EVALUABLE",
        details:
          "Contar streams en el MP4 final no demuestra cuántas pistas existían en el editor; falta evidencia de stems o timeline.",
      });
    } else if (metrics.declaredTimelineTracks >= sheet.audioMix.requiredTracks) {
      checks.push({
        id: "multi_track_mix",
        result: "PASS",
        details: `${metrics.declaredTimelineTracks} pistas verificadas en timeline/stems (mínimo ${sheet.audioMix.requiredTracks}).`,
      });
    } else if (hasValidException(sheet.exceptions?.audioMix)) {
      checks.push({
        id: "multi_track_mix",
        result: "WARN",
        details: `${metrics.declaredTimelineTracks} pista(s) con excepción preaprobada: ${sheet.exceptions!.audioMix!.reason}`,
      });
    } else {
      checks.push({
        id: "multi_track_mix",
        result: "FAIL",
        details: `Mezcla insuficiente: ${metrics.declaredTimelineTracks} pista(s) frente a ${sheet.audioMix.requiredTracks} exigidas por la hoja de aceptación.`,
      });
    }
  }

  if (sheet.audioMix?.requireDucking) {
    if (metrics.hasMusicTrack === false) {
      checks.push({
        id: "audio_ducking",
        result: "NOT_EVALUABLE",
        details: "Sin pista de música no es evaluable el ducking (NOT_EVALUABLE, no fallo de curva).",
      });
    } else if (metrics.duckingVerified === true) {
      checks.push({
        id: "audio_ducking",
        result: "PASS",
        details: "Ducking de música bajo locución verificado en mezcla.",
      });
    } else if (metrics.duckingVerified === false) {
      checks.push({
        id: "audio_ducking",
        result: "FAIL",
        details: "La pista de música no presenta ducking verificado bajo la voz.",
      });
    } else {
      checks.push({
        id: "audio_ducking",
        result: "NOT_EVALUABLE",
        details: "Falta evidencia de stems o proyecto para verificar la curva de ducking.",
      });
    }
  }

  // 5. Black frames
  if (sheet.maxBlackFrames !== undefined) {
    const ok = metrics.blackFrameCount <= sheet.maxBlackFrames;
    checks.push({
      id: "black_frames",
      result: ok ? "PASS" : "FAIL",
      details: `${metrics.blackFrameCount} segmento(s) en negro detectados (máximo permitido: ${sheet.maxBlackFrames}).`,
    });
  }

  // 6. Silence gaps
  if (sheet.maxSilenceSec !== undefined) {
    const ok = metrics.maxSilenceSec <= sheet.maxSilenceSec;
    checks.push({
      id: "silence_gaps",
      result: ok ? "PASS" : "FAIL",
      details: `Silencio máximo de ${metrics.maxSilenceSec}s (máximo permitido: ${sheet.maxSilenceSec}s).`,
    });
  }

  // 7. Visual pacing — average shot length plus (when declared) a per-segment cap.
  // The automatic measurement is an approximation of macro-level rhythm: FFmpeg
  // scene detection does not identify every editorial cut. The per-shot editorial
  // rule (no static shot longer than N seconds without variation) remains a human
  // review item; this check must never be read as proof that every individual
  // shot respects that rule.
  if (sheet.pacing) {
    if (!(metrics.visualSegments > 0) || !(metrics.durationSec > 0)) {
      checks.push({
        id: "visual_pacing",
        result: "NOT_EVALUABLE",
        details: "No hay conteo válido de segmentos visuales para calcular ritmo promedio.",
      });
    } else {
      const avgShotSec = metrics.durationSec / metrics.visualSegments;
      const avgOk = avgShotSec <= sheet.pacing.maxAverageShotSec;
      const hasShotCap = sheet.pacing.maxShotSec !== undefined && Number.isFinite(metrics.maxSegmentSec);
      const shotOk = hasShotCap ? metrics.maxSegmentSec <= (sheet.pacing.maxShotSec as number) : true;
      const avgLabel = `Promedio de ${avgShotSec.toFixed(2)}s por segmento (${metrics.visualSegments} segmentos en ${metrics.durationSec}s; umbral ${sheet.pacing.maxAverageShotSec}s)`;
      const segmentLabel = `Segmento más largo detectado: ${metrics.maxSegmentSec.toFixed(1)}s`;
      const disclaimer =
        " La detección de cortes (FFmpeg scene>0.3) es un indicador macro aproximado, no una identificación fiable de cada corte editorial; la duración máxima individual por plano queda en revisión editorial humana.";
      if (avgOk && shotOk) {
        checks.push({
          id: "visual_pacing",
          result: "PASS",
          details: hasShotCap
            ? `${avgLabel}; ${segmentLabel} dentro del máximo por segmento de ${sheet.pacing.maxShotSec}s.${disclaimer}`
            : `${avgLabel}; ${segmentLabel} (sin umbral por segmento declarado: la duración individual por plano queda en revisión editorial humana).${disclaimer}`,
        });
      } else if (hasValidException(sheet.exceptions?.pacing)) {
        checks.push({
          id: "visual_pacing",
          result: "WARN",
          details:
            `${avgLabel}; ${segmentLabel}` +
            (avgOk
              ? ` supera el máximo por segmento de ${sheet.pacing.maxShotSec}s`
              : ` supera el umbral promedio de ${sheet.pacing.maxAverageShotSec}s`) +
            `, con excepción creativa preaprobada: ${sheet.exceptions!.pacing!.reason}.${disclaimer}`,
        });
      } else {
        const failure = avgOk
          ? `Segmento más largo de ${metrics.maxSegmentSec.toFixed(1)}s supera el máximo por segmento de ${sheet.pacing.maxShotSec}s (promedio de ${avgShotSec.toFixed(2)}s dentro del umbral de ${sheet.pacing.maxAverageShotSec}s)`
          : `Promedio de ${avgShotSec.toFixed(2)}s por segmento supera el máximo de ${sheet.pacing.maxAverageShotSec}s${hasShotCap ? `; segmento más largo detectado: ${metrics.maxSegmentSec.toFixed(1)}s` : ""}`;
        checks.push({
          id: "visual_pacing",
          result: "FAIL",
          details: `${failure}, sin excepción justificada.${disclaimer}`,
        });
      }
    }
  }

  let overall: CheckVerdict = "PASS";
  if (checks.some((c) => c.result === "FAIL")) {
    overall = "FAIL";
  } else if (checks.some((c) => c.result === "NOT_EVALUABLE")) {
    overall = "NOT_EVALUABLE";
  } else if (checks.some((c) => c.result === "WARN")) {
    overall = "WARN";
  }

  return {
    result: overall,
    metrics,
    checks,
  };
}
