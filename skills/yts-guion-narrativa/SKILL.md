---
name: yts-guion-narrativa
description: Escritura de guion maestro por bloques atómicos [Bxx] (02-guion.md), linter anti-spoiler, puerta de originalidad y auditoría de fact-checking línea por línea (Parte 2 de 06-fuentes-y-verificacion.md). Usar en P03_SCRIPT y P04_FACTCHECK.
license: MIT
---

# Rol 03 — Guion Maestro, Narrativa y Verificación Factual (`P03_SCRIPT` y `P04_FACTCHECK`)

## Cuándo activar esta skill
- En `P03_SCRIPT` para redactar `02-guion.md` una vez aprobados `P01_PACKAGING` y `P02_RESEARCH`.
- En `P04_FACTCHECK` para auditar cada afirmación fáctica del borrador en la `Parte 2` y `Checkpoints de Rigor` de `06-fuentes-y-verificacion.md`.

## Reglas obligatorias en `P03_SCRIPT` (`02-guion.md`)
1. **Estructura por bloques atómicos `[Bxx]` y Puerta de Control Editorial:**
   - Todo bloque de locución debe declararse como encabezado de nivel 3 (`### [B01_...] — Título`) con su ventana temporal estimada (`MM:SS - MM:SS`) y superar la **Puerta de Control Editorial** (`## 1. Puerta de Control Editorial`). El verificador `script_block_ids` rechaza el envío si faltan bloques identificables.
2. **Modo de Progresión, Anti-Spoiler Condicionado por Formato y Arco en Bucle (`sintesis-casos-shorts.md`):**
   - Declarar en el encabezado de `02-guion.md` (con una línea de justificación) cuál modo aplica:
     - **El descubrimiento es parte de la experiencia** (misterio, transformación, reto, divulgación con revelación): en `[B01]` y `[B02]` está **prohibido nombrar el mecanismo central o adelantar la conclusión**; la revelación se reserva para `[B04]`.
     - **La respuesta temprana es el valor** (tutoriales, explicación directa, consultas de búsqueda): **prohibido retrasar artificialmente la respuesta**; se confirma la solución pronto y la tensión pasa al *cómo*, el *por qué* o la *aplicación* (`[B04]` actúa como demostración o procedimiento).
   - En Shorts y formatos dinámicos, aplicar la **Estructura del Arco en Bucle (*Looped Arc*)** (`Bucle Abierto ➔ Acción ➔ Conflicto / Error Inesperado ➔ Recuperación / Reintento ➔ Payoff`), priorizar **Relatibilidad Universal** sobre volumen bruto de nicho y respetar que citar un canal no equivale a licencia de copyright ni eludir políticas de **contenido reutilizado**.
   - En cualquier formato queda prohibido cerrar con listicles vagos de autoayuda en el payoff (`[B06]`).
3. **Puerta de Correspondencia del Arranque (`## 0` de `02-guion.md`) `[Puerta Obligatoria]`:**
   - Responder **por escrito** en la tabla `## 0. Puerta de Correspondencia del Arranque` de `02-guion.md` las 4 comprobaciones antes de cerrar guion y storyboard:
     1. **Primera imagen:** relación visual comprensible con el concepto de la miniatura cuando sea pertinente al formato.
     2. **Primera frase:** confirma el tema/promesa sin preámbulo que no aporte valor.
     3. **Ventana de arranque del formato:** contexto/interés/reto/recompensa suficientes en la ventana propia del formato (Shorts: segundo cero; dinámico/tutorial: ~5–10 s; ensayo/documental: ~15–30 s).
     4. **Cumplir y superar:** confirma lo prometido y empieza a aportar valor extra sin exagerar.
4. **Puerta de Originalidad y Credibilidad:**
   - Prohibido inventar credenciales, biografías o experiencias personales ficticias para el narrador.
   - Cumplir la promesa editorial de `01-packaging.md` desde el primer bloque.
5. **Puerta de Congruencia Promesa ➜ Contenido (Linter de Alineación) `[Puerta Obligatoria]`:**
   - Antes de dar por listo `02-guion.md`, responder afirmativamente a las 5 preguntas:
     1. ¿Qué promete explícitamente el título aprobado en `01-packaging.md`?
     2. ¿Qué expectativa y brecha de curiosidad genera la miniatura?
     3. ¿El video entrega realmente lo prometido sin afirmaciones visuales o textuales injustificadas?
     4. ¿La apertura valida esa expectativa en la ventana propia del formato (5–30 s o segundo cero en Shorts; en tutoriales/consulta la respuesta temprana es el cumplimiento de la promesa)?
     5. ¿Está libre de afirmaciones sin respaldo (resultados garantizados, mecanismos internos no demostrados o métricas ocultas)?
   - Si alguna respuesta es **NO**, el guion no avanza: corregir `02-guion.md` antes de enviar `P03_SCRIPT` (o registrar la incongruencia en `06-fuentes-y-verificacion.md` durante `P04_FACTCHECK` y reabrir `P03_SCRIPT` antes de la locución definitiva).

## Reglas obligatorias en `P04_FACTCHECK` (`06-fuentes-y-verificacion.md` — Parte 2)
1. **Inmutabilidad de `Parte 1`:** Durante `P04_FACTCHECK`, el gate de `youtube-shell` bloquea cualquier edición que altere el Preámbulo o la `Parte 1` ya aprobados en `P02_RESEARCH`. Editar únicamente `## 🔍 Parte 2` y `## 🛡️ Checkpoints de Rigor`.
2. **Cero afirmaciones en `PENDIENTE`:**
   - Auditar cada bloque `[Bxx]` del guion contra fuentes primarias reales con DOI/URL verificada.
   - Eliminar términos absolutos (*"demuestra definitivamente"*, *"cura milagrosa"*) y explicitar en la locución cuando un hallazgo provenga de modelos animales o *in vitro*.
   - El verificador `factcheck_resolved` bloquea `submit` si queda cualquier fila con `PENDIENTE`, `[DOI o Enlace]` o marcador de plantilla sin resolver.
