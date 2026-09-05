// index.js — únicas dos Cloud Functions del proyecto: los schedulers de
// notificaciones push. Deliberadamente NO hay una API tipo Express acá
// (ver docs/firebase-architecture.md, sección "Push Notifications") — el
// resto del backend sigue siendo el cliente escribiendo directo a
// Firestore (Security Rules), como siempre.
//
// API v2 de Firebase Functions (`firebase-functions/v2`), no la v1
// (`functions.pubsub.schedule`) — es la vigente/recomendada al momento de
// escribir esto.

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();

// Región única para las dos funciones — sin necesidad de definirla en
// cada `onSchedule` por separado. `southamerica-east1` (São Paulo) es la
// región de Google Cloud más cercana al huso horario típico de las
// cuentas de Cultivarnos hoy; no afecta la corrección de los horarios
// (todo el cálculo de "hora local del recordatorio" ya pasa por
// IANA timezone + UTC en el cliente, nunca por la zona del servidor),
// solo la latencia.
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 3 });

const { procesarRecordatoriosPendientes } = require('./lib/recordatorios');
const { procesarSugerenciasPush } = require('./lib/sugerencias');

// Recordatorios: cada 1 minuto — tienen que respetar la hora EXACTA
// elegida por la persona (ver requisito explícito del pedido: "nunca
// aproximar"). Un recordatorio vencido espera como máximo ~1 minuto
// extra para su push, que es la tolerancia real que permite un único
// scheduler para TODAS las cuentas en vez de uno por recordatorio.
exports.procesarRecordatorios = onSchedule('every 1 minutes', async () => {
  const resultado = await procesarRecordatoriosPendientes();
  if (resultado.procesados) {
    console.log('[Cultivarnos Functions] recordatorios procesados:', resultado.procesados);
  }
});

// Sugerencias: cada 30 minutos — a diferencia de un recordatorio, una
// sugerencia contextual no tiene que respetar un minuto exacto, solo caer
// dentro de la ventana horaria amplia (09-19 local) y respetar el máximo
// de una por día. 30 minutos es tolerancia de sobra para ese caso de uso
// y evita 48x más invocaciones/día que si corriera cada 1 minuto como los
// recordatorios (impacto directo en el costo de Blaze — ver
// docs/firebase-architecture.md).
exports.procesarSugerencias = onSchedule('every 30 minutes', async () => {
  const resultado = await procesarSugerenciasPush();
  if (resultado.usuariosNotificados) {
    console.log('[Cultivarnos Functions] sugerencias enviadas:', resultado.usuariosNotificados);
  }
});
