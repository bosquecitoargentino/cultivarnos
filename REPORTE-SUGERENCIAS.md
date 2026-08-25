# Sugerencias — versión simple

## Qué cambia

Antes, "Recibir una sugerencia" era un botón que había que tocar en cada ficha, y no existía nada parecido en Inicio. Ahora hay dos lugares:

En cada ficha de cultivo activo, si hay algo pertinente para mostrar, aparece directamente una sección **Sugerencia** con una frase corta y tres acciones: **Registrar algo**, **Otra sugerencia** y **Ocultar**. Si no hay nada realmente pertinente para ese cultivo en este momento, la sección completa no aparece — nunca se rellena con una frase genérica tipo "observá cómo viene tu planta".

En Inicio, una sección **Sugerencia para hoy** muestra la mejor sugerencia entre *todos* los cultivos activos (nunca la del primer cultivo ni una al azar): nombre del cultivo, la frase, y un botón **Ver cultivo** que lleva directo a esa ficha. Sin badge, sin contador, sin color de alerta — es algo que podrías mirar, no una tarea pendiente. Si ningún cultivo tiene algo pertinente, la sección tampoco aparece.

No usa IA ni conexión — es el mismo motor local que ya existía (`motor-observacion.js`), extendido, no reescrito.

## Qué reutiliza y qué es nuevo

El motor de selección (`obtenerSugerenciaCultivo`) ya existía y ya hacía casi todo lo pedido: una sola sugerencia por vez, nunca una lista, con prioridad por especie/etapa antes que texto genérico, memoria corta para no repetir lo último mostrado (`cultivo.sugerenciasRecientes`, campo que ya existía), y devolver nada cuando no hay ninguna candidata razonable. Ese motor sigue intacto en su forma; lo que agregué son dos cosas encima:

Una fuente nueva de candidatas, "evento reciente": si hubo un trasplante, poda o cosecha real hace pocos días, se puede sugerir observar cómo sigue la planta después de eso (ej. "¿Cómo se ve la recuperación después del trasplante?"). Ojo con esto: se arma **solo** a partir de un evento que sí existe, con su fecha real — nunca a partir de la ausencia de uno. En particular no hay (ni va a haber) ninguna regla que diga "hace N días que no se registra un riego, capaz haga falta regar": eso violaría justamente lo que pediste, así que ese camino no existe en el código, no es que esté "apagado".

Una función nueva, `getSugerenciaDestacada()`, que calcula la mejor candidata de cada cultivo activo (reusando la función de arriba) y recién ahí elige una sola entre todas. Se guarda un rastro corto en `configuracion` (mismo store que ya existía, sin store nuevo) para no repetir la misma destacada día tras día — si volvés a entrar a Inicio el mismo día, ves la misma; al otro día busca otra evitando las últimas 8, y si ya se mostraron todas las combinaciones razonables, prefiere no mostrar nada antes que repetir.

No agregué un escalón "estacional" a la prioridad (el pedido lo mencionaba como tercer nivel): `motor-estacional.js` solo sabe calcular cuándo *empezar* a sembrar algo nuevo, no da información de seguimiento para un cultivo que ya está en marcha. Inventar una sugerencia estacional sin un dato real detrás habría sido justamente el tipo de relleno genérico que pediste evitar, así que preferí dejarlo afuera antes que forzarlo.

Tampoco toqué el banco de preguntas (`preguntas-cultivos.js`, ~1400 líneas) ni el texto de observación de la Biblioteca: ya estaban redactados como preguntas de observación ("¿Cómo está creciendo?", "¿Hay señales de exceso de agua?"), no como órdenes — el problema anterior era la frecuencia/estructura de preguntas encadenadas, no el tono de cada una por separado.

## "Ocultar" — cómo funciona exactamente

No trae una sugerencia distinta (eso es "Otra sugerencia"): la retira y muestra una nota chica ("Listo, no te la muestro más por ahora"). Reutiliza el mismo mecanismo que ya evita repetir lo último mostrado (`cultivo.sugerenciasRecientes`) — no armé un sistema de cooldown aparte para esto.

## `DB_VERSION` sigue en 4

No hizo falta ningún store ni índice nuevo. Todo lo nuevo son campos opcionales sobre `configuracion` (que ya existía) y sobre el registro de `cultivos` (`sugerenciasRecientes`, que también ya existía). Un backup viejo se sigue importando exactamente igual.

## Archivos tocados

`js/motor-observacion.js` (fuente "evento reciente" + `getSugerenciaDestacada()`), `js/views/detalle.js` (la sección ahora siempre visible cuando hay algo que mostrar, botón "Ocultar" nuevo), `js/views/inicio.js` (sección "Sugerencia para hoy"), `css/styles.css` (estilos de las piezas nuevas, reutilizando `.sugerencia-card` existente), `sw.js` (versión de caché 1.15.0 → 1.16.0). No se creó ningún archivo nuevo.

## Pruebas

28/28 en una batería nueva armada para esto: cada cultivo activo (incluida una especie agroforestal, Tithonia, para confirmar que no se le fuerza vocabulario hortícola) muestra una sugerencia coherente; un cultivo finalizado no muestra la sección; un evento de 2022 cargado hoy no dispara la sugerencia de "evento reciente" (mientras que un trasplante real de hace 4 días sí puede activarla); "Otra sugerencia" no repite la misma; "Ocultar" retira la tarjeta y no rompe nada al volver a entrar; Inicio muestra a lo sumo una destacada; "Ver cultivo" navega a la ficha correcta; la destacada no rota solo por reabrir Inicio el mismo día; todo sigue funcionando con la red desconectada.

Además corrí las 4 baterías de regresión ya existentes de esta sesión (iconos, vistas/rutas, calendario, riego múltiple + últimos movimientos): 62/62, 0 errores de consola. Nada de lo anterior se vio afectado.

## Sincronización

Te dejo los archivos acá abajo y sincronizo directo a tu Mac.
