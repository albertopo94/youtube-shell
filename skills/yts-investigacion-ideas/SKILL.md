---
name: yts-investigacion-ideas
description: Investigación de demanda cualificada, mapeo DFS de nichos, niveles de conciencia de Schwartz y fuentes primarias (Parte 1 de 06-fuentes-y-verificacion.md). Usar al evaluar ideas de canal/video o ejecutar la fase P02_RESEARCH.
license: MIT
---

# Rol 01 — Investigación de Demanda, Outliers y Fuentes de Partida (`P02_RESEARCH`)

## Cuándo activar esta skill
- Al evaluar, priorizar y validar ideas de video (`backlog-ideas.md`, `ideas.md`).
- Durante la fase `P02_RESEARCH` para completar el preámbulo y la `Parte 1` de `06-fuentes-y-verificacion.md`.
- **Frontera de alcance:** Esta skill gobierna la investigación de demanda a nivel de **video** dentro del pipeline de producción. La exploración y viabilidad estratégica de un canal nuevo (`estudio-mercado.md`, `propuesta-branding.md`) es una capacidad del espacio de trabajo de la oficina que se articula mediante `/yts-link`.

## 1. Compuertas y Requisitos Obligatorios [COMPUERTA / OBLIGATORIA]
1. **Linter de territorios e ideas vetadas [COMPUERTA]:** Antes de proponer un tema, inspeccionar `ideas.md` (`## 4. 🚫 Territorios y Nichos Vetados`) y `backlog-ideas.md` (`## 3. 🚫 Ideas y Enfoques Vetados`). Prohibido proponer enfoques presentes en esas secciones.
2. **Entregable de `P02_RESEARCH` (`06-fuentes-y-verificacion.md` — Preámbulo y Parte 1) (`research_sources_structure`) [COMPUERTA]:**
   - Separar **Formato / género** de **Riesgo factual del contenido** en el **Régimen de Verificación**: `[ ] Sin afirmaciones sobre la realidad (N/A permitido)` / `[ ] Afirmaciones factuales verificables` / `[ ] Zona Roja YMYL`. La ficción, el relax o los formatos híbridos no quedan exentos si mencionan hechos históricos, ciencia, salud, finanzas o personas reales.
   - Asentar las **Fuentes de Partida** primarias con DOI/URL, hallazgo real y limitaciones metodológicas (ej. modelo animal vs. humano) antes de pasar a `P03_SCRIPT`.

---

## 2. Heurísticas de Investigación de Demanda Recomendadas [RECOMENDADA]

> **Gobernanza:** Las siguientes técnicas son heurísticas contrastadas de investigación y validación de audiencia. Se catalogan como **`[RECOMENDADA]`** conforme a `_framework/gobernanza-evidencia.md` y `_framework/registro-tecnicas.md`.

### Detección Metodológica de Outliers
- **Contexto Temporal y Mediana Reciente (Ventana 3 a 6 Meses):** No comparar únicamente vistas totales contra suscriptores (un video antiguo acumula vistas pasivas por años). El outlier real se identifica contrastando las visualizaciones del video contra la **mediana de videos comparables publicados por ese mismo canal en los últimos 3 a 6 meses**.
- **Filtro de Desglose de Formato (Long-form vs. Shorts):** Al auditar canales competidores en YouTube o herramientas públicas (Viewstats), verificar si sus millones de visitas provienen de Shorts o de formato largo. Un canal con métricas infladas por Shorts no sirve como modelo de retención ni empaque para producciones en formato largo.
- **Relatibilidad Universal sobre Volumen Bruto:** Preferir modelar un outlier de 8M sobre un concepto universalmente reconocible (dinero, café, hábitos cotidianos, mascotas) que uno de 20M sobre un tecnicismo incomprensible fuera de su micro-nicho.

### Los 7 Filtros de Eliminación de Ideas (Descarte Sistemático)
Antes de avanzar una idea de video, pasarla por los 7 filtros de descarte:
1. *Factibilidad Técnica/Económica:* ¿podemos producir este video con los recursos, herramientas y tiempos actuales sin comprometer semanas de trabajo?
2. *Interés de Nuevos Espectadores:* ¿la premisa resulta atractiva para alguien que no conoce el canal ni al creador?
3. *Interés de la Audiencia Existente:* ¿satisface las expectativas de los espectadores recurrentes sin desorientarlos?
4. *Potencial de Visualizaciones (Techo de Demanda):* ¿existe masa crítica suficiente (*Market Cap of Interest*) para este tema?
5. *Alineación con la Campaña del Canal:* ¿contribuye al objetivo editorial o comercial del trimestre o es una distracción aleatoria?
6. *Capacidad de Packaging:* ¿es evidente un título contundente (≤55 caracteres) y un concepto de miniatura de alto contraste antes de redactar? Si el empaque no se visualiza de inmediato, la idea se descarta o re-empaqueta.
7. *Evidencia Negativa:* ¿por qué fracasaron otros videos con el mismo tema? ¿qué trampas de ejecución debemos evitar?

### Evidencia de Demanda Cualificada y Principio del Puente (Eugene Schwartz)
- Calibrar el nivel de conciencia donde está la masa crítica: **Problem Aware** (síntoma/dolor), **Solution Aware** (comparación de métodos) o **Mechanism Aware**.
- **Principio del Puente (*The Bridge Principle*):** Si no existe demanda directa por el mecanismo técnico o paper, construir un puente explícito desde el deseo/dolor amplio preexistente hacia el mecanismo novedoso.

### Barrido DFS Híbrido y Superficies de Descubrimiento
- Generar lista semilla (*Seed List*) en lenguaje de síntoma/deseo.
- Guiar la exploración en ventana de incógnito, registrar ratio visitas/suscriptores de outliers y ramificar por *Up Next* antes de hacer *backtracking*.
- Incluir **evidencia negativa** (videos que fracasaron con el mismo formato) para aislar trampas de ejecución.
- Evaluar la **estrategia editorial por superficie** (`[Hipótesis Editorial]`, no pesos internos fijos): Inicio (*Browse*), Sugeridos (*Up Next*), Búsqueda y Shorts.

### Protocolo de Experimentación Ágil (Canales Nuevos)
- En las primeras 10 a 20 entregas de un canal, priorizar la cadencia sostenible y el aprendizaje por sobre el perfeccionismo paralizante: *1 hipótesis concreta por video ➔ publicación ➔ observación de métricas de retención ➔ registro de lección aprendida en 05-metricas*. Pasar progresivamente de experimentación ágil a estrategia basada en evidencia consolidada.
- **Registro de Inspiración y Conexiones entre Temas:** trasplantar la *estructura* de un hallazgo fortuito o outlier; nunca copiar el empaque literal ni prometer métricas ajenas.

### Filtros y Heurísticas de Decisión Adicionales
- **[GUI-001] La Prueba de la Servilleta y Anclas Visuales (Johnny Harris & Cleo Abram):** filtro de medio audiovisual antes de avanzar una idea. ¿Sientes la necesidad de dibujar un esquema en una servilleta o mostrar una foto/video diciendo "mira esto"? Si SÍ, pertenece al medio video. Si la idea se sostiene enteramente en prosa abstracta sin apoyo visual indispensable, pertenece a un ensayo o artículo escrito, no a YouTube.
- **Heurística de Capitalización de Interés (*Market Cap of Interest*):** al elegir entre entidades o temas competidores, comparar el volumen agregado histórico de búsquedas y vistas acumuladas en YouTube; si una opción supera a otra por un orden de magnitud, se elige esa entidad para el título/sujeto del video.
- **La Regla del 3% (Virgil Abloh) y Matriz de Transposición Tridimensional:** innovar aplicando un cambio del 3% a una estructura validada, transponiendo por género/nicho, por época (cine mudo, historia) o por medio (TV, concursos).
- **Regla de Retirada de Formato (*Format Fatigue*):** los formatos tienen vida útil finita; planificar tope de episodios (3-5 o 8-10), espaciar entregas y retirar en el pico de rendimiento antes de que la audiencia fatigue.
- **Estrategia de Idiomas y Mercados Lingüísticos (`estrategia-idiomas.md`):** evaluar el alcance por **mercados lingüísticos** agrupados (Español, Inglés y Hindi), definiendo cuándo compensa producir pistas de audio multiidioma o subtítulos localizados.
