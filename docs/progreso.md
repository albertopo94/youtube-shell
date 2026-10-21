# Progreso

Orden de trabajo de [brief-lector.md §12.5](brief-lector.md). Se actualiza en cuanto cambia el estado.

- [x] **Crear el repo con README, LICENSE, créditos, PRD y brief en `docs/`**
- [x] **Fijar qué fases existen y qué aprueba cada una** — [contrato-fases-v1.md](contrato-fases-v1.md); los 4 supuestos están pendientes de validación
- [x] **Hacer que una fase no pueda empezar sin sus prerrequisitos aprobados** — motor de estados puro, sin pi, con tests (`src/core/`, 29 tests)
- [x] **Hacer que solo el creador apruebe y que editar lo aprobado lo invalide** — registro con huellas SHA-256 y escritura atómica (`src/store/fs-store.ts`, 7 tests)
- [ ] **Bloquear dentro de pi las operaciones que la fase no permite** — hooks `tool_call`, comando humano de aprobación y tests de que lo denegado no tocó nada
- [ ] **Portar el verificador de contrato con sus fixtures**
- [ ] **Medir el master contra una hoja de aceptación** — ffprobe/ffmpeg, `PASS/FAIL/WARN/NOT_EVALUABLE`
- [ ] **Probar el caso negativo del piloto e inventariar FilmCraft MCP**
- [ ] **Empaquetar como paquete de pi** — persona, gobernanza, skills de los 4 roles
