---
name: yts-orquestador
description: Gobernanza global de producción audiovisual, enrutamiento de flujo en 3 capas, autoridad de .youtube-shell/registro.json, vínculo de oficina/canal y cierre de publicación (P07_CLOSE).
license: MIT
---

# Orquestador de Producción Audiovisual (`GLOBAL` y `P07_CLOSE`)

## Cuándo activar esta skill
- Como capa base de gobernanza en cualquier sesión de `youtube-shell` (rutas de consulta en solo lectura o de producción activa).
- Al vincular la carpeta del video con la oficina (`ideas.md`, `referentes.md`, `banco-visual.md`) y el canal (`backlog-ideas.md`, `banco-de-titulos.md`) mediante `/yts-link`.
- En `P07_CLOSE` para coordinar la entrega final (`entregable-final.md`), métricas de retención (`05-metricas-retencion.md`) y archivo en `videos-publicados/`.

## Reglas obligatorias de gobernanza (`AGENTS.md` §§01–09)
1. **Autoridad de estado en `.youtube-shell/registro.json`:**
   - `00-estado-produccion.md` es una vista sincronizada automáticamente por el runtime; marcar casillas Markdown nunca acredita una aprobación.
   - Ninguna fase comienza sin las fases previas en `APROBADO` con huellas SHA-256 vigentes.
2. **Separación entre ruta de solo lectura y ruta de producción:**
   - **Modo lectura (`read_only`):** consultas, auditorías o explicaciones sin mutación de artefactos ni avance de fase.
   - **Modo producción (`production`):** ejecución de la fase activa (`EN_CURSO`), sujeta a validación de secciones compartidas y verificadores deterministas.
3. **Aprobaciones humanas indelegables:**
   - Solo el creador aprueba fases mediante `/yts-approve <FASE>` en interfaz interactiva (`hasUI=true`).
   - En `P06_ASSEMBLY`, la hoja de aceptación previa al render (`aceptacion.json`) requiere aprobación humana explícita mediante `/yts-approve-sheet`, quedando vinculada a su huella SHA-256 en `.youtube-shell/registro.json`.
4. **Vínculo de oficina y canal (`/yts-link`):**
   - Consultar los archivos de la oficina (`ideas.md`, `referentes.md`, `banco-visual.md`) y del canal (`backlog-ideas.md`, `banco-de-titulos.md`) cuando estén vinculados.
   - Prohibido inventar contenido o paletas atribuyéndoselas a archivos de notas incompletos (`AGENTS.md` §01.6).
5. **Método agnóstico de proveedores y handoff inequívoco (`AGENTS.md` §02.4 y §08.2):**
   - Consultar `references/herramientas-y-apis.md` para el estado real de validación de cada herramienta (`🟢 PROBADA`, `🟡 DOCUMENTADA`, `🟣 OBLIGATORIA`, `⛔ RESTRICCIÓN LEGAL`).
   - Consultar `references/contingencia-y-politicas-sensibles.md` para evaluación de riesgo factual YMYL, léxico blindado, distinción copyright/permiso/monetización y protocolo de contingencia en YouTube Studio.
6. **Cierre y aprendizaje (`P07_CLOSE`):**
   - Completar `05-metricas-retencion.md` (intervalos de consulta, retrospectiva con una única mejora nombrada sin atribución causal infundada y protocolo de no republicar archivos idénticos) y `entregable-final.md`.
   - El estado terminal `PUBLICADO` solo es válido tras archivar el video con las 7 fases aprobadas bajo `mis-canales/<canal>/videos-publicados/<video>/`.
