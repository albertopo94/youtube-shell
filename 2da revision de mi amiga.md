2. Los tres problemas que todavía corregiría
Problema 1. Los modos de producción funcionan en el motor, pero no están bien reflejados en las instrucciones del agente
Es el problema funcional que más me preocupa.

En src/core/phases.ts ya has implementado cuatro modos y sus correspondientes evidencias. Por ejemplo, un vídeo Screen-First puede presentar screen_recording en lugar de scratch_track.

Sin embargo, encontré tres incoherencias relacionadas.

Primera: el sistema puede seleccionar Audio-First sin que nadie lo haya elegido.

En 00-estado-produccion.md, los cuatro modos aparecen sin seleccionar por defecto. Pero detectProductionMode() devuelve audio_first cuando no encuentra ninguna selección válida.

Después, submitPhase() guarda ese modo en el registro cuando se envía una fase.

Esto produce una situación problemática:
1. Inicializas un vídeo y dejas los cuatro modos sin seleccionar.
2. El sistema interpreta que has elegido Audio-First.
3. Envías la primera fase y guarda ese modo.
4. Más adelante seleccionas Screen-First en el documento.
5. El registro existente tiene prioridad sobre la nueva selección, por lo que el cambio puede ignorarse.
Tampoco se comprueba que haya exactamente un modo seleccionado. Si marcas dos, el código elige uno según el orden de sus comprobaciones, en vez de informar de la selección ambigua.

Segunda: el prompt del agente puede exigir una evidencia equivocada.

En context-resolver.ts, el modo activo se obtiene del registro, con Audio-First como alternativa predeterminada. No se lee allí la selección actual de 00-estado-produccion.md.

Además, el texto que construye el prompt obtiene la evidencia requerida directamente de la definición estática de la fase. P05_ANIMATIC todavía declara scratch_track en esa definición, aunque la máquina de estados ya sabe seleccionar evidencias diferentes según el modo.

Por tanto, el prompt puede decir que el modo activo es Screen-First y, al mismo tiempo, exigir scratch_track.

El motor puede aceptar la evidencia correcta, pero las instrucciones que orientan al agente siguen contradiciéndolo.

Tercera: la plantilla sigue arrastrando el vocabulario del flujo antiguo.

La plantilla compartida 00-estado-produccion.md todavía describe P05 como «Animatic & Scratch» y presenta la locución de prueba como entregable de esa fase. Eso tampoco representa bien los cuatro flujos.

Mi recomendación es corregir las tres capas: selección del modo, construcción del contexto y documentación de las evidencias.

La solución adecuada sería exigir una selección explícita de un único modo, guardar esa decisión de manera coherente y generar el prompt y los requisitos de evidencia a partir de la misma fuente de verdad. También añadiría pruebas que comprueben que una selección ausente o múltiple no se convierte silenciosamente en Audio-First.
Problema 2. La compuerta de integridad del framework no cubre todas las operaciones que modifican el estado
Has solucionado el problema principal del registro central, pero el control todavía parece tener un alcance menor que el que sugiere la documentación.

En src/gate/pi-extension.ts, el control de integridad se aplica a determinadas operaciones de herramientas y a yts_transition.

Sin embargo, los comandos interactivos registrados mediante pi.registerCommand(), como /yts-approve y /yts-approve-sheet, modifican el estado a través de sus propios manejadores sin consultar directamente getFrameworkIntegrity().

Eso significa que el control que protege las transiciones solicitadas por el agente no está aplicado uniformemente a todas las operaciones que pueden avanzar o sellar una fase.

La solución no consiste en bloquear absolutamente todo cuando el framework está dañado. Hay operaciones de consulta o recuperación que conviene permitir. Lo importante es definir una política explícita: qué operaciones pueden continuar, cuáles deben bloquearse y cuáles están autorizadas para reparar el sistema.

Yo protegería, como mínimo, las aprobaciones que hacen avanzar la producción y la aprobación de la hoja previa al render. Añadiría pruebas que intenten ejecutar esos comandos con el registro central deliberadamente inválido.
Problema 3. El mapa de trazabilidad contradice la nueva arquitectura de producción
El archivo framework-map.json ya contiene la regla MODES-01, que describe la selección del flujo audiovisual y la adaptación de las evidencias.

Eso está bien.

Pero la regla ANI-01 sigue describiendo la evidencia de P05_ANIMATIC como una obligación general de proporcionar scratch_track. El inventario de fuentes también sigue describiendo esa evidencia como parte del contrato general de dirección.

Ahora tienes dos afirmaciones contradictorias en el mismo mapa:
- Una dice que el animatic requiere siempre una pista de voz.
- La otra dice que la evidencia depende del modo de producción.
El test de framework-map.test.ts comprueba que aparezcan determinados términos, que las reglas estén estructuradas y que se hayan declarado los consumidores y las pruebas. No comprueba que estas dos descripciones sean semánticamente compatibles.

Por eso el CI puede pasar aunque el mapa esté desactualizado.

Mi recomendación es actualizar ANI-01, el inventario de la fuente de dirección y las pruebas correspondientes. El mapa debería describir el contrato vigente, no conservar una descripción del funcionamiento anterior.

3. ¿Estás utilizando todo el conocimiento de youtube?
Aquí haría una distinción importante: no necesitas transferir todos los documentos; necesitas poder justificar qué conocimiento se utiliza, qué se consolida, qué se excluye y por qué.

El mapa actual recoge 18 entradas de fuentes y categorías de conocimiento, junto con 26 reglas. Incluye los cuatro roles principales, las políticas, la gobernanza, el registro de técnicas, las plantillas y determinados estudios de referencia.

Eso es una base bastante mejor que limitarse a copiar algunos fragmentos en las skills.

Pero no equivale a demostrar que todo el conocimiento útil del repositorio maestro está integrado. En youtube hay muchas otras fuentes: transcripciones, estudios de producción audiovisual con IA, auditorías, revisiones externas y documentos de evidencia. No todas figuran individualmente en el inventario actual.

No considero que sea un error dejar fuera las transcripciones originales o los informes históricos. Muchos deben quedarse en el repositorio maestro y servir como evidencia de las conclusiones que después se consolidan en los roles y las técnicas.

Lo que todavía falta es poder distinguir de manera sistemática entre:
- Conocimiento consolidado en una skill.
- Referencias que el agente debe consultar cuando corresponda.
- Reglas que el runtime aplica mediante verificaciones deterministas.
- Material histórico que no debe formar parte del contexto operativo.
- Fuentes pendientes de evaluar o de incorporar.
Tu inventario ya permite seguir una parte importante de esa relación, pero no demuestra por sí solo que se haya revisado y resuelto el destino de cada fuente potencialmente relevante. No copiaría todo ese material: completaría la trazabilidad de las decisiones de inclusión y exclusión.

También hay una cuestión sobre las referencias bajo demanda. buildThreeLayerPrompt() incorpora sus rutas al contexto, pero no inyecta automáticamente el contenido íntegro de cada documento. El agente recibe las instrucciones para consultarlos y puede leerlos cuando corresponde.

Este diseño es razonable para no inflar el contexto, pero no constituye una garantía determinista de que una referencia obligatoria haya sido leída y aplicada en cada situación pertinente. Para las reglas normativas críticas, convendría asegurar su consulta mediante mecanismos más explícitos.
4. ¿La integración ya es equivalente a la de Gentle AI y Gentle Shell?
A nivel de arquitectura, te estás acercando mucho más al objetivo.

En la relación de Gentle Shell con Gentle AI, el shell integra un runtime de software mediante una extensión y gestiona una versión concreta del ejecutable. El instalador actual de Gentle Shell declara esa versión en scripts/gentle-ai-installer.mjs.

En tu caso, youtube no es un ejecutable: es un framework de conocimiento y reglas de producción. La equivalencia correcta no consiste en copiar el mecanismo de instalación de Gentle AI, sino en conseguir que las reglas del framework maestro se transformen en comportamiento verificable dentro de youtube-shell.

Ya tienes buena parte de esa estructura: versiones fijadas, plantillas verificadas mediante hashes, skills derivadas de roles, referencias normativas, controles deterministas y aprobación humana.

Hay dos diferencias que todavía importan.

Primero, las contradicciones que acabo de señalar demuestran que el mapa y el contexto no reflejan por completo el comportamiento real del runtime.

Segundo, la integración de Gentle AI con Gentle Shell está construida alrededor de un contrato entre componentes de software. Tu integración se apoya en gran medida en instrucciones de lenguaje natural y referencias para el agente, además de los controles de código. Eso puede ser adecuado para un sistema editorial, pero no debes asumir que una regla escrita en una skill está garantizada simplemente porque el runtime conoce su ruta.

Hay también una comprobación de compatibilidad pendiente: el upstream-lock.json de youtube-shell registra Pi 1.3.0 como versión revisada y tiene anotada la 1.4.0 como versión vista, pero no revisada; sin embargo, el rango de dependencia permite versiones desde 1.3.0. Antes de dar por cerrada la integración operativa, revisaría esa compatibilidad o limitaría explícitamente el rango a lo que hayas probado.

Por último, el propio README de youtube-shell todavía contempla como próximos pasos una sesión interactiva real y la primera producción real. El CI está verde, lo cual es una buena señal, pero no sustituye esas pruebas.

5. Qué haría antes de considerar la integración terminada
Seguiría este orden:
1. Corregir la selección de los modos de producción. Evitar que una selección ausente o ambigua se convierta automáticamente en Audio-First; hacer que el prompt y las evidencias requeridas reflejen siempre el modo efectivo.
2. Cerrar la compuerta global de integridad. Definir qué comandos pueden modificar o aprobar el estado cuando el framework no es válido y probar esos caminos, no solo las llamadas a herramientas.
3. Actualizar el mapa de trazabilidad. Corregir ANI-01, el inventario de dirección y las pruebas para que el contrato documentado coincida con el comportamiento polimórfico.
4. Completar el inventario de decisiones sobre el conocimiento. Identificar las fuentes relevantes que se han consolidado, las que deben consultarse bajo demanda y las que se mantienen fuera del runtime deliberadamente.
5. Validar una sesión real. Probar al menos un flujo Audio-First y uno Screen-First en el runtime de Pi compatible, verificando que las instrucciones, las evidencias, las transiciones y las aprobaciones funcionen de principio a fin.
Conclusión
Mi evaluación actual es que la arquitectura está bien encaminada y que las mejoras recientes han resuelto varias de las deficiencias importantes de la versión anterior. No empezaría de cero ni copiaría todo el framework al shell.

Pero todavía no afirmaría que la integración está perfecta. El sistema de modos tiene una incoherencia real entre la selección, el registro y el prompt; la compuerta de integridad no parece cubrir todas las operaciones de estado; y la trazabilidad sigue conteniendo una descripción obsoleta de la evidencia de animatic.

Resolvería primero esos puntos y después haría la validación interactiva. Con eso tendrías una base mucho más sólida para afirmar que youtube funciona como fuente de verdad de youtube-shell, de manera comparable en propósito —aunque no idéntica en mecanismo— a la relación entre Gentle AI y Gentle Shell.
