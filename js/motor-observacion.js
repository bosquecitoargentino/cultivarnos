// motor-observacion.js — motor local, sin IA. Decide qué preguntar y
// cuándo, a partir de la biblioteca de preguntas y del historial real del
// cultivo. La interfaz (detalle.js) solo muestra lo que este módulo
// devuelve — nada de lógica agronómica en las vistas.

const ORDEN_ETAPAS = ['germinacion', 'plantula', 'crecimiento', 'floracion', 'produccion'];
const COOLDOWN_POR_DEFECTO = 5;

function diasEntreFechas(fechaIso, fechaActual) {
  // fechaIso siempre es fecha calendario (cultivo.fechaInicio / evento.fecha);
  // fechaActual puede llegar como Date (detalle.js pasa `new Date()`) o como
  // fecha calendario. aFechaLocal (utils.js) interpreta ambos en hora local,
  // nunca UTC — ver el comentario extenso en utils.js sobre por qué importa.
  const inicio = aFechaLocal(fechaIso);
  inicio.setHours(0, 0, 0, 0);
  const ref = aFechaLocal(fechaActual);
  ref.setHours(0, 0, 0, 0);
  return Math.round((ref - inicio) / (1000 * 60 * 60 * 24));
}

// Estima la etapa actual. Los eventos reales siempre tienen prioridad por
// sobre una estimación basada en días — si ya hay un evento de floración,
// no tiene sentido seguir preguntando cosas de germinación.
function estimarEtapa(cultivo, eventos, especieId, fechaActual) {
  const tipos = new Set(eventos.map((e) => e.tipo));

  if (tipos.has('cosecha')) return 'produccion';
  if (tipos.has('floracion')) return 'floracion';
  if (tipos.has('trasplante')) return 'crecimiento';
  if (tipos.has('germinacion')) return 'plantula';

  const dias = diasEntreFechas(cultivo.fechaInicio, fechaActual);
  const datos = especieId ? obtenerCultivoDataPorId(especieId) : null;
  const etapasDias = datos ? datos.etapas || {} : {};

  if (etapasDias.germinacionDias && dias <= etapasDias.germinacionDias[1]) return 'germinacion';
  if (etapasDias.trasplanteDias && dias <= etapasDias.trasplanteDias[1]) return 'plantula';
  if (etapasDias.floracionDias) {
    if (dias < etapasDias.floracionDias[0]) return 'crecimiento';
    if (dias <= etapasDias.floracionDias[1]) return 'floracion';
  }
  if (etapasDias.cosechaDias && dias >= etapasDias.cosechaDias[0]) return 'produccion';

  // Sin datos de días para esta especie (ej. especies agroforestales): un
  // valor por defecto razonable y neutro, no una regla estricta.
  if (dias <= 14) return 'germinacion';
  if (dias <= 40) return 'crecimiento';
  return 'produccion';
}

// Junta todas las respuestas ya dadas para este cultivo, tomando la más
// reciente por pregunta (los eventos vienen ordenados del más nuevo al más
// viejo, así que la primera aparición de cada preguntaId ya es la última).
function extraerRespuestasPrevias(eventos) {
  const mapa = new Map();
  eventos.forEach((e) => {
    if (!Array.isArray(e.respuestas)) return;
    e.respuestas.forEach((r) => {
      if (!mapa.has(r.preguntaId)) {
        mapa.set(r.preguntaId, { respuesta: r.respuesta, fecha: e.fecha });
      }
    });
  });
  return mapa;
}

// obtenerPreguntasActuales(cultivo, eventos, fechaActual, hemisferio, limite)
//
// hemisferio queda reservado para futuras preguntas con matiz estacional —
// no se usa todavía para filtrar nada en esta primera versión.
function obtenerPreguntasActuales(cultivo, eventos, fechaActual, hemisferio, limite = 4) {
  const especieId = identificarEspecie(cultivo.especie);
  const etapa = estimarEtapa(cultivo, eventos, especieId, fechaActual);
  const historial = extraerRespuestasPrevias(eventos);

  const pool = [];
  if (especieId && PREGUNTAS_CULTIVOS.especies[especieId]) {
    const deEtapa = PREGUNTAS_CULTIVOS.especies[especieId][etapa] || [];
    deEtapa.forEach((p) => pool.push({ ...p, origen: 'especie' }));
  }
  Object.entries(PREGUNTAS_CULTIVOS.generales).forEach(([categoria, lista]) => {
    lista.forEach((p) => pool.push({ ...p, categoria: p.categoria || categoria, origen: 'general' }));
  });

  const candidatas = pool.filter((p) => {
    const previa = historial.get(p.id);
    if (!previa) return true;
    if (p.resuelvePermanente && p.resuelvePermanente.includes(previa.respuesta)) return false;
    const dias = diasEntreFechas(previa.fecha, fechaActual);
    const cooldown = p.cooldownDias != null ? p.cooldownDias : COOLDOWN_POR_DEFECTO;
    return dias >= cooldown;
  });

  // Prioridad: preguntas específicas de la especie primero, y dentro de
  // cada grupo, las que nunca se respondieron antes de las que ya volvieron
  // por vencimiento del cooldown.
  candidatas.sort((a, b) => {
    if ((a.origen === 'especie') !== (b.origen === 'especie')) return a.origen === 'especie' ? -1 : 1;
    const aPrevia = historial.has(a.id) ? 1 : 0;
    const bPrevia = historial.has(b.id) ? 1 : 0;
    return aPrevia - bPrevia;
  });

  return { etapa, especieId, preguntas: candidatas.slice(0, limite) };
}

// ---------------------------------------------------------------------
// Recordatorios sugeridos (siempre con confirmación explícita — este
// motor solo describe la sugerencia, nunca crea nada por su cuenta).
// ---------------------------------------------------------------------

// Después de ciertos eventos manuales tiene sentido ofrecer un
// recordatorio de seguimiento puntual. Lista chica a propósito: se puede
// ampliar más adelante sin romper nada de lo que ya la usa.
const SUGERENCIAS_RECORDATORIO_EVENTO = {
  trasplante: { dias: 3, titulo: 'Revisar recuperación del trasplante' },
  poda: { dias: 7, titulo: 'Observar rebrote después de la poda' },
};

function sugerenciaRecordatorioPorEvento(tipoEvento) {
  return SUGERENCIAS_RECORDATORIO_EVENTO[tipoEvento] || null;
}

// Al crear un cultivo desde semilla, si la especie es reconocida y tiene
// datos de germinación, se puede ofrecer un primer seguimiento. El día
// elegido no es ni el mínimo ni el máximo de la ventana: un par de días
// después del mínimo, para dar margen sin dejar pasar la ventana entera.
function sugerenciaSeguimientoInicial(especieId, tipoInicio) {
  if (tipoInicio !== 'semilla' || !especieId) return null;
  const datos = obtenerCultivoDataPorId(especieId);
  const rango = datos && datos.etapas && datos.etapas.germinacionDias;
  if (!rango) return null;
  const dias = Math.min(rango[0] + 2, rango[1]);
  return { dias, titulo: 'Revisar germinación' };
}
