// utils.js — helpers compartidos

const TIPO_INICIO_LABELS = {
  semilla: 'Semilla',
  plantin: 'Plantín',
  trasplante: 'Trasplante',
};

const EVENTO_TIPOS = [
  { value: 'observacion', label: 'Observación', icon: '👁️' },
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

// Crea un modal tipo "hoja" con animación de entrada/salida.
// Devuelve { backdrop, close } — usar close() en vez de backdrop.remove()
// para que la animación de salida se vea antes de sacarlo del DOM.
function createModal(innerHtml) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
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

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
