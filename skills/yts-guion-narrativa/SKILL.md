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
1. **Estructura por bloques atómicos `[Bxx]`:**
   - Todo bloque de locución debe declararse como encabezado de nivel 3 (`### [B01_...] — Título`) con su ventana temporal estimada (`MM:SS - MM:SS`). El verificador `script_block_ids` rechaza el envío si faltan bloques identificables.
2. **Linter Anti-Spoiler y Progresión Dramática:**
   - En los bloques de apertura (`[B01]` y `[B02]`) está **prohibido nombrar el mecanismo biológico/técnico central o adelantar la conclusión**.
   - Secuencia dramática: `[B01]` Dilema/bucle abierto ➔ `[B02]` Desmontar la falsa causa intuitiva ➔ `[B03]` Quiebre o anomalía extrema ➔ `[B04]` Revelación del mecanismo desconocido ➔ `[B05]` Prueba empírica matizada ➔ `[B06]` Payoff y reencuadre mental (prohibidos los listicles vagos) ➔ `[B07]` Cierre orgánico (*The Give* o bucle al siguiente video).
3. **Puerta de Originalidad y Credibilidad:**
   - Prohibido inventar credenciales, biografías o experiencias personales ficticias para el narrador.
   - Cumplir la promesa editorial de `01-packaging.md` desde el primer bloque.
4. **Puerta de Congruencia Promesa ➜ Contenido (Linter de Alineación) `[Puerta Obligatoria]`:**
   - Antes de dar por listo `02-guion.md`, responder afirmativamente a las 5 preguntas:
     1. ¿Qué promete explícitamente el título aprobado en `01-packaging.md`?
     2. ¿Qué expectativa y brecha de curiosidad genera la miniatura?
     3. ¿El video entrega realmente lo prometido sin afirmaciones visuales o textuales injustificadas?
     4. ¿La apertura valida esa expectativa en los primeros 5–30 segundos según el formato, sin spoiler prematuro?
     5. ¿Está libre de afirmaciones sin respaldo (resultados garantizados, mecanismos internos no demostrados o métricas ocultas)?
   - Si alguna respuesta es **NO**, el guion no avanza: corregir `02-guion.md` antes de enviar `P03_SCRIPT` (o registrar la incongruencia en `06-fuentes-y-verificacion.md` durante `P04_FACTCHECK` y reabrir `P03_SCRIPT` antes de la locución definitiva).

## Reglas obligatorias en `P04_FACTCHECK` (`06-fuentes-y-verificacion.md` — Parte 2)
1. **Inmutabilidad de `Parte 1`:** Durante `P04_FACTCHECK`, el gate de `youtube-shell` bloquea cualquier edición que altere el Preámbulo o la `Parte 1` ya aprobados en `P02_RESEARCH`. Editar únicamente `## 🔍 Parte 2` y `## 🛡️ Checkpoints de Rigor`.
2. **Cero afirmaciones en `PENDIENTE`:**
   - Auditar cada bloque `[Bxx]` del guion contra fuentes primarias reales con DOI/URL verificada.
   - Eliminar términos absolutos (*"demuestra definitivamente"*, *"cura milagrosa"*) y explicitar en la locución cuando un hallazgo provenga de modelos animales o *in vitro*.
   - El verificador `factcheck_resolved` bloquea `submit` si queda cualquier fila con `PENDIENTE`, `[DOI o Enlace]` o marcador de plantilla sin resolver.
