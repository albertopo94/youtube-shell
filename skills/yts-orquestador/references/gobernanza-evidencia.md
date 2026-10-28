# Gobernanza de Evidencia y Fuerzas Operativas del Framework

Este documento establece el marco normativo para clasificar el fundamento, la validación y la fuerza operativa de las técnicas, heurísticas y compuertas integradas en el framework.

Su objetivo es evitar la **inflación epistémica**: impedir que una observación empírica de una fuente externa adquiera categoría de ley universal o bloquee el avance de una producción sin evidencia previa demostrada.

---

## 1. Las Tres Dimensiones de una Técnica

Toda instrucción, heurística o control dentro del framework se define a través de tres dimensiones independientes:

```text
               ┌────────────────────────────────────────────────────────┐
               │              DIMENSIÓN A: FUNDAMENTO                   │
               │   (¿Qué sabemos de la técnica y cómo lo sabemos?)     │
               └───────────────────────────┬────────────────────────────┘
                                           │
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │           DIMENSIÓN B: FUERZA OPERATIVA                │
               │        (¿Qué debe hacer el agente con ella?)           │
               └───────────────────────────┬────────────────────────────┘
                                           │
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │          DIMENSIÓN C: DECISIÓN HISTÓRICA               │
               │       (¿Qué decidimos hacer con el hallazgo?)          │
               └────────────────────────────────────────────────────────┘
```

---

### Dimensión A: Fundamento y Validación Propia
Se divide en dos subcampos complementarios: **Tipo de Fundamento** (de dónde surge la técnica) y **Validación Propia** (qué evidencia real existe en nuestro entorno local).

#### A1. Tipo de Fundamento (Origen del Conocimiento)
| Nivel | Definición | Criterio de Verificación |
| :--- | :--- | :--- |
| **`FUENTE`** | Descrita o demostrada por un creador, estudio o plataforma externa. | Archivo original y cita precisa en `_framework/referencias/`. No prueba que funcione en nuestro flujo. |
| **`HIPÓTESIS`** | Propuesta o explicación plausible formulada internamente, aún no contrastada. | Formulación teórica justificada en el rol correspondiente. |
| **`DERIVACIÓN`** | Adaptación de un principio clásico de otra disciplina (cine tradicional, edición analógica, literatura). | Doctrina de referencia archivada y adaptada a la escala de YouTube. |
| **`CONTRATO INTERNO`** | Regla de arquitectura, invariante estructural o gobernanza propia de la oficina. | Definida por el creador o por el estándar operativo del framework. |

#### A2. Validación Propia (Estado en Nuestro Entorno Local)
| Estado de Validación | Definición | Criterio de Demostración |
| :--- | :--- | :--- |
| **`SIN_PROBAR`** | No se ha ejecutado ninguna prueba en este hardware o entorno de trabajo. | Ausencia de archivos de prueba o logs de ejecución local. |
| **`PILOTO_PARCIAL`** | Probada en el entorno local pero cubriendo solo un subconjunto de casos o sin completar el ciclo completo. | Registro de prueba técnica puntual archivado (ej. render de placas sin pista de audio). |
| **`PILOTO_VALIDADO`** | Probada con éxito y evidencia física verificada en una entrega completa de video. | Master exportado que cumple todos los criterios técnicos en el piloto. |
| **`REPETIDA`** | Resultados consistentes y reproducibles a lo largo de dos o más videos independientes. | Trazabilidad en múltiples entregas en `videos-publicados/`. |
| **`VERIFICADA_DETERMINÍSTICAMENTE`** | Comprobada de forma estricta y reproducible mediante código, script o CI. | Exit code 0 en `check-contrato.sh` o tests automatizados. |

---

### Dimensión B: Fuerza Operativa
Responde a: *¿Qué grado de obligatoriedad tiene para el agente o creador?*

| Fuerza Operativa | Comportamiento del Agente | Margen de Desviación |
| :--- | :--- | :--- |
| **`INFORMATIVA`** | Conocimiento contextual o lección aprendida. | No prescribe ninguna acción obligatoria. |
| **`RECOMENDADA`** | Opción predeterminada y aconsejada dentro de su ámbito. | Admite alternativas o excepciones con justificación creativa breve en el documento de trabajo. |
| **`OBLIGATORIA`** | Mandato de diseño dentro del ámbito formalmente definido. | Debe cumplirse; las excepciones requieren autorización expresa del creador. |
| **`COMPUERTA`** | Punto de control estricto que **bloquea el paso de fase** hasta cumplirse. | Cero tolerancia. Requiere evidencia objetiva o aprobación explícita humana. |

---

### Dimensión C: Decisión Histórica de Incorporación
Responde a: *¿Qué dispuso la oficina tras auditar la fuente?* (Utilizada en los ledgers de auditoría):
- **`ADOPTADO`:** Incorporada tal como fue descrita.
- **`ADAPTADO`:** Reformulada para hacerla agnóstica de software o ajustada a nuestra escala.
- **`CONSERVADO SIN DUPLICAR`:** Ya cubierta previamente por el framework.
- **`RECHAZADO`:** Descartada formalmente con motivo documentado.

---

## 2. Requisitos Mandatorios de una COMPUERTA (Gate)

Para que una regla tenga la fuerza de **`COMPUERTA`** y pueda detener la producción de un video o fase, **debe declarar contractualmente cuatro campos**:

1. **Condición de aceptación:** Qué condición inequívoca debe cumplirse.
2. **Verificador:** Quién o qué realiza la comprobación. Se distinguen dos modalidades:
   - **Compuerta Técnica Determinista:** Verificada por código (`check-contrato.sh`, linters o tests de CI).
   - **Compuerta Editorial Humana:** Verificada mediante inspección y firma del creador o auditor humano (aprobación de packaging, guion o revisión factual).
3. **Evidencia:** Dónde queda registrado físicamente el comprobante del resultado (log de terminal, DOI en `06`, casillas de firma en `00`, o diff limpio).
4. **Excepción autorizada:** Quién puede dispensar la regla y cómo se asienta el motivo.

> **Regla de oro anti-bloqueo artificial:** Un agente **nunca puede convertir una recomendación editorial subjetiva en una compuerta que paralice la producción**. Si el criterio es subjetivo (ritmo, tono, humor), la única compuerta válida es el visto bueno del creador humano.

---

## 3. Ciclo de Promoción de Técnicas

Una técnica no se vuelve obligatoria ni compuerta por el simple hecho de ser redactada en un archivo canónico:

```text
[Hallazgo en Fuente] 
       │
       ▼
 [Auditoría con Decisión (Adoptado / Adaptado)] 
       │
       ▼
 [Registro con Fuerza RECOMENDADA + Ámbito Delimitado] 
       │
       ▼ (Ejecución real en Producción / Piloto)
 [Evidencia Registrada en Disco] 
       │
       ▼ (Consistencia en Múltiples Entregas)
 [Promoción a OBLIGATORIA o COMPUERTA con Visto Bueno Humano]
```
