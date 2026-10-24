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

## Verificación y seguimiento de upstreams

```bash
npm test              # Suite completa (102 tests, 0 dependencias)
npm run smoke         # Smoke test de punta a punta (P01 -> P07 + medición ffmpeg)
npm run upstreams:check  # Verifica si albertopo94/youtube o earendil-works/pi avanzaron
```

## Estado actual y próximos pasos (Roadmap)

**Dónde estamos (`v0.7.0`):** los hitos del MVP más el lanzador CLI `youtube-shell` (`bin/youtube-shell.mjs`), el panel visual TUI de las 7 fases, la matriz de trazabilidad del conocimiento ([`framework-map.json`](framework-map.json)), el resolvedor de contexto en 3 capas (`src/core/context-resolver.ts`), el comando `/yts-link`, las puertas de salida por fase (`packaging_structure`, `research_sources_structure`, `script_block_ids`, `factcheck_resolved`, `script_storyboard_ids`, `resource_license_log`, `close_deliverables`) y la aprobación criptográfica de la hoja pre-render (`/yts-approve-sheet`) están implementados y verificados con 102 tests (`npm test` y `npm run smoke`), con las versiones de referencia fijadas en [`upstream-lock.json`](upstream-lock.json):
- `albertopo94/youtube` en `13d06b2` (`v0.5.14-consumer-compatibility-record`: las 8 plantillas canónicas espejadas sin deriva incluyendo `entregable-final.md`, verificador de contrato endurecido con 10 fixtures y validación contextual de `PUBLICADO` en `videos-publicados/`, separación de formato vs. riesgo factual, audio adaptable al formato con sonoridad en el master, método agnóstico de proveedores y *Puerta de Correspondencia del Arranque*).
- `earendil-works/pi` en `v1.3.0` (`71023ae`, con `v1.4.0` registrado en `latest_seen` pendiente de revisión).

**Qué sigue en la próxima sesión (detalle en [docs/progreso.md](docs/progreso.md)):**
1. Probar una sesión interactiva en vivo ejecutando `youtube-shell` sobre una carpeta de video de prueba (`/yts-init` → `yts_transition` → `/yts-approve`).
2. Revisar el diff de `earendil-works/pi` `v1.3.0 → v1.4.0` detectado por `npm run upstreams:check` y promover `upstreams.pi.reviewed` en `upstream-lock.json`.
3. Inventariar e integrar `effectcraft-cli` y `soundcraft-cli` MCP en el catálogo de capacidades de `P06_ASSEMBLY`.
4. Ejecutar la primera producción real con hoja de aceptación pre-render cuando se reactive un canal o video en `albertopo94/youtube`.

Contexto en [docs/brief-lector.md](docs/brief-lector.md), diseño de controles en [docs/diseno-controles-v01.md](docs/diseno-controles-v01.md), contrato de fases en [docs/contrato-fases-v1.md](docs/contrato-fases-v1.md), progreso y roadmap en [docs/progreso.md](docs/progreso.md) y procedencia de upstreams en [docs/upstreams.md](docs/upstreams.md).
