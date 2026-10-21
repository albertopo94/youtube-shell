# BRIEF DE LECTOR — `youtube-shell`

> **Qué es este documento:** todo lo que necesita entender un agente (cualquiera,
> en cualquier sesión) para arrancar o continuar el desarrollo de `youtube-shell`.
> Léelo entero antes de proponer o escribir una sola línea.
>
> **Origen:** repo de referencia `github.com/albertopo94/youtube`
> (oficina de producción de video con framework propio, público, versionado).
> **Portabilidad:** todos los paths relativos de este documento (`_framework/…`,
> `odd/…`, `AGENTS.md`, plantillas) viven en el repo de referencia y son
> navegables público en `https://github.com/albertopo94/youtube/tree/main/…` —
> un agente en cualquier máquina puede leerlos sin clonar la oficina.
> **Fecha de este brief:** 2026-10-21 (v3: integra opinión externa del producto §11).
> **Estado:** aprobado el concepto por el creador. Nombre tentativo: `youtube-shell`.

---

## 0. Origen de la idea y repos de referencia

**Cómo surgió:** el 2026-10-21, una revisión externa del repo de referencia dijo:
*"el framework es todavía instrucciones en Markdown, no controles automatizados".*
De esa cita salió la pregunta del creador: ¿y si este framework no fuera un manual
que un agente genérico lee, sino el harness interno de un agente propio? Al estudiar
el patrón de referencia (gentle-shell sobre pi, con gentle-ai como workflow) quedó
demostrado que el patrón existe, se distribuye como paquete instalable y funciona:
el piloto de video del repo de referencia fue ejecutado por un agente de esa misma
familia. `youtube-shell` es replicar ese patrón en el dominio de producción de video.

| Repo | Rol para `youtube-shell` | Qué se toma (y qué NO) |
| :-- | :-- | :-- |
| [github.com/earendil-works/pi](https://github.com/earendil-works/pi) | **Runtime (capa 1)** | Se usa tal cual (MIT). No se fork al inicio. Aporta: modelo, tools, sesiones, subagentes, skills, formato de paquete instalable. |
| [github.com/Gentleman-Programming/gentle-ai](https://github.com/Gentleman-Programming/gentle-ai) | **Disciplina genérica (capa 2)** | Se emula el *patrón* de ingeniería: ODD (tamaño de tarea por comprensión/riesgo/resumabilidad), memoria de proyecto (Engram), evidencia de verificación, docs de feature, "delegar por razón, no por tamaño", revisión nativa. **No se copia su código ni sus marcas** (es para código, no para video). |
| [github.com/Gentleman-Programming/gentle-shell](https://github.com/Gentleman-Programming/gentle-shell) | **El producto espejo (capa 4)** | Se copia el *patrón de empaquetado*: paquete de pi con persona, skills, orquestador, memoria, subagentes, instalador. Es la prueba de que un harness de dominio se puede distribuir así. **Nada de su nombre, marca ni assets** (trademarks: ver restricción §5.1). |
| [github.com/albertopo94/youtube](https://github.com/albertopo94/youtube) | **Conocimiento de dominio (capa 3) + cliente cero** | El framework completo a extraer (tabla §3): fases, linters, YMYL, licencias, medición de media, integraciones MCP. Sigue siendo la oficina del creador: el primer usuario del producto (dogfooding). |

**Relación entre ellos:** pi = motor · gentle-ai = disciplina genérica para código
(patrón a imitar — **ver §2.1 qué se extrae y qué no**) · gentle-shell =
empaquetado de esa disciplina como agente vertical (plantilla del producto) ·
el repo de referencia = dominio vertical de video (el contenido que hace único
a este producto).

---

## 1. Una frase

**`youtube-shell` es un agente de producción de video, empaquetado como el
gentle-shell es un agente de código: un runtime de agente instalable cuyo
harness interno —gobernanza, fases, checkpoints, linters, verificación— es el
framework del repo de referencia.**

Pitch espejo (del README de gentle-ai):
*"Tu agente produce videos, y después olvida todo. No tiene opinión sobre tu
canal y no puede probar qué hizo más allá de pedirte que revises cada frame.
Este producto le da memoria, pipeline y evidencia."*

## 2. El stack: 4 capas, no confundir las que son tuyas

| Capa | Qué es | Dueño | ¿Qué le toca al producto? |
| :-- | :-- | :-- | :-- |
| 4 · Producto | `youtube-shell`: runtime + harness de video | **nuevo (este trabajo)** | Construirlo |
| 3 · Conocimiento de dominio | El framework del repo de referencia: fases, linters, YMYL, licencias, medición | **el creador (existente)** | Extraerlo y empaquetarlo |
| 2 · Disciplina genérica | gentle-ai (ODD, memoria, evidencia, review) | Gentleman-Programming | **Emular el patrón, no heredar el código** (es para código; ver §2.1) |
| 1 · Runtime | `pi` (MIT) | earendil-works | Usarlo, no forkarlo (al menos al inicio) |

### 2.1 Qué se extrae de la disciplina — y qué NO (tabla de adopción)

La disciplina de referencia está escrita para **ingeniería de software**:
su contenido incluye TDD, review de diffs, PRs, lineage de revisiones y
mecanismos de entrega de código. **No se importa el contenido: se importan
los principios donde existen contrapartes en producción de video**, y se
sacan de ecuación los que no la tienen. Esta tabla es obligatoria: un agente
que no la lea va a terminar cargando code review a una oficina de video.

**A — Se adopta (el patrón ya tiene equivalente en el repo de referencia):**

| Principio de la disciplina | Equivalente en el dominio video |
| :-- | :-- |
| Autorización: trabajo read-only hasta que el usuario pide un cambio | Ya existe: niveles de autonomía de `AGENTS.md` (autonomía normal / checkpoints creativos / confirmación obligatoria) |
| Documento de feature + estado persistente que sobrevive la sesión | Ya existe: `00-estado-produccion.md` + suite `00→06` ("completar casillas no equivale a haber demostrado el resultado") |
| Subagentes con ruta de regreso (explorador / escritor / verificador) | Funciona: agente de investigación (DFS/outliers), agente de guion, verificador de media (mediciones) |
| "Delegar por una razón, no por tamaño" | Se conserva el principio de enrutado |
| Confirmación humana antes de operaciones sensibles (costo, irreversible, publicación) | Ya existe: `AGENTS.md` §02.3 (publicar, gastos, borrados irreversibles, git destructivo) |
| Skills como unidad de conocimiento de dominio | Se conserva el mecanismo; el contenido es de video |
| Memoria de proyecto entre sesiones | Se conserva; el estado por video ya lo provee el framework |

**B — Se adapta (concepto de software → contraparte de media):**

| Concepto de software | Contraparte en producción de video |
| :-- | :-- |
| Test-first (RED antes de GREEN) | **Animatic antes del render** + hoja de aceptación antes del master. **Matiz (advertencia externa 2026-10-21):** el animatic NO es literalmente un test RED — es un prototipo temprano de ritmo/narrativa; lo que más se parece a pruebas formales son la hoja de aceptación y el verificador de media |
| Review de código con lentes independientes (risk/resilience/readability/reliability) | Review de artefacto creativo: gates de guion (anti-spoiler, fuentes, originalidad), review de packaging, quality gate del render **medido** |
| El diff como evidencia de lo hecho | El documento de estado versionado por video + el informe de mediciones como evidencia |
| "Resumible desde el diff" | Resumible desde `00-estado` + los archivos en disco (el framework ya lo manda) |
| CI / suite de tests | `check-contrato.sh` + mediciones ffmpeg como "CI" del pipeline |

**C — No se trae (mecanismo de software sin equivalente en el dominio):**

- TDD literal (tests de código RED/GREEN) — el principio sí, el mecanismo no.
- Code review de diffs, PRs, PR encadenados, delivery por commits como unidad de trabajo (en video la unidad es el **entregable de fase**, no el commit; el git versiona estados y docs, no el metraje).
- RDD: lineage, receipts, autoridad de revisión, árboles congelados — no tiene contraparte en media en el MVP.
- Worktrees y ramas de código como paralelismo (en video el paralelismo es **assets en paralelo** — generar 14 placas a la vez — no código en paralelo).

**Regla de oro del §2.1:** si un concepto de la disciplina no puede
enunciarse con ejemplos de este dominio (bloques, placas, ducking, vetados,
licencias, fases), no entra en el producto. El software no se mete en la
oficina; la oficina sí se mete en el agente.

**Principio rector:** NO construir runtime. La capa 1 ya tiene dueño y es MIT.
Construir un runtime propio (F2 del diseño) queda explícamente descartado por
ahora; se reevalúa solo si el producto crece fuera del ecosistema pi.

**Moat (por qué este producto tiene valor):** los gates de un agente de código
son TDD, code review, evidencia de commit. Los gates de un agente de video son
**dominio que ningún harness de código conoce**: medición de sonoridad EBU R128,
pistas de audio, frames negros, pacing con excepción justificada, licencias de
assets, políticas de monetización y originalidad de YouTube, anti-slop. Ese
dominio ya está escrito, auditado (2 auditorías internas + 1 externa) y medido
en el repo de referencia. El producto lo convierte de instrucción en control.

## 3. Qué viene del repo de referencia (con rutas exactas)

| Asset | Ruta en el repo de referencia | Se convierte en |
| :-- | :-- | :-- |
| Gobernanza del agente (roles, checkpoints de aprobación, niveles de autonomía) | `AGENTS.md` | Persona + orquestador del paquete |
| Protocolo de herramientas por fase, catálogo con estados de evidencia, MCPs | `_framework/herramientas-y-apis.md` | Integraciones + matriz de capacidades del harness |
| Fases 00→06 por video (contrato canónico de archivos) | `_framework/plantillas/pipeline-video-template/` | Máquina de estados + templates inyectados |
| Roles por fase (investigación, packaging, guion, dirección) | `_framework/roles/01…04-*.md` | Skills del paquete |
| Plantillas de canal | `mis-canales/_plantilla-canal/`, `canales-en-estudio/_plantilla-canal/` | Scaffold de "nueva oficina" al instalar |
| Contingencia y políticas YMYL/léxico | `_framework/contingencia-y-politicas-sensibles.md` | Guardrail de fact-checking |
| Verificador de contrato determinista | `_framework/scripts/check-contrato.sh` | Tool de verificación (patrón de todos los verificadores) |
| Medición objetiva de media (comandos ffmpeg probados) | `_framework/referencias/evidencia-piloto/medicion-master-piloto.md` | Tool de "quality gate" de render |
| Decisiones y specs del saneamiento | `odd/tasks/saneamiento-evidencia-piloto.md` | Registro de contexto (qué se probó y cómo) |
| Cola de pendientes con condiciones de desbloqueo | `PENDIENTES.md` (especialmente P6 y P7) | Historial de decisiones; P7 contiene el diseño |
| Revisión externa + disposition | `_framework/referencias/auditorias/revision-externa-*.md` | Antecedentes; la cita que originó la visión |

**Nota de propiedad:** el repo de referencia **ya tiene `LICENSE` MIT** (agregado
2026-10-21, commit `934c4e3`, justamente para habilitar esta extracción). El
creador es el dueño del contenido y autoriza la extracción expresamente. Al
extraer assets se conserva atribución al repo de origen en el `CREDITS.md` del
producto.

## 4. Lo que el producto NO trae gratis y hay que construir

Única pieza con ingeniería nueva real:

### 4.1 La máquina de estados de fases

> ⚠️ **Refinada por la opinión externa de §11.2:** la máquina son DOS piezas — el
> evaluador de transiciones (qué fases están permitidas) **y** la capa de
> intercepción de tool calls que hace que las tools de una fase bloqueada sean
> rechazadas en el hook (patrón verificado en §10.3 y en los docs de pi). Un
> evaluador sin intercepción es decorativo: pi no aísla por defecto.
Hoy las fases (00-estado, packaging, guion, storyboard, recursos, métricas) se
cumplen **por buena voluntad del agente** (nivel 1 de los 3 niveles de fuerza).
El producto la convierte en **control estructural** (nivel 3): la fase N no
arranca si la N−1 no está en `APROBADO` con su evidencia física, y la fase de
master no se cierra si el render no pasa la medición.

- Implementación mínima: un script (bash o node, sin dependencias) que lee
  `00-estado-produccion.md` + los archivos de fase y devuelve
  `fases-permitidas` / `bloqueada` con motivo. Mismo patrón que
  `check-contrato.sh` (que ya existe y pasa).
- Los valores de estado ya están normalizados en el repo de referencia:
  `NO_INICIADO | EN_CURSO | BLOQUEADO | PENDIENTE_APROBACION | APROBADO`.
- Cada transición `PENDIENTE_APROBACION → APROBADO` es **solo del creador**
  (checkpoint humano), nunca del agente.

### 4.2 EmPaquetado como paquete instalable de pi
Formato de referencia: `gentle-pi` (npm + package de pi, MIT). El patrón a
copiar: persona inyectada al system prompt, skills registradas, tools propias
(verificadores, medición), orquestador con subagentes, memoria. **Solo el
patrón**: nombre, marca, copy y assets son propios.

### 4.3 Tool de medición de media
Los comandos ya están probados en
`_framework/referencias/evidencia-piloto/medicion-master-piloto.md`
(ffmpeg: `loudnorm`, `blackdetect`, `silencedetect`, `scene`, `ffprobe`).
El producto los convierte en tool que recibe el MP4 + la "hoja de aceptación"
del video y devuelve aprobado/roto con los números.

**COSTO:** todo lo anterior se construye, no se compra. Presupuesto $0:
runtime MIT, herramientas locales, tokens del modelo que el creador ya consume.
Regla dura: **nada en el MVP que cueste dinero.** Las opciones de pago del
dominio (ElevenLabs Creator, suscripciones de imagen) quedan como "integración
opcional del usuario", nunca como dependencia del producto.

## 5. Restricciones duras

1. **Marcas registradas ajenas (ver `TRADEMARKS.md` de los repos de Gentleman-Programming):**
   `gentle-shell`, `Gentle-AI`, `Engram`, `el Gentleman`. Nada de nombres,
   logos o copy derivados. Si el producto se instala sobre pi, se lo nombra
   "paquete para pi", nunca "fork de gentle-shell".
2. **Nombre tentativo: `youtube-shell`** (decisión del creador, 2026-10-21,
   "por ahora"). Antes del primer release: verificar disponibilidad del nombre
   en GitHub (org/repo) y npm. Si `youtube` choca con el uso genérico de la
   marca de Google en un paquete público, candidatos de respaldo: `cutroom`,
   `pilot`, `productor`.
3. **El repo de referencia NO se toca** para construir esto. Sigue siendo la
   oficina del creador y cliente cero (dogfooding): cuando el producto exista,
   la oficina produce con él.
4. **No automatizar lo no validado:** la suite completa de aceptación de media
   (P1 del repo de referencia) no se construye hasta que exista un video real
   al cual aplicarla. El MVP del producto valida contra el caso que ya existe:
   el piloto (`01-olvido-activo-microglia`, en el sandbox de pruebas del
   creador, con medición archivada).

## 6. MVP: qué entra y qué no

**ENTRA (v0.1):**
- Paquete de pi instalable con la persona + gobernanza extraída (AGENTS.md del
  repo de referencia, adaptado a producto).
- Máquina de estados de fases (§4.1) funcionando contra el scaffold 00→06.
- `check-contrato` + verificador de catálogo como tools (patrón existente).
- Tool de medición de media contra hoja de aceptación (§4.3), validada contra
  el master del piloto (caso real: 1 pista, −17.5 LUFS, 14 planos → el
  verificador debe marcarlo "roto contra el estándar de 3 pistas" y esa es la
  prueba de que funciona).
- Skills de los 4 roles de fase.
- Integración FilmCraft MCP (la que ya existe y ya probó render).

**NO ENTRA (v0.1):**
- Runtime propio / CLI standalone (F2).
- Integraciones TTS de pago, generadores de imagen de pago.
- Suite de aceptación auto-calibrada por género (espera al primer video real).
- Distribución pública, página web, marketing.

## 7. Primeras acciones (para el agente que arranca el repo nuevo)

1. Leer este brief completo; leer `PENDIENTES.md` (§P6, §P7) y
   `odd/tasks/saneamiento-evidencia-piloto.md` del repo de referencia.
2. Crear el repo nuevo (privado al arranque), README de 10 líneas con el
   pitch, `LICENSE` MIT, y **este brief como `docs/brief-lector.md`**.
3. PRD de una página (estructura de referencia: `PRD.md` del repo gentle-ai).
4. Prototipo de la máquina de estados (§4.1) validado contra
   `_framework/plantillas/pipeline-video-template/` del repo de referencia
   (copiar las plantillas como fixture de pruebas).
5. Primer smoke test: correr el prototipo sobre la estructura del piloto
   (si el creador autoriza lectura del sandbox `youtube-prueba`, con permiso
   explícito por ruta) y verificar que los estados reportados coinciden con
   lo medido.
6. Solo entonces: esqueleto del paquete de pi.

## 8. Decisiones del creador ya tomadas (no renegociar)

- El producto se construye: sí, y con presupuesto $0.
- Ruta: repo nuevo, el de referencia intacto.
- Forma: paquete de pi (F1) primero; standalone descartado por ahora.
- El nombre "youtube-shell" es tentativo, con revisión de disponibilidad.
- El creador no escribe código: el agente escribe, corre y rompe; el creador
  decide qué tiene que hacer y valida los resultados.
- El canal real del creador (P2 del repo de referencia) sigue frenado por
  decisión suya; el producto NO depende de él.

## 9. Antecedentes que explican por qué existe esto

1. El framework del repo de referencia fue auditado externamente (2026-10-21):
   "aún es instrucciones en Markdown, no controles automatizados". La cita
   completa está en `_framework/referencias/auditorias/revision-externa-2026-10-21.md`.
2. Ese mismo día se midió el master del piloto contra los propios estándares
   del framework: no los cumplía, y nada se dio cuenta (la regla de 3 pistas
   se escribió 28 minutos después del render). Eso es el bug que el producto
   resuelve: **la falta de un runtime que haga cumplir el framework.**
3. El creador ya opera sobre el patrón de referencia: las sesiones de este
   repo se corren con un paquete de pi de esa familia. El piloto de
   FilmCraft fue ejecutado por ese agente. El MVP ya fue validado en vivo;
   falta empaquetarlo.

## 10. Cómo funciona el harness de referencia (estudio con evidencia path:line)

Estudio realizado 2026-10-21 sobre el paquete gentle-pi instalado localmente
(raíz abreviada GP/ = `~/.local/lib/node_modules/gentle-pi/`; el mismo código es
público: paquete npm `gentle-pi` y el repo `Gentleman-Programming/gentle-shell`, donde
las rutas `extensions/…`, `lib/…`, `assets/…` son las mismas — verificables en
cualquier máquina con `npm i gentle-pi` o leyendo el repo). Referencia
directa para quien desarrolle youtube-shell: responde las 3 preguntas de
ingeniería — inyección del harness, flujo agéntico completo, y la frontera
determinista vs heurística.

### 10.1 Inyección: cómo el contenido llega al modelo

- Entrada: `GP/package.json` declara `pi.extensions`, `pi.skills`, `pi.prompts`,
  `pi.themes`. Cada `GP/extensions/*.ts` es una extensión (13 archivos; la
  principal `gentle-ai.ts` ~10.800 líneas). `postinstall` instala el binario Go.
- Punto de inyección: `pi.on("before_agent_start")` en
  `GP/extensions/gentle-ai.ts`:10284+. El harness COMPLETO solo entra en la
  sesión PADRE (los hijos reciben otra cosa).
- Se APPEND al system prompt, nunca reemplazo: `lib/append-system-prompt.ts`
  muta `appendSystemPrompt` de forma idempotente.
- Lo que entra SIEMPRE (presupuesto canónico: 9.100 bytes de core, test
  `tests/orchestrator-budget.test.ts`:35, con historial de alzas documentado):
  identidad/persona (~70 líneas de TS), `assets/orchestrator.md` (91 líneas),
  y solo 9 líneas extraídas del bundle de revisión (93 existentes) — el bundle
  NO se inyecta entero; verificación SHA-256 antes de leer
  (`readVerifiedMirrorFile`).
- Lo que entra BAJO DEMANDA (lazy): 8 archivos `orchestrator-*.md` (33-163
  líneas) anunciados con punteros que deben NOMBRAR su contenido (test lo
  prohíbe colapsar); los lee el modelo on-demand con `read`.
- Skills: NO via prompt; indexación por trigger vía catálogo en disco
  (`.atl/skill-registry.md`) regenerado con watch+debounce.
- Subagentes: sus `.md` NO se inyectan al padre; viajan como
  `--append-system-prompt` del PROCESO HIJO (si >1000 bytes, se materializan a
  tmpdir 0700). El padre solo ve nombre/descripción/tools vía
  `subagent_list_agents`. Ahorro documentado: quitar bloques gestionados del
  AGENTS.md del hijo ahorra ~37k tokens de prefijo POR HIJO
  (`lib/child-context-files.ts`).

### 10.2 Flujo agéntico de principio a fin

- Las 7 fases ODD viven en el bundle (`routing/pi.md`:5-11): Autorizar →
  Explorar → Resolver incertidumbre → Clasificar (Task Size) → Track (doc de
  feature + espejo de memoria + `todo`) → Implementar (handoff POR REFERENCIA:
  `Spec: odd/tasks/x.md, T2, S3-S4`) → Cerrar. El core solo mantiene la copia
  condensada de criterios y los 7 mecanismos de delegación.
- Cada fase tiene TOOL registrada, no solo prosa: `todo`
  (`extensions/gentle-todo.ts`), `gentle_odd_phase` (fase visible),
  `subagent_run`/`list_agents`/mensajería padre-hijo (`extensions/gentle-agents.ts`),
  revisión nativa (`gentle_review*`), `session_worktree_register`. La memoria
  (`mem_*`) es OTRO paquete aparte: el core prohíbe afirmar que existe si no
  está cargado.
- Delegación: 7 triggers, cada uno obligatorio SOLO si su condición se cumple;
  "ningún trigger aplica por defecto; con duda, trabajar inline". Umbrales
  duros: batch inline ≤3 llamadas/~10k tokens; más allá → un explorador
  read-only con informe ≤2k tokens y evidencia path:line.
- Context backstop: umbral= min(150k, 15% de la ventana), calculado por CÓDIGO
  (`lib/context-backstop.ts`) y pegado al resultado de la herramienta — antes
  era prosa y el modelo tenía que "estimar su propio contexto" (el comentario
  documenta esa migración de prosa a código).
- task vs background: enum validado (valor inválido = throw); en background el
  mensaje ordena terminar el turno y NUNCA pollerear; el `sleep` suelto está
  bloqueado en runtime mientras hay trabajo activo. Cada subagente es un
  proceso pi propio con `--tools` explícito derivado del frontmatter del agente
  (el hijo NO hereda las tools del padre).
- Paralelismo: escritores paralelos solo con "Allowed edit surfaces" disjuntas
  validadas por código (`lib/bounded-writer-admission.ts`) o worktrees aislados.

### 10.3 La frontera determinista vs heurística (la pregunta de oro)

Es CÓDIGO que falla (no prosa):

| Regla | Implementación | Fallo |
| :-- | :-- | :-- |
| Superficies del writer | parser Markdown canónico; rechaza `.`, raíz, absolutos, `..`, globs amplios | bloquea el tool call con el problema concreto |
| Writer sin doc de feature | admite solo si el `Spec:` apunta a archivo EXISTENTE (symlinks resueltos) | bloquea |
| Verificador sin riesgo | exige línea `Risk: item N` (1-6) + documento | bloquea |
| Dispatch de revisión dual | headings exactos, IDs canónicos, SHA-256 del ledger recalculado | rechaza con el contrato completo |
| Confinamiento worktree | registros por-target y por-sesión | throw |
| Consentimiento/review | 9 JSON schemas + fixtures; CLI Go con exit code | exit≠0 + parse estricto |
| Tokens opacos (cursors) | re-derivación base64url y comparación byte a byte; whitelists | fail-closed a `unavailable` |
| Bash destructivo | deny-patterns léxicas + comandos guardados allow/confirm/block | bloqueo (los propios docs admiten que es LÉXICO, no evaluación de shell) |
| Fase ODD | máquina de precedencia inferred vs explicit | throw |

Se deja al LLM a PROPÓSITO: elección de lentes ("juzga por consecuencia, no
por nombres de archivo") con razón obligatoria; clasificación de task size y
riesgo (el "resume test" es deliberadamente semántico; el código solo CONSUME
la línea que el modelo escribió); redacción del handoff; cuándo preguntar;
cuándo delegar (el umbral es duro, el disparo es juicio).

**El POR QUÉ, textual, en tres fragmentos del propio código/docs:**

1. `bounded-writer-admission.ts`:69-71: *"las reglas de prompt solas no
   detuvieron la delegación de tareas pequeñas (una petición de dos funciones
   seguía iniciando dos writers para unidades de ~35 líneas)"* → la regla
   migró a CÓDIGO después de fallar como PROSA. Igual en `verifier-admission`
   y `context-backstop`.
2. `orchestration/pi.md`:51-52: *"Pi never reconstructs lineage, target,
   revision, ... Go owns repository binding, frozen evidence, validation,
   admission, and closure."* → Go (determinista) es dueño del ESTADO y la
   VALIDACIÓN; el agente es dueño del JUICIO.
3. `orchestration/pi.md`:3: *"prompt prose never creates authority"* → la
   prosa nunca otorga autoridad; solo los bindings emitidos por el runtime.

**Criterio extraíble (para youtube-shell):** va en CÓDIGO lo que es
verificable estructuralmente y tiene artefacto observable (sección Markdown,
path, hash, exit code, token opaco). Va en PROMPT lo que exige juicio de
consecuencia (riesgo, pertinencia, redacción, oportunidad). El patrón no es
"prohibir" sino **exigir la forma y validarla**: el modelo siempre escribe la
superficie; el runtime decide si es estrecha.

Traducción al dominio video: "la fase N no arranca si N-1 no está APROBADO" =
código (el estado es un artefacto observable en 00-estado-produccion.md).
"Escribir el gancho" = prompt. "¿Este tema es YMYL?" = el modelo lo declara;
el checker exige que la declaración EXISTA con forma válida; la creación
aprobada queda como decisión humana (checkpoint). Y la lección de
inversión: no escribas los gates en prosa esperando obediencia — el camino
probado es prosa primero, observar la falla, y SOLO THEN migrar la regla a
código (así nació cada admissions-check de Gentle-Programming).

**No verificable localmente** (espejos/schemas, la implementación vive en el
CLI Go aparte): tiers de riesgo, máquina de estados de revisión, congelado de
candidatos, corrección acotada. Para youtube-shell: el patrón "núcleo Go/TS
determinista + paquete de prompt heurístico verificado por hash" es el que se
replica; el detalle interno de ese CLI no es importable.

## 11. Segunda opinión externa sobre el producto (2026-10-21)

**Fuente:** `_framework/referencias/producto/opinion-externa-producto-2026-10-21.md`
en el repo de referencia (URL pública: `https://github.com/albertopo94/youtube/blob/main/_framework/referencias/producto/opinion-externa-producto-2026-10-21.md`;
nota: este brief es autocontenido — el documento fuente es el testimonio histórico,
no una dependencia para trabajar). El mismo revisor, tras contrastar los 4 repos de §0.
Veredicto: **la analogía es
correcta como arquitectura de referencia y el producto vale la pena**; con tres
salvedades que se integraron a este brief:

### 11.1 Lo que confirmó (no cambia el diseño, lo valida)
- La relación de 4 capas y "cada repo responde una pregunta distinta". Aclara que
  gentle-shell no es una cuarta capa técnica a reproducir literalmente: es el
  ejemplo de **cómo empaquetar**. (El brief ya lo decía en §2; now with witness.)
- **El principio que importa NO es importar TDD/CI/code review literales**, sino:
  *"el agente no debe ser el único responsable de comprobar si ha cumplido sus
  propias instrucciones"*. Su ejemplo de tool de transición de fase = §4.1 exacto.
- **El piloto como prueba de regresión**: el master medido (−17.5 LUFS, 1 pista) es
  el caso que los verificadores del producto deben detectar. §6/§7 ya lo usaban
  como smoke test; queda ratificado como **acceptance test del MVP**.
- Tres límites que **protegen** la idea (no la debilitan): el animatic no es un
  test RED literal (corregido en §2.1); una medición objetiva no determina si el
  video es BUENO (el gate técnico convive con el checkpoint creativo humano, que
  en este framework ya es exclusivamente del creador); la aprobación humana no se
  reemplaza con un booleano — el sistema puede impedir omitirla, no ejercerla.
- **No reproducir gentle-shell entero** (complejidad, agentes de programación y
  revisión de código no trasladan). Coincide con §2.1-C; el MVP se concentra en
  máquina de estados + validación de contrato + medición del master + integraciones
  audiovisuales reales.

### 11.2 La advertencia técnica nueva (la más importante) — VERIFICADA
Pi **no trae un sistema de permisos/aislamiento integrado**: las tools habilitadas
usan los permisos del SO del proceso (`docs/how-pi-works.md`:47-49, verificado en
los docs locales de pi). Conclusión del revisor, correcta: **un gate "estructural"
no es exponer un comando de chequeo — es controlar las operaciones**: interceptar
las llamadas a herramientas, restringir qué tools están disponibles por fase,
controlar las transiciones y, donde corresponda, aislamiento a nivel de SO. Si el
agente conserva otra vía de escritura/ejecución que le permite continuar, el gate
es decorativo.

**Cómo se implementa esto sobre pi (evidencia local, no teoría):** el patrón ya
existe en el stack que estudiamos (§10.3): las admissions de gentle-shell **bloquean
en el hook del tool call** (`bounded-writer-admission.ts` devuelve `{block:true}`
cuando la superficie es inválida), y el modo de permisos confirma/bloquea llamadas
por patrón. Pi permite a una extensión inspeccionar y **rechazar tool calls antes
de que se ejecuten** (`docs/extensions.md` — hooks de tool call + annotations
readOnly/destructive). Es decir: el producto no necesita reemplazar pi; necesita una
extensión whose admissions lean el estado de fase y bloqueen la llamada, exactamente
como hace el harness de código con las superficies de edición. El aislamiento de SO
(containerization/chroot) queda como opción endurecida para uso multiusuario.

**→ Consecuencia para §4.1 (refinada):** la máquina de estados son DOS piezas, no
una: (a) el evaluador de transiciones (qué fases están permitidas según estado) y
(b) **la capa de intercepción** que hace que las tools de la fase bloqueada no estén
disponibles / sean rechazadas en el hook. Un evaluador sin intercepción es el
checker de este repo: útil, pero decorativo como gate.

### 11.3 Fixes de mantenimiento que esta opinión produjo
- §3 decía que el repo de referencia no tenía LICENSE: **stale** — se agregó MIT el
  2026-10-21 (`934c4e3`); nota corregida.
- §2.1 equiparaba animatic≙test RED de forma demasiado literal; matiz del revisor
  integrado en la tabla.

## 12. Tercera opinión externa: arquitectura concreta de gates (2026-10-21)

**Fuente:** `_framework/referencias/producto/opinion-externa-producto-2-2026-10-21.md`
(repo público de referencia; mismo revisor, tras profundizar en el código de
gentle-shell). Es la que convierte §11 en arquitectura ejecutable.
**⚠️ Incompleto:** el revisor menciona un "documento técnico/guía" adjunto con el
PRD delegable — **ese documento NO llegó al repo**; pedirlo antes de implementar.

### 12.1 Verificación local de sus afirmaciones (hecha 2026-10-21)
- ✅ **CIERTA y matiza §11.2:** `odd-phase.ts` es SOLO la etiqueta visual
  (línea 1: "Bounded ODD phase signal for the Gentle prompt's working label").
  Estar en una fase = seguimiento; impedir una operación = control. Son módulos
  distintos en gentle-shell y no deben confundirse en youtube-shell.
- ✅ **CIERTA:** el control pre-ejecución existe como `pi.on("tool_call", () =>
  ({block:true, reason}))` (`extensions/gentle-agents.ts:508,847` — el bloqueo
  de `sleep` lo demuestra). `verifier-admission.ts` gating confirmado.
- ⚠️ `child-safety.ts` no existe en el paquete npm instalado (el mecanismo sí
  está verificado; el archivo pertenece al repo principal — no verificable localmente por ese nombre).
- ⚠️ **STALE:** sus "dos defectos" del checker (`Fase activa`; bloque ausente como
  warning) fueron corregidos el mismo día en `a1dd403` con suite de 6 fixtures
  (exit codes explícitos). Su inspección era contra `bc5d49b`. Su recomendación
  metodológica (fixtures con exit code) ya estaba implementada.

### 12.2 Diseño de aprobaciones anti-auto-aprobación (la pieza nueva — adoptada)
Flujo de fase propuesto (reemplaza la idea simple de "casilla APROBADO"):
1. `EN_CURSO` — el agente trabaja en el entregable.
2. `PENDIENTE_APROBACION` — **solo si** los controles automáticos pasaron y existe
   evidencia identificable (la herramienta de transición lo comprueba; el modelo
   no puede escribir este estado a mano).
3. `APROBADO` — **acción explícita del creador en la UI de pi**, NUNCA una tool
   que el modelo pueda invocar con `estado=APROBADO`.
4. `Aprobación obsoleta` — si un archivo aprobado cambia, su aprobación queda
   invalidada hasta re-verificación.

**Vínculo de la aprobación:** huellas **SHA-256 de los archivos aprobados** +
resultados de las comprobaciones + identidad de quien confirmó. Cierra el
explot real que el revisor identificó: el agente consigue la aprobación del
guion, lo edita después, y sigue como si el guion aprobado siguiera intacto.
El `00-estado-produccion.md` sigue siendo la VISTA legible, pero la autoridad
vive en el registro de la extensión, no en una casilla Markdown editable.

### 12.3 La vía alternativa — política de tools del MVP (adoptada)
Que el gate bloquee tool calls no sirve si queda otra vía (bash libre, un MCP
que escriba archivos). Tres medidas para v0.1:
1. **Restringir las tools disponibles por fase** (no solo bloquear al ejecutar).
2. **Interceptar operaciones sensibles** con verificación de capacidades/rutas
   en tiempo de ejecución; **los MCP no quedan exentos por ser MCP**.
3. **No exponer shell arbitrario en el flujo de producción controlado**: las
   operaciones necesarias (medición, render) van por herramientas propias.
   (Coherente con §10.3: los propios guards de gentle-shell admiten que su
   filtro léxico de bash no es un sandbox.)
Aislamiento de SO: fuera del MVP, a estudiar después (containerization de pi).

### 12.4 Verificador de media: cuatro resultados, no dos (adoptada)
La medición devuelve **PASS / FAIL / WARN / NOT_EVALUABLE** contra la hoja de
aceptación PREEXistente. Ejemplo del revisor: 1 solo stream AAC no prueba
cuántas pistas había en la timeline del editor; sin música no se puede afirmar
"ducking falló" — es **NOT_EVALUABLE**. Estándares obligatorios se definen ANTES
del render; excepciones se justifican y aprueban, no se inventan después.
**Rol del piloto:** fixture de prueba NEGATIVA contra una hoja que exija las
propiedades faltantes — sin afirmar retroactivamente que incumplió reglas
escritas después de renderizarlo (refina el "acceptance test del MVP" de §11.1).

### 12.5 Orden de trabajo recomendado (8 pasos — adoptado como ruta del repo nuevo)
1. Alinear fases reales 01–07 con documentos canónicos 00–06 (IDs de archivo ≠
   fases de proceso).
2. Motor de estados INDEPENDIENTE de pi, con tests de transiciones válidas/inválidas.
3. Aprobaciones humanas + evidencia vinculada a huellas (§12.2).
4. Integrar controles en pi y probar que las llamadas denegadas NO modifican nada.
5. Corregir/testar el verificador de contrato (→ en este repo ya está: `a1dd403`
   + fixtures; se porta como base).
6. Medición del master con hoja de aceptación explícita (§12.4).
7. Fixtures válidas/inválidas del conjunto; inventariar operaciones reales de
   FilmCraft MCP antes de conectarlo.
8. Empaquetar cuando el control básico funcione.

**Lema del diseño (cita del revisor):** la pieza central no es una IA que
recuerde mejor tu metodología; es un runtime que pueda **demostrar por qué
permite una operación, por qué la bloquea y qué evidencia justifica el resultado**.

**Lección anti-copia que él mismo señaló:** gentle-shell documenta un intento
histórico de limitar escrituras por historial de sesión que su test actual
RECHAZA explícitamente ("una segunda escritura directa no debe rechazarse solo
por el historial"). No copiar reglas ajenas sin comprobar si siguen vigentes:
restringir invariantes reales del dominio, no restricciones arbitrarias.
