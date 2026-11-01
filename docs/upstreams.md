# Anclaje de upstreams (`upstream-lock.json`)

`youtube-shell` depende conceptual y técnicamente de repositorios externos en tres frentes:

1. **`albertopo94/youtube`** (capa 3 — conocimiento de dominio, plantillas y verificador de contrato).
2. **`earendil-works/pi`** (`@earendil-works/pi-coding-agent`, capa 1 — runtime, hooks y comandos de extensión).
3. **Motores audiovisuales de `storytold`** (ejecución de media local y MCP):
   - **`storytold/filmcraft`** (`filmcraft-cli`, montaje, timeline y render en `P05`/`P06`).
   - **`storytold/effectcraft`** (`effectcraft-cli`, motion graphics, títulos y overlays en `P06`).
   - **`storytold/soundcraft`** (`soundcraft-cli`, mezcla de audio multipista en `P06`).

Para no duplicar números de versión ni perder rastro de qué versión exacta consultamos, **[upstream-lock.json](../upstream-lock.json) es la única fuente autoritativa**.

## Qué controla `npm test` (sin red)

`test/upstream-lock.test.ts` verifica en cada corrida local:

- Que todos los upstreams (`youtube`, `pi`, `filmcraft`, `effectcraft`, `soundcraft`) tengan fijado un commit SHA completo de 40 caracteres, versión semántica y lista de rutas `affects_us`.
- Que cada plantilla espejada en `templates/pipeline-video/*.md` coincida byte a byte (`SHA-256`) con el archivo registrado en `upstream-lock.json`, y que ningún archivo nuevo en `templates/pipeline-video/` quede fuera del lock.
- Que el rango de `peerDependencies["@earendil-works/pi-coding-agent"]` en `package.json` derive exactamente de `upstreams.pi.reviewed.version`.
- Que cada método de `pi.*` y `ctx.*` usado en `src/gate/pi-extension.ts` figure en `upstreams.pi.api_used`.
- Que si los binarios locales (`filmcraft-cli`, `effectcraft-cli`, `soundcraft-cli`) están instalados en el entorno, su `--version` coincida exactamente con la versión registrada en `upstream-lock.json`.

## Cuándo revisar cambios externos (`npm run upstreams:check`)

- **Cambios internos nuestros** (lógica del motor de fases, tests propios, mensajes): no requieren consultar los repos externos; basta con que `npm test` pase en verde.
- **Cuando quieras saber si los repos upstream cambiaron en algo que nos afecte:** ejecutá `npm run upstreams:check`. El script consulta solo las rutas listadas en `affects_us` e ignora el resto (por ejemplo, cambios en `mis-canales/` de `youtube`, paquetes ajenos a `coding-agent` en `pi`, o crates no vinculados a MCP/automation en los motores de `storytold`).
- **Un subconjunto:** `node scripts/check-upstreams.mjs --only youtube` (o `--only pi,filmcraft`). CI usa esta bandera para dividir la compuerta: la deriva de `youtube` (la fuente del contrato de dominio) **corta el build**, y la de `pi` y los motores de medios queda en advertencia porque su superficie ya está fijada por los tests `api_used` y de versión de binario de `npm test`.

**Códigos de salida de `scripts/check-upstreams.mjs`:**

| Código | Significado | Qué hacer |
| :---: | :--- | :--- |
| `0` | Nada que nos afecte desde el commit revisado. | Nada. |
| `1` | Hay commits upstream en rutas listadas en `affects_us`. | Revisar el diff, adaptar skills/código y actualizar `upstream-lock.json` y `_framework/compatibilidad-consumidores.md`. |
| `2` | No se pudo consultar (API fallando o sin token). | Reintentar con `GITHUB_TOKEN` o `gh auth token`; no declarar alineación sin la comprobación. |
| `3` | El commit revisado del lock **todavía no está publicado** en el remoto. | Publicar la rama de la oficina (`git push` en `albertopo94/youtube`); mientras tanto la alineación no es verificable fuera de esta máquina. |
