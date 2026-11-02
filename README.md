# youtube-shell

Agente de producción de video empaquetado como paquete para [pi](https://github.com/earendil-works/pi).

Tu agente produce videos y después olvida todo: no tiene opinión sobre tu canal y no puede
probar qué hizo más allá de pedirte que revises cada frame. `youtube-shell` le da memoria,
pipeline y evidencia: las fases de producción se controlan en el runtime, las aprobaciones son
solo del creador y quedan atadas a huellas SHA-256 de lo aprobado, y el master se mide contra
una hoja de aceptación escrita antes del render.

## Instalación y uso sobre `pi`

Distribución privada por repositorio Git o ruta local (`"private": true`, no listado en `pi.dev/packages`):

```bash
# Enlazar el comando `youtube-shell` globalmente en tu máquina (crea symlink en ~/.local/bin/youtube-shell)
npm link

# Lanzar directamente en cualquier carpeta de video (home aislado en ~/.youtube-shell/agent)
youtube-shell

# O instalar como paquete desde GitHub sobre pi
pi install git:github.com/albertopo94/youtube-shell
```

### Comandos exclusivos del creador (UI de `pi`)
- `/yts-init`: inicializa las 8 plantillas canónicas (`00`..`06` + `entregable-final.md`), autodetecta el vínculo con la oficina/canal si existe y crea `.youtube-shell/registro.json` en la carpeta actual.
- `/yts-status`: muestra y refresca el resumen de las 7 fases y la siguiente acción permitida.
- `/yts-link <ruta-oficina> [ruta-canal]` (o `/yts-link auto`): vincula la carpeta del video con la oficina (`ideas.md`, `referentes.md`, `banco-visual.md`) y el directorio del canal (`backlog-ideas.md`, `banco-de-titulos.md`).
- `/yts-approve-sheet [ruta-json]`: aprueba criptográficamente la hoja de aceptación previa al render (`aceptacion.json`), registrando su huella SHA-256 y el actor creador en `.youtube-shell/registro.json` antes de validar el master en `P06_ASSEMBLY`.
- `/yts-approve <FASE> [--ack-warn] [nota]`: aprueba una fase en `PENDIENTE_APROBACION`, sellando las huellas SHA-256 de sus artefactos y sincronizando la vista `00-estado-produccion.md`.
- `/yts-reject <FASE> <nota>`: devuelve una fase pendiente a `EN_CURSO` con observaciones.
- `/yts-audit [run-id]`: inspecciona la bitácora de aseguramiento de la última corrida (o de un `run-id` específico) en `.youtube-shell/runs/<run-id>/`, mostrando veredicto global (`NOT_APPLICABLE`, `PASSED`, `FAILED`, `BLOCKED`, `DEGRADED`, `PARTIAL`, `COMPLETED_UNVERIFIED`, `ABORTED`), atestación de contexto (entrega en prompt vs. lectura observada por `read`), herramientas y checks ejecutados, e incidentes.
- `/yts-runs`: lista el historial de corridas registradas en `.youtube-shell/runs/` con su estado, modo, fase activa y veredicto.

### Herramientas expuestas al modelo
- `yts_status`: estado determinista de las 7 fases (`P01_PACKAGING`..`P07_CLOSE`) y siguiente acción permitida.
- `yts_transition`: solicita transiciones operativas (`start`, `submit`, `block`, `unblock`, `reopen`) verificando automáticamente el contrato sobre disco.
- `yts_check_contract`: verificador determinista del contrato de archivos, estados normalizados, estructura de packaging (`packaging_structure`), fuentes de investigación (`research_sources_structure`), bloques `[Bxx]` y puerta editorial (`script_block_ids`), fact-checking (`factcheck_resolved`), correspondencia de storyboard (`script_storyboard_ids`), licencias de recursos (`resource_license_log`) y entregables de cierre (`close_deliverables`).
- `yts_measure_master`: mide el archivo master con `ffprobe`/`ffmpeg` (`loudnorm`, `blackdetect`, `silencedetect`, cortes de escena) contra una hoja de aceptación fechada y aprobada antes del render (`PASS | FAIL | WARN | NOT_EVALUABLE`).

### Skills incluidas y referencias normativas
- `yts-orquestador` (`GLOBAL`, `P07_CLOSE`, más `references/contingencia-y-politicas-sensibles.md` y `references/herramientas-y-apis.md`)
- `yts-investigacion-ideas` (`P02_RESEARCH`)
- `yts-packaging-miniaturas` (`P01_PACKAGING`)
- `yts-guion-narrativa` (`P03_SCRIPT`, `P04_FACTCHECK`)
- `yts-direccion-edicion` (`P05_ANIMATIC`, `P06_ASSEMBLY`, `P07_CLOSE`)

## Flujo de producción audiovisual y gobierno en tiempo de ejecución

Cada turno del creador pasa por el clasificador y resolvedor de 3 capas ([`src/core/context-resolver.ts`](src/core/context-resolver.ts)), la compuerta de herramientas ([`src/gate/pi-extension.ts`](src/gate/pi-extension.ts)) y la máquina de estados ([`src/core/machine.ts`](src/core/machine.ts)). También podés consultar la versión visual en [`mermaid-diagram.png`](mermaid-diagram.png).

```mermaid
flowchart TD
    req["Petición del creador"] --> mode{"¿Qué tipo de trabajo es?"}

    mode -- "Consulta o auditoría" --> ro["Ruta de solo lectura<br/>(sin mutación de artefactos)"]
    ro --> ro_out["Respuesta con evidencia y límites"]

    mode -- "Producir o reanudar" --> link["Vincular oficina, canal y vídeo<br/>(/yts-init auto o /yts-link)"]
    link --> reg["Leer registro real y evaluar fases<br/>(.youtube-shell/registro.json)"]
    reg --> ctx["Resolver fase, skill y reglas aplicables<br/>(Prompt en 3 capas: Orquestador + Playbook + Referencias)"]
    ctx --> prereq["Comprobar prerrequisitos y herramientas permitidas<br/>(bloqueo de bash y escritura fuera de sección)"]
    prereq --> work["Ejecutar trabajo de la fase<br/>(P01..P07)"]
    work --> review["Revisar entregables y recoger evidencia<br/>(huellas SHA-256 por sección/archivo)"]
    review --> checks["Verificadores deterministas y revisión editorial<br/>(checkVideoContract + ffprobe/ffmpeg + /yts-approve-sheet)"]
    checks --> valid{"¿Salida válida?"}

    valid -- "No" --> defect["Informar defectos; corregir o bloquear<br/>(FAIL / NOT_EVALUABLE detienen submit)"]
    defect --> work

    valid -- "Sí" --> submit["Enviar a revisión<br/>(yts_transition submit → PENDIENTE_APROBACION)"]
    submit --> human["Creador inspecciona y decide<br/>(/yts-approve o /yts-reject en UI)"]

    human -- "Rechaza (/yts-reject)" --> defect
    human -- "Aprueba (/yts-approve)" --> seal["Guardar actor, versión y huellas SHA-256<br/>(sincroniza 00-estado-produccion.md)"]
    seal --> final{"¿Fase final (P07_CLOSE)?"}

    final -- "No" --> reg
    final -- "Sí" --> pub["Publicación y archivo bajo control humano<br/>(videos-publicados/ + entregable-final.md)"]
    pub --> metrics["Registrar métricas y aprendizajes del canal<br/>(05-metricas-retencion.md)"]
    metrics --> next["Alimentar la siguiente producción<br/>(ideas.md / backlog-ideas.md / banco-de-titulos.md)"]
```

| Etapa del flujo | Implementación en `youtube-shell` |
|---|---|
| **¿Qué tipo de trabajo es?** | `classifyWorkMode()` en [`src/core/context-resolver.ts`](src/core/context-resolver.ts) separa consultas/auditorías (`read_only`) de producción (`production`), y [`src/gate/pi-extension.ts`](src/gate/pi-extension.ts) bloquea estructuralmente `write`, `edit` y `yts_transition` durante turnos `read_only`. |
| **Vincular oficina, canal y vídeo** | `detectWorkspaceLink()` en `/yts-init` o explícitamente con `/yts-link <oficina> [canal]`. |
| **Resolver fase, skill y reglas** | `buildThreeLayerPrompt()` inyecta Capa 1 (Orquestador), Capa 2 (`PHASE_PLAYBOOKS` con referencias obligatorias/condicionales/opcionales, evidencia en el entregable y frontera Runtime vs. Editorial) y Capa 3 (referencias bajo demanda). |
| **Política de referencias en 4 niveles** | `buildContextAttestation()` registra cada archivo como atestación independiente (`targetFile`, `exists`, `sha256`, `readByAgent`, `readScope`) y `evaluateRunAssurance()` la exige: **obligatoria** → debe existir y constar su lectura completa antes del `submit`; **condicional aplicable** → debe existir y leerse cuando se activa su condición; **condicional no aplicable** → queda registrado por qué no aplica; **opcional** → disponible sin bloquear la aprobación. Una lectura con `offset`/`limit` que no cubre el archivo entero queda como `readScope: "partial"` y nunca certifica lectura. |
| **Evidencia de aplicación en el entregable** | `inspectDeliverableApplicationEvidence()` contrasta el entregable de la fase contra su contenido real (títulos con palanca, fuentes con URL/DOI, bloques `[Bxx]`, licencias, metadata publicada) y rechaza marcadores de plantilla (`[Insertar...]`, `...`, `TBD`, `← derivar`). Una plantilla intacta nunca produce `verified: true`; si falta al enviar en producción, la corrida cierra `DEGRADED`, jamás `PASSED`. |
| **Verificadores deterministas** | `yts_transition(submit)` ejecuta automáticamente `checkVideoContract()` y, en `P06_ASSEMBLY`, `measureMasterFile()` + verificación SHA-256 de `/yts-approve-sheet`. |
| **Creador inspecciona y decide** | Solo los comandos humanos `/yts-approve`, `/yts-reject` y `/yts-approve-sheet` con confirmación en UI pueden sellar aprobaciones. |

## Verificación y seguimiento de upstreams

```bash
npm test              # Suite completa (157 tests, 0 dependencias)
npm run smoke         # Smoke test de punta a punta (P01 -> P07 + medición ffmpeg)
npm run engines:surface   # Superficie MCP real de filmcraft/effectcraft/soundcraft vs upstream-lock.json (correrlo tras actualizar los CLIs)
npm run upstreams:check  # Verifica si albertopo94/youtube o earendil-works/pi avanzaron (también en .github/workflows/upstreams.yml)
```

## Estado actual y próximos pasos (Roadmap)

**Dónde estamos (`v0.15.0`):** los hitos del MVP más el lanzador CLI `youtube-shell` (`bin/youtube-shell.mjs` con pre-flight de integridad del paquete y banderas `--runs` y `--audit [run-id]`), el panel visual TUI de las 7 fases, el bloqueo operativo real en modo `read_only`, la matriz de trazabilidad del conocimiento con inventario completo, verificación semántica de skills y 53 aprendizajes atómicos etiquetados por `guarantee_level`, `source_sha256` y `consumer_sha256` ([`framework-map.json`](framework-map.json)), el resolvedor de contexto en 3 capas con políticas de referencia por fase (`src/core/context-resolver.ts`), la capa completa de **Observabilidad y Aseguramiento de Ejecución** (`src/core/assurance.ts`, `src/store/run-ledger.ts`, `.youtube-shell/runs/<run-id>/`, `/yts-audit`, `/yts-runs`, `--audit`, `--runs`, verificación de lectura real `readByAgent`, evidencia de aplicación en entregables, control reforzado por riesgo factual `ALTO` y los 9 escenarios deterministas E2E en `test/assurance-harness.test.ts`), el comando `/yts-link`, los 4 modos de producción polimórficos (`Audio-First`, `Screen-First`, `Speaker-First`, `Music-First`), las puertas de salida por fase (`packaging_structure`, `research_sources_structure`, `script_block_ids`, `factcheck_resolved`, `script_storyboard_ids`, `resource_license_log`, `close_deliverables`), el verificador de integridad del framework (`checkFrameworkIntegrity`), la aprobación criptográfica de la hoja pre-render (`/yts-approve-sheet`), el catálogo completo de capacidades y guardas para los motores de medios FilmCraft, EffectCraft y SoundCraft, y los workflows de CI (`.github/workflows/ci.yml` y `.github/workflows/upstreams.yml`) están implementados y verificados con 157 tests (`npm test` y `npm run smoke`), con las versiones de referencia fijadas en [`upstream-lock.json`](upstream-lock.json):
- `albertopo94/youtube` en `7ff07e0` (`v0.7.2-alineacion-epistemica-y-criterio-outliers`: las 8 plantillas canónicas espejadas sin deriva incluyendo `entregable-final.md`, verificador de contrato endurecido con 12 fixtures `f0..f11` y validación de `registro-tecnicas.md`, separación de formato vs. riesgo factual, audio adaptable al formato con sonoridad en el master, método agnóstico de proveedores, *Puerta de Correspondencia del Arranque*, marco de gobernanza de evidencia y detección de outliers por mediana reciente con el ratio visitas/suscriptores como señal auxiliar).
- `earendil-works/pi` en `v1.4.0` (`4a08025`: auditada retrocompatible en todas las 14 APIs de extensiones consumidas).
- `storytold/filmcraft` en `0.15.0` (`94ceaa9`), `storytold/effectcraft` en `0.19.0` (`afa3c93`) y `storytold/soundcraft` en `0.15.0` (`a97ce75`), con la superficie MCP gobernada fijada por hash (`reviewed.mcp_surface_sha256`): la guarda compara las tools que el motor realmente expone contra `src/gate/capabilities.ts`, no el número de versión, así que actualizar los CLIs del estudio no rompe nada.

**Cierre de la auditoría externa 12 (`v0.12.0`):** las skills de rol incorporan el criterio de outliers por mediana reciente (con el ratio como dato auxiliar), la caja de 5 técnicas de apertura y el *Roadmap de Compromiso Mental* condicionados por formato, y la caja completa de palancas de título; `master_measurement` reporta además el segmento más largo detectado y puede exigir `pacing.maxShotSec`, declarando que la detección de cortes de FFmpeg es un indicador aproximado y que la regla ≤5 s por plano queda en revisión editorial; y [`framework-map.json`](framework-map.json) suma un registro de 53 aprendizajes atómicos (`atomic_learnings`) con fuente, principio, destino, activación, aplicación, evidencia y estado, verificado por tests que además exigen que cada aprendizaje active en una fase cuyo playbook carga esa skill.

**Qué sigue en la próxima sesión (detalle en [docs/progreso.md](docs/progreso.md)):**
1. Probar una sesión interactiva en vivo ejecutando `youtube-shell` sobre una carpeta de video de prueba (`/yts-init` → `yts_transition` → `/yts-approve`).
2. Ejecutar la primera producción real con hoja de aceptación pre-render cuando se reactive un canal o video en `albertopo94/youtube`.

Contexto en [docs/brief-lector.md](docs/brief-lector.md), diseño de controles en [docs/diseno-controles-v01.md](docs/diseno-controles-v01.md), contrato de fases en [docs/contrato-fases-v1.md](docs/contrato-fases-v1.md), progreso y roadmap en [docs/progreso.md](docs/progreso.md) y procedencia de upstreams en [docs/upstreams.md](docs/upstreams.md).
