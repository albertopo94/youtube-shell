# 03 - Storyboard, Orquestación de Assets y Plan de Montaje

- **Canal / Video:** 
- **Entorno de Montaje Principal:** `[ ] FilmCraft (CLI / MCP)` / `[ ] DaVinci Resolve` / `[ ] Premiere Pro` / `[ ] CapCut` / `[ ] Híbrido`
- **Estrategia de Adquisición Multifuente:**
  - *Generación Cinemática / Abstracta:* Google Flow / Midjourney / Flux
  - *B-Roll Real / Documental:* Coverr / Pexels / Wikimedia Commons / Google Imágenes
  - *Motion Graphics / Efectos:* EffectCraft / Rótulos gráficos

---

## 🎨 1. Consistencia Visual y Libertad de Contraste Intencional

- **Anclajes de Coherencia Estética del Video:**
  1. *Motor / Medio visual:* `[ej. Cinematic 35mm grain / Ilustración 3D / Micrografía de laboratorio]`
  2. *Paleta cromática dominante:* `[ej. Tonos fríos azulados con sombras navy y acentos teal]`
  3. *Iluminación y óptica:* `[ej. Volumétrica suave, lente 50mm con poca profundidad de campo]`
  4. *Sujeto / Escenario Maestro:* `[Imagen o nodo de referencia fijado en Google Flow]`
- **Rupturas Visuales Intencionales (Opcional por humor o impacto):**  
  *(¿Hay algún plano que rompe deliberadamente el estilo para causar gracia, sorpresa o excentricidad consciente? ej. meme retro pixel art, plano VHS o dibujo infantil)*:

---

## 🚦 2. Fase 1: Montaje Preliminar (Animatic & Radio Edit)

> **Punto de control de costos y ritmo:** Antes de generar renders en alta resolución con IA o descargar clips de pago, se monta la locución provisional con imágenes temporales de baja fidelidad.

- [ ] **Radio Edit completado:** Locución provisional montada con silencios y pausas medidos.
- [ ] **Wireframe visual (Animatic):** Placas temporales o capturas fijadas sobre la voz para verificar el ritmo.
- [ ] **Hito de Aprobación Narrativa (Creador):**
  - ¿Algún bloque se siente denso o apresurado? (Ajustar en `02-guion.md`).
  - *Estado:* `[ ] Aprobado para producción definitiva` / `[ ] Requiere ajustes`

---

## 🎬 3. Fase 2: Tabla de Escenas y Adquisición de Assets

> **Nota de trazabilidad y entrega de prompts:** Cada fila enlaza con el bloque de guion `[Bxx]` correspondiente.  
> **Ficha de Prompt Obligatoria:** Todo prompt que el agente entregue al creador debe indicar:  
> 1) *Tipo de Asset* (🖼️ Imagen estática / 🎥 Clip de video / 🎵 Música / 🔊 SFX).  
> 2) *Herramienta y Pestaña exacta* (ej. Google Flow `flow.google.com` ➔ Pestaña *"Imagen"* vs. Pestaña *"Video"*).  
> 3) *Modo operativo* (Text-to-Image 16:9, Image-to-Video con cámara, etc.).  
> 4) *Prompt listo para copiar*.

| Escena # | Bloque Guion | Timecode | Texto de Locución Asociado | Tipo de Asset (Imagen / Video / Audio) | Herramienta Destino & Módulo Exacto | Prompt de Generación / URL del Asset | Diseño Sonoro (SFX / Música) |
| :---: | :---: | :---: | :--- | :---: | :--- | :--- | :--- |
| **01** | `[B01_Dilema_BucleAbierto]` | `← derivar` | *"..."* | 🖼️ Imagen estática *(luego animar)* | Google Flow ➔ Pestaña *"Imagen"* (Imagen 3) | `[Prompt con anclajes de estilo] --ar 16:9` | Impact Whoosh + Pista musical |
| **02** | `[B02_La_Falsa_Causa]` | `← derivar` | *"..."* | 🎥 Clip de video | Stock libre: Coverr / Pexels | `[URL directa de búsqueda / descarga]` | Sub-bass bajo voz |
| **03** | `[B03_El_Quiebre_o_Anomalia]` | `← derivar` | *"..."* | 🎥 Clip de video cinemático | Google Flow ➔ Pestaña *"Video"* (Veo) | `[Prompt con movimiento de cámara]` | SFX click en palabra clave |
| **...** | ... | ... | ... | ... | ... | ... | ... |

> **Los timecodes de esta tabla no son ejemplos fijos.** Derivan del **guion aprobado en `02-guion.md`** y de la **locución real medida** (duración y pausas del audio grabado). Un ejemplo con números concretos se copia; un ejemplo con "← derivar" no. Antes esta tabla llevaba IDs y tiempos de la estructura previa (`[B01_Dilema]`, `00:00-00:08`), que no coincidían con el guion (`[B01_Dilema_BucleAbierto]`, `00:00-00:15`) y se propagaban como si fueran reales.

---

## 🎛️ 4. Las 4 Capas Obligatorias de Pulido Técnico (No Aceptar Ensambles Crudos)

Para que el montaje se considere profesional (sea ejecutado por el agente en FilmCraft o en editor de escritorio), debe incorporar estas cuatro capas:

1. **Regla de Pacing Visual ( perfil por defecto, con excepción justificada):**
   - **Por defecto:** ningún plano estático permanece en pantalla más de **5 segundos** sin un cambio visual (corte a nuevo plano, detalle B-roll, punch-in de escala 100% a 105%, o aparición escalonada de textos).
   - **Excepción permitida:** si el formato lo justifica, se puede extender el plano. La extensión **paga peaje**: se escribe en esta tabla una línea de **propósito creativo** (ej. "bloque de payoff emocional, la quietud es el recurso").
   - **Prohibido:** "se me ocurrió así", "lo dejé como está" o cualquier extensión sin una frase de propósito. La justificación se evalúa en la misma escena que el plano.
   - **No es universal:** videos Music-First / ambient, ensayos contemplativos o explicaciones lentas pueden tener planos más largos con justificación; el umbral de 5 s es el perfil por defecto, no una ley para todos los géneros.
2. **Cortes de Continuidad (J-Cuts y L-Cuts):**
   - [ ] En transiciones narrativas clave, el audio de la siguiente escena entra entre 12 y 24 fotogramas (0.5 a 1s) antes de que la imagen corte, evitando cambios de plano secos.
3. **Arquitectura de Audio (estudio de sonoro, perfil por defecto):**
   - [ ] **Pista A1 (Voz):** Nivel de locución normalizado a estándares de transmisión (**−23 LUFS** integrado, pico < −1.5 dBTP) mediante `essentialSound.autoMatch`.
   - [ ] **Pista A2 (Música):** Curva de ducking sobre la música: reducida a **−18 dB** durante la voz, subiendo con rampa suave (*fade-up*) a **−12 dB** en las pausas dramáticas (`essentialSound.generateDucking`).
   - [ ] **Pista A3 (SFX):** Efectos de sonido de acento (impactos, swooshes, clicks) colocados exactamente en la sílaba o fotograma donde ocurre el gancho visual.
   - **Estos valores son el perfil por defecto.** Un formato distinto (ambient, documental sonoro, etc.) puede variarlos con **justificación escrita en esta tabla**; lo que no se puede variar es que el resultado se **mida y escuche**: narración clara, equilibrio inteligible y ritmo vivo. Exigir un resultado editorial no es lo mismo que exigir una técnica concreta.
4. **Dinámica de Cuadro (*Pacing Visual*):**
   - [ ] En planos estáticos o imágenes fijas que duren **más de 5 segundos**, aplicar zooms continuos sutiles (*punch-ins* de escala 100% a 105% o paneo Ken Burns) para evitar sensación de foto congelada.
   - **Antes esta regla decía "más de 3 segundos" y la regla 1 decía "4 a 7".** Dos umbrales distintos y ninguno aplicable a todos los géneros; se unifican en 5 s como perfil por defecto, con la excepción justificada de la regla 1.
