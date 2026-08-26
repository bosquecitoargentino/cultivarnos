// motor-home-layout.js — Personalización del orden y visibilidad de los
// bloques de Inicio. Fuente única de verdad de qué bloques existen hoy en
// Inicio y en qué orden se muestran por defecto — si en el futuro se agrega
// o se saca un bloque real de Inicio, ACÁ es el único lugar que hay que
// tocar (inicio.js lee todo esto, nunca hardcodea el orden).
//
// A propósito NO incluye "espacios": aunque es un ejemplo razonable de
// bloque, hoy "Espacios" es una pantalla propia (#/espacios) y no se pinta
// nada de eso en Inicio. Agregar un bloque que no existe hubiera violado la
// consigna explícita de no inventar bloques nuevos.
//
// Persistencia: localStorage (no hace falta IndexedDB para una preferencia
// de presentación tan chica). Nunca se guarda HTML ni contenido dinámico,
// solo la lista de ids + su visibilidad — así un bloque puede cambiar su
// contenido interno libremente sin que esto se entere ni se rompa.

const HOME_LAYOUT_STORAGE_KEY = 'cultivarnos-home-layout';

// Bloques reales que existen hoy en Inicio, en su orden actual (el que ya
// tenía la pantalla antes de esta funcionalidad). Este array es también el
// origen de DEFAULT_HOME_LAYOUT — un solo lugar, nunca duplicado.
const BLOQUES_HOME = [
  { id: 'recordatorios', label: 'Recordatorios' },
  { id: 'cultivos', label: 'Mis cultivos' },
  { id: 'sugerencia', label: 'Sugerencia para hoy' },
  { id: 'movimientos', label: 'Últimos movimientos' },
  { id: 'temporada', label: 'Esta temporada' },
];

const DEFAULT_HOME_LAYOUT = BLOQUES_HOME.map((b) => ({ id: b.id, visible: true }));

function etiquetaBloqueHome(id) {
  const bloque = BLOQUES_HOME.find((b) => b.id === id);
  return bloque ? bloque.label : id;
}

// Lee la preferencia guardada y la reconcilia con los bloques reales de hoy:
// - Si nunca se guardó nada (usuario nuevo, o storage vacío/corrupto), usa
//   el default tal cual.
// - Si hay ids guardados que ya no existen (un bloque se sacó de la app en
//   el futuro), se descartan silenciosamente — nunca rompen el render.
// - Si hay bloques nuevos que el usuario no tiene en su preferencia vieja
//   (se agregó un bloque en una versión futura), se agregan al final,
//   visibles por defecto — así Inicio nunca "pierde" contenido nuevo.
function obtenerHomeLayout() {
  let guardado = null;
  try {
    const crudo = localStorage.getItem(HOME_LAYOUT_STORAGE_KEY);
    if (crudo) guardado = JSON.parse(crudo);
  } catch (err) {
    guardado = null;
  }
  if (!Array.isArray(guardado) || guardado.length === 0) {
    return DEFAULT_HOME_LAYOUT.map((b) => ({ ...b }));
  }

  const idsValidos = new Set(BLOQUES_HOME.map((b) => b.id));
  const layout = guardado
    .filter((entrada) => entrada && idsValidos.has(entrada.id))
    .map((entrada) => ({ id: entrada.id, visible: entrada.visible !== false }));

  const idsPresentes = new Set(layout.map((e) => e.id));
  BLOQUES_HOME.forEach((b) => {
    if (!idsPresentes.has(b.id)) layout.push({ id: b.id, visible: true });
  });

  return layout;
}

function guardarHomeLayout(layout) {
  try {
    localStorage.setItem(HOME_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch (err) {
    // Almacenamiento no disponible (modo privado, cuota llena, etc.) — no
    // rompemos la app por esto, Inicio simplemente vuelve a leer el
    // default la próxima vez.
  }
}

function restaurarHomeLayoutPorDefecto() {
  try {
    localStorage.removeItem(HOME_LAYOUT_STORAGE_KEY);
  } catch (err) {
    // idem arriba — nada que hacer si el storage no está disponible.
  }
}
