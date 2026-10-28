Lo que corregiría primero
P1. El modo audiovisual todavía tiene dos fuentes de verdad
Esta es la inconsistencia de diseño más importante que he encontrado.

En la documentación y el mapa de trazabilidad se declara que el registro .youtube-shell/registro.json es la autoridad del estado, mientras que 00-estado-produccion.md es su representación legible. Sin embargo, el código puede dar prioridad al Markdown por encima del registro.

En src/core/machine.ts, submitPhase() empieza leyendo el modo guardado en el registro, pero después vuelve a detectar el modo marcado en 00-estado-produccion.md. Si encuentra una selección válida allí, esta puede sustituir al modo previamente guardado. El resolver de contexto en src/core/context-resolver.ts hace algo equivalente al elegir qué modo comunicarle al agente.

Por ejemplo:
Registro autoritativo	Markdown	Riesgo
audio_first	Audio-First seleccionado	Coherente
screen_first	Screen-First seleccionado	Coherente
audio_first	Screen-First seleccionado	El agente podría trabajar como Screen-First y el envío podría persistir ese cambio sin pasar por /yts-mode.

Eso contradice la idea de que el registro es autoritativo y deja una vía alternativa para modificar la configuración.

Mi recomendación: hacer que el registro sea la única autoridad después de inicializar la producción. Si el Markdown no coincide con el registro, el sistema debería detectar la discrepancia y bloquear las operaciones que dependan del modo, mostrando cómo repararla. No debería elegir silenciosamente uno de los dos valores.

Durante la inicialización puede existir una regla de migración o de importación desde la plantilla; lo importante es que ese comportamiento sea explícito, controlado y que, una vez guardado el estado, el archivo Markdown no pueda cambiarlo por su cuenta.

Añadiría una prueba que construya deliberadamente un registro audio_first y un Markdown screen_first y compruebe que el resolver y el envío no aceptan esa contradicción.
P1. El modo puede cambiar mientras el guion está en curso
Has añadido correctamente /yts-mode, la validación del valor, su persistencia en el registro y la sincronización de la vista Markdown. También has añadido pruebas que impiden cambiar el modo cuando el guion o el animatic ya están aprobados.

Pero la función changeProductionMode() en machine.ts comprueba principalmente si P03_SCRIPT o P05_ANIMATIC figuran como APROBADO. No parece aplicar el mismo bloqueo cuando P03_SCRIPT está en EN_CURSO o PENDIENTE_APROBACION.

Eso abre un caso problemático: el creador podría cambiar el modo mientras el guion está pendiente de aprobación y continuar luego con el nuevo modo, aunque el guion se haya concebido bajo el anterior.

Mi recomendación sería escoger una política clara:
- Política estricta: permitir cambiar el modo solamente antes de iniciar el guion; para cambiarlo después, reabrir formalmente la fase correspondiente.
- Política de invalidación: permitir el cambio, pero invalidar y exigir una nueva revisión de las fases que dependan de la elección anterior.
Para tu objetivo de producción gobernada, prefiero la segunda si de verdad necesitas cambios de modo a mitad del proceso; de lo contrario, la primera es más simple y segura.

Añadiría pruebas para los tres estados de P03_SCRIPT: EN_CURSO, PENDIENTE_APROBACION y APROBADO. La prueba actual que has incorporado cubre sobre todo el último.
3. Falta decidir cómo integrar la hoja de aceptación de calidad
Aquí hay una distinción importante entre medir el vídeo antes de aprobarlo y definir antes de producir qué significa que ese vídeo sea aceptable.

En youtube/PENDIENTES.md has dejado documentada una decisión para la primera producción real: fijar los criterios de aceptación del vídeo concreto antes del guion, incluyendo, según corresponda, sonoridad, pistas esperadas, duración, ritmo visual y excepciones creativas.

Tiene sentido porque los criterios que funcionan para un vídeo de divulgación de diez minutos no tienen por qué ser adecuados para un Short o un vídeo musical de una hora.

youtube-shell ya dispone de una parte importante de esa solución:
- /yts-approve-sheet registra la aprobación humana de aceptacion.json antes del render.
- media-measurement.ts mide el master real con herramientas como FFmpeg y FFprobe.
- La aceptación puede evaluar métricas como LUFS, true peak, silencios, frames negros y ritmo visual.
El problema no es que falte capacidad de medición. Es que la lógica del runtime y el mapa de trazabilidad no exigen todavía que la hoja de aceptación se defina antes de escribir el guion, como propone PENDIENTES.md. La compuerta documentada se centra en que la hoja esté aprobada antes del render.

El informe del piloto justifica esa distinción: el master de prueba medía −17,5 LUFS, tenía una sola pista de audio y una duración media por segmento visual de 41,2 segundos. El informe explica también que ese render no había probado todos los controles de calidad que se incorporaron después. Informe de medición del piloto.

Qué haría: convertir la definición de aceptación previa en un checkpoint anterior al guion, o dejar por escrito que esa política queda deliberadamente aplazada hasta la primera producción real. No impondría automáticamente los mismos números a todos los formatos: la hoja debe adaptarse a cada vídeo.

Y mantendría separadas ambas funciones: la hoja define los criterios previamente; la medición posterior comprueba si el master los cumple.
4. Hay contenido de youtube cuya relación con youtube-shell no está completamente trazada
Tu framework-map.json es una mejora importante, pero he encontrado una laguna concreta.

En upstream-lock.json, la lista affects_us declara tres rutas que no he encontrado clasificadas expresamente en el inventario del mapa:
Fuente de youtube	Situación observada	Qué haría
_framework/scripts/check-contrato.sh	No aparece con una disposición propia en el mapa.	Indicar qué controles sustituye o complementa el verificador TypeScript del shell.
_framework/scripts/test-check-contrato.sh	Tampoco tiene una disposición propia.	Documentar qué fixtures y comportamientos quedan cubiertos por las pruebas del consumidor.
_framework/referencias/evidencia-piloto/medicion-master-piloto.md	Sus datos sí se usan en el código de medición como fixture negativo, pero no están trazados como tal en el mapa.	Clasificarlo como evidencia de prueba, no como una regla normativa del runtime.

El primer y el segundo script pueden haber quedado sustituidos funcionalmente por contract-checker.ts y sus pruebas. No estoy afirmando que falte necesariamente el comportamiento: lo que falta es documentar claramente esa sustitución y qué cobertura conserva.

El informe del piloto, por otro lado, tiene un uso concreto en media-measurement.ts: sus valores funcionan como caso de prueba para verificar que una hoja de aceptación pueda detectar un master que no cumple los criterios establecidos. Ese uso debería aparecer en el mapa con una disposición del tipo test_fixture_only, para no confundir datos de un experimento con instrucciones operativas.

Hay un segundo problema relacionado. En test/framework-map.test.ts, la prueba titulada como verificación de fidelidad semántica comprueba, entre otras cosas, que aparezcan ciertas palabras de cada regla en la skill correspondiente. Eso es útil, pero que una palabra esté presente no demuestra que el significado se haya conservado ni que el comportamiento funcione.

Tienes pruebas de comportamiento en otros archivos —por ejemplo, para la máquina de estados y el contexto—, pero mejoraría la cobertura del mapa para que:
1. Cada ruta declarada en affects_us tenga una disposición explícita: consumida, espejada, consolidada, sustituida, excluida deliberadamente o usada solo como evidencia de prueba.
2. Las reglas de comportamiento crítico se prueben de verdad en el runtime.
3. El inventario distinga entre conocimiento disponible para el agente, reglas exigidas por el runtime y reglas cuyo cumplimiento depende del criterio humano.
No necesitas integrar cada fichero histórico. Necesitas saber qué papel tiene cada fuente relevante y poder justificar por qué algo no se utiliza.
5. El documento de compatibilidad se ha quedado atrás
Este es un problema de documentación entre repositorios, no una prueba de que el runtime esté roto.

El documento youtube/_framework/compatibilidad-consumidores.md declara que el consumidor está en youtube-shell v0.10.0 y que no queda ningún trabajo pendiente. Pero la versión actual del shell es 0.11.0, y su último commit incorpora cambios posteriores, entre ellos /yts-mode y la centralización de las comprobaciones de integridad.

Además, framework-map.json clasifica _framework/compatibilidad-consumidores.md como enforced_in_runtime, aunque la documentación de compatibilidad no es la fuente que ejecuta esas reglas. La referencia autoritativa del lock del consumidor está en upstream-lock.json.

Separaría las dos cosas:
- Contrato de compatibilidad: reglas estables sobre qué significa consumir el framework, cómo versionarlo y cuándo se necesita migración.
- Informe de estado del consumidor: qué commit y versión utiliza actualmente youtube-shell, qué cambios de youtube quedan por revisar y qué desviaciones están aceptadas.
El segundo puede actualizarse al realizar una nueva comparación; no debería tratarse como una regla ejecutable ni dar una impresión de alineación total si no se ha revisado el estado actual de ambos lados.
6. ¿Qué contenido no deberías trasladar al shell?
No todo lo que está en youtube debe formar parte del contexto operativo de youtube-shell. De hecho, meterlo todo indiscriminadamente podría empeorar el resultado: añadiría ruido, cargaría documentos históricos como si fueran normas y dificultaría saber qué instrucciones mandan.

Estos son los grupos que mantendría separados:

Conocimiento ya integrado o convertido en controles

Los cuatro roles, las plantillas principales, las reglas estructurales del pipeline, los criterios de verificación factual, licencias, selección de modo y medición del master. Aquí lo importante es conservar la correspondencia entre la fuente, la skill, el runtime y las pruebas.



Fuentes históricas y transcripciones

Las transcripciones, auditorías anteriores y notas externas no tienen por qué cargarse todas en cada turno. Lo adecuado es extraer sus aprendizajes validados en los roles o en el registro central de técnicas y conservar el original como procedencia.



Configuración viva de canales y oficina

Las ideas vetadas, referentes, banco visual y otros datos particulares deben seguir fuera del paquete genérico si se resuelven dinámicamente con /yts-link. Esta separación es acertada.



Plantillas para crear canales y prompts auxiliares

prompts-utiles.md, las plantillas de branding y las de estudio de canal no tienen por qué estar en el pipeline de cada vídeo. Pero deberían figurar como deliberadamente excluidas o como capacidades futuras si quieres que youtube-shell también pueda crear y evaluar canales de principio a fin.



Este último punto depende del alcance que busques. Si youtube-shell solo debe gestionar la producción de un vídeo desde el packaging hasta el cierre, mantener las plantillas de creación de canales fuera es razonable. Si quieres que gestione también el descubrimiento del nicho, la viabilidad del canal, su branding y el backlog, entonces hay una capacidad de producto mayor que convendría integrar como un flujo aparte, no mezclada sin más en las siete fases de vídeo.

También revisaría los pendientes de primera producción que has declarado en youtube/PENDIENTES.md: la cualificación de herramientas aún no probadas —como EffectCraft o ciertos motores de voz y generación— no debe convertirse en obligación para todos los vídeos, pero sí debería poder activarse como criterio de aceptación de la primera producción cuando corresponda.

7. Orden de corrección que recomiendo
Prioridad	Acción	Por qué
P1	Hacer que registro.json sea la autoridad real del modo y bloquear discrepancias con Markdown.	El modo no debe cambiar por una edición lateral de la vista.
P1	Impedir cambios de modo incompatibles con un guion en curso, o invalidar explícitamente sus dependencias.	Evita aprobar trabajo redactado bajo una decisión anterior.
P1	Decidir e implementar el momento del checkpoint de aceptación de calidad.	Diferencia los criterios fijados antes de producir de la medición posterior.
P2	Completar la trazabilidad de las rutas affects_us que faltan.	Evita asumir que contenido relevante está integrado cuando solo se conoce su existencia.
P2	Separar el contrato estable de compatibilidad del informe de estado actual.	Evita afirmaciones obsoletas de alineación.
P2	Fortalecer las pruebas del mapa para comprobar cobertura y comportamiento, no solo palabras.	Aumenta la confianza en que el conocimiento está bien trasladado.
P3	Revisar opcionalmente prompts auxiliares, plantillas de canal y fuentes históricas para clasificarlos expresamente.	Completa el inventario sin inflar el contexto que recibe el agente.

Cómo cerraría la revisión
Después de esos cambios, ejecutaría una prueba de aceptación interactiva real con al menos dos flujos —Audio-First y Screen-First— y verificaría el modo de punta a punta: selección por el creador, registro, contexto del agente, evidencia de P05 y aprobación. Añadiría también una prueba de modo contradictorio entre el registro y Markdown, otra para cambiar el modo con P03 pendiente y otra que verifique el momento en que queda fijada la hoja de aceptación.
