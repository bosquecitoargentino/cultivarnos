// db.js — capa de acceso a IndexedDB para Cultivarnos
// Sin dependencias externas. Expone window.DB con métodos async.

const DB_NAME = 'cultivarnos';
const DB_VERSION = 3;

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
    };

    req.onsuccess = (event) => resolve(event.target.result);
    req.onerror = (event) => reject(event.target.error);
  });
  return dbPromise;
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
    const record = { ...data, createdAt: now };
    const id = await reqToPromise(store.add(record));
    return id;
  },

  async getEventosByCultivo(cultivoId) {
    const store = await tx('eventos');
    const index = store.index('cultivoId');
    const result = await reqToPromise(index.getAll(IDBKeyRange.only(cultivoId)));
    // Más nuevo primero. `fecha` es un día (sin hora), así que varios
    // eventos cargados el mismo día empatan ahí — desempatamos con
    // createdAt (timestamp real de carga) y, como último recurso, el id
    // autoincremental, para que el orden sea siempre determinístico y
    // realmente cronológico entre eventos del mismo día.
    return result.sort((a, b) => {
      const porFecha = new Date(b.fecha) - new Date(a.fecha);
      if (porFecha !== 0) return porFecha;
      const porCreacion = new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      if (porCreacion !== 0) return porCreacion;
      return (b.id || 0) - (a.id || 0);
    });
  },

  async updateEvento(id, changes) {
    const store = await tx('eventos', 'readwrite');
    const existing = await reqToPromise(store.get(id));
    if (!existing) throw new Error('Evento no encontrado');
    const updated = { ...existing, ...changes };
    await reqToPromise(store.put(updated));
    return updated;
  },

  async deleteEvento(id) {
    const store = await tx('eventos', 'readwrite');
    return reqToPromise(store.delete(id));
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
    const record = { ...data, estado: data.estado || 'pendiente', createdAt: now };
    const id = await reqToPromise(store.add(record));
    return id;
  },

  async updateRecordatorio(id, changes) {
    const store = await tx('recordatorios', 'readwrite');
    const existing = await reqToPromise(store.get(id));
    if (!existing) throw new Error('Recordatorio no encontrado');
    const updated = { ...existing, ...changes };
    await reqToPromise(store.put(updated));
    return updated;
  },

  async getRecordatoriosByCultivo(cultivoId) {
    const store = await tx('recordatorios');
    const index = store.index('cultivoId');
    const result = await reqToPromise(index.getAll(IDBKeyRange.only(cultivoId)));
    return result.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  },

  async getRecordatoriosPendientes() {
    const store = await tx('recordatorios');
    const index = store.index('estado');
    const result = await reqToPromise(index.getAll(IDBKeyRange.only('pendiente')));
    return result.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
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

  // ---------- EXPORT / IMPORT ----------
  async exportAll() {
    const [cultivos, eventos, recordatorios, configuracion, conversaciones] = await Promise.all([
      this.getAllCultivos(),
      (async () => {
        const store = await tx('eventos');
        return reqToPromise(store.getAll());
      })(),
      (async () => {
        const store = await tx('recordatorios');
        return reqToPromise(store.getAll());
      })(),
      this.getConfiguracion(),
      (async () => {
        const store = await tx('conversaciones');
        return reqToPromise(store.getAll());
      })(),
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
    const storeNames = ['cultivos', 'eventos', 'recordatorios', 'fotos', 'configuracion', 'conversaciones'];
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
