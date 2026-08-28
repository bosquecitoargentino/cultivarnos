// firebase-auth.js — identidad + cuenta (Firebase Authentication + el
// perfil mínimo en Firestore: username, authProvider, timestamps).
//
// ES module (igual que firebase-config.js). Expone su API pública en
// `window.CultivarnosAuth` para que el resto de la app (scripts clásicos,
// `js/app.js`, `js/views/auth.js`, `js/views/configuracion.js`) lo
// consuma sin necesidad de volverse módulos ellos también.
//
// Seam de pruebas: si `window.CultivarnosAuth` ya existe con la marca
// `__esStubDePrueba` ANTES de que este script corra (Playwright puede
// definirlo con `page.addInitScript`, que se ejecuta antes que cualquier
// script de la página), este módulo NO pisa ese stub ni toca Firebase de
// verdad — así se puede probar todo el flujo de rutas/UI sin red real.
//
// Principio general de todo este archivo: NUNCA dejar a la persona
// bloqueada. Si Firebase no está disponible (sin configurar, sin red,
// CDN caído), cada función devuelve `{ ok:false, mensaje }` con un
// mensaje humano — nunca lanza una excepción sin atrapar, nunca deja la
// app "cargando" para siempre.

import { obtenerFirebaseApp } from './firebase-config.js';

const CLAVE_UID_ACTIVO = 'cultivarnos-uid-activo';
const CLAVE_PERFIL_CACHE_PREFIX = 'cultivarnos-perfil-';
const TIMEOUT_READY_MS = 4000;
const TIMEOUT_LECTURA_PERFIL_MS = 4000;

// ---------------------------------------------------------------------
// Username: reglas simples, normalización, y verificación de
// disponibilidad. Funciones puras + una consulta de lectura opcional —
// reusadas tanto acá como por js/views/auth.js para feedback en vivo
// mientras la persona escribe.
// ---------------------------------------------------------------------

function normalizarUsername(input) {
  return (input || '').trim().toLowerCase();
}

function validarUsername(input) {
  const normalizado = normalizarUsername(input);
  if (normalizado.length < 3 || normalizado.length > 24) {
    return { valido: false, mensaje: 'El nombre de usuario tiene que tener entre 3 y 24 caracteres.', normalizado };
  }
  if (!/^[a-z0-9_]+$/.test(normalizado)) {
    return { valido: false, mensaje: 'Solo minúsculas, números y guion bajo, sin espacios.', normalizado };
  }
  return { valido: true, mensaje: null, normalizado };
}

async function verificarUsernameDisponible(inputCrudo) {
  const val = validarUsername(inputCrudo);
  if (!val.valido) return { disponible: false, mensaje: val.mensaje };
  const ctx = await obtenerFirebaseApp();
  if (!ctx) return { disponible: null, mensaje: null };
  try {
    const { doc, getDoc } = ctx.firestoreMod;
    const snap = await getDoc(doc(ctx.db, 'usernames', val.normalizado));
    return snap.exists()
      ? { disponible: false, mensaje: 'Ese nombre de usuario ya está en uso.' }
      : { disponible: true, mensaje: null };
  } catch (err) {
    // Sin red, timeout, lo que sea — no es un error para mostrar, solo
    // "no pudimos chequear todavía". La reserva atómica al crear la
    // cuenta es la que de verdad garantiza que no se duplique.
    console.warn('[Cultivarnos] no se pudo verificar disponibilidad de username:', err);
    return { disponible: null, mensaje: null };
  }
}

// ---------------------------------------------------------------------
// Traducción de errores de Firebase a mensajes humanos, en español.
// ---------------------------------------------------------------------

const ERRORES_FIREBASE = {
  'auth/email-already-in-use': 'Ya existe una cuenta con ese email.',
  'auth/invalid-email': 'Ingresá un email válido.',
  'auth/weak-password': 'La contraseña tiene que tener al menos 6 caracteres.',
  'auth/wrong-password': 'Email o contraseña incorrectos.',
  'auth/user-not-found': 'Email o contraseña incorrectos.',
  'auth/invalid-credential': 'Email o contraseña incorrectos.',
  'auth/too-many-requests': 'Demasiados intentos. Probá de nuevo en unos minutos.',
  'auth/network-request-failed': 'No pudimos conectarnos. Podés seguir trabajando y sincronizaremos después.',
  'auth/popup-closed-by-user': 'Cerraste la ventana antes de terminar. Probá de nuevo.',
  'auth/cancelled-popup-request': 'Cerraste la ventana antes de terminar. Probá de nuevo.',
  'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Probá de nuevo.',
  'auth/account-exists-with-different-credential': 'Ya existe una cuenta con ese email usando otro método de acceso.',
};

function traducirErrorFirebase(err) {
  const codigo = err && err.code;
  if (codigo && ERRORES_FIREBASE[codigo]) return ERRORES_FIREBASE[codigo];
  console.warn('[Cultivarnos] error de Firebase sin traducción específica:', codigo, err);
  return 'Algo salió mal. Probá de nuevo en un momento.';
}

// ---------------------------------------------------------------------
// Estado de sesión — un único objeto en memoria + suscripción simple.
// `ready()` resuelve una sola vez, apenas se conoce el estado inicial
// (con timeout: si Firebase no contesta en 4s, se resuelve igual, sin
// bloquear el arranque de la app — ver el comentario largo en app.js
// sobre cómo se combina esto con `obtenerUidActivoCacheado()` para poder
// seguir mostrando la huerta ya descargada aunque no haya red ahora).
// ---------------------------------------------------------------------

let estado = { cargando: true, firebaseDisponible: null, usuario: null, perfil: null, necesitaUsername: false };
let resolverListo;
const listoPromise = new Promise((resolve) => { resolverListo = resolve; });
const listeners = new Set();

function notificarCambio() {
  listeners.forEach((cb) => {
    try { cb(estado); } catch (err) { console.warn('[Cultivarnos] listener de CultivarnosAuth.onCambio falló:', err); }
  });
}

function aIsoSiHaceFalta(valor) {
  if (!valor) return null;
  if (typeof valor === 'string') return valor;
  if (typeof valor.toDate === 'function') return valor.toDate().toISOString();
  return null;
}

// Firestore Timestamp/getDoc puede quedarse colgado sin red real (no
// usamos persistencia offline de Firestore — ver docs/firebase-
// architecture.md, "Firestore offline" — así que una lectura sin red no
// falla rápido sola). Este helper le pone un techo.
function conTimeout(promesa, ms) {
  return Promise.race([
    promesa,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function leerPerfil(ctx, uid) {
  const claveCache = CLAVE_PERFIL_CACHE_PREFIX + uid;
  try {
    const { doc, getDoc } = ctx.firestoreMod;
    const snap = await conTimeout(getDoc(doc(ctx.db, 'users', uid)), TIMEOUT_LECTURA_PERFIL_MS);
    if (snap && typeof snap.exists === 'function') {
      if (snap.exists()) {
        const datos = snap.data();
        const perfil = {
          username: datos.username,
          authProvider: datos.authProvider,
          createdAt: aIsoSiHaceFalta(datos.createdAt),
          updatedAt: aIsoSiHaceFalta(datos.updatedAt),
        };
        localStorage.setItem(claveCache, JSON.stringify(perfil));
        return { perfil, necesitaUsername: false };
      }
      // Lectura exitosa y el documento genuinamente no existe: primera
      // vez de verdad (Google nuevo, o email+password cuya reserva de
      // username falló a mitad de camino la vez anterior).
      return { perfil: null, necesitaUsername: true };
    }
  } catch (err) {
    console.warn('[Cultivarnos] no se pudo leer el perfil (¿sin conexión?):', err);
  }
  // Sin red / timeout / error: usamos el último perfil que hayamos
  // cacheado localmente si existe (asumimos que la cuenta YA tenía
  // perfil — no queremos volver a pedir username solo porque no hay
  // señal en este momento). Si nunca se cacheó nada, no forzamos el
  // flujo de "elegí tu usuario" tampoco: es más seguro mostrar la app
  // igual y reintentar la lectura más tarde que interrumpir a alguien
  // que ya tenía cuenta con una pantalla que no le corresponde.
  const cacheado = localStorage.getItem(claveCache);
  if (cacheado) {
    try { return { perfil: JSON.parse(cacheado), necesitaUsername: false }; } catch { /* cache corrupto, ignorar */ }
  }
  return { perfil: null, necesitaUsername: false };
}

async function iniciar() {
  const ctx = await obtenerFirebaseApp();
  if (!ctx) {
    estado = { cargando: false, firebaseDisponible: false, usuario: null, perfil: null, necesitaUsername: false };
    resolverListo();
    notificarCambio();
    return;
  }

  // No hay ningún getRedirectResult() acá a propósito: iniciarSesionConGoogle()
  // usa siempre signInWithPopup(), nunca signInWithRedirect() (ver el
  // comentario largo ahí — el redirect se rompe en Safari/iOS con "The
  // requested action is invalid"). onAuthStateChanged de abajo es lo único
  // que hace falta para detectar la sesión, tanto la de un popup recién
  // completado como la de una visita futura ya logueada.

  ctx.authMod.onAuthStateChanged(ctx.auth, async (user) => {
    if (!user) {
      localStorage.removeItem(CLAVE_UID_ACTIVO);
      estado = { cargando: false, firebaseDisponible: true, usuario: null, perfil: null, necesitaUsername: false };
      resolverListo();
      notificarCambio();
      return;
    }
    localStorage.setItem(CLAVE_UID_ACTIVO, user.uid);
    const usuario = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      providerId: (user.providerData[0] && user.providerData[0].providerId) || 'password',
    };
    const { perfil, necesitaUsername } = await leerPerfil(ctx, user.uid);
    estado = { cargando: false, firebaseDisponible: true, usuario, perfil, necesitaUsername };
    resolverListo();
    notificarCambio();
  });
}

// Resiliencia: si por lo que sea `ready()` nunca resuelve solo (SDK
// colgado, red rarísima), a los 4s se resuelve igual. app.js combina
// esto con obtenerUidActivoCacheado() para decidir si sigue mostrando la
// huerta ya descargada en modo local en vez de mandar a la persona a la
// pantalla de login solo porque no hay señal en este instante.
setTimeout(() => {
  if (estado.cargando) {
    estado = { ...estado, cargando: false, firebaseDisponible: false };
    resolverListo();
    notificarCambio();
  }
}, TIMEOUT_READY_MS);

// ---------------------------------------------------------------------
// Username + perfil: reserva atómica (transacción) — ver "Username: la
// reserva tiene que ser atómica" en docs/firebase-architecture.md. Un
// username y su perfil se crean siempre juntos, en la misma transacción
// — nunca puede quedar uno sin el otro.
// ---------------------------------------------------------------------

async function elegirUsername(inputCrudo) {
  const val = validarUsername(inputCrudo);
  if (!val.valido) return { ok: false, mensaje: val.mensaje };

  const ctx = await obtenerFirebaseApp();
  if (!ctx) return { ok: false, mensaje: 'No pudimos conectarnos. Probá de nuevo cuando tengas conexión.' };
  const user = ctx.auth.currentUser;
  if (!user) return { ok: false, mensaje: 'Tu sesión expiró. Iniciá sesión de nuevo.' };

  const { runTransaction, doc, serverTimestamp } = ctx.firestoreMod;
  try {
    await runTransaction(ctx.db, async (t) => {
      const refUsername = doc(ctx.db, 'usernames', val.normalizado);
      const snap = await t.get(refUsername);
      if (snap.exists()) throw Object.assign(new Error('username-tomado'), { esUsernameTomado: true });
      const refPerfil = doc(ctx.db, 'users', user.uid);
      const ahora = serverTimestamp();
      t.set(refUsername, { uid: user.uid });
      t.set(refPerfil, {
        username: val.normalizado,
        authProvider: user.providerData[0] && user.providerData[0].providerId === 'google.com' ? 'google' : 'password',
        createdAt: ahora,
        updatedAt: ahora,
      });
    });
  } catch (err) {
    if (err && err.esUsernameTomado) return { ok: false, mensaje: 'Ese nombre de usuario ya está en uso.' };
    return { ok: false, mensaje: traducirErrorFirebase(err) };
  }

  const ahoraIso = new Date().toISOString();
  const perfil = {
    username: val.normalizado,
    authProvider: user.providerData[0] && user.providerData[0].providerId === 'google.com' ? 'google' : 'password',
    createdAt: ahoraIso,
    updatedAt: ahoraIso,
  };
  localStorage.setItem(CLAVE_PERFIL_CACHE_PREFIX + user.uid, JSON.stringify(perfil));
  estado = { ...estado, perfil, necesitaUsername: false };
  notificarCambio();
  return { ok: true };
}

// ---------------------------------------------------------------------
// Crear cuenta / iniciar sesión / Google / logout / reset password.
// Todas devuelven { ok, mensaje? } — nunca lanzan.
// ---------------------------------------------------------------------

function esEmailValido(email) {
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const MENSAJE_SIN_CONEXION = 'No pudimos conectarnos. Podés seguir trabajando y sincronizaremos después.';

async function crearCuentaConEmail({ username, email, password, confirmarPassword }) {
  const val = validarUsername(username);
  if (!val.valido) return { ok: false, mensaje: val.mensaje };
  if (!esEmailValido(email)) return { ok: false, mensaje: 'Ingresá un email válido.' };
  if (!password || password.length < 6) return { ok: false, mensaje: 'La contraseña tiene que tener al menos 6 caracteres.' };
  if (confirmarPassword !== undefined && password !== confirmarPassword) {
    return { ok: false, mensaje: 'Las contraseñas no coinciden.' };
  }

  const ctx = await obtenerFirebaseApp();
  if (!ctx) return { ok: false, mensaje: MENSAJE_SIN_CONEXION };

  try {
    await ctx.authMod.createUserWithEmailAndPassword(ctx.auth, email.trim(), password);
  } catch (err) {
    return { ok: false, mensaje: traducirErrorFirebase(err) };
  }

  // El usuario de Firebase Auth ya existe acá aunque lo de abajo falle —
  // es un estado válido, no corrupto: la próxima vez que entre, se le
  // vuelve a pedir el username, exactamente igual que a alguien que
  // entra con Google por primera vez (ver docs/firebase-architecture.md).
  return elegirUsername(val.normalizado);
}

async function iniciarSesionConEmail({ email, password }) {
  const ctx = await obtenerFirebaseApp();
  if (!ctx) return { ok: false, mensaje: MENSAJE_SIN_CONEXION };
  try {
    await ctx.authMod.signInWithEmailAndPassword(ctx.auth, (email || '').trim(), password || '');
    return { ok: true };
  } catch (err) {
    return { ok: false, mensaje: traducirErrorFirebase(err) };
  }
}

// Antes elegía signInWithRedirect() en móvil/PWA instalada y
// signInWithPopup() en escritorio, siguiendo lo que era la recomendación
// histórica de Firebase. Se cambió a usar SIEMPRE signInWithPopup():
// signInWithRedirect() depende de un iframe cross-origin hacia el
// authDomain (acá, cultivarnos-8331b.firebaseapp.com) para completar el
// login, y los navegadores actuales — Safari en iOS en particular, que es
// donde esta app se usa como PWA — bloquean por defecto ese acceso a
// almacenamiento de terceros, lo que rompe el redirect con el error
// "The requested action is invalid" (confirmado en producción, ver
// REPORTE-GOOGLE-SIGNIN.md). La propia documentación de Firebase señala
// signInWithPopup() como la alternativa más simple para este caso — la
// otra opción (que authDomain sea el mismo dominio que sirve la app) no
// aplica acá porque Cultivarnos se sirve desde GitHub Pages, no desde
// Firebase Hosting.
async function iniciarSesionConGoogle() {
  const ctx = await obtenerFirebaseApp();
  if (!ctx) return { ok: false, mensaje: 'No pudimos conectarnos. Probá de nuevo cuando tengas conexión.' };
  try {
    const provider = new ctx.authMod.GoogleAuthProvider();
    await ctx.authMod.signInWithPopup(ctx.auth, provider);
    return { ok: true };
  } catch (err) {
    return { ok: false, mensaje: traducirErrorFirebase(err) };
  }
}

async function enviarRecuperarPassword(email) {
  const mensajeGenerico = 'Si existe una cuenta con ese email, te enviamos un correo para restablecer tu contraseña.';
  if (!esEmailValido(email)) return { ok: false, mensaje: 'Ingresá un email válido.' };
  const ctx = await obtenerFirebaseApp();
  if (!ctx) return { ok: false, mensaje: MENSAJE_SIN_CONEXION };
  try {
    await ctx.authMod.sendPasswordResetEmail(ctx.auth, email.trim());
    return { ok: true, mensaje: mensajeGenerico };
  } catch (err) {
    // A propósito: "usuario no encontrado" también muestra el mensaje
    // genérico — no confirmamos ni negamos si el email tiene cuenta.
    if (err && err.code === 'auth/user-not-found') return { ok: true, mensaje: mensajeGenerico };
    return { ok: false, mensaje: traducirErrorFirebase(err) };
  }
}

async function cerrarSesion() {
  const ctx = await obtenerFirebaseApp();
  localStorage.removeItem(CLAVE_UID_ACTIVO);
  // No se toca ninguna base de IndexedDB acá — los datos de esta cuenta
  // quedan cacheados en su base `cultivarnos-{uid}` (por si se vuelve a
  // entrar), simplemente dejan de mostrarse. Es app.js quien, al ver que
  // ya no hay sesión, vuelve a apuntar DB a la base sin cuenta. Esto es a
  // propósito: "al cerrar sesión, no borrar IndexedDB sin preguntar".
  if (ctx) {
    try { await ctx.authMod.signOut(ctx.auth); } catch (err) { console.warn('[Cultivarnos] signOut falló (se cierra sesión localmente igual):', err); }
  }
  estado = { cargando: false, firebaseDisponible: !!ctx, usuario: null, perfil: null, necesitaUsername: false };
  notificarCambio();
}

// ---------------------------------------------------------------------
// Exposición pública
// ---------------------------------------------------------------------

if (window.CultivarnosAuth && window.CultivarnosAuth.__esStubDePrueba) {
  console.info('[Cultivarnos] firebase-auth.js: se detectó un stub de prueba en window.CultivarnosAuth — no se inicializa Firebase real.');
} else {
  window.CultivarnosAuth = {
    ready: () => listoPromise,
    getEstado: () => estado,
    onCambio(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    crearCuentaConEmail,
    iniciarSesionConEmail,
    iniciarSesionConGoogle,
    enviarRecuperarPassword,
    elegirUsername,
    verificarUsernameDisponible,
    validarUsername,
    normalizarUsername,
    cerrarSesion,
    obtenerUidActivoCacheado: () => localStorage.getItem(CLAVE_UID_ACTIVO),
  };
  iniciar();
}
