// fechas-compat.js — pequeño subconjunto de utils.js (cliente), copiado a
// mano (no vía el paso de predeploy, a diferencia de motor-observacion.js
// y compañía) porque utils.js mezcla estas funciones puras con DOM
// (modales, canvas, drag&drop) que no tiene sentido llevar a una Cloud
// Function. Son ~30 líneas estables (fecha calendario <-> Date en hora
// local, sin UTC) que motor-observacion.js necesita para poder correr acá
// tal cual corre en el navegador — ver la nota larga sobre esto en
// docs/firebase-architecture.md, sección Push Notifications.
//
// Si alguna de estas funciones cambia en utils.js, actualizar acá también
// (documentado a propósito como la única duplicación real de este
// mecanismo — todo lo demás del motor se comparte sin copiar lógica, ver
// motorLoader.js).

function normalizarTexto(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const RE_FECHA_CALENDARIO = /^\d{4}-\d{2}-\d{2}$/;

function esFechaCalendario(valor) {
  return typeof valor === 'string' && RE_FECHA_CALENDARIO.test(valor);
}

function parseLocalDate(fechaIso) {
  const [year, month, day] = fechaIso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function aFechaLocal(valor) {
  if (valor instanceof Date) return valor;
  if (esFechaCalendario(valor)) return parseLocalDate(valor);
  return new Date(valor);
}

// Necesaria porque motor-observacion.js asume que los eventos que recibe
// ya vienen "más nuevo primero" (mismo contrato que DB.getEventosByCultivo
// en el cliente) — sin esto, estimarEtapa()/extraerRespuestasPrevias()
// podrían tomar un evento viejo como si fuera el más reciente. Copiada
// literal de utils.js#compararEventosPorFecha.
function compararEventosPorFecha(a, b) {
  const porFecha = parseLocalDate(b.fecha) - parseLocalDate(a.fecha);
  if (porFecha !== 0) return porFecha;
  const porCreacion = new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  if (porCreacion !== 0) return porCreacion;
  return (b.id || 0) - (a.id || 0);
}

module.exports = { normalizarTexto, esFechaCalendario, parseLocalDate, aFechaLocal, compararEventosPorFecha };
