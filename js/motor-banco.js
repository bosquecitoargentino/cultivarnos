// motor-banco.js — motor local del Banco de propagación, sin IA, sin DOM.
//
// El Banco responde una sola pregunta en esta primera versión: "¿qué
// material de propagación tengo guardado?" — semillas, bulbos, rizomas,
// tubérculos, dientes, cormos, estacas, esquejes, hijuelos, plantines u
// otro. La unidad de registro es el Lote (store `lotesPropagacion` en
// db.js), no "especie = cantidad total", porque un mismo cultivo puede
// tener lotes de orígenes distintos (semillas propias vs. compradas,
// cosechas de años distintos).
//
// A propósito NO hay acá: descuento automático al sembrar, "sembrar desde
// el banco", cruce con el calendario, estadísticas, alertas de
// vencimiento ni pruebas de germinación — todo eso queda pospuesto a una
// etapa posterior, una vez que se valide que esta memoria simple resulta
// cómoda de usar.

// ---------------------------------------------------------------------
// Catálogo central de tipos de material. `grupo` se usa solo para armar
// chips de filtro más simples en móvil (GRUPOS_FILTRO_BANCO); el tipo
// exacto siempre se conserva en el registro del lote, nunca se pierde
// información al agrupar visualmente.
// ---------------------------------------------------------------------
const TIPOS_MATERIAL_PROPAGACION = [
  { id: 'semilla', label: 'Semilla', labelPlural: 'semillas', icono: '🌰', grupo: 'semillas' },
  { id: 'bulbo', label: 'Bulbo', labelPlural: 'bulbos', icono: '🌷', grupo: 'subterraneo' },
  { id: 'rizoma', label: 'Rizoma', labelPlural: 'rizomas', icono: '🌱', grupo: 'subterraneo' },
  { id: 'tuberculo', label: 'Tubérculo', labelPlural: 'tubérculos', icono: '🥔', grupo: 'subterraneo' },
  { id: 'diente', label: 'Diente', labelPlural: 'dientes', icono: '🧄', grupo: 'subterraneo' },
  { id: 'cormo', label: 'Cormo', labelPlural: 'cormos', icono: '🌱', grupo: 'subterraneo' },
  { id: 'estaca', label: 'Estaca', labelPlural: 'estacas', icono: '🌿', grupo: 'vegetativo' },
  { id: 'esqueje', label: 'Esqueje', labelPlural: 'esquejes', icono: '🌿', grupo: 'vegetativo' },
  { id: 'hijuelo', label: 'Hijuelo', labelPlural: 'hijuelos', icono: '🌱', grupo: 'vegetativo' },
  { id: 'plantin', label: 'Plantín', labelPlural: 'plantines', icono: '🪴', grupo: 'vegetativo' },
  { id: 'otro', label: 'Otro', labelPlural: 'otros', icono: '🌱', grupo: 'otro' },
];

// Chips de filtro de la vista principal: 5 en vez de 11, agrupando los
// tipos que rara vez hace falta distinguir en una lista rápida. La
// clasificación EXACTA del lote nunca se pierde — esto es solo para el
// filtro visual (ver filtrarLotes).
const GRUPOS_FILTRO_BANCO = [
  { id: 'todos', label: 'Todos' },
  { id: 'semillas', label: 'Semillas' },
  { id: 'subterraneo', label: 'Órganos subterráneos' },
  { id: 'vegetativo', label: 'Propagación vegetativa' },
  { id: 'otro', label: 'Otros' },
];

const PROCEDENCIAS_LOTE = [
  { id: 'propia', label: 'Propias' },
  { id: 'comprada', label: 'Compradas' },
  { id: 'intercambio', label: 'Intercambio' },
  { id: 'regalo', label: 'Regalo' },
  { id: 'recuperada', label: 'Recuperadas' },
  { id: 'otra', label: 'Otra' },
];

const CANTIDADES_CUALITATIVAS = [
  { id: 'pocas', label: 'Pocas' },
  { id: 'media', label: 'Media' },
  { id: 'abundantes', label: 'Abundantes' },
];

function obtenerTipoMaterial(id) {
  return TIPOS_MATERIAL_PROPAGACION.find((t) => t.id === id) || null;
}

function obtenerProcedencia(id) {
  return PROCEDENCIAS_LOTE.find((p) => p.id === id) || null;
}

function unidadPorTipoMaterial(tipoMaterialId) {
  const tipo = obtenerTipoMaterial(tipoMaterialId);
  return tipo ? tipo.labelPlural : null;
}

// ---------------------------------------------------------------------
// Sugerencia de tipo de material probable para una especie, SOLO como
// preselección editable (punto 7 del pedido) — nunca una regla rígida.
// Primero mira un campo `identidad.materialesPropagacion` que hoy no
// existe en ninguna especie de la Biblioteca (punto 30: preparado para el
// futuro, sin tener que tocar las 123 fichas ahora). Si no está, cae a una
// tabla local chica con los ejemplos explícitos del pedido — no pretende
// cubrir las 123 especies, solo evita que los casos más obvios queden sin
// sugerencia.
// ---------------------------------------------------------------------
const SUGERENCIAS_TIPO_MATERIAL_POR_ESPECIE = {
  tomate: 'semilla',
  maiz: 'semilla',
  narciso: 'bulbo',
  ajo: 'diente',
  papa: 'tuberculo',
  jengibre: 'rizoma',
  curcuma: 'rizoma',
  gladiolo: 'cormo',
  tithonia: 'estaca',
  romero: 'esqueje',
  banano: 'hijuelo',
};

function sugerirTipoMaterialPorEspecie(especieId) {
  if (!especieId) return null;
  const especie = typeof getEspecie === 'function' ? getEspecie(especieId) : null;
  const desdeLibreria = especie && especie.identidad && Array.isArray(especie.identidad.materialesPropagacion)
    ? especie.identidad.materialesPropagacion[0]
    : null;
  if (desdeLibreria && obtenerTipoMaterial(desdeLibreria)) return desdeLibreria;
  return SUGERENCIAS_TIPO_MATERIAL_POR_ESPECIE[especieId] || null;
}

// ---------------------------------------------------------------------
// Cantidad: nunca se muestra más precisión de la que la persona cargó.
// "~120 semillas" tiene que seguir viéndose con el "~" siempre, y
// "cualitativa" nunca se convierte en un número.
// ---------------------------------------------------------------------
function formatearCantidadLote(lote) {
  const unidad = lote.unidad || (obtenerTipoMaterial(lote.tipoMaterial) || {}).labelPlural || '';
  if (lote.tipoCantidad === 'exacta' && lote.cantidad != null) {
    return unidad ? `${lote.cantidad} ${unidad}` : `${lote.cantidad}`;
  }
  if (lote.tipoCantidad === 'aproximada' && lote.cantidad != null) {
    return unidad ? `~${lote.cantidad} ${unidad}` : `~${lote.cantidad}`;
  }
  if (lote.tipoCantidad === 'cualitativa' && lote.cantidadCualitativa) {
    const c = CANTIDADES_CUALITATIVAS.find((x) => x.id === lote.cantidadCualitativa);
    return c ? c.label : 'Cantidad no registrada';
  }
  return 'Cantidad no registrada';
}

// Referencia temporal para mostrar: prioriza el año (fecha completa o solo
// año), sin inventar precisión que no se cargó.
function formatearReferenciaLote(lote) {
  if (lote.anioReferencia) return String(lote.anioReferencia);
  if (lote.fechaReferencia) return String(lote.fechaReferencia).slice(0, 4);
  return null;
}

// ---------------------------------------------------------------------
// Especie vinculada: a diferencia de cultivo.especie (texto libre resuelto
// por búsqueda difusa en tiempo de lectura), un lote guarda un especieId
// real cuando la especie existe en la Biblioteca — así se puede traer
// nombre/imagen/aliases sin duplicar esa información en el Banco (punto 29
// del pedido). nombreLibre es el fallback cuando la especie todavía no
// está cargada en la Biblioteca (punto 6).
// ---------------------------------------------------------------------
function resolverEspecieLote(lote) {
  if (lote.especieId) {
    const especie = typeof getEspecie === 'function' ? getEspecie(lote.especieId) : null;
    if (especie) {
      return { id: especie.id, nombre: especie.identidad.nombre, imagen: especie.visual && especie.visual.imagen ? especie.visual.imagen : null };
    }
  }
  return { id: null, nombre: lote.nombreLibre || 'Especie sin nombre', imagen: null };
}

// Clave estable de agrupación: especieId si existe, si no el nombre libre
// normalizado (para que "Zapallo de Juan" y "zapallo de juan" agrupen
// junto, igual que el resto de la app compara texto libre).
function claveAgrupacionLote(lote) {
  if (lote.especieId) return `id:${lote.especieId}`;
  return `libre:${normalizarTexto(lote.nombreLibre || '')}`;
}

// Punto 20 del pedido: agrupar por especie en la vista principal, con
// presentación compacta cuando hay más de un lote.
function agruparLotesPorEspecie(lotes) {
  const grupos = new Map();
  lotes.forEach((lote) => {
    const clave = claveAgrupacionLote(lote);
    if (!grupos.has(clave)) {
      grupos.set(clave, { clave, especie: resolverEspecieLote(lote), lotes: [] });
    }
    grupos.get(clave).lotes.push(lote);
  });
  const lista = Array.from(grupos.values());
  lista.forEach((g) => g.lotes.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
  lista.sort((a, b) => a.especie.nombre.localeCompare(b.especie.nombre, 'es'));
  return lista;
}

// Punto 21/22: búsqueda por especie (nombre + aliases de Biblioteca),
// variedad y tipo de material; filtro por grupo de tipo (conserva el tipo
// exacto en el registro, el grupo es solo un recorte del filtro).
function filtrarLotes(lotes, query, grupoFiltro) {
  const norm = normalizarTexto(query);
  return lotes.filter((lote) => {
    if (grupoFiltro && grupoFiltro !== 'todos') {
      const tipo = obtenerTipoMaterial(lote.tipoMaterial);
      if (!tipo || tipo.grupo !== grupoFiltro) return false;
    }
    if (!norm) return true;
    const especie = resolverEspecieLote(lote);
    if (normalizarTexto(especie.nombre).includes(norm)) return true;
    if (lote.variedad && normalizarTexto(lote.variedad).includes(norm)) return true;
    const tipo = obtenerTipoMaterial(lote.tipoMaterial);
    if (tipo && normalizarTexto(tipo.label).includes(norm)) return true;
    if (tipo && normalizarTexto(tipo.labelPlural).includes(norm)) return true;
    if (lote.especieId) {
      const especieBiblioteca = typeof getEspecie === 'function' ? getEspecie(lote.especieId) : null;
      const aliases = especieBiblioteca && especieBiblioteca.identidad ? especieBiblioteca.identidad.aliases || [] : [];
      if (aliases.some((a) => normalizarTexto(a).includes(norm))) return true;
    }
    return false;
  });
}

// Ubicaciones ya usadas en lotes existentes, para el autocomplete del
// campo "Ubicación física" — mismo patrón que obtenerUbicacionesUsadas()
// de motor-espacios.js, pero sobre el Banco. Reutiliza directamente
// datalistUbicacionesHtml() (ya genérico, no depende de cultivos).
async function obtenerUbicacionesLoteUsadas() {
  const lotes = await DB.getAllLotes();
  const vistos = new Map();
  lotes.forEach((l) => {
    const limpio = (l.ubicacionFisica || '').trim().replace(/\s+/g, ' ');
    if (!limpio) return;
    const clave = normalizarTexto(limpio);
    if (!clave) return;
    if (!vistos.has(clave)) vistos.set(clave, limpio);
  });
  return Array.from(vistos.values()).sort((a, b) => a.localeCompare(b, 'es'));
}

window.TIPOS_MATERIAL_PROPAGACION = TIPOS_MATERIAL_PROPAGACION;
window.GRUPOS_FILTRO_BANCO = GRUPOS_FILTRO_BANCO;
window.PROCEDENCIAS_LOTE = PROCEDENCIAS_LOTE;
window.CANTIDADES_CUALITATIVAS = CANTIDADES_CUALITATIVAS;
window.obtenerTipoMaterial = obtenerTipoMaterial;
window.obtenerProcedencia = obtenerProcedencia;
window.unidadPorTipoMaterial = unidadPorTipoMaterial;
window.sugerirTipoMaterialPorEspecie = sugerirTipoMaterialPorEspecie;
window.formatearCantidadLote = formatearCantidadLote;
window.formatearReferenciaLote = formatearReferenciaLote;
window.resolverEspecieLote = resolverEspecieLote;
window.agruparLotesPorEspecie = agruparLotesPorEspecie;
window.filtrarLotes = filtrarLotes;
window.obtenerUbicacionesLoteUsadas = obtenerUbicacionesLoteUsadas;
