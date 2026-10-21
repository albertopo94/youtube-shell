# `youtube-shell`: diseño de controles del runtime y MVP v0.1

**Estado:** propuesta técnica para revisión; todavía no es implementación ni autorización para modificar los repositorios de referencia.  
**Fecha:** 21 de octubre de 2026.  
**Decisión de producto preservada:** paquete instalable de Pi, repo nuevo, presupuesto incremental de 0 €, repositorio `albertopo94/youtube` intacto.

## 1. Decisión central

`youtube-shell` no debe intentar conseguir seguridad escribiendo un prompt más largo. Debe convertir un conjunto pequeño de reglas objetivas en controles ejecutados por el runtime:

1. **El modelo propone la operación.**
2. **El runtime comprueba si está permitida ahora, para esta fase, con esta evidencia y en esta ruta.**
3. **Una herramienta determinista valida el resultado cuando existe una propiedad medible.**
4. **El creador decide las aprobaciones creativas, las excepciones de criterio y las acciones irreversibles.**
5. **El runtime registra qué ocurrió y qué evidencia respalda la decisión.**

La regla de diseño es: **el modelo puede redactar un estado, pero no puede concederse a sí mismo autoridad para cambiarlo a aprobado**.

## 2. Qué revela el código de referencia

### 2.1 Pi expone un punto real de interceptación

La documentación de extensiones de Pi dice que `tool_call` se ejecuta por cada llamada y permite modificar la entrada o bloquear la ejecución. `before_agent_start` sirve para preparar el prompt y las herramientas disponibles. `setActiveTools` permite reducir las herramientas que el modelo ve en esa sesión.

- API y ciclo de vida: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md
- Distribución de paquetes: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md

Esto permite imponer controles **en la frontera de llamada a herramienta**: la herramienta bloqueada no llega a ejecutarse si el hook devuelve una denegación válida. No convierte por sí solo una extensión en un sandbox del sistema operativo: una extensión se ejecuta con los permisos del proceso Pi.

### 2.2 Qué sí reutilizar de Gentle-Shell

Hay patrones útiles en su código actual:

- `extensions/child-safety.ts` bloquea comandos destructivos reconocidos cuando los ejecuta un agente hijo: https://github.com/Gentleman-Programming/gentle-shell/blob/main/extensions/child-safety.ts
- `lib/verifier-admission.ts` deniega un lanzamiento de verificador cuando faltan los requisitos objetivos para admitirlo: https://github.com/Gentleman-Programming/gentle-shell/blob/main/lib/verifier-admission.ts
- `lib/destructive-command-guard.ts` documenta expresamente que su análisis de comandos reconoce formas concretas; **no es un intérprete completo de shell ni un sandbox**: https://github.com/Gentleman-Programming/gentle-shell/blob/main/lib/destructive-command-guard.ts
- Los tests del runtime ejercitan el hook y sus resultados: https://github.com/Gentleman-Programming/gentle-shell/blob/main/tests/runtime-harness.mjs

El patrón que interesa es: **regla acotada + decisión en runtime + denegación explicativa + prueba de que la operación no ocurrió**.

### 2.3 Una advertencia importante: no copiar la máquina de fases visual de Gentle-Shell

En `lib/odd-phase.ts`, la fase ODD se describe como una señal para la etiqueta visual del prompt, alimentada por inferencia de actividad y por informes del orquestador. No es, por sí misma, una autorización fuerte para operar.

También hubo un intento histórico de bloquear la segunda escritura directa a un archivo distinto basándose en el historial de escrituras. La tarea histórica está documentada en https://github.com/Gentleman-Programming/gentle-shell/blob/main/odd/tasks/odd-runtime-delegation-gate.md, pero el test actual en `main` se titula **“a second direct file is not refused based on session write history”**: https://github.com/Gentleman-Programming/gentle-shell/blob/main/tests/odd-runtime-delegation-gate.test.ts. Por tanto, no debemos tratar aquella política de conteo de archivos como el patrón vigente a copiar. Es una lección: una inferencia de proceso que no demuestra una condición de negocio puede bloquear trabajo legítimo.

`youtube-shell` debe validar invariantes reales de producción —fase, artefactos requeridos, huellas de contenido, mediciones, consentimiento— y no usar heurísticas como “ya editaste dos archivos, así que debes delegar”.

## 3. Modelo de autoridad: cuatro tipos de decisión

| Tipo | Ejemplos | Autoridad de decisión | Automatización adecuada |
|---|---|---|---|
| Estructural | existe el guion; los IDs de bloque coinciden; hay un informe de medición | Runtime/verificador | Determinista: pasa, falla o no evaluable |
| Operacional | se permite editar el guion en esta fase; se permite invocar el render | Runtime | Política por fase y herramienta; denegación antes del efecto |
| Semántica/editorial | el guion es original, la promesa se cumple, el título es bueno | Modelo + revisión humana según el nivel configurado | Checklist asistida; no fingir certeza mecánica |
| Autoridad humana | aprobar packaging, aprobar guion, publicar, pagar, borrar irreversiblemente | Creador | Acción explícita de UI/comando humano y registro de aprobación |

Una casilla marcada en Markdown, una respuesta del modelo que diga “aprobado” o un informe escrito por la misma herramienta que ejecutó la operación **no equivalen** a evidencia independiente.

## 4. No confundir documentos canónicos con fases

La plantilla actual tiene siete documentos canónicos `00..06`, pero la tabla de producción describe siete fases reales `01..07`. `00-estado-produccion.md` funciona como manifiesto/control de la producción; no debe confundirse con una fase editorial. La máquina de estados debe usar identificadores estables semánticos —por ejemplo, `P01_PACKAGING`— en lugar de deducir la fase a partir del prefijo del archivo.

Fases de referencia extraídas de la plantilla de `youtube`:

| ID runtime | Fase editorial | Entregable principal | Puerta de salida propuesta |
|---|---|---|---|
| `P01_PACKAGING` | Packaging | `01-packaging.md` | Checklist estructural completo + aprobación del creador |
| `P02_RESEARCH` | Investigación previa | Parte 1 de `06-fuentes-y-verificacion.md` | Fuentes y afirmaciones iniciales registradas; N/A explícito cuando corresponda |
| `P03_SCRIPT` | Guion y originalidad | `02-guion.md` | IDs de bloque válidos, campos mínimos y revisión/aprobación creativa |
| `P04_FACTCHECK` | Fact-checking del borrador | Parte 2 de `06-fuentes-y-verificacion.md` | Afirmaciones y fuentes asociadas; no confundir completitud con veracidad demostrada |
| `P05_ANIMATIC` | Animatic y scratch | Animatic/storyboard + scratch track | Evidencia localizable y checkpoint humano |
| `P06_ASSEMBLY` | Montaje y licencias | Master candidato + `04-registro-recursos.md` | Licencias documentadas, export reproducible y medición técnica aprobada |
| `P07_CLOSE` | Publicación y cierre | `05-metricas-retencion.md` + registro de entrega | Publicación solo tras consentimiento explícito; cierre con evidencia |

El orden anterior refleja la tabla de la plantilla. Si en el futuro se desean tareas paralelas —por ejemplo, investigar mientras se prueban títulos— se modelará como una dependencia declarada, no mediante excepciones improvisadas del agente.

> ⚠️ **Corrección de esta tabla (verificada 2026-10-21):** `AGENTS.md` §05 define
> **cinco** fases editoriales (`Fase Packaging`, `Fase Guion`, `Fase Animatic`,
> `Fase Producción y Edición`, `Fase Auditoría Legal`) y la plantilla
> `00-estado-produccion.md` nombra una sección "Fase 06" de verificación del
> render. El doc original proponía **siete** fases `P01..P07` — una desagregación
> más fina (investigación y fact-checking separadas de guion, montaje separado
> de publicación). Esa desagregación es **válida y coherente con la tabla de
> producción del framework**, pero no es la que usa `AGENTS.md`. El paso 1 de la
> secuencia del doc ("Fijar el vocabulario del contrato") es precisamente
> decidir cuál de las dos se adopta: o se alinean las 5 fases de `AGENTS.md` con
> los 7 IDs del runtime, o se mantiene la desagregación del doc y se actualiza
> `AGENTS.md`. **Decisión del creador** — no se impone aquí. Mientras tanto,
> los dos esquemas coexisten y el runtime no debe deducir la fase a partir del
> prefijo del archivo (como dice el punto 1 del doc).

## 5. Máquina de estados propuesta

### 5.1 Estados visibles

Conservar inicialmente el vocabulario ya usado en `youtube`:

- `NO_INICIADO`
- `EN_CURSO`
- `BLOQUEADO`
- `PENDIENTE_APROBACION`
- `APROBADO`

El runtime puede calcular además un estado efectivo `OBSOLETO` cuando cambia un artefacto aprobado. No hace falta permitir que el modelo lo escriba: se deriva comparando huellas actuales con las aprobadas.

### 5.2 Transiciones permitidas

```text
NO_INICIADO -> EN_CURSO
EN_CURSO -> BLOQUEADO
BLOQUEADO -> EN_CURSO              (tras resolver/registrar el motivo)
EN_CURSO -> PENDIENTE_APROBACION   (solo si los checks automáticos requeridos pasan)
PENDIENTE_APROBACION -> APROBADO   (solo tras acción humana explícita)
APROBADO -> OBSOLETO               (si cambia la evidencia aprobada o un validador requerido)
OBSOLETO -> EN_CURSO               (reapertura explícita, conservando el historial)
```

No debe existir una herramienta invocable por el modelo del tipo `set_status(APROBADO)`. La aprobación se realiza desde una acción de usuario de Pi, separada de las herramientas que el modelo puede invocar, con vista de los checks y evidencias que se van a aprobar.

### 5.3 Evidencia vinculada a la aprobación

Cada aprobación debe registrar al menos:

- ID de video y fase.
- Revisión de política/contrato utilizada.
- Huellas SHA-256 de los artefactos obligatorios en el momento de aprobar.
- IDs y resultados de las ejecuciones de verificación aplicables.
- Identidad del actor (`creator`) y marca temporal de la confirmación humana.
- Comentario/justificación de una excepción cuando el perfil de aceptación lo permita.

Si cambia un artefacto clave —por ejemplo, el guion después de su aprobación— la huella ya no coincide y esa fase deja de estar efectivamente aprobada. Las fases dependientes se invalidan o vuelven a requerir verificación conforme a una política de dependencias explícita.

La fuente autoritativa del estado debe ser un registro controlado por la extensión (por ejemplo, un JSON con esquema/versionado y escritura atómica), no un campo Markdown que el modelo pueda editar a voluntad. `00-estado-produccion.md` puede ser una proyección legible, pero nunca la autoridad exclusiva. Esto sigue siendo una barrera contra errores del agente, no contra un usuario o proceso hostil con los mismos permisos del sistema operativo.

## 6. Política de herramientas y fases

Cada herramienta disponible se declara en un catálogo de capacidades propio de `youtube-shell`:

```text
id exacto de herramienta
capacidad: read | research | write_artifact | render | measure | publish | delete | paid_action
fase(s) permitidas
rutas de entrada/salida permitidas
si requiere confirmación humana
método de validación posterior
estado de evidencia: documentada | probada en operación concreta
```

### Reglas mínimas

1. **Quitar herramientas no permitidas de la selección activa** cuando sea posible (`setActiveTools`). Es una reducción de superficie, no la única defensa.
2. **Volver a comprobar en `tool_call`** cada llamada sensible: estado de fase actual, capacidades, ruta canónica, aprobación vigente y consentimiento.
3. Denegar si el estado no se puede leer, el registro está corrupto o una capacidad no está catalogada. No convertir “no pude comprobarlo” en “permitido”.
4. Las llamadas a MCP se tratan como herramientas con capacidad y riesgo; no se asumen seguras por venir de MCP.
5. No interpretar texto libre del modelo como prueba de aprobación, licencia, publicación o cumplimiento.
6. Mantener las operaciones irreversibles —publicar, borrar, sobrescribir un master aprobado o consumir servicios de pago— tras una confirmación humana explícita.

### El caso especial de `bash`

No es realista prometer una restricción de rutas fiable si el modelo puede ejecutar cualquier script por `bash` con los mismos permisos del usuario. Analizar comandos con expresiones regulares puede detectar algunos casos, pero no demuestra que un comando sea inocuo; Gentle-Shell documenta expresamente esa limitación en su guard de comandos destructivos.

Para v0.1, las opciones seguras y simples son:

- no exponer shell arbitrario durante el flujo de producción controlado; o
- permitir únicamente operaciones acotadas mediante herramientas propias, con ejecutables y argumentos permitidos, rutas canónicas y validación de salida.

Para el análisis audiovisual, la extensión puede invocar `ffprobe`/`ffmpeg` mediante ejecución de proceso con argumentos separados, sin construir un comando shell a partir de una cadena del modelo. Si se decide conservar shell arbitrario, la documentación debe declarar el límite con claridad: se controla el uso normal de las herramientas conocidas, no se garantiza una barrera contra vías alternativas.

### ¿Hace falta sandbox de sistema operativo en v0.1?

No para demostrar el contrato del MVP. Primero hay que reducir las herramientas disponibles y probar la barrera a nivel de Pi. La extensión no es un sandbox del SO. Una futura modalidad de aislamiento tendría que separar realmente los permisos del proceso/agente o de sus herramientas. No vender `tool_call` como protección absoluta.

## 7. Tres piezas verificables del MVP

### 7.1 Verificador del contrato de producción

Reusar el conocimiento de `_framework/scripts/check-contrato.sh`, pero integrarlo como herramienta de diagnóstico versionada y probar/corregir sus defectos conocidos antes de confiar en su salida. En la versión inspeccionada aparecen al menos estos dos problemas que afectan a un gate real:

- La sección 2 busca una línea `Fase activa`, pero la plantilla inspeccionada usa `Estado actual` y una tabla de estados por fase. Si no encuentra `Fase activa`, `bad` queda vacío y el script informa `[OK] estado normalizado` sin haber validado de verdad ese valor.
- En el cruce guion/storyboard, un ID de bloque que falta en el storyboard genera `WARN`; como el resultado final solo devuelve error por `FAIL`, el script puede terminar con código 0 pese a que esa referencia esté incompleta.

Antes de convertirlo en puerta de aprobación hay que añadir tests de regresión para ambos casos, decidir cuáles deben ser `FAIL` y hacer que la salida y el código de salida coincidan con el contrato. También hay que reconciliar las copias de plantilla y las reglas duplicadas para que una medición o validación no dependa de qué plantilla se usó por accidente.

> ⚠️ **Actualización (2026-10-21): ambos defectos ya estaban corregidos** en este
> mismo repo antes de que el revisor los inspeccionara, en commit `a1dd403`:
> - "Fase activa" → `(Estado actual|Fase activa)` (ambas formas).
> - Bloque ausente del storyboard: `warn` → `fail`.
> - Suite de **6 fixtures con exit code explícito** (`test-check-contrato.sh`):
>   árbol válido→0; estado inválido→1; bloque faltante→1; timecodes inconsistentes→1;
>   🟢 sin operación→1; 🟢 con texto no-PROBADA→1. **6/6 verdes.**
> El documento del revisor inspeccionó el head `bc5d49b`; la corrección es posterior.
> La recomendación metodológica (fixtures con exit code) ya estaba implementada.
> Queda como abierto: portar ese verificador y su suite al repo del producto
> (paso 5 de la secuencia).

El resultado debe ser estructurado, por ejemplo:

```json
{
  "contract_version": 1,
  "result": "FAIL",
  "checks": [
    {"id": "canonical_files", "result": "PASS", "evidence": ["00-estado-produccion.md", "01-packaging.md"]},
    {"id": "script_storyboard_ids", "result": "FAIL", "details": "B04 falta en el storyboard"},
    {"id": "approval_authority", "result": "NOT_EVALUABLE", "details": "la casilla Markdown no acredita una aprobación del runtime"}
  ]
}
```

**Estados de resultado:** `PASS`, `FAIL`, `WARN`, `NOT_EVALUABLE`. Un `WARN` no debe equivaler silenciosamente a `PASS` en una puerta de fase.

Cobertura inicial: archivos requeridos, esquema/valores normalizados, IDs y timecodes entre guion/storyboard, campos obligatorios, existencia de referencias de recursos y coherencia del catálogo. Un verificador de forma no demuestra originalidad, verdad factual ni vigencia de una licencia.

### 7.2 Medición del master contra una hoja de aceptación

La medición recibe un archivo real y una hoja de aceptación explícita, versionada **antes de renderizar**. Ejecuta las herramientas locales disponibles y devuelve números, evidencia y decisión por regla.

Mediciones razonables para v0.1, según perfil:

- Lectura con `ffprobe`: duración, tamaño, resolución, tasa de fotogramas, códecs, streams, canales y frecuencia de muestreo.
- Integridad del archivo y de la decodificación.
- Sonoridad integrada, true peak y LRA mediante `loudnorm`.
- Detección de fotogramas negros y silencios largos.
- Segmentos/cambios de plano como señal de inspección de pacing, no como prueba universal de que hay movimiento visual cada X segundos.
- Existencia de archivos de audio/stems cuando el flujo los exige.

**Limitación importante:** contar streams de audio en el MP4 no demuestra cuántas pistas existían en el editor ni que el ducking estuviera bien aplicado. Si el requisito es mezcla de tres pistas, habrá que inspeccionar el proyecto/stems o una evidencia exportada del editor; el master final por sí solo puede no demostrarlo.

#### Uso correcto del piloto como fixture

La medición archivada del piloto informa una única pista AAC, −17,5 LUFS, true peak −7,3 dBTP, cero fotogramas negros y cero silencios mayores de un segundo; el propio informe indica que no se ejercitaron música, SFX, mezcla de tres pistas ni ducking.

Ese master es una **fixture de prueba útil**, no prueba retroactiva de que se incumplió una regla que aún no estaba definida al renderizar. Si una hoja de aceptación escrita previamente exige tres pistas y −23 LUFS, el resultado esperado de esa prueba negativa será `FAIL`. Sin una hoja aplicable y versionada, el resultado correcto para esas reglas sería `NOT_EVALUABLE`, nunca una sentencia inventada.

Una excepción creativa o técnica permitida debe figurar en la hoja de aceptación antes del render, con motivo y actor que la aprueba. No debe aceptarse primero un master y escribir después un estándar para declararlo conforme.

### 7.3 Control de las transiciones

El motor de estados debe dar una respuesta accionable:

```text
Operación bloqueada: no puede comenzar P03_SCRIPT.
Motivos:
- P01_PACKAGING aún no tiene aprobación humana vigente.
- Falta evidencia de P02_RESEARCH: 06-fuentes-y-verificacion.md (Parte 1).
Siguiente acción permitida: completar los artefactos pendientes y solicitar revisión.
```

La denegación la emite el runtime antes de que la llamada afecte al proyecto. Un comando “check” que el modelo puede ignorar no es una puerta.

## 8. Pruebas que deben existir antes de llamarlo «gate»

Cada regla que pretenda bloquear algo necesita una prueba positiva y una negativa que compruebe el **efecto**, no solo el mensaje.

| Escenario | Resultado esperado | Evidencia que debe comprobar el test |
|---|---|---|
| El modelo intenta escribir en una fase que no permite esa escritura | Bloqueado antes de ejecutar | No se creó ni cambió ningún archivo |
| La herramienta intenta empezar una fase con prerequisito pendiente | Bloqueado | No cambió el estado ni se inició la operación |
| La llamada está permitida y valida correctamente | Permitida | Efecto real y registro asociado |
| El agente edita un artefacto después de la aprobación | Aprobación obsoleta | La huella cambia; no se conserva autoridad anterior |
| El modelo intenta autoaprobar una fase | Bloqueado/no hay herramienta de aprobación model-callable | No se escribió aprobación; solo la acción humana puede aprobar |
| El creador cancela una aprobación sensible | Denegado | No se publicó, borró, compró ni sobrescribió nada |
| Herramienta MCP desconocida/no catalogada intenta mutar | Bloqueada hasta clasificarla | No se invocó el backend |
| Se intenta escapar del área autorizada con ruta relativa, `..` o symlink | Bloqueado | Fuera del área no cambia |
| El verificador no puede leer el archivo o el formato no se reconoce | `NOT_EVALUABLE`/bloqueo de la fase correspondiente | No se transforma una falta de prueba en `PASS` |
| Se intenta sortear la restricción usando `bash` | Bloqueado si shell arbitrario no está expuesto; si sí lo está, el límite se documenta | Test del camino alternativo, no solo del camino principal |

El harness de pruebas debe invocar el hook real de Pi y simular el efecto de la herramienta después de una respuesta `allow`; para una respuesta `block`, comprobar que el efecto no se produjo. Cuando sea posible, añadir al menos un smoke test con una sesión real de Pi y herramientas de prueba sin gasto externo.

## 9. Secuencia de construcción recomendada

No empezar por la persona, las skills ni una colección grande de integraciones. Hacer funcionar el contrato primero.

1. **Fijar el vocabulario del contrato.** Resolver la diferencia entre siete archivos canónicos `00..06` y las siete fases editoriales `01..07`; escribir dependencias por ID semántico. Comparar las plantillas canónicas y las copias de canal, y resolver contradicciones sobre fact-checking, pacing y pistas de audio antes de convertirlas en requisitos automáticos.
2. **Prototipar el motor de estados como módulo puro.** Sin Pi, MCP ni modelo: entradas explícitas, transiciones válidas, evidencia ausente y aprobación obsoleta. Probar fixtures válidas e inválidas.
3. **Implementar el registro de evidencia y aprobación humana.** Acción humana separada de las herramientas del modelo. Escritura atómica, esquema versionado y hash de artefactos.
4. **Integrar el gate en Pi.** `before_agent_start` para seleccionar herramientas; `tool_call` para denegar cada operación; registro de resultado; tool propia de estado/diagnóstico. Definir qué pasa en modo sin UI: todas las decisiones sensibles deben fallar de forma segura.
5. **Integrar el verificador del contrato.** Ejecutarlo en modo solo lectura contra fixtures derivadas de las plantillas. No editar el repo original durante este trabajo.
6. **Implementar la herramienta de medición.** Empezar por `ffprobe`/`ffmpeg`, una hoja de aceptación fijada y resultados estructurados `PASS/FAIL/WARN/NOT_EVALUABLE`.
7. **Ejercitar el control negativo del piloto.** Solo con un perfil que explícitamente exija las propiedades ausentes. No presentar esa comparación como una regla que regía retroactivamente el render original.
8. **Inventariar y conectar FilmCraft MCP.** Catalogar los nombres exactos de herramientas/operaciones y sus efectos antes de abrirles permisos. No asumir que “MCP conectado” significa “operación segura”.
9. **Empaquetar el esqueleto de Pi.** Solo cuando los gates de estado, contrato y medición demuestren su comportamiento en tests.

## 10. Entregables v0.1 y no objetivos

### Sí entra

- Paquete de Pi con una extensión que posee el estado de producción y las políticas de operación.
- Máquina de estados determinista con aprobación humana y evidencia enlazada por hashes.
- Verificador de contrato y herramienta de medición del master.
- Registro de capacidad de herramientas y conexión inicial a las operaciones de FilmCraft realmente necesarias.
- Tests unitarios, de hook real, de no-efecto al bloquear y smoke test local sin gasto.
- Skills de dominio para investigar, packaging, guion y dirección una vez que el control básico funcione.

### No entra todavía

- Runtime propio, CLI independiente o instalador complejo.
- Copiar la arquitectura entera de Gentle-Shell, su memoria externa, revisión nativa de código, sus perfiles o su interfaz.
- Sandbox de seguridad absoluta dentro de una simple extensión de Pi.
- Prueba automática de verdad factual, originalidad artística o legalidad definitiva de licencias.
- Puntuación automática universal de calidad creativa.
- Aceptación de media “calibrada por género” antes de tener criterios y ejemplos validados.
- Integraciones pagas como dependencia.

## 11. Brief breve para delegar a un agente de implementación

> Trabaja únicamente en el repositorio nuevo de `youtube-shell`. Antes de escribir código, convierte este documento en un PRD corto y una lista de especificaciones verificables. No modifiques `albertopo94/youtube`, `earendil-works/pi` ni los repos de Gentleman-Programming. Primero implementa y prueba el motor de estados sin Pi; después el registro de evidencia; solo después integra los hooks de Pi. No construyas un gate basado en número de archivos o en una fase visual. Cada denegación debe probar que no hubo efecto; cada aprobación debe proceder de una acción humana y quedar vinculada a las huellas de los artefactos. No permitas que el modelo invoque una operación genérica que lo autoapruebe. Define y prueba la ruta de `bash` y de cada herramienta MCP antes de afirmar que el gate es estructural. Para el master, exige una hoja de aceptación aprobada y fechada antes del render; separa `FAIL` de `NOT_EVALUABLE`. Trabaja con fixtures, herramientas locales y cero llamadas pagas; informa los límites que los tests no demuestren.

## 12. Fuentes revisadas

- Pi — extensiones y eventos: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md
- Pi — paquetes: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md
- Gentle-Shell — bloqueo de comandos destructivos en hijos: https://github.com/Gentleman-Programming/gentle-shell/blob/main/extensions/child-safety.ts
- Gentle-Shell — admisión de verificadores: https://github.com/Gentleman-Programming/gentle-shell/blob/main/lib/verifier-admission.ts
- Gentle-Shell — límites del guard de shell: https://github.com/Gentleman-Programming/gentle-shell/blob/main/lib/destructive-command-guard.ts
- Gentle-Shell — fase ODD como señal de etiqueta: https://github.com/Gentleman-Programming/gentle-shell/blob/main/lib/odd-phase.ts
- Gentle-Shell — test vigente sobre escrituras directas: https://github.com/Gentleman-Programming/gentle-shell/blob/main/tests/odd-runtime-delegation-gate.test.ts
- Repo de dominio — contrato de producción: https://github.com/albertopo94/youtube/blob/main/_framework/scripts/check-contrato.sh
- Repo de dominio — plantilla de estado: https://github.com/albertopo94/youtube/blob/main/_framework/plantillas/pipeline-video-template/00-estado-produccion.md
- Repo de dominio — evidencia de medición del piloto: https://github.com/albertopo94/youtube/blob/main/_framework/referencias/evidencia-piloto/medicion-master-piloto.md
