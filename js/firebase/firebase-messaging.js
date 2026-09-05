// firebase-messaging.js — Push Notifications (Firebase Cloud Messaging).
// ES module (igual que firebase-auth.js/firebase-sync.js). Expone su API
// pública en `window.CultivarnosPush` para que el resto de la app (vistas
// clásicas) lo consuma sin volverse módulos ellos también.
//
// Principio igual que el resto de la integración Firebase: NUNCA bloquear
// ni romper nada existente. Si Messaging no está disponible (navegador sin
// soporte, sin permiso, sin red), cada función devuelve algo manejable
// ({ok:false, mensaje}) — nunca lanza sin atrapar. Las notificaciones son
// una capa optativa sobre una app que ya funciona perfecto sin ellas.
//
// Ver docs/firebase-architecture.md, sección "Push Notifications", para el
// modelo completo (dispositivos, recordatorios, sugerencias, scheduler).
//
// Seam de pruebas: igual que firebase-auth.js/firebase-sync.js, si
// `window.CultivarnosPush` ya existe con `__esStubDePrueba` antes de que
// este script corra, no se pisa.

import { obtenerFirebaseApp, SDK_VERSION } from './firebase-config.js';

// Clave pública VAPID del proyecto — se genera en Firebase Console:
// Configuración del proyecto > Cloud Messaging > "Certificados push web" >
// "Generar par de claves". Es pública (viaja al cliente a propósito, como
// el apiKey — no es un secreto), pero es específica de CADA proyecto
// Firebase, así que no se puede completar de antemano. Mientras diga
// 'PEGAR_VAPID_KEY_ACA', activar() devuelve un mensaje claro en vez de
// fallar de forma confusa.
const VAPID_KEY = 'PEGAR_VAPID_KEY_ACA';

const CLAVE_INVITACION_RECHAZADA = 'cultivarnos-push-invitacion-rechazada';

let messagingPromise = null;

function vapidConfigurada() {
  return !!VAPID_KEY && !VAPID_KEY.startsWith('PEGAR_');
}

function soportado() {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
}

function estadoPermiso() {
  if (!soportado()) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

// Memoizado como obtenerFirebaseApp() — el import dinámico del módulo de
// Messaging corre una sola vez, solo cuando de verdad hace falta (nunca en
// el boot: la mayoría de las visitas no van a activar notificaciones, y
// Messaging no está disponible en todos los navegadores/contextos).
async function obtenerMessaging() {
  if (!messagingPromise) messagingPromise = inicializarMessaging();
  return messagingPromise;
}

async function inicializarMessaging() {
  if (!soportado()) return null;
  const ctx = await obtenerFirebaseApp();
  if (!ctx) return null;
  try {
    const mod = await import(/* @vite-ignore */ `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-messaging.js`);
    const messaging = mod.getMessaging(ctx.app);
    return { ...ctx, messagingMod: mod, messaging };
  } catch (err) {
    console.warn('[Cultivarnos] no se pudo cargar Firebase Messaging (sin red, CDN bloqueado, o navegador sin soporte):', err);
    return null;
  }
}

function plataformaActual() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iphone';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

function refUsuarioActual() {
  const est = window.CultivarnosAuth && window.CultivarnosAuth.getEstado();
  return est && est.usuario ? est.usuario.uid : null;
}

// ---------------------------------------------------------------------
// Registro del dispositivo — users/{uid}/pushDevices/{deviceId}. Reusa
// EXACTAMENTE el mismo deviceId que ya usa el Sync Engine (db.js,
// obtenerDeviceId()) para los ids de documento remoto — es la misma idea
// ("identidad de esta instalación") en los dos lugares, sin inventar un
// segundo identificador.
// ---------------------------------------------------------------------

async function activar() {
  if (!soportado()) return { ok: false, mensaje: 'Este dispositivo no admite notificaciones.', estado: 'unsupported' };
  if (!vapidConfigurada()) {
    return { ok: false, mensaje: 'Notificaciones no configuradas todavía (falta la clave VAPID en firebase-messaging.js).', estado: estadoPermiso() };
  }
  const uid = refUsuarioActual();
  if (!uid) return { ok: false, mensaje: 'Iniciá sesión para activar notificaciones.', estado: estadoPermiso() };

  let permiso;
  try {
    permiso = await Notification.requestPermission();
  } catch (err) {
    return { ok: false, mensaje: 'No se pudo pedir permiso de notificaciones.', estado: estadoPermiso() };
  }
  if (permiso !== 'granted') {
    return { ok: false, mensaje: permiso === 'denied' ? 'Las notificaciones están bloqueadas en este dispositivo.' : 'No se activaron las notificaciones.', estado: permiso };
  }

  const m = await obtenerMessaging();
  if (!m) return { ok: false, mensaje: 'No pudimos conectarnos para activar notificaciones. Probá de nuevo más tarde.', estado: permiso };

  try {
    const registration = await navigator.serviceWorker.ready;
    const token = await m.messagingMod.getToken(m.messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return { ok: false, mensaje: 'No pudimos generar el token de notificaciones.', estado: permiso };

    const deviceId = window.DB.obtenerDeviceId();
    const { doc, setDoc, serverTimestamp } = m.firestoreMod;
    const ref = doc(m.db, 'users', uid, 'pushDevices', deviceId);
    const previo = await obtenerEstadoDispositivo();
    await setDoc(ref, {
      installationId: deviceId,
      token,
      enabled: true,
      // Preferencias: se conservan si el dispositivo ya las tenía (ej. la
      // persona había desactivado solo sugerencias y ahora reactiva todo
      // el dispositivo) — por defecto ambas activas para una instalación
      // nueva.
      remindersEnabled: previo ? previo.remindersEnabled !== false : true,
      suggestionsEnabled: previo ? previo.suggestionsEnabled !== false : true,
      platform: plataformaActual(),
      // Zona horaria IANA de este dispositivo — la usa la Cloud Function
      // de sugerencias para respetar la ventana horaria local (09-19) sin
      // tener que volver a preguntarla en ningún lado (mismo helper que
      // usan los recordatorios, ver utils.js#obtenerTimezoneDispositivo).
      timezone: obtenerTimezoneDispositivo(),
      createdAt: (previo && previo.createdAt) || serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    }, { merge: true });

    localStorage.removeItem(CLAVE_INVITACION_RECHAZADA);
    return { ok: true, mensaje: 'Notificaciones activadas en este dispositivo.', estado: 'granted' };
  } catch (err) {
    console.warn('[Cultivarnos] no se pudo activar notificaciones:', err);
    return { ok: false, mensaje: 'No pudimos activar las notificaciones. Probá de nuevo.', estado: permiso };
  }
}

async function obtenerEstadoDispositivo() {
  const uid = refUsuarioActual();
  if (!uid) return null;
  const ctx = await obtenerFirebaseApp();
  if (!ctx) return null;
  try {
    const { doc, getDoc } = ctx.firestoreMod;
    const deviceId = window.DB.obtenerDeviceId();
    const snap = await getDoc(doc(ctx.db, 'users', uid, 'pushDevices', deviceId));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.warn('[Cultivarnos] no se pudo leer el estado de notificaciones de este dispositivo:', err);
    return null;
  }
}

// Solo toca los campos de ESTE dispositivo (uid + deviceId propios) —
// nunca puede afectar otro dispositivo de la misma cuenta ni, mucho
// menos, otra cuenta (ver Security Rules, users/{uid}/pushDevices/**).
async function actualizarPreferencias(cambios) {
  const uid = refUsuarioActual();
  if (!uid) return { ok: false };
  const ctx = await obtenerFirebaseApp();
  if (!ctx) return { ok: false, mensaje: 'No pudimos conectarnos. Se va a intentar de nuevo cuando vuelva la conexión.' };
  try {
    const { doc, setDoc, serverTimestamp } = ctx.firestoreMod;
    const deviceId = window.DB.obtenerDeviceId();
    await setDoc(doc(ctx.db, 'users', uid, 'pushDevices', deviceId), { ...cambios, updatedAt: serverTimestamp() }, { merge: true });
    return { ok: true };
  } catch (err) {
    console.warn('[Cultivarnos] no se pudieron guardar las preferencias de notificaciones:', err);
    return { ok: false, mensaje: 'No se pudo guardar. Probá de nuevo.' };
  }
}

// "Desactivar notificaciones en este dispositivo" (Ajustes). Deshabilita
// el documento (no lo borra: si se reactiva después, no pierde
// remindersEnabled/suggestionsEnabled ya elegidos) y da de baja el token
// del lado de FCM — así ni un reintento del scheduler ni un token viejo
// puede volver a generar un push acá.
async function desactivarEnEsteDispositivo() {
  const uid = refUsuarioActual();
  if (!uid) return { ok: false };
  const m = await obtenerMessaging();
  if (m) {
    try { await m.messagingMod.deleteToken(m.messaging); } catch (err) { console.warn('[Cultivarnos] no se pudo dar de baja el token de FCM:', err); }
  }
  const ctx = await obtenerFirebaseApp();
  if (!ctx) return { ok: false, mensaje: 'No pudimos conectarnos. Se va a intentar de nuevo cuando vuelva la conexión.' };
  try {
    const { doc, setDoc, serverTimestamp } = ctx.firestoreMod;
    const deviceId = window.DB.obtenerDeviceId();
    await setDoc(doc(ctx.db, 'users', uid, 'pushDevices', deviceId), { enabled: false, updatedAt: serverTimestamp() }, { merge: true });
    return { ok: true, mensaje: 'Notificaciones desactivadas en este dispositivo.' };
  } catch (err) {
    console.warn('[Cultivarnos] no se pudo desactivar notificaciones:', err);
    return { ok: false, mensaje: 'No se pudo desactivar. Probá de nuevo.' };
  }
}

// Cambio de cuenta / logout (ver app.js#cerrarSesion en firebase-auth.js):
// desvincula ESTE dispositivo de la cuenta que se está por dejar, para
// que "Usuario A -> logout -> Usuario B" nunca le llegue un push de A a
// este dispositivo. Recibe el uid explícito porque para cuando esto
// corre, CultivarnosAuth ya puede no tener sesión — no puede volver a
// leerlo por su cuenta. Best-effort: si no hay red en este instante, no
// bloquea el logout (mismo criterio que signOut() en firebase-auth.js) —
// documentado como riesgo conocido en docs/firebase-architecture.md.
async function desvincularDeCuenta(uidAnterior) {
  if (!uidAnterior) return;
  const ctx = await obtenerFirebaseApp();
  if (!ctx) return;
  try {
    const { doc, setDoc } = ctx.firestoreMod;
    const deviceId = window.DB.obtenerDeviceId();
    await setDoc(doc(ctx.db, 'users', uidAnterior, 'pushDevices', deviceId), { enabled: false }, { merge: true });
  } catch (err) {
    console.warn('[Cultivarnos] no se pudo desvincular notificaciones al cerrar sesión (se intentará de nuevo si hace falta):', err);
  }
}

// ---------------------------------------------------------------------
// Invitación contextual (al crear el primer recordatorio con hora+
// notificarme) — nunca insiste. Se ofrece como mucho una vez: si la
// persona toca "Ahora no" (o cierra el modal), se guarda la elección en
// este dispositivo y no se vuelve a mostrar sola. Si ya están activadas,
// bloqueadas, o el navegador no soporta notificaciones, no hay nada que
// ofrecer.
// ---------------------------------------------------------------------

async function ofrecerActivarSiCorresponde() {
  if (!soportado()) return;
  if (estadoPermiso() !== 'default') return; // ya decidido (granted o denied) — nada que preguntar
  if (localStorage.getItem(CLAVE_INVITACION_RECHAZADA)) return;
  if (typeof createModal !== 'function') return; // vista sin el helper de modales cargado, no debería pasar

  return new Promise((resolve) => {
    const { backdrop, close } = createModal(`
      <div class="modal-sheet">
        <div class="modal-close-row"><button id="push-invite-close" aria-label="Cerrar">✕</button></div>
        <div class="sugerencia-evento">
          <div class="sugerencia-evento-texto">¿Querés que Cultivarnos te avise aunque la aplicación esté cerrada?</div>
          <div class="sugerencia-evento-botones">
            <button type="button" id="push-invite-si" class="btn-primary">Activar notificaciones</button>
            <button type="button" id="push-invite-no" class="btn-secondary">Ahora no</button>
          </div>
        </div>
      </div>
    `);
    const rechazar = () => { localStorage.setItem(CLAVE_INVITACION_RECHAZADA, '1'); close(); resolve(); };
    backdrop.querySelector('#push-invite-close').addEventListener('click', rechazar);
    backdrop.querySelector('#push-invite-no').addEventListener('click', rechazar);
    backdrop.querySelector('#push-invite-si').addEventListener('click', async () => {
      const resultado = await activar();
      if (typeof showToast === 'function') showToast(resultado.mensaje);
      close();
      resolve();
    });
  });
}

// ---------------------------------------------------------------------
// Foreground: la app está abierta y llega un mensaje. A propósito NO se
// crea una notificación del sistema acá (eso ya lo maneja el Service
// Worker cuando la app está en segundo plano/cerrada) — mostrar las dos
// cosas a la vez sería la duplicación que pide evitar el pedido. Un toast
// simple alcanza: la persona ya está mirando la app.
// ---------------------------------------------------------------------

async function iniciarEscuchaForeground() {
  const m = await obtenerMessaging();
  if (!m) return;
  try {
    m.messagingMod.onMessage(m.messaging, (payload) => {
      const texto = (payload.notification && payload.notification.body) || (payload.data && payload.data.body);
      if (texto && typeof showToast === 'function') showToast(texto);
    });
  } catch (err) {
    console.warn('[Cultivarnos] no se pudo escuchar notificaciones en primer plano:', err);
  }
}

// ---------------------------------------------------------------------
// Exposición pública
// ---------------------------------------------------------------------

if (window.CultivarnosPush && window.CultivarnosPush.__esStubDePrueba) {
  console.info('[Cultivarnos] firebase-messaging.js: se detectó un stub de prueba en window.CultivarnosPush — no se inicializa Messaging real.');
} else {
  window.CultivarnosPush = {
    estadoPermiso,
    soportado,
    activar,
    desactivarEnEsteDispositivo,
    obtenerEstadoDispositivo,
    actualizarPreferencias,
    desvincularDeCuenta,
    ofrecerActivarSiCorresponde,
  };
  // Si ya había permiso concedido de una visita anterior, escuchamos
  // mensajes en primer plano desde ya (no hace falta esperar a que la
  // persona vuelva a tocar "Activar"). Si nunca activó nada, esto no
  // inicializa Messaging (obtenerMessaging solo se llama acá si soportado
  // Y permiso ya es 'granted' — nunca dispara el prompt nativo por su
  // cuenta).
  if (soportado() && Notification.permission === 'granted') {
    iniciarEscuchaForeground();
  }
}
