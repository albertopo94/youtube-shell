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
- **Pipeline Asset-First para Personajes y Entornos IA:**
  - Diseñar el banco de assets de personaje con estados previstos (con/sin prenda, estados de daño o suciedad tras conflictos) y hojas de utilería incrustadas (*baked prop sheets*) antes de generar tomas definitivas.
  - **Hojas de Localización Multicámara Reutilizables:** generar un set maestro del entorno con 4 a 5 tiros de cámara estandarizados archivados en `04-registro-recursos.md`.
  - **Mapa Cenital de Bloqueo Espacial (*Overhead Blueprint*):** generar una vista aérea cenital matriz para escenas con múltiples elementos antes de generar tiros cerrados.
  - **Sintaxis de Etiquetado Explícito (@tagging):** en prompts multi-personaje (`[Sujeto: @Ref_P1]...`) para evitar alucinaciones cruzadas.
- Generar el *Radio Edit / Scratch Track* exclusivamente con voces neuronales modernas con entonación natural (flujo de referencia: Google AI Studio TTS, Luvvoice o ElevenLabs gratuito). **Prohibido usar sintetizadores mecánicos del sistema (`/usr/bin/say`).**
- Declarar el archivo de audio en `evidence: [{ role: "scratch_track", path: "..." }]` al enviar `P05_ANIMATIC` a revisión.

### 2. `P06_ASSEMBLY` (`03-storyboard-y-edicion.md` §§3–4 + `master` + `acceptance_sheet`)
- **Inmutabilidad del animatic aprobado:** En `P06_ASSEMBLY`, editar solo `## 🎬 3. Fase 2: Tabla de Escenas` y `## 🎛️ 4. Las 4 Capas Obligatorias` (y opcionalmente `## 👀 5. Prueba Cualitativa con Espectadores Externos`); no alterar las secciones §§1–2 aprobadas en `P05_ANIMATIC`.
- **Trazabilidad exacta de bloques y timecodes:** Cada bloque `[Bxx]` de `02-guion.md` debe aparecer en la tabla de escenas con timecodes coherentes (sin dejar `← derivar`). El verificador `script_storyboard_ids` lo comprueba automáticamente.
- **Dirección Cinematográfica y Pruebas Preliminares IA (§3.1):**
  - **Escalera de 5 Niveles para Escenas IA:** clasificar planos en Nivel 1 (Diálogo estático con eyelines e inserts de corte), Nivel 2 (Diálogo en movimiento con texturas repetitivas), Nivel 3 (Plano secuencia con stand-ins coloreados y separación de trayectoria/target de cámara), Nivel 4 (Cobertura multicámara fija sincronizada en baja) y Nivel 5 (Acción descompuesta en beats atómicos).
  - **Regla de Tres Pasos contra Desperdicio:** comprobar imagen fija antes de animar, previsualizar en modo económico y planificar el corte exacto antes de renderizar.
  - **Técnicas de Render y Continuidad IA:** borradores en 480p antes de escalar a 1080p, texturizado secundario (poros, no parches), solapamiento de diálogo (*dialogue overlap*), aislamiento acústico en prompts (`no music, no subtitles`), límite de 2 iteraciones en Img2Img y prefijo de estilo fijo.
  - **Planificación Oración por Plano (*Sentence-to-Shot*):** en Shorts dinámicos, cada frase del guion constituye un plano visual independiente sin tomas estáticas de más de 3 s.
- **Las 4 capas de pulido y arquitectura de audio adaptable al formato:**
  1. Pacing visual (por defecto ≤ 5 s por plano estático, o excepción creativa explícitamente justificada en la tabla y en la hoja de aceptación; excepción por empatía narrativa comprobada de 10-15 s solo si el personaje ya conectó con la audiencia).
  2. Cortes de continuidad (J-Cuts / L-Cuts de 0,5 a 1 s; corte oculto en barridos rápidos *whip pan* para empalmar tomas de acción IA).
  3. **Arquitectura de audio adaptable al formato:** **A1 Locución** (si aplica) con inteligibilidad y margen de pico seguro; **A2 Música** (si aporta) con ducking o envolvente; **A3 SFX y Realismo Táctil de Foley:** foley compuesto respetando la física del entorno visible (humedad, polvo, madera) sobre un colchón ininterrumpido de tono de sala (*room tone*); prohibido depender del audio plano o metálico de los generadores de video. El objetivo integrado de sonoridad (ej. −23 LUFS EBU R 128) y límite de pico se miden sobre el **master final** en su hoja de aceptación.
  4. Dinámica de cuadro (*punch-in* 100%–105% o Ken Burns en planos fijos > 5 s; técnica de atenuación selectiva *spotlight* para guiar el punto focal).
  5. **Pausas Mid-roll en Montaje:** en videos > 8 min, dejar un respiro orgánico (fade-out sutil de música, pausa de 0.5 a 1 s) en los puntos de transición del guion y registrar timecodes para YouTube Studio.
- **Hoja de aceptación previa al render y medición (`yts_measure_master`):**
  - La hoja de aceptación JSON (`acceptance_sheet`) debe estar fechada y aprobada **antes** del render del master.
  - Ejecutar `yts_measure_master` sobre el archivo exportado y la hoja de aceptación; todas las reglas deben resultar `PASS` (o `WARN` con excepción preaprobada y confirmación explícita `--ack-warn` del creador).

### 3. `P07_CLOSE` (`04-registro-recursos.md` y `05-metricas-retencion.md`)
- Registrar origen, autor, licencia verificada (nunca dar por autorizado un ejemplo sin verificar), costo real, versión de modelo IA y texto de atribución en `04-registro-recursos.md`.
- Preparar `05-metricas-retencion.md` con métricas según formato (Long-form vs. Shorts), **Mejora Única Nombrada para el Siguiente Video** (§5, sin atribuir causalidad automática sin evidencia comparable), `Tabla de Interpretación Prudente` (§7.2) y `Protocolo de Diagnóstico y Republicación` (§8: prohibido republicar archivos idénticos).
- Cualquier acción de publicación externa requiere confirmación humana explícita en interfaz interactiva. Cuando todas las fases estén en `APROBADO` y el video se archive en `mis-canales/<canal>/videos-publicados/<video>/`, el estado terminal pasa a `PUBLICADO`.
