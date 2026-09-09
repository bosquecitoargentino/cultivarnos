# Arquitectura de Firebase — Cultivarnos Beta V1

Documento para quien audite la seguridad de esta integración antes de un
lanzamiento público real. Describe qué se construyó, por qué se tomó cada
decisión no trivial, qué es una limitación conocida (no un descuido), y
qué falta evaluar.

Cultivarnos era, hasta esta integración, una PWA 100% local: IndexedDB por
dispositivo, sin cuentas, sin backend. Esta integración agrega una capa de
identidad + cuenta + respaldo/sincronización con Firebase, **sin
reemplazar esa base**: IndexedDB sigue siendo la fuente operativa de la
que la UI lee y escribe; Firestore es una copia sincronizada de la
cuenta, nunca la fuente de la verdad de la que ninguna vista lee
directamente.

## 1. Resumen de lo implementado

- **Autenticación**: Firebase Authentication, solo Email/Password y
  Google Sign-In (siempre vía `signInWithPopup()`, en todos los
  dispositivos — ver `REPORTE-GOOGLE-SIGNIN.md`: la variante con
  `signInWithRedirect()` para móvil, que era el plan original, se
  descartó porque depende de un iframe cross-origin que Safari/iOS
  bloquea por defecto).
- **Identidad propia**: un username elegido por la persona (3–24
  caracteres, `[a-z0-9_]`), separado del uid y del email, reservado de
  forma atómica.
- **Datos sincronizados**: cultivos, eventos, recordatorios, lotes de
  propagación, y el subconjunto de configuración con sentido entre
  dispositivos (hemisferio/ubicación/clima/suelo).
- **Offline-first real**: IndexedDB sigue siendo la fuente operativa;
  Firestore es una copia. La app funciona sin red exactamente igual que
  antes de esta integración — este comportamiento es él mismo
  verificable en cualquier entorno sin salida de red a Firebase (ver
  sección 9).
- **Aislamiento entre cuentas en un mismo dispositivo**: cada uid tiene su
  propia base IndexedDB física.
- **Recuperación multi-dispositivo**: login en un dispositivo nuevo
  hidrata la huerta completa desde Firestore.
- **Reconciliación de huerta pre-existente**: un dispositivo con datos
  locales de antes de tener cuenta ofrece vincularlos, nunca los sube ni
  los mezcla en automático.
- **Firestore Security Rules**: deny-by-default, versionadas en el repo
  (`firestore.rules`).
- **UI de cuenta**: pantallas de bienvenida/crear cuenta/iniciar
  sesión/recuperar contraseña/elegir usuario, más una sección "Cuenta" en
  Configuración (usuario, email, estado de sync, cerrar sesión,
  restablecer contraseña).
- **Indicador discreto** de "sin conexión" o "pendiente de sincronizar" en
  la barra superior (un punto, no un banner).
- **Mensajes de error en español**, traducidos desde los códigos de
  Firebase.
- **Notificaciones push** (Firebase Cloud Messaging, Web/PWA): recordatorios
  a su hora exacta y sugerencias contextuales opcionales, multi-dispositivo,
  con activación explícita (nunca automática). Ver sección 12 para el
  detalle completo.

## 2. No implementado todavía (fuera de alcance de esta beta, a propósito)

Lista explícita de lo que **no** se construyó — todo esto quedó pedido
así, no es una omisión:

- Login por teléfono/SMS, Apple, Facebook u otro proveedor que no sea
  Email/Password o Google.
- Sincronización de fotos (Cloud Storage). El modelo conceptual está
  pensado (`localId`/`remoteUrl`/`storagePath`/`syncStatus`) pero no
  implementado: las fotos siguen siendo 100% locales, incluida la copia
  que se hace al vincular una huerta pre-existente (ver sección 6).
- App Check — **pendiente de evaluar antes de un lanzamiento público**
  (ver sección 10, es el ítem de seguridad más importante que falta).
- Eliminar cuenta (borrado de la cuenta de Auth + sus datos).
- Notificaciones por SMS, WhatsApp o email; topics; badges complejos;
  snooze; acciones dentro de la notificación; repetición
  recurrente (diaria/semanal) de recordatorios; IA; analítica de
  engagement sobre las notificaciones (ver sección 12 — son las dos
  únicas Cloud Functions del proyecto, y son deliberadamente chicas:
  nada de esto se construyó).
- Planes pagos / facturación.
- Funciones de comunidad o de compartir datos entre cuentas.
- Analítica invasiva — no se agregó ningún SDK de analytics/tracking.

## 3. Estructura cloud utilizada (modelo de datos Firestore)

```
users/{uid}                                    { username, authProvider, createdAt, updatedAt }
usernames/{usernameNormalizado}                { uid }
users/{uid}/cultivos/{deviceId}__{localId}      registro de cultivo + bookkeeping de sync
users/{uid}/eventos/{deviceId}__{localId}       registro de evento + bookkeeping de sync
users/{uid}/recordatorios/{deviceId}__{localId} registro de recordatorio + bookkeeping de sync
users/{uid}/lotesPropagacion/{deviceId}__{localId} registro de lote + bookkeeping de sync
users/{uid}/configuracion/general              { hemisferio, lat, lon, region, clima, tipoSuelo }
```

Notas sobre este modelo:

- **`users/{uid}` no guarda el email.** Ya vive en Firebase Authentication
  (`auth.currentUser.email`) — se evita duplicar PII en Firestore sin
  necesidad. La pantalla de Configuración lo muestra leyéndolo de Auth,
  no de Firestore.
- **No existe una colección `espacios`.** En el modelo local, "espacios"
  es derivado en memoria (`motor-espacios.js`) a partir de
  cultivos+eventos, nunca su propio store en IndexedDB — no hay nada que
  sincronizar ahí aparte de cultivos/eventos, que ya sincronizan.
- **No existe una colección `conversaciones`.** El store IndexedDB
  homónimo está confirmado sin uso (código muerto de una función
  descartada), no se migró a Firestore.
- **IDs de documento — el problema de colisión entre dispositivos.** Los
  ids locales en IndexedDB son números autoincrementales, generados de
  forma independiente en cada instalación. Dos dispositivos offline de
  la misma cuenta pueden generar el mismo próximo id (ej. los dos crean
  su primer cultivo nuevo con id local `8`). Usar el id local tal cual
  como id de documento haría que un dispositivo pisara silenciosamente
  al otro. La solución: cada instalación genera una vez un `deviceId`
  (`crypto.randomUUID()`, cacheado en `localStorage['cultivarnos-device-id']`,
  ver `obtenerDeviceId()` en `js/db.js`), y el id de documento en
  Firestore es **`${deviceId}__${localId}`** — determinístico, sin tabla
  de mapeo, sin tocar el id local. El campo `id` en IndexedDB nunca
  cambia; cuando un dispositivo nuevo hidrata un registro desde la nube,
  lo guarda con el mismo `localId` que ya tenía en el documento remoto
  (viaja como `datos.localId`), así el mismo cultivo tiene el mismo id
  numérico en todos los dispositivos de la cuenta.
- **Bookkeeping de sync en cada registro**: `_remoteId`, `_syncStatus`,
  `_syncedAt` se agregan como campos internos en el registro local (no
  viajan al documento remoto — `quitarCamposInternosLocales()` en
  `firebase-sync.js` los quita antes de cada `setDoc`). No son datos de
  dominio, no afectan nada agronómico; viajan en el backup/export local
  sin problema.

## 4. Estrategia de conflictos

**Last-write-wins por `updatedAt` generado en el cliente** (string ISO),
explícitamente **no** por `serverTimestamp()`. Motivos:

1. Dos dispositivos offline necesitan poder comparar versiones apenas
   recuperan conexión, antes de que exista ningún acknowledgement del
   servidor — un timestamp de servidor no está disponible todavía en ese
   momento en el dispositivo que originó el cambio.
2. El `updatedAt` del cliente refleja mejor la intención real de la
   persona (cuál edición hizo más tarde en el tiempo real) que el orden
   de llegada al servidor, que depende de latencia de red variable.

Se guarda además `_serverUpdatedAt` (con `serverTimestamp()`) en cada
documento — **puramente observacional**, nunca se lee para decidir nada
en el motor de sync. Sirve para auditoría/debugging (poder ver, desde la
consola de Firebase, cuándo llegó cada escritura al servidor).

**Riesgo conocido, documentado a propósito**: esta estrategia depende del
reloj de cada dispositivo. Un dispositivo con el reloj mal configurado
podría "ganar" un conflicto que en los hechos perdió. Es una limitación
aceptada para esta beta (no hay un mecanismo de reloj lógico/vector
clock); si se vuelve un problema real en producción, `_serverUpdatedAt`
ya está disponible como base para migrar a una estrategia híbrida sin
tener que agregar un campo nuevo.

**Orden del ciclo de sync**: cada ciclo (`sincronizarAhora()` en
`firebase-sync.js`) hace primero `propagarBajas()` (tombstones
pendientes), después **PULL** de las 4 colecciones, y recién después
**PUSH**. El orden es deliberado: al momento de hacer push, cualquier
versión remota más nueva ya se reconcilió en local vía LWW durante el
pull — evita necesitar una transacción de lectura-antes-de-escribir en
cada push individual.

**Tombstones para bajas**: en vez de borrar el documento en Firestore al
instante, se marca `{ deleted:true, deletedAt }` (soft delete). Así, un
dispositivo que estaba offline y todavía tiene el registro localmente no
puede "resucitarlo" sin querer al reconectarse y volver a hacer push de
su copia desactualizada. La cola de tombstones pendientes de propagar
vive en un store IndexedDB nuevo, `sincronizacionPendienteEliminar`
(alimentado por hooks aditivos en `deleteEventoCompleto`/
`deleteCultivoCompleto`/`deleteLoteCompleto` en `js/db.js`).

Un detalle de implementación no obvio: cuando un tombstone que llega por
`pull()` dispara un borrado local (para reflejar la baja), ese borrado
local pasa por los mismos métodos `deleteXCompleto` que un borrado hecho
por la persona — que a su vez encolarían un tombstone **nuevo**,
redundante (el documento remoto ya tiene `deleted:true`). Sin manejarlo,
esto generaría un ping-pong infinito entre dispositivos. Se corta en
`aplicarTombstoneLocal()`, que cancela ese tombstone recién encolado
inmediatamente después del borrado espejo.

## 5. Estrategia de datos locales

- **IndexedDB sigue siendo la fuente operativa.** Todas las vistas siguen
  llamando exactamente a los mismos `DB.getX()/addX()/updateX()` de
  siempre — ninguna vista sabe que Firebase existe. `firebase-sync.js` es
  el único código que lee/escribe Firestore, y corre en segundo plano.
- **Aislamiento entre cuentas — base de datos IndexedDB por uid.** Cada
  cuenta autenticada usa su propia base física, `cultivarnos-{uid}`, en
  vez de la única base `cultivarnos` que existía antes de esta
  integración (`DB.usarBaseDeDatos(nombre)` en `js/db.js`). Esto es una
  garantía **estructural**, no una convención de filtrado que un bug
  futuro pudiera romper: es físicamente imposible que un query devuelva
  datos de otra cuenta, porque ni siquiera es la misma base de datos
  abierta.
- **La base `cultivarnos` (nombre de siempre, sin cambios) queda como
  "huerta local sin reclamar".** Es exactamente donde ya vivía la
  instalación de quien venía usando la app antes de tener cuenta. Nunca
  se borra ni se sobrescribe automáticamente.
- **"Encontramos una huerta en este dispositivo" — flujo explícito, nunca
  automático.** En el primer login, si la cuenta no tiene huerta en la
  nube todavía y este dispositivo sí tiene cultivos en la base sin
  reclamar, se muestra una pantalla con dos opciones: "Guardar mi
  huerta" (copia aditiva a `cultivarnos-{uid}`, conservando ids, incluida
  una copia local de las fotos referenciadas — no se suben, se copian de
  una base IndexedDB a la otra) o "Empezar de cero con esta cuenta". La
  base vieja **nunca se toca ni se borra** en ninguno de los dos casos —
  "no perder datos" tiene prioridad sobre todo lo demás. Si la persona
  ya tenía datos locales Y la cuenta ya tenía huerta en la nube (caso no
  cubierto por este flujo: la detección solo dispara cuando la cuenta
  todavía no tiene nada en la nube), no hay fusión automática de ningún
  tipo — ver sección 8, riesgo #3.
- **Firestore offline persistence — decisión deliberada de NO usarla.**
  El SDK de Firestore ofrece su propia caché offline (IndexedDB interna
  del SDK). Se decidió no habilitarla: mantener una sola fuente local
  (la IndexedDB propia de la app, con su esquema ya conocido y
  auditado) es más simple y más predecible que coordinar dos cachés
  offline independientes (la de Firestore y la de `db.js`) que
  podrían desincronizarse entre sí.
- **Fotos: no sincronizadas en V1.** Siguen siendo 100% locales, por
  dispositivo. El modelo conceptual para cuando se implemente (Cloud
  Storage) está pensado pero no construido — ver sección 2.

## 6. Boot, sesión y arranque resiliente

- **Nunca bloquear el arranque por Firebase.** El SDK se importa con
  `import()` dinámico dentro de un `try/catch` (`firebase-config.js`,
  `inicializar()`) — nunca un `import` estático. Si el CDN no responde
  (sin red, firewall corporativo, Firebase caído), `obtenerFirebaseApp()`
  resuelve `null` y toda la app sigue funcionando en modo 100% local,
  exactamente como antes de esta integración.
- **`CultivarnosAuth.ready()` tiene un timeout de 4 segundos.** Si
  Firebase no confirma sesión sí/no en ese tiempo, se resuelve igual, sin
  bloquear el primer render.
- **Gate de sesión (`decidirDestino()` en `app.js`)**: sin sesión
  confirmada, redirige a `#/bienvenida` (salvo que la ruta pedida ya sea
  una de auth). Con sesión pero sin perfil (`necesitaUsername`), redirige
  a `#/elegir-usuario`. Con sesión y perfil pero con una huerta local sin
  resolver, redirige a `#/vincular-huerta`. En cualquier otro caso, deja
  pasar la ruta pedida.
- **Caso límite deliberadamente cubierto**: sesión cacheada (había un uid
  guardado en `localStorage['cultivarnos-uid-activo']`) pero Firebase no
  contesta ahora mismo (sin red). En vez de mandar a la persona a
  `#/bienvenida` — perdiendo acceso a su propia huerta ya descargada solo
  por falta de señal en este instante — `continuarModoOfflineConUid()`
  abre directamente la base `cultivarnos-{uid}` cacheada y deja seguir
  usando la app en modo local. El Sync Engine no arranca en este modo
  (no hay red); arranca solo, más tarde, cuando Firebase confirme una
  sesión real (dispara `router()` de nuevo vía `CultivarnosAuth.onCambio`).

## 7. Username: reserva atómica

`elegirUsername()` usa una `runTransaction`: lee `usernames/{normalizado}`,
si ya existe aborta con un mensaje claro; si no existe, escribe
`usernames/{normalizado} = { uid }` y `users/{uid} = {...perfil}` **en la
misma transacción**. No hay forma de que quede un username sin perfil o
un perfil sin username: los dos se crean juntos o ninguno.

El único estado "parcial" posible es: se crea el usuario en Firebase Auth
(email+contraseña) pero la transacción de reserva de username falla
después (red cortada a mitad de camino, por ejemplo). Ese estado queda,
a propósito, **idéntico** al de alguien que entra con Google por primera
vez: usuario autenticado, sin documento en `users/{uid}` todavía → se
vuelve a mostrar "Elegí tu nombre de usuario" la próxima vez que entre.
No es un estado corrupto ni requiere limpieza manual.

## 8. Riesgos y decisiones que el programador profesional debería revisar

1. **App Check no está implementado.** Es, con diferencia, el ítem de
   seguridad de mayor prioridad antes de un lanzamiento público real —
   ver sección 10.
2. **Desfasaje de reloj del dispositivo en la resolución de conflictos**
   (sección 4) — LWW por `updatedAt` de cliente es la decisión correcta
   para poder resolver conflictos offline, pero es vulnerable a un reloj
   mal configurado. Vale la pena revisar si el impacto real (¿con qué
   frecuencia dos dispositivos editan el mismo registro en la ventana de
   conflicto?) justifica una estrategia más sofisticada.
3. **No hay fusión automática si dos dispositivos offline de la misma
   cuenta, cada uno con datos propios, se sincronizan por primera vez a
   la vez.** El flujo "Encontramos una huerta" solo cubre el caso de un
   dispositivo con datos locales pre-existentes entrando a una cuenta
   que **todavía no tiene nada en la nube**. El caso "cuenta ya tiene
   huerta en la nube Y este dispositivo, además, tiene una base local
   sin reclamar con datos propios" no dispara ningún flujo — la base
   local sin reclamar simplemente queda inerte y sin usar para esa
   cuenta (no se pierde: sigue en `cultivarnos`, se podría exponer una
   forma de recuperarla manualmente a futuro si hiciera falta).
4. **Tamaño de las Security Rules de validación de payload.** Se validan
   tipos y presencia de los campos que importan para que el motor de
   sync funcione bien (`localId`, `updatedAt`, `deleted`, tamaño del
   documento) pero **no se replica el esquema completo** de cada tipo de
   registro (cultivo/evento/recordatorio/lote tienen formas distintas y
   evolucionan). Esto es una decisión deliberada de mantenibilidad (ver
   comentarios en `firestore.rules`), pero significa que un cliente
   comprometido/modificado podría escribir campos de dominio arbitrarios
   dentro del límite de tamaño — vale la pena que el auditor evalúe si
   el costo de mantener un esquema más estricto vale la pena para este
   producto.
5. **`apiKey` público en el bundle.** Es el comportamiento esperado y
   documentado de Firebase (la seguridad real vive en las Security
   Rules, no en ocultar el `apiKey`) — mencionado acá explícitamente para
   que quede claro que no es un descuido, por si el auditor lo señala
   como hallazgo automático de un scanner.
6. **Sin App Check, y sin Cloud Functions**, toda la superficie de
   ataque real de este backend son las Security Rules de Firestore y las
   reglas de Authentication propias de Firebase (rate limiting de
   intentos de login, etc., gestionadas por Firebase). Vale la pena una
   revisión dedicada de `firestore.rules` línea por línea — está
   comentado con la intención de cada regla, pero el auditor debería
   verificar independientemente que el comportamiento real coincide con
   la intención descripta.
7. **`enviarRecuperarPassword` devuelve el mismo mensaje genérico** tanto
   si el email existe como si no (`auth/user-not-found` se trata como
   éxito) — decisión deliberada para no filtrar qué emails tienen
   cuenta. Vale la pena confirmar que ningún otro punto de la UI (por
   ejemplo, el mensaje de "ya existe una cuenta con ese email" al crear
   cuenta) reintroduce esa misma filtración por otro camino — es una
   tensión conocida entre UX (avisar del error real) y no filtrar
   existencia de cuentas, y quedó resuelta a favor de la UX en ese punto
   puntual porque el email ya lo escribió la propia persona intentando
   crear SU cuenta.
8. **No hay límite de tasa (rate limiting) propio** sobre
   `verificarUsernameDisponible` (una lectura por cada tecla, debounced a
   450ms) — depende enteramente de los límites/cuotas por defecto de
   Firestore. No debería ser un problema real de costo/abuso a la escala
   de una beta, pero vale la pena que quede evaluado explícitamente antes
   de escalar.
9. **Las dos Cloud Functions corren con credenciales de administrador
   (Admin SDK) y por lo tanto bypassan por completo `firestore.rules`.**
   Es el comportamiento esperado y necesario (mandar un push tiene que
   poder leer/actualizar cualquier cuenta, no solo la propia), pero
   significa que toda la superficie de confianza de esas dos funciones
   son ellas mismas — no hay una segunda capa de Security Rules
   protegiendo lo que hacen puertas adentro. Vale la pena que el auditor
   revise `functions/lib/*.js` con ese criterio (qué leen, qué escriben,
   qué validan del estado que leen antes de actuar).
10. **El motor de sugerencias corre server-side vía Node `vm`**
    (`functions/lib/motorLoader.js`), ejecutando sin cambios los mismos
    archivos que corren en el navegador (ver sección 12.6 para el
    razonamiento completo de esta decisión). `vm` de Node NO es un
    sandbox de seguridad fuerte (a diferencia de, por ejemplo, una VM
    aislada de verdad) — es apropiado acá porque el código ejecutado es
    el propio código fuente del repo (`js/motor-observacion.js` y
    compañía, nunca contenido de terceros ni input de usuarios), pero
    vale la pena que el auditor lo confirme explícitamente como
    asunción: si algún día ese motor empezara a incorporar contenido no
    controlado por el propio equipo, este mecanismo dejaría de ser
    apropiado.
11. **Sin tope de costo/alertas de facturación configurado.** El proyecto
    pasa a plan Blaze (pago por uso) para poder desplegar las Cloud
    Functions (ver sección 12.9) — no se configuró ningún presupuesto ni
    alerta de facturación en Google Cloud como parte de esta integración;
    queda como paso de configuración manual recomendado antes de un
    lanzamiento con más usuarios (ver sección 12.9).

## 9. Cómo se verificó (y qué falta verificar)

- **En este entorno de desarrollo** (sin salida de red hacia el CDN de
  Firebase ni hacia npm): se armó un seam de pruebas explícito — tanto
  `firebase-auth.js` como `firebase-sync.js` comprueban, al cargar, si
  `window.CultivarnosAuth`/`window.CultivarnosSync` ya existen con un
  flag `__esStubDePrueba` (que Playwright puede definir antes de que
  corra cualquier script de la página vía `page.addInitScript()`) — si
  existe, el módulo real no lo pisa. Con eso se probó de punta a punta,
  sin red real: el gate de rutas, el flujo "Elegí tu usuario", el flujo
  "Encontramos una huerta", el aislamiento de bases por uid, cerrar
  sesión, y — el caso más importante de poder probar en este entorno
  porque es 100% reproducible acá — que la app arranca y sigue
  funcionando offline cuando Firebase genuinamente es inalcanzable (el
  CDN de gstatic.com no responde desde este entorno de desarrollo, lo
  cual sirvió como caso real de "sin red" en vez de tener que simularlo).
  También se corrió toda la batería de regresión ya existente de la app
  (172 pruebas, sobre funcionalidad no relacionada a esta integración)
  para confirmar cero roturas.
- **Falta, contra un proyecto Firebase real** (no se pudo hacer desde
  este entorno de desarrollo, que no tiene salida de red hacia
  Firebase): los 10 escenarios críticos completos contra Auth/Firestore
  reales — crear cuenta con email, Google, offline→online real, segundo
  dispositivo con la misma cuenta, aislamiento entre dos cuentas
  distintas en el mismo dispositivo, respaldo manual conviviendo con
  sync, comportamiento cuando las Security Rules efectivamente están
  desplegadas (no solo escritas), y latencia/comportamiento real de
  `runTransaction` para la reserva de username bajo carga. Esto se hizo
  con acceso a un navegador con red real, una vez creado el proyecto
  Firebase.

## 10. Pendiente de evaluar antes de un lanzamiento público (no bloqueante para la beta)

- **App Check**: protegería contra clientes no autorizados (scripts,
  bots) llamando a la API de Firestore directamente con el `apiKey`
  público. No se implementó en esta beta (agrega complejidad de setup —
  reCAPTCHA/attestation — que no se justificaba para un grupo chico de
  testers), pero es el ítem de mayor prioridad de seguridad antes de
  abrir la app al público en general.
- Revisar cuotas/límites de Firestore y Authentication del plan elegido
  en la consola de Firebase a medida que crezca la cantidad de usuarios.
- Evaluar si conviene un entorno de Firebase separado para desarrollo
  vs. producción (dos proyectos Firebase distintos) antes de un
  lanzamiento real — esta beta usa un único proyecto.
- Revisar el límite de tasa de `verificarUsernameDisponible` (ítem 8 de
  la sección 8) si el volumen de usuarios crece.

## 11. Archivos para auditar

**Cliente (todo el código nuevo de esta integración vive acá):**

- `js/firebase/firebase-config.js` — carga del SDK, configuración
  pública, degradación resiliente sin red.
- `js/firebase/firebase-auth.js` — Authentication, username, reserva
  atómica, traducción de errores.
- `js/firebase/firebase-sync.js` — el Sync Engine completo: pull/push,
  tombstones, resolución de conflictos, vinculación de huerta local.
- `js/views/auth.js` — pantallas de cuenta (bienvenida, crear cuenta,
  iniciar sesión, recuperar contraseña, elegir usuario, vincular
  huerta).
- `js/app.js` — específicamente `decidirDestino()`,
  `asegurarSyncIniciado()`, `continuarModoOfflineConUid()`, y el gate
  agregado a `router()`.
- `js/db.js` — específicamente las funciones agregadas en la sección
  `---------- SINCRONIZACIÓN ----------` (`usarBaseDeDatos`,
  `obtenerDeviceId`, `marcarMetaSincronizacion`,
  `upsertRegistroSincronizado`, `getPendientesEliminar`,
  `borrarPendienteEliminar`) y los hooks de tombstone agregados en
  `deleteEventoCompleto`/`deleteCultivoCompleto`/`deleteLoteCompleto`.
- `js/views/configuracion.js` — sección "Cuenta" (`seccionCuentaHtml`,
  `vincularSeccionCuenta`) y, agregada en la integración de push, la
  sección "Notificaciones" (`seccionNotificacionesHtml`,
  `vincularSeccionNotificaciones`).
- `index.html` — wiring de los 3 script tags de módulos, clase
  `sin-sesion` en `<body>`, indicador de sync en la topbar, y el script
  tag de `firebase-messaging.js`.

**Cliente — notificaciones push (agregado en la integración de push):**

- `js/firebase/firebase-messaging.js` — todo el cliente de FCM: permisos,
  registro/baja de dispositivo, preferencias, invitación contextual,
  recepción en primer plano.
- `sw.js` — integración de Firebase Messaging DENTRO del Service Worker
  existente (nunca uno nuevo): recepción en segundo plano y click en la
  notificación. Ver diff completo — el resto del archivo (cache/offline/
  update) no cambió de comportamiento, solo de versión (`APP_VERSION`).
- `js/utils.js` — `obtenerTimezoneDispositivo`, `calcularNotifyAtUtc`,
  `posponerCambios`.
- `js/db.js` — fix de `deleteRecordatorio` (ahora encola tombstone, igual
  que el resto de los `deleteXCompleto`).
- `js/firebase/firebase-sync.js` — se sacó el caso especial que saltaba
  el tombstone de `recordatorios` (ya no hace falta, ver fix anterior).
- `js/firebase/firebase-auth.js` — `cerrarSesion()` ahora desvincula el
  dispositivo de la cuenta que cierra sesión (ver sección 12.10).
- `js/views/detalle.js`, `js/views/inicio.js`, `js/views/nuevo.js` — Hora
  + "Notificarme" en los tres puntos donde se crea/edita un recordatorio,
  botón "Editar", posponer recalcula `notifyAtUtc`.

**Backend/reglas:**

- `firestore.rules` — Security Rules completas, deny-by-default,
  comentadas con la intención de cada regla (incluye el bloque nuevo de
  `pushDevices`, agregado en la integración de push).
- `firestore.indexes.json` — índices compuestos versionados (agregado en
  la integración de push).
- `functions/index.js` — las dos únicas Cloud Functions del proyecto
  (agregado en la integración de push).
- `functions/lib/recordatorios.js` — scheduler de recordatorios: query,
  claim idempotente, ventana de gracia, envío, reintentos (agregado en la
  integración de push).
- `functions/lib/sugerencias.js` — scheduler de sugerencias: ventana
  horaria, tope de una por día, anti-repetición, selección de candidata
  (agregado en la integración de push).
- `functions/lib/motorLoader.js` — carga el motor de sugerencias real
  (sin duplicar lógica) vía Node `vm` (agregado en la integración de
  push — ver sección 12.6, y el riesgo 10 de la sección 8).
- `functions/lib/fechas-compat.js` — el único subconjunto de `utils.js`
  duplicado a mano, documentado como tal (agregado en la integración de
  push).
- `functions/lib/fcm.js` — envío FCM y limpieza de dispositivos con token
  inválido (agregado en la integración de push).
- `firebase.json` — hook de `predeploy` que copia el motor real hacia
  `functions/motor/` en cada deploy (agregado en la integración de
  push).

**Este documento y el plan original:**

- `docs/firebase-architecture.md` (este archivo).

## 12. Push Notifications

Integración de Firebase Cloud Messaging (FCM) para Web/PWA sobre la
infraestructura descripta arriba. Dos tipos de notificación, cada uno con
su propia lógica de disparo y su propia razón de ser: **recordatorios**
(la persona pidió explícitamente que le avisen a una hora exacta) y
**sugerencias contextuales** (el motor agronómico real, ya existente,
detecta algo genuinamente pertinente). Principio rector, citado tal cual
se lo pidió quien encargó esta integración: *"Cultivarnos puede recordar
y sugerir, pero no perseguir"* — nunca marketing, nunca "volvé a
Cultivarnos", nunca urgencia inventada a partir de la ausencia de datos.

### 12.1 Modelo de datos: dispositivos, no cuentas

```
users/{uid}/pushDevices/{deviceId}
  { installationId, token, enabled,
    remindersEnabled, suggestionsEnabled,
    platform, timezone,
    createdAt, updatedAt, lastSeenAt }

users/{uid}/pushState/sugerencias      // 1 revisión/día + anti-repetición (solo lo escribe el servidor)
  { ultimaRevisionFecha, historial[], updatedAt }
```

Un documento por **instalación**, nunca uno por cuenta: la misma persona
puede tener el teléfono, la compu y una tablet con notificaciones activas
a la vez, cada una con sus propias dos preferencias independientes
(Recordatorios / Sugerencias). `deviceId` es el mismo id de instalación
que ya usaba el Sync Engine (`obtenerDeviceId()` en `db.js`) — no se
inventó un segundo identificador.

`pushState/sugerencias` no tiene bloque propio en `firestore.rules` a
propósito: cae bajo la regla catch-all `match /{coleccion}/{docId}`
existente dentro de `users/{uid}` (que solo permite
`cultivos`/`eventos`/`recordatorios`/`lotesPropagacion`), así que queda
denegado por default para el cliente — solo lo toca el servidor (Admin
SDK, que bypassa Security Rules). Es intencional: esa memoria de
anti-repetición es un detalle de implementación del servidor, no algo
que el cliente necesite leer ni escribir nunca.

### 12.2 Permisos: activación siempre explícita, nunca automática

La app **nunca** pide permiso de notificaciones al arrancar. Los únicos
dos disparadores son: (a) un botón "Activar notificaciones" en
Configuración → Notificaciones, y (b) una invitación contextual, una
sola vez, al crear el PRIMER recordatorio con "Notificarme" tildado
("¿Querés que Cultivarnos te avise aunque la aplicación esté cerrada?"
[Activar] / [Ahora no]) — si se elige "Ahora no", no se vuelve a insistir
(se guarda en `localStorage`, es una preferencia puramente local del
dispositivo, no de la cuenta).

Los cuatro estados de permiso del navegador (`default`/`granted`/
`denied`/`unsupported`) tienen su propia UI en Configuración
(`seccionNotificacionesHtml`/`vincularSeccionNotificaciones` en
`js/views/configuracion.js`):
- **`unsupported`** (navegador o contexto sin soporte, ej. Safari en iOS
  no instalado a pantalla de inicio): la sección de notificaciones no se
  muestra — el resto de la app funciona exactamente igual.
- **`default`**: botón "Activar notificaciones".
- **`denied`**: mensaje explicando que están bloqueadas a nivel
  navegador/sistema, sin un botón que no podría hacer nada (pedir permiso
  de nuevo desde código cuando ya está `denied` no reabre el diálogo en
  ningún navegador).
- **`granted`**: las dos preferencias (Recordatorios / Sugerencias de
  cultivo) como checkboxes independientes, más "Desactivar notificaciones
  en este dispositivo".

### 12.3 Compatibilidad iOS/PWA

Push Web en iOS **solo funciona con la app instalada a pantalla de
inicio** (no en una pestaña normal de Safari) — `soportado()` en
`firebase-messaging.js` lo detecta (`Notification`/`serviceWorker`/
`PushManager` disponibles, más el caso particular de Safari) y degrada a
`unsupported` sin romper nada más. No se asumió que el comportamiento de
una pestaña de Safari es igual al de la PWA instalada.

### 12.4 Recordatorios: hora exacta, timezone, y por qué nunca se manda tarde ni doble

Un recordatorio hoy tiene `fecha` (ya existía) y, agregado en esta
integración, `hora` (`HH:MM`, opcional — sin hora, el recordatorio sigue
existiendo y viéndose en la app, pero nunca genera un push: no se
inventa ninguna hora oculta). Con fecha+hora+"Notificarme" tildado, el
cliente calcula y guarda:

- `timezone`: la zona IANA del dispositivo (`Intl.DateTimeFormat().resolvedOptions().timeZone`).
- `notifyAtUtc`: fecha+hora convertida a UTC, calculada con
  `calcularNotifyAtUtc()` (`js/utils.js`) — un truco sin dependencias
  nuevas: formatear el mismo instante "ingenuo" con `toLocaleString` una
  vez en la zona del dispositivo y otra vez en UTC, y restar la
  diferencia, de forma que el sesgo de parseo (ambiguo en ambos casos) se
  cancela. Se guarda en formato ISO string.
- `notificationStatus: 'pending'`.

Importante: esto nunca se confunde con `createdAt`/`updatedAt` (que
siguen siendo, como siempre en esta app, timestamps reales del
dispositivo usados solo para conflictos de sync) — `notifyAtUtc` es la
hora agronómica elegida por la persona, exactamente el mismo principio
de separación que ya regía `fecha` vs. `createdAt`/`updatedAt` (sección 4
de este documento) antes de esta integración.

**Scheduler único, cada 1 minuto** (`functions/index.js` →
`procesarRecordatoriosPendientes` en `functions/lib/recordatorios.js`):
una `collectionGroup('recordatorios')` con `deleted==false`,
`estado=='pendiente'`, `notify==true`, `notificationStatus=='pending'`,
`notifyAtUtc<=ahora`, `orderBy(notifyAtUtc)`, tope 200 por corrida —
nunca un scheduler por recordatorio.

**Idempotencia** — nunca "leer → mandar → marcar" (una corrida se podría
solapar con la siguiente, o reintentar): cada recordatorio elegible pasa
primero por una `runTransaction` que relee el documento y solo avanza si
**todavía** corresponde (`notificationStatus` sigue siendo `'pending'`,
no está borrado/completado/con `notify` apagado, no está fuera de la
ventana de gracia) y en la misma transacción lo marca `'processing'`
— recién ahí, fuera de la transacción, se manda el push y se marca
`'sent'`. Una segunda corrida que agarre el mismo documento encuentra
`'processing'` (o ya `'sent'`) y no hace nada.

**Editar/completar/borrar antes de que llegue la hora, garantizado sin
lógica extra**: el Sync Engine ya escribe cada cambio con un `setDoc()`
de reemplazo completo (no un merge parcial) en cada push del cliente
(`js/firebase/firebase-sync.js`). Aprovechando eso, el cliente siempre
(re)escribe `notificationStatus: 'pending'` en IndexedDB cada vez que se
crea/edita/pospone un recordatorio con `notify:true` — así, si el
servidor ya lo había marcado `'processing'`/`'sent'` para la hora vieja,
el próximo push del cliente (con la hora nueva, o con `notify:false`, o
como tombstone si se borró) lo pisa por completo sin que el servidor
tenga que hacer nada especial. La transacción del servidor, además,
siempre relee el estado ACTUAL antes de actuar — nunca actúa sobre una
copia vieja en memoria.

**Ventana de gracia**: un recordatorio vencido hace más de 24 horas ya no
genera push (se marca `'skipped_stale'`) — evita que alguien que no abrió
la app en varios días reciba, al reconectarse, una ráfaga de
notificaciones atrasadas. El recordatorio en sí sigue existiendo y
viéndose normal en la app; esto solo decide si vale la pena interrumpir
con un push. Regla simple a propósito, no una cola de prioridades.

**Reintentos**: solo ante una falla transitoria de envío (no token
inválido, que se limpia aparte, ver 12.8) — hasta 5 intentos
(`TOPE_INTENTOS`), después se marca `'failed'` y no se vuelve a
reintentar indefinidamente.

**Recordatorios creados/editados offline**: no hay ninguna cola paralela
— el servidor solo ve lo que ya sincronizó normalmente vía el Sync Engine
existente. Nada que pueda quedar desactualizado por separado.

**Multi-dispositivo**: se manda a todos los dispositivos de la cuenta con
`enabled==true && remindersEnabled==true` — cada dispositivo decide su
propia preferencia de forma independiente de la de Sugerencias.

### 12.5 Recordatorios y sugerencias, exentos de reglas distintas

Los recordatorios se mandan a la hora exacta pedida, **sin** ninguna
ventana horaria — es la única excepción explícita a la ventana 09-19 de
la sección siguiente. Si un recordatorio y una sugerencia coincidieran
para la misma persona, el recordatorio nunca se retrasa ni se reemplaza
por la sugerencia (son corridas y datos completamente independientes:
no hay ningún punto donde compitan por el mismo slot de envío).

### 12.6 Sugerencias contextuales: el motor real, sin duplicar lógica agronómica

Decisión de arquitectura explícitamente pedida a documentar (había dos
caminos posibles: sincronizar una "candidata" precalculada a Firestore
para que el servidor solo la valide, o compartir el motor real entre
cliente y servidor). **Se eligió la segunda** — menos duplicación, cero
riesgo de que la versión "candidata" quede desactualizada respecto de lo
que el motor real decidiría en ese momento:

- `firebase.json` define un hook `predeploy` que, en cada
  `firebase deploy`, copia los archivos fuente reales
  (`js/motor-observacion.js`, `js/motor-biblioteca.js`,
  `js/data/cultivos-data.js`, `js/data/biblioteca-especies.js`,
  `js/data/preguntas-cultivos.js`) hacia `functions/motor/` — nunca se
  editan a mano ni se commitean ahí, siempre se regeneran desde la fuente
  real.
- `functions/lib/motorLoader.js` los ejecuta, TAL CUAL, con el módulo
  `vm` de Node, simulando el global scope de un `<script>` clásico de
  navegador (`sandbox.window = sandbox`, así los `function`/`var` de
  nivel superior de esos archivos se adjuntan solos, igual que en un
  navegador real) — cero reescritura de lógica agronómica en el backend.
- El único subconjunto SÍ duplicado a mano es `functions/lib/
  fechas-compat.js` (~30 líneas puras de `utils.js`: conversión fecha
  calendario ↔ `Date` en hora local, y `compararEventosPorFecha`) —
  necesario porque `utils.js` mezcla esas funciones con DOM (modales,
  drag&drop) que no tiene sentido llevar a una Cloud Function. Es la
  única duplicación real de todo este mecanismo, documentada como tal en
  el propio archivo, con una nota para mantenerla sincronizada a mano si
  `utils.js` cambia esas funciones.

`functions/lib/sugerencias.js` orquesta (nunca decide agronomía): agrupa
`pushDevices` habilitados para sugerencias por cuenta, y para cada cuenta
filtra a los dispositivos que ahora mismo están en su ventana horaria
LOCAL (09:00–19:00, calculada con `Intl.DateTimeFormat` sobre el
`timezone` de cada dispositivo — nunca la hora del servidor).

**La evaluación en sí (leer cultivos/eventos y correr el motor) pasa como
máximo UNA VEZ POR DÍA por cuenta** — no en cada corrida del scheduler
mientras dure la ventana horaria. Recién a partir de las 13:00 hora local
(`HORA_CHEQUEO_LOCAL`, un punto medio arbitrario dentro de la ventana,
elegido para dar tiempo a que la persona ya haya registrado algo esa
mañana) se hace la primera y única revisión del día: se chequea
`pushState/sugerencias.ultimaRevisionFecha` (si ya dice hoy, no se vuelve
a evaluar, haya encontrado algo la vez anterior o no) y recién ahí se
corre el motor real sobre los cultivos/eventos actuales de la cuenta,
descartando cualquier candidata ya mostrada/oculta/resuelta reciente
(`historial`, últimas 8, por `cultivoId+idPregunta`), y si hay más de una
candidata igualmente relevante elige entre ellas con el mismo orden de
prioridad que ya usa Inicio en el cliente (`ORDEN_ORIGEN`). **Si no hay
nada realmente pertinente, no se manda nada** — nunca se fabrica
contenido solo para tener algo que mandar — pero igual se registra la
revisión de hoy, para no pagar de nuevo el costo de releer cultivos y
eventos si el scheduler vuelve a correr más tarde en la misma ventana.

Esta simplificación (evaluar 1 vez por día en vez de hasta ~20 veces
mientras dura la ventana) es deliberada y fue la razón para bajar la
frecuencia del scheduler de sugerencias de cada 30 minutos a cada 1 hora
(ver `functions/index.js`) — correr más seguido no adelantaría ninguna
sugerencia (igual se espera a las 13:00 y a la revisión única del día),
solo pagaría más lecturas de la consulta base de `pushDevices` sin
ningún beneficio real. Es también, por sí sola, la optimización de costo
más relevante de las dos Cloud Functions — ver el desglose en 12.9.

El tono lo define enteramente el motor real reutilizado (nunca se generó
texto nuevo en el backend): observar → comprender → decidir, sugerente
("Podrías revisar si...") nunca imperativo.

### 12.7 Contenido de la notificación

Siempre corto: título "Cultivarnos" + una línea de cuerpo (el título del
recordatorio, o la pregunta/observación de la sugerencia) — nunca notas
largas ni datos sensibles. Ícono: el ícono PWA ya aprobado
(`icons/icon-192.png`), nunca un emoji como ícono del sistema
(`functions/lib/fcm.js`).

### 12.8 Service Worker: mismo scope, nunca uno nuevo

Firebase Messaging se integró DENTRO del Service Worker existente
(`sw.js`) — nunca un `firebase-messaging-sw.js` aparte, porque dos
Service Workers no pueden coexistir en el mismo scope. Se usó
específicamente el SDK **compat** (`importScripts()` de
`firebase-app-compat.js` + `firebase-messaging-compat.js`) solo dentro de
`sw.js`, porque `import()`/ESM no es utilizable vía `importScripts()` en
un Service Worker clásico — es la forma vigente/recomendada de hacer esto
específicamente en este contexto (el cliente sí usa el SDK modular
normal, vía `import()` dinámico). Toda la integración está en bloques
`try/catch` aditivos: si Firebase Messaging fallara al cargar dentro del
Service Worker, el cache/offline/install/update que ya existía sigue
funcionando exactamente igual.

- **Background** (app cerrada): `onBackgroundMessage()` →
  `self.registration.showNotification()`.
- **Foreground** (app abierta): `onMessage()` en el cliente muestra un
  `showToast()` interno — nunca a la vez un toast Y una notificación de
  sistema (se evitó la redundancia a propósito).
- **Click**: cierra la notificación, resuelve una ruta de destino según
  `data.tipo`/`data.cultivoId` (una sugerencia o un recordatorio ligado a
  un cultivo abre la ficha de ese cultivo; un recordatorio sin cultivo
  abre Inicio/Recordatorios, igual que la navegación normal de la app), y
  prioriza enfocar una ventana ya abierta (`clients.matchAll` +
  `client.navigate()`) antes que abrir una instancia nueva
  (`clients.openWindow` solo como fallback).

### 12.9 Seguridad y aislamiento

- **El envío de FCM ocurre exclusivamente en el servidor** — Cloud
  Functions con Admin SDK (`functions/lib/fcm.js`). El cliente nunca
  tiene ni necesita ninguna credencial de administrador; el `apiKey`
  público del frontend no puede mandar notificaciones a nadie.
- **Aislamiento por cuenta**, reforzado con el bloque nuevo de
  `firestore.rules` para `pushDevices/{deviceId}` (dentro de
  `users/{uid}`): solo el dueño de la cuenta puede leer/crear/actualizar
  sus propios dispositivos; `delete` siempre `false` desde el cliente (la
  baja real de un dispositivo solo la hace el servidor, ver abajo).
- **Cambio de cuenta en el mismo dispositivo** (Usuario A cierra sesión,
  Usuario B inicia sesión): `cerrarSesion()` (`firebase-auth.js`) llama,
  antes de limpiar la sesión local, a
  `CultivarnosPush.desvincularDeCuenta(uidAnterior)` — que marca
  `enabled:false` en el documento de ESTE dispositivo dentro de
  `users/{uidAnterior}/pushDevices/`, nunca toca dispositivos de otras
  instalaciones. Usuario B, al loguearse, no hereda ningún estado de
  push de A (cada cuenta tiene su propia subcolección `pushDevices`); si
  activa notificaciones, se crea/reactiva el documento de este mismo
  `deviceId` bajo `users/{uidNuevo}/`.
- **La misma cuenta vuelve a entrar en el mismo dispositivo** (A cierra
  sesión y A mismo vuelve a loguearse, con o sin B de por medio): la
  elección de A de recibir notificaciones queda firme hasta que A mismo la
  cambie, no hace falta reactivarla a mano en cada login.
  `asegurarSyncIniciado()` (`app.js`) llama, una vez por login, a
  `CultivarnosPush.reanudarSiCorrespondia(uid)`: si
  `Notification.permission` de este navegador ya es `'granted'` Y ya
  existe `users/{uid}/pushDevices/{deviceId}` para esta cuenta y este
  dispositivo (aunque esté en `enabled:false` por el logout anterior), se
  refresca el token y se vuelve a poner `enabled:true` en silencio, sin
  ningún prompt nuevo. Si el documento no existe (esta cuenta nunca activó
  notificaciones en este dispositivo), no se hace nada — aunque el permiso
  del navegador ya esté concedido por OTRA cuenta que usó antes este mismo
  dispositivo: el permiso es del navegador, no de la app, así que por sí
  solo nunca alcanza para reactivar nada.
- **Token permanentemente inválido** (FCM confirma
  `registration-token-not-registered`/`invalid-registration-token`/
  `invalid-argument`): se borra SOLO ese documento de dispositivo
  (`limpiarDispositivoInvalido` en `functions/lib/fcm.js`) — nunca se
  reintenta indefinidamente, nunca se toca otro dispositivo de la cuenta.
- **"Desactivar notificaciones en este dispositivo"**: `setDoc(...,
  {enabled:false}, {merge:true})` sobre el documento de ESTE `deviceId` —
  nunca borra el documento, nunca afecta otros dispositivos, no toca
  ningún dato de recordatorios/cultivos/eventos.
- **Protecciones básicas contra abuso**: tope de 200 recordatorios
  procesados por corrida, tope de 5 reintentos por recordatorio, tope de
  1 sugerencia por cuenta por día, tope de 8 entradas de historial
  anti-repetición — deliberadamente simples (no un sistema de rate
  limiting sofisticado), suficientes para el volumen esperado de esta
  beta.

### 12.10 Configuración manual necesaria (Firebase Console)

1. **Generar la clave VAPID**: Firebase Console → Configuración del
   proyecto → Cloud Messaging → pestaña "Web Push certificates" → "Generate
   key pair". Pegar el valor resultante en `VAPID_KEY` dentro de
   `js/firebase/firebase-messaging.js` (hoy tiene un placeholder,
   `'PEGAR_VAPID_KEY_ACA'` — sin esto, `activar()` devuelve un error claro
   en vez de fallar en silencio).
2. **Pasar el proyecto a plan Blaze** (pago por uso) — Cloud Functions v2
   y Cloud Scheduler (que `onSchedule` crea automáticamente) lo requieren.
   Ver el desglose de qué factura y cuánto más abajo.
3. **Desplegar**: `firebase deploy --only functions,firestore:rules,firestore:indexes`
   desde una máquina con `firebase login` ya hecho (este entorno de
   desarrollo en la nube no tiene forma de completar el login interactivo
   de Google en nombre de la cuenta del usuario — ese paso lo tiene que
   hacer la persona misma, una vez, desde su computadora).

**Qué requiere Blaze y qué factura, específicamente:**

- **Cloud Functions v2** (`procesarRecordatorios`, cada 1 minuto —
  43.200 invocaciones/mes; `procesarSugerencias`, cada 1 hora — 720
  invocaciones/mes) y el **Cloud Scheduler** que las dispara (2 jobs,
  dentro de los 3 gratis por cuenta de facturación por mes). El total de
  invocaciones (~44.000/mes) está fijo — no crece con la cantidad de
  usuarios, porque son 2 funciones programadas, no una por cuenta — y
  queda lejísimos del nivel gratuito de Cloud Functions (2.000.000/mes)
  sin importar cuánto crezca Cultivarnos: esta línea de costo nunca va a
  ser significativa.
- **Firestore — la única línea que sí escala con la cantidad de
  usuarios**, y específicamente por la consulta base de
  `sugerencias.js` (`collectionGroup('pushDevices')`, que lee un
  documento por cada dispositivo con sugerencias activadas, en cada
  corrida) — el resto (recordatorios, y la evaluación puntual de
  cultivos/eventos por cuenta) pesa poco porque solo se paga cuando
  hay algo concreto para procesar, y en el caso de sugerencias como
  máximo una vez por cuenta por día (ver 12.6). Con esa evaluación ya
  acotada a 1 vez/día, el costo por cada 1.000 dispositivos con
  sugerencias activadas es de aproximadamente 24.000 lecturas/día extra
  (24 corridas/día × 1.000) solo por esa consulta base — bien dentro del
  nivel gratuito de Firestore (50.000 lecturas/día) hasta unos ~2.000
  dispositivos activos, y aun superándolo el costo es ínfimo ($0.03 cada
  100.000 lecturas de más). Es, aun así, el ítem a vigilar si la base de
  usuarios crece mucho (ver también el ítem de "cuotas/límites" de la
  sección 10).
- **Firebase Cloud Messaging en sí es gratis** — no tiene costo por
  mensaje enviado.
- No se configuró ningún presupuesto/alerta de facturación en Google
  Cloud como parte de esta integración (ver riesgo 11 de la sección 8) —
  recomendado como paso manual antes de escalar.

### 12.11 Checklist mínima de validación

Lo que se pudo verificar desde este entorno de desarrollo (sin salida de
red hacia Firebase, mismo motivo que la sección 9): la app arranca y
sigue funcionando offline con `firebase-messaging.js` cargado y sin
permiso otorgado; la sección de Configuración se comporta bien en los
cuatro estados de permiso simulados vía el mismo seam de pruebas
(`__esStubDePrueba`) que ya usaban `firebase-auth.js`/`firebase-sync.js`;
los tres puntos de creación/edición de recordatorio calculan
`notifyAtUtc` correctamente para varias combinaciones de zona horaria; el
Service Worker sigue instalando/cacheando/actualizando igual que antes
(`APP_VERSION` bumpeada, resto del comportamiento sin cambios).

Lo que **falta**, y requiere el proyecto Firebase real en Blaze más un
dispositivo físico (no se puede simular desde acá):

1. Generar la clave VAPID real y confirmar que `activar()` obtiene un
   token válido.
2. Recibir un push real con la app en primer plano (toast, sin
   notificación de sistema duplicada).
3. Recibir un push real con la app **cerrada** (Service Worker en
   segundo plano) — en Android/Chrome y, en particular, en **iPhone con
   la PWA instalada a pantalla de inicio** (el caso que más importa
   validar de verdad, según lo pedido).
4. Click en la notificación: confirmar que abre/enfoca la ficha del
   cultivo correcto (o Inicio, si el recordatorio no tiene cultivo).
5. Editar la hora de un recordatorio ya "tomado" por el scheduler y
   confirmar que NUNCA llega el push con la hora vieja.
6. Completar o borrar un recordatorio antes de su hora y confirmar que no
   llega ningún push.
7. Dos dispositivos de la misma cuenta con preferencias distintas
   (uno con Recordatorios apagado, otro con Sugerencias apagado) y
   confirmar que cada uno respeta solo la suya.
8. Cerrar sesión (Usuario A) e iniciar sesión con Usuario B en el mismo
   dispositivo/navegador, y confirmar que B nunca recibe un push
   destinado a A.
9. "Desactivar notificaciones en este dispositivo" y confirmar que ese
   dispositivo deja de recibir pushes sin afectar otros dispositivos de
   la cuenta ni ningún dato de recordatorios.
10. Confirmar que una sugerencia contextual real solo llega cuando el
    motor la considera genuinamente pertinente (no forzar una sugerencia
    artificial) y respeta la ventana 09-19 y el tope de 1/día.
11. Confirmar offline/PWA (instalación, cache, funcionamiento sin red) sin
    ninguna regresión respecto del comportamiento previo a esta
    integración.
12. Verificar en Firebase Console, tras un rato de uso real, que un token
    deliberadamente inválido (ej. desinstalando la PWA de un dispositivo
    de prueba) efectivamente limpia solo ese dispositivo sin loops de
    reintento.
