---
name: yts-packaging-miniaturas
description: Diseño de packaging pre-guion (5 ángulos de título, 3 conceptos diferenciados de miniatura, promesa de trama y variantes A/B en 01-packaging.md). Usar durante la fase P01_PACKAGING antes de redactar el guion.
license: MIT
---

# Rol 02 — Packaging, Miniaturas y Promesa de Trama (`P01_PACKAGING`)

## Cuándo activar esta skill
- Al iniciar la producción de un video en `P01_PACKAGING` sobre `01-packaging.md`.
- Al preparar variantes para prueba nativa *Test & Compare* en formato largo.

## Reglas obligatorias del dominio
1. **Packaging antes del guion:** Ningún guion (`P03_SCRIPT`) comienza sin packaging aprobado por el creador. El packaging define la **Promesa de Trama (*Plot Promise*)** que los primeros 30 segundos del guion deben honrar.
2. **Cinco ángulos de título candidatos:**
   - Proponer 5 títulos en `01-packaging.md` que exploren **palancas psicológicas distintas** (dolor directo, paradoja contraintuitiva, pregunta en bucle abierto, contraste temporal o mecanismo oculto).
   - Redactar la **justificación del título recomendado** (deseo al que apela, bucle que abre y encaje con la campaña del canal).
   - Priorizar legibilidad inmediata en móvil (lo decisivo al inicio; ~55 caracteres como heurística orientativa, nunca camisa de fuerza).
   - **Proporción y veracidad de la promesa (`[Heurística a evaluar]`):** comprobar que el título promete algo que el video realmente entrega y no presenta como trivial un desarrollo extenso (ni viceversa), respetando el criterio creativo sobre cómo expresar la profundidad.
3. **Tres conceptos de miniatura diferenciados:**
   - Diseñar 3 conceptos visualmente distintos (no meros cambios de color): composición, punto focal (máximo 3 elementos), texto en imagen (0 a 4 palabras que complementen, nunca repitan, el título) y contraste frente al feed.
   - Entregar cada prompt visual con **Ficha Técnica Inequívoca** (agnóstica de proveedor, adaptada a la herramienta disponible del creador): tipo de recurso (🖼️ Imagen estática), herramienta y método de ejecución (pestaña o módulo concreto solo si la herramienta lo tiene, ej. Google Flow ➔ Pestaña *"Imagen"*), modo operativo (`--ar 16:9`) y prompt listo para copiar.
4. **Checkpoint humano:** Tras completar `01-packaging.md`, invocar `yts_transition` con `action: "submit"` para `P01_PACKAGING` y esperar la aprobación del creador mediante `/yts-approve P01_PACKAGING`.
