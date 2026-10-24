---
name: yts-direccion-edicion
description: Dirección audiovisual, animatic con voz neuronal (P05_ANIMATIC), montaje multicapa en FilmCraft y medición de master con ffprobe/ffmpeg contra hoja de aceptación (P06_ASSEMBLY), y cierre de licencias/métricas (P07_CLOSE).
license: MIT
---

# Rol 04 — Dirección Audiovisual, Animatic, Montaje y Cierre (`P05_ANIMATIC`, `P06_ASSEMBLY`, `P07_CLOSE`)

## Cuándo activar esta skill
- En `P05_ANIMATIC` para definir consistencia visual, generar locución provisional (*Scratch Track*) y validar el ritmo antes de producir assets finales.
- En `P06_ASSEMBLY` para completar la tabla de escenas, montar las 4 capas de pulido en FilmCraft y medir el master con `yts_measure_master`.
- En `P07_CLOSE` para auditar licencias en `04-registro-recursos.md` y dejar listo `05-metricas-retencion.md`.

## Reglas obligatorias por fase

### 1. `P05_ANIMATIC` (`03-storyboard-y-edicion.md` §§1–2 + evidencia `scratch_track`)
- Definir los 4 anclajes de consistencia estética, las rupturas visuales intencionales y, cuando haya continuidad de personaje/escenario, las **referencias de continuidad** (§1.1: función, elementos invariantes y variaciones permitidas, archivadas en `04-registro-recursos.md` §6) en `## 🎨 1. Consistencia Visual`.
- Generar el *Radio Edit / Scratch Track* exclusivamente con voces neuronales modernas con entonación natural (flujo de referencia: Google AI Studio TTS, Luvvoice o ElevenLabs gratuito). **Prohibido usar sintetizadores mecánicos del sistema (`/usr/bin/say`).**
- Declarar el archivo de audio en `evidence: [{ role: "scratch_track", path: "..." }]` al enviar `P05_ANIMATIC` a revisión.

### 2. `P06_ASSEMBLY` (`03-storyboard-y-edicion.md` §§3–4 + `master` + `acceptance_sheet`)
- **Inmutabilidad del animatic aprobado:** En `P06_ASSEMBLY`, editar solo `## 🎬 3. Fase 2: Tabla de Escenas` y `## 🎛️ 4. Las 4 Capas Obligatorias` (y opcionalmente `## 👀 5. Prueba Cualitativa con Espectadores Externos`); no alterar las secciones §§1–2 aprobadas en `P05_ANIMATIC`.
- **Trazabilidad exacta de bloques y timecodes:** Cada bloque `[Bxx]` de `02-guion.md` debe aparecer en la tabla de escenas con timecodes coherentes (sin dejar `← derivar`). El verificador `script_storyboard_ids` lo comprueba automáticamente.
- **Método agnóstico de proveedores y pruebas preliminares IA (§3.1):** Describir la intención creativa del plano de forma portable, validar en modo económico/prueba antes de escalar a calidad definitiva (nunca asumir costo cero: registrar costo real, modelo y versión en `04-registro-recursos.md`) e inspeccionar identidad, anatomía, movimiento, luz y textura natural sobre el clip real.
- **Las 4 capas de pulido y arquitectura de audio adaptable al formato:**
  1. Pacing visual (por defecto ≤ 5 s por plano estático, o excepción creativa explícitamente justificada en la tabla y en la hoja de aceptación).
  2. Cortes de continuidad (J-Cuts / L-Cuts de 0,5 a 1 s).
  3. **Arquitectura de audio adaptable al formato:** **A1 Locución** (si aplica) con inteligibilidad y margen de pico seguro; **A2 Música** (si aporta) con ducking o envolvente; **A3 SFX** (si aportan) sincronizados al evento visual. El objetivo integrado de sonoridad (ej. −23 LUFS EBU R 128 como referencia de programa) y el límite de pico se establecen sobre el **master final** en su hoja de aceptación, nunca como mandato rígido sobre una pista de voz aislada; un formato *ambient*, musical o *screencast* limpio puede prescindir de capas que no aporten valor con justificación escrita.
  4. Dinámica de cuadro (*punch-in* 100%–105% o Ken Burns en planos fijos > 5 s).
- **Hoja de aceptación previa al render y medición (`yts_measure_master`):**
  - La hoja de aceptación JSON (`acceptance_sheet`) debe estar fechada y aprobada **antes** del render del master.
  - Ejecutar `yts_measure_master` sobre el archivo exportado y la hoja de aceptación; todas las reglas deben resultar `PASS` (o `WARN` con excepción preaprobada y confirmación explícita `--ack-warn` del creador).

### 3. `P07_CLOSE` (`04-registro-recursos.md` y `05-metricas-retencion.md`)
- Registrar origen, autor, licencia verificada (nunca dar por autorizado un ejemplo sin verificar), costo real, versión de modelo IA y texto de atribución en `04-registro-recursos.md`.
- Preparar `05-metricas-retencion.md` con métricas según formato (Long-form vs. Shorts), **Mejora Única Nombrada para el Siguiente Video** (§5, sin atribuir causalidad automática sin evidencia comparable), `Tabla de Interpretación Prudente` (§7.2) y `Protocolo de Diagnóstico y Republicación` (§8: prohibido republicar archivos idénticos).
- Cualquier acción de publicación externa requiere confirmación humana explícita en interfaz interactiva. Cuando todas las fases estén en `APROBADO` y el video se archive en `mis-canales/<canal>/videos-publicados/<video>/`, el estado terminal pasa a `PUBLICADO`.
