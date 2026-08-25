# Recordatorio de respaldo + archivo con nombre fijo

## La limitación real de iPhone (importante, y por eso pregunté antes de tocar código)

Ninguna app web puede reescribir sola un archivo específico dentro de Files en iOS. Aunque el archivo se llame siempre igual, cada descarga es un evento nuevo: si ya existe uno con ese nombre en la carpeta de destino, iOS te va a preguntar si querés "Reemplazar" o guardarlo aparte — pero eso requiere tu confirmación, no pasa solo. No hay forma de evitar ese toque sin salirse de lo que un sitio/PWA puede hacer en iPhone.

Con eso claro, elegiste la combinación que se arma acá: nombre de archivo fijo (para que ese "Reemplazar" sea posible) + un aviso mensual (para que no se te pase).

## Qué cambia

El botón "Exportar respaldo" (tanto el del menú superior como el de Configuración) ya no genera un archivo por día. Antes era `cultivarnos-backup-2026-08-25.json`; ahora siempre se llama `cultivarnos-backup.json`. La próxima vez que exportes y tu navegador/Files te pregunte dónde guardarlo, si elegís la misma carpeta que la vez anterior, te va a ofrecer reemplazar el archivo viejo en vez de sumar uno nuevo.

En Inicio aparece un aviso suave (mismo estilo tranquilo que ya usa "Configurá tu hemisferio", sin rojo ni alarma) cuando pasó más de un mes desde tu último respaldo — o si todavía no hiciste ninguno. Un toque en "Hacer respaldo" exporta y el aviso desaparece hasta el próximo mes. Si no tenés ningún cultivo cargado todavía, el aviso no aparece (no hay nada que respaldar).

A diferencia de las sugerencias de la ficha, este aviso no tiene un botón de "ocultar": me pediste explícitamente un recordatorio, así que a propósito no desaparece solo antes de que hagas el respaldo.

## Los archivos viejos con fecha

Como el nombre cambió recién ahora, los `cultivarnos-backup-2026-XX-XX.json` que ya tenías guardados en Files de exportaciones anteriores van a seguir estando ahí — esto no los borra ni los toca. Si querés, en algún momento los podés limpiar a mano; no es necesario para que esto funcione de acá en adelante.

## Qué no toqué

`DB_VERSION` sigue en 4 — todo esto es un campo (`config.ultimoRespaldo`, que ya existía) leído con un umbral nuevo, sin ningún store nuevo. La validación de un respaldo importado (`validarRespaldo`) no cambió: un backup viejo con nombre de archivo distinto se importa exactamente igual, el nombre del archivo nunca formó parte de los datos en sí.

## Pruebas

12/12 en una batería nueva: sin cultivos no aparece el aviso; con un cultivo y sin respaldo previo aparece con el texto correcto; al exportar, el archivo descargado se llama `cultivarnos-backup.json` (sin fecha) y el aviso desaparece; simulando que pasaron 40 días vuelve a aparecer con otro texto; a los 10 días no aparece; exportar desde Configuración usa el mismo nombre fijo; el resto de la app sigue andando y el backup exportado se sigue pudiendo importar. Además corrí las 4 baterías de regresión de esta sesión (iconos, rutas, calendario, riego múltiple/últimos movimientos, sugerencias): 90/90, 0 errores de consola — nada de lo anterior se vio afectado.
