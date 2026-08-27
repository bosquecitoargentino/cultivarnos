# Corrección puntual: nada de selección de texto al reordenar en iPhone

## El problema

En "Ordenar cultivos" y "Personalizar inicio" — que ya comparten el mismo mecanismo de arrastre (`motor-lista-reordenable.js`) — mantener presionado el handle o la fila en un iPhone real también activaba la selección de texto propia de Safari: texto resaltado, el menú de copiar/seleccionar apareciendo encima, interferencia visual mientras se intentaba arrastrar.

## Lo que NO toqué

Tal cual pediste: nada de pointer capture, lógica de movimiento, auto-scroll, timers, cálculo de posición o persistencia. `motor-lista-reordenable.js` sigue haciendo exactamente lo mismo que hacía — mismo `DEMORA_HOLD`, mismo `UMBRAL_MOVIMIENTO`, mismo auto-scroll, misma animación FLIP. No era necesario tocar `touch-action` (ya estaba en `none` en el handle desde antes). No es una reescritura del sistema de drag, es una corrección puntual encima de él.

## La solución: CSS, escopeado solo a la lista de reordenar

En `css/styles.css`, agregué una regla en el contenedor compartido `.home-layout-list` (la clase que ya envuelve tanto la lista de "Ordenar cultivos" como la de "Personalizar inicio"):

```css
.home-layout-list, .home-layout-list * {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
```

Esto es a propósito **permanente**, no algo que se agrega recién cuando el arrastre ya arrancó. La regla vieja (`.home-layout-row-arrastrando { user-select: none; }`) solo se aplicaba después de que pasara el timer de "mantener presionado" (130ms) — dejando ese mismo mantener-presionado, que es justo cuando el gesto nativo de selección de iOS puede ganar la carrera, sin ninguna protección. Con la regla en el contenedor, toda la lista queda no-seleccionable desde que se abre el modal, cubriendo el gesto completo de punta a punta. Reforcé además esa regla vieja con `-webkit-user-select` y `-webkit-touch-callout` (le faltaban) para que quede doblemente cubierta mientras la fila está en el aire.

Escopeado únicamente a `.home-layout-list` — nada de esto es global. Confirmé con una prueba automatizada que un texto normal de la app (el título de "Mis cultivos", fuera del modal) sigue teniendo `user-select` normal, sin tocar.

## El handle: de "≡" de texto a un ícono SVG

Como preferiste, reemplacé el carácter de texto "≡" por un ícono SVG chico (tres líneas), para que no quede ningún nodo de texto en el handle que pueda participar de una selección. Lo armé como un solo helper compartido, `handleArrastreHtml()`, en `motor-lista-reordenable.js` — antes cada uno de los dos archivos (`inicio.js` y `cultivos.js`) tenía el mismo botón escrito a mano; ahora los dos llaman a la misma función, así no hay dos copias del mismo SVG dando vueltas. No lo agregué al catálogo de 24 íconos curados de `icons.js` (ese sistema es solo para los trazos de la lámina de referencia) — es un ícono propio de este componente, consistente con cómo ya se manejan las excepciones ahí.

## Los dos refuerzos secundarios que pediste

- `window.getSelection()?.removeAllRanges()` se llama al momento exacto en que el arrastre arranca (`comenzarArrastre`), como red de seguridad — la solución principal sigue siendo el CSS de arriba.
- Un listener de `contextmenu` escopeado solo a la lista de reordenar (`listEl`, no el documento entero) evita que aparezca un menú contextual si algo lo dispara igual.

No había ninguna imagen/thumbnail en las filas de ninguno de los dos modales (confirmé el markup de las dos), así que no hizo falta la regla de `-webkit-user-drag` sobre imágenes — sí la agregué de forma defensiva sobre el propio botón del handle (`-webkit-user-drag: none`), ya que no cuesta nada y cierra esa puerta también ahí.

## Personalizar inicio

Como ya comparte `motor-lista-reordenable.js` y la clase `.home-layout-list` con "Ordenar cultivos", quedó cubierto automáticamente por la misma regla — no necesitó ningún cambio aparte, solo el mismo reemplazo del handle a SVG (estaba en el mismo lugar, con el mismo texto "≡").

## Pruebas

Agregué una batería nueva a `test-orden-cultivos.js` (sección 11) que confirma, en reposo — antes de que arranque ningún arrastre —: que el handle ya es un ícono SVG y no el carácter "≡"; que la lista, la fila y el handle tienen `user-select: none` (la parte de la regla que Chromium sí expone en `getComputedStyle` — `-webkit-touch-callout` es exclusivo de iOS Safari y ni siquiera aparece en Chromium, así que esa parte queda para la validación manual en tu iPhone); y que un texto normal de la app, fuera del modal, sigue siendo seleccionable como siempre. Agregué el mismo par de chequeos a `test-home-layout-drag.js` para "Personalizar inicio", confirmando que comparte exactamente la misma protección.

Con esto: 172 pruebas en total (los 167 de antes + 5 nuevas), todas pasando, 0 errores de consola.

## Validación pendiente en tu iPhone

Automatizado no puede probar `-webkit-touch-callout` ni el comportamiento real de selección de Safari (Chromium no lo simula) — la validación real es la tuya, con la lista del pedido: entrar a "Ordenar cultivos", mantener presionado, que arranque el arrastre sin que se vea texto seleccionado ni aparezca el menú de copiar/seleccionar, poder mover y soltar con normalidad, y confirmar que "Personalizar inicio" se sigue sintiendo igual que siempre.

## Archivos tocados

`css/styles.css` (regla de selección en `.home-layout-list`, reforzada en `.home-layout-row-arrastrando`, estilos del ícono del handle), `js/motor-lista-reordenable.js` (nuevo `handleArrastreHtml()`, `removeAllRanges()` al arrancar el arrastre, `contextmenu` escopeado a la lista), `js/views/inicio.js` y `js/views/cultivos.js` (usan `handleArrastreHtml()` en vez del botón con "≡" escrito a mano), `sw.js` (versión 1.21.0 → 1.21.1). Pruebas: `test-orden-cultivos.js` y `test-home-layout-drag.js` ampliadas. Nada de esto tocó: el sistema de drag en sí, Mis cultivos, las tarjetas, Inicio, Firebase, datos, navegación, ni el diseño general.
