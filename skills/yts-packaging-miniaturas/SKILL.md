---
name: yts-packaging-miniaturas
description: Diseño de packaging pre-guion (5 ángulos de título, 3 conceptos diferenciados de miniatura, promesa de trama y variantes A/B en 01-packaging.md). Usar durante la fase P01_PACKAGING antes de redactar el guion.
license: MIT
---

# Rol 02 — Packaging, Miniaturas y Promesa de Trama (`P01_PACKAGING`)

## Cuándo activar esta skill
- Al iniciar la producción de un video en `P01_PACKAGING` sobre `01-packaging.md`.
- Al preparar variantes para prueba nativa *Test & Compare* en formato largo.

## 1. Compuertas y Requisitos Obligatorios [COMPUERTA / OBLIGATORIA]
1. **Packaging antes del guion [COMPUERTA]:** Ningún guion (`P03_SCRIPT`) comienza sin packaging aprobado por el creador. El packaging define la **Promesa de Trama (*Plot Promise*)** que los primeros 30 segundos del guion deben honrar.
2. **Cinco ángulos de título candidatos (`packaging_structure`) [COMPUERTA]:**
   - Proponer 5 títulos numerados en `01-packaging.md` que exploren **palancas psicológicas distintas** (dolor directo, paradoja contraintuitiva, pregunta en bucle abierto, contraste temporal o mecanismo oculto).
   - Redactar la **justificación del título recomendado** (deseo al que apela, bucle que abre y encaje con la campaña del canal).
   - Priorizar legibilidad inmediata en móvil (lo decisivo al inicio; ~55 caracteres como heurística orientativa, nunca camisa de fuerza).
   - **Proporción y veracidad de la promesa:** comprobar que el título promete algo que el video realmente entrega y no presenta como trivial un desarrollo extenso (ni viceversa).
3. **Tres conceptos de miniatura diferenciados (`packaging_structure`) [COMPUERTA]:**
   - Diseñar 3 conceptos visualmente distintos (`Miniatura A`, `Miniatura B`, `Miniatura C`, no meros cambios de color) para elevar el **CTR** y el **Watch Time Share** en *Prueba y Compara* (*Test & Compare*).
   - Entregar cada prompt visual con **Ficha Técnica Inequívoca** (agnóstica de proveedor, adaptada a la herramienta disponible del creador): tipo de recurso (🖼️ Imagen estática), herramienta y método de ejecución (pestaña o módulo concreto solo si la herramienta lo tiene, ej. Google Flow ➔ Pestaña *"Imagen"*), modo operativo (`--ar 16:9`) y prompt listo para copiar.
4. **Checkpoint humano [COMPUERTA]:** Tras completar `01-packaging.md`, invocar `yts_transition` con `action: "submit"` para `P01_PACKAGING` y esperar la aprobación del creador mediante `/yts-approve P01_PACKAGING`.

---

## 2. Heurísticas de Diseño y Pruebas Recomendadas [RECOMENDADA]

> **Gobernanza:** Las siguientes técnicas son heurísticas contrastadas de packaging. Se catalogan como **`[RECOMENDADA]`** conforme a `_framework/gobernanza-evidencia.md` y `_framework/registro-tecnicas.md`.

- **[PACK-001] Estrategia A/B en Dos Tiempos:** probar Macrocambios conceptuales (Fase 1: ángulo, fondo o premisa radicalmente distinta) antes de entrar en micro-variaciones (Fase 2); respetar la ley de rendimientos decrecientes y no obsesionarse con micro-detalles.
- **[PACK-002] Regla de Reducción al 18% y Límite de 3 Elementos Focales (MKBHD):**
  - Componer la miniatura con un **máximo de 3 elementos focales** (sujeto, objeto de tensión y texto/fondo limpio).
  - Validar al 18% de escala móvil (Clarity Test): si al 18% se vuelve un borrón confuso, simplificar la composición.
- **[PACK-003] Thumbnail Shoot Day (Sesión en Lote para A-Roll):** en canales con presentador, reservar sesiones periódicas de 1 hora para fotografiar expresiones y miradas con ropa neutra, archivando recortes en el banco de assets (*Cutouts Bank*) para desacoplar el rodaje del empaque.
- **Composición de Pantalla Dividida (*Split-Screen*):** división nítida en dos mitades para comparaciones extremas ($1 vs $1M, antes vs después).
- **The Verisimilitude Test (Boceto vs. Render Final):** verificar que la pieza final terminada conserve la fuerza y tensión del boceto sin verse plástica, artificial ni deslucida.
- **Calibración de conciencia de Eugene Schwartz y Puente de Demanda:** ajustar el ángulo del título y la miniatura al nivel de conciencia real (*Problem Aware*, *Solution Aware*, *Mechanism Aware*).
