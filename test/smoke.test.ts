import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createYoutubeShellExtension } from "../src/gate/pi-extension.ts";
import { checkVideoContract } from "../src/checks/contract-checker.ts";
import type { AcceptanceSheet } from "../src/checks/media-measurement.ts";

const ROOT = join(import.meta.dirname, "..");
const TEMPLATES = join(ROOT, "templates", "pipeline-video");

test("end-to-end smoke test: /yts-init scaffolds a blank folder and 7 phases run from template to measured master, keeping 00-estado-produccion.md synced", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-smoke-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const videoDir = join(tmp, "01-piloto-smoke");

  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const hooks = new Map<string, Array<(event: any, ctx: any) => any>>();

  const ext = createYoutubeShellExtension({ now: () => "2026-10-22T09:00:00Z" });
  ext({
    on(event: string, fn: any) {
      const list = hooks.get(event) ?? [];
      list.push(fn);
      hooks.set(event, list);
    },
    registerTool(def: any) {
      tools.set(def.name, def);
    },
    registerCommand(name: string, def: any) {
      commands.set(name, def);
    },
    getAllTools: () => Array.from(tools.keys()).map((name) => ({ name })),
    setActiveTools() {},
  });

  const ctx = {
    cwd: videoDir,
    hasUI: true,
    ui: {
      notify() {},
      async confirm() {
        return true;
      },
    },
  };

  async function callTool(name: string, input: Record<string, any>) {
    for (const h of hooks.get("tool_call") ?? []) {
      const decision = await h({ toolCallId: "t1", toolName: name, input }, ctx);
      assert.ok(!decision?.block, `Expected ${name} not to be blocked, got: ${decision?.reason}`);
    }
    if (name === "write") {
      writeFileSync(join(videoDir, input.path), input.content, "utf8");
      return {};
    }
    const tool = tools.get(name);
    assert.ok(tool, `Missing tool ${name}`);
    return tool.execute("t1", input, undefined, undefined, ctx);
  }

  async function approve(phase: string) {
    const cmd = commands.get("yts-approve");
    assert.ok(cmd);
    await cmd.handler(phase, ctx);
  }

  // Scaffold via /yts-init on an empty directory
  const initCmd = commands.get("yts-init");
  assert.ok(initCmd, "/yts-init command must be registered");
  await initCmd.handler("", ctx);

  // P01_PACKAGING
  await callTool("yts_transition", { action: "start", phase: "P01_PACKAGING" });
  assert.match(readFileSync(join(videoDir, "00-estado-produccion.md"), "utf8"), /\*\*Estado actual:\*\*\s*`EN_CURSO`/);
  await callTool("yts_transition", { action: "submit", phase: "P01_PACKAGING" });
  assert.match(
    readFileSync(join(videoDir, "00-estado-produccion.md"), "utf8"),
    /\*\*Estado actual:\*\*\s*`PENDIENTE_APROBACION`/,
  );
  await approve("P01_PACKAGING");
  assert.match(
    readFileSync(join(videoDir, "00-estado-produccion.md"), "utf8"),
    /\*\*01\. Packaging\*\*\s*\|\s*`APROBADO`/,
  );

  // P02_RESEARCH
  await callTool("yts_transition", { action: "start", phase: "P02_RESEARCH" });
  await callTool("yts_transition", { action: "submit", phase: "P02_RESEARCH" });
  await approve("P02_RESEARCH");

  // P03_SCRIPT (write a clean 2-block script so P06 storyboard cross-check matches cleanly)
  await callTool("yts_transition", { action: "start", phase: "P03_SCRIPT" });
  const cleanScript = [
    "# 02 - Guion, Narrativa y Control Editorial",
    "",
    "## 1. Puerta de Control Editorial y Monetización (Obligatorio)",
    "- [x] Aportación Original",
    "",
    "## 2. Guion Maestro Estructurado por Bloques Atómicos (IDs Estables)",
    "### [B01_Hook] — Apertura",
    "- **Tiempo estimado:** `00:00 - 00:01`",
    "- **Locución literal:** > Hola.",
    "",
    "### [B02_Cierre] — Cierre",
    "- **Tiempo estimado:** `00:01 - 00:02`",
    "- **Locución literal:** > Fin.",
    "",
  ].join("\n");
  await callTool("write", { path: "02-guion.md", content: cleanScript });
  await callTool("yts_transition", { action: "submit", phase: "P03_SCRIPT" });
  await approve("P03_SCRIPT");

  // P04_FACTCHECK (resolve Parte 2 in 06-fuentes-y-verificacion.md without touching Parte 1)
  await callTool("yts_transition", { action: "start", phase: "P04_FACTCHECK" });
  const origFuentes = readFileSync(join(videoDir, "06-fuentes-y-verificacion.md"), "utf8");
  const resolvedFuentes = origFuentes
    .replace(
      '| `[B01_Hook]` | *"[Texto literal del guion]"* | `[Insertar DOI o URL real]` | `DD/MM/AAAA` | `[Segunda fuente]` | `PENDIENTE` | *(Aclarar si fue en animales, muestra pequeña, etc.)* |',
      '| `[B01_Hook]` | *"Hola"* | `https://doi.org/10.1000/xyz` | `22/10/2026` | `N/A` | `VERIFICADO` | *Validado* |',
    )
    .replace(
      '| `[B04_Desarrollo]` | *"[Texto literal del guion]"* | `[Insertar DOI o URL real]` | `DD/MM/AAAA` | N/A | `PENDIENTE` | *(Matiz metodológico de los autores)* |',
      '| `[B02_Cierre]` | *"Fin"* | `https://doi.org/10.1000/xyz` | `22/10/2026` | N/A | `VERIFICADO` | *Validado* |',
    );
  await callTool("write", { path: "06-fuentes-y-verificacion.md", content: resolvedFuentes });
  await callTool("yts_transition", { action: "submit", phase: "P04_FACTCHECK" });
  await approve("P04_FACTCHECK");

  // P05_ANIMATIC
  await callTool("yts_transition", { action: "start", phase: "P05_ANIMATIC" });
  writeFileSync(join(videoDir, "scratch.wav"), "RIFF-scratch", "utf8");
  await callTool("yts_transition", {
    action: "submit",
    phase: "P05_ANIMATIC",
    evidence: [{ role: "scratch_track", path: "scratch.wav" }],
  });
  await approve("P05_ANIMATIC");

  // P06_ASSEMBLY (update §§3-4 of 03-storyboard-y-edicion.md without altering §§1-2, render sample MP4, measure)
  await callTool("yts_transition", { action: "start", phase: "P06_ASSEMBLY" });
  const origStoryboard = readFileSync(join(videoDir, "03-storyboard-y-edicion.md"), "utf8");
  const updatedStoryboard = origStoryboard
    .replace(
      "| **01** | `[B01_Dilema_BucleAbierto]` | `← derivar` | *\"...\"* | 🖼️ Imagen estática *(luego animar)* | `[ej. generador de imagen con anclajes de estilo]` | `[Prompt con anclajes de estilo] --ar 16:9` | Impact Whoosh + Pista musical |",
      "| **01** | `[B01_Hook]` | `00:00 - 00:01` | *\"Hola\"* | 🖼️ Imagen | `[generador de imagen]` | `Prompt 1` | SFX |",
    )
    .replace(
      "| **02** | `[B02_La_Falsa_Causa]` | `← derivar` | *\"...\"* | 🎥 Clip de video | `[banco de stock libre disponible]` | `[URL directa de búsqueda / descarga]` | Sub-bass bajo voz |",
      "| **02** | `[B02_Cierre]` | `00:01 - 00:02` | *\"Fin\"* | 🎥 Clip | `[stock libre]` | `Prompt 2` | SFX |",
    )
    .replace(
      "| **03** | `[B03_El_Quiebre_o_Anomalia]` | `← derivar` | *\"...\"* | 🎥 Clip de video cinemático | `[ej. generador de video con imagen de referencia]` | `[Prompt con movimiento de cámara]` | SFX click en palabra clave |\n",
      "",
    );
  await callTool("write", { path: "03-storyboard-y-edicion.md", content: updatedStoryboard });

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=320x180:r=24:d=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=2",
      "-af",
      "volume=-18dB",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      join(videoDir, "master.mp4"),
    ],
    { stdio: "ignore" },
  );

  const sheet: AcceptanceSheet = {
    schemaVersion: 1,
    videoId: "01-piloto-smoke",
    approvedBy: "creador",
    approvedAt: "2026-10-22T08:00:00Z",
    approvedBeforeRender: true,
    loudness: {
      targetLufs: -23,
      toleranceLu: 25,
      maxTruePeakDbtp: 0,
    },
  };
  writeFileSync(join(videoDir, "aceptacion.json"), JSON.stringify(sheet, null, 2), "utf8");

  const measureOut = await callTool("yts_measure_master", {
    masterPath: "master.mp4",
    acceptanceSheetPath: "aceptacion.json",
  });
  assert.equal(measureOut.details.result, "PASS");

  await callTool("yts_transition", {
    action: "submit",
    phase: "P06_ASSEMBLY",
    checks: [{ id: "master_measurement", result: measureOut.details.result }],
    evidence: [
      { role: "master", path: "master.mp4" },
      { role: "acceptance_sheet", path: "aceptacion.json" },
    ],
  });
  await approve("P06_ASSEMBLY");

  // P07_CLOSE
  await callTool("yts_transition", { action: "start", phase: "P07_CLOSE" });
  await callTool("write", {
    path: "entregable-final.md",
    content: "# Entregable Final\n- URL: https://youtube.com/watch?v=demo\n",
  });
  await callTool("yts_transition", { action: "submit", phase: "P07_CLOSE" });
  await approve("P07_CLOSE");

  const finalEstado = readFileSync(join(videoDir, "00-estado-produccion.md"), "utf8");
  assert.match(finalEstado, /\*\*Estado actual:\*\*\s*`APROBADO`/);

  const finalContract = checkVideoContract(videoDir);
  assert.equal(finalContract.result, "PASS");
});
