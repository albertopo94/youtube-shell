# Créditos y procedencia

| Contenido en este repo | Origen | Licencia |
| :-- | :-- | :-- |
| `templates/pipeline-video/*.md` (suite 00→06 por video) | [`albertopo94/youtube`](https://github.com/albertopo94/youtube) — `_framework/plantillas/pipeline-video-template/` (rama `main`, sincronizado el 2026-10-22) | MIT |
| Conocimiento de dominio de fases, estados normalizados y contrato de archivos | [`albertopo94/youtube`](https://github.com/albertopo94/youtube) — `AGENTS.md`, `_framework/scripts/check-contrato.sh` | MIT |

El runtime es [`pi`](https://github.com/earendil-works/pi) (MIT, earendil-works), usado como
dependencia y no como fork. Las versiones y commits exactos revisados de `albertopo94/youtube` y
`earendil-works/pi`, junto con las huellas SHA-256 de los archivos espejados, viven en una única
fuente autoritativa: [`upstream-lock.json`](upstream-lock.json) (ver [`docs/upstreams.md`](docs/upstreams.md)).

El patrón de empaquetado de un harness de dominio sobre pi se inspira
en trabajo público de Gentleman-Programming; no se copia código, nombres, marcas ni assets de esos
proyectos.
