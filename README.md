# youtube-shell

Agente de producción de video empaquetado como paquete para [pi](https://github.com/earendil-works/pi).

Tu agente produce videos y después olvida todo: no tiene opinión sobre tu canal y no puede
probar qué hizo más allá de pedirte que revises cada frame. `youtube-shell` le da memoria,
pipeline y evidencia: las fases de producción se controlan en el runtime, las aprobaciones son
solo del creador y quedan atadas a huellas SHA-256 de lo aprobado, y el master se mide contra
una hoja de aceptación escrita antes del render.

Estado: en construcción (pre-MVP). Contexto completo en [docs/brief-lector.md](docs/brief-lector.md),
alcance en [docs/prd.md](docs/prd.md). Tests: `npm test` (Node ≥ 22.18, sin dependencias).
