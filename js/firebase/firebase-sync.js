// firebase-sync.js — el Sync Engine. Lo único que sabe de Firestore en
// toda la app aparte de firebase-auth.js (el perfil/username). No decide
// nada de la UI — expone estado + unas pocas acciones en
// `window.CultivarnosSync`, que `js/app.js` y las pantallas de auth
// consumen.
//
// Principio central (ver docs/firebase-architecture.md): IndexedDB sigue
// siendo la fuente operativa local. Firestore es una copia sincronizada,
// nunca la fuente de la verdad de la que la UI lee directo — todas las
// vistas siguen llamando exactamente a los mismos DB.getX()/addX()/
// updateX() de siempre, sin saber que existe Firebase. Este archivo corre
// en segundo plano, empujando y trayendo cambios.
//
// Seam de pruebas: igual que firebase-auth.js, si `window.CultivarnosSync`
// ya existe con `__esStubDePrueba` antes de que este script corra, no se
// pisa.

import { obtenerFirebaseApp } from './firebase-config.js';

const STORES = ['cultivos', 'eventos', 'recordatorios', 'lotesPropagacion'];

const GETTERS = {
  cultivos: () => window.DB.getAllCultivos(),
  eventos: () => window.DB.getAllEventos(),
  recordatorios: () => window.DB.getAllRecordatorios(),
  lotesPropagacion: () => window.DB.getAllLotes(),
};

// Método "Completo" (con limpieza de fotos huérfanas) a usar cuando un
// tombstone que llega de la nube nos dice que hay que borrar un registro
// que este dispositivo todavía tiene. Recordatorios no tiene un
// "Completo" propio — se borran en cascada junto con su cultivo, así que
// acá alcanza con el borrado simple.
const METODO_BORRADO_LOCAL = {
  cultivos: 'deleteCultivoCompleto',
  eventos: 'deleteEventoCompleto',
  lotesPropagacion: 'deleteLoteCompleto',
  recordatorios: 'deleteRecordatorio',
};

// Solo este subconjunto de "configuracion" viaja entre dispositivos —
// preferencias puramente visuales (orden manual, layout de Inicio) quedan
// en localStorage, local, como ya estaban.
const CAMPOS_CONFIGURACION_SINCRONIZABLES = ['hemisferio', 'lat', 'lon', 'region', 'clima', 'tipoSuelo'];

const CLAVE_HUERTA_DESCARTADA_PREFIX = 'cultivarnos-huerta-local-descartada-';
const INTERVALO_SYNC_MS = 45000;

let uidActual = null;
let timerSync = null;
let estadoSync = { estado: 'inactivo', pendientes: 0, primerSync: false, ultimaVez: null };
const listeners = new Set();

function notificar() {
  listeners.forEach((cb) => {
    try { cb(estadoSync); } catch (err) { console.warn('[Cultivarnos] listener de CultivarnosSync.onCambio falló:', err); }
  });
}
function setEstado(parcial) { estadoSync = { ...estadoSync, ...parcial }; notificar(); }

// Firestore rechaza escribir campos con valor `undefined` — acá los
// campos opcionales del dominio ya se guardan como `null` por convención
// (ver auditoría en docs/firebase-architecture.md), pero esto es una red
// de seguridad barata contra cualquier caso que se nos haya escapado.
function limpiarUndefined(obj) {
  const limpio = {};
  Object.keys(obj).forEach((k) => { limpio[k] = obj[k] === undefined ? null : obj[k]; });
  return limpio;
}

function quitarCamposInternosLocales(record) {
  const { _remoteId, _syncStatus, _syncedAt, ...resto } = record;
  return resto;
}

function quitarCamposDeDocumentoRemoto(datos) {
  const { localId, deleted, deletedAt, _serverUpdatedAt, ...resto } = datos;
  return resto;
}

// ---------------------------------------------------------------------
// Arranque / parada
// ---------------------------------------------------------------------

async function iniciar({ uid }) {
  uidActual = uid;
  const baseDestino = `cultivarnos-${uid}`;
  await window.DB.usarBaseDeDatos(baseDestino);

  const yaTieneDatosLocales = (await GETTERS.cultivos()).length > 0;
  if (!yaTieneDatosLocales) {
    const hayQuePreguntar = await detectarHuertaLegada(uid, baseDestino);
    if (hayQuePreguntar) {
      // No arranca el ciclo de sync todavía — espera a que la UI llame
      // vincularHuertaLocal() o descartarHuertaLocal() (ver
      // js/views/auth.js, pantalla "Encontramos una huerta...").
      setEstado({ estado: 'espera-decision-huerta-local', pendientes: 0 });
      return;
    }
  }

  arrancarCicloDeSync(!yaTieneDatosLocales);
}

async function detectarHuertaLegada(uid, baseDestino) {
  if (localStorage.getItem(CLAVE_HUERTA_DESCARTADA_PREFIX + uid)) return false;
  await window.DB.usarBaseDeDatos('cultivarnos');
  const legado = await GETTERS.cultivos();
  await window.DB.usarBaseDeDatos(baseDestino);
  return legado.length > 0;
}

function arrancarCicloDeSync(esPrimeraVez) {
  setEstado({ estado: 'sincronizando', primerSync: esPrimeraVez });
  window.addEventListener('online', sincronizarAhora);
  sincronizarAhora().then(() => setEstado({ primerSync: false }));
  if (timerSync) clearInterval(timerSync);
  timerSync = setInterval(sincronizarAhora, INTERVALO_SYNC_MS);
}

function detener() {
  uidActual = null;
  window.removeEventListener('online', sincronizarAhora);
  if (timerSync) clearInterval(timerSync);
  timerSync = null;
  setEstado({ estado: 'inactivo', pendientes: 0, primerSync: false });
}

// ---------------------------------------------------------------------
// "Encontramos una huerta en este dispositivo"
// ---------------------------------------------------------------------

async function recolectarFotoIds(cultivos, eventos, lotes) {
  const ids = new Set();
  cultivos.forEach((c) => { if (c.fotoId != null) ids.add(c.fotoId); });
  eventos.forEach((e) => { if (e.fotoId != null) ids.add(e.fotoId); });
  lotes.forEach((l) => { if (l.fotoId != null) ids.add(l.fotoId); });
  return Array.from(ids);
}

// Copia ADITIVA de la base local vieja ('cultivarnos') a la base de esta
// cuenta — nunca se toca ni se borra la base vieja, tal cual el principio
// "no perder datos" tiene prioridad sobre todo lo demás. Conserva los ids
// tal cual (mismo mecanismo de upsertRegistroSincronizado que usa la
// hidratación normal desde la nube).
async function vincularHuertaLocal() {
  if (!uidActual) return;
  const baseDestino = `cultivarnos-${uidActual}`;

  await window.DB.usarBaseDeDatos('cultivarnos');
  const [cultivos, eventos, recordatorios, lotes, configuracion] = await Promise.all([
    window.DB.getAllCultivos(),
    window.DB.getAllEventos(),
    window.DB.getAllRecordatorios(),
    window.DB.getAllLotes(),
    window.DB.getConfiguracion(),
  ]);
  const fotoIds = await recolectarFotoIds(cultivos, eventos, lotes);
  const fotos = (await Promise.all(fotoIds.map((fid) => window.DB.getFoto(fid)))).filter(Boolean);

  await window.DB.usarBaseDeDatos(baseDestino);
  for (const f of fotos) await window.DB.upsertRegistroSincronizado('fotos', f);
  for (const c of cultivos) await window.DB.upsertRegistroSincronizado('cultivos', c);
  for (const e of eventos) await window.DB.upsertRegistroSincronizado('eventos', e);
  for (const r of recordatorios) await window.DB.upsertRegistroSincronizado('recordatorios', r);
  for (const l of lotes) await window.DB.upsertRegistroSincronizado('lotesPropagacion', l);
  await window.DB.setConfiguracion(configuracion);

  arrancarCicloDeSync(false);
}

async function descartarHuertaLocal() {
  if (uidActual) localStorage.setItem(CLAVE_HUERTA_DESCARTADA_PREFIX + uidActual, '1');
  arrancarCicloDeSync(true);
}

// ---------------------------------------------------------------------
// Ciclo de sincronización: primero PULL (trae cambios de otros
// dispositivos, incluida la hidratación inicial en un dispositivo nuevo),
// después PUSH (empuja lo local pendiente). En ese orden a propósito: así
// el push de cada ciclo ya sabe si lo local sigue siendo la versión más
// nueva o si el pull recién la actualizó — evita necesitar una
// transacción de lectura-antes-de-escribir en cada push individual para
// resolver conflictos.
// ---------------------------------------------------------------------

async function sincronizarAhora() {
  if (!uidActual) return;
  const ctx = await obtenerFirebaseApp();
  if (!ctx || !navigator.onLine) { setEstado({ estado: 'sin-conexion' }); return; }

  setEstado({ estado: 'sincronizando' });
  try {
    await propagarBajas(ctx);
    for (const storeName of STORES) {
      await pull(ctx, storeName);
    }
    for (const storeName of STORES) {
      await push(ctx, storeName);
    }
    await sincronizarConfiguracion(ctx);
    setEstado({ estado: 'sincronizado', pendientes: 0, ultimaVez: new Date().toISOString() });
  } catch (err) {
    console.warn('[Cultivarnos] la sincronización falló, se reintenta en el próximo ciclo:', err);
    setEstado({ estado: 'pendiente' });
  }
}

async function propagarBajas(ctx) {
  const { doc, setDoc, serverTimestamp } = ctx.firestoreMod;
  const pendientes = await window.DB.getPendientesEliminar();
  for (const p of pendientes) {
    try {
      await setDoc(
        doc(ctx.db, 'users', uidActual, p.store, p.remoteId),
        { deleted: true, deletedAt: p.deletedAt, _serverUpdatedAt: serverTimestamp() },
        { merge: true }
      );
      await window.DB.borrarPendienteEliminar(p.id);
    } catch (err) {
      console.warn('[Cultivarnos] no se pudo propagar una baja, se reintenta después:', err);
    }
  }
}

async function pull(ctx, storeName) {
  const { collection, getDocs } = ctx.firestoreMod;
  const snap = await getDocs(collection(ctx.db, 'users', uidActual, storeName));
  const deviceId = window.DB.obtenerDeviceId();
  const locales = await GETTERS[storeName]();
  const porRemoteId = new Map(locales.map((r) => [r._remoteId || `${deviceId}__${r.id}`, r]));

  for (const docSnap of snap.docs) {
    const datos = docSnap.data();
    const remoteId = docSnap.id;
    const local = porRemoteId.get(remoteId);

    if (datos.deleted) {
      if (local) await aplicarTombstoneLocal(storeName, local);
      continue;
    }

    const remoteUpdatedAt = datos.updatedAt || '';
    if (local) {
      // LWW por updatedAt de CLIENTE (no serverTimestamp) — ver la
      // sección "Conflictos" de docs/firebase-architecture.md para el
      // razonamiento completo. Si lo local es igual o más nuevo, no se
      // toca acá — push() se encarga de subirlo si hace falta.
      if (remoteUpdatedAt > (local.updatedAt || '')) {
        const registro = {
          ...quitarCamposDeDocumentoRemoto(datos),
          id: local.id,
          _remoteId: remoteId,
          _syncStatus: 'synced',
          _syncedAt: new Date().toISOString(),
        };
        await window.DB.upsertRegistroSincronizado(storeName, registro);
      }
    } else {
      // Hidratación: nunca vimos este registro en este dispositivo. Se
      // conserva el `localId` original (viajó en el documento) para que
      // el id sea el mismo en todos los dispositivos de la cuenta.
      if (datos.localId == null) continue; // documento viejo/corrupto, se ignora
      const registro = {
        ...quitarCamposDeDocumentoRemoto(datos),
        id: datos.localId,
        _remoteId: remoteId,
        _syncStatus: 'synced',
        _syncedAt: new Date().toISOString(),
      };
      await window.DB.upsertRegistroSincronizado(storeName, registro);
    }
  }
}

async function aplicarTombstoneLocal(storeName, local) {
  const metodo = METODO_BORRADO_LOCAL[storeName];
  await window.DB[metodo](local.id);
  if (storeName === 'recordatorios') return; // deleteRecordatorio no encola tombstone, nada que cancelar

  // El borrado que acabamos de hacer encoló un tombstone NUEVO (db.js no
  // distingue "esto lo borró la persona" de "esto llegó de un pull") —
  // pero el documento remoto YA tiene deleted:true, así que ese
  // tombstone es redundante. Se cancela acá para no generar un ping-pong
  // infinito entre dispositivos.
  const pendientes = await window.DB.getPendientesEliminar();
  const propio = pendientes.find((p) => p.store === storeName && p.localId === local.id);
  if (propio) await window.DB.borrarPendienteEliminar(propio.id);
}

async function push(ctx, storeName) {
  const { doc, setDoc, serverTimestamp } = ctx.firestoreMod;
  const deviceId = window.DB.obtenerDeviceId();
  const locales = await GETTERS[storeName]();

  for (const record of locales) {
    const actualizadoEn = record.updatedAt || record.createdAt || null;
    const yaAlDia = actualizadoEn && record._syncedAt && actualizadoEn <= record._syncedAt;
    if (yaAlDia) continue;

    const remoteId = record._remoteId || `${deviceId}__${record.id}`;
    try {
      const payload = limpiarUndefined({
        ...quitarCamposInternosLocales(record),
        localId: record.id,
        updatedAt: actualizadoEn || new Date().toISOString(),
        deleted: false,
        _serverUpdatedAt: serverTimestamp(),
      });
      await setDoc(doc(ctx.db, 'users', uidActual, storeName, remoteId), payload);
      await window.DB.marcarMetaSincronizacion(storeName, record.id, {
        _remoteId: remoteId,
        _syncStatus: 'synced',
        _syncedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn(`[Cultivarnos] no se pudo empujar ${storeName}#${record.id}, se reintenta después:`, err);
    }
  }
}

// `configuracion` no tiene updatedAt (nunca lo tuvo — ver auditoría), así
// que acá el criterio es deliberadamente más simple y conservador: si el
// dispositivo todavía no tiene NADA cargado (recién vinculado a esta
// cuenta), se hidrata desde la nube; si ya tiene algo, se respeta lo
// local y se sube. Documentado como limitación conocida para la
// auditoría profesional — un editor simultáneo en dos dispositivos podría
// pisarse, pero configuracion es de bajo riesgo (ubicación/clima, no
// datos de cultivos).
async function sincronizarConfiguracion(ctx) {
  const { doc, getDoc, setDoc } = ctx.firestoreMod;
  const ref = doc(ctx.db, 'users', uidActual, 'configuracion', 'general');
  const local = await window.DB.getConfiguracion();
  const subsetLocal = {};
  CAMPOS_CONFIGURACION_SINCRONIZABLES.forEach((c) => { subsetLocal[c] = local[c] == null ? null : local[c]; });

  let remoto = null;
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) remoto = snap.data();
  } catch (err) {
    console.warn('[Cultivarnos] no se pudo leer configuracion remota:', err);
    return;
  }

  if (!remoto) {
    try { await setDoc(ref, subsetLocal); } catch (err) { console.warn('[Cultivarnos] no se pudo subir configuracion:', err); }
    return;
  }

  const localVacio = CAMPOS_CONFIGURACION_SINCRONIZABLES.every((c) => subsetLocal[c] == null);
  if (localVacio) {
    await window.DB.setConfiguracion(remoto);
  } else {
    try { await setDoc(ref, subsetLocal); } catch (err) { console.warn('[Cultivarnos] no se pudo subir configuracion:', err); }
  }
}

// ---------------------------------------------------------------------
// Exposición pública
// ---------------------------------------------------------------------

if (window.CultivarnosSync && window.CultivarnosSync.__esStubDePrueba) {
  console.info('[Cultivarnos] firebase-sync.js: se detectó un stub de prueba en window.CultivarnosSync — no se inicializa el Sync Engine real.');
} else {
  window.CultivarnosSync = {
    iniciar,
    detener,
    sincronizarAhora,
    obtenerEstado: () => estadoSync,
    onCambio(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    vincularHuertaLocal,
    descartarHuertaLocal,
  };
}
