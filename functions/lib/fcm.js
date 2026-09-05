// fcm.js — envío de mensajes FCM + limpieza de dispositivos con token
// inválido. Lo único que toca el SDK de mensajería en todo functions/.

const admin = require('firebase-admin');

// Códigos de error de FCM que significan "este token ya no sirve, nunca
// más va a funcionar" (desinstalada, permiso revocado del todo, token
// rotado sin que se haya alcanzado a actualizar). Distinto de un error de
// red o de cuota, que sí conviene reintentar en la próxima corrida en vez
// de borrar el dispositivo.
const CODIGOS_TOKEN_INVALIDO = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

// Envía una notificación a un dispositivo puntual. Nunca lanza — siempre
// devuelve { ok, tokenInvalido } para que quien llama decida qué hacer
// (marcar el recordatorio como enviado, limpiar el dispositivo, etc.) sin
// tener que andar mirando códigos de error de FCM en cada punto de uso.
async function enviarATokenDispositivo({ token, titulo, cuerpo, data }) {
  try {
    await admin.messaging().send({
      token,
      notification: { title: titulo, body: cuerpo },
      // Todos los valores de `data` de FCM tienen que ser strings.
      data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])),
      webpush: {
        fcmOptions: {
          link: data && data.cultivoId ? `/cultivarnos/#/cultivo/${data.cultivoId}` : '/cultivarnos/#/inicio',
        },
        notification: {
          // Ícono PWA ya aprobado — nunca un emoji como ícono del sistema.
          icon: '/cultivarnos/icons/icon-192.png',
        },
      },
    });
    return { ok: true, tokenInvalido: false };
  } catch (err) {
    const invalido = CODIGOS_TOKEN_INVALIDO.has(err && err.code);
    if (!invalido) console.warn('[Cultivarnos Functions] error al enviar FCM (no es token inválido, se reintenta después):', err && err.code, err && err.message);
    return { ok: false, tokenInvalido: invalido };
  }
}

// Deshabilita/borra SOLO este dispositivo cuando FCM confirma que su token
// ya no sirve — nunca sigue reintentando indefinidamente, y nunca toca
// otro dispositivo de la cuenta.
async function limpiarDispositivoInvalido(db, uid, deviceId) {
  try {
    await db.collection('users').doc(uid).collection('pushDevices').doc(deviceId).delete();
  } catch (err) {
    console.warn('[Cultivarnos Functions] no se pudo limpiar un dispositivo con token inválido:', err);
  }
}

module.exports = { enviarATokenDispositivo, limpiarDispositivoInvalido };
