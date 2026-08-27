# Arrastre en "Mis cultivos": por qué se cortaba en iPhone, y la reescritura del motor gestual

## Lo que pasaba

Tu descripción — la tarjeta se levanta, pero al mover el dedo no la acompaña y el arrastre se corta casi enseguida — apuntaba a una sola causa posible: `pointercancel`. Antes de tocar código, busqué si esto es un problema conocido de iOS Safari en vez de asumir una explicación, y encontré la confirmación exacta en el propio issue tracker del estándar de Pointer Events: en iOS/Safari, el valor de `touch-action` que rige un toque queda fijado desde el `pointerdown` — cambiarlo por JavaScript a mitad de gesto (como hacíamos nosotros: `touch-action: pan-y` desde siempre, y recién `none` una vez activado el arrastre) no se aplica de forma confiable a ese mismo toque. Es una limitación reconocida, no un bug nuestro: ["touch-action cannot be modified after pointerdown but before sufficient movement triggers scrolling"](https://github.com/w3c/pointerevents/issues/178).

En la práctica, esto significaba: mantenías presionado, el hold se cumplía, la tarjeta se elevaba (eso es puro JavaScript, no depende de ningún gesto del navegador, por eso "funcionaba"), pero apenas movías el dedo, Safari —que todavía tenía registrado `pan-y` desde el principio del toque— tomaba ese movimiento como scroll nativo antes de que nuestro código llegara a impedirlo, y le mandaba `pointercancel` a la página. De ahí "se corta, se suelta casi inmediatamente": no era nuestra lógica de posicionamiento (esa parte ya estaba bien, la confirmé con pruebas), era el navegador tomando el gesto para sí mismo.

## La corrección de raíz

En vez de seguir apostando a que un cambio de `touch-action` a mitad de gesto funcione — que es exactamente el parche que ya habíamos intentado —, reescribí el motor gestual completo (`habilitarArrastreCultivos` en `js/views/cultivos.js`) sobre esta base:

**`touch-action: none` fijo desde siempre en la tarjeta** (antes era `pan-y`, cambiado dinámicamente). Ya no hay ninguna mutación a mitad de toque de la que depender — el navegador nunca va a intentar tomar el gesto por su cuenta, ni al principio ni después del hold.

**El scroll de antes de mantener presionado ahora lo hacemos nosotros.** Como el navegador ya no scrollea solo cuando tocás una tarjeta, si te movés más de ~10px antes de que se cumpla el segundo de espera, la propia página se desplaza por código (`window.scrollBy`) siguiendo tu dedo 1 a 1. Funcionalmente es indistinguible de un scroll normal — se mueve exactamente con el dedo —, la única diferencia real es que no tiene "inercia" (el desliz suave que sigue después de soltar el dedo en un scroll nativo). Si al probarlo en tu iPhone lo sentís demasiado "seco" comparado con el resto de la app, es un ajuste chico que puedo agregar después (una pequeña animación de frenado al soltar) — preferí no sumarlo todavía para mantener esta corrección lo más simple y confiable posible en el primer intento.

**`setPointerCapture()` al activarse el arrastre**, para que los eventos de puntero se sigan entregando pase lo que pase con la posición del dedo, y **`releasePointerCapture()` prolijo al soltar** (agregado — antes no lo teníamos).

**Capas extra contra el menú nativo de iOS**, acotadas únicamente a las tarjetas: además de la clase `cultivo-card-sujetando` que ya suprimía selección/callout durante el gesto, ahora también se bloquea `contextmenu` y `dragstart` sobre las tarjetas específicamente (nunca de forma global).

**Sigue siendo un único flujo de Pointer Events** — pointerdown/pointermove/pointerup/pointercancel, sin mezclar touch events, mouse events por separado, ni HTML5 Drag & Drop.

## Logs temporales para confirmar en tu iPhone real

Agregué logs de diagnóstico (con el prefijo `[arrastre-cultivos]`) en cada paso clave: `pointerdown`, activación del long press, intento de `setPointerCapture`, entrada a "modo scroll manual", `pointerup` y `pointercancel` — cada uno con el estado del gesto en ese momento. Están detrás de una constante `DEBUG_DRAG = true` al principio de la función, fácil de encontrar y sacar.

Te pediría que, cuando puedas, abras la consola de Safari en tu iPhone conectado a tu Mac (Ajustes → Safari → Avanzado → Inspector web en el iPhone, y después Safari en la Mac → menú Desarrollador → tu iPhone → la pestaña de Cultivarnos) mientras probás mantener presionado y arrastrar una tarjeta, y me digas qué ves — puntualmente si aparece `pointercancel` en algún momento. Con esa confirmación real puedo saber si esta corrección resolvió el problema de raíz o si queda algo más por ajustar, en vez de asumirlo. Una vez confirmado que anda bien, saco esos logs.

## Qué no cambié

El posicionamiento en X e Y, el hit-test 2D (vecino más cercano, antes/después según fila y columna), el placeholder, la animación FLIP al reacomodar las demás tarjetas, el auto-scroll cerca de los bordes durante el arrastre activo, y el guardado del nuevo orden — todo eso ya funcionaba bien (lo confirmé con pruebas antes de tocar nada) y sigue exactamente igual. Tampoco toqué diseño de las tarjetas, datos de cultivos, navegación, Home, Personalizar inicio, ni ninguna otra pantalla.

## Pruebas

Agregué una batería nueva, `test-arrastre-cultivos-gestos.js` (11 pruebas), enfocada específicamente en este cambio: confirma que `touch-action` computado es `"none"`; que moverse antes del hold igual scrollea la página (a través del modo manual, no del navegador) sin abrir ni reordenar nada; que una vez activado el arrastre el `transform` de la tarjeta cambia en frames sucesivos siguiendo al puntero (no se "pega"); que después de un arrastre un toque normal posterior sigue abriendo la ficha con normalidad (nada quedó "colgado" con el pointer capturado); y que los logs de diagnóstico efectivamente aparecen en cada paso esperado.

Sumado a esto, volví a correr las 16 pruebas de `test-orden-cultivos.js` y las 23 de `test-orden-cultivos-2d.js` de la vuelta anterior (todas siguen pasando sin cambios, confirmando que el posicionamiento y el reordenamiento en 2D no se vieron afectados por la reescritura del motor gestual) y las 8 baterías de regresión del resto de la app. Total: 195 pruebas entre todas, todas pasando, 0 errores de consola.

Importante: estas pruebas simulan el gesto con eventos de mouse en Chromium (que genera Pointer Events reales, el mismo código que corre en un toque), pero Chromium no reproduce la particularidad de `touch-action` en iOS Safari que causó el problema original — esa parte, por naturaleza, solo se puede confirmar en un iPhone real. Por eso el pedido de arriba de revisar la consola ahí.

## Archivos tocados

`js/views/cultivos.js` (reescritura completa de `habilitarArrastreCultivos`: `touch-action: none` fijo, modo scroll manual antes del hold, `setPointerCapture`/`releasePointerCapture`, bloqueo de `contextmenu`/`dragstart` acotado a las tarjetas, logs de diagnóstico temporales). `css/styles.css` (`.cultivo-card` pasa de `touch-action: pan-y` a `touch-action: none` fijo). `sw.js` (versión de caché 1.20.1 → 1.20.2). Nuevo: `test-arrastre-cultivos-gestos.js`.
