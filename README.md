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
# Instalar desde GitHub
pi install git:github.com/albertopo94/youtube-shell

# O probar directamente desde un clon local en una carpeta de video
pi -e /ruta/a/youtube-shell
```

### Comandos exclusivos del creador (UI de `pi`)
- `/yts-init`: inicializa las 7 plantillas canónicas (`00`..`06`) y `.youtube-shell/registro.json` en la carpeta actual.
- `/yts-approve <FASE> [--ack-warn] [nota]`: aprueba una fase en `PENDIENTE_APROBACION`, sellando las huellas SHA-256 de sus artefactos y sincronizando la vista `00-estado-produccion.md`.
- `/yts-reject <FASE> <nota>`: devuelve una fase pendiente a `EN_CURSO` con observaciones.

### Herramientas expuestas al modelo
- `yts_status`: estado determinista de las 7 fases (`P01_PACKAGING`..`P07_CLOSE`) y siguiente acción permitida.
- `yts_transition`: solicita transiciones operativas (`start`, `submit`, `block`, `unblock`, `reopen`) verificando automáticamente el contrato sobre disco.
- `yts_check_contract`: verificador determinista del contrato de archivos, estados normalizados, bloques `[Bxx]`, timecodes y fact-checking.
- `yts_measure_master`: mide el archivo master con `ffprobe`/`ffmpeg` (`loudnorm`, `blackdetect`, `silencedetect`, cortes de escena) contra una hoja de aceptación fechada antes del render (`PASS | FAIL | WARN | NOT_EVALUABLE`).

### Skills incluidas
- `yts-investigacion-ideas` (`P02_RESEARCH`)
- `yts-packaging-miniaturas` (`P01_PACKAGING`)
- `yts-guion-narrativa` (`P03_SCRIPT`, `P04_FACTCHECK`)
- `yts-direccion-edicion` (`P05_ANIMATIC`, `P06_ASSEMBLY`, `P07_CLOSE`)

## Verificación y seguimiento de upstreams

```bash
npm test              # Suite completa (73 tests, 0 dependencias)
npm run smoke         # Smoke test de punta a punta (P01 -> P07 + medición ffmpeg)
npm run upstreams:check  # Verifica si albertopo94/youtube o earendil-works/pi avanzaron
```

## Estado actual y próximos pasos (Roadmap)

**Dónde estamos (`v0.4.2`):** los 8 hitos del MVP están implementados y verificados con 73 tests (`npm test` y `npm run smoke`), con las versiones de referencia fijadas en [`upstream-lock.json`](upstream-lock.json) (`albertopo94/youtube` en `f552339` / `v0.3.0-tercera-revision-externa` y `earendil-works/pi` en `v1.3.0`).

**Qué sigue en la próxima sesión (detalle en [docs/progreso.md](docs/progreso.md)):**
1. Hacer `git push origin main` de los commits locales (`v0.2.0 → v0.4.2`).
2. Probar una sesión interactiva en vivo con `pi -e .` sobre una carpeta de video de prueba (`/yts-init` → `yts_transition` → `/yts-approve`).
3. Revisar el diff de `earendil-works/pi` `v1.3.0 → v1.4.0` detectado por `npm run upstreams:check`.
4. Inventariar e integrar `effectcraft-cli` y `soundcraft-cli` MCP en el catálogo de capacidades de `P06_ASSEMBLY`.

Contexto en [docs/brief-lector.md](docs/brief-lector.md), diseño de controles en [docs/diseno-controles-v01.md](docs/diseno-controles-v01.md), contrato de fases en [docs/contrato-fases-v1.md](docs/contrato-fases-v1.md), progreso y roadmap en [docs/progreso.md](docs/progreso.md) y procedencia de upstreams en [docs/upstreams.md](docs/upstreams.md).
