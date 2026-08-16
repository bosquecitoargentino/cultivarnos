// utils.js — helpers compartidos

const TIPO_INICIO_LABELS = {
  semilla: 'Semilla',
  plantin: 'Plantín',
  trasplante: 'Trasplante',
};

const EVENTO_TIPOS = [
  { value: 'siembra', label: 'Siembra', icon: '🌰' },
  { value: 'observacion', label: 'Observación', icon: '👁️' },
  { value: 'revision', label: 'Revisión guiada', icon: '🔍' },
  { value: 'fotografia', label: 'Fotografía', icon: '📷' },
  { value: 'germinacion', label: 'Germinación', icon: '🌱' },
  { value: 'trasplante', label: 'Trasplante', icon: '🪴' },
  { value: 'baja', label: 'Baja / pérdida', icon: '💔' },
  { value: 'poda', label: 'Poda', icon: '✂️' },
  { value: 'floracion', label: 'Floración', icon: '🌸' },
  { value: 'cosecha', label: 'Cosecha', icon: '🧺' },
  { value: 'finalizacion', label: 'Cierre de ciclo', icon: '🏁' },
  { value: 'reactivacion', label: 'Reactivación', icon: '↩️' },
  { value: 'otro', label: 'Otro', icon: '📝' },
];

function eventoLabel(tipo) {
  const found = EVENTO_TIPOS.find((e) => e.value === tipo);
  return found ? found.label : tipo;
}

function eventoIcon(tipo) {
  const found = EVENTO_TIPOS.find((e) => e.value === tipo);
  return found ? found.icon : '📝';
}

// Normaliza texto libre para poder compararlo/buscarlo sin depender de
// mayúsculas, tildes o espacios extra (ej. "Tomate  Cherry" -> "tomate cherry").
function normalizarTexto(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------
// Fechas: distinción central entre "fecha calendario" y "timestamp".
//
//   - fecha calendario: string 'YYYY-MM-DD', SIN hora. Así se guardan
//     cultivo.fechaInicio, evento.fecha y recordatorio.fecha — representan
//     un DÍA, no un instante.
//   - timestamp: string ISO completo con hora (createdAt, updatedAt,
//     config.ultimoRespaldo) — representa un instante real, no un día de
//     calendario.
//
// El bug a evitar: `new Date("2026-08-14")` interpreta ese string como
// medianoche UTC (spec ISO 8601). En un huso horario negativo como
// America/Argentina/Buenos_Aires (UTC-3), medianoche UTC del 14 es las
// 21:00 del día 13 en hora local — así que `.getDate()`,
// `.toLocaleDateString()` o cualquier lectura en hora local de ese Date
// devuelven el 13, no el 14. Lo mismo al revés: `date.toISOString().slice(0,10)`
// sobre un Date armado en hora local corre el día hacia adelante si son
// las 21:00-23:59 locales (porque cruza la medianoche UTC).
//
// parseLocalDate/formatIsoDateLocal son el ÚNICO punto de conversión entre
// fecha calendario <-> Date en toda la app, y trabajan siempre en hora
// LOCAL. Nada más en el código debería llamar `new Date(fechaCalendario)`
// ni `algunDate.toISOString().slice(0, 10)` para fechas de calendario.
// ---------------------------------------------------------------------

const RE_FECHA_CALENDARIO = /^\d{4}-\d{2}-\d{2}$/;

function esFechaCalendario(valor) {
  return typeof valor === 'string' && RE_FECHA_CALENDARIO.test(valor);
}

// 'YYYY-MM-DD' -> Date a medianoche LOCAL de ese día (nunca UTC).
function parseLocalDate(fechaIso) {
  const [year, month, day] = fechaIso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Date -> 'YYYY-MM-DD' a partir de los componentes LOCALES. Nunca usar
// toISOString() para esto: siempre serializa en UTC y puede correr el día.
function formatIsoDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Convierte CUALQUIER valor de fecha guardado (calendario, timestamp, o ya
// un Date) a un objeto Date listo para mostrar/comparar en hora local. Este
// es el único lugar de la app que debería inspeccionar el formato.
function aFechaLocal(valor) {
  if (valor instanceof Date) return valor;
  if (esFechaCalendario(valor)) return parseLocalDate(valor);
  return new Date(valor);
}

// Suma (o resta, con N negativo) días de calendario a una fecha calendario
// sin pasar nunca por UTC. Reemplaza cualquier
// `new Date(f); d.setDate(d.getDate()+N); d.toISOString().slice(0,10)`.
function sumarDiasFecha(fechaIso, dias) {
  const d = parseLocalDate(fechaIso);
  d.setDate(d.getDate() + dias);
  return formatIsoDateLocal(d);
}

function todayIsoDate() {
  return formatIsoDateLocal(new Date());
}

function formatFecha(isoOrDate) {
  const d = aFechaLocal(isoOrDate);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatFechaCorta(isoOrDate) {
  const d = aFechaLocal(isoOrDate);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function diasDesde(fechaIso) {
  const inicio = aFechaLocal(fechaIso);
  inicio.setHours(0, 0, 0, 0);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diff = Math.round((hoy - inicio) / (1000 * 60 * 60 * 24));
  return diff;
}

// Recordatorios guardan fecha calendario: comparar como texto evita
// cualquier problema de huso horario (YYYY-MM-DD ordena igual como texto
// que cronológicamente). "Vencido" = el día ya pasó, no incluye hoy.
function isVencido(fechaIso) {
  if (esFechaCalendario(fechaIso)) return fechaIso < todayIsoDate();
  return aFechaLocal(fechaIso) < new Date();
}

// true si un recordatorio "toca hoy": ya venció o es para hoy mismo.
function esParaHoy(fechaIso) {
  return fechaIso <= todayIsoDate();
}

// Texto relativo compacto para fechas pasadas: Hoy / Ayer / Hace N días.
function textoRelativo(fechaIso) {
  const dias = diasDesde(fechaIso);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias > 1) return `Hace ${dias} días`;
  return formatFechaCorta(fechaIso);
}

// A partir de la lista de eventos de un cultivo (la que devuelve
// DB.getEventosByCultivo, ya ordenada de más nuevo a más viejo), arma el
// texto de "última observación", ignorando el evento de siembra inicial.
function textoUltimaObservacion(eventos) {
  const relevantes = (eventos || []).filter((e) => e.tipo !== 'siembra');
  if (!relevantes.length) return 'Sin observaciones todavía';
  return textoRelativo(relevantes[0].fecha);
}

function objectUrlCache() {
  const cache = new Map();
  return {
    async getUrl(fotoId) {
      if (!fotoId) return null;
      if (cache.has(fotoId)) return cache.get(fotoId);
      const foto = await DB.getFoto(fotoId);
      if (!foto) return null;
      const url = URL.createObjectURL(foto.blob);
      cache.set(fotoId, url);
      return url;
    },
  };
}

const fotoUrlCache = objectUrlCache();

// ---------------------------------------------------------------------
// Imagen representativa de un cultivo — única función reutilizable para
// resolver qué imagen mostrar en tarjetas, cabecera y miniaturas. Orden
// de prioridad, siempre el mismo, sin condiciones sueltas en las vistas:
//
//   1) la fotografía real más reciente (el primer evento con fotoId en
//      `eventos`, que ya viene ordenado de más nuevo a más viejo por
//      DB.getEventosByCultivo) — nunca se reemplaza una foto real
//   2) si no hay ninguna foto propia, la imagen predeterminada de la
//      especie (biblioteca CULTIVOS_DATA -> campo `imagen`, las ~28
//      especies piloto originales), resuelta a partir de cultivo.especie
//      con el mismo matcher que ya usa el motor de observación
//      (identificarEspecie) — nada de esto se guarda en IndexedDB ni en
//      el cultivo, se calcula al vuelo
//   3) si tampoco está ahí, la Biblioteca ampliada (~102 especies,
//      buscarEspecieBibliotecaPorNombre) -> campo visual.imagen — mismo
//      matcher por nombre/alias que ya usa la ficha de detalle para
//      linkear a la Biblioteca, reutilizado acá en vez de duplicarlo
//   4) si la especie no es reconocida en ninguna de las dos, null — la
//      vista cae a su ícono de reemplazo actual (emoji), exactamente
//      como hasta ahora
//
// Esta función NO decide qué mostrar en la sección "Fotos": esa sigue
// viniendo pura de DB.getFotosByCultivo (fotos reales únicamente).
async function obtenerImagenCultivo(cultivo, eventos) {
  const eventoConFoto = (eventos || []).find((e) => e.fotoId);
  if (eventoConFoto) {
    const url = await fotoUrlCache.getUrl(eventoConFoto.fotoId);
    if (url) return url;
  }
  if (typeof identificarEspecie === 'function' && typeof obtenerCultivoDataPorId === 'function') {
    const especieId = identificarEspecie(cultivo.especie);
    if (especieId) {
      const datos = obtenerCultivoDataPorId(especieId);
      if (datos && datos.imagen) return datos.imagen;
    }
  }
  if (typeof buscarEspecieBibliotecaPorNombre === 'function') {
    const especieBiblioteca = buscarEspecieBibliotecaPorNombre(cultivo.especie);
    if (especieBiblioteca && especieBiblioteca.visual && especieBiblioteca.visual.imagen) {
      return especieBiblioteca.visual.imagen;
    }
  }
  return null;
}

// Crea un modal tipo "hoja" con animación de entrada/salida.
// Devuelve { backdrop, close } — usar close() en vez de backdrop.remove()
// para que la animación de salida se vea antes de sacarlo del DOM.
function createModal(innerHtml, extraClass) {
  const backdrop = document.createElement('div');
  backdrop.className = extraClass ? `modal-backdrop ${extraClass}` : 'modal-backdrop';
  backdrop.innerHTML = innerHtml;
  document.body.appendChild(backdrop);

  requestAnimationFrame(() => requestAnimationFrame(() => backdrop.classList.add('open')));

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    backdrop.classList.remove('open');
    backdrop.classList.add('closing');
    setTimeout(() => backdrop.remove(), 220);
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  return { backdrop, close };
}

// Redimensiona y comprime una foto de cámara antes de guardarla en
// IndexedDB (una foto de celular moderna puede pesar 8-15 MB al original).
// Límite ~1600px de lado mayor y JPEG calidad 0.82: suficiente para ver
// detalle de la planta, sin inflar la base local. Solo afecta a fotos
// nuevas — las que ya están guardadas no se tocan.
function downscaleImage(file, maxSize = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', quality);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------
// Minibiblioteca de fotos: grilla de miniaturas + visor (lightbox).
// Ambas trabajan sobre la lista normalizada que devuelve
// DB.getFotosByCultivo (fotoId, eventoId, fecha, tipo, nota) — no crean
// ni duplican nada, solo la muestran.
// ---------------------------------------------------------------------

async function renderFotoGridHtml(fotos, limit) {
  const shown = limit ? fotos.slice(0, limit) : fotos;
  const items = await Promise.all(
    shown.map(async (f, i) => {
      const url = await fotoUrlCache.getUrl(f.fotoId);
      return `<button type="button" class="foto-grid-item" data-index="${i}" style="${url ? `background-image:url('${url}')` : ''}" aria-label="Ver foto"></button>`;
    })
  );
  return `<div class="foto-grid">${items.join('')}</div>`;
}

// Abre el visor grande sobre la lista completa de fotos del cultivo,
// arrancando en startIndex. Deslizar o usar las flechas navega entre ellas
// sin cerrar el visor, manteniendo fecha/tipo/nota de cada una.
async function openFotoLightbox(fotos, startIndex) {
  if (!fotos.length) return;
  let idx = Math.min(Math.max(startIndex, 0), fotos.length - 1);

  const { backdrop, close } = createModal(
    `
    <div class="lightbox-inner">
      <button type="button" id="lb-close" class="lightbox-close" aria-label="Cerrar">✕</button>
      <div class="lightbox-imgwrap" id="lb-imgwrap">
        <button type="button" id="lb-prev" class="lightbox-nav lightbox-prev" aria-label="Foto anterior">‹</button>
        <img id="lb-img" class="lightbox-img" alt="Fotografía del cultivo" />
        <button type="button" id="lb-next" class="lightbox-nav lightbox-next" aria-label="Foto siguiente">›</button>
      </div>
      <div class="lightbox-caption" id="lb-caption"></div>
    </div>
  `,
    'lightbox'
  );

  const img = backdrop.querySelector('#lb-img');
  const caption = backdrop.querySelector('#lb-caption');
  const prevBtn = backdrop.querySelector('#lb-prev');
  const nextBtn = backdrop.querySelector('#lb-next');
  const imgwrap = backdrop.querySelector('#lb-imgwrap');

  async function paint() {
    const f = fotos[idx];
    const url = await fotoUrlCache.getUrl(f.fotoId);
    if (url) img.src = url;
    caption.innerHTML = `
      <div class="lightbox-caption-head">
        <span>${eventoIcon(f.tipo)} ${eventoLabel(f.tipo)}</span>
        <span class="lightbox-caption-fecha">${formatFecha(f.fecha)}</span>
      </div>
      ${f.nota ? `<div class="lightbox-caption-nota">${escapeHtml(f.nota)}</div>` : ''}
      ${fotos.length > 1 ? `<div class="lightbox-counter">${idx + 1} / ${fotos.length}</div>` : ''}
    `;
    const multi = fotos.length > 1;
    prevBtn.classList.toggle('hidden', !multi);
    nextBtn.classList.toggle('hidden', !multi);
  }

  function show(newIdx) {
    idx = (newIdx + fotos.length) % fotos.length;
    paint();
  }

  backdrop.querySelector('#lb-close').addEventListener('click', close);
  prevBtn.addEventListener('click', () => show(idx - 1));
  nextBtn.addEventListener('click', () => show(idx + 1));

  let touchStartX = null;
  imgwrap.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  imgwrap.addEventListener('touchend', (e) => {
    if (touchStartX == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) {
      if (dx < 0) show(idx + 1); else show(idx - 1);
    }
    touchStartX = null;
  });

  function onKey(e) {
    if (e.key === 'ArrowLeft') show(idx - 1);
    else if (e.key === 'ArrowRight') show(idx + 1);
    else if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);
  const observer = new MutationObserver(() => {
    if (backdrop.classList.contains('closing')) {
      document.removeEventListener('keydown', onKey);
      observer.disconnect();
    }
  });
  observer.observe(backdrop, { attributes: true, attributeFilter: ['class'] });

  paint();
}

// ---------------------------------------------------------------------
// Versión de la app: la única fuente de verdad es la constante APP_VERSION
// dentro de sw.js (ver el comentario ahí para el porqué). Acá simplemente
// la consultamos en tiempo de ejecución vía postMessage, para que
// Configuración pueda mostrarla sin duplicar el número en ningún otro
// archivo.
function obtenerVersionApp() {
  return new Promise((resolve) => {
    if (!('serviceWorker' in navigator)) { resolve(null); return; }
    navigator.serviceWorker.ready
      .then((registration) => {
        const worker = registration.active;
        if (!worker) { resolve(null); return; }
        const channel = new MessageChannel();
        const timeout = setTimeout(() => resolve(null), 1500);
        channel.port1.onmessage = (event) => {
          clearTimeout(timeout);
          resolve((event.data && event.data.version) || null);
        };
        worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
      })
      .catch(() => resolve(null));
  });
}

// ---------------------------------------------------------------------
// Respaldo (exportar/importar) — únicas funciones que tocan esto, para no
// dispersar la misma lógica entre el menú superior y Configuración.
// exportarRespaldo() NO guarda una copia del backup en IndexedDB: solo
// anota la fecha/hora del último respaldo exitoso (config.ultimoRespaldo),
// para poder mostrarla en Configuración.
// ---------------------------------------------------------------------
async function exportarRespaldo() {
  const data = await DB.exportAll();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fecha = todayIsoDate();
  a.href = url;
  a.download = `cultivarnos-backup-${fecha}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  await DB.setConfiguracion({ ultimoRespaldo: new Date().toISOString() });
}

// ---------------------------------------------------------------------
// Validación de respaldos — antes de tocar IndexedDB nos aseguramos de que
// el archivo realmente tenga forma de respaldo de Cultivarnos. El orden es
// siempre: 1) leer  2) parsear  3) validar  4) recién ahí confirmar el
// reemplazo  5) importar. Nunca se limpia ningún store antes de que la
// validación termine correctamente — ver leerRespaldoDesdeArchivo.
//
// Se exige la mínima estructura reconocible (versión numérica, arrays en
// los campos centrales, forma coherente de cada registro) para distinguir
// un respaldo real de un JSON válido pero ajeno a la app (ej. "{}" o un
// archivo de otra herramienta). No se exigen campos nuevos (cantidad,
// destino, metodoSiembra, etc.) que un respaldo de una versión anterior
// legítimamente no tenga — esos siguen siendo opcionales.
// ---------------------------------------------------------------------
function validarRespaldo(data) {
  const invalido = () => ({ ok: false, mensaje: 'Este archivo no parece ser un respaldo válido de Cultivarnos. No se modificó ningún dato.' });

  if (!data || typeof data !== 'object' || Array.isArray(data)) return invalido();
  if (typeof data.version !== 'number' || !Number.isFinite(data.version) || data.version < 1) return invalido();
  if (!Array.isArray(data.cultivos)) return invalido();
  if (!Array.isArray(data.eventos)) return invalido();
  if (data.recordatorios !== undefined && !Array.isArray(data.recordatorios)) return invalido();
  if (data.fotos !== undefined && !Array.isArray(data.fotos)) return invalido();
  if (data.conversaciones !== undefined && !Array.isArray(data.conversaciones)) return invalido();
  if (data.configuracion !== undefined && (typeof data.configuracion !== 'object' || data.configuracion === null || Array.isArray(data.configuracion))) return invalido();
  // lotesPropagacion (Banco): agregado después de que ya había respaldos en
  // uso — igual que recordatorios/fotos/conversaciones, opcional en el
  // archivo (un respaldo viejo legítimamente no lo tiene) pero validado si
  // está presente.
  if (data.lotesPropagacion !== undefined && !Array.isArray(data.lotesPropagacion)) return invalido();

  const tieneId = (x) => typeof x.id === 'number' || typeof x.id === 'string';
  for (const c of data.cultivos) {
    if (!c || typeof c !== 'object' || !tieneId(c) || typeof c.especie !== 'string') return invalido();
  }
  for (const e of data.eventos) {
    if (!e || typeof e !== 'object' || !tieneId(e) || typeof e.cultivoId === 'undefined' || typeof e.tipo !== 'string' || typeof e.fecha !== 'string') return invalido();
  }
  for (const r of data.recordatorios || []) {
    if (!r || typeof r !== 'object' || typeof r.titulo !== 'string' || typeof r.fecha !== 'string') return invalido();
  }
  for (const f of data.fotos || []) {
    if (!f || typeof f !== 'object' || typeof f.dataUrl !== 'string') return invalido();
  }
  for (const l of data.lotesPropagacion || []) {
    if (!l || typeof l !== 'object' || !tieneId(l) || typeof l.tipoMaterial !== 'string') return invalido();
  }

  return { ok: true };
}

// Lee, parsea y valida un archivo de respaldo SIN tocar IndexedDB. Tira un
// Error con mensaje amigable si el archivo no es JSON válido o no tiene
// forma de respaldo de Cultivarnos, para que el llamador pueda mostrarlo y
// recién DESPUÉS (nunca antes) pedir confirmación de reemplazo.
async function leerRespaldoDesdeArchivo(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error('Este archivo no es un JSON válido. No se modificó ningún dato.');
  }
  const validacion = validarRespaldo(data);
  if (!validacion.ok) throw new Error(validacion.mensaje);
  return data;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
