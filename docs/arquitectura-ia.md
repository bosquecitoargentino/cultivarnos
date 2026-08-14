# Cultivarnos — Arquitectura para orientación estacional + asistente agrícola con IA

Documento de diagnóstico y propuesta, previo a modificar código. No implementa nada todavía.

**v2 — actualizado con dos decisiones tuyas:**
1. La Etapa A va a detectar el hemisferio automáticamente por GPS (con corrección manual) y va a guardar coordenadas aproximadas para poder afinar clima/región más adelante.
2. La IA pasa a ser el motor principal de la orientación (estacional y por cultivo) desde el principio, no algo que llega recién en la Etapa D. El motor local se achica a lo mínimo necesario para que la app siga mostrando algo útil sin conexión.

## 1. Cómo está estructurada la aplicación hoy

(sin cambios respecto al diagnóstico anterior — se mantiene como referencia)

Cultivarnos es una SPA vanilla JS sin build step, servida como archivos estáticos desde GitHub Pages. Router hash-based en `app.js`. Datos en IndexedDB (`db.js`, `DB_VERSION = 1`) con 4 stores: `cultivos`, `eventos`, `recordatorios`, `fotos`, creados de forma aditiva (`if (!contains) crear`) — lo que permite subir versión y sumar stores nuevos sin tocar los existentes. Fotos como `Blob`, comprimidas a 1600px/JPEG 0.82 al guardarse. UI compartida en `utils.js` (`createModal`, grilla/lightbox de fotos, helpers de fecha). Service Worker network-first con `APP_SHELL` explícito.

## 2. Qué podemos reutilizar tal cual

(sin cambios — ver punto 2 de la v1: router, patrón aditivo de `db.js`, `createModal`, `fotoUrlCache` + grilla de fotos, sistema de recordatorios, helpers de `utils.js`, Service Worker.)

## 3. Principio de arquitectura (actualizado)

Sigue habiendo dos motores, pero con un balance distinto al propuesto originalmente:

```
                    ┌─────────────────────┐
                    │   Cultivarnos PWA     │
                    └──────────┬───────────┘
                               │
                 ┌─────────────┴─────────────┐
                 │                            │
        ┌────────▼────────┐         ┌─────────▼─────────┐
        │  Motor local     │         │  Asistente IA       │
        │  mínimo          │         │  (motor principal    │
        │  (offline,       │         │  de orientación,     │
        │  siempre         │         │  requiere conexión)  │
        │  disponible)     │         └─────────┬─────────┘
        └──────────────────┘                   │ HTTPS
                                     ┌──────────▼───────────┐
                                     │  función serverless   │
                                     │  (guarda la API key)  │
                                     └──────────┬───────────┘
                                                │
                                     ┌──────────▼───────────┐
                                     │   API de Claude       │
                                     └────────────────────────┘
```

**Motor local mínimo** — ya no redacta consejos con texto elaborado. Solo calcula datos objetivos y verificables sin red: en qué ventana de siembra cae cada especie este mes, día N del cultivo, si ya existe tal o cual evento en el historial. Es la base de datos que la IA va a leer, y también lo que se muestra offline como respaldo simple (ej. una lista de especies "en ventana" sin redacción, o "Día 35" sin interpretación) cuando no hay conexión.

**Asistente IA** — pasa a ser quien redacta la orientación real: tanto "Esta temporada" (Inicio) como "Ahora en este cultivo" (ficha) se arman con una consulta a la IA, no con plantillas de texto fijas. Sigue habiendo un principio importante que no cambia: la IA nunca se ejecuta sola en segundo plano sin que el usuario lo note — al entrar a Inicio o a una ficha, si hay conexión, se pide la orientación de forma automática pero visible (con un estado de carga discreto), nunca oculta ni se usa para "vigilar" al usuario. Y sigue sin diagnosticar con certeza: todo el texto, tanto de "Esta temporada" como de las respuestas conversacionales, habla siempre en términos de experiencia — "suele", "en general", "podría", "es habitual que" — nunca en afirmaciones absolutas ni instrucciones tipo "tenés que hacer X".

Esto significa una diferencia real respecto al diseño original: **estas dos secciones nuevas (Esta temporada / Ahora en este cultivo) van a necesitar conexión a internet para mostrar su versión completa.** Sin conexión van a mostrar la versión mínima basada en datos (motor local), nunca un error feo ni una pantalla vacía. El resto de la app — cultivos, fotos, recordatorios, historial — sigue funcionando 100% offline exactamente igual que hoy, eso no se toca.

## 4. Ubicación por GPS (Etapa A)

En **Configuración**, un botón "📍 Usar mi ubicación" que:
1. Pide permiso al navegador vía `navigator.geolocation.getCurrentPosition()` — es un permiso estándar del navegador (como el de la cámara que ya usa la app), vos decidís si lo autorizás desde el diálogo nativo del teléfono.
2. Calcula el hemisferio automáticamente (`latitud >= 0` → Norte, `< 0` → Sur).
3. Guarda `latitud` y `longitud` **redondeadas a 1 decimal** (precisión de manzana/barrio, no de tu casa exacta — suficiente para hemisferio y una futura estimación de clima, sin guardar tu ubicación exacta).
4. Sigue permitiendo corregir el hemisferio a mano si el GPS falla, si preferís no darlo, o si te mudás.

Si el navegador niega el permiso o no hay GPS disponible (típico en desktop), la app no insiste: muestra el selector manual de hemisferio como única opción, sin bloquear nada.

## 5. Archivos nuevos, por etapa (actualizado)

**Etapa A — Fundaciones locales (sin IA, 100% offline)**
- `js/data/cultivos-data.js` — biblioteca de especies.
- `js/motor-estacional.js` — cálculo puro de "qué especies están en ventana de siembra este mes" (sin redacción), y navegación mes a mes para el calendario.
- `js/views/configuracion.js` — hemisferio (automático por GPS + corrección manual), coordenadas guardadas, campos preparados (región/clima/suelo) para más adelante.
- `js/views/calendario.js` — vista "Sembrar ahora" con navegación `← Mes | Mes | Mes →`.
- Cambios chicos en `inicio.js` (sección "Esta temporada" — versión mínima local por ahora, se conecta a IA en la Etapa C), `index.html`, `sw.js`.

**Etapa B — Arquitectura de IA (sin UI visible todavía)**
- `prompts/agricultor.js` — system prompt como string editable.
- `js/ia/contexto.js` — `construirContextoCultivo(cultivoId)`, `construirContextoHuerta()`, `construirContextoTemporada()`.
- `js/ia/proveedor-ia.js` — `consultarIA(contexto, mensaje, opciones)`, único punto que habla con el proxy.
- Función serverless (fuera de lo publicado por GitHub Pages) con la API key como secreto de plataforma.
- Store `conversaciones` en IndexedDB.
- Se prueba de forma aislada (consola / vista oculta) antes de exponer nada.

**Etapa C — La IA pasa a redactar "Esta temporada" y "Ahora en este cultivo"**
- `inicio.js`: la sección "Esta temporada" pasa a pedirle a la IA una lectura breve (4-8 recomendaciones con una frase de contexto cada una), usando el motor local como fuente de datos y como respaldo offline.
- `detalle.js`: nueva sección "Ahora en este cultivo 🌱" con la misma lógica — IA como redactora principal, motor local como respaldo offline. Botón "Recordarme" reutiliza el modal de recordatorio existente.
- Acá es donde se nota el cambio de enfoque: ya no hay un "motor de reglas con textos hardcodeados" separado (la vieja Etapa B) — ese trabajo lo hace directamente la IA a partir de los datos que junta el motor local.

**Etapa D — Consulta conversacional desde la ficha**
- Vista/modal de chat asociado a un cultivo (🌱 Consultar), y "🌱 Analizar observación" opcional tras guardar una observación.

**Etapa E — Consulta con fotografías**
- Extiende `proveedor-ia.js` y la función serverless para aceptar una imagen opcional, reutilizando la grilla de fotos existente.

**Etapa F — Asistente general de la huerta**
- `js/views/huerta.js` — "🌿 Preguntale a tu huerta", usa `construirContextoHuerta()`.

## 6. Cambios en IndexedDB (actualizado)

Igual que en la v1, todo aditivo, subiendo `DB_VERSION` de a poco, sin tocar stores existentes:

- **`configuracion`** (Etapa A): `{ id: 'general', hemisferio: 'sur', lat: -34.6, lon: -58.4, region: null, clima: null, tipoSuelo: null }`. Incluido en `exportAll`/`importAll`.
- **`conversaciones`** (Etapa B): historial reciente de chat por cultivo o general.
- Campos opcionales de contexto ambiental por cultivo (Parte 15 del pedido original — sol, suelo, cobertura): sin migración, son campos nuevos y opcionales dentro del objeto `cultivo`.

## 7. Cómo protegemos la API key

Sin cambios respecto a la v1: GitHub Pages es estático, la key no puede vivir en el cliente. Función serverless separada (recomiendo Cloudflare Workers) que guarda la key como secreto de plataforma, valida el origen (CORS a tu dominio de GitHub Pages), y agrega una mitigación básica de abuso (cabecera compartida + límite de pedidos por IP), ya que al no haber cuentas/login no hay forma de autenticar usuarios reales. Esto requiere que vos crees la cuenta en la plataforma elegida y generes la API key de Anthropic — no son acciones que yo pueda hacer por vos.

## 8. Orden de implementación

1. **Etapa A** — biblioteca, hemisferio por GPS, calendario. Sin riesgo para lo existente, sin necesidad de conexión ni cuentas externas.
2. **Etapa B** — arquitectura de IA (proxy + contexto + proveedor + prompt), sin exponer nada al usuario todavía. Acá es donde vas a necesitar crear la cuenta serverless y la API key.
3. **Etapa C** — la IA empieza a redactar "Esta temporada" y "Ahora en este cultivo".
4. **Etapa D** — chat desde la ficha del cultivo.
5. **Etapa E** — consulta con fotografías.
6. **Etapa F** — asistente general de la huerta.

## 9. Riesgos (actualizado)

Se mantienen los riesgos de la v1 (ver documento original: aditividad de IndexedDB, protección de la key, costo de uso, sandbox sin acceso general a internet). Se suma:

- **Dependencia de conexión para las dos secciones nuevas del home/ficha**: mitigado con el respaldo local mínimo (datos sin redacción) cuando no hay señal, para que nunca se vea una pantalla rota o vacía.
- **Costo de uso más alto de lo esperado**, porque ahora la IA se consulta más seguido (cada vez que se entra a Inicio o a una ficha con conexión, no solo cuando el usuario abre un chat). Conviene: (a) cachear la respuesta de "Esta temporada" del día — no volver a pedirla si ya se consultó hoy y no cambiaron los datos — y (b) tener bien configuradas las alertas de gasto en la cuenta de Anthropic desde el principio, no como un ajuste posterior.
- **Ubicación GPS**: aunque se guarda redondeada y solo por acción explícita del usuario (nunca automática ni en segundo plano), sigue siendo un dato sensible. Se va a pedir de forma clara en Configuración, explicando para qué se usa, y va a quedar incluida en el respaldo exportable como cualquier otro dato tuyo.
