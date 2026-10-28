1. Qué está bien integrado y qué no
Esta es la clasificación que utilizaría para evaluar cada aprendizaje:
- Completo: está representado con el significado y las condiciones importantes, llega al contexto adecuado y tiene la forma de aplicación correcta.
- Parcial: aparece, pero se han perdido pasos, matices, límites o condiciones de uso.
- Ausente del consumidor: sigue en youtube, pero no he encontrado una incorporación suficiente en la skill, las referencias empaquetadas o la plantilla que utiliza youtube-shell.
- Documentado, pero no verificado automáticamente: el agente tiene instrucciones, pero el runtime no comprueba por sí mismo que se hayan aplicado de verdad.
- Pendiente por decisión: se ha aplazado expresamente y no debe confundirse con un olvido accidental.
Área de conocimiento	Estado de mi auditoría
Gobernanza, fases y aprobaciones	Bien integrada en términos generales, con controles reales
Selección del modo audiovisual	La última versión ya corrige las discrepancias principales
Packaging y miniaturas	Bastante bien integrada en las plantillas; integración parcial en la skill
Investigación de ideas y demanda	Parcial; he detectado pérdidas metodológicas importantes
Guion y narrativa	Parcial; faltan técnicas específicas de apertura y dirección de la voz
Dirección visual y cinematográfica	Parcial; algunas técnicas importantes no llegan al consumidor
Fact-checking y derechos	Buena estructura de control; la verdad de las afirmaciones y las licencias requiere revisión humana
Medición y aprendizaje posterior	Buena estructura, con una limitación entre la regla de pacing y lo que mide el runtime
Trazabilidad de los aprendizajes	Insuficiente para demostrar que cada técnica adoptada llegó al consumidor

Veamos los hallazgos que sostienen esa clasificación.
2. Investigación e ideación: primera prioridad
En el rol de investigación de youtube tienes una metodología bastante más completa que la que aparece en la skill de investigación de youtube-shell.
Parcial
2.1. Identificación de outliers

El documento maestro desarrolla la comparación de un vídeo con la mediana de vídeos comparables del mismo canal durante una ventana reciente de entre tres y seis meses, además de distinguir las visualizaciones de Shorts de las de vídeos largos.

La skill del consumidor resume el paso como registrar el ratio de visitas frente a suscriptores y ramificar por vídeos relacionados.

Qué falta: mantener el criterio temporal y la comparación con vídeos equivalentes. El ratio respecto a suscriptores puede seguir siendo una señal auxiliar, pero no debería sustituir a esa metodología.

Es una pérdida relevante porque puede cambiar qué vídeos se consideran verdaderamente atípicos y, por tanto, qué estructuras se estudian.

Parcial
2.2. Los siete filtros de eliminación de ideas

El maestro contiene siete filtros: factibilidad, interés de nuevos espectadores, interés de la audiencia existente, potencial de visualizaciones, alineación con la campaña del canal, capacidad de crear un buen packaging y búsqueda de evidencia negativa.

La skill conserva algunas partes, como la demanda cualificada, la evidencia negativa, el principio del puente y la estrategia por superficie. Pero no reproduce el procedimiento completo de los siete filtros.

La plantilla de packaging sí incorpora Tema, Formato y Ángulo, pero esos tres campos no sustituyen al proceso de descarte.

Qué falta: trasladar el procedimiento completo a la skill o a una referencia operativa que esta active al evaluar ideas, sin convertir automáticamente cada heurística en una compuerta rígida.

Parcial
2.3. Experimentación ágil y maduración del canal

En el maestro existe un protocolo para las primeras publicaciones: formular una hipótesis por vídeo, publicar a un ritmo sostenible, registrar el aprendizaje posterior y pasar progresivamente de experimentación a estrategia basada en evidencia.

La plantilla 05-metricas-retencion.md recoge la retrospectiva y una mejora para el siguiente vídeo. Eso es correcto, pero no sustituye todo el protocolo de experimentación inicial.

También se pierde parte del procedimiento opcional para registrar conexiones inesperadas entre temas y convertirlas en ideas originales.

Qué falta: integrar explícitamente el ciclo hipótesis → publicación → observación → aprendizaje y explicar cuándo procede usarlo. No basta con disponer de una plantilla de métricas.


Una cuestión de alcance
La skill afirma que sirve para explorar o validar ideas de canales, pero youtube-shell está organizado principalmente alrededor de las siete fases de un vídeo. No he encontrado un flujo equivalente que empaquete la plantilla de estudio de canal y toda su metodología como una capacidad de primera clase del consumidor.

Eso no significa que el shell no pueda hablar sobre un canal. Significa que la capacidad de explorarlo de manera sistemática, producir su estudio de viabilidad y cerrar esa tarea con entregables propios no está integrada al mismo nivel que el pipeline de un vídeo.

Si pretendes que youtube-shell abarque también la investigación y la creación estratégica de canales, debería incorporarse como un flujo separado. Si el alcance del producto es exclusivamente producir vídeos, se puede declarar como una capacidad externa o futura sin trasladar innecesariamente las plantillas completas de canal.
3. Packaging: buen traslado estructural, con una pérdida metodológica
Aquí hay una diferencia importante entre lo que está en la skill y lo que está en la plantilla.

La plantilla de packaging del consumidor ya incluye las cuatro pruebas que recomienda tu framework: legibilidad al 18%, contraste respecto a competidores, comprensión rápida y comparación entre boceto y render final. También contiene campos para la brecha de curiosidad, los elementos focales y las tres variantes de miniatura.

Por tanto, no sería correcto decir que esas pruebas se perdieron por no estar todas desarrolladas en SKILL.md: están disponibles en 01-packaging.md.

La pérdida está en otros detalles.

El maestro define cinco arquetipos de curiosidad —Moment, Story, Result, Transformation y Novelty— y explica qué mecanismo psicológico explota cada uno. La plantilla enumera sus nombres, pero no sus definiciones. La skill pide cinco ángulos de título y tres miniaturas diferentes, pero tampoco recupera íntegramente esas explicaciones.

Además, el rol 02 prescribe investigar referencias visuales antes de diseñar: examinar miniaturas de vídeos destacados del tema y utilizar herramientas visuales disponibles sin depender de servicios de pago. No he encontrado esa secuencia completa como instrucción activa en la skill ni en la plantilla.

Recomendación: no añadiría otra checklist de packaging, porque ya existe una bastante buena. En cambio, incorporaría a la skill una pequeña caja de herramientas que explique los arquetipos de curiosidad y el procedimiento de investigación de referencias. Así, el agente sabrá cómo elegir y construir los conceptos, en vez de limitarse a rellenar los campos de la plantilla.

Referencia: rol 02 de youtube.
4. Guion y narrativa: faltan herramientas creativas concretas
La integración de la escritura por bloques, la congruencia entre promesa y contenido, el anti-spoiler condicionado por formato, la aportación editorial propia y el CTA como siguiente paso útil está bien encaminada. La plantilla del guion también contiene un control de declaración de contenido sintético y unas instrucciones más amplias que las de la skill.

Pero he detectado tres lagunas.
4.1. La estructura R.A.I.N.Y. y las técnicas alternativas de apertura

Tu rol 03 incluye la estructura R.A.I.N.Y. y una caja de técnicas para abrir el vídeo: reafirmar la promesa, explicar la ventaja específica del narrador, presentar una hoja de ruta cuando conviene, adelantar la experiencia y otros recursos.

Esas técnicas se desarrollaron a partir del estudio de la Masterclass de YouTube 2025. No he encontrado R.A.I.N.Y. ni esa caja de herramientas trasladadas a la skill de guion o a la plantilla del consumidor.

Corrección: incorporarlas como un repertorio opcional de aperturas, seleccionado según género, duración y promesa. No imponer una fórmula única a todos los vídeos.

4.2. La identidad sonora contra la voz genérica de IA

El maestro, a partir del estudio de Zack D. Films, destaca la importancia de construir una identidad vocal diferenciada en canales sin presentador, sin depender automáticamente de las voces estándar más trilladas.

La skill actual sí contempla Voice Prompting y acotaciones actorales. Es un buen traslado, pero no recoge con la misma claridad ese principio de identidad sonora y la decisión de no conformarse con una voz genérica cuando la identidad del canal es importante.

Corrección: incluir esta elección en la dirección de voz, preservando que es una recomendación condicionada al proyecto, no una prohibición de usar cualquier voz de biblioteca.

Posible contradicción
4.3. “Audaz” no debe eliminar la incertidumbre legítima

En la skill de guion, la regla de las 3 B exige frases asertivas y sin condicionales que socaven la autoridad. Sin embargo, la versión desarrollada del maestro explicita que esta regla no puede suprimir la matización científica necesaria, especialmente en temas YMYL.

La plantilla del guion sí contiene un apartado específico de rigor científico, pero no es ideal que el propio enunciado de estilo quede más absoluto en el consumidor que en su fuente.

Corrección: aclarar en la skill que se deben eliminar las vacilaciones verbales innecesarias, pero conservar los calificadores que reflejan la evidencia real: asociación frente a causalidad, hipótesis frente a conclusión, y límites de los estudios en animales frente a humanos.


También convendría distinguir entre una regla creativa y su comprobación. El runtime puede detectar bloques ausentes o marcadores sin resolver; no puede demostrar por sí solo que el gancho sea irresistible o que el payoff emocione. Eso necesita criterios visibles y revisión editorial humana.

Referencia: skill de guion y narrativa y plantilla de guion.
5. Dirección audiovisual: las mayores pérdidas cualitativas
Esta es la otra zona en la que recomendaría reforzar la integración.

La base de producción audiovisual sí está trasladada: los cuatro modos, la escalera de complejidad de escenas generadas por IA, la estrategia asset-first, la planificación de pruebas económicas, el aislamiento de audio, las cuatro capas de pulido y la medición del master están presentes en la skill y/o en la plantilla de storyboard.

Lo que falta son algunos de los aprendizajes más específicos que añadiste a la segunda mitad del rol 04.
Las 3 C del montaje: Content, Clarity y Continuity

El rol 04 desarrolla la distinción entre visuales que aclaran o demuestran algo y visuales que solo decoran; el punto focal de cada plano; y la continuidad de los cortes, del movimiento y del estilo.

La skill contiene las capas de pulido, la continuidad y la atenuación selectiva del foco, y la plantilla incluye buena parte del control visual. Pero no he encontrado la doctrina completa de las 3 C trasladada como método de decisión.

Por qué importa: ayuda al agente a decidir qué mostrar y qué eliminar, no solamente cómo pulir un montaje una vez elegido.



Dirección de tensión visual y emoción

El rol 04 incorpora técnicas como el espacio de acecho (lurking space), la amenaza que el espectador conoce antes que el personaje, la mirada fuera de cuadro, el salto abrupto de escala y la rima visual con variación atmosférica.

No las he encontrado desarrolladas en las skills o en las plantillas activas de youtube-shell.

Por qué importa: son herramientas creativas concretas para construir intriga y emoción en ficción, misterio, cortos y vídeos cinematográficos; no son simples detalles técnicos de edición.

Deberían trasladarse a la skill de dirección como un repertorio condicional, sin convertirlas en obligaciones para un tutorial de software o un vídeo de relax.



Autenticidad física y vestimenta del presentador

Tus estudios adoptaron dos ideas adicionales: usar objetos y demostraciones físicas cuando aportan cercanía frente a una producción digital excesivamente perfecta; y alinear la vestimenta del presentador con el universo temático cuando hay A-Roll.

El rol 04 las desarrolla, pero no las he encontrado incorporadas de forma operativa en la skill o en la plantilla del storyboard del consumidor.

Por qué importa: afectan a la dirección de arte y a la experiencia percibida, no solo al acabado técnico.



El primer cuadro de un Short (Frame Zero)

El maestro recoge un aprendizaje específico de la Masterclass sobre el primer cuadro de un vídeo corto. El consumidor sí exige que el Short se evalúe desde el segundo cero y contempla microplanos por oración, pero no he encontrado transferida la técnica denominada Frame Zero como instrucción diferenciada.

Por qué importa: la idea general de captar interés inmediatamente no equivale a un procedimiento específico para diseñar el primer cuadro.



Hay otras técnicas pequeñas pero valiosas —como texturizado secundario para evitar la piel artificial, asignación de tareas diferenciadas a extras o determinadas decisiones de vestuario y continuidad— que también deberían aparecer en la matriz de cobertura. Algunas están mencionadas en la fuente y otras parcialmente en la plantilla, pero el detalle operativo no se conserva de manera uniforme en el consumidor.

Referencia: rol 04 de youtube, skill de dirección y plantilla de storyboard.
6. No todo aprendizaje documentado está verificado por el runtime
Este es un aspecto diferente de que falte conocimiento.

En tus repositorios hay una separación bastante buena entre lo determinista y lo editorial. Por ejemplo, el checker puede exigir cinco títulos, tres conceptos de miniatura o que no queden filas de fact-checking pendientes. No puede certificar que un título sea mejor que otro, que la fuente realmente sostenga la afirmación o que una miniatura genere la curiosidad adecuada.

La distinción está documentada en el mapa, pero algunas entradas de framework-map.json asignan a un rol completo la disposición enforced_in_runtime. Eso puede dar a entender que todo el conocimiento de ese rol está impuesto por código, cuando solo determinadas partes tienen verificadores deterministas.

Propondría separar explícitamente en el mapa:
1. Qué aprendizaje queda inyectado o disponible como instrucción de la skill.
2. Qué verificador automático comprueba una condición concreta.
3. Qué evaluación depende de la revisión humana.
4. Qué prueba demuestra que la regla se aplica de esa manera.
Esto también afecta a la declaración de contenido sintético. La decisión está documentada en la plantilla del guion y en las tablas de registro de recursos, pero no he encontrado una comprobación determinista que demuestre que la decisión se ha tomado correctamente o que se ha completado la declaración correspondiente en YouTube Studio. Eso no significa que deba automatizarse una decisión que requiere juicio humano; significa que debe identificarse como un punto de control humano explícito y comprobarse en la fase adecuada.
7. Hay una limitación en la medición objetiva del ritmo
He encontrado otra diferencia relevante para tu objetivo de convertir el conocimiento en controles reales.

La metodología del rol 04 describe un perfil de pacing por plano: por defecto, no mantener un plano estático más de cinco segundos sin variación visual, salvo justificación creativa.

En cambio, media-measurement.ts utiliza una métrica de duración media por segmento visual contra maxAverageShotSec. Esa medida es útil, pero no es equivalente a comprobar la duración máxima de cada plano: un montaje puede tener una media aceptable y un plano individual excesivamente largo.

Mi recomendación sería elegir explícitamente entre dos políticas. Si quieres que el runtime imponga una condición por plano, habría que medir la duración máxima de cada segmento relevante o introducir un control adicional. Si lo que buscas es detectar anomalías con una métrica agregada y dejar la revisión por plano al creador, hay que documentarlo como tal y no afirmar que el runtime aplica íntegramente la regla individual.

Esta diferencia entre regla de dominio y métrica utilizada para verificarla es exactamente el tipo de discrepancia que merece una prueba de aceptación específica.
8. Falta trazabilidad entre los estudios y el consumidor
Tus auditorías de procedencia ya registran decisiones de adoptar, adaptar o rechazar técnicas. Eso es valioso: por ejemplo, la auditoría de la Masterclass de YouTube registra R.A.I.N.Y. y Frame Zero, y el estudio sobre MrBeast recoge también aprendizajes de dirección del presentador. Pero no todos esos aprendizajes aparecen en la skill o en las plantillas de youtube-shell.

Hay otra cuestión en la estructura actual: framework-map.json describe las fuentes y reglas a un nivel relativamente alto, y su prueba de fidelidad semántica verifica términos esperados en una skill. No comprueba que todos los aprendizajes adoptados de cada fuente estén representados. Además, el mapa no se utiliza actualmente como un enrutador que haga que el runtime cargue automáticamente cada técnica; funciona principalmente como inventario de trazabilidad y pruebas de consistencia.

Esto implica que un aprendizaje puede estar marcado como adoptado en youtube y aun así faltar en el consumidor sin que el CI lo detecte.

Yo no resolvería esto intentando copiar los documentos maestros completos. Crearía un registro de cobertura de conocimiento por aprendizaje, con campos como estos:
Campo	Ejemplo
ID de aprendizaje	IDEA-OUTLIER-01
Fuente canónica	roles/01-investigacion-ideas.md, detección de outliers
Principio que se debe conservar	Comparar vídeos equivalentes en una ventana temporal y distinguir formatos
Destino del consumidor	skills/yts-investigacion-ideas/SKILL.md
Cuándo se activa	Al buscar y evaluar vídeos atípicos durante investigación
Forma de aplicación	Instrucción de la skill + apoyo de investigación
Estado actual	Parcial
Evidencia pendiente	Comprobar el procedimiento con un caso de investigación representativo

Ese registro permitiría auditar los aprendizajes en vez de limitarse a comprobar que cada fichero de origen tiene una entrada en el mapa.
9. Los cambios que haría primero
Por impacto, los priorizaría de esta manera:
Prioridad	Cambio propuesto
P1	Restaurar en yts-investigacion-ideas la metodología temporal de outliers y los siete filtros de eliminación de ideas, junto con el ciclo de experimentación inicial
P1	Completar yts-guion-narrativa con la caja de herramientas de apertura y la identidad sonora, y corregir la formulación de la regla de las 3 B
P1	Incorporar a yts-direccion-edicion las 3 C del montaje, la caja de herramientas de tensión visual y la dirección de autenticidad física y A-Roll
P1	Alinear la regla de pacing por plano con el alcance real de la métrica de duración media del runtime
P2	Crear una matriz de cobertura a nivel de aprendizaje y conectar cada aprendizaje adoptado con su destino, activación y evidencia
P2	Aclarar el alcance de la exploración de nuevos canales y proporcionar su flujo y plantillas si debe ser una capacidad propia del producto
P2	Marcar la declaración de contenido sintético como punto de control humano explícito y verificable
P2	Actualizar el documento de compatibilidad de youtube, que todavía indica youtube-shell v0.10.0 y una revisión antigua del framework, aunque el consumidor actual está en v0.11.0

Hay una cosa que sí se ha corregido desde la auditoría anterior: el modo audiovisual ya tiene una autoridad de estado más coherente. El runtime rechaza una discrepancia entre el registro y la vista Markdown, y existen pruebas para los cambios de modo mientras P03 está en curso o pendiente de aprobación. El CI actual de youtube-shell pasa, igual que el control de contrato de youtube. Esto es un avance real, aunque no demuestra cobertura semántica completa.

El checkpoint de aceptación anterior al guion también merece un estado explícito: youtube/PENDIENTES.md lo sitúa como paso inicial de la primera producción real, mientras que el shell actualmente exige la aprobación de la hoja de aceptación antes del render. Lo clasificaría como una diferencia de alcance pendiente de decisión de producto, no como un olvido ya demostrado.

Mi conclusión
Tu preocupación original estaba justificada: no bastaría con que el consumidor tuviera una skill de investigación que diga «busca outliers», otra de guion que diga «escribe para retener» y otra de dirección que diga «edita bien». Eso conservaría los nombres de las disciplinas, pero podría perder los métodos concretos que tú investigaste.

En esta primera auditoría aparecen ejemplos claros de esa pérdida: el método temporal de outliers, los filtros de eliminación, la caja de aperturas R.A.I.N.Y., la identidad sonora y varias técnicas cinematográficas que el framework declara adoptadas pero que no he encontrado trasladadas al consumidor.

El siguiente paso adecuado no es seguir haciendo correcciones aisladas sin un criterio común. Es convertir esta auditoría en un inventario de cobertura por aprendizaje y recorrerlo hasta que cada elemento importante de youtube tenga uno de estos destinos explícitos: integrado y verificado, integrado parcialmente con una corrección definida, deliberadamente excluido con justificación, o pendiente de decisión.