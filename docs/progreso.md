# Progreso y Roadmap

Orden de trabajo de [brief-lector.md §12.5](brief-lector.md). Se actualiza en cuanto cambia el estado.

## 1. Hitos del MVP (`v0.1.0` → `v0.5.0`) — Completados

- [x] **Crear el repo con README, LICENSE, créditos, PRD y brief en `docs/`** (`5a02994`)
- [x] **Fijar qué fases existen y qué aprueba cada una** — [contrato-fases-v1.md](contrato-fases-v1.md) con 7 fases semánticas (`P01_PACKAGING`..`P07_CLOSE`) validadas por el creador
- [x] **Hacer que una fase no pueda empezar sin sus prerrequisitos aprobados** — motor de estados puro, sin `pi`, con tests (`src/core/`, 29 tests)
- [x] **Hacer que solo el creador apruebe y que editar lo aprobado lo invalide** — registro `.youtube-shell/registro.json` con huellas SHA-256 por archivo/sección, escritura atómica y sincronización automática de la vista `00-estado-produccion.md` (`src/store/fs-store.ts`, 8 tests)
- [x] **Bloquear dentro de `pi` las operaciones que la fase no permite** — hooks `before_agent_start` y `tool_call`, comandos humanos `/yts-init`, `/yts-approve`, `/yts-reject` y tests de que lo denegado no tocó nada (`src/gate/`, 12 tests)
- [x] **Portar el verificador de contrato con sus fixtures** — `src/checks/contract-checker.ts`, `yts_check_contract` y fixtures `f0`..`f9` (`test/contract-checker.test.ts`, 13 tests)
- [x] **Medir el master contra una hoja de aceptación** — `src/checks/media-measurement.ts`, `yts_measure_master`, `ffprobe`/`ffmpeg` (`PASS | FAIL | WARN | NOT_EVALUABLE`, `test/media-measurement.test.ts`, 6 tests)
- [x] **Probar el caso negativo del piloto e inventariar FilmCraft MCP** — fixture negativo `PILOT_ARCHIVED_METRICS` y 17 herramientas MCP de `filmcraft-cli 0.9.0` catalogadas y acotadas por fase/ruta (`src/gate/capabilities.ts`, `test/pi-gate.test.ts`)
- [x] **Empaquetar como paquete de `pi` + smoke test de punta a punta** — manifiesto `pi` en `package.json`, persona/gobernanza en `before_agent_start`, las 4 skills de rol (`skills/yts-*/SKILL.md`), bloqueo de procedencia de upstreams (`upstream-lock.json`, 5 tests) y smoke test `P01 → P07` (`test/smoke.test.ts`, `npm run smoke`)

---

## 2. Dónde nos quedamos (Handoff para la próxima sesión)

- **Versión actual:** `0.11.0` (`119/119` tests en verde con `npm test` y `npm run smoke`).
- **Upstreams fijados en [`upstream-lock.json`](../upstream-lock.json):**
  - `albertopo94/youtube`: commit `bb3438e6c5bcc418e1649aba7bea41c9daf47901` (`2026-10-28T14:20:38Z`, `v0.7.1-gobernanza-evidencia-y-alineacion`, con las 8 plantillas `00..06` + `entregable-final.md` espejadas en `mirrored` y las 16 fuentes normativas/consolidadas bloqueadas con SHA-256 en `normative_sources` incluyendo `gobernanza-evidencia.md` y `registro-tecnicas.md`).
  - `earendil-works/pi`: versión revisada `v1.3.0` (`71023aec1546d6d677a65669c5665c0927ce0dd0`); detectada en remoto `v1.4.0` (`4a080252f06caf63a525d7873c5d94d3c23887e0`, aún con `reviewed: false`).
  - `storytold/filmcraft`: versión revisada `0.9.0` (`4a69a038d32761f604b3c7e4845b21fb40b3cbe4`), 17 herramientas MCP catalogadas.
  - `storytold/effectcraft`: versión revisada `0.11.1` (`2a01226894c6bc58ae4fadcc24a10198d693acaa`), 27 herramientas MCP catalogadas con guardas de ejecución.
  - `storytold/soundcraft`: versión revisada `0.8.0` (`2578ea69a388395ddadb6394d7b4ab40f21aa670`), 17 herramientas MCP catalogadas acotadas a `P06_ASSEMBLY`.
- **Estado de Git:** `main` local en `v0.11.0`; comando `youtube-shell` enlazado globalmente en `/Users/albertmac11/.local/bin/youtube-shell` mediante `npm link`.

---

## 3. Qué falta por hacer (Roadmap post-MVP)

- [x] **Sincronizar con `albertopo94/youtube` `13d06b2` (`v0.5.14-consumer-compatibility-record`):** espejar las 6 plantillas actualizadas (`00`, `02`, `03`, `04`, `05`, `06`), portar la validación exacta de estado y `PUBLICADO` contextual con los 10 fixtures (`f0..f9`) a `contract-checker.ts` y `syncStatusView`, y actualizar las 4 skills.
- [x] **Lanzador CLI `youtube-shell` y panel visual TUI de 7 fases:** crear `bin/youtube-shell.mjs` + `src/cli/launcher.ts` (con home aislado en `~/.youtube-shell/agent` que hereda credenciales/modelos sin arrastrar extensiones ni skills ajenas) y el panel de inicio `renderStartupPanel` + `/yts-status` en `src/gate/pi-extension.ts`.
- [x] **Matriz de trazabilidad del conocimiento (`framework-map.json`) y bloqueo de fuentes normativas:** inventariar todas las fuentes de `albertopo94/youtube` (`source_inventory` + `consolidated_or_legacy_sources`), mapear las 23 reglas hacia sus skills con verificación semántica (`required_skill_terms`), políticas de referencia (`reference_policy`) y frontera Runtime vs. Editorial (`verification_scope`).
- [x] **Resolvedor de contexto en 3 capas (`src/core/context-resolver.ts`), bloqueo operativo `read_only` y vínculo de oficina/canal (`/yts-link`):** clasificar turnos en `read_only` vs `production`, retirar y bloquear `write`/`edit`/`yts_transition` en la frontera de herramientas durante consultas, enrutar el playbook de la fase activa con referencias obligatorias/condicionales y vincular `officeRoot` y `channelDir` en `.youtube-shell/registro.json`.
- [x] **Puertas de salida deterministas por fase, aprobación criptográfica pre-render (`/yts-approve-sheet`) y CI de deriva upstream:** añadir `packaging_structure`, `research_sources_structure`, `resource_license_log` y `close_deliverables`, reforzar `script_block_ids`, exigir `/yts-approve-sheet` con huella SHA-256 antes de validar `master_measurement`, y activar `.github/workflows/ci.yml` + `.github/workflows/upstreams.yml`.
- [x] **Catalogar `effectcraft-cli` (`0.11.1`) y `soundcraft-cli` MCP y anclar motores en `upstream-lock.json`:** inventariar las 27 herramientas de EffectCraft y 17 de SoundCraft con guardas de fase (`P05_ANIMATIC`/`P06_ASSEMBLY` para EffectCraft y estrictamente `P06_ASSEMBLY` para SoundCraft), confirmación para scripts JSX y UI desktop, protección contra sobrescritura de Markdown y confinamiento de rutas en `src/gate/capabilities.ts` y `src/gate/pi-extension.ts`, más anclaje formal de `storytold/filmcraft`, `storytold/effectcraft` y `storytold/soundcraft` con verificación de versión de binarios locales en `test/upstream-lock.test.ts`.
- [x] **Alineación con `albertopo94/youtube` `bb3438e` (`v0.7.1-gobernanza-evidencia-y-alineacion`):** espejar las 4 plantillas canónicas actualizadas (`01`, `02`, `03`, `05`), portar el chequeo 5 de `check-contrato.sh` con validación de `registro-tecnicas.md` (`checkFrameworkIntegrity` / `checkTechniquesRegistryCoherence`), adaptar el pipeline a los 4 modos de producción (`Audio-First`, `Screen-First`, `Speaker-First`, `Music-First`), alinear fuerzas operativas `[RECOMENDADA]` / `[COMPUERTA]`, incorporar doctrina de conversión y flujos a las skills, actualizar `_framework/compatibilidad-consumidores.md` en el repo maestro y sincronizar `framework-map.json` y `upstream-lock.json`.
- [ ] **Dogfooding interactivo en la TUI con `youtube-shell`:** abrir una carpeta vacía de prueba ejecutando `youtube-shell`, correr `/yts-init`, comprobar en vivo la restricción de herramientas por fase y aprobar con `/yts-approve`.
- [ ] **Revisar cambios de `earendil-works/pi` `v1.3.0 → v1.4.0`:** correr `npm run upstreams:check`, inspeccionar el diff de `packages/coding-agent/docs/extensions.md` y `types.ts` entre `71023ae` y `4a08025` y, tras validarlo, promover `upstreams.pi.reviewed` a `1.4.0` en `upstream-lock.json`.
- [ ] **Primera corrida real con hoja de aceptación pre-render:** cuando el creador reactive un canal o video de prueba en su oficina (`albertopo94/youtube`), producir un video completo gobernado por `youtube-shell`.
