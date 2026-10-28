# Registro Central de Técnicas, Heurísticas y Compuertas

Este registro central cataloga las técnicas operativas seleccionadas para el framework, declarando su nivel de fundamento, validación en este entorno y su fuerza operativa conforme a `_framework/gobernanza-evidencia.md`.

---

## 1. Matriz Central de Técnicas Seleccionadas

| ID | Técnica / Regla | Fundamento | Validación Propia | Fuerza Operativa | Ámbito de Aplicación | Ubicación Canónica | Fuente / Origen | Próxima Acción de Validación |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :--- | :--- |
| **`GATE-001`** | Correspondencia Timecodes Guion ↔ Storyboard | CONTRATO INTERNO | VERIFICADA_DETERMINÍSTICAMENTE | **COMPUERTA** | Videos en producción (02 vs. 03) | `check-contrato.sh` | Revisión externa 6 | Compuerta técnica determinista: Verificador = `check-contrato.sh`; Evidencia = exit code 0; Excepción = bloques con `← derivar`. |
| **`GATE-002`** | Suite Canónica Completa (00 a 06) | CONTRATO INTERNO | VERIFICADA_DETERMINÍSTICAMENTE | **COMPUERTA** | Videos en producción | `check-contrato.sh` | Revisión externa 6 | Compuerta técnica determinista: Verificador = `check-contrato.sh`; Evidencia = existencia de los 7 archivos; Excepción = no permitida. |
| **`GATE-003`** | Verificación Factual con DOIs en YMYL | CONTRATO INTERNO | PILOTO_PARCIAL | **COMPUERTA** | Videos con afirmaciones fácticas | `roles/03` §1, `06` | Marco YMYL | Compuerta editorial humana: Verificador = Creador/Revisor; Evidencia = DOIs y fuentes en `06`; Excepción = Régimen Ficción sin afirmaciones sobre lo real. |
| **`PACK-001`** | A/B en Dos Tiempos (Macrocambios ➔ Microcambios) | FUENTE | SIN_PROBAR | **RECOMENDADA** | Pruebas de miniaturas en Long-form | `roles/02` §6 | Estudio MrBeast Cap. 9 | Registrar resultados de Test & Compare en primer video elegible. |
| **`PACK-002`** | Regla de Reducción al 18% y 3 Elementos Focales | FUENTE | SIN_PROBAR | **RECOMENDADA** | Diseño y control de miniaturas | `roles/02` §4-§5 | Masterclass 2025 (MKBHD) | Evaluar legibilidad de bocetos en móvil en fase packaging. |
| **`PACK-003`** | Thumbnail Shoot Day (Sesión en Lote) | FUENTE | SIN_PROBAR | **RECOMENDADA** | Canales con presentador / A-Roll | `roles/02` §7 | Estudio MrBeast Cap. 1 | Ejecutar primera sesión en lote si se activa canal con presentador. |
| **`GUI-001`** | La Prueba de la Servilleta / Anclas Visuales | FUENTE | SIN_PROBAR | **RECOMENDADA** | Validación de ideas en ideación | `roles/01` §5, `roles/03` | Masterclass 2025 (Harris/Abram) | Aplicar filtro a las primeras 5 ideas candidatas. |
| **`GUI-002`** | Regla de las 3 B's de Locución (Básico, Audaz, Breve) | FUENTE | SIN_PROBAR | **RECOMENDADA** | Redacción de bloques `[Bxx]` | `roles/03` §5.4 | Masterclass 2025 (MKBHD) | Auditar locución del piloto con este filtro de oraciones. |
| **`GUI-003`** | Voice Prompting y Acotaciones Actorales | FUENTE | SIN_PROBAR | **RECOMENDADA** | Locución neuronal multi-personaje | `roles/03` §5.3, `AGENTS.md` | Handoff creador / Gemini TTS | Probar modulación de Gemini TTS en el animatic piloto. |
| **`GUI-004`** | Pausas Naturales para Mid-rolls (>8 min) | FUENTE | SIN_PROBAR | **RECOMENDADA** | Videos largos (>8 min) con AdSense | `roles/03` §5, `02-guion.md` | Apuntes negocio 2026-10-27 | Verificar inserción manual en YouTube Studio tras subida. |
| **`VID-IA-001`**| Escalera de 5 Niveles para Escenas IA | FUENTE | SIN_PROBAR | **RECOMENDADA** | Planificación de escenas generativas | `roles/04` §3, `03` §3.1 | Flick / Guía Multicarácter | Clasificar los planos del storyboard según su nivel. |
| **`VID-IA-002`**| Stand-Ins Coloreados (Mapeo de Identidad) | FUENTE | SIN_PROBAR | **RECOMENDADA** | Escenas con 3+ personajes en IA | `roles/04` §3, `03` §3.1 | Flick / Guía Multicarácter | Testear en primera escena multi-personaje. |
| **`VID-IA-003`**| Mapa Cenital de Bloqueo Espacial (*Overhead Blueprint*) | FUENTE | SIN_PROBAR | **RECOMENDADA** | Escenas grupales o con fondos fijos | `roles/04` §3, `03` §3.1 | Flick / Corto Hollow | Probar vista aérea previa como referencia matriz. |
| **`VID-IA-004`**| Pipeline Asset-First e Hojas de Utilería Incrustadas | FUENTE | SIN_PROBAR | **RECOMENDADA** | Creación de personajes y accesorios | `roles/04` §3, `03` §1.1 | Flick / Task Hunters / Hell Grind | Componer accesorios en la hoja de personaje base. |
| **`VID-IA-005`**| Hojas de Localización Multicámara Reutilizables | FUENTE | SIN_PROBAR | **RECOMENDADA** | Escenarios recurrentes del canal | `roles/04` §3, `03` §1.1 | Serie animada / Los Simpson | Generar set de 4 ángulos de la localización principal. |
| **`VID-IA-006`**| Sintaxis de Etiquetado Explícito (`@tagging`) | FUENTE | SIN_PROBAR | **RECOMENDADA** | Prompts con múltiples inputs | `roles/04` §3 | Flick / Serie animada | Evaluar fidelidad de tagging en modelo de video elegido. |
| **`VID-IA-007`**| Aislamiento Acústico en Prompts de Video (`no music`) | FUENTE | SIN_PROBAR | **RECOMENDADA** | Generación de video con audio | `roles/04` §3, `03` §3.1 | Hell Grind Episodio 2 | Comprobar que el video no queme música en la pista mono. |
| **`VID-IA-008`**| Límite de Iteraciones Img2Img (Máximo 2 Pasadas) | FUENTE | SIN_PROBAR | **RECOMENDADA** | Edición encadenada de imágenes | `roles/04` §3, `03` §3.1 | Hell Grind Episodio 2 | Comparar degradación de 3 iteraciones vs. prompt limpio. |
| **`VID-IA-009`**| Regla de Borradores en 480p antes de 1080p | FUENTE | SIN_PROBAR | **RECOMENDADA** | Generación exploratoria de planos | `roles/04` §3, `03` §3.1 | Corto Vampiros / Adam | Medir ahorro de créditos en la fase de exploración. |
| **`VID-IA-010`**| Solapamiento de Diálogo para Cortes Continuos | FUENTE | SIN_PROBAR | **RECOMENDADA** | Diálogo encadenado en tomas IA | `roles/04` §3, `03` §3.1 | Corto Vampiros / Adam | Verificar empalme en la línea de tiempo del editor. |
| **`VID-IA-011`**| El Prefijo de Estilo Fijo (*Style Prefix*) | FUENTE | SIN_PROBAR | **RECOMENDADA** | Cabecera base para prompts de video | `roles/04` §3 | Hell Grind Episodio 2 | Definir cabecera visual base antes de generar escenas del piloto. |
