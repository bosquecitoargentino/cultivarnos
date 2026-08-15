// motor-espacios.js — motor local, sin IA. Resuelve "dónde están mis
// plantas hoy" a partir de los mismos datos que ya existen (cultivos +
// eventos) — sin store nuevo, sin duplicar ubicaciones en ningún lado.
//
// Tres responsabilidades:
//   1) Distribución actual de UN cultivo (dónde está repartido hoy).
//   2) Ubicaciones ya usadas en toda la app (para autocomplete).
//   3) Espacios: agrupar la distribución de TODOS los cultivos activos por
//      ubicación, para la vista "Espacios".
//
// "Bancal 2", "bancal 2" y "Bancal  2" son el mismo espacio: para comparar
// se usa normalizarTexto() (utils.js, ya existente — minúsculas, sin
// tildes, espacios colapsados). Para MOSTRAR se conserva el texto tal cual
// lo escribió la persona la primera vez (nunca se fuerza minúscula visual,
// punto 24 del pedido).

// Limpieza solo visual: recorta y colapsa espacios repetidos, sin tocar
// mayúsculas ni tildes — así "Línea  Norte " se guarda/muestra "Línea Norte".
function limpiarTextoUbicacion(texto) {
  return (texto || '').trim().replace(/\s+/g, ' ');
}

// Clave de comparación (no se muestra nunca): reutiliza normalizarTexto de
// utils.js, la misma función que ya usa toda la app para comparar texto
// libre sin depender de mayúsculas/tildes/espacios.
function claveUbicacion(texto) {
  return normalizarTexto(texto);
}

// ---------------------------------------------------------------------
// 1) Distribución actual de un cultivo.
//
// Si el cultivo tiene seguimiento cuantitativo activo (motor-siembra.js),
// esa distribución (semillero + cada destino con stock) YA ES la
// distribución real, con cantidades — se reutiliza tal cual, sin
// recalcular nada. Si no tiene seguimiento cuantitativo (ej. Romero
// comprado como plantín, sin cantidad cargada), la única ubicación
// conocida es cultivo.ubicacion, sin cantidad (punto 28: nunca asumir 1
// planta). Si el cultivo no tiene ninguna ubicación conocida, devuelve [].
// ---------------------------------------------------------------------
function obtenerDistribucionActual(cultivo, eventos) {
  const resumen = calcularResumenSiembra(cultivo, eventos);
  if (resumen.activo) {
    return resumen.distribucion.map((d) => ({ ubicacion: d.ubicacion, cantidad: d.cantidad, conCantidad: true }));
  }
  if (cultivo.ubicacion) {
    return [{ ubicacion: cultivo.ubicacion, cantidad: null, conCantidad: false }];
  }
  return [];
}

// ---------------------------------------------------------------------
// 2) Ubicaciones usadas alguna vez, en cualquier cultivo/evento — base del
// autocomplete (punto 25). Barre TODOS los cultivos (no solo los activos):
// un lugar usado el año pasado sigue siendo útil para autocompletar hoy.
// ---------------------------------------------------------------------
async function obtenerUbicacionesUsadas() {
  const cultivos = await DB.getAllCultivos();
  const eventosPorCultivo = await Promise.all(cultivos.map((c) => DB.getEventosByCultivo(c.id)));

  const vistos = new Map(); // clave -> texto original (primera vez que se vio)
  function registrar(texto) {
    const limpio = limpiarTextoUbicacion(texto);
    if (!limpio) return;
    const clave = claveUbicacion(limpio);
    if (!clave) return;
    if (!vistos.has(clave)) vistos.set(clave, limpio);
  }

  cultivos.forEach((c) => registrar(c.ubicacion));
  eventosPorCultivo.flat().forEach((e) => {
    if (e.tipo === 'trasplante' || e.tipo === 'siembra') registrar(e.destino);
    if (e.tipo === 'baja') registrar(e.destino);
    if (e.tipo === 'cosecha') registrar(e.ubicacion);
  });

  return Array.from(vistos.values()).sort((a, b) => a.localeCompare(b, 'es'));
}

// Arma un <datalist> HTML listo para insertar, con las ubicaciones ya
// usadas — mismo patrón en todos los formularios que piden ubicación,
// sin duplicar el markup a mano en cada vista.
function datalistUbicacionesHtml(id, opciones) {
  return `<datalist id="${id}">${(opciones || []).map((o) => `<option value="${escapeHtml(o)}"></option>`).join('')}</datalist>`;
}

// ---------------------------------------------------------------------
// 3) Espacios actuales: agrupa la distribución de todos los cultivos
// ACTIVOS (punto 33: por defecto, sin mezclar cultivos finalizados) por
// ubicación normalizada. Semillero no es un caso especial acá — cae solo
// como "un espacio más" porque motor-siembra.js ya lo representa como una
// entrada más de `distribucion` (punto 29 se resuelve gratis, reutilizando
// lo de arriba).
// ---------------------------------------------------------------------
async function obtenerEspaciosActuales() {
  const cultivos = await DB.getAllCultivos();
  const activos = cultivos.filter((c) => c.estado === 'activo');
  const eventosPorCultivo = await Promise.all(activos.map((c) => DB.getEventosByCultivo(c.id)));

  const espacios = new Map(); // clave -> { nombre, cultivos: [{cultivo, cantidad, conCantidad}], totalCantidad, totalConocido }

  activos.forEach((cultivo, i) => {
    const distribucion = obtenerDistribucionActual(cultivo, eventosPorCultivo[i]);
    distribucion.forEach((d) => {
      const nombre = limpiarTextoUbicacion(d.ubicacion);
      if (!nombre) return;
      const clave = claveUbicacion(nombre);
      if (!espacios.has(clave)) {
        espacios.set(clave, { clave, nombre, cultivos: [], totalCantidad: 0, totalConocido: true });
      }
      const espacio = espacios.get(clave);
      espacio.cultivos.push({ cultivo, cantidad: d.cantidad, conCantidad: d.conCantidad });
      if (d.conCantidad) espacio.totalCantidad += d.cantidad;
      else espacio.totalConocido = false; // al menos un cultivo ahí no tiene cantidad -> no mostramos un total inventado
    });
  });

  const lista = Array.from(espacios.values()).map((e) => ({
    clave: e.clave,
    nombre: e.nombre,
    cantidadCultivos: e.cultivos.length,
    // Si CUALQUIER cultivo del espacio no tiene cantidad, el total deja de
    // ser una cifra confiable — se omite en vez de mostrar un número que
    // subestima lo que realmente hay ahí (punto 27/28: "si no conocemos
    // cantidad, no inventar").
    totalCantidad: e.totalConocido ? e.totalCantidad : null,
    cultivos: e.cultivos.sort((a, b) => a.cultivo.especie.localeCompare(b.cultivo.especie, 'es')),
  }));

  lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return lista;
}

// Un único espacio por clave (para la ficha de espacio) — reutiliza
// obtenerEspaciosActuales() en vez de reimplementar el agrupamiento.
async function obtenerEspacioPorClave(clave) {
  const espacios = await obtenerEspaciosActuales();
  return espacios.find((e) => e.clave === clave) || null;
}

window.limpiarTextoUbicacion = limpiarTextoUbicacion;
window.claveUbicacion = claveUbicacion;
window.obtenerDistribucionActual = obtenerDistribucionActual;
window.obtenerUbicacionesUsadas = obtenerUbicacionesUsadas;
window.datalistUbicacionesHtml = datalistUbicacionesHtml;
window.obtenerEspaciosActuales = obtenerEspaciosActuales;
window.obtenerEspacioPorClave = obtenerEspacioPorClave;
