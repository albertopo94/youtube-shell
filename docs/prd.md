# PRD — `youtube-shell` (una página)

## Problema

El framework de producción de video del creador (`albertopo94/youtube`) se cumple por buena
voluntad del agente. El 2026-10-21 el master del piloto se midió contra los estándares del propio
framework y no los cumplía; nada lo detectó. Falta un runtime que haga cumplir el framework.

## Usuario

El creador, que no escribe código: decide qué tiene que hacer el agente, aprueba cada fase y
valida resultados. Cliente cero: su propia oficina.

## Solución

Un paquete para pi que convierte el framework en controles ejecutados por el runtime:

1. **Motor de estados de fases** (`P01_PACKAGING` … `P07_CLOSE`, ver
   [contrato-fases-v1.md](contrato-fases-v1.md)): una fase no arranca si sus prerrequisitos no
   están aprobados y vigentes.
2. **Aprobación solo humana y atada a huellas**: el agente puede llevar una fase hasta
   `PENDIENTE_APROBACION` si los checks pasan; solo el creador la pasa a `APROBADO`, desde un
   comando de la UI de pi que el modelo no puede invocar. La aprobación guarda SHA-256 de lo
   aprobado; si cambia, la fase pasa a `OBSOLETO`.
3. **Intercepción de tool calls** por fase: las operaciones no permitidas se bloquean antes de
   ejecutarse, incluidas las de MCP; sin shell arbitrario en el flujo controlado.
4. **Verificador de contrato** (portado de `check-contrato.sh`) y **medición del master** con
   ffmpeg contra una hoja de aceptación previa al render: `PASS | FAIL | WARN | NOT_EVALUABLE`.
5. **Persona, gobernanza y skills de los 4 roles**, y la integración FilmCraft MCP inventariada.

## Criterio de éxito del MVP

- Cada regla que bloquea tiene un test positivo y uno negativo que comprueba el **efecto** (la
  operación denegada no modificó nada).
- El modelo no tiene ninguna vía para autoaprobar una fase.
- El master del piloto, medido contra una hoja que exige 3 pistas y −23 LUFS, da `FAIL`; sin una
  hoja aplicable da `NOT_EVALUABLE`, nunca un veredicto inventado.

## Fuera de alcance (MVP)

Runtime propio o CLI standalone · integraciones de pago · aceptación calibrada por género ·
sandbox de sistema operativo · juicio automático de calidad creativa, verdad factual o legalidad
de licencias · distribución pública.

## Restricciones

Presupuesto incremental 0 € · repo de referencia intacto · sin nombres ni marcas de terceros ·
Node ≥ 22.18 sin dependencias de runtime mientras se pueda.

## Orden de trabajo

El orden de [brief-lector.md §12.5](brief-lector.md); el estado vivo está en
[progreso.md](progreso.md). "MVP v0.1" es el nombre de este alcance, no un número de versión del
paquete.
