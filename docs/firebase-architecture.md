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

## 2. No implementado todavía (fuera de alcance de esta beta, a propósito)

Lista explícita de lo que **no** se construyó — todo esto quedó pedido
así, no es una omisión:

- Login por teléfono/SMS, Apple, Facebook u otro proveedor que no sea
  Email/Password o Google.
- Sincronización de fotos (Cloud Storage). El modelo conceptual está
  pensado (`localId`/`remoteUrl`/`storagePath`/`syncStatus`) pero no
  implementado: las fotos siguen siendo 100% locales, incluida la copia
  que se hace al vincular una huerta pre-existente (ver sección 6).
- Cloud Functions (no se usó ninguna; toda la lógica corre en el
  cliente).
- App Check — **pendiente de evaluar antes de un lanzamiento público**
  (ver sección 10, es el ítem de seguridad más importante que falta).
- Eliminar cuenta (borrado de la cuenta de Auth + sus datos).
- Notificaciones push.
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
  `vincularSeccionCuenta`).
- `index.html` — wiring de los 3 script tags de módulos, clase
  `sin-sesion` en `<body>`, indicador de sync en la topbar.

**Backend/reglas:**

- `firestore.rules` — Security Rules completas, deny-by-default,
  comentadas con la intención de cada regla.

**Este documento y el plan original:**

- `docs/firebase-architecture.md` (este archivo).
