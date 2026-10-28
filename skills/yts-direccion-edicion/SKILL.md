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

## 0. Metodología: Selección del Flujo Audiovisual según el Género

El agente y el creador seleccionan el flujo en `00-estado-produccion.md` antes de montar:

### 1. Flujo Audio-First (Predeterminado)
- **Géneros:** Divulgación científica, ensayos audiovisuales, documentales, historias de lore y resúmenes analíticos.
- **Principio:** La voz es la columna vertebral temporal y el video se construye en consecuencia.
- **Cadena:** `Guion por Bloques ➔ Locución Provisional (Scratch Track) ➔ Animatic ➔ Aprobación ➔ Assets y Locución Final ➔ Música y SFX`.
- **Evidencia P05:** `scratch_track`.

### 2. Flujo Screen-First / Action-First
- **Géneros:** Tutoriales técnicos, demostraciones de software, resolución de bugs y programación.
- **Principio:** La acción real en pantalla determina los tiempos indispensables.
- **Cadena:** `Escaleta de Acciones ➔ Grabación de Pantalla (Screencast) ➔ Edición de Tiempos Muertos ➔ Locución Ajustada a la Acción ➔ Rótulos y Zooms`.
- **Evidencia P05:** `screen_recording` (o `action_draft`).

### 3. Flujo Speaker-First (A-Roll Directo)
- **Géneros:** Presentador a cámara, entrevistas, comentarios y vlogs.
- **Principio:** La espontaneidad y los gestos del presentador fijan el ritmo base.
- **Cadena:** `Puntos Clave / Guion de Apoyo ➔ Grabación de Cámara (A-Roll) ➔ Selección de Tomas Válidas ➔ B-Roll de Apoyo y Reacciones ➔ Música y Pulido`.
- **Evidencia P05:** `speaker_track` (o `a_roll_take`).

### 4. Flujo Music-First / Ambient
- **Géneros:** Videos para dormir, concentración, relax, viajes cinematográficos o ritmos musicales.
- **Principio:** La pista musical o atmósfera sonora dicta la emoción, la cadencia y el tempo de los cortes.
- **Cadena:** `Selección de Pista / Beat ➔ Marcación de Golpes Rítmicos ➔ Montaje de Planos Fluidos ➔ Locución Pausada (si aplica) ➔ Efectos Ambientales`.
- **Evidencia P05:** `music_bed` (o `ambient_track`).

---

## 1. Compuertas y Reglas Obligatorias por Fase [COMPUERTA / OBLIGATORIA]

> **Gobernanza:** Las compuertas técnicas y contractuales son de cumplimiento estricto; el runtime bloquea la transición si no se satisfacen.

### `P05_ANIMATIC` (`03-storyboard-y-edicion.md` §§1–2 + evidencia por modo)
- **Consistencia Visual (§1):** Definir los 4 anclajes de consistencia estética, las rupturas visuales intencionales y las referencias de continuidad (§1.1, archivadas en `04-registro-recursos.md` §6).
- **Evidencia según el Modo de Producción [COMPUERTA]:**
  - `Audio-First`: locución provisional (*Scratch Track* o radio edit) generada con voz neuronal natural; prohibido usar sintetizadores mecánicos arcaicos (`/usr/bin/say`). Evidencia: `scratch_track`.
  - `Screen-First / Action-First`: grabación preliminar de pantalla o acción real. Evidencia: `screen_recording` o `action_draft`.
  - `Speaker-First`: toma de cámara directa o A-roll de presentador. Evidencia: `speaker_track` o `a_roll_take`.
  - `Music-First / Ambient`: pista musical guía o maqueta sonora. Evidencia: `music_bed` o `ambient_track`.

### `P06_ASSEMBLY` (`03-storyboard-y-edicion.md` §§3–4 + `master` + `acceptance_sheet`)
- **Inmutabilidad del animatic aprobado [COMPUERTA]:** En `P06_ASSEMBLY`, editar solo `## 🎬 3. Fase 2: Tabla de Escenas` y `## 🎛️ 4. Las 4 Capas Obligatorias`; no alterar las secciones §§1–2 aprobadas en `P05_ANIMATIC`.
- **Trazabilidad exacta de bloques y timecodes (`script_storyboard_ids`) [COMPUERTA]:** Cada bloque `[Bxx]` de `02-guion.md` debe aparecer en la tabla de escenas con timecodes coherentes (sin dejar `← derivar`).
- **Hoja de aceptación previa al render y medición (`yts_measure_master`) [COMPUERTA]:**
  - La hoja de aceptación JSON (`acceptance_sheet`) debe estar fechada y aprobada por el creador (`/yts-approve-sheet`) con huella SHA-256 vinculada **antes** del render del master.
  - Ejecutar `yts_measure_master` sobre el archivo exportado y la hoja de aceptación; todas las reglas acústicas y de video (`LUFS`, picos, streams) deben resultar `PASS` (o `WARN` con excepción preaprobada y confirmación `--ack-warn`).
- **Licencias y Atribución en `04-registro-recursos.md` (`resource_license_log`) [COMPUERTA]:** Toda pieza externa debe tener autor, licencia verificada (sin licencias no comerciales CC-BY-NC ni material sin autorizar), costo real y texto de atribución.

### `P07_CLOSE` (`04-registro-recursos.md` y `05-metricas-retencion.md`)
- Preparar `05-metricas-retencion.md` con **Mejora Única Nombrada para el Siguiente Video** (§5), `Tabla de Interpretación Prudente` (§7.2) y `Protocolo de Diagnóstico y Republicación` (§8: prohibido republicar archivos idénticos).
- El estado terminal `PUBLICADO` requiere confirmación interactiva humana y solo es válido bajo `mis-canales/<canal>/videos-publicados/<video>/` con las 7 fases aprobadas.

---

## 2. Técnicas y Heurísticas de Dirección Recomendadas [RECOMENDADA]

> **Gobernanza:** Las siguientes técnicas son heurísticas contrastadas de alta eficiencia. Se catalogan como **`[RECOMENDADA]`** conforme a `_framework/gobernanza-evidencia.md` y `_framework/registro-tecnicas.md`. **No son mandatos dogmáticos del runtime:** admiten excepciones y adaptaciones según el género y las herramientas, siempre que se registre una justificación creativa breve en la tabla de montaje.

### Pipeline Asset-First y Continuidad Espacial con IA
- **[VID-IA-001] Escalera de 5 Niveles para Escenas IA:** clasificar planos en Nivel 1 (Diálogo estático con eyelines e inserts de corte), Nivel 2 (Diálogo en movimiento con texturas repetitivas), Nivel 3 (Plano secuencia con stand-ins coloreados `[VID-IA-002]` y separación de trayectoria/target de cámara), Nivel 4 (Cobertura multicámara fija sincronizada en baja) y Nivel 5 (Acción descompuesta en beats físicos atómicos).
- **[VID-IA-003] Mapa Cenital de Bloqueo Espacial (*Overhead Blueprint*):** generar una vista aérea cenital matriz para escenas con múltiples elementos antes de generar tiros cerrados.
- **[VID-IA-004] Pipeline Asset-First:** diseñar activos previo al rodaje (hojas de personaje con estados con/sin prenda y de daño tras conflictos), hojas de utilería incrustadas (*baked prop sheets*) y anclas de trayectoria en el fondo.
- **[VID-IA-005] Hojas de Localización Multicámara Reutilizables:** set maestro del entorno con 4 a 5 tiros de cámara estandarizados archivados en `04-registro-recursos.md`.
- **[VID-IA-006] Sintaxis de Etiquetado Explícito (`@tagging`):** en prompts multi-personaje (`[Sujeto: @Ref_P1]...`) para evitar alucinaciones cruzadas.

### Las 3 C del Montaje Visual (Content, Clarity, Continuity)
- **1. Content (Filtro Anti-Decoración):** todo recurso visual (gráfico, infografía, clip de B-roll) debe **demostrar o clarificar** una idea, jamás rellenar tiempo de pantalla. Eliminar memes hiper-rápidos que deshumanicen el relato; priorizar demostraciones con propósito.
- **2. Clarity (Punto Focal y Separación):** punto focal evidente en cada plano; crear separación nítida entre sujeto y fondo mediante contraste o desenfoque; aplicar **atenuación selectiva (*spotlight / focal dimming*)** oscureciendo el resto del cuadro ante documentos o interfaces complejas.
- **3. Continuity (Continuidad y Ritmo):** cortes rectos limpios, J-Cuts / L-Cuts de 0.5 a 1 s para enlazar diálogo, cortes en barridos rápidos (*whip pan / motion masking*) para ocultar costuras entre tomas de acción IA, y eliminación de saltos focales bruscos.

### Caja de Herramientas de Tensión Cinematográfica y Emoción (Hitchcock & Cundey)
- *Espacio de Acecho (Lurking Space):* iluminar al sujeto dejando zonas perimetrales de penumbra donde el cerebro asume que algo puede ocultarse.
- *La Bomba bajo la Mesa (Hitchcock):* revelar una amenaza o dato inquietante a la audiencia antes de que los personajes lo descubran.
- *Mirada Fuera de Cuadro (Off-Screen Gaze):* cortar mientras el sujeto mira fijamente hacia afuera del encuadre para abrir un bucle de curiosidad urgente.
- *Salto Abrupto de Escala:* pasar repentinamente de plano medio a primerísimo plano en momentos de revelación.
- *Rima Visual con Variación Atmosférica:* repetir una micro-acción física en 3 momentos clave alterando la luz, el clima y el encuadre para narrar el arco emocional sin palabras.

### Autenticidad Física, Vestimenta A-Roll y Frame Zero en Shorts
- **Autenticidad Física:** ante cinemáticas digitales excesivamente pulidas que enfrían la narrativa, priorizar demostraciones físicas y analógicas tangibles (objetos reales, notas manuscritas, recortes sobre una mesa).
- **Vestimenta Temática en A-Roll:** en canales con presentador a cámara, utilizar atuendos alineados con el universo temático del video para elevar el valor de producción percibido.
- **Técnica Frame Zero para Shorts:** diseñar el fotograma del milisegundo cero con alto contraste, punto focal centrado y gancho visual inmediato para detener el scroll del espectador antes de que empiece la reproducción activa.

### Técnicas de Render, Textura y Economía de Créditos
- **Regla de Tres Pasos contra Desperdicio:** comprobar imagen fija antes de animar, previsualizar en modo económico y planificar el corte exacto antes de renderizar.
- **[VID-IA-009] Borradores en 480p:** correr tandas de prueba en baja resolución / borrador antes de escalar o renderizar la toma definitiva en 1080p.
- **[VID-IA-007] Aislamiento Acústico en Prompts:** indicar preferentemente *"environmental sound only, no music, no subtitles"*, *salvo en formatos Music-First donde sí se busque música integrada*.
- **[VID-IA-008] Control de Iteraciones Img2Img:** como regla inicial, evitar más de 2 pasadas consecutivas sobre una misma imagen; si no encaja, evaluar reiniciar desde prompt limpio consolidado (*excepción permitida si se documenta la exploración estética*).
- **[VID-IA-010] Solapamiento en Diálogo (*Dialogue Overlap*):** en planos consecutivos de conversación, repetir la última línea de la toma anterior al inicio de la siguiente para asegurar un margen de corte limpio en el montaje.
- **[VID-IA-011] Prefijo de Estilo Fijo (*Style Prefix*):** cabecera visual de iluminación y óptica constante para mantener coherencia entre planos.
- **Planificación Oración por Plano (*Sentence-to-Shot Planning*):** en Shorts dinámicos, cada frase del guion constituye un plano visual independiente sin tomas estáticas de más de 3 s.

### Las 4 Capas de Pulido Audiovisual
1. **Pacing Visual:** por defecto ≤ 5 s por plano estático antes de aplicar un corte, B-roll o movimiento (*excepción permitida por empatía narrativa comprobada de 10-15 s si el personaje ya conectó con la audiencia*).
2. **Cortes de Continuidad:** J-Cuts / L-Cuts de 0,5 a 1 s; corte oculto en barridos rápidos (*whip pan*) para empalmar tomas de acción IA.
3. **Arquitectura de Audio Adaptable y Foley Táctil:**
   - **A1 Locución:** inteligibilidad y margen de pico seguro (cuando aplique).
   - **A2 Música:** ducking o envolvente para no tapar la voz.
   - **A3 SFX y Realismo Táctil de Foley:** foley compuesto respetando la física del entorno visible (humedad, polvo, madera) sobre un colchón continuo de tono de sala (*room tone*); prohibido depender del audio plano de generadores de video.
4. **Dinámica de Cuadro:** punch-in 100%–105% o Ken Burns en planos fijos > 5 s; atenuación selectiva (*spotlight / focal dimming*) para guiar la atención en pantallas complejas.
5. **Pausas Mid-roll en Montaje:** en videos > 8 min, dejar un respiro orgánico (fade-out sutil de música, pausa de 0.5 a 1 s) en los puntos señalados por el guion y registrar timecodes para YouTube Studio.

### 3. `P07_CLOSE` (`04-registro-recursos.md` y `05-metricas-retencion.md`)
- Registrar origen, autor, licencia verificada (nunca dar por autorizado un ejemplo sin verificar), costo real, versión de modelo IA y texto de atribución en `04-registro-recursos.md`.
- Preparar `05-metricas-retencion.md` con métricas según formato (Long-form vs. Shorts), **Mejora Única Nombrada para el Siguiente Video** (§5, sin atribuir causalidad automática sin evidencia comparable), `Tabla de Interpretación Prudente` (§7.2) y `Protocolo de Diagnóstico y Republicación` (§8: prohibido republicar archivos idénticos).
- Cualquier acción de publicación externa requiere confirmación humana explícita en interfaz interactiva. Cuando todas las fases estén en `APROBADO` y el video se archive en `mis-canales/<canal>/videos-publicados/<video>/`, el estado terminal pasa a `PUBLICADO`.
