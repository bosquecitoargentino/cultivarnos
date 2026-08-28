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

## A validar

Un popup dentro de una PWA instalada en pantalla de inicio en iOS a veces
abre Safari en una ventana/pestaña aparte en lugar de una ventana
flotante — sigue funcionando (Firebase detecta el login al volver), pero
vale la pena confirmarlo en el dispositivo real: tocar "Continuar con
Google" desde la PWA instalada (no solo desde Safari suelto) y verificar
que vuelve a la app logueado.
