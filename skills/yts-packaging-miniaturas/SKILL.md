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
   - Diseñar 3 conceptos visualmente distintos (`Miniatura A`, `Miniatura B`, `Miniatura C`, no meros cambios de color): composición, punto focal (**Límite de 3 Elementos Focales** de MKBHD: sujeto principal, objeto de tensión y texto/fondo limpio), texto en imagen (0 a 4 palabras que complementen, nunca repitan, el título), composiciones de alto impacto como **Pantalla Dividida (*Split-Screen*)** para contrastes extremos ($1 vs $1M, antes vs después) y contraste frente al feed para elevar el **CTR** y el **Watch Time Share** en *Prueba y Compara* (*Test & Compare*).
   - Entregar cada prompt visual con **Ficha Técnica Inequívoca** (agnóstica de proveedor, adaptada a la herramienta disponible del creador): tipo de recurso (🖼️ Imagen estática), herramienta y método de ejecución (pestaña o módulo concreto solo si la herramienta lo tiene, ej. Google Flow ➔ Pestaña *"Imagen"*), modo operativo (`--ar 16:9`) y prompt listo para copiar.
4. **Control de Calidad Pre-Guion (Los 4 Tests) y Estrategia A/B:**
   - Superar los tests de validación:
     1. **The Clarity Test & Regla del 18% (MKBHD):** ¿Legible y comprensible al 18% de escala móvil? Si al 18% se vuelve un borrón confuso, simplificar la composición a máximo 3 focos.
     2. **The Contrast Test:** ¿Destaca entre miniaturas de competidores directos?
     3. **The Glance Test:** ¿Se entiende la curiosidad en menos de 2 segundos?
     4. **The Verisimilitude Test (Boceto vs. Render Final):** ¿La miniatura final terminada conserva la tensión del boceto sin verse plástica, artificial ni deslucida?
   - **Estrategia A/B en Dos Tiempos:** probar Macrocambios conceptuales (Fase 1) antes de entrar en micro-variaciones (Fase 2); respetar la ley de rendimientos decrecientes y no obsesionarse con micro-detalles.
   - **Thumbnail Shoot Day (Sesión en Lote para A-Roll):** en canales con presentador, reservar sesiones periódicas de 1 hora para fotografiar expresiones y miradas con ropa neutra, archivando recortes en el banco de assets (*Cutouts Bank*) para desacoplar el rodaje del empaque.
5. **Calibración de conciencia de Eugene Schwartz y Puente de Demanda:**
   - Ajustar el ángulo del título y la miniatura al nivel de conciencia real (*Problem Aware*, *Solution Aware*, *Mechanism Aware*) y verificar el **Control de Calidad Pre-Guion** antes de solicitar revisión.
6. **Checkpoint humano:** Tras completar `01-packaging.md`, invocar `yts_transition` con `action: "submit"` para `P01_PACKAGING` y esperar la aprobación del creador mediante `/yts-approve P01_PACKAGING`.
