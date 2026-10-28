---
name: yts-guion-narrativa
description: Escritura de guion maestro por bloques atómicos [Bxx] (02-guion.md), linter anti-spoiler, puerta de originalidad y auditoría de fact-checking línea por línea (Parte 2 de 06-fuentes-y-verificacion.md). Usar en P03_SCRIPT y P04_FACTCHECK.
license: MIT
---

# Rol 03 — Guion Maestro, Narrativa y Verificación Factual (`P03_SCRIPT` y `P04_FACTCHECK`)

## Cuándo activar esta skill
- En `P03_SCRIPT` para redactar `02-guion.md` una vez aprobados `P01_PACKAGING` y `P02_RESEARCH`.
- En `P04_FACTCHECK` para auditar cada afirmación fáctica del borrador en la `Parte 2` y `Checkpoints de Rigor` de `06-fuentes-y-verificacion.md`.

## 1. Compuertas y Reglas Obligatorias [COMPUERTA / OBLIGATORIA]

1. **Estructura por bloques atómicos `[Bxx]` y Puerta de Control Editorial [COMPUERTA]:**
   - Todo bloque de locución debe declararse como encabezado de nivel 3 (`### [B01_...] — Título`) con su ventana temporal estimada (`MM:SS - MM:SS`) y superar la **Puerta de Control Editorial** (`## 1. Puerta de Control Editorial`). El verificador determinista `script_block_ids` rechaza el envío si faltan bloques identificables.
2. **Puerta de Correspondencia del Arranque (`## 0` de `02-guion.md`) [COMPUERTA]:**
   - Responder **por escrito** en la tabla `## 0. Puerta de Correspondencia del Arranque` de `02-guion.md` las 4 comprobaciones antes de cerrar guion y storyboard (primera imagen, primera frase, ventana de arranque del formato y cumplir/superar la promesa).
3. **Puerta de Congruencia Promesa ➜ Contenido (Linter de Alineación) [COMPUERTA]:**
   - Responder afirmativamente a las 5 preguntas de congruencia (título, miniatura, entrega real, validación temprana en 5-30s o segundo cero en Shorts, y ausencia de promesas sin respaldo). Si alguna respuesta es NO, el guion se corrige antes de avanzar.
4. **Puerta de Protección de la Satisfacción Acumulada (Payoff) [OBLIGATORIA]:**
   - El desenlace debe cumplir y superar la promesa inicial del empaque; si la resolución decepciona o es un listicle superficial de relleno, el guion debe reescribirse antes de avanzar a la locución para proteger la reputación y el regreso de la audiencia.
5. **Inmutabilidad y Cero `PENDIENTE` en `P04_FACTCHECK` [COMPUERTA]:**
   - Durante `P04_FACTCHECK`, el gate bloquea cualquier edición que altere el Preámbulo o la `Parte 1` ya aprobados en `P02_RESEARCH`.
   - El verificador `factcheck_resolved` bloquea `submit` si queda cualquier fila con `PENDIENTE`, `[DOI o Enlace]` o marcador de plantilla sin resolver en la `Parte 2` y `Checkpoints de Rigor`.

---

## 2. Técnicas y Heurísticas Narrativas Recomendadas [RECOMENDADA]

> **Gobernanza:** Las siguientes técnicas son heurísticas contrastadas de narrativa y retención. Se catalogan como **`[RECOMENDADA]`** conforme a `_framework/gobernanza-evidencia.md` y `_framework/registro-tecnicas.md`.

- **[GUI-001] La Prueba de la Servilleta / Anclas Visuales:** validar que la historia cuenta con elementos visuales, diagramas o anclas tangibles indispensables para el medio video, evitando ensayos abstractos de texto.
- **[GUI-002] Regla de las 3 B's de Locución (MKBHD):**
  1. *Básico:* vocabulario llano (nivel 6º de primaria), traduciendo jerga técnica pedante.
  2. *Audaz:* oraciones asertivas y directas sin titubeos ni condicionales ("quizás", "podría ser") que socaven autoridad.
  3. *Breve:* oraciones de máximo 25 palabras, párrafos de máximo 3 frases, sin descripciones dobles ni redundancias.
- **[GUI-003] Voice Prompting y Acotaciones Actorales:** incluir indicaciones interpretativas entre corchetes (ej. `[Narrador: voz barítono pausada, documental BBC]`, `[Pausa dramática de 1.5s]`, `[Personaje Y: exaltada, respiración rápida]`) en los bloques `[Bxx]` para alimentar motores neuronales modernos (Gemini TTS / ElevenLabs) con emoción viva.
- **[GUI-004] Pausas Naturales para Mid-rolls (> 8 min):** en videos de más de 8 minutos, planificar 1 o 2 transiciones o respiros naturales entre bloques temáticos y señalizarlos con `[Pausa natural / Mid-roll sugerido: mm:ss]` para su inserción manual en YouTube Studio.
- **Modo de Progresión y Anti-Spoiler Condicionado por Formato (`sintesis-casos-shorts.md`):**
  - *El descubrimiento es parte de la experiencia* (misterio, transformación): en `[B01]` y `[B02]` está prohibido nombrar el mecanismo central o adelantar la conclusión.
  - *La respuesta temprana es el valor* (tutoriales, consultas directas): prohibido retrasar artificialmente la solución.
  - En Shorts y formatos dinámicos, aplicar la **Estructura del Arco en Bucle (*Looped Arc*)**, priorizar **Relatibilidad Universal** y no vulnerar políticas de **contenido reutilizado**.
- **Puerta de Originalidad y Método del Conejillo de Indias (*The Guinea Pig Method*):** prohibido inventar credenciales falsas; fundamentar autoridad en experimentos transparentes, pruebas empíricas directas, fuentes primarias y rigor metodológico.
- **Protocolo de Mención de Afiliados y Patrocinios:** verificar si existen enlaces de afiliados o recursos descargables e integrar una mención verbal orgánica en la locución, alineada con `01-packaging.md` y `entregable-final.md`.
- **Doctrina "Copiar con Gusto" vs. Imitación Superficial:** trasplantar el conflicto estructural y la brecha de curiosidad de un outlier, adaptando el ritmo y la voz al canal.

---

## 3. Arquitectura de Conversión y Madurez del Canal [RECOMENDADA / ESTRATEGIA]

> **Principio:** *"Las visitas solas no construyen un canal sostenible. El video no tiene que cerrar toda la venta ni forzar suscripciones; su trabajo es hacer evidente y deseable el siguiente paso más útil."*

### El CTA como el Siguiente Paso Más Útil (Principio del "Give")
- ❌ **Prohibido el pitch aleatorio desconectado:** `Valor ➔ Valor ➔ Valor ➔ Pitch comercial forzado`. Rompe la inmersión y desgasta la retención final.
-  **El Principio del "Give":** la llamada a la acción debe sentirse como un recurso indispensable para aplicar lo aprendido, donde el espectador agradece la recomendación en vez de sentir que le piden un favor.

### Las Dos Vías de Integración de Ofertas
1. **Vía 1: El Producto como Desatascador Narrativo (Software / Herramientas):**
   - Integrar la herramienta dentro de la resolución de un obstáculo real de la historia, no como demo de producto.
   - **Filtro del Experto Imparcial (*The Unbiased Expert Test*):** *¿Un experto neutral sin interés económico en este producto lo seguiría recomendando aquí porque hace que el video sea más útil?* Si SÍ, la mención es orgánica y creíble. Si NO, se descarta.
2. **Vía 2: La Extensión Natural de la Lección (Lead Magnets / Servicios / Educación):**
   - Ofrecer un recurso tangible que continúe la lección donde termina el video (plantilla de Notion, Google Sheet con scorecard, checklist o código fuente). El espectador entra encantado al embudo de valor.

### Adaptabilidad por Arquetipo y Madurez del Canal
- **Entretenimiento, Relax o Ficción:** el siguiente paso más útil es **el siguiente video complementario** (reproducción en cadena / *binge-watching*). Prohibido forzar descargas que rompan el trance.
- **Hobby o Nicho Práctico:** enlaces de afiliación transparentes de herramientas mencionadas o comunidad abierta.
- **Autoridad o Negocios:** Lead Magnets funcionales para captar audiencia cualificada.
- **Ciclo de Madurez:**
  - *Etapa 1 (Tracción inicial):* Cero complejidad de backend, sin productos pesados; el único CTA es recomendar el siguiente video lógico.
  - *Etapa 2 (Audiencia recurrente):* AdSense y afiliados contextualizados.
  - *Etapa 3 (Consolidación):* Recursos propios y productos de valor.
- **Filtro Anti-CPG / Negocio Pesado:** no apresurarse a crear líneas de productos físicos o negocios paralelos complejos; el costo de oportunidad suele arruinar el alcance del canal.
