// sugerencias.js — sugerencias contextuales push. Reusa el motor de
// observación real (ver motorLoader.js) — acá solo vive la orquestación:
// a quién le toca, cuándo, y anti-repetición, nunca lógica agronómica.
//
// Corre con menos frecuencia que los recordatorios (ver index.js) porque,
// a diferencia de un recordatorio, una sugerencia no tiene que respetar un
// minuto exacto — solo una ventana horaria amplia. Y, a diferencia de una
// primera versión de este archivo, cada CUENTA se evalúa una sola vez por
// día (ver HORA_CHEQUEO_LOCAL y procesarUnUsuario más abajo) — el
// scheduler puede seguir corriendo seguido sin que eso implique releer
// cultivos/eventos de cada cuenta en cada corrida (ver docs/firebase-
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

// Hora local a partir de la cual se hace LA ÚNICA revisión del día para
// una cuenta — no apenas se abre la ventana (9). 13:00 es un punto medio
// arbitrario pero razonable: da tiempo a que la persona ya haya
// registrado algún evento de la mañana antes de que el motor evalúe sus
// cultivos. Ver procesarUnUsuario() más abajo para el porqué de "una sola
// vez" (evitar releer cultivos/eventos hasta 20 veces por día por cuenta
// sin necesidad real — una sugerencia no es urgente, no hace falta
// revisar cada 30-60 minutos si "ya apareció algo").
const HORA_CHEQUEO_LOCAL = 13;

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
  // horaria local (09-19 en SU zona, no en la del servidor) — esto decide
  // a quién se le puede llegar a MANDAR en esta corrida (se recalcula
  // siempre, por dispositivo, sin importar si hoy ya se revisó o no).
  const enVentana = dispositivos.filter((d) => {
    const hora = horaLocalEnZona(d.timezone || 'UTC');
    return hora != null && hora >= VENTANA_HORARIA.desde && hora < VENTANA_HORARIA.hasta;
  });
  if (!enVentana.length) return false;

  // La revisión en sí (la parte cara: leer cultivos/eventos y correr el
  // motor) pasa UNA sola vez por día por cuenta, recién a partir de
  // HORA_CHEQUEO_LOCAL — no en cada corrida mientras dure la ventana. Se
  // usa la zona del primer dispositivo en ventana como "reloj
  // representativo" de la cuenta (simplificación a propósito: si una
  // misma cuenta tuviera dispositivos en husos horarios muy distintos,
  // caso raro, el chequeo se guía por uno solo de ellos — ver
  // docs/firebase-architecture.md, sección 12.6).
  const zonaRepresentativa = enVentana[0].timezone || 'UTC';
  const horaLocal = horaLocalEnZona(zonaRepresentativa);
  const hoyLocal = fechaLocalEnZona(zonaRepresentativa);
  if (horaLocal == null || hoyLocal == null || horaLocal < HORA_CHEQUEO_LOCAL) return false;

  const pushStateRef = db.collection('users').doc(uid).collection('pushState').doc('sugerencias');
  const pushStateSnap = await pushStateRef.get();
  const pushState = pushStateSnap.exists ? pushStateSnap.data() : null;
  if (pushState && pushState.ultimaRevisionFecha === hoyLocal) return false; // hoy ya se revisó (haya encontrado algo o no)

  const candidato = await elegirCandidato(db, uid, pushState);

  if (!candidato) {
    // Nada realmente pertinente: no se manda nada (no es una falla), pero
    // igual se registra la revisión de hoy — así no se vuelve a pagar el
    // costo de releer cultivos/eventos si el scheduler corre de nuevo más
    // tarde, dentro de la misma ventana de hoy.
    await pushStateRef.set({ ultimaRevisionFecha: hoyLocal, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return false;
  }

  const data = { tipo: 'sugerencia', cultivoId: candidato.cultivoId };
  let enviados = 0;
  for (const device of enVentana) {
    if (!device.token) continue;
    const envio = await enviarATokenDispositivo({ token: device.token, titulo: 'Cultivarnos', cuerpo: candidato.texto, data });
    if (envio.ok) enviados += 1;
    else if (envio.tokenInvalido) await limpiarDispositivoInvalido(db, uid, device.id);
  }

  // Se registra la revisión de hoy tanto si se pudo enviar como si no
  // (ej. ningún dispositivo en ventana tenía token válido) — de cualquier
  // manera ya se gastó el costo de evaluar, y reintentar más tarde en el
  // mismo día no cambiaría el resultado (los mismos cultivos/eventos).
  const historialPrevio = (pushState && pushState.historial) || [];
  await pushStateRef.set({
    ultimaRevisionFecha: hoyLocal,
    historial: enviados > 0 ? [candidato.clave, ...historialPrevio].slice(0, HISTORIAL_MAX) : historialPrevio,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return enviados > 0;
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
