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
  { value: 'poda', label: 'Poda', icon: '✂️' },
  { value: 'floracion', label: 'Floración', icon: '🌸' },
  { value: 'cosecha', label: 'Cosecha', icon: '🧺' },
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

function formatFecha(isoOrDate) {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatFechaCorta(isoOrDate) {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function diasDesde(fechaIso) {
  const inicio = new Date(fechaIso);
  inicio.setHours(0, 0, 0, 0);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diff = Math.round((hoy - inicio) / (1000 * 60 * 60 * 24));
  return diff;
}

function todayIsoDate() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().slice(0, 10);
}

function isVencido(fechaIso) {
  const f = new Date(fechaIso);
  f.setHours(23, 59, 59, 999);
  return f < new Date();
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
//      especie (biblioteca CULTIVOS_DATA -> campo `imagen`), resuelta a
//      partir de cultivo.especie con el mismo matcher que ya usa el
//      motor de observación (identificarEspecie) — nada de esto se
//      guarda en IndexedDB ni en el cultivo, se calcula al vuelo
//   3) si la especie no es reconocida, null — la vista cae a su ícono
//      de reemplazo actual (emoji), exactamente como hasta ahora
//
// Esta función NO decide qué mostrar en la sección "Fotos": esa sigue
// viniendo pura de DB.getFotosByCultivo (fotos reales únicamente).
async function obtenerImagenCultivo(cultivo, eventos) {
  const eventoConFoto = (eventos || []).find((e) => e.fotoId);
  if (eventoConFoto) {
    const url = await fotoUrlCache.getUrl(eventoConFoto.fotoId);
    if (url) return url;
  }
  if (typeof identificarEspecie !== 'function' || typeof obtenerCultivoDataPorId !== 'function') return null;
  const especieId = identificarEspecie(cultivo.especie);
  if (!especieId) return null;
  const datos = obtenerCultivoDataPorId(especieId);
  return (datos && datos.imagen) || null;
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

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
