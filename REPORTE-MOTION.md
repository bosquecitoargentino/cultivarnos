# Motion — primera pasada: nav, transición de vistas, botones, sugerencias

Arranqué por las cuatro cosas que dijiste, en ese orden. Antes de tocar nada audité qué ya existía, porque Cultivarnos ya traía bastante motion de antes — no partí de cero.

## Lo que ya estaba (no lo toqué, o casi)

La transición entre pantallas ya existía: `router()` (app.js) agrega `.fading` antes de renderizar y la saca en el frame siguiente, y `.app-view` ya tenía `transition: opacity + transform`, con `.fading { opacity:0; transform: translateY(6px) }`. Es exactamente el fade + 4-6px que pedías. La duración es 220ms (la variable `--dur` que ya existía) — un poco arriba del rango 160-200ms que diste, pero preferí no tocarla: la usan ~15 animaciones de entrada de cards que ya se ven bien, y bajarla habría sido un ajuste de "rediseño" a algo que no pediste cambiar. La dejé como está.

El feedback táctil en botones también ya estaba, ampliamente: casi todos los botones, chips, cards y ítems tocables ya tienen su propio `:active { transform: scale(...) }`. No los reescribí — habría sido un refactor grande para cero cambio visible. Lo que sí agregué es el sistema central de variables que pediste (`--motion-fast/base/slow`, `--ease-soft`) para que todo lo nuevo de acá en adelante tenga una sola fuente de duración/curva, y usé esas variables en todo lo que sí construí ahora.

El color del ícono y del label del nav inferior también ya cambiaba suavemente al activarse una pestaña (`.nav-item { transition: color }`, y el label hereda ese color — no tiene uno propio).

## Lo que sí agregué

Un pulso muy sutil de escala (1 → .96 → 1, sin rebote) en el ícono del nav que pasa a estar activo — nunca en el que se desactiva, y nunca en "Registrar" (mantiene su presencia actual, tal cual pediste).

En la sección Sugerencia de la ficha: "Otra sugerencia" ahora hace un fade-out corto, cambia el texto, y hace fade-in — nunca reemplaza de golpe. "Ocultar" ahora se contrae (opacidad + alto) antes de mostrar la nota de cierre, en vez de desaparecer de un salto. Usé la técnica que mencionabas para evitar animar `height: auto` directamente: fijo la altura actual en píxeles por JS, fuerzo un reflow, y recién ahí animo a 0.

`prefers-reduced-motion` ya estaba respetado desde antes (existía una regla global que lleva todas las duraciones a ~0) — lo verifiqué, sigue funcionando con todo lo nuevo.

## Un bug que encontré de paso (no es motion, pero lo arreglé)

Corriendo las pruebas encontré, una sola vez en muchas corridas, un error de consola real en Inicio: si la persona navega a otra pantalla justo mientras Inicio todavía está terminando de calcular la sugerencia destacada o los últimos movimientos (código que yo mismo agregué en las dos entregas anteriores), esa parte del código podía intentar escribir sobre una sección que ya no estaba — porque otra pantalla ya la había reemplazado. Es un caso de carrera raro (necesita navegar muy rápido, poco probable tocando la pantalla a mano, pero lo vi bajo carga en las pruebas automatizadas) y no tiene nada que ver con el pedido de hoy, pero como ya estaba mirando ese archivo lo dejé protegido con el mismo criterio que ya usa el resto de la app (si la sección ya no existe, no hacer nada, en vez de romper).

## Lo que quedó para después

Todo lo demás de tu lista (cards con stagger, Últimos movimientos con entrada al agregarse uno nuevo, riego múltiple, guardar registros, expansiones, modales, lightbox, chips/tabs) no lo toqué esta vez — vos mismo dijiste que iban a ser una segunda pasada. Cuando quieras seguimos con eso.

## Pruebas

19/19 en una batería nueva: la navegación entre pantallas no deja la clase `.fading` pegada; tocar una pestaña del nav la marca activa y el ícono de "Registrar" nunca tiene el pulso; las 4 variables de motion están definidas; "Otra sugerencia" no cambia de golpe (a los 40ms la opacidad ya bajó) y termina visible; "Ocultar" colapsa y termina en un estado limpio, sin `max-height`/`overflow` residual; con `prefers-reduced-motion` activado las transiciones quedan en ~0. Además corrí las 5 baterías de regresión de esta sesión (iconos, rutas, calendario, riego múltiple/últimos movimientos, sugerencias, respaldo): 102/102, 0 errores de consola.

## Archivos tocados

`css/styles.css` (variables de motion, pulso del nav, `.link-small` con feedback táctil que antes le faltaba fuera de "Ver todos", crossfade/colapso de Sugerencia), `js/views/detalle.js` (crossfade y colapso), `js/views/inicio.js` (los 3 guards defensivos del bug de arriba), `sw.js` (versión de caché 1.17.0 → 1.18.0). No se tocaron colores, tipografía, iconografía, estructura de Inicio, navegación ni ninguna lógica de datos.
