// db.js — capa de acceso a IndexedDB para Cultivarnos
// Sin dependencias externas. Expone window.DB con métodos async.

// Nombre de la base física abierta actualmente. Antes de que exista el
// concepto de cuenta, es siempre 'cultivarnos' (el nombre de toda la vida
// — cualquier instalación existente sigue leyendo exactamente los mismos
// datos que ya tenía). Una vez que hay sesión, firebase-sync.js llama
// DB.usarBaseDeDatos(`cultivarnos-${uid}`) para que cada cuenta tenga su
// propia base física — así "un usuario nunca ve datos de otro en el mismo
// dispositivo" es una garantía estructural (bases separadas), no una
// convención de filtrado que un bug podría romper. La base 'cultivarnos'
// vieja queda intacta y sin tocar — es la "huerta local sin reclamar" que
// se ofrece vincular en el primer login (ver firebase-sync.js).
let DB_NAME = 'cultivarnos';
const DB_VERSION = 5;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('cultivos')) {
        const cultivos = db.createObjectStore('cultivos', { keyPath: 'id', autoIncrement: true });
        cultivos.createIndex('estado', 'estado', { unique: false });
      }

      if (!db.objectStoreNames.contains('eventos')) {
        const eventos = db.createObjectStore('eventos', { keyPath: 'id', autoIncrement: true });
        eventos.createIndex('cultivoId', 'cultivoId', { unique: false });
        eventos.createIndex('fecha', 'fecha', { unique: false });
      }

      if (!db.objectStoreNames.contains('recordatorios')) {
        const recordatorios = db.createObjectStore('recordatorios', { keyPath: 'id', autoIncrement: true });
        recordatorios.createIndex('cultivoId', 'cultivoId', { unique: false });
        recordatorios.createIndex('estado', 'estado', { unique: false });
        recordatorios.createIndex('fecha', 'fecha', { unique: false });
      }

      if (!db.objectStoreNames.contains('fotos')) {
        db.createObjectStore('fotos', { keyPath: 'id', autoIncrement: true });
      }

      // Configuración general de la app (hemisferio, ubicación aproximada,
      // y campos preparados para región/clima/suelo más adelante). Un
      // único registro con id fijo 'general'.
      if (!db.objectStoreNames.contains('configuracion')) {
        db.createObjectStore('configuracion', { keyPath: 'id' });
      }

      // Store creado para una función de IA que se canceló y no llegó a
      // usarse (ningún dispositivo tiene datos acá). Se deja declarado tal
      // cual, sin usarlo, en vez de borrarlo: si algún dispositivo ya pasó
      // por esta versión de la base, borrar el store implicaría una
      // migración destructiva innecesaria. No tiene ningún costo dejarlo
      // inerte.
      if (!db.objectStoreNames.contains('conversaciones')) {
        db.createObjectStore('conversaciones', { keyPath: 'id' });
      }

      // Banco de propagación (semillas, bulbos, rizomas, esquejes, etc.).
      // Store independiente de "cultivos" — un Lote no es un cultivo, es
      // material guardado. Sin índices por ahora: en V1 siempre se lista
      // todo y se agrupa/filtra en memoria (mismo criterio que ya usa
      // motor-espacios.js sobre cultivos), así que un índice acá solo
      // anticiparía una necesidad que todavía no existe.
      if (!db.objectStoreNames.contains('lotesPropagacion')) {
        db.createObjectStore('lotesPropagacion', { keyPath: 'id', autoIncrement: true });
      }

      // Cola de bajas pendientes de propagar a Firestore (tombstones). Un
      // registro acá se crea en el mismo momento en que algo se borra de
      // verdad de su store local (ver los hooks en deleteEventoCompleto/
      // deleteCultivoCompleto/deleteLoteCompleto más abajo) — nunca se lee
      // para nada de la UI normal, es pura correspondencia interna para
      // que firebase-sync.js sepa qué marcar {deleted:true} en la nube (en
      // vez de borrar el documento al instante, lo que dejaría a un
      // dispositivo offline con la posibilidad de "resucitarlo" sin
      // querer al reconectarse). Se borra de acá una vez que la baja ya se
      // confirmó escrita en Firestore.
      if (!db.objectStoreNames.contains('sincronizacionPendienteEliminar')) {
        db.createObjectStore('sincronizacionPendienteEliminar', { keyPath: 'id', autoIncrement: true });
      }
    };

    req.onsuccess = (event) => resolve(event.target.result);
    req.onerror = (event) => reject(event.target.error);
  });
  return dbPromise;
}

// Cambia qué base física de IndexedDB usa el resto de db.js — nada más.
// Todo el CRUD de acá abajo sigue siendo agnóstico de cuál esté abierta
// (siempre pasa por `tx()`/`openDB()`), así que este es el único lugar que
// necesitaba cambiar para que cada cuenta tenga su propia base
// (`cultivarnos-{uid}`) en vez de compartir la única 'cultivarnos' de
// siempre. Llamado por firebase-sync.js al iniciar sesión. Si ya está
// apuntando al nombre pedido, no hace nada (evita reabrir innecesariamente
// al re-llamar esto en cada boot con el mismo uid).
async function usarBaseDeDatos(nombre) {
  if (nombre === DB_NAME && dbPromise) return;
  if (dbPromise) {
    const dbActual = await dbPromise.catch(() => null);
    if (dbActual) dbActual.close();
  }
  DB_NAME = nombre;
  dbPromise = null;
  await openDB();
}

// Identidad de ESTE dispositivo/instalación (no de la cuenta) — un uuid
// generado una única vez y cacheado en localStorage. Sirve para que el id
// de documento en Firestore de una entidad creada acá sea determinístico
// (`${deviceId}__${id}`) sin necesidad de ninguna tabla de mapeo ni de
// tocar el id local en absoluto — ver la sección "IDs y colisión entre
// dispositivos" de docs/firebase-architecture.md para el razonamiento
// completo. Vive acá (no en firebase-sync.js) porque db.js también lo
// necesita para los hooks de tombstone de abajo, y así hay una sola fuente
// de verdad para los dos.
function obtenerDeviceId() {
  let id = localStorage.getItem('cultivarnos-device-id');
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    localStorage.setItem('cultivarnos-device-id', id);
  }
  return id;
}

// El id de documento remoto de un registro: si ya sabemos cuál es (porque
// se hidrató desde la nube, o ya se sincronizó antes) usamos ese; si no,
// lo derivamos de forma determinística. Nunca hace falta "buscarlo" en
// ningún lado.
function idRemotoDe(record) {
  return record._remoteId || `${obtenerDeviceId()}__${record.id}`;
}

// Encola una baja pendiente de propagar — ver el comentario del store de
// arriba. `store` es el nombre del store local ('cultivos'|'eventos'|
// 'recordatorios'|'lotesPropagacion'); `record` es el registro tal cual
// estaba justo antes de borrarlo (para poder derivar su id remoto incluso
// si nunca se había sincronizado todavía). Recibe la transacción activa
// para que la baja y su tombstone queden en la MISMA transacción que el
// borrado real — o se guardan los dos o no se guarda ninguno.
function encolarTombstone(t, storeName, record) {
  t.objectStore('sincronizacionPendienteEliminar').add({
    store: storeName,
    remoteId: idRemotoDe(record),
    localId: record.id,
    deletedAt: new Date().toISOString(),
  });
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const DB = {
  // ---------- CULTIVOS ----------
  async addCultivo(data) {
    const store = await tx('cultivos', 'readwrite');
    const now = new Date().toISOString();
    const record = { ...data, estado: data.estado || 'activo', createdAt: now, updatedAt: now };
    const id = await reqToPromise(store.add(record));
    return id;
  },

  async updateCultivo(id, changes) {
    const store = await tx('cultivos', 'readwrite');
    const existing = await reqToPromise(store.get(id));
    if (!existing) throw new Error('Cultivo no encontrado');
    const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
    await reqToPromise(store.put(updated));
    return updated;
  },

  async getCultivo(id) {
    const store = await tx('cultivos');
    return reqToPromise(store.get(id));
  },

  async getAllCultivos() {
    const store = await tx('cultivos');
    return reqToPromise(store.getAll());
  },

  async deleteCultivo(id) {
    const store = await tx('cultivos', 'readwrite');
    return reqToPromise(store.delete(id));
  },

  // ---------- EVENTOS ----------
  async addEvento(data) {
    const store = await tx('eventos', 'readwrite');
    const now = new Date().toISOString();
    // updatedAt acá es nuevo (antes un evento solo tenía createdAt) — es
    // aditivo, no cambia nada de cómo se ordenan/muestran los eventos
    // (eso sigue siendo por `fecha`, la fecha agronómica elegida por la
    // persona — ver compararEventosPorFecha en utils.js). Hace falta para
    // que la sincronización pueda resolver conflictos (last-write-wins).
    const record = { ...data, createdAt: now, updatedAt: now };
    const id = await reqToPromise(store.add(record));
    return id;
  },

  async getEventosByCultivo(cultivoId) {
    const store = await tx('eventos');
    const index = store.index('cultivoId');
    const result = await reqToPromise(index.getAll(IDBKeyRange.only(cultivoId)));
    // Más nuevo primero, por fecha real del acontecimiento — ver
    // compararEventosPorFecha (utils.js) para el criterio completo y por
    // qué NO es simplemente createdAt.
    return result.sort(compararEventosPorFecha);
  },

  // Todos los eventos de todos los cultivos, sin filtrar — base para
  // getUltimosMovimientos() (motor-movimientos.js, Inicio) y para
  // exportAll()/deleteEventoCompleto()/deleteCultivoCompleto() de acá
  // abajo, que antes repetían este mismo `tx('eventos'); getAll()` cada
  // una por su lado.
  async getAllEventos() {
    const store = await tx('eventos');
    return reqToPromise(store.getAll());
  },

  async updateEvento(id, changes) {
    const store = await tx('eventos', 'readwrite');
    const existing = await reqToPromise(store.get(id));
    if (!existing) throw new Error('Evento no encontrado');
    const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
    await reqToPromise(store.put(updated));
    return updated;
  },

  async deleteEvento(id) {
    const store = await tx('eventos', 'readwrite');
    return reqToPromise(store.delete(id));
  },

  // Crea varios eventos de una sola vez, todos en UNA MISMA transacción de
  // IndexedDB (ej. "Riego múltiple" — ver views/riego-multiple.js). Esto
  // es lo que garantiza el punto explícito del pedido "no dejar
  // silenciosamente 7 de 12 eventos creados sin explicarlo": si cualquiera
  // de los `add()` falla, la transacción entera aborta sola (comportamiento
  // estándar de IndexedDB) y ninguno de los eventos queda guardado — no
  // hace falta ningún rollback manual, es todo o nada por construcción.
  // `eventosData` son objetos de evento SIN id/createdAt (igual que
  // addEvento); devuelve los ids creados, en el mismo orden.
  async addEventosMultiples(eventosData) {
    const db = await openDB();
    const t = db.transaction('eventos', 'readwrite');
    const store = t.objectStore('eventos');
    const now = new Date().toISOString();
    const ids = [];
    eventosData.forEach((data) => {
      const req = store.add({ ...data, createdAt: now, updatedAt: now });
      req.onsuccess = () => ids.push(req.result);
    });
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(ids);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('No se pudo guardar el riego múltiple'));
    });
  },

  // ---------- BORRADO CENTRALIZADO (evita fotos huérfanas) ----------
  // Una fotografía puede quedar referenciada desde más de un lugar a la
  // vez: el evento que la originó Y, si fue la elegida al dar de alta el
  // cultivo, también desde cultivo.fotoId (nuevo.js reusa el mismo fotoId
  // para ambos). Por eso nunca se borra una foto solo porque se borra UN
  // evento — antes hay que confirmar que ninguna otra referencia siga viva.

  // Borra un evento y, si su fotografía queda sin ninguna otra referencia
  // (ni desde otro evento ni desde cultivo.fotoId), también la fotografía.
  // Todo en una única transacción: o se borra evento+foto juntos, o no se
  // borra nada.
  async deleteEventoCompleto(id) {
    const [evento, cultivos, todosLosEventos] = await Promise.all([
      (async () => { const s = await tx('eventos'); return reqToPromise(s.get(id)); })(),
      this.getAllCultivos(),
      this.getAllEventos(),
    ]);
    if (!evento) return false;

    let fotoABorrar = null;
    if (evento.fotoId != null) {
      const otraReferencia =
        cultivos.some((c) => c.fotoId === evento.fotoId) ||
        todosLosEventos.some((e) => e.id !== id && e.fotoId === evento.fotoId);
      if (!otraReferencia) fotoABorrar = evento.fotoId;
    }

    const db = await openDB();
    const storeNames = fotoABorrar != null
      ? ['eventos', 'fotos', 'sincronizacionPendienteEliminar']
      : ['eventos', 'sincronizacionPendienteEliminar'];
    const t = db.transaction(storeNames, 'readwrite');
    t.objectStore('eventos').delete(id);
    if (fotoABorrar != null) t.objectStore('fotos').delete(fotoABorrar);
    // Tombstone: la foto NO se sincroniza (ver docs/firebase-architecture.md),
    // así que solo el evento necesita propagar su baja a Firestore.
    encolarTombstone(t, 'eventos', evento);

    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Eliminación abortada'));
    });
  },

  // Borra un cultivo completo: el cultivo, todos sus eventos, todos sus
  // recordatorios, y las fotografías que le pertenecen exclusivamente (las
  // de sus eventos + la de cultivo.fotoId) — pero solo las que no queden
  // referenciadas desde algún cultivo/evento que NO se está borrando. Todo
  // en una única transacción IndexedDB: si algo falla, no queda un cultivo
  // "a medio borrar" (mitad eliminado, mitad vivo).
  async deleteCultivoCompleto(id) {
    const [cultivo, eventos, recordatorios, otrosCultivos, todosLosEventos] = await Promise.all([
      this.getCultivo(id),
      this.getEventosByCultivo(id),
      this.getRecordatoriosByCultivo(id),
      this.getAllCultivos(),
      this.getAllEventos(),
    ]);
    if (!cultivo) return false;

    const fotoIdsPropios = new Set();
    eventos.forEach((e) => { if (e.fotoId != null) fotoIdsPropios.add(e.fotoId); });
    if (cultivo.fotoId != null) fotoIdsPropios.add(cultivo.fotoId);

    const referenciadosFuera = new Set();
    otrosCultivos.filter((c) => c.id !== id).forEach((c) => { if (c.fotoId != null) referenciadosFuera.add(c.fotoId); });
    todosLosEventos.filter((e) => e.cultivoId !== id).forEach((e) => { if (e.fotoId != null) referenciadosFuera.add(e.fotoId); });

    const db = await openDB();
    const storeNames = ['cultivos', 'eventos', 'recordatorios', 'fotos', 'sincronizacionPendienteEliminar'];
    const t = db.transaction(storeNames, 'readwrite');
    t.objectStore('cultivos').delete(id);
    eventos.forEach((e) => t.objectStore('eventos').delete(e.id));
    recordatorios.forEach((r) => t.objectStore('recordatorios').delete(r.id));
    fotoIdsPropios.forEach((fotoId) => {
      if (!referenciadosFuera.has(fotoId)) t.objectStore('fotos').delete(fotoId);
    });
    // Tombstones: cultivo + cada evento/recordatorio que se va con él (las
    // fotos no se sincronizan, ver arriba).
    encolarTombstone(t, 'cultivos', cultivo);
    eventos.forEach((e) => encolarTombstone(t, 'eventos', e));
    recordatorios.forEach((r) => encolarTombstone(t, 'recordatorios', r));

    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Eliminación abortada'));
    });
  },

  // Minibiblioteca de fotos de un cultivo: no duplica nada, solo lee los
  // eventos que tienen foto y arma una lista normalizada (foto + contexto
  // del evento al que pertenece). Más reciente primero, igual que el
  // historial. Esta forma normalizada es también la base para poder
  // agregar comparación de fotos más adelante sin reestructurar nada.
  async getFotosByCultivo(cultivoId) {
    const eventos = await this.getEventosByCultivo(cultivoId);
    return eventos
      .filter((e) => e.fotoId)
      .map((e) => ({
        fotoId: e.fotoId,
        eventoId: e.id,
        cultivoId,
        fecha: e.fecha,
        tipo: e.tipo,
        nota: e.nota || null,
      }));
  },

  // ---------- CONFIGURACIÓN ----------
  // Se lee siempre con valores por defecto para que el resto de la app no
  // tenga que preocuparse por si el registro ya existe o no.
  async getConfiguracion() {
    const store = await tx('configuracion');
    const existing = await reqToPromise(store.get('general'));
    return {
      id: 'general',
      hemisferio: null,
      lat: null,
      lon: null,
      region: null,
      clima: null,
      tipoSuelo: null,
      ...existing,
    };
  },

  async setConfiguracion(cambios) {
    const actual = await this.getConfiguracion();
    const store = await tx('configuracion', 'readwrite');
    const actualizada = { ...actual, ...cambios, id: 'general' };
    await reqToPromise(store.put(actualizada));
    return actualizada;
  },

  // ---------- RECORDATORIOS ----------
  async addRecordatorio(data) {
    const store = await tx('recordatorios', 'readwrite');
    const now = new Date().toISOString();
    // updatedAt es nuevo acá (antes solo createdAt) — mismo motivo que en
    // addEvento: lo necesita la sincronización, no cambia nada existente.
    const record = { ...data, estado: data.estado || 'pendiente', createdAt: now, updatedAt: now };
    const id = await reqToPromise(store.add(record));
    return id;
  },

  async updateRecordatorio(id, changes) {
    const store = await tx('recordatorios', 'readwrite');
    const existing = await reqToPromise(store.get(id));
    if (!existing) throw new Error('Recordatorio no encontrado');
    const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
    await reqToPromise(store.put(updated));
    return updated;
  },

  // Todos los recordatorios, sin filtrar — usado por firebase-sync.js
  // (mismo criterio que getAllEventos/getAllLotes: el Sync Engine siempre
  // necesita la lista completa, no un subconjunto).
  async getAllRecordatorios() {
    const store = await tx('recordatorios');
    return reqToPromise(store.getAll());
  },

  async getRecordatoriosByCultivo(cultivoId) {
    const store = await tx('recordatorios');
    const index = store.index('cultivoId');
    const result = await reqToPromise(index.getAll(IDBKeyRange.only(cultivoId)));
    return result.sort((a, b) => parseLocalDate(a.fecha) - parseLocalDate(b.fecha));
  },

  async getRecordatoriosPendientes() {
    const store = await tx('recordatorios');
    const index = store.index('estado');
    const result = await reqToPromise(index.getAll(IDBKeyRange.only('pendiente')));
    return result.sort((a, b) => parseLocalDate(a.fecha) - parseLocalDate(b.fecha));
  },

  async deleteRecordatorio(id) {
    const store = await tx('recordatorios', 'readwrite');
    return reqToPromise(store.delete(id));
  },

  // ---------- FOTOS ----------
  async addFoto(blob) {
    const store = await tx('fotos', 'readwrite');
    const record = { blob, createdAt: new Date().toISOString() };
    const id = await reqToPromise(store.add(record));
    return id;
  },

  async getFoto(id) {
    const store = await tx('fotos');
    return reqToPromise(store.get(id));
  },

  async deleteFoto(id) {
    const store = await tx('fotos', 'readwrite');
    return reqToPromise(store.delete(id));
  },

  // ---------- BANCO (lotes de propagación) ----------
  async addLote(data) {
    const store = await tx('lotesPropagacion', 'readwrite');
    const now = new Date().toISOString();
    const record = { ...data, createdAt: now, updatedAt: now };
    const id = await reqToPromise(store.add(record));
    return id;
  },

  async updateLote(id, changes) {
    const store = await tx('lotesPropagacion', 'readwrite');
    const existing = await reqToPromise(store.get(id));
    if (!existing) throw new Error('Lote no encontrado');
    const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
    await reqToPromise(store.put(updated));
    return updated;
  },

  async getLote(id) {
    const store = await tx('lotesPropagacion');
    return reqToPromise(store.get(id));
  },

  async getAllLotes() {
    const store = await tx('lotesPropagacion');
    return reqToPromise(store.getAll());
  },

  // Borra un lote y, si tiene una foto propia, también la foto — el Banco
  // es independiente de cultivos/eventos, así que a diferencia de
  // deleteCultivoCompleto acá no hace falta chequear referencias cruzadas:
  // fotoId en un lote nunca se comparte con otro registro.
  async deleteLoteCompleto(id) {
    const lote = await this.getLote(id);
    if (!lote) return false;

    const db = await openDB();
    const storeNames = lote.fotoId != null
      ? ['lotesPropagacion', 'fotos', 'sincronizacionPendienteEliminar']
      : ['lotesPropagacion', 'sincronizacionPendienteEliminar'];
    const t = db.transaction(storeNames, 'readwrite');
    t.objectStore('lotesPropagacion').delete(id);
    if (lote.fotoId != null) t.objectStore('fotos').delete(lote.fotoId);
    encolarTombstone(t, 'lotesPropagacion', lote);

    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Eliminación abortada'));
    });
  },

  // ---------- SINCRONIZACIÓN (usado por firebase-sync.js) ----------
  // Nada de esto es dato de dominio — son ganchos chicos para que el Sync
  // Engine pueda hacer su trabajo sin que db.js necesite saber nada de
  // Firebase. db.js no importa ni referencia ningún archivo de
  // js/firebase/ — la dependencia va siempre en un solo sentido.

  // Cambia la base física activa — ver el comentario completo junto a
  // `usarBaseDeDatos()` más arriba en el archivo.
  async usarBaseDeDatos(nombre) {
    return usarBaseDeDatos(nombre);
  },

  obtenerNombreBaseActual() {
    return DB_NAME;
  },

  obtenerDeviceId() {
    return obtenerDeviceId();
  },

  // Guarda metadata de sincronización (`_remoteId`, `_syncStatus`,
  // `_syncedAt`) directamente sobre un registro existente, a propósito
  // SIN pasar por updateCultivo/updateEvento/etc. — esos siempre refrescan
  // `updatedAt` (correcto para ediciones reales de la persona), pero acá
  // el Sync Engine solo está anotando "ya empujé/bajé esto", y si eso
  // bumpeara `updatedAt` el registro se vería "modificado de nuevo" y
  // dispararía otro push en un loop infinito. `storeName` es el nombre
  // real del store ('cultivos'|'eventos'|'recordatorios'|'lotesPropagacion').
  async marcarMetaSincronizacion(storeName, id, meta) {
    const store = await tx(storeName, 'readwrite');
    const existing = await reqToPromise(store.get(id));
    if (!existing) return null;
    const updated = { ...existing, ...meta };
    await reqToPromise(store.put(updated));
    return updated;
  },

  // La cola de bajas pendientes de propagar (tombstones) — ver el
  // comentario del store en openDB(). `id` acá es el id propio de la fila
  // en `sincronizacionPendienteEliminar` (no el id de la entidad borrada).
  async getPendientesEliminar() {
    const store = await tx('sincronizacionPendienteEliminar');
    return reqToPromise(store.getAll());
  },

  async borrarPendienteEliminar(id) {
    const store = await tx('sincronizacionPendienteEliminar', 'readwrite');
    return reqToPromise(store.delete(id));
  },

  // Escribe un registro completo tal cual (incluido su `id`) sin pasar
  // por ninguna de las reglas de addX/updateX (que siempre pisan
  // createdAt/updatedAt con la hora actual — correcto para una edición
  // real de la persona, incorrecto acá). Uso exclusivo del Sync Engine
  // para hidratar en este dispositivo un registro que ya existe en la
  // nube (conserva su `id`, su `updatedAt` original, y su metadata de
  // sincronización tal cual venía). IndexedDB acepta un `put()` con key
  // explícita en un store `autoIncrement` sin problema — el contador
  // interno se ajusta solo si hace falta, no requiere ningún otro cambio.
  async upsertRegistroSincronizado(storeName, record) {
    const store = await tx(storeName, 'readwrite');
    await reqToPromise(store.put(record));
    return record;
  },

  // ---------- EXPORT / IMPORT ----------
  async exportAll() {
    const [cultivos, eventos, recordatorios, configuracion, conversaciones, lotesPropagacion] = await Promise.all([
      this.getAllCultivos(),
      this.getAllEventos(),
      (async () => {
        const store = await tx('recordatorios');
        return reqToPromise(store.getAll());
      })(),
      this.getConfiguracion(),
      (async () => {
        const store = await tx('conversaciones');
        return reqToPromise(store.getAll());
      })(),
      this.getAllLotes(),
    ]);

    const fotosStore = await tx('fotos');
    const fotosRaw = await reqToPromise(fotosStore.getAll());
    const fotos = await Promise.all(
      fotosRaw.map(async (f) => ({
        id: f.id,
        createdAt: f.createdAt,
        dataUrl: await blobToDataUrl(f.blob),
      }))
    );

    return {
      version: DB_VERSION,
      exportedAt: new Date().toISOString(),
      cultivos,
      eventos,
      recordatorios,
      fotos,
      configuracion,
      conversaciones,
      lotesPropagacion,
    };
  },

  async importAll(data, { replace = true } = {}) {
    // Convertimos las fotos (dataUrl -> Blob) ANTES de abrir la transacción:
    // fetch() es I/O real y si se espera dentro de una tx de IndexedDB, el
    // navegador la da por finalizada (TransactionInactiveError).
    const fotosConBlob = await Promise.all(
      (data.fotos || []).map(async (f) => ({
        id: f.id,
        createdAt: f.createdAt,
        blob: await dataUrlToBlob(f.dataUrl),
      }))
    );

    const db = await openDB();
    const storeNames = ['cultivos', 'eventos', 'recordatorios', 'fotos', 'configuracion', 'conversaciones', 'lotesPropagacion'];
    const t = db.transaction(storeNames, 'readwrite');

    if (replace) {
      storeNames.forEach((name) => t.objectStore(name).clear());
    }

    const fotosStore = t.objectStore('fotos');
    fotosConBlob.forEach((f) => fotosStore.put(f));

    const cultivosStore = t.objectStore('cultivos');
    (data.cultivos || []).forEach((c) => cultivosStore.put(c));

    const eventosStore = t.objectStore('eventos');
    (data.eventos || []).forEach((e) => eventosStore.put(e));

    const recordatoriosStore = t.objectStore('recordatorios');
    (data.recordatorios || []).forEach((r) => recordatoriosStore.put(r));

    // Respaldos anteriores a esta versión no tienen "configuracion" — no
    // pasa nada, el registro queda vacío y getConfiguracion() sigue
    // devolviendo los valores por defecto.
    if (data.configuracion) {
      const configStore = t.objectStore('configuracion');
      configStore.put({ ...data.configuracion, id: 'general' });
    }

    const conversacionesStore = t.objectStore('conversaciones');
    (data.conversaciones || []).forEach((c) => conversacionesStore.put(c));

    // Respaldos anteriores a esta función no tienen "lotesPropagacion" — no
    // pasa nada, el Banco queda vacío después de importar (mismo criterio
    // ya usado arriba para "configuracion").
    const lotesStore = t.objectStore('lotesPropagacion');
    (data.lotesPropagacion || []).forEach((l) => lotesStore.put(l));

    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Importación abortada'));
    });
  },
};

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

window.DB = DB;
