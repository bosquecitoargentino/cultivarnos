// sugerencias.js — sugerencias contextuales push. Reusa el motor de
// observación real (ver motorLoader.js) — acá solo vive la orquestación:
// a quién le toca, cuándo, y anti-repetición, nunca lógica agronómica.
//
// Corre con menos frecuencia que los recordatorios (ver index.js) porque,
// a diferencia de un recordatorio, una sugerencia no tiene que respetar un
// minuto exacto — solo una ventana horaria amplia (ver docs/firebase-
// architecture.md, sección Push Notifications).

const admin = require('firebase-admin');
const { cargarMotor } = require('./motorLoader');
const { enviarATokenDispositivo, limpiarDispositivoInvalido } = require('./fcm');

// Mismo orden de prioridad que ORDEN_ORIGEN en motor-observacion.js —
// duplicado acá a propósito (NO es lógica agronómica, es solo "en qué
// orden preferir el ORIGEN de una sugerencia ya calculada por el motor
// real" — 6 strings estables). Si ORDEN_ORIGEN cambia alguna vez en
// motor-observacion.js, actualizar esta lista también.
const ORDEN_ORIGEN = ['especie', 'evento-reciente', 'biblioteca-etapa', 'biblioteca-ecologia', 'biblioteca-cosecha', 'general'];

const VENTANA_HORARIA = { desde: 9, hasta: 19 }; // 09:00–19:00 hora local del dispositivo
const HISTORIAL_MAX = 8; // mismo tamaño que la memoria anti-repetición de Inicio (cliente)

function horaLocalEnZona(timeZone) {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(new Date()));
  } catch (err) {
    return null; // timezone inválida/desconocida: no arriesgamos mandar fuera de horario
  }
}

function fechaLocalEnZona(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); // 'YYYY-MM-DD'
  } catch (err) {
    return null;
  }
}

async function procesarSugerenciasPush() {
  const db = admin.firestore();

  const devicesSnap = await db
    .collectionGroup('pushDevices')
    .where('enabled', '==', true)
    .where('suggestionsEnabled', '==', true)
    .get();
  if (devicesSnap.empty) return { usuariosNotificados: 0 };

  const dispositivosPorUid = new Map();
  devicesSnap.forEach((docSnap) => {
    const uid = docSnap.ref.parent.parent.id;
    const lista = dispositivosPorUid.get(uid) || [];
    lista.push({ id: docSnap.id, ...docSnap.data() });
    dispositivosPorUid.set(uid, lista);
  });

  let usuariosNotificados = 0;
  for (const [uid, dispositivos] of dispositivosPorUid) {
    try {
      const notificado = await procesarUnUsuario(db, uid, dispositivos);
      if (notificado) usuariosNotificados += 1;
    } catch (err) {
      console.warn('[Cultivarnos Functions] error procesando sugerencias de un usuario:', uid, err);
    }
  }
  return { usuariosNotificados };
}

async function procesarUnUsuario(db, uid, dispositivos) {
  // Solo los dispositivos que ahora mismo están dentro de la ventana
  // horaria local (09-19 en SU zona, no en la del servidor).
  const enVentana = dispositivos.filter((d) => {
    const hora = horaLocalEnZona(d.timezone || 'UTC');
    return hora != null && hora >= VENTANA_HORARIA.desde && hora < VENTANA_HORARIA.hasta;
  });
  if (!enVentana.length) return false;

  const hoyLocal = fechaLocalEnZona(enVentana[0].timezone || 'UTC');
  const pushStateRef = db.collection('users').doc(uid).collection('pushState').doc('sugerencias');
  const pushStateSnap = await pushStateRef.get();
  const pushState = pushStateSnap.exists ? pushStateSnap.data() : null;
  if (pushState && pushState.ultimoEnvioFecha === hoyLocal) return false; // ya se mandó una hoy (máx 1/día)

  const candidato = await elegirCandidato(db, uid, pushState);
  if (!candidato) return false; // nada realmente pertinente: no se manda nada, no es una falla

  const data = { tipo: 'sugerencia', cultivoId: candidato.cultivoId };
  let enviados = 0;
  for (const device of enVentana) {
    if (!device.token) continue;
    const envio = await enviarATokenDispositivo({ token: device.token, titulo: 'Cultivarnos', cuerpo: candidato.texto, data });
    if (envio.ok) enviados += 1;
    else if (envio.tokenInvalido) await limpiarDispositivoInvalido(db, uid, device.id);
  }
  if (!enviados) return false;

  const historialPrevio = (pushState && pushState.historial) || [];
  await pushStateRef.set({
    ultimoEnvioFecha: hoyLocal,
    historial: [candidato.clave, ...historialPrevio].slice(0, HISTORIAL_MAX),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return true;
}

// Calcula, con el motor REAL (ver motorLoader.js), la mejor sugerencia
// entre todos los cultivos activos del usuario — mismo criterio de
// prioridad que getSugerenciaDestacada (Inicio, cliente), pero con su
// PROPIA memoria anti-repetición acá (pushState, no la de Inicio: esa
// vive solo en configuracion local del dispositivo, nunca se sincroniza —
// ver docs/firebase-architecture.md). Devuelve null si no hay nada
// realmente pertinente: nunca se inventa una sugerencia solo para tener
// algo que mandar.
async function elegirCandidato(db, uid, pushState) {
  const [cultivosSnap, eventosSnap, configSnap] = await Promise.all([
    db.collection('users').doc(uid).collection('cultivos').where('deleted', '==', false).where('estado', '==', 'activo').get(),
    db.collection('users').doc(uid).collection('eventos').where('deleted', '==', false).get(),
    db.collection('users').doc(uid).collection('configuracion').doc('general').get(),
  ]);
  if (cultivosSnap.empty) return null;

  const eventosPorCultivo = new Map();
  eventosSnap.forEach((docSnap) => {
    const ev = docSnap.data();
    const lista = eventosPorCultivo.get(ev.cultivoId) || [];
    lista.push(ev);
    eventosPorCultivo.set(ev.cultivoId, lista);
  });

  const hemisferio = configSnap.exists ? configSnap.data().hemisferio : null;
  const historial = new Set((pushState && pushState.historial) || []);
  const motor = cargarMotor();
  const ahora = new Date();

  const candidatos = [];
  cultivosSnap.forEach((docSnap) => {
    const cultivo = { localId: docSnap.data().localId, ...docSnap.data() };
    const eventos = (eventosPorCultivo.get(cultivo.localId) || []).sort(motor.compararEventosPorFecha);
    const sugerencia = motor.obtenerSugerenciaCultivo(cultivo, eventos, ahora, hemisferio, {});
    if (!sugerencia) return;
    const clave = `${cultivo.localId}::${sugerencia.idPregunta}`;
    if (historial.has(clave)) return;
    candidatos.push({ cultivo, sugerencia, clave });
  });
  if (!candidatos.length) return null;

  let mejorIdx = ORDEN_ORIGEN.length;
  candidatos.forEach((c) => {
    const idx = ORDEN_ORIGEN.indexOf(c.sugerencia.origen);
    if (idx >= 0 && idx < mejorIdx) mejorIdx = idx;
  });
  const top = candidatos.filter((c) => ORDEN_ORIGEN.indexOf(c.sugerencia.origen) === mejorIdx);
  const elegido = top[Math.floor(Math.random() * top.length)];

  return { cultivoId: elegido.cultivo.localId, texto: elegido.sugerencia.pregunta, clave: elegido.clave };
}

module.exports = { procesarSugerenciasPush };
