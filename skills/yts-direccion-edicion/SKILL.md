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
- Definir los 4 anclajes de consistencia estética y las rupturas visuales intencionales en `## 🎨 1. Consistencia Visual`.
- Generar el *Radio Edit / Scratch Track* exclusivamente con voces neuronales modernas (Google AI Studio TTS, Luvvoice o ElevenLabs gratuito). **Prohibido usar sintetizadores mecánicos del sistema (`/usr/bin/say`).**
- Declarar el archivo de audio en `evidence: [{ role: "scratch_track", path: "..." }]` al enviar `P05_ANIMATIC` a revisión.

### 2. `P06_ASSEMBLY` (`03-storyboard-y-edicion.md` §§3–4 + `master` + `acceptance_sheet`)
- **Inmutabilidad del animatic aprobado:** En `P06_ASSEMBLY`, editar solo `## 🎬 3. Fase 2: Tabla de Escenas` y `## 🎛️ 4. Las 4 Capas Obligatorias`; no alterar las secciones §§1–2 aprobadas en `P05_ANIMATIC`.
- **Trazabilidad exacta de bloques y timecodes:** Cada bloque `[Bxx]` de `02-guion.md` debe aparecer en la tabla de escenas con timecodes coherentes (sin dejar `← derivar`). El verificador `script_storyboard_ids` lo comprueba automáticamente.
- **Las 4 capas de pulido y mezcla de 3 pistas:**
  1. Pacing visual (por defecto ≤ 5 s por plano estático, o excepción creativa explícitamente justificada en la tabla y en la hoja de aceptación).
  2. Cortes de continuidad (J-Cuts / L-Cuts de 0,5 a 1 s).
  3. Arquitectura de 3 pistas de audio: **A1 Voz** normalizada a −23 LUFS (true peak < −1,5 dBTP), **A2 Música** con ducking bajo voz, **A3 SFX** sincronizados al gancho visual.
  4. Dinámica de cuadro (*punch-in* 100%–105% o Ken Burns en planos fijos).
- **Hoja de aceptación previa al render y medición (`yts_measure_master`):**
  - La hoja de aceptación JSON (`acceptance_sheet`) debe estar fechada y aprobada **antes** del render del master.
  - Ejecutar `yts_measure_master` sobre el archivo exportado y la hoja de aceptación; todas las reglas deben resultar `PASS` (o `WARN` con excepción preaprobada y confirmación explícita `--ack-warn` del creador).

### 3. `P07_CLOSE` (`04-registro-recursos.md` y `05-metricas-retencion.md`)
- Registrar origen, autor, licencia y texto de atribución de cada imagen, clip, pista musical, SFX y locución en `04-registro-recursos.md`.
- Preparar la línea base de retención y experimento A/B en `05-metricas-retencion.md`.
- Cualquier acción de publicación externa requiere confirmación humana explícita en interfaz interactiva.
