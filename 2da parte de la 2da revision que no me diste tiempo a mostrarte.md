1. Corrección prioritaria: los modos de producción audiovisual
Archivos afectados:
- src/core/phases.ts
- src/core/machine.ts
- src/core/context-resolver.ts
- src/core/types.ts
- src/store/fs-store.ts
- templates/pipeline-video/00-estado-produccion.md
1.1. Define una única fuente de verdad para el modo
Actualmente hay dos lugares que representan la elección del modo audiovisual:
- 00-estado-produccion.md, donde aparecen las casillas de selección.
- .youtube-shell/registro.json, donde se conserva productionMode.
La arquitectura establece que el registro es la autoridad y que el Markdown es una vista legible. Esa separación es buena, pero la lógica actual de detección también lee la plantilla, y la lógica de resolución del contexto puede usar el registro o recurrir a Audio-First.

El problema aparece cuando ambas fuentes discrepan.

En submitPhase(), el modo se detecta a partir del Markdown si no existe en el registro y, posteriormente, se guarda en el registro cuando se envía una fase. Esto puede fijar Audio-First al enviar P01 incluso si las casillas estaban sin seleccionar.

Después, cambiar manualmente la casilla a Screen-First no garantiza que cambie el modo que utiliza el motor.

Mi recomendación concreta: implementar una operación explícita para elegir el modo, por ejemplo /yts-mode.

El funcionamiento sería el siguiente:
1. El creador inicializa el proyecto con /yts-init.
2. El sistema muestra los cuatro modos y explica brevemente qué significa cada uno.
3. El creador elige un modo, por ejemplo /yts-mode screen_first.
4. El runtime valida la elección, la guarda en registro.json y actualiza la vista Markdown.
5. Todas las fases y las instrucciones posteriores consultan esa misma elección.
No es obligatorio usar exactamente ese comando. También podrías permitir que /yts-init reciba el modo elegido. Lo importante es que haya una operación inequívoca que modifique la fuente de verdad.
¿Y si quieres conservar Audio-First como predeterminado?
El rol maestro de dirección ya lo contempla como opción predeterminada. Puedes conservar esa decisión, pero debes hacerla explícita.

En ese caso, la inicialización debería guardar audio_first en el registro y mostrar la opción correspondiente seleccionada. No debería dejar las cuatro casillas vacías mientras el runtime decide silenciosamente que el modo es Audio-First.

Mi preferencia sería exigir una elección explícita, porque estás construyendo un sistema que pretende adaptar la producción al género, pero cualquiera de las dos políticas es válida si se aplica consistentemente.
1.2. Valida la selección y no infieras silenciosamente una respuesta
En detectProductionMode(), la selección actual se resuelve mediante expresiones regulares. Si no se reconoce ninguna selección, devuelve audio_first; si hay varias casillas marcadas, devuelve la primera que coincida con el orden interno de comprobación.

Eso debe cambiar.

El parser debería distinguir, al menos, estos tres resultados:
Estado de selección	Comportamiento esperado
Una sola opción seleccionada	Guardar y utilizar el modo elegido.
Ninguna opción seleccionada	Pedir una elección o aplicar un predeterminado expresamente declarado.
Dos o más opciones seleccionadas	Informar del conflicto y no iniciar el flujo dependiente de esa elección.

Además, validateRegistry() debería verificar que productionMode, cuando exista, sea uno de los cuatro valores permitidos. Ahora mismo, la validación del registro no comprueba ese campo contra el conjunto de valores de ProductionMode.

Un JSON con productionMode: "otro_modo" no debe convertirse silenciosamente en Audio-First.
1.3. Haz que el prompt y el motor utilicen el mismo contrato de evidencias
Esta es la incoherencia más importante de la implementación actual.

Tu código ya dispone de:
- P05_EVIDENCE_BY_MODE
- getPhaseEvidence()
- isAllowedEvidenceRole()
Esas funciones permiten determinar que P05 necesita scratch_track, screen_recording, speaker_track o music_bed, según corresponda.

Sin embargo, buildThreeLayerPrompt() en context-resolver.ts construye la descripción de las evidencias utilizando resolved.phaseDefinition.evidence, que procede de la definición estática de la fase. Esa definición todavía declara scratch_track.

Por tanto, el prompt puede describir Screen-First y a la vez pedir una pista de voz.

La solución no consiste en añadir más instrucciones a la skill. Consiste en utilizar la misma lógica para decidir qué se exige y para informar al agente de lo que se exige.
// Esquema conceptual; no es un parche completo.
const requiredEvidence = getPhaseEvidence(
  resolved.targetPhase,
  resolved.layer3.productionMode,
);

const evidenceLabel = requiredEvidence.length > 0
  ? requiredEvidence
      .map((item) => `${item.role} (${item.description})`)
      .join(", ")
  : "ninguna evidencia binaria adicional";


La idea es que la implementación real utilice los tipos y convenciones existentes del repositorio, evitando duplicar la lógica de selección.

También haría que las etiquetas de modo y de evidencia procedieran de una única definición compartida, en lugar de mantener listas independientes en distintos archivos.
1.4. Decide cuándo se puede cambiar un modo
No basta con que el runtime pueda almacenar cuatro valores diferentes. Debe controlar cuándo resulta válido cambiar de uno a otro.

Por ejemplo, pasar de Audio-First a Screen-First puede cambiar:
- La forma de redactar el guion.
- La planificación de los bloques y su duración.
- El animatic y las evidencias de P05.
- La tabla de escenas y el montaje posterior.
Por eso, recomiendo fijar la elección antes de iniciar la producción editorial y, preferiblemente, antes de P01. Como mínimo, debe estar definida antes de P03.

Una vez que las fases dependientes estén aprobadas, no permitiría cambiar el modo sin reabrir y revalidar las fases afectadas. Si tu máquina de estados ya dispone de mecanismos de reapertura, reutilízalos antes de crear otro sistema de invalidación.
Pruebas de aceptación para este bloque
En test/machine.test.ts, test/context-resolver.test.ts y las pruebas del registro añadiría casos que demuestren que:
- Los cuatro modos solicitan la evidencia correcta.
- Cada modo genera un prompt coherente con la evidencia requerida.
- Una selección vacía o múltiple no congela silenciosamente un modo incorrecto.
- Un cambio de modo actualiza el registro y la vista.
- Un valor de modo inválido en registro.json provoca un error explícito.
- Un cambio posterior a las aprobaciones reabre las fases que dependen de esa decisión.
Criterio para darlo por terminado: el modo que ve el creador, el que figura en el registro, el que recibe el agente y el que valida la máquina de estados deben coincidir en todo momento.

2. Corrección prioritaria: aplicar la integridad del framework a todas las operaciones críticas
Archivo principal: src/gate/pi-extension.ts.

También intervienen src/checks/framework-checker.ts y test/pi-gate.test.ts.
2.1. El problema exacto
Actualmente, la extensión ejecuta getFrameworkIntegrity() en las operaciones de herramientas que pueden escribir, renderizar o controlar el estado. También comprueba la integridad al procesar yts_transition.

Eso está bien, pero los comandos interactivos siguen rutas independientes.

En particular, los manejadores de /yts-approve y /yts-approve-sheet:
1. Cargan el registro.
2. Solicitan confirmación al creador.
3. Ejecutan la función que realiza la aprobación.
4. Guardan el registro.
No consultan directamente la integridad del framework antes de aprobar.

Por tanto, la política actual no está aplicada uniformemente: una operación puede estar bloqueada en el recorrido del agente y no tener esa misma condición en el recorrido del comando interactivo.
2.2. La solución que recomiendo
Define una política de operaciones en el límite de la extensión, donde realmente se autorizan las acciones.

No hace falta duplicar en cada manejador toda la lógica del verificador. Puedes reutilizar un helper común, por ejemplo:
// Esquema conceptual, no código listo para sustituir el actual.
function requireFrameworkIntegrity(action: string) {
  const report = getFrameworkIntegrity();

  if (report.result === "FAIL") {
    return {
      ok: false,
      reason: `Operación bloqueada: ${action}. El framework no es válido.`,
      report,
    };
  }

  return { ok: true, report };
}


Este helper es ilustrativo: la implementación definitiva debe respetar el patrón de errores, los tipos y la interfaz de usuario existentes.

Aplícalo a todas las entradas que puedan ejecutar operaciones críticas:
Operación	Política recomendada
yts_transition(start/submit)	Bloquear si falla una condición crítica del framework.
Escritura de artefactos	Bloquear si falla una condición crítica del framework.
Render y medición que dependan del contrato de producción	Bloquear cuando corresponda.
/yts-approve	Bloquear la aprobación si falla la integridad.
/yts-approve-sheet	Bloquear la aprobación de la hoja si falla la integridad.
/yts-status y consultas	Permitir la consulta, mostrando los errores detectados.
/yts-check-contract	Permitir la inspección y exponer el informe de integridad.
/yts-init y /yts-link	Definir explícitamente si se permiten como operaciones de configuración o recuperación.

Los dos últimos comandos de configuración merecen una decisión deliberada. No tienen necesariamente que bloquearse por la misma razón que una aprobación: algunas operaciones de recuperación deben seguir disponibles cuando el sistema detecta un problema. Lo importante es que esa excepción esté diseñada, no que aparezca accidentalmente porque un manejador olvidó comprobar la integridad.

También revisaría el uso de executeAgentTransition(), cuya comprobación de integridad recibe actualmente un parámetro opcional. Mantendría la máquina de estados como componente independiente, pero haría que los recorridos de producción de la extensión aplicaran siempre la política de integridad correspondiente.
2.3. Distingue entre la integridad del registro de técnicas y la integridad global del paquete
Este matiz también importa.

checkFrameworkIntegrity() comprueba la presencia y coherencia del registro de técnicas, sus identificadores, los valores permitidos y referencias a técnicas ausentes en los archivos de skills.

Eso es valioso, pero no equivale por sí solo a comprobar toda la sincronización entre el repositorio maestro y el consumidor.

Yo separaría formalmente dos niveles:

Integridad de las políticas en runtime: las comprobaciones necesarias para impedir que una producción continúe con un registro central inválido o incoherente.

Integridad de la integración en CI: hashes de plantillas, revisión del upstream, estructura del mapa, referencias esperadas y correspondencia entre código, skills y documentación.

No obligaría al runtime a conectarse a GitHub para verificar cada fase. La integridad que necesita para trabajar debería poder verificarse localmente; la detección de cambios en el repositorio maestro corresponde principalmente a CI y al mecanismo de actualización.
Pruebas de aceptación para este bloque
En test/pi-gate.test.ts añadiría pruebas específicas para:
- El registro de técnicas inválido bloquea /yts-approve.
- El registro inválido bloquea /yts-approve-sheet.
- Las operaciones de producción y render se bloquean por la misma política definida.
- Las consultas de estado siguen funcionando y muestran el error.
- Las operaciones de recuperación permitidas siguen disponibles.
- Ninguna aprobación queda guardada cuando la comprobación crítica falla.
Criterio para darlo por terminado: no existe un camino alternativo dentro de la extensión que permita aprobar o avanzar una producción ignorando una compuerta crítica.

3. Corrección prioritaria: alinear framework-map.json con el comportamiento real
Archivos principales:
- framework-map.json
- test/framework-map.test.ts
- test/phases.test.ts
- test/contract-checker.test.ts
Aquí no propondría reescribir tu sistema de trazabilidad. Ya tienes 26 reglas mapeadas y un inventario de fuentes con decisiones de inclusión y exclusión. Lo que hace falta es que ese mapa represente fielmente los cambios que has implementado.
3.1. Corregir ANI-01
En la versión actual de framework-map.json, la regla ANI-01 todavía describe la evidencia de P05 como scratch_track obligatorio.

Eso contradice la regla MODES-01, que reconoce la selección del flujo audiovisual y las evidencias adaptables.

Cambiaría ANI-01 para que describa lo siguiente:
Campo	Cambio necesario
title	Indicar que P05 requiere evidencia audiovisual según el modo elegido.
consumer	Referenciar la implementación compartida de los modos, no solo la definición estática de la fase.
enforcement	Referenciar P05_EVIDENCE_BY_MODE, getPhaseEvidence() e isAllowedEvidenceRole(), según la responsabilidad de cada función.
tests	Incluir pruebas del motor de estados y del contexto generado.
required_skill_terms	Exigir conceptos que reflejen el contrato adaptable, no solamente el término scratch_track.
reference_policy	Aclarar que la evidencia depende del modo audiovisual seleccionado.

El inventario source_inventory, que ahora describe la evidencia scratch_track dentro de las reglas de dirección, también debe reflejar el funcionamiento condicionado por el modo.

No eliminaría scratch_track de toda la documentación: sigue siendo correcto para Audio-First. El error está en describirlo como un requisito universal.
3.2. Actualizar también TECH-01
Hay otra diferencia de trazabilidad que revisaría.

La regla TECH-01 describe la coherencia del registro central y menciona checkTechniquesRegistryCoherence, el verificador de contrato y el script del framework. Sin embargo, el runtime ahora cuenta también con framework-checker.ts, que tiene su propia implementación y pruebas específicas.

Actualizaría TECH-01 para reflejar las dos responsabilidades:
- La comprobación del contrato de un vídeo, cuando corresponda.
- La comprobación de la integridad del registro central del paquete, mediante el verificador de framework y su compuerta de runtime.
También actualizaría la lista de pruebas asociadas para incluir test/framework-checker.test.ts y las pruebas de integración pertinentes de test/pi-gate.test.ts.

La regla no debe atribuir a un componente un control que realmente se ejecuta en otro.
3.3. Mejorar la verificación de las reglas del mapa
Ahora mismo, test/framework-map.test.ts comprueba, entre otras cosas, que una skill contenga los términos que declara el mapa.

Eso sirve como verificación de cobertura léxica. Pero no demuestra por sí solo que el significado de una regla, sus condiciones y sus excepciones se hayan preservado.

No quitaría esa prueba. La complementaría con pruebas de comportamiento.

Por ejemplo:
- Si ANI-01 afirma que la evidencia depende del modo, una prueba debe demostrar que el runtime no exige scratch_track en Screen-First.
- Si TECH-01 declara que un registro inválido bloquea operaciones críticas, una prueba de integración debe verificar ese bloqueo.
- Si una regla es editorial y no determinista, el mapa debe describirla como tal, sin afirmar que un verificador automático comprueba la calidad estética o narrativa.
Además, cambiaría el lenguaje de la documentación que presenta la presencia de términos como «verificación semántica» si eso es lo único que se comprueba. Reservaría esa expresión para las comprobaciones que efectivamente verifican el significado mediante pruebas o validaciones adicionales.
Pruebas de aceptación para este bloque
- No hay reglas del mapa que contradigan el contrato de las funciones que mencionan.
- Cada control determinista tiene una prueba que demuestra su comportamiento.
- Las reglas editoriales diferencian claramente lo que verifica el runtime de lo que debe evaluar el creador.
- La suite detecta una futura regresión que convierta una evidencia condicional en un requisito universal.
Criterio para darlo por terminado: framework-map.json es una descripción verificable del contrato de youtube-shell, no simplemente un índice de archivos y palabras clave.

4. Completar la trazabilidad del conocimiento de youtube
Aquí hay que evitar dos extremos: copiar todos los documentos del repositorio maestro al consumidor o asumir que el inventario actual demuestra que todo el conocimiento relevante está cubierto.

Tu framework-map.json ya diferencia fuentes implementadas en el runtime, fuentes consolidadas en skills, referencias empaquetadas y datos de oficina o canal que se mantienen fuera del paquete.

Es una estructura acertada. La mejoría que propongo es hacer explícitas las decisiones que todavía no quedan demostradas por el mapa.
4.1. Definir formalmente qué fuentes deben estar cubiertas
No necesitas inventariar cada archivo Markdown como si todos fueran instrucciones normativas.

Yo definiría cuatro categorías:
Categoría	Qué hacer con ella
Reglas normativas y contratos de producción	Deben mapearse a una implementación, una skill, una referencia o una exclusión justificada.
Conocimiento de referencia utilizado por las reglas	Debe conservar la procedencia y explicar qué conclusiones se han incorporado al consumidor.
Transcripciones, auditorías y notas históricas	Pueden mantenerse exclusivamente en el maestro, si no son necesarias en tiempo de ejecución.
Datos vivos de oficina, canal y vídeo	Deben permanecer fuera del paquete reutilizable y consultarse mediante sus vínculos cuando corresponda.

Después establecería una regla de cobertura: ninguna fuente dentro del ámbito normativo definido puede quedar sin una decisión de destino documentada.

Esto puede implementarse mediante un manifiesto explícito de fuentes y exclusiones, acompañado de una prueba en CI. No hace falta recorrer y copiar ciegamente todos los documentos.

En particular, revisaría las fuentes adicionales de _framework/referencias/ para determinar cuáles justifican reglas operativas existentes y cuáles son material histórico o exploratorio.
4.2. Distinguir las referencias disponibles de las referencias realmente utilizadas
En context-resolver.ts, buildThreeLayerPrompt() incluye las rutas de las referencias normativas. Las políticas por fase indican qué referencias son obligatorias y cuáles son condicionales.

Pero incluir la ruta en el prompt no equivale a proporcionar el contenido ni a demostrar que el agente lo ha leído.

Para mejorar esto, haría lo siguiente:

Referencias pequeñas y críticas: incorporar su contenido o los apartados pertinentes directamente en el contexto operativo, cuando sea razonable.

Referencias extensas: indicar la lectura obligatoria de los apartados aplicables y comprobar que el trabajo resultante refleja las reglas relevantes. No hay necesidad de cargar una transcripción completa si bastan dos conclusiones normativas.

Referencias condicionales: activarlas mediante los criterios ya declarados por fase. Por ejemplo, las políticas sensibles deben ser aplicables cuando el vídeo toque temas YMYL, derechos o cuestiones legales pertinentes.

Referencias ausentes: si una referencia es obligatoria para una operación crítica y falta, el runtime debe comunicarlo y detener la operación afectada. No debería tratar una ruta inexistente como si hubiese cumplido la consulta.

No intentaría resolver esto metiendo todo el material disponible en cada prompt. Eso aumentaría el contexto sin garantizar una mayor fidelidad.
4.3. Conservar la diferencia entre conocimiento editorial y control determinista
Hay técnicas cuya presencia o estructura sí puede comprobarse automáticamente. Otras requieren juicio editorial.

Por ejemplo, puedes validar que un guion tenga bloques identificables o que se haya declarado la congruencia entre promesa y contenido. Pero no puedes demostrar la calidad real de una historia simplemente comprobando que existe una sección titulada «Payoff».

En el inventario y en las reglas deberías mantener explícita esa frontera. Cuando una regla se considere cubierta por una skill, no la describas como una garantía del runtime salvo que exista una comprobación que la aplique.
Criterios para darlo por terminado
- Toda fuente normativa está asociada a una implementación, una referencia, una skill o una exclusión documentada.
- No se cargan innecesariamente transcripciones ni auditorías históricas en el contexto de producción.
- Las referencias obligatorias realmente están disponibles cuando se necesitan.
- No se confunde una instrucción editorial con una compuerta determinista.

5. Corregir la documentación de compatibilidad y evitar un ciclo de sincronización
Archivos afectados:
- youtube/_framework/compatibilidad-consumidores.md
- youtube-shell/upstream-lock.json
- youtube-shell/docs/upstreams.md
- youtube-shell/test/upstream-lock.test.ts
5.1. Distinguir las dos versiones que estás registrando
En el estado actual, el repositorio maestro declara que el consumidor usa el commit 098a99d, correspondiente a la versión v0.10.0. En cambio, el upstream-lock.json del consumidor registra bb3438e, y package.json declara youtube-shell v0.11.0.

Estas cifras no describen lo mismo:
- La revisión de youtube identifica el contrato de origen que se ha revisado.
- La versión de youtube-shell identifica el software consumidor que se ha publicado o preparado.
- La versión del contrato de integración describe qué reglas y plantillas se han adoptado, no necesariamente toda la versión del consumidor.
Tener números diferentes no es un error por sí mismo. Lo que debes evitar es que un documento diga que la integración está completa basándose en una revisión anterior sin explicar el alcance de esa afirmación.

Yo actualizaría los registros para distinguir expresamente:
1. La revisión del framework maestro examinada.
2. La revisión del consumidor en la que se adoptó el contrato.
3. El estado de sincronización de las plantillas.
4. Las diferencias de comportamiento que se han adoptado en el runtime.
5.2. Separar el contrato normativo del informe de estado
Hay una cuestión arquitectónica adicional. compatibilidad-consumidores.md está incluido entre las rutas que afectan al consumidor, y parte de su contenido describe qué versión del consumidor está alineada.

Eso puede crear un ciclo de mantenimiento: actualizas youtube-shell, necesitas actualizar el estado en youtube, ese cambio produce una nueva revisión de youtube, y después debes volver a registrar esa revisión en youtube-shell.

No es un ciclo imposible de resolver, pero genera trabajo y facilita que los informes queden desactualizados.

La solución más limpia sería separar:
- Contrato de compatibilidad: reglas relativamente estables que explican qué significa estar alineado y cómo versionar los cambios. Este sí es normativo.
- Informe de compatibilidad: versión actual del consumidor, revisión examinada, hashes y estado de adopción. Este debería generarse o actualizarse desde el estado real del consumidor.
El informe dinámico no debería obligarte a cambiar la revisión normativa cada vez que cambia una versión del consumidor. Puedes mover la información dinámica a un archivo generado o mantenerla como una sección de estado que no se trate como una fuente normativa consumida por el runtime.

No eliminaría el documento de compatibilidad ni sus reglas. Separaría las políticas estables de la información que cambia continuamente.
Criterio para darlo por terminado
Cuando consultes los dos repositorios, debe resultar evidente qué revisión del maestro está consumiendo youtube-shell, qué versión del consumidor se está describiendo y qué significa exactamente que están alineados.

6. Revisar la compatibilidad con Pi antes de dar por cerrada la integración
En upstream-lock.json, Pi 1.3.0 figura como versión revisada, mientras que 1.4.0 aparece como una versión detectada pero aún no revisada.

Sin embargo, en package.json, la dependencia opcional permite cualquier versión desde 1.3.0 en adelante.

Esto no demuestra que exista una incompatibilidad con Pi 1.4.0. Lo que demuestra es que el rango declarado es más amplio que el rango de versiones que consta como revisado.

Mi recomendación es tomar una de estas dos decisiones:

Opción A: probar Pi 1.4.0. Revisar los cambios de su API de extensiones, ejecutar las pruebas relevantes y realizar una sesión interactiva. Si pasa, actualizar la versión revisada y mantener un rango de compatibilidad que refleje lo que realmente se admite.

Opción B: limitar temporalmente el rango. Si todavía no has comprobado 1.4.0, declarar únicamente el rango de versiones que pretendes soportar y que has probado, hasta completar la revisión.

En ambos casos actualizaría las pruebas de upstream-lock.test.ts para que no se limiten a comprobar que el rango comienza en la versión revisada, sino que su declaración de soporte sea coherente con la política de compatibilidad adoptada.

No hace falta convertir esto en un gran proyecto de compatibilidad. Se trata de no prometer soporte que todavía no has verificado.

7. Realizar una validación interactiva real
Este es el último paso antes de considerar que has cerrado la integración.

El CI de youtube-shell aparece en verde en el workflow de la versión actual, y el workflow de youtube también ha pasado sus comprobaciones. Eso es positivo.

Pero los tests automáticos no demuestran por sí solos que las instrucciones que recibe el agente sean coherentes durante una sesión real de Pi, ni que las aprobaciones y los controles funcionen correctamente al interactuar con el sistema.

Yo haría una prueba de aceptación manual en una carpeta temporal, sin publicar ningún vídeo real.
Prueba de aceptación recomendada
Se puede ejecutar por etapas. Cada prueba debe registrar el resultado observado y cualquier comportamiento inesperado.


1. Inicialización y selección

Ejecuta /yts-init y selecciona un modo explícitamente. Comprueba que la elección se guarda en registro.json, se refleja en el Markdown y se mantiene después de reiniciar la sesión.



2. Coherencia del contexto

Pide al agente que trabaje en P05 con un proyecto Screen-First. Verifica que el prompt, la skill de dirección y las instrucciones de evidencia piden la grabación de pantalla, no una pista de voz.



3. Evidencia y aprobación

Envía la fase con la evidencia correcta, comprueba que llega a revisión y aprueba desde la interfaz interactiva. Repite la operación con evidencia incorrecta para confirmar que la transición se rechaza.



4. Framework inválido

En un entorno de prueba aislado, introduce deliberadamente una incoherencia en el registro de técnicas. Comprueba que las aprobaciones y las operaciones críticas se bloquean y que los comandos de consulta siguen mostrando un diagnóstico útil.



5. Alineación documental

Ejecuta la suite de pruebas, los verificadores de upstream y las comprobaciones del repositorio maestro. Revisa que el mapa, el lock, la documentación y el comportamiento observado no se contradicen.



Además, haría pruebas automatizadas para los cuatro modos. En la prueba interactiva no necesitas crear cuatro vídeos completos: basta con ejecutar de principio a fin al menos un flujo representativo y validar los otros modos mediante las pruebas unitarias y de integración.

8. El orden de implementación que seguiría
No empezaría cambiando veinte archivos al mismo tiempo. Haría el trabajo en este orden:
Prioridad	Trabajo	Por qué va en ese orden
P0	Resolver la selección del modo, el registro y la evidencia dinámica del prompt.	Es una incoherencia funcional que puede hacer que el agente produzca un vídeo siguiendo el flujo equivocado.
P0	Aplicar la política de integridad a los comandos de aprobación.	Es importante que los controles críticos no puedan eludirse por una ruta alternativa.
P1	Corregir ANI-01, TECH-01 y las pruebas del mapa.	La documentación debe reflejar los cambios funcionales recién implementados.
P1	Completar la trazabilidad de las fuentes normativas y de las referencias obligatorias.	Permite verificar que el conocimiento importante no se pierde al transferirlo al consumidor.
P1	Separar el contrato de compatibilidad del informe de estado.	Evita discrepancias y reduce el coste de mantener ambos repositorios sincronizados.
P2	Revisar el rango de Pi y realizar la prueba interactiva.	Confirma que la integración funciona en el entorno real que pretendes soportar.

Después de cada bloque ejecutaría las pruebas correspondientes. No pasaría al siguiente si se rompe una garantía establecida en una fase anterior.

9. Instrucciones listas para pasarle a tu amiga o a tu agente de código
Puedes utilizar el siguiente encargo como punto de partida. Está orientado a implementar las correcciones mínimas necesarias, no a rediseñar el sistema completo.
Auditoría correctiva de youtube-shell y su integración con youtube
Objetivo
Completar la integración de albertopo94/youtube como framework de conocimiento y contrato de dominio de albertopo94/youtube-shell.

Mantener la arquitectura actual, preservar los controles y las aprobaciones existentes y corregir las incoherencias que quedan entre la selección del modo audiovisual, el registro de producción, el contexto del agente, las compuertas del runtime y el mapa de trazabilidad.

No realizar una reescritura general ni copiar indiscriminadamente el contenido del framework maestro al consumidor.
Tarea 1: consolidar el modo de producción
Inspeccionar y corregir:
- src/core/phases.ts
- src/core/machine.ts
- src/core/context-resolver.ts
- src/core/types.ts
- src/store/fs-store.ts
- src/gate/pi-extension.ts
- templates/pipeline-video/00-estado-produccion.md
Requisitos:
1. Definir una única fuente de verdad para productionMode.
2. Establecer cómo se elige y persiste el modo, preferiblemente mediante un comando controlado del creador.
3. No convertir silenciosamente una selección ausente, ambigua o inválida en Audio-First.
4. Validar productionMode en el esquema del registro.
5. Hacer que el prompt del agente use getPhaseEvidence() y el mismo contrato dinámico que utiliza submitPhase().
6. Evitar que el registro fije Audio-First accidentalmente durante la primera fase enviada.
7. Definir cuándo puede modificarse el modo y cómo se reabren o invalidan las fases dependientes.
8. Mantener la vista Markdown sincronizada con el registro autoritativo.
Si se conserva Audio-First como predeterminado, declararlo explícitamente y persistirlo de manera coherente, sin dejar una selección visual vacía con un valor oculto en el runtime.
Tarea 2: cerrar las compuertas de integridad
Inspeccionar:
- src/checks/framework-checker.ts
- src/gate/pi-extension.ts
- test/framework-checker.test.ts
- test/pi-gate.test.ts
Requisitos:
1. Definir una política única para las operaciones que requieren integridad válida del framework.
2. Aplicarla a /yts-approve y /yts-approve-sheet, además de las rutas de producción y render ya protegidas.
3. Definir explícitamente qué consultas y operaciones de recuperación siguen disponibles cuando el framework no es válido.
4. Comprobar que ninguna ruta de aprobación guarda cambios si una condición crítica falla.
5. Mantener la máquina de estados separada de la política de autorización de la extensión.
Tarea 3: reparar la trazabilidad
Inspeccionar:
- framework-map.json
- test/framework-map.test.ts
- test/phases.test.ts
- test/contract-checker.test.ts
Requisitos:
1. Actualizar ANI-01 para que describa evidencia condicional según productionMode.
2. Actualizar TECH-01 para distinguir el verificador del contrato de vídeo del verificador de integridad del framework.
3. Corregir source_inventory y cualquier otra regla que siga describiendo scratch_track como requisito universal.
4. Añadir pruebas de comportamiento que detecten contradicciones entre el mapa y el runtime.
5. No presentar la presencia de términos en skills como una prueba suficiente de fidelidad semántica.
Tarea 4: comprobar la cobertura de conocimiento
Inspeccionar las fuentes normativas de youtube, las referencias utilizadas y el inventario del consumidor.

Requisitos:
1. Definir el ámbito de fuentes normativas que deben quedar trazadas.
2. Registrar para cada fuente relevante su destino, qué conocimiento se utiliza y qué se excluye deliberadamente.
3. Mantener las transcripciones y auditorías históricas fuera del contexto por defecto cuando no sean necesarias.
4. Diferenciar referencias disponibles, obligatorias y condicionales.
5. Asegurar que una referencia crítica ausente no se considere satisfecha.
6. No confundir una regla editorial con una condición garantizada por el runtime.
Tarea 5: compatibilidad y aceptación
Inspeccionar upstream-lock.json, docs/upstreams.md, package.json y youtube/_framework/compatibilidad-consumidores.md.

Requisitos:
1. Distinguir la revisión del framework, la versión del consumidor y el contrato de integración adoptado.
2. Separar el contrato de compatibilidad del informe de estado dinámico para evitar actualizaciones circulares innecesarias.
3. Revisar si el rango de Pi declarado corresponde a las versiones verificadas y decidir explícitamente cómo tratar Pi 1.4.0.
4. Ejecutar las pruebas existentes y añadir las que falten para los comportamientos modificados.
5. Realizar una sesión interactiva de aceptación con al menos un flujo Audio-First y uno Screen-First.
6. No declarar el trabajo finalizado basándose únicamente en que el CI esté verde.
Criterios generales de aceptación
- El modo de producción mostrado, registrado, inyectado en el prompt y validado por el runtime es coherente.
- Una selección ausente o ambigua no produce una decisión silenciosa que condicione el resto del pipeline.
- Las operaciones críticas respetan la misma política de integridad independientemente del camino de ejecución.
- El mapa de trazabilidad describe el comportamiento real.
- Las fuentes normativas tienen un destino documentado y las exclusiones están justificadas.
- Las pruebas demuestran el comportamiento, no solamente la presencia de palabras o archivos.
- El CI pasa y la sesión interactiva confirma que el flujo funciona en el runtime previsto.
No modificar los repositorios hasta presentar un diagnóstico del estado actual, los cambios mínimos propuestos, los riesgos de compatibilidad y las pruebas que se ejecutarán.




Mi recomendación final
No añadiría más capas arquitectónicas hasta resolver estos puntos. La base que has construido es suficientemente buena para concentrar ahora el esfuerzo en la coherencia entre contrato, runtime, conocimiento y evidencia.

La prioridad máxima es que los modos de producción no puedan contradecirse entre el registro y el prompt, y que las compuertas críticas no puedan eludirse desde los comandos interactivos. Una vez resuelto eso, completaría la trazabilidad y validaría el funcionamiento real.

Con esos cambios y una prueba interactiva satisfactoria, tendrías una base mucho más sólida para afirmar que youtube-shell consume correctamente el conocimiento de youtube, en lugar de limitarse a incluir sus documentos y confiar en que el agente los interprete siempre de la forma adecuada.
