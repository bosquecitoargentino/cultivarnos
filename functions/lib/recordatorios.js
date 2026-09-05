// recordatorios.js — el scheduler de recordatorios explícitos. Corre cada
// minuto (ver index.js) y procesa TODOS los recordatorios de TODAS las
// cuentas en una sola corrida (collection group query) — nunca un
// scheduler por recordatorio.
//
// Ver docs/firebase-architecture.md, sección "Push Notifications", para
// el razonamiento completo (idempotencia, ventana de gracia, multi-
// dispositivo, qué pasa al editar/completar/borrar).

const admin = require('firebase-admin');
const { enviarATokenDispositivo, limpiarDispositivoInvalido } = require('./fcm');

// Tope de recordatorios procesados por corrida — protección básica contra
// un caso patológico (miles vencidos a la vez), no un sistema de rate
// limit sofisticado. Lo que no entra en esta corrida sigue 'pending' y se
// toma en la corrida siguiente (1 minuto después).
const TOPE_POR_CORRIDA = 200;

// Ventana de gracia: un recordatorio vencido hace más de esto NO genera
// push tardío (evita, por ejemplo, que alguien que no abre el teléfono en
// varios días reciba de golpe una ráfaga de notificaciones atrasadas al
// reconectarse). Igual queda completo en la app — esto solo decide si
// vale la pena interrumpir con un push o no.
const VENTANA_GRACIA_MS = 24 * 60 * 60 * 1000; // 24 horas

// Tope de reintentos ante una falla transitoria de envío (no de token
// inválido, que se limpia aparte) — evita reintentar para siempre un
// recordatorio que por lo que sea nunca puede enviarse.
const TOPE_INTENTOS = 5;

async function procesarRecordatoriosPendientes() {
  const db = admin.firestore();
  const ahora = new Date();
  const ahoraIso = ahora.toISOString();

  const snap = await db
    .collectionGroup('recordatorios')
    .where('deleted', '==', false)
    .where('estado', '==', 'pendiente')
    .where('notify', '==', true)
    .where('notificationStatus', '==', 'pending')
    .where('notifyAtUtc', '<=', ahoraIso)
    .orderBy('notifyAtUtc')
    .limit(TOPE_POR_CORRIDA)
    .get();

  if (snap.empty) return { procesados: 0 };

  let procesados = 0;
  for (const docSnap of snap.docs) {
    try {
      await procesarUnRecordatorio(db, docSnap.ref, ahora);
      procesados += 1;
    } catch (err) {
      console.warn('[Cultivarnos Functions] error procesando un recordatorio, se reintenta en la próxima corrida:', docSnap.ref.path, err);
    }
  }
  return { procesados };
}

async function procesarUnRecordatorio(db, ref, ahora) {
  // Claim idempotente: transacción que relee el estado actual y solo
  // avanza si TODAVÍA corresponde notificar. Cubre tres casos a la vez:
  //  - Dos corridas solapadas (o un reintento) nunca envían el mismo
  //    recordatorio dos veces: la segunda encuentra notificationStatus
  //    != 'pending' y no hace nada.
  //  - Si la persona completó o borró el recordatorio JUSTO antes de esta
  //    corrida, la relectura dentro de la transacción lo detecta y aborta
  //    sin enviar nada.
  //  - Si está demasiado vencido (ventana de gracia), se marca
  //    'skipped_stale' acá mismo, sin llegar a enviar.
  const resultado = await db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    if (!doc.exists) return null;
    const d = doc.data();

    if (d.notificationStatus !== 'pending') return null; // ya tomado por otra corrida/reintento
    if (d.deleted || d.estado !== 'pendiente' || !d.notify) return null; // cambió mientras tanto

    const vencidoHaceMs = ahora.getTime() - new Date(d.notifyAtUtc).getTime();
    if (vencidoHaceMs > VENTANA_GRACIA_MS) {
      t.update(ref, { notificationStatus: 'skipped_stale' });
      return null;
    }

    t.update(ref, {
      notificationStatus: 'processing',
      notificationClaimedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return d;
  });

  if (!resultado) return;

  const uid = ref.parent.parent.id;
  const devicesSnap = await db
    .collection('users').doc(uid).collection('pushDevices')
    .where('enabled', '==', true)
    .where('remindersEnabled', '==', true)
    .get();

  if (devicesSnap.empty) {
    // Nadie tiene recordatorios activados en ningún dispositivo ahora
    // mismo (los desactivó todos, o nunca los activó) — no es una falla,
    // simplemente no hay a quién avisarle. Se marca enviado para no
    // reintentar cada minuto para siempre.
    await ref.update({ notificationStatus: 'sent', notificationSentAt: admin.firestore.FieldValue.serverTimestamp(), notificationDispositivos: 0 });
    return;
  }

  const data = { tipo: 'recordatorio', cultivoId: resultado.cultivoId != null ? resultado.cultivoId : '' };
  let enviados = 0;
  for (const deviceDoc of devicesSnap.docs) {
    const device = deviceDoc.data();
    if (!device.token) continue;
    const envio = await enviarATokenDispositivo({ token: device.token, titulo: 'Cultivarnos', cuerpo: resultado.titulo, data });
    if (envio.ok) {
      enviados += 1;
    } else if (envio.tokenInvalido) {
      await limpiarDispositivoInvalido(db, uid, deviceDoc.id);
    }
  }

  if (enviados > 0 || devicesSnap.size === 0) {
    await ref.update({ notificationStatus: 'sent', notificationSentAt: admin.firestore.FieldValue.serverTimestamp(), notificationDispositivos: enviados });
    return;
  }

  // Todos los envíos fallaron por algo transitorio (no token inválido —
  // eso ya se limpió arriba y no cuenta acá): reintentar en la próxima
  // corrida, hasta un tope, para no quedar reintentando para siempre.
  const intentos = (resultado.notificationIntentos || 0) + 1;
  if (intentos >= TOPE_INTENTOS) {
    await ref.update({ notificationStatus: 'failed', notificationIntentos: intentos });
  } else {
    await ref.update({ notificationStatus: 'pending', notificationIntentos: intentos });
  }
}

module.exports = { procesarRecordatoriosPendientes };
