// motor-biblioteca.js — motor local, sin IA, sin DOM, sin IndexedDB.
//
// Dos responsabilidades:
//   1) Búsqueda y filtro sobre BIBLIOTECA_ESPECIES (data/biblioteca-especies.js)
//      para la vista Biblioteca.
//   2) Puente de compatibilidad hacia motor-estacional.js: para las
//      especies que ya están en la Biblioteca, motor-estacional.js lee la
//      ventana de siembra desde acá en vez de cultivos-data.js, para que
//      no existan dos calendarios distintos para la misma especie. Las
//      especies que todavía no están en la Biblioteca (batata, maíz, etc.)
//      siguen funcionando exactamente igual que antes, leyendo
//      cultivos-data.js directamente — nada de esto es obligatorio ni
//      rompe lo que ya había.

const CATEGORIAS_BIBLIOTECA = [
  { id: 'todos', label: 'Todos' },
  { id: 'fruto', label: 'Frutos' },
  { id: 'hoja', label: 'Hojas' },
  { id: 'raiz', label: 'Raíces' },
  { id: 'leguminosa', label: 'Leguminosas' },
  { id: 'aromatica', label: 'Aromáticas' },
  { id: 'servicio', label: 'Servicio' },
  { id: 'agroforestal', label: 'Agroforestales' },
];

function listarEspeciesBiblioteca() {
  return BIBLIOTECA_ESPECIES;
}

// Filtra por texto libre (nombre común o científico) y por categoría.
// categoriaId 'todos' (o vacío) no filtra por categoría.
function filtrarBiblioteca(query, categoriaId) {
  const norm = normalizarTexto(query);
  return BIBLIOTECA_ESPECIES.filter((esp) => {
    const enCategoria = !categoriaId || categoriaId === 'todos' || (esp.identidad.categorias || []).includes(categoriaId);
    if (!enCategoria) return false;
    if (!norm) return true;
    const nombre = normalizarTexto(esp.identidad.nombre);
    const cientifico = normalizarTexto(esp.identidad.nombreCientifico);
    return nombre.includes(norm) || cientifico.includes(norm);
  }).sort((a, b) => a.identidad.nombre.localeCompare(b.identidad.nombre, 'es'));
}

// ---------------------------------------------------------------------
// Calendario: el mes no es una frontera dura. En vez de "en ventana" /
// "fuera", devolvemos tres estados con lenguaje prudente — ninguno dice
// "no se puede sembrar", porque microclimas y condiciones locales pueden
// correr estas fechas bastante.
// ---------------------------------------------------------------------
const ETIQUETA_ESTADO_VENTANA = {
  en_ventana: 'Ventana habitual',
  cerca: 'Puede requerir protección',
  fuera: 'Fuera de la ventana típica',
};

function estadoVentanaMes(mes, meses) {
  if (!Array.isArray(meses) || !meses.length) return null;
  if (meses.includes(mes)) return 'en_ventana';
  const anterior = ((mes + 10) % 12) + 1; // mes - 1, ciclado 1-12
  const siguiente = (mes % 12) + 1; // mes + 1, ciclado 1-12
  if (meses.includes(anterior) || meses.includes(siguiente)) return 'cerca';
  return 'fuera';
}

function etiquetaVentanaMes(mes, meses) {
  const estado = estadoVentanaMes(mes, meses);
  return estado ? ETIQUETA_ESTADO_VENTANA[estado] : null;
}

// ---------- Puente hacia motor-estacional.js ----------

// Devuelve { hemisferioSur, hemisferioNorte } en el mismo formato que ya
// usa cultivos-data.js (arrays de meses 1-12 para almacigo/directa), a
// partir del calendario templado de la Biblioteca. hemisferioNorte queda
// en null si la especie no tiene un dato explícito para el Norte — el
// llamador sigue derivándolo desplazando 6 meses, igual que siempre.
// Devuelve null si la especie no está en la Biblioteca o todavía no tiene
// calendario templado cargado (ej. Tithonia solo tiene almácigo/esqueje).
function obtenerSiembraLibreria(especieId) {
  const especie = typeof getEspecie === 'function' ? getEspecie(especieId) : null;
  const templado = especie && especie.calendario && especie.calendario.templado;
  if (!templado || !templado.hemisferioSur) return null;
  return {
    hemisferioSur: templado.hemisferioSur,
    hemisferioNorte: templado.hemisferioNorte || null,
  };
}

// Días orientativos de trasplante, si la especie de la Biblioteca lo tiene
// cargado y lo recomienda. null si no aplica o no está cargado.
function obtenerTrasplanteDiasLibreria(especieId) {
  const especie = typeof getEspecie === 'function' ? getEspecie(especieId) : null;
  const t = especie && especie.siembra && especie.siembra.trasplante;
  if (!t || !t.recomendado || !t.diasOrientativos) return null;
  return t.diasOrientativos;
}

window.CATEGORIAS_BIBLIOTECA = CATEGORIAS_BIBLIOTECA;
window.listarEspeciesBiblioteca = listarEspeciesBiblioteca;
window.filtrarBiblioteca = filtrarBiblioteca;
window.etiquetaVentanaMes = etiquetaVentanaMes;
window.estadoVentanaMes = estadoVentanaMes;
window.obtenerSiembraLibreria = obtenerSiembraLibreria;
window.obtenerTrasplanteDiasLibreria = obtenerTrasplanteDiasLibreria;
