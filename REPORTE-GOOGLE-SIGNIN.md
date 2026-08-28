# Google Sign-In — "The requested action is invalid"

## Síntoma

Con email/contraseña la cuenta se creaba bien. Con "Continuar con Google"
desde el iPhone (PWA sobre Safari), tras elegir la cuenta de Google la
persona volvía a `cultivarnos-8331b.firebaseapp.com` con el error **"The
requested action is invalid"**, sin poder completar el login.

## Causa

`iniciarSesionConGoogle()` usaba `signInWithRedirect()` en móvil/PWA
instalada (era la recomendación histórica de Firebase — más robusto que
un popup en Safari). Ese flujo depende de un iframe cross-origin hacia el
`authDomain` (`cultivarnos-8331b.firebaseapp.com`) para completar el
login. Los navegadores actuales — Safari en iOS en particular — bloquean
por defecto el acceso a almacenamiento de terceros que ese iframe
necesita, y el redirect termina en ese error.

Confirmado contra la documentación oficial de Firebase ("Best practices
for using signInWithRedirect on browsers that block third-party storage
access"): es un problema conocido, no específico de esta app.

De las alternativas que documenta Firebase, la que aplica acá es usar
`signInWithPopup()` siempre. La otra opción (que `authDomain` sea el
mismo dominio que sirve la app, para evitar el cross-origin) no es
viable: Cultivarnos se sirve desde GitHub Pages
(`bosquecitoargentino.github.io`), no desde Firebase Hosting, así que no
se puede hacer que `cultivarnos-8331b.firebaseapp.com` sirva la app.

## Fix

`js/firebase/firebase-auth.js` — `iniciarSesionConGoogle()` ahora usa
siempre `signInWithPopup()`, sin la rama de `signInWithRedirect()` para
móvil. Se sacó también la llamada a `getRedirectResult()` en `iniciar()`,
que ya no tiene ningún redirect pendiente que resolver.

Nada más cambió: la reserva de username, el gate de sesión, y el resto
del flujo de auth son los mismos para Google que para email/contraseña —
solo cambió CÓMO se abre la ventana de consentimiento de Google.

## Segunda causa (la que realmente bloqueaba todo) — restricción de la apiKey

Después de este cambio de código, el error **siguió apareciendo idéntico**
en producción, incluso probando desde Safari directo (no solo desde la
PWA instalada) y con "Dominios autorizados" (Firebase) y "Orígenes de
JavaScript autorizados" (Google Cloud, el cliente OAuth) ya
correctamente configurados con `bosquecitoargentino.github.io`.

La causa real: la apiKey del proyecto (`js/firebase/firebase-config.js`)
tenía una restricción de **"Referencias HTTP (sitios web)"** en Google
Cloud (`console.cloud.google.com/apis/credentials` → "Browser key (auto
created by Firebase)"), agregada como medida preventiva cuando GitHub
avisó que la apiKey estaba "expuesta" en el repo (ver más abajo, "Sobre
el warning de GitHub") — esa restricción solo tenía permitido
`bosquecitoargentino.github.io/*`.

El problema: `signInWithPopup()` abre una ventana hacia
`cultivarnos-8331b.firebaseapp.com` para completar el intercambio con
Google, y esa página — no `bosquecitoargentino.github.io` — es la que
hace la llamada final a la API de Firebase usando la apiKey. Con la
restricción puesta, esa llamada específica quedaba rechazada por Google
Cloud (referer no permitido) y el resultado era exactamente este error.
El login con mail/contraseña nunca pasa por esa página intermedia, por
eso nunca se vio afectado y por eso parecía que "solo Google" tenía un
problema de código, cuando en realidad ya no lo tenía.

**Fix**: agregar `cultivarnos-8331b.firebaseapp.com/*` a la lista de
referencias HTTP permitidas de esa clave (junto a
`bosquecitoargentino.github.io/*`). Confirmado en producción — con las
dos referencias permitidas, Google Sign-In funciona.

**Lección para el futuro**: si alguna vez se vuelve a restringir esta
apiKey (o se rota/regenera), acordarse de incluir SIEMPRE el dominio del
`authDomain` (`<proyecto>.firebaseapp.com`) en la lista de referencias
permitidas, además del dominio real de la app — si no, Google Sign-In se
rompe con este mismo error aunque el resto de la configuración esté
perfecta.

## A validar

Confirmado ya en producción, con las dos causas de arriba resueltas:
"Continuar con Google" funciona probando desde Safari directo. Falta
confirmar una sola cosa menor: que también funcione tocando "Continuar
con Google" desde la PWA instalada en la pantalla de inicio (no solo
desde Safari suelto) — un popup dentro de una PWA instalada en iOS a
veces abre Safari en una ventana/pestaña aparte en lugar de una ventana
flotante, y en teoría sigue funcionando igual (Firebase detecta el login
al volver), pero vale la pena confirmarlo una vez en el dispositivo real.
