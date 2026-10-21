# Contrato de fases v1

**Decisión del creador (2026-10-21):** el runtime usa 7 fases con IDs semánticos. Las 5 fases
editoriales de `AGENTS.md` §05 del repo de referencia quedan como vista que agrupa a estas 7.
El runtime nunca deduce la fase a partir del prefijo de un archivo.

## Fases

| ID | Fase | Prerrequisito | Documentos (y secciones) cuyas huellas se aprueban | Evidencia declarada | Checks requeridos | Checkpoint humano |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| `P01_PACKAGING` | Packaging | — | `01-packaging.md` completo | — | — | Aprobado por creador |
| `P02_RESEARCH` | Investigación previa | `P01` | `06-fuentes-y-verificacion.md`: encabezado (régimen, riesgo) + "Parte 1" | — | — | Verificado |
| `P03_SCRIPT` | Guion y originalidad | `P02` | `02-guion.md` completo | — | `script_block_ids` | Aprobado por creador |
| `P04_FACTCHECK` | Fact-checking del borrador | `P03` | `06-fuentes-y-verificacion.md`: "Parte 2" + "Checkpoints de Rigor" | — | `factcheck_resolved` | Verificado |
| `P05_ANIMATIC` | Animatic y scratch | `P04` | `03-storyboard-y-edicion.md`: "Consistencia Visual" + "Montaje Preliminar" | `scratch_track` (audio) | — | Aprobado por creador |
| `P06_ASSEMBLY` | Montaje y licencias | `P05` | `03-storyboard-y-edicion.md`: "Tabla de Escenas" + "Capas Obligatorias"; `04-registro-recursos.md` completo | `master` (video), `acceptance_sheet` | `script_storyboard_ids`, `master_measurement` | Inspeccionado |
| `P07_CLOSE` | Publicación y cierre | `P06` | `05-metricas-retencion.md` completo; `entregable-final.md` completo | — | — | Publicado en Studio |

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

## Supuestos pendientes de validación del creador

1. **Orden lineal 01→07** tal como lo trae la tabla de la plantilla. Hoy la investigación (`P02`)
   espera a que el packaging esté aprobado.
2. **`entregable-final.md`** lo exige la tabla de `00-estado-produccion.md`, pero no forma parte de
   la suite 00→06 ni existe como plantilla.
3. **El reparto de `03-storyboard-y-edicion.md`** entre `P05` y `P06` (secciones 1-2 frente a 3-4).
4. **Los checks por fase** son el mínimo de v1; `script_block_ids`, `factcheck_resolved`,
   `script_storyboard_ids` y `master_measurement` todavía no están implementados, así que esas
   fases no pueden enviarse hasta que existan (cerrado por defecto).
