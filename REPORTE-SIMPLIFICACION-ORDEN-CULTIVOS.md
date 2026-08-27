# Simplificar el reordenamiento de "Mis cultivos": se acabó el drag directo sobre las tarjetas

## La decisión

Se eliminó por completo el sistema de arrastre directo sobre las tarjetas de "Mis cultivos": mantener presionado, `setPointerCapture`, el scroll manual, la clase de selección de texto, el placeholder, los transforms temporales — toda la maquinaria que se había ido construyendo (y parchando) en las últimas vueltas. Las tarjetas volvieron a ser tarjetas comunes: un toque abre la ficha, scroll normal, mantener presionado no hace absolutamente nada especial. Nada de esto se sacó a medias — se borró la función entera (`habilitarArrastreCultivos`, más de 300 líneas) y todo su CSS asociado.

Reordenar ahora vive en un único lugar: **"Ordenar cultivos"**, en el menú `⋯` — y reutiliza, literalmente, el mismo mecanismo de arrastre que ya usa "Personalizar inicio".

## Una sola lógica de arrastre para toda la app

Antes, el arrastre con handle de "Personalizar inicio" (`habilitarArrastreHomeLayout`) vivía duplicado adentro de `views/inicio.js`, sin forma de reutilizarlo en otro lado. Lo extraje a un archivo nuevo, `js/motor-lista-reordenable.js`, con una única función genérica: `habilitarArrastreListaReordenable(sheet, listEl, { onReordenar, onSoltar })`. No decide nada sobre qué significa el nuevo orden ni cómo se guarda — solo mueve filas dentro de un modal (handle "≡", placeholder, auto-scroll cerca de los bordes, animación FLIP al reacomodar) y al soltar te devuelve la lista de ids en el nuevo orden. Quien la llama decide qué hacer con eso.

`habilitarArrastreHomeLayout` en `inicio.js` quedó reducida a un envoltorio de 10 líneas que traduce ese resultado al formato de `motor-home-layout.js`. Y `abrirOrdenCultivos` en `cultivos.js` llama exactamente a la misma función, traduciendo el resultado al formato de `motor-orden-cultivos.js`. Es la misma pieza de código corriendo en los dos lugares — no dos implementaciones que hacen lo mismo por separado.

## Cómo quedó "Ordenar cultivos"

Al abrirlo (menú `⋯` → "Ordenar cultivos") ves una lista liviana: handle `≡`, nombre del cultivo (+ variedad si tiene, + "Finalizado" si corresponde), y las flechas ↑/↓ como alternativa accesible — nada de fotos ni el resto del detalle de la tarjeta completa, justamente para que reordenar se sienta rápido. No hay switch de mostrar/ocultar (a diferencia de "Personalizar inicio") porque acá no hace falta: los cultivos siguen apareciendo todos, siempre, esto es solo orden. Cada movimiento (arrastre o flecha) se guarda al toque, igual que en Home — no hay botón "Guardar".

La lista de este modal siempre muestra **todos** los cultivos, sin importar en qué pestaña de "Mis cultivos" estabas (Activos/Finalizados/Todos) — así arrastrar acá nunca depende de un filtro, y el orden guardado es directamente el array completo, sin necesidad de fusionar un sub-orden parcial (esa lógica de fusión, que existía porque el drag viejo sí podía pasar sobre un filtro, ya no hace falta y también se eliminó).

## Lo que no cambié

El criterio de persistencia (`motor-orden-cultivos.js`) sigue exactamente igual: IDs estables en `localStorage`, nunca se toca el dato agronómico del cultivo. Un cultivo nuevo se integra al final del orden manual sin mover a los demás — eso ya lo resolvía `ordenarCultivosSegunPreferencia` de antes y lo confirmé de nuevo con una prueba. "Restaurar orden predeterminado" borra la preferencia y vuelve exactamente al criterio de siempre (más reciente primero). Nada de esto necesitó tocarse.

## Qué se borró (código muerto)

De `css/styles.css`: el `touch-action: none` fijo en `.cultivo-card` (vuelve a su comportamiento normal), y las clases `.cultivo-card-sujetando`, `.cultivo-card-arrastrando`, `.cultivo-card-placeholder`, `.cultivos-ayuda-orden` (el aviso "Mantené presionado un cultivo para moverlo", que ya no aplica). De `motor-orden-cultivos.js`: `guardarOrdenCultivosTrasArrastre` (la fusión de sub-orden parcial, ya sin uso) y `yaVioAyudaOrdenCultivos`/`marcarAyudaOrdenCultivosVista` (el aviso de descubribilidad, atado al gesto que ya no existe). El menú pasó de decir "Reordenar cultivos" a "Ordenar cultivos", igual que pediste.

## Performance

La vista de "Mis cultivos" quedó más liviana: ya no hay listeners de `pointerdown`/`pointermove`/`pointerup`/`pointercancel`/`contextmenu`/`dragstart` corriendo sobre la grilla completa de tarjetas, ni un `requestAnimationFrame` en loop mientras alguien simplemente sostiene el dedo sobre una card. Ahora hay un único listener de `click` delegado en la lista.

## Pruebas

Borré las tres baterías que probaban el sistema de arrastre directo sobre las cards (`test-orden-cultivos-2d.js`, `test-arrastre-cultivos-gestos.js`, y el contenido viejo de `test-orden-cultivos.js`) porque prueban un comportamiento que ya no existe — dejarlas habría significado tests rotos a propósito. En su lugar, `test-orden-cultivos.js` quedó reescrita con 22 pruebas nuevas: mantener presionado una tarjeta ya no agrega ninguna clase ni cambia nada, y soltar en el mismo lugar abre la ficha como cualquier tap; un toque normal abre la ficha y no altera el orden; mover el mouse sobre una tarjeta no deja transforms residuales (no hay más lógica de arrastre ahí); el menú dice "Ordenar cultivos" y el modal tiene el handle en cada fila; arrastrar desde el handle reordena igual que en Personalizar inicio; el nuevo orden se refleja en la lista real y persiste tras recargar; ↑/↓ siguen funcionando; "Restaurar orden predeterminado" vuelve exactamente al orden original; un cultivo nuevo se agrega al final sin romper el orden existente; y no queda ningún estilo residual en ninguna tarjeta.

Además volví a correr `test-home-layout-drag.js` (las 10 pruebas de arrastre de "Personalizar inicio") para confirmar que extraer su lógica a `motor-lista-reordenable.js` no cambió ni un poco su comportamiento — sigue pasando 10/10 exactamente igual que antes. Sumado a las demás baterías de regresión (íconos, rutas, calendario, riego múltiple, sugerencias, respaldo, motion, home-layout): 167 pruebas en total, todas pasando, 0 errores de consola.

## Archivos tocados

Nuevo: `js/motor-lista-reordenable.js` (el mecanismo de arrastre compartido). Modificados: `js/views/cultivos.js` (se eliminó `habilitarArrastreCultivos` completa; `paint()` quedó con un simple listener de click; `abrirOrdenCultivos` ahora usa el handle + el mecanismo compartido), `js/views/inicio.js` (`habilitarArrastreHomeLayout` pasa a ser un envoltorio chico sobre el mecanismo compartido), `js/motor-orden-cultivos.js` (se eliminaron `guardarOrdenCultivosTrasArrastre`, `yaVioAyudaOrdenCultivos`, `marcarAyudaOrdenCultivosVista`), `css/styles.css` (se eliminaron las clases del drag directo sobre cards), `index.html` (nuevo script + menú "Ordenar cultivos"), `sw.js` (versión 1.20.2 → 1.21.0, más el archivo nuevo agregado al App Shell). Reescrito: `test-orden-cultivos.js`. Eliminados: `test-orden-cultivos-2d.js`, `test-arrastre-cultivos-gestos.js`.
