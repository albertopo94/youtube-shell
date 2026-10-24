# 04 - Registro Integral de Procedencia, Licencias y Activos de IA de este Video

> Documentar cada clip de stock, imagen de IA, voz sintética, pista musical y tipografía antes del render final.
>
> **Agnóstico de proveedores (ver `AGENTS.md` §02.4):** los nombres de herramientas y plataformas en las tablas son **ejemplos ilustrativos**, no el flujo: se registran siempre las que se usen realmente. Los valores de las columnas de licencia/permiso de los ejemplos están **marcados como ilustrativos o pendientes de verificación**: una plantilla no puede dar por autorizado un recurso no investigado.

---

## 1. Material de Stock y Archivo Externo (Video y Fotos)

| Archivo Local | Plataforma / Repositorio | URL Original del Asset | Creador / Autor | Licencia Exacta y Versión | Permiso Comercial | ¿Requiere Atribución? | Texto Exacto de Atribución (para descripción de YouTube) | Evidencia de Términos (Captura o Enlace Guardado) |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `clips/intro.mp4` | `[ej. banco de stock libre]` | `https://...` | Creador X | `[VERIFICAR — ej. licencia del banco, con fecha]` | `[VERIFICAR]` | `[VERIFICAR]` | `[redactar tras verificar]` | `[guardar captura o enlace en licencias/]` |

---

## 2. Activos Visuales Generados por IA (Miniaturas, Fondos, B-roll, Video)

| Archivo Local | Herramienta / Modelo IA (y versión si se conoce) | Archivo de Referencia de Entrada (si aplica) | Plan y Cuenta | Costo Real (créditos/moneda) | Condiciones de Uso Verificadas (comercial, atribución) | Prompt Utilizado | Seed / Parámetros | ¿Muestra Personas / Hechos Reales? | ¿Requiere Declaración IA en YouTube Studio? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| `thumb_v1.png` | `[ej. generador de imagen, con versión]` | `[REF-01 / imagen de referencia usada]` | `[plan de la cuenta]` | `[registrar costo real; nunca asumir 0]` | `[VERIFICAR en términos del plan]` | `"..."` | `--ar 16:9, etc.` | No | `[SÍ/NO según política vigente de YouTube Studio]` |

> **Trazabilidad de la generación:** registrar siempre el modelo **con su versión**, la referencia de entrada, el prompt exacto y los parámetros, para poder repetir o derivar la generación. Si el activo se animó a partir de una imagen, indicar también el generador de video y su versión.

---

## 3. Locución y Voz Sintética / TTS

| Archivo de Audio | Proveedor / Servicio | Modelo y Nombre de Voz | Tipo de Voz (Biblioteca vs. Clonada Propia vs. Tercero) | Plan de Cuenta | ¿Otorga Derechos Comerciales? | ¿Imita a una Persona Real Conocida? | ¿Requiere Declaración en YouTube Studio? |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| `audio/locucion.wav` | `[ej. proveedor de voz sintética]` | `[modelo / voz elegida]` | Biblioteca estándar | `[plan de la cuenta]` | `[VERIFICAR]` | No | `[SÍ/NO]` |

---

## 4. Música y Efectos Sonoros (SFX)

| Archivo Local | Plataforma / Proveedor | Título / Artista | Tipo de Licencia / Plan | Clearing Content ID (si aplica) | Atribución Requerida | Texto de Atribución Requerido |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| `audio/track1.mp3` | `[ej. biblioteca musical libre]` | Track A / Artista B | `[VERIFICAR tipo de licencia]` | `[VERIFICAR]` | `[VERIFICAR]` | `[redactar tras verificar]` |

---

## 5. Tipografías Utilizadas

| Elemento | Tipografía | Origen / Diseñador | Licencia | Uso Comercial Verificado |
| :--- | :--- | :--- | :--- | :---: |
| Título Miniatura | `[ej. tipografía]` | `[origen]` | `[VERIFICAR]` | `[VERIFICAR]` |

---

## 6. Registro de Referencias Reutilizables (Personajes, Escenarios, Luz) `[Opcional]`

> **Origen:** revisión externa 4 (`_framework/referencias/auditorias/revision-externa-4-2026-10-22.md`). Se completa cuando el video (o el canal) tenga personajes, escenarios o estilos que se reutilicen entre planos o videos. Cada referencia es el ancla de continuidad de `03-storyboard-y-edicion.md` §1.1.

| ID de Referencia | Archivo o Ruta | Función (personaje / escenario / producto / iluminación / estilo) | Elementos Invariantes (rasgos que deben permanecer) | Variaciones Permitidas (qué puede cambiar por plano) | Procedencia y Permisos (origen y autorización, p. ej. persona autorizada) | Escenas Relacionadas |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `REF-01` | `refs/personaje-maestro.png` | Personaje recurrente | `[rostro, vestuario, rasgos distintivos]` | `[pose, encuadre, ángulo de cámara]` | `[foto propia / persona autorizada — verificar consentimiento]` | `[B01, B04]` |
