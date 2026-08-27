// motor-orden-cultivos.js — orden manual de las tarjetas en "Mis cultivos".
// Es una preferencia de PRESENTACIÓN, igual de espíritu que
// motor-home-layout.js: vive en localStorage, nunca toca el registro del
// cultivo en sí (nunca se llama a DB.updateCultivo por esto — el orden no
// es un dato agronómico). Guarda solo una lista de IDs.

const ORDEN_CULTIVOS_STORAGE_KEY = 'cultivarnos-orden-cultivos';

function obtenerOrdenCultivosGuardado() {
  try {
    const crudo = localStorage.getItem(ORDEN_CULTIVOS_STORAGE_KEY);
    if (!crudo) return null;
    const ids = JSON.parse(crudo);
    return Array.isArray(ids) ? ids : null;
  } catch (err) {
    return null;
  }
}

function guardarOrdenCultivosGuardado(ids) {
  try {
    localStorage.setItem(ORDEN_CULTIVOS_STORAGE_KEY, JSON.stringify(ids));
  } catch (err) {
    // Si el storage no está disponible (modo privado, cuota llena, etc.),
    // no rompemos nada — la próxima vez se vuelve a leer el orden por
    // defecto, igual que motor-home-layout.js.
  }
}

function restaurarOrdenCultivosPorDefecto() {
  try {
    localStorage.removeItem(ORDEN_CULTIVOS_STORAGE_KEY);
  } catch (err) {
    // idem arriba.
  }
}

// Aplica la preferencia guardada sobre la lista real de cultivos de hoy:
// - los que tienen una posición guardada van en ese orden;
// - los que no (cultivos nuevos, o el primer uso, sin preferencia todavía)
//   se agregan al final, en el orden por defecto de siempre (más reciente
//   primero) — nunca se inventan posiciones para ellos;
// - un id guardado de un cultivo que ya no existe simplemente se ignora.
function ordenarCultivosSegunPreferencia(cultivos) {
  const porDefecto = [...cultivos].sort((a, b) => aFechaLocal(b.fechaInicio) - aFechaLocal(a.fechaInicio));
  const ordenGuardado = obtenerOrdenCultivosGuardado();
  if (!ordenGuardado || !ordenGuardado.length) return porDefecto;

  const porId = new Map(porDefecto.map((c) => [c.id, c]));
  const resultado = [];
  const usados = new Set();
  ordenGuardado.forEach((id) => {
    const c = porId.get(id);
    if (c && !usados.has(id)) {
      resultado.push(c);
      usados.add(id);
    }
  });
  porDefecto.forEach((c) => {
    if (!usados.has(c.id)) resultado.push(c);
  });
  return resultado;
}
