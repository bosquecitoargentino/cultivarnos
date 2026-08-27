# Reordenar Mis cultivos: mantener presionado + arrastrar

## Qué hay ahora

En "Mis cultivos", un toque normal sobre una tarjeta sigue abriendo la ficha, exactamente como antes. Mantener presionada una tarjeta cerca de 1 segundo activa el arrastre: se eleva apenas, las demás tarjetas se corren para hacerle lugar, y al soltar el nuevo orden queda guardado al toque. No agregué ningún botón "Ordenar" ni una pantalla o modo aparte — la lista sigue viéndose exactamente igual que siempre hasta que alguien decide mantener presionado.

Antes de que se cumpla el segundo de espera, cualquier movimiento se toma como scroll normal (no como el inicio de un arrastre), así que desplazarte por la lista nunca se ve interrumpido ni corre el riesgo de mover una tarjeta sin querer.

## Cómo se comporta

El gesto es solo vertical: si te desviás de costado, la tarjeta no lo sigue. Mientras se arrastra, se ve una elevación discreta (sombra + escala 1.01) y, si el navegador lo soporta, una vibración muy breve (en iPhone Safari no existe esa función, así que ahí simplemente no vibra — no hace falta que lo haga). Si arrastrás cerca del borde superior o inferior de la pantalla, la lista hace scroll sola, así podés mover una tarjeta de la primera a la última posición sin soltar en el medio.

La primera vez que entrás a "Mis cultivos" vas a ver un texto chico arriba de la lista: "Mantené presionado un cultivo para moverlo". Desaparece solo después de tu primer reordenamiento y no vuelve a insistir.

## Alternativa accesible y restaurar

Agregué "Reordenar cultivos" al menú `⋯` (junto a "Personalizar inicio", Banco y Configuración) — no es un botón nuevo en la pantalla de Mis cultivos, vive en el menú que ya existía. Ahí adentro hay una lista simple con ↑/↓ para mover cualquier cultivo (funciona con teclado y lectores de pantalla, para quien no pueda usar el gesto táctil) y, al final, "Restaurar orden predeterminado" para volver al orden por fecha de siempre.

## Qué no toqué

El orden es una preferencia de presentación, guardada aparte (en el navegador, no en la base de datos del cultivo) — nunca se modifica ningún dato agronómico ni se llama a nada que edite el registro del cultivo. Si reordenás mientras estás viendo "Activos", los cultivos "Finalizados" (que en ese momento no se ven) no se mueven de donde estaban. Cambiar de pestaña (Activos/Finalizados/Todos) nunca reordena nada por sí solo.

## Pruebas

16/16 en una batería nueva (`test-orden-cultivos.js`): el orden por defecto es el de siempre (más reciente primero); el aviso de ayuda aparece la primera vez; un toque normal sigue abriendo la ficha; moverse antes de cumplir el segundo de espera no dispara ningún arrastre; mantener presionado y arrastrar reordena correctamente; el aviso de ayuda desaparece después del primer reordenamiento; el nuevo orden persiste después de recargar la página; cambiar de pestaña no lo altera; arrastrar cerca del borde inferior hace scroll automático; la alternativa ↑/↓ del menú funciona igual; "Restaurar orden predeterminado" vuelve exactamente al orden original; ninguna tarjeta queda con estilos residuales después de soltar. Además re-corrí las 9 baterías de regresión de toda la sesión (íconos, rutas, calendario, riego múltiple, sugerencias, respaldo, motion, y las dos de Personalizar inicio): 161 pruebas en total, todas pasando, 0 errores de consola.

De paso, con la app ahora un poco más pesada (dos archivos nuevos esta semana), un par de pruebas viejas (`test-calendario.js`, `test-sugerencias.js`) empezaron a fallar por timing propio de la prueba —no de la app— porque esperaban solo 400-500ms a que cargara antes de interactuar. Les di más margen (900ms) y volvieron a pasar sin problema; quedó documentado en los archivos de prueba mismos.

## Archivos tocados

Nuevo: `js/motor-orden-cultivos.js` (guardado/lectura/restauración del orden, y la fusión de un sub-orden parcial dentro del orden completo). Modificados: `js/views/cultivos.js` (arrastre + modal de "Reordenar cultivos"), `index.html` (nuevo ítem de menú + script), `css/styles.css` (feedback visual del arrastre), `sw.js` (versión de caché 1.19.1 → 1.20.0).
