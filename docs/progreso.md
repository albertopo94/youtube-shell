# Progreso y Roadmap

Orden de trabajo de [brief-lector.md §12.5](brief-lector.md). Se actualiza en cuanto cambia el estado.

## 1. Hitos del MVP (`v0.1.0` → `v0.4.3`) — Completados

- [x] **Crear el repo con README, LICENSE, créditos, PRD y brief en `docs/`** (`5a02994`)
- [x] **Fijar qué fases existen y qué aprueba cada una** — [contrato-fases-v1.md](contrato-fases-v1.md) con 7 fases semánticas (`P01_PACKAGING`..`P07_CLOSE`) validadas por el creador
- [x] **Hacer que una fase no pueda empezar sin sus prerrequisitos aprobados** — motor de estados puro, sin `pi`, con tests (`src/core/`, 29 tests)
- [x] **Hacer que solo el creador apruebe y que editar lo aprobado lo invalide** — registro `.youtube-shell/registro.json` con huellas SHA-256 por archivo/sección, escritura atómica y sincronización automática de la vista `00-estado-produccion.md` (`src/store/fs-store.ts`, 7 tests)
- [x] **Bloquear dentro de `pi` las operaciones que la fase no permite** — hooks `before_agent_start` y `tool_call`, comandos humanos `/yts-init`, `/yts-approve`, `/yts-reject` y tests de que lo denegado no tocó nada (`src/gate/`, 12 tests)
- [x] **Portar el verificador de contrato con sus fixtures** — `src/checks/contract-checker.ts`, `yts_check_contract` y fixtures `f0`..`f5` (`test/contract-checker.test.ts`, 10 tests)
- [x] **Medir el master contra una hoja de aceptación** — `src/checks/media-measurement.ts`, `yts_measure_master`, `ffprobe`/`ffmpeg` (`PASS | FAIL | WARN | NOT_EVALUABLE`, `test/media-measurement.test.ts`, 6 tests)
- [x] **Probar el caso negativo del piloto e inventariar FilmCraft MCP** — fixture negativo `PILOT_ARCHIVED_METRICS` y 17 herramientas MCP de `filmcraft-cli 0.9.0` catalogadas y acotadas por fase/ruta (`src/gate/capabilities.ts`, `test/pi-gate.test.ts`)
- [x] **Empaquetar como paquete de `pi` + smoke test de punta a punta** — manifiesto `pi` en `package.json`, persona/gobernanza en `before_agent_start`, las 4 skills de rol (`skills/yts-*/SKILL.md`), bloqueo de procedencia de upstreams (`upstream-lock.json`, 5 tests) y smoke test `P01 → P07` (`test/smoke.test.ts`, `npm run smoke`)

---

## 2. Dónde nos quedamos (Handoff para la próxima sesión)

- **Versión actual:** `0.4.3` (`73/73` tests en verde con `npm test` y `npm run smoke`).
- **Upstreams fijados en [`upstream-lock.json`](../upstream-lock.json):**
  - `albertopo94/youtube`: commit `f552339344ff7072bf1624d781156e16518e778c` (`2026-10-22T10:52:46Z`, tag `v0.3.0-tercera-revision-externa`).
  - `earendil-works/pi`: versión revisada `v1.3.0` (`71023aec1546d6d677a65669c5665c0927ce0dd0`); detectada en remoto `v1.4.0` (`4a080252f06caf63a525d7873c5d94d3c23887e0`, aún con `reviewed: false`).
- **Estado de Git:** `main` y `origin/main` en `https://github.com/albertopo94/youtube-shell` sincronizados hasta `v0.4.3`.

---

## 3. Qué falta por hacer (Roadmap post-MVP)

- [x] **Sincronizar con `albertopo94/youtube` `f552339` (`v0.3.0-tercera-revision-externa`):** espejar `05-metricas-retencion.md` §7.2 e integrar la *Puerta de Congruencia Promesa ➜ Contenido* y *Superficies de Descubrimiento* en las skills (`9589b0d`).
- [x] **Sincronizar el remoto en GitHub (`git push origin main`):** publicar los commits hasta `v0.4.3` en `https://github.com/albertopo94/youtube-shell`.
- [ ] **Dogfooding interactivo en la TUI de `pi`:** abrir una carpeta vacía de prueba con `pi -e /Users/albertmac11/Reguero/Proyectos/youtube-shell`, ejecutar `/yts-init`, comprobar en vivo la restricción de herramientas por fase y aprobar con `/yts-approve`.
- [ ] **Revisar cambios de `earendil-works/pi` `v1.3.0 → v1.4.0`:** correr `npm run upstreams:check`, inspeccionar el diff de `packages/coding-agent/docs/extensions.md` entre `71023ae` y `4a08025` y, tras validarlo, promover `upstreams.pi.reviewed` a `1.4.0` en `upstream-lock.json`.
- [ ] **Catalogar `effectcraft-cli` (`0.11.1`) y `soundcraft-cli` MCP:** inventariar sus herramientas MCP igual que se hizo con `filmcraft-cli 0.9.0` e incorporarlas con guardas de fase (`P06_ASSEMBLY`) y ruta en `src/gate/capabilities.ts`.
- [ ] **Primera corrida real con hoja de aceptación pre-render:** cuando el creador reactive un canal o video de prueba en su oficina (`albertopo94/youtube`), producir un video completo gobernado por `youtube-shell`.
