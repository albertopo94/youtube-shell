# 03 - Storyboard, Orquestación de Assets y Plan de Montaje

- **Canal / Video:** 
- **Entorno de Montaje Principal:** `[ ] FilmCraft (CLI / MCP)` / `[ ] DaVinci Resolve` / `[ ] Premiere Pro` / `[ ] CapCut` / `[ ] Híbrido`
- **Estrategia de Adquisición Multifuente:** *(campos genéricos; los proveedores concretos son ejemplos ilustrativos, no el flujo — ver política de herramientas en `AGENTS.md` §02.4)*
  - *Generación Cinemática / Abstracta:* `[herramienta de generación de imagen/video que el creador tenga disponible, ej. Google Flow, Midjourney, Flux, o equivalente]`
  - *B-Roll Real / Documental:* `[banco de stock libre disponible, ej. Coverr, Pexels, Wikimedia Commons]`
  - *Motion Graphics / Efectos:* `[herramienta de overlays del flujo, ej. EffectCraft o equivalente]`

---

## 🎨 1. Consistencia Visual y Libertad de Contraste Intencional

- **Anclajes de Coherencia Estética del Video:**
  1. *Motor / Medio visual:* `[ej. Cinematic 35mm grain / Ilustración 3D / Micrografía de laboratorio]`
  2. *Paleta cromática dominante:* `[ej. Tonos fríos azulados con sombras navy y acentos teal]`
  3. *Iluminación y óptica:* `[ej. Volumétrica suave, lente 50mm con poca profundidad de campo]`
  4. *Sujeto / Escenario Maestro:* `[archivo o nodo de referencia fijado en la herramienta elegida]`
- **Rupturas Visuales Intencionales (Opcional por humor o impacto):**  
  *(¿Hay algún plano que rompe deliberadamente el estilo para causar gracia, sorpresa o excentricidad consciente? ej. meme retro pixel art, plano VHS o dibujo infantil)*:

### 1.1 Preparación de Referencias de Continuidad `[Opcional — solo cuando la continuidad visual sea importante]`

> **Origen:** revisión externa 4 (`_framework/referencias/auditorias/revision-externa-4-2026-10-22.md`). Procedimiento **agnóstico de herramientas**: no depende de ninguna plataforma; se aplica cuando el video tenga un personaje, producto o escenario recurrente. No exigirlo en vídeos que no necesitan continuidad.

- **Qué registrar por referencia:** función (personaje / escenario / producto / iluminación / estilo), **elementos invariantes** (qué debe permanecer: rostro, vestuario, proporciones, dirección de la luz, paleta) y **variaciones permitidas** (qué puede cambiar entre planos: pose, encuadre, ángulo de cámara).
- **Límite de información real:** una foto del rostro no permite conocer con precisión un cuerpo que no aparece en ella; no se pide al generador conservar lo que la referencia no muestra. Si la continuidad de cuerpo o vestuario importa, incorporar una referencia de cuerpo completo cuando sea posible.
- **Documento vs. imagen que se anima:** una lámina de referencia compuesta (ej. dos paneles lado a lado) sirve para *documentar* al personaje, pero un generador de video puede interpretar la división como parte de la escena (duplicar al personaje o partir la composición). Para generar, usar las vistas por separado cuando la herramienta admita varias referencias. **Usar una lámina compuesta solo si se comprobó que el modelo la interpreta como referencia y no como escena; no asumir que todas las herramientas interpretan igual las referencias múltiples.**
- **Textura y acabado son parámetros estéticos del proyecto:** piel lisa, grano cinematográfico, nitidez máxima o eliminación de textura **nunca** son valores universales de una referencia maestra; son decisiones estéticas elegidas según el proyecto, sin contradecir el objetivo de la generación. Distinguir siempre textura natural de artefactos.
- **Archivar, no solo describir:** los anclajes de la §1 deben poder guardarse como **archivos de referencia concretos** (imagen de personaje, de escenario, de luz), no solo como texto dentro de cada prompt. Registrarlos en `04-registro-recursos.md` (sección de referencias reutilizables).
- **Pipeline Asset-First (estados, prendas y utilería incrustada):** Para personajes recurrentes, registrar de antemano referencias de sus estados previstos (con y sin prenda, estados de daño o suciedad tras conflictos) e incrustar accesorios pequeños (relojes, herramientas, armas) directamente en la hoja de personaje (*baked prop sheets*) para no saturar los slots de entrada de imagen.
- **Hojas de Localización Multicámara Reutilizables:** Para escenarios recurrentes del canal, generar un set maestro de 4 a 5 tiros de cámara estandarizados (plano general, tiro a ventana, mesa de trabajo, contrapicado) archivados en `04-registro-recursos.md`, reutilizándolos como fondos maestros sin regenerar el entorno desde cero.
- **Sintaxis de Etiquetado Explícito (@tagging):** En prompts para escenas con múltiples elementos, enlazar explícitamente cada sujeto (`@Ref_P1`), fondo (`@Ref_Set_1`) y voz (`@Ref_Voz_1`) en cada instrucción para evitar alucinaciones cruzadas.

---

## 🚦 2. Fase 1: Montaje Preliminar (Animatic & Radio Edit)

> **Punto de control de costos y ritmo:** Antes de generar renders en alta resolución con IA o descargar clips de pago, se monta la locución provisional con imágenes temporales de baja fidelidad.

- [ ] **Radio Edit completado:** Locución provisional montada con silencios y pausas medidos.
- [ ] **Wireframe visual (Animatic):** Placas temporales o capturas fijadas sobre la voz para verificar el ritmo.
- [ ] **Hito de Aprobación Narrativa (Creador):**
  - ¿Algún bloque se siente denso o apresurado? (Ajustar en `02-guion.md`).
  - *Estado:* `[ ] Aprobado para producción definitiva` / `[ ] Requiere ajustes`

---

## 🎬 3. Fase 2: Tabla de Escenas y Adquisición de Assets

> **Nota de trazabilidad y entrega de prompts:** Cada fila enlaza con el bloque de guion `[Bxx]` correspondiente.  
> **Ficha de Prompt Obligatoria:** Todo prompt que el agente entregue al creador debe indicar:  
> 1) *Tipo de Asset* (🖼️ Imagen estática / 🎥 Clip de video / 🎙️ Locución con dirección actoral / 🎵 Música / 🔊 SFX).  
> 2) *Herramienta y método de ejecución:* la plataforma elegida (o método genérico si la tarea no depende de un proveedor) y los **parámetros necesarios para ejecutar la tarea**; la pestaña/módulo concreto es opcional y se indica solo si la herramienta lo tiene (ej. Google Flow ➔ Pestaña *"Imagen"* vs. Pestaña *"Video"*). *Ver `AGENTS.md` §02.4.*  
> 3) *Modo operativo* (Text-to-Image 16:9, Image-to-Video con cámara, Text-to-Speech con acotaciones, etc.).  
> 4) *Prompt listo para copiar*.

| Escena # | Bloque Guion | Timecode | Texto de Locución Asociado | Tipo de Asset (Imagen / Video / Audio) | Herramienta / Método elegido | Prompt de Generación / URL del Asset | Diseño Sonoro (SFX / Música) |
| :---: | :---: | :---: | :--- | :---: | :--- | :--- | :--- |
| **01** | `[B01_Dilema_BucleAbierto]` | `← derivar` | *"..."* | 🖼️ Imagen estática *(luego animar)* | `[ej. generador de imagen con anclajes de estilo]` | `[Prompt con anclajes de estilo] --ar 16:9` | Impact Whoosh + Pista musical |
| **02** | `[B02_La_Falsa_Causa]` | `← derivar` | *"..."* | 🎥 Clip de video | `[banco de stock libre disponible]` | `[URL directa de búsqueda / descarga]` | Sub-bass bajo voz |
| **03** | `[B03_El_Quiebre_o_Anomalia]` | `← derivar` | *"..."* | 🎥 Clip de video cinemático | `[ej. generador de video con imagen de referencia]` | `[Prompt con movimiento de cámara]` | SFX click en palabra clave |
| **...** | ... | ... | ... | ... | ... | ... | ... |

> *Los nombres concretos de proveedores que aparecían antes en esta tabla (Google Flow, Coverr, etc.) eran ejemplos; el flujo no depende de ellos (ver `AGENTS.md` §02.4).*

> **Los timecodes de esta tabla no son ejemplos fijos.** Derivan del **guion aprobado en `02-guion.md`** y de la **locución real medida** (duración y pausas del audio grabado). Un ejemplo con números concretos se copia; un ejemplo con "← derivar" no. Antes esta tabla llevaba IDs y tiempos de la estructura previa (`[B01_Dilema]`, `00:00-00:08`), que no coincidían con el guion (`[B01_Dilema_BucleAbierto]`, `00:00-00:15`) y se propagaban como si fueran reales.  
> **Pausas publicitarias para YouTube Studio (Mid-rolls en videos > 8 min):** Si el video supera los 8 minutos, registrar en la columna de timecodes o notas de transición los puntos exactos de respiro natural derivados de `02-guion.md` (ej. `[Mid-roll sugerido: 04:15]`). Esto permite ingresar directamente a YouTube Studio e insertar las pausas publicitarias manuales sin cortar frases ni arruinar la retención.

### 3.1 Generación con IA: pruebas preliminares e inspección del resultado real `[Política de Costo y Calidad]`

> **Origen:** revisión externa 4 (`_framework/referencias/auditorias/revision-externa-4-2026-10-22.md`) y estudio de dirección cinematográfica con IA (`_framework/referencias/auditorias/estudio-fuente-1-video-ia-2026-10-27.md`). Agnóstico de herramientas: se aplica cuando se generen recursos con IA, con la plataforma que el creador tenga disponible.

**La Regla de los Tres Pasos contra el Desperdicio de Créditos:**
1. *Comprobar la imagen fija antes de animar:* Validar anatomía, proporciones, vestimenta y encuadre en estático antes de solicitar video. Si no funciona en foto fija, no funcionará en movimiento.
2. *Previsualizar el movimiento antes de renderizar en alta:* Probar velocidad, trayectoria y encuadre en baja resolución, modo borrador o animatic.
3. *Planificar el corte antes de generar metraje innecesario:* Determinar los segundos exactos necesarios en el timeline para no renderizar segundos vacíos de pago.

**Clasificación de Escenas y Continuidad Espacial (Escalera de 5 Niveles — ver rol 04 §3):**
- [ ] **Mapa Cenital de Bloqueo:** En escenas grupales o entornos con varios elementos, ¿se fijó una vista aérea cenital como referencia espacial matriz para los tiros de cámara individuales?
- [ ] **Nivel 1 (Diálogo Estático):** Ejes de mirada (*eyelines*) correspondientes en plano/contraplano e inserts de utilería generados como puntos de fuga para cortes limpios.
- [ ] **Nivel 2 (Diálogo en Movimiento):** Aprovechar fondos de textura repetitiva (bosque, playa, niebla, desierto) donde las micro-inconsistencias de fondo no distraen.
- [ ] **Nivel 3 (Plano Secuencia Multi-Personaje):** Mapeo explícito mediante stand-ins coloreados (Azul = P1, Naranja = P2) en prompt y separación de trayectoria de cámara vs. punto de mirada (*target*).
- [ ] **Nivel 4 (Cobertura Multicámara Fija):** Cobertura coordinada de 4 o 5 ángulos editados y sincronizados en baja fidelidad antes del render final.
- [ ] **Nivel 5 (Acción Compleja):** Desglose en *beats* físicos atómicos y seguimiento independiente de utilería arrojada o dinámica.

**Pruebas preliminares antes de lo definitivo:**
- [ ] **[VID-IA-009] Borradores en 480p:** Generar tandas de prueba en baja resolución / modo borrador para validar encuadre y dinamismo antes de renderizar la toma definitiva en 1080p.
- [ ] **[VID-IA-007] Aislamiento Acústico en Prompt:** Salvo en formatos que busquen música integrada (Music-First), indicar preferentemente *"environmental sound only, no music, no subtitles"* para facilitar la mezcla limpia en el editor.
- [ ] **[VID-IA-008] Control de Iteraciones Img2Img:** Como regla inicial, evitar más de 2 pasadas consecutivas sobre una misma imagen; si el fondo o personaje no encaja, evaluar reiniciar desde un prompt limpio consolidado.
- [ ] **[VID-IA-010] Solapamiento en Diálogo:** En planos consecutivos de conversación, repetir la última línea de la toma anterior al inicio de la siguiente para asegurar un margen de corte limpio en el montaje.
- [ ] Comprobar si la herramienta elegida ofrece un modo de prueba económico (borrador, preview, baja resolución). **Nunca asumir que es gratuito:** registrar el costo real de la prueba en `04-registro-recursos.md`.
- [ ] Si NO ofrece modo económico, valorar una alternativa: prueba más pequeña, una imagen fija animada mínimamente, un clip simplificado o validación manual del storyboard.
- [ ] La prueba valida: encuadre, acción, movimiento, **identidad del personaje** (vs. la referencia de la §1.1) y continuidad entre planos.
- [ ] Solo escalar a la versión definitiva (resolución/calidad máxima) los recursos que superaron la prueba.

**Decisión de cómo generar: secuencia multi-toma vs. planos separados:**
- Ambas vías son válidas; el agente recomienda una y el creador decide, en función de: continuidad necesaria, control por plano, coste y capacidades **comprobadas** de la herramienta elegida. No imponer una por convención.

**Especificación creativa portable (intención vs. sintaxis de herramienta):**
- La intención del plano se describe de forma **independiente de la sintaxis de cualquier plataforma**: acción, sujeto, elementos invariantes, cambios permitidos, cámara, duración y resultado esperado.
- El agente adapta después esa especificación a la herramienta elegida, usando solo funciones cuya disponibilidad se haya comprobado (ver `AGENTS.md` §02.4).
- El conocimiento no queda atrapado en prompts de un producto concreto; cambiar de herramienta no obliga a rehacer el razonamiento.

**Inspección del resultado real (sobre el clip generado, no solo sobre la imagen de referencia):**
- [ ] **Identidad:** el personaje conserva los elementos invariantes de la referencia (rostro, vestuario, rasgos); sin deriva entre planos.
- [ ] **Anatomía:** extremidades, proporciones y manos sin deformaciones.
- [ ] **Movimiento:** parpadeos, respiración y gesto naturales; sin congelamiento ni salto de fotogramas.
- [ ] **Iluminación y continuidad:** dirección de la luz coherente entre planos y con la referencia de escenario.
- [ ] **Textura vs. artefactos:** distinguir el ruido artificial (manchas, HDR excesivo, grano duplicado) de la textura natural (poros, grano fílmico intencional). **No** ordenar que todo sea liso: una piel sin textura también se ve plástica. La comprobación definitiva se hace con el clip integrado en el montaje.

**Ciclo de corrección dirigida (ante un defecto):**
- Identificar el defecto principal y localizar su origen: **referencia** (elementos invariantes o acabado), **prompt**, **parámetros** (resolución, ratio, duración) o **método/herramienta**.
- Corregir solo ese elemento; **evitar regeneraciones indiscriminadas sin hipótesis de mejora**.
- Volver a evaluar y registrar el aprendizaje (qué cambió, qué se corrigió, resultado).

**Comparación de modelos por pruebas controladas (solo cuando la elección sea material):**
- Si la elección del modelo puede mejorar significativamente el proyecto, usar una tarea representativa con criterios comparables.
- Registrar el modelo y su **versión**, los parámetros disponibles, las referencias, el **coste** y las limitaciones.
- Evaluar sobre el objetivo y el **clip final integrado en el montaje**, no sobre una captura seleccionada. No convertir una prueba aislada en superioridad universal; no exigir comparaciones cuando la decisión no es material.

---

## 🎛️ 4. Las 4 Capas Obligatorias de Pulido Técnico (No Aceptar Ensambles Crudos)

Para que el montaje se considere profesional (sea ejecutado con la herramienta de montaje elegida por el creador —el flujo de referencia actual es FilmCraft, ver `AGENTS.md` §08.1— o en un editor de escritorio), debe incorporar estas cuatro capas. Cuando una regla nombre una función concreta de una herramienta, esa función es **un medio de lograr la intención editorial descrita**; si la herramienta elegida no la tiene, se usa su equivalente o un procedimiento manual que alcance el mismo resultado medible.

> **Referencia cruzada:** `AGENTS.md` §05 (DoD de la fase) remite a esta sección como única fuente del pacing y del perfil de audio; si ambos textos difieren, manda esta sección.

1. **Regla de Pacing Visual ( perfil por defecto, con excepción justificada):**
   - **Por defecto:** ningún plano estático permanece en pantalla más de **5 segundos** sin un cambio visual (corte a nuevo plano, detalle B-roll, punch-in de escala 100% a 105%, o aparición escalonada de textos).
   - **Excepción permitida:** si el formato lo justifica, se puede extender el plano. La extensión **paga peaje**: se escribe en esta tabla una línea de **propósito creativo** (ej. "bloque de payoff emocional, la quietud es el recurso").
   - **Prohibido:** "se me ocurrió así", "lo dejé como está" o cualquier extensión sin una frase de propósito. La justificación se evalúa en la misma escena que el plano.
   - **No es universal:** videos Music-First / ambient, ensayos contemplativos o explicaciones lentas pueden tener planos más largos con justificación; el umbral de 5 s es el perfil por defecto, no una ley para todos los géneros.
2. **Cortes de Continuidad (J-Cuts y L-Cuts):**
   - [ ] En transiciones narrativas clave, el audio de la siguiente escena entra entre 12 y 24 fotogramas (0.5 a 1s) antes de que la imagen corte, evitando cambios de plano secos.
3. **Arquitectura de Audio (perfil por defecto, adaptable al formato):**
   - [ ] **A1 — Locución / voz principal (si aplica):** comprobar inteligibilidad, consistencia de nivel y margen de pico seguro. No asignar automáticamente un objetivo de sonoridad de master a una pista aislada.
   - [ ] **A2 — Música (si aporta):** usar ducking o envolvente para que no tape la voz; registrar niveles concretos solo cuando sean relevantes para la mezcla aprobada.
   - [ ] **A3 — SFX (si aportan):** sincronizar los acentos con el evento visual o narrativo y evitar saturación.
   - [ ] **Realismo Táctil de Foley (Audio IA):** Los impactos o interacciones físicas en escenas con IA combinan el golpe base con la textura física del entorno visible (salpicadura en lluvia, polvo, crujidos) sobre un colchón de ambiente continuo (*room tone*); prohibido depender del audio plano o metálico de los generadores de video.
   - [ ] **Master final:** registrar en la hoja de aceptación el objetivo integrado de sonoridad, el límite de pico y el método de medición. Como referencia de emisión, EBU R 128 usa −23 LUFS para el programa completo; no es un mandato universal para voz aislada ni para todos los destinos.
   - Un formato distinto (ambient, musical, contemplativo o screencast limpio) puede variar o suprimir capas que no aporten valor, con **justificación escrita en esta tabla**. Lo innegociable es que el resultado se **mida cuando aplique y se escuche**: claridad cuando hay locución, equilibrio y ausencia de picos molestos. La supresión de una pista es una decisión de diseño justificada, no una falta de producción.
4. **Dinámica de Cuadro (*Pacing Visual*):**
   - [ ] En planos estáticos o imágenes fijas que duren **más de 5 segundos**, aplicar zooms continuos sutiles (*punch-ins* de escala 100% a 105% o paneo Ken Burns) para evitar sensación de foto congelada.
   - **Antes esta regla decía "más de 3 segundos" y la regla 1 decía "4 a 7".** Dos umbrales distintos y ninguno aplicable a todos los géneros; se unifican en 5 s como perfil por defecto, con la excepción justificada de la regla 1.
5. **Pausas Naturales para Anuncios (Mid-Rolls en videos > 8 min):**
   - [ ] En videos de duración superior a 8 minutos, asegurar que en los puntos de transición identificados en el guion se deje un respiro orgánico (fade out sutil de música, silencio breve de 0.5 a 1 s o cambio de plano limpio) y registrar los timecodes en esta orden de montaje para la inserción manual en YouTube Studio.

---

## 👀 5. Prueba Cualitativa con Espectadores Externos `[Opcional — antes del render definitivo]`

> **Origen:** revisión externa 5 (`_framework/referencias/auditorias/revision-externa-5-2026-10-22.md`). El Glance Test del rol 02 §5 cubre la **imagen**; esto extiende la mirada externa al **arranque, la comprensión y el ritmo del video**. El creador ya no percibe los problemas de su propio video porque lo conoce demasiado.

**Procedimiento (con personas que no participaron en la producción):**
1. Mostrar **solo la miniatura y el título**: preguntar qué esperan encontrar.
2. Mostrar el montaje (o una versión suficientemente representativa) **sin explicar antes la intención del creador**.
3. Preguntar después: qué entendieron, **dónde perdieron el interés**, qué les pareció innecesario o confuso.

**Registro (señales cualitativas, no métricas):**

| Probador | Qué esperaba | Qué entendió | Dónde perdió el interés | Qué sobró / no entendió |
| :--- | :--- | :--- | :--- | :--- |
| `[inicial]` | | | | |

**Límites honestos:** una muestra pequeña **no demuestra** cómo se comportará toda la audiencia ni sustituye las analíticas posteriores (`05-metricas-retencion.md`). Sirve para detectar problemas que el creador ya no ve. Si no hay quien participe, esta sección se salta: no bloquea la producción.
