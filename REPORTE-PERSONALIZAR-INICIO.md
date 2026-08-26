# Personalizar inicio

## Qué hay ahora

Un nuevo ítem "Personalizar inicio" en el menú `⋯` (junto a Exportar/Banco/Configuración) abre una pantalla chica con los bloques reales de Inicio, cada uno con ↑/↓ para reordenar y un checkbox para mostrar/ocultar, y un botón "Restaurar inicio predeterminado" abajo. Cada cambio se guarda al toque (no hay botón "Guardar" — mueve o destildá y ya queda), y se ve reflejado en Inicio apenas cerrás el modal.

Usé ↑/↓ en vez de arrastrar directamente, como dejaste habilitado como alternativa: en iPhone el drag & drop nativo de HTML es poco confiable dentro de una hoja modal, y ↑/↓ es robusto y no depende de gestos.

## Los bloques que aparecen — y el que no inventé

Revisé `inicio.js` línea por línea antes de tocar nada, y los bloques reales que tiene Inicio hoy son estos cinco: Recordatorios, Mis cultivos, Sugerencia para hoy, Últimos movimientos y Esta temporada. Esos son los que aparecen en "Personalizar inicio", en ese orden por defecto (el mismo que ya tenía la pantalla).

"Espacios", que pusiste como ejemplo, no lo incluí: hoy no es un bloque de Inicio, es una pantalla propia (la que se abre desde "Mis cultivos"). Nada de Inicio pinta nada de Espacios. Como pediste explícitamente no inventar bloques nuevos, lo dejé afuera — si en algún momento querés que Espacios tenga un resumen en Inicio, eso sería una funcionalidad aparte, no algo que corresponda simular acá.

## Qué no cambia

Mostrar/ocultar y reordenar es pura presentación: no se toca ni se borra ningún dato. Header y navegación inferior siguen siempre fijos — no son personalizables. El contenido interno de cada bloque (qué dice la sugerencia, cómo se arma la lista de cultivos, etc.) es exactamente el mismo de antes; lo único que cambié fue cómo se decide el orden en el que esos bloques ya existentes se pintan.

## Cómo se guarda

En `localStorage` (no hace falta IndexedDB para esto), como una lista simple de `{ id, visible }` — nunca se guarda HTML ni nada dinámico. Si en el futuro se agrega un bloque nuevo a Inicio, aparece automáticamente al final, visible, sin romper nada para quien ya tenía una preferencia guardada. Si algún día se saca un bloque, un id guardado que ya no existe simplemente se ignora — Inicio nunca se rompe por esto.

## Un ajuste que hice sobre la marcha

Al principio hacía que el modal actualizara Inicio (por detrás) en cada toque de ↑/↓ o de un checkbox. Probando encontré que eso disparaba de más un cálculo que ya existía de antes (la "Sugerencia para hoy" — motor-observacion.js, que no toqué): entre varios recálculos seguidos en poco tiempo, un cultivo recién plantado puede tener dos preguntas empatadas en prioridad, y ese motor elige al azar entre ellas en cada recálculo. Muchos recálculos seguidos podían terminar por "gastar" ambas opciones en el mismo día y hacer que la sugerencia desapareciera sin que nadie la haya ocultado. No toqué esa lógica (no era parte de este pedido), pero sí ajusté "Personalizar inicio" para que solo actualice Inicio una vez, al cerrar el modal, en vez de en cada toque — así el problema de fondo no se nota acá. Te lo cuento por transparencia: no es un bug de esta funcionalidad, pero sí algo que quedó más visible por cómo la construí al principio, así que preferí evitarlo en vez de dejarlo pasar.

## Pruebas

14/14 en una batería nueva (`test-home-layout.js`): los 5 bloques reales aparecen y ninguno inventado; el modal se abre desde el menú y muestra las 5 filas; reordenar mueve el bloque a la posición correcta; ocultar un bloque lo saca de Inicio; la preferencia persiste después de recargar la página (simulando cerrar/reabrir la PWA); "Restaurar inicio predeterminado" devuelve exactamente el mismo orden y visibilidad originales, y borra la preferencia guardada (no la deja "igual al default" a mano); otras pantallas (Mis cultivos, Biblioteca) siguen funcionando sin cambios; un id desconocido guardado a propósito no rompe Inicio. Además corrí las 7 baterías de regresión de esta sesión (íconos, rutas, calendario, riego múltiple/últimos movimientos, sugerencias, respaldo, motion): 121/121, 0 errores de consola en toda la corrida combinada.

## Archivos tocados

Nuevo: `js/motor-home-layout.js` (única fuente de los bloques reales, el orden por defecto, y el guardado/lectura/restauración en localStorage). Modificados: `js/views/inicio.js` (bloques extraídos a funciones propias + la pantalla de "Personalizar inicio"), `index.html` (ítem de menú nuevo + script nuevo), `css/styles.css` (estilos de la lista de bloques), `sw.js` (versión de caché 1.18.0 → 1.19.0). No se tocó ningún otro archivo — nada de la lógica de sugerencias, cultivos, recordatorios o temporada cambió.
