# Alineación post-auditoría (revisión externa 12 de `opinion de mi amiga.md`)

Cerrar los 6 señalamientos abiertos de la auditoría externa 12: reconciliar upstream/compatibilidad,
cerrar brechas de contenido en 3 skills, separar ritmo promedio vs duración por plano, y crear el
registro de aprendizajes atómicos. Commit único de trabajo unitario al final.

## Specs

S1. **P1 upstream desactualizado.** `opinion de mi amiga.md`: *"El upstream-lock.json de youtube-shell
todavía registra como revisión de youtube el commit bb3438e6c5bcc418e1649aba7bea41c9daf47901, del 28 de
octubre. Sin embargo, la rama principal de youtube ya tiene commits posteriores que modifican rutas
declaradas como relevantes para el consumidor, incluidos AGENTS.md, los roles y el documento de
compatibilidad."* — y: *"Recomendación: actualizar el commit revisado, reconciliar los hashes y la
documentación de compatibilidad, comprobar las skills consolidadas contra las fuentes y hacer que la
revisión de upstream sea un control automatizado apropiado —o, como mínimo, un control explícito antes
de declarar la alineación—."*

S2. **P1 doble criterio de outliers.** *"En una sección indica correctamente que se debe comparar un
vídeo con la mediana reciente de vídeos comparables del canal. Más adelante, en «Barrido DFS Híbrido y
Superficies de Descubrimiento», vuelve a decir que hay que registrar el ratio visitas/suscriptores de
los outliers... La instrucción debería dejar explícito que la mediana reciente es el criterio principal
para detectar la anomalía de rendimiento, mientras que el ratio visitas/suscriptores puede conservarse
como dato auxiliar."*

S3. **P2 aperturas y Roadmap.** *"En youtube/_framework/roles/03-guion-y-narrativa.md hay una caja de
cinco técnicas opcionales de apertura: 1. Pregunta imposible de ignorar. 2. Dato que rompe una creencia.
3. Escenario hipotético. 4. Promesa directa o demostración inmediata. 5. Inmersión atmosférica o enigma
narrativo."* — y: *"También falta el Roadmap de Compromiso Mental o Spoiler Intro: presentar de forma
breve los principales hitos que cubrirá un vídeo largo o una explicación compleja. El rol fuente
especifica cuándo usarlo y cuándo evitarlo para no destruir el misterio narrativo."* — y: *"Recomendación:
trasladar estas técnicas como opciones condicionadas por formato, no como una lista de requisitos
obligatorios para todos los vídeos."*

S4. **P2 repertorio de títulos reducido.** *"El rol fuente contiene un repertorio más amplio:
autoridad, guías para principiantes, actualidad, arrepentimiento, tendencias, números, contraste,
afirmaciones contraintuitivas, superlativos, retos imposibles, cuestionamiento de convenciones,
preguntas y viajes transformadores, entre otros."* — y: *"Recomendación: ampliar el repertorio de
referencias disponibles y mantener la compuerta de cinco candidatos. Los cinco deben ser diferentes y
estar justificados, pero el agente debería elegirlos de una caja de herramientas más extensa según el
tema y el público."*

S5. **P2 ritmo promedio vs por plano.** *"El código no está mal por medir un promedio. Lo que debemos
evitar es interpretar ese resultado como si demostrara que se cumple el máximo por plano. Hay dos
alternativas: implementar un control basado en límites temporales por segmento —teniendo presente la
precisión de la detección— o declarar expresamente que el medidor automático evalúa un indicador de
ritmo promedio y dejar la regla de duración individual bajo revisión editorial humana."* (Fuente del
criterio: *"un plano estático no debería permanecer más de cinco segundos sin alguna variación
visual, salvo que exista una justificación creativa."*)

S6. **P2 registro de aprendizajes atómicos.** *"El siguiente paso que recomiendo es complementarlo con
un registro de aprendizajes atómicos que incluya, por cada uno: learning_id | Fuente (Archivo y sección
canónicos de youtube) | Principio (Qué debe entender y aplicar el agente) | Destino (Skill, plantilla,
referencia o código de youtube-shell) | Activación (Fase, formato o condición que lo hace aplicable) |
Aplicación (Instrucción, revisión humana o compuerta determinista) | Evidencia (Test, campo del
entregable o comprobación de uso) | Estado (Completo, parcial, ausente, fuera de alcance o pendiente por
decisión)."* — y: *"que la prueba encuentre términos como R.A.I.N.Y. o mediana confirma que hay texto
relacionado; no demuestra por sí solo que la definición sea fiel a la fuente, que las excepciones se
conserven o que la instrucción llegue a activarse en el momento adecuado."* — y: *"sin duplicar las
transcripciones ni añadir ruido innecesario al contexto del agente."*

S7. **Contradicciones en `compatibilidad-consumidores.md` (repo `youtube`).** *"El documento todavía
afirma que: El consumidor está en youtube-shell v0.10.0, cuando su package.json actual indica v0.11.0.
La skill de investigación todavía usa el ratio simple visitas/suscriptores y no ha adoptado la mediana
reciente, cuando la skill actual ya contiene esa metodología."*

S8. **CI no verifica upstream.** *"la CI ejecuta npm test y npm run smoke, pero no npm run
upstreams:check. Eso permite que las pruebas locales del contrato estén correctas mientras la revisión
de la fuente upstream continúa pendiente."* — y: *"El test test/upstream-lock.test.ts comprueba la
estructura del lock y la integridad de las plantillas espejadas, pero no demuestra que las skills
adaptadas sigan semánticamente cada modificación reciente de sus fuentes."*

S9. **Acoplemento skill→entregable (sección 3 de la auditoría).** *"El enrutamiento y la disponibilidad
no demuestran por sí solos que el agente haya leído y aplicado todas las referencias obligatorias. El
contexto le muestra sus rutas y el objetivo de la fase; eso no equivale a una comprobación determinista
de que abrió el documento o siguió cada recomendación."* → Las nuevas técnicas deben exigirse en el
entregable (01-packaging.md / 02-guion.md) vía `requiredDeliverableEvidence` del playbook, no solo en la skill.

## Tasks

- T1 — Corregir `_framework/compatibilidad-consumidores.md` en `youtube` (S7): v0.11.0, commit 46b53d4, diferencia 6 adoptada, acción pendiente cerrada. Commit en `youtube`.
- T2 — Skills: jerarquizar mediana > ratio auxiliar en `yts-investigacion-ideas` (S2); caja de 5 aperturas + Roadmap/Spoiler Intro + Unfair Edge en `yts-guion-narrativa` condicionados por formato (S3); caja de palancas de título completa en `yts-packaging-miniaturas` con constancia por candidato (S4); constancia en entregable vía `PHASE_PLAYBOOKS` (S9).
- T3 — `media-measurement.ts`: `maxSegmentSec` por `pts_time` + `pacing.maxShotSec` + declaración explícita de frontera determinista/editorial en detalles, playbook P06 y skill (S5).
- T4 — `atomic_learnings` en `framework-map.json` con los 8 campos (S6) + tests de fidelidad (concepto núcleo + excepción/condición + activación por fase).
- T5 — `upstream-lock.json` → commit `46b53d4202ed326b7f84ad8ffb05bb89e9bf7823` con nuevos SHA-256 de `AGENTS.md` y `compatibilidad-consumidores.md`; espejo de `herramientas-y-apis.md`; `npm run upstreams:check` en `ci.yml`; test de coherencia lock↔package↔compat (S1, S8).
- T6 — Bump 0.12.0 en package.json + README + progreso.md (nuevo hito roadmap) + commit final.

## Log

L1 — Request original del usuario (2026-11-02): "en que punto quedo este producto? ya se puede usar o faltaba algo por implementarse?" → luego "lee: 'opinion de mi amiga.md'" → tras 2 lecturas y el plan de cierre aprobado con "si", se implementan los 6 señalamientos de la auditoría externa 12 más el acoplemento skill→entregable y el control de deriva upstream en CI.

Decisiones de diseño (arquiteto, 2026-11-02):
- La regla 6 de `compatibilidad-consumidores.md` se cierra en la misma serie de commits (youtube primero, luego youtube-shell) para que el lock apunte a un commit donde el documento ya declara alineación.
- `maxSegmentSec` se reporta siempre en el reporte del master; el umbral en la hoja es opcional (`pacing.maxShotSec`). El detalle declara que FFmpeg `scene>0.3` es un indicador macro aproximado y que la regla de ≤5 s por plano estático es revisión editorial humana (ambas alternativas de la auditoría, combinadas).
- `atomic_learnings` vive en `framework-map.json` (no en las skills) para no inflar el contexto del agente (S6: "sin duplicar las transcripciones ni añadir ruido").
- El test de aprendizajes verifica concepto núcleo + término de excepción/condición + que la fase de activación tenga playbook con la skill destino.

L2 (2026-11-01, cierre) — Evidencia observada:
- `npm test` → `# tests 137 / # pass 136 / # fail 1`. El único fallo es
  `media engine binaries ... match reviewed version`, reproducido también sobre el commit base
  `8a4c029` (misma salida: `binary filmcraft-cli output ("filmcraft-cli 0.15.0") does not match
  reviewed version 0.9.0`). Causa: los binarios locales se auto-actualizaron a
  filmcraft 0.15.0 / effectcraft 0.19.0 / soundcraft 0.15.0 durante la sesión. No pertenece a este
  trabajo (AGENTS.md §4: se reporta aparte).
- `npm run smoke` → `# pass 1 / # fail 0`.
- Comprobación diferencial AGENTS.md §4 (base `505af0b~1` vs. nuevo, 12 combinaciones de hoja de
  aceptación × métricas, incluyendo la hoja del piloto y la excepción preaprobada): 0 diferencias de
  veredicto. Ningún `visual_pacing` existente cambió de veredicto: la regla por segmento solo se
  aplica si la hoja declara `pacing.maxShotSec`.
- Commits: T2 `a2495ac`, T3 `505af0b`, T4 `533ca07`, T5 `c69c74a` + `6376b78`, T6 `5161f41`.
  En `albertopo94/youtube`: `ef7adf6` + `af32db8` (sin publicar: `origin/main` 2 commits atrás).
- Hallazgo del propio registro (no pedido): 4 aprendizajes de `roles/03` están ausentes de las
  skills (reactivación a mitad de metraje, grados de guionado, momento de mayor valor, arquetipo de
  proceso y transformación) y 1 regla vive en la skill de guion pero se ejecuta en P05. Quedan
  registrados como `status: absent` con su seguimiento, y el test de activación impide que vuelva a
  pasar inadvertido un aprendizaje que la fase nunca cargaría.
- Pendiente del creador: publicar la rama de `albertopo94/youtube` (el lock fija `af32db8`, que hoy
  solo existe en el clon local → `check-upstreams.mjs` responde 3) y decidir la promoción de los
  motores de medios, que tiene ~190 commits por revisar en FilmCraft.

L3 (2026-11-01, motores de medios) — El creador aclaró que actualiza filmcraft/effectcraft/soundcraft
cada vez que `storytold` publica, así que la guarda de igualdad de versión era la guarda equivocada.
- La nueva guarda lee `tools/list` por MCP de los binarios instalados y compara contra
  `src/gate/capabilities.ts`: corte duro si el catálogo afirma una tool que el motor ya no expone;
  advertencia si el motor expone tools no catalogadas (la allowlist las bloquea → capacidad perdida,
  no inseguridad), por deriva de versión, o si cambia `mcp_surface_sha256`.
- Hallazgo: EffectCraft 0.19.0 expone `list_commands` y nunca estuvo catalogado → el gate bloqueaba
  una tool de solo lectura real. Catalogada (`a2495ac`→`528a0da`).
- Verificación en vivo: filmcraft 17/17, effectcraft 27 (26 catalogadas + 1 hallada), soundcraft 17/17.
- Lock promovido a las versiones que corren acá: filmcraft 0.15.0 `94ceaa9`, effectcraft 0.19.0
  `afa3c93`, soundcraft 0.15.0 `a97ce75`, cada uno con `reviewed.mcp_surface_sha256`.
- Evidencia de los dos caminos: (a) instalado 0.15.0 vs revisado 0.9.0 → `# pass 8 / # fail 0` con
  aviso; (b) catálogo afirmando `tool_that_engine_dropped` → `not ok` con el nombre de la tool.
- `npm run engines:surface` → exit 0, los 3 hashes coinciden con el lock.
- `npm test` → `# tests 137 / # pass 137 / # fail 0`. Versión `0.13.0`. Commits `528a0da` `9681aa8`.
- La guarda de coherencia de versión (T5/S8) funcionó de verdad: detectó que el documento de la
  oficina seguía en v0.12.0 y obligó a re-ancorar (`9637197`, lock y mapa → ese commit).
