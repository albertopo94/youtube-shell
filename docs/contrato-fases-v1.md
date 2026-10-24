# Contrato de fases v1

**Decisión del creador (2026-10-21):** el runtime usa 7 fases con IDs semánticos. Las 5 fases
editoriales de `AGENTS.md` §05 del repo de referencia quedan como vista que agrupa a estas 7.
El runtime nunca deduce la fase a partir del prefijo de un archivo.

## Fases

| ID | Fase | Prerrequisito | Documentos (y secciones) cuyas huellas se aprueban | Evidencia declarada | Checks requeridos | Checkpoint humano |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| `P01_PACKAGING` | Packaging | — | `01-packaging.md` completo | — | `packaging_structure` | Aprobado por creador |
| `P02_RESEARCH` | Investigación previa | `P01` | `06-fuentes-y-verificacion.md`: encabezado (régimen, riesgo) + "Parte 1" | — | `research_sources_structure` | Verificado |
| `P03_SCRIPT` | Guion y originalidad | `P02` | `02-guion.md` completo | — | `script_block_ids` | Aprobado por creador |
| `P04_FACTCHECK` | Fact-checking del borrador | `P03` | `06-fuentes-y-verificacion.md`: "Parte 2" + "Checkpoints de Rigor" | — | `factcheck_resolved` | Verificado |
| `P05_ANIMATIC` | Animatic y scratch | `P04` | `03-storyboard-y-edicion.md`: "Consistencia Visual" + "Montaje Preliminar" | `scratch_track` (audio) | — | Aprobado por creador |
| `P06_ASSEMBLY` | Montaje y licencias | `P05` | `03-storyboard-y-edicion.md`: "Tabla de Escenas" + "Capas Obligatorias"; `04-registro-recursos.md` completo | `master` (video), `acceptance_sheet` | `script_storyboard_ids`, `resource_license_log`, `master_measurement` | Inspeccionado |
| `P07_CLOSE` | Publicación y cierre | `P06` | `05-metricas-retencion.md` completo; `entregable-final.md` completo | — | `close_deliverables` | Publicado en Studio |

`00-estado-produccion.md` es la **vista legible** del estado; no es artefacto de ninguna fase ni
fuente de autoridad. La autoridad vive en `.youtube-shell/registro.json` dentro de la carpeta del
video, escrito solo por el runtime.

## Por qué se aprueban secciones y no siempre archivos enteros

`06-fuentes-y-verificacion.md` lo comparten `P02` (Parte 1) y `P04` (Parte 2), y
`03-storyboard-y-edicion.md` lo comparten `P05` (animatic) y `P06` (tabla de escenas). Si la huella
fuera del archivo entero, completar la Parte 2 durante el fact-check dejaría obsoleta la
investigación aprobada, y en cascada todo lo posterior. Con huellas por sección, cada fase solo
queda obsoleta cuando cambia lo que se aprobó en ella.

## Transiciones

```text
NO_INICIADO          -> EN_CURSO               agente; prerrequisitos aprobados y vigentes
EN_CURSO             -> BLOQUEADO              agente; motivo obligatorio
BLOQUEADO            -> EN_CURSO               agente; resolución obligatoria
EN_CURSO             -> PENDIENTE_APROBACION   runtime; documentos presentes, evidencia válida, checks sin FAIL ni NOT_EVALUABLE
PENDIENTE_APROBACION -> PENDIENTE_APROBACION   reenvío tras cambios, mismas condiciones
PENDIENTE_APROBACION -> APROBADO               solo creador; huellas sin cambios desde el envío; los WARN se reconocen expresamente
PENDIENTE_APROBACION -> EN_CURSO               solo creador; pide cambios con nota
APROBADO             -> OBSOLETO (derivado)    cambió una huella aprobada o un prerrequisito dejó de estar aprobado
OBSOLETO             -> EN_CURSO               reapertura con motivo; se conserva el historial
APROBADO             -> EN_CURSO               solo creador; revoca con motivo
```

**Política de dependencias v1:** una fase aprobada cuyo prerrequisito no está aprobado y vigente
queda `OBSOLETO` (en cascada). Es la regla más estricta posible; se relaja solo con evidencia de
que bloquea trabajo legítimo.

**`WARN`** no bloquea el envío, pero el creador tiene que reconocerlo expresamente al aprobar: un
`WARN` nunca equivale en silencio a `PASS`. **`NOT_EVALUABLE`** (incluido un check que todavía no
existe) bloquea el envío: "no pude comprobarlo" nunca se convierte en "permitido".

## Decisiones y verificadores del contrato v1

1. **Orden lineal `P01_PACKAGING` → `P07_CLOSE`** tal como lo trae la tabla de la plantilla. La
   investigación (`P02_RESEARCH`) espera a que el packaging esté aprobado y con huella vigente.
2. **`entregable-final.md`** se espeja byte a byte en
   `templates/pipeline-video/entregable-final.md` desde
   `_framework/plantillas/entregable-final-template.md` del repositorio upstream (registrado en
   `upstream-lock.json`) y es creado automáticamente por `/yts-init` (`scaffoldVideoDir`).
3. **Reparto de archivos compartidos por sección:** `06-fuentes-y-verificacion.md` se reparte entre
   `P02_RESEARCH` (encabezado + "Parte 1") y `P04_FACTCHECK` ("Parte 2" + "Checkpoints de Rigor"), y
   `03-storyboard-y-edicion.md` se reparte entre `P05_ANIMATIC` ("Consistencia Visual" + "Montaje
   Preliminar") y `P06_ASSEMBLY` ("Tabla de Escenas" + "Capas Obligatorias").
4. **Checks automáticos de fase ejecutados exclusivamente por el runtime:**
   `packaging_structure`, `research_sources_structure`, `script_block_ids`, `factcheck_resolved`,
   `script_storyboard_ids`, `resource_license_log` y `close_deliverables`
   (`src/checks/contract-checker.ts`), así como `master_measurement`
   (`src/checks/media-measurement.ts`), son calculados directamente sobre el disco por el runtime al
   ejecutar `yts_transition(submit)` y sellados con `verifiedBy: "runtime"`. El agente no puede
   inyectar ni sustituir resultados de checks.
5. **Aprobación criptográfica de la hoja de aceptación pre-render (`/yts-approve-sheet`):**
   durante `P06_ASSEMBLY`, el agente puede preparar `aceptacion.json` (`*.acceptance.json`), pero
   `master_measurement` exige que el creador haya aprobado esa hoja con `/yts-approve-sheet`
   antes de enviar la fase. El runtime registra `acceptanceSheetApproval` (`path`, `sha256`,
   `approvedAt`, `actor: creator`) en `.youtube-shell/registro.json` y rechaza `submit` si la hoja
   no fue aprobada por el creador o si cambió en disco tras su aprobación.
6. **Enrutamiento en 3 capas y vínculo de oficina/canal (`src/core/context-resolver.ts` y `/yts-link`):**
   `before_agent_start` clasifica cada turno en modo `read_only` (consulta/auditoría) o
   `production` e inyecta el prompt estructurado en 3 capas: Capa 1 (Orquestador Permanente),
   Capa 2 (Playbook de la Fase Activa y superficie editable) y Capa 3 (Referencias bajo demanda y
   vínculo con la oficina/canal en `reg.workspaceLink`).
7. **Matriz de trazabilidad del conocimiento (`framework-map.json` y `normative_sources`):**
   cada regla del framework upstream (`AGENTS.md`, roles `01..04`,
   `contingencia-y-politicas-sensibles.md` y `herramientas-y-apis.md`) queda registrada en
   `framework-map.json` con su clasificación, fase, skill consumidora, verificador del runtime y
   tests asociados.
