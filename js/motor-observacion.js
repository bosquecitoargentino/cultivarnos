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

// obtenerSugerenciaCultivo(cultivo, eventos, fechaActual, hemisferio, opts)
//
// Reemplaza a la vieja obtenerPreguntasActuales (que devolvía un lote de
// preguntas para armar una "sesión" de revisión). Esta versión devuelve
// UNA sola sugerencia — o null si no hay ninguna pertinente ahora mismo —
// porque la interfaz dejó de mostrar cuestionarios (ver
// views/detalle.js#pintarSugerenciaObservacion): la persona pide una
// sugerencia, recibe una pregunta, y ahí termina la interacción.
//
// hemisferio queda reservado para futuras preguntas con matiz estacional —
// no se usa todavía para filtrar nada en esta primera versión (igual que
// en la función que reemplaza).
//
// opts.excluirIds: ids de pregunta a evitar SOLO en este llamado puntual
// (lo usa "Otra sugerencia" para no repetir la que se acaba de mostrar en
// esta misma visita). Se combina con cultivo.sugerenciasRecientes — la
// memoria corta y persistida entre visitas (punto 8 del pedido: variar en
// vez de repetir la misma pregunta apenas se vuelve a entrar) — sin crear
// ningún subsistema de tracking nuevo: es un campo más sobre el mismo
// registro de `cultivos` que ya existía (ver DB_VERSION, sin cambios).
//
// Fuentes candidatas, de mayor a menor prioridad (punto 10 del pedido —
// especie > etapa/eventos reales [ya aplicado al elegir `etapa` vía
// estimarEtapa] > historial/cooldown > variedad reciente > contexto
// disponible):
//   a) PREGUNTAS_CULTIVOS.especies[id][etapa]     — origen 'especie'
//      (banco interactivo curado, ~28 especies, con opciones/cooldown/
//      resuelvePermanente propios)
//   b) Biblioteca: especie.etapas[etapa].observar — origen 'biblioteca-etapa'
//      (~102 especies, texto narrativo). Si la etapa horticultura estándar
//      que estimamos no existe para esta especie —caso de servicio/
//      agroforestales, que en la Biblioteca usan otro set de etapas
//      (establecimiento/crecimiento/acumulacion_biomasa/poda/rebrote, ver
//      comentario en estimarEtapa)— en vez de no ofrecer nada se cae a la
//      unión de TODAS las etapas de esa especie.
//   c) Biblioteca: ecologia.interaccionesAObservar — origen
//      'biblioteca-ecologia' (dimensión sistema: competencia, sombra,
//      espacio, plantas vecinas)
//   d) Biblioteca: cosecha.indicadoresMadurez, solo con etapa==='produccion'
//      — origen 'biblioteca-cosecha' (dimensión maduración/cosecha)
//   e) PREGUNTAS_CULTIVOS.generales.*             — origen 'general'
//      (siempre disponible; red de contención para que ninguna especie se
//      quede totalmente sin sugerencia posible)
function obtenerSugerenciaCultivo(cultivo, eventos, fechaActual, hemisferio, opts) {
  opts = opts || {};
  const especieId = identificarEspecie(cultivo.especie);
  const etapa = estimarEtapa(cultivo, eventos, especieId, fechaActual);
  const historial = extraerRespuestasPrevias(eventos);
  const especieBiblioteca = typeof buscarEspecieBibliotecaPorNombre === 'function'
    ? buscarEspecieBibliotecaPorNombre(cultivo.especie)
    : null;

  const pool = [];

  // a) especie (banco interactivo)
  if (especieId && PREGUNTAS_CULTIVOS.especies[especieId]) {
    const deEtapa = PREGUNTAS_CULTIVOS.especies[especieId][etapa] || [];
    deEtapa.forEach((p) => pool.push({ ...p, texto: p.texto, origen: 'especie' }));
  }

  // b) Biblioteca — qué observar de la etapa (con fallback a todas las
  // etapas cuando la especie usa un set de etapas no-estándar).
  if (especieBiblioteca && especieBiblioteca.etapas) {
    const etapas = especieBiblioteca.etapas;
    const clavesEtapas = Object.keys(etapas).filter((k) => k !== 'tipo');
    const bloqueEtapa = etapas[etapa];
    const entradas = (bloqueEtapa && Array.isArray(bloqueEtapa.observar) && bloqueEtapa.observar.length)
      ? bloqueEtapa.observar.map((texto) => ({ texto, etapaOrigen: etapa }))
      : clavesEtapas.reduce((acc, k) => {
          const arr = etapas[k] && Array.isArray(etapas[k].observar) ? etapas[k].observar : [];
          arr.forEach((texto) => acc.push({ texto, etapaOrigen: k }));
          return acc;
        }, []);
    entradas.forEach((e, i) => {
      pool.push({
        id: `bib-etapa-${especieBiblioteca.id}-${e.etapaOrigen}-${i}`,
        texto: e.texto,
        etiqueta: 'Qué observar',
        origen: 'biblioteca-etapa',
      });
    });
  }

  // c) Biblioteca — relación con el sistema (dimensión "Sistema" del
  // pedido: competencia, espacio disponible, plantas vecinas)
  if (especieBiblioteca && especieBiblioteca.ecologia && Array.isArray(especieBiblioteca.ecologia.interaccionesAObservar)) {
    especieBiblioteca.ecologia.interaccionesAObservar.forEach((texto, i) => {
      pool.push({
        id: `bib-eco-${especieBiblioteca.id}-${i}`,
        texto,
        etiqueta: 'Relación con el sistema',
        origen: 'biblioteca-ecologia',
      });
    });
  }

  // d) Biblioteca — señales de cosecha, solo si ya estamos en producción
  if (etapa === 'produccion' && especieBiblioteca && especieBiblioteca.cosecha && Array.isArray(especieBiblioteca.cosecha.indicadoresMadurez)) {
    especieBiblioteca.cosecha.indicadoresMadurez.forEach((texto, i) => {
      pool.push({
        id: `bib-cosecha-${especieBiblioteca.id}-${i}`,
        texto,
        etiqueta: 'Señales de cosecha',
        origen: 'biblioteca-cosecha',
      });
    });
  }

  // e) generales — siempre disponibles, prioridad más baja
  Object.entries(PREGUNTAS_CULTIVOS.generales).forEach(([categoria, lista]) => {
    lista.forEach((p) => pool.push({ ...p, texto: p.texto, categoria: p.categoria || categoria, origen: 'general' }));
  });

  const excluir = new Set([
    ...(opts.excluirIds || []),
    ...(Array.isArray(cultivo.sugerenciasRecientes) ? cultivo.sugerenciasRecientes : []),
  ]);

  const candidatas = pool.filter((p) => {
    if (excluir.has(p.id)) return false;
    const previa = historial.get(p.id);
    if (!previa) return true;
    if (p.resuelvePermanente && p.resuelvePermanente.includes(previa.respuesta)) return false;
    const dias = diasEntreFechas(previa.fecha, fechaActual);
    const cooldown = p.cooldownDias != null ? p.cooldownDias : COOLDOWN_POR_DEFECTO;
    return dias >= cooldown;
  });

  if (!candidatas.length) return null;

  // Dentro de las candidatas, nos quedamos con las del origen de mayor
  // prioridad presente, y elegimos al azar entre esas — así, si hay varias
  // preguntas de "especie" disponibles, no siempre sale la primera del
  // arreglo (punto 11: variedad).
  const ORDEN_ORIGEN = ['especie', 'biblioteca-etapa', 'biblioteca-ecologia', 'biblioteca-cosecha', 'general'];
  let mejorIdx = ORDEN_ORIGEN.length;
  candidatas.forEach((c) => {
    const idx = ORDEN_ORIGEN.indexOf(c.origen);
    if (idx >= 0 && idx < mejorIdx) mejorIdx = idx;
  });
  const top = candidatas.filter((c) => ORDEN_ORIGEN.indexOf(c.origen) === mejorIdx);
  const elegida = top[Math.floor(Math.random() * top.length)];

  return {
    idPregunta: elegida.id,
    pregunta: elegida.texto,
    categoria: elegida.etiqueta || elegida.categoria || null,
    etapa,
    origen: elegida.origen,
  };
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
