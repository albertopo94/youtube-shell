# 00 - Estado Persistente de Producción

- **Canal:** 
- **Video Slug / ID:** 
- **Título provisional o aprobado:** 
- **Flujo Audiovisual seleccionado:** `[ ] Audio-First` / `[ ] Screen-First` / `[ ] Speaker-First` / `[ ] Music-First`
- **Formato / género:** `[ ] Ficción` / `[ ] Relax / Ambient` / `[ ] Divulgación` / `[ ] Tutorial` / `[ ] Otro: ____`
- **Riesgo factual del contenido:** `[ ] Sin afirmaciones sobre la realidad` / `[ ] Afirmaciones factuales verificables` / `[ ] Zona Roja YMYL (Ciencia / Salud / Finanzas)`
  - *El género no exime de verificación: ficción, relax o formatos híbridos que mencionen hechos, historia, ciencia, salud o finanzas deben registrar y verificar esas afirmaciones según su riesgo.*
- **Fecha de inicio:** 
- **Última actualización:** 

---

## 🚦 Estado General del Video
**Estado actual:** `NO_INICIADO`  
*(Valores permitidos: `NO_INICIADO` | `EN_CURSO` | `BLOQUEADO` | `PENDIENTE_APROBACION` | `APROBADO` | `PUBLICADO`. `PUBLICADO` es el estado terminal tras la publicación y el archivo de cierre.)*

---

## 📋 Control de Fases y Criterios de Salida

| Fase | Estado Normalizado | Entregable Físico Verificado | Checkpoint de Aprobación | Fecha Cierre |
| :--- | :---: | :--- | :---: | :---: |
| **01. Packaging** | `NO_INICIADO` | `01-packaging.md` (5 títulos + 3 conceptos de miniatura) | `[ ] Aprobado por creador` | |
| **02. Investigación Previa** | `NO_INICIADO` | `06-fuentes-y-verificacion.md` Parte 1 (fuentes de partida; N/A solo si el contenido es puramente ficticio y no formula afirmaciones sobre la realidad) | `[ ] Verificado` | |
| **03. Guion & Originalidad** | `NO_INICIADO` | `02-guion.md` (bloques `[Bxx]` + 4 preguntas de política) | `[ ] Aprobado por creador` | |
| **04. Fact-Checking Borrador** | `NO_INICIADO` | `06-fuentes-y-verificacion.md` Parte 2 (afirmaciones contrastadas con DOIs) | `[ ] Verificado` | |
| **05. Animatic & Scratch** | `NO_INICIADO` | `03-storyboard-y-edicion.md` (locución de prueba + wireframe) | `[ ] Aprobado por creador` | |
| **06. Montaje & Licencias** | `NO_INICIADO` | Video exportado + `04-registro-recursos.md` (licencias guardadas) | `[ ] Inspeccionado` | |
| **07. Publicación & Cierre** | `NO_INICIADO` | `05-metricas-retencion.md` y `entregable-final.md` | `[ ] Publicado en Studio` | |

---

## 🛑 Bloqueos o Decisiones Pendientes
- *(Ningún bloqueo activo)*

---

## 🎥 Ficha Técnica y Verificación del Render Master (Fase 06)

- **Ruta del archivo master:** `[ej. exports/video_final_v1.mp4]`
- **Resolución y Relación de Aspecto:** `[1920x1080 (16:9) / 1080x1920 (9:16)]`
- **Tasa de fotogramas (FPS) y Códec:** `[ej. 30 fps, H.264 / AAC]`
- **Duración exacta:** `[MM:SS]`
- **Inspección Técnica de Calidad:**
  - [ ] ¿El archivo abre y reproduce de principio a fin sin errores de códec ni artefactos?
  - [ ] ¿Pacing visual conforme al perfil del video? (perfil por defecto: ningún plano estático supera **5 segundos** sin cambio visual o dinamismo; las extensiones requieren la **justificación de propósito** escrita en `03-storyboard-y-edicion.md` — el criterio de este video manda sobre el default)
  - [ ] ¿Diseño de audio adecuado al formato? (locución inteligible si aplica, música y SFX solo cuando aporten, equilibrio y picos seguros). El objetivo integrado de sonoridad, el límite de pico y el método de medición del **master final** deben constar en la hoja de aceptación; el resultado se mide cuando aplica y se escucha en control.
  - [ ] ¿Sincronización exacta entre locución y cortes de imagen (sin desfases de audio)?
  - [ ] ¿Cero fotogramas negros no intencionados ni microgaps?
  - [ ] ¿Niveles de audio balanceados (*sound check* superado en móvil y auriculares)?
  - [ ] ¿Subtítulos sincronizados y ortografía revisada (si aplica)?
- **Estado de Aprobación Técnica:** `[ ] PENDIENTE` / `[ ] INSPECCIONADO_Y_APROBADO`

---

## 🎯 Siguiente Acción Permitida
- **Acción inmediata:** Inicializar la fase de Packaging en `01-packaging.md` proponiendo 5 títulos y 3 conceptos de miniatura independientes para la prueba nativa de YouTube.
