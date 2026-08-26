# Personalizar inicio: mantener presionado + arrastrar

## Qué cambia

Ahora el método principal para reordenar en "Personalizar inicio" es mantener presionado el handle `≡` de una fila y arrastrarla hacia arriba o abajo — se ve cómo las demás filas se corren para hacerle lugar, y al soltar el orden queda guardado al toque, igual que antes.

Lo hice con Pointer Events (no con el Drag & Drop nativo del navegador), justo por lo que marcaste: en Safari/iOS el nativo arranca tarde y pelea con el scroll. Con Pointer Events el mismo código cubre mouse y touch sin ramas separadas.

## Cómo se comporta

Arrastrar arranca solo desde el handle `≡` — nunca tocando el texto, el switch o el resto de la fila. Un toque rápido (sin mantener) no reordena nada: hace falta mantener presionado un rato corto (130ms) o moverse claramente en vertical antes de que el arrastre "prenda", así un toque accidental no reordena por error. Si el gesto es horizontal, se descarta — el reordenamiento es exclusivamente vertical, como pediste. Mientras se arrastra, la fila se eleva apenas (sombra leve, escala ~1.01, nada llamativo), y las demás se acomodan con una transición corta (misma familia de 120-180ms que ya usa el resto de la app, sin rebote). Si la lista fuera más alta que la pantalla, arrastrar cerca del borde superior o inferior del modal hace scroll automático — con los 5 bloques actuales no se nota porque entran todos sin scroll, pero queda listo para cuando la lista crezca.

↑/↓ siguen ahí, intactos en su funcionamiento — los dejé más chicos y discretos (el arrastre pasa a ser lo principal), pero cualquiera puede seguir usándolos igual que antes, y son el camino que sigue funcionando con teclado o lector de pantalla, ya que el arrastre táctil no es algo que esos dispositivos puedan operar.

## Qué no toqué

Los bloques disponibles, la lógica de mostrar/ocultar, el orden por defecto, "Restaurar inicio predeterminado", el contenido de cada bloque de Inicio y el diseño general de la app — nada de eso cambió. Esto es exclusivamente sobre cómo se reordena dentro de "Personalizar inicio".

## Pruebas

10/10 en una batería nueva (`test-home-layout-drag.js`), simulando mantener-presionado-y-arrastrar: un toque rápido sin mantener no reordena; mantener y arrastrar una posición mueve el bloque correctamente; arrastrar de la primera posición hasta la última funciona de punta a punta; un gesto horizontal se descarta; el switch de mostrar/ocultar sigue funcionando sin que el arrastre lo interfiera; el nuevo orden persiste tras cerrar y recargar; "Restaurar inicio predeterminado" sigue devolviendo exactamente el orden original después de haber usado el arrastre; ninguna fila queda "pegada" con un estilo residual tras soltarla. Además re-corrí toda la batería de regresión de la sesión (íconos, rutas, calendario, riego múltiple, sugerencias, respaldo, motion, y la de ↑/↓ + mostrar/ocultar de Personalizar inicio): todo sigue pasando, 0 errores de consola.

## Archivos tocados

`js/views/inicio.js` (nueva función `habilitarArrastreHomeLayout`, y la fila de "Personalizar inicio" ahora incluye el handle `≡`), `css/styles.css` (estilos del handle, la fila mientras se arrastra, el placeholder de destino, y ↑/↓ en su versión más discreta). No se tocó `motor-home-layout.js`, `index.html` ni `sw.js` — el sistema de guardado es el mismo de antes, esto solo cambia la interacción para reordenar.
