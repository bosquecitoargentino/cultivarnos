// motor-movimientos.js — "Últimos movimientos" (Inicio): una fotografía
// rápida de la actividad reciente de la huerta, sin dashboard ni entidad
// nueva. Un movimiento es simplemente un evento existente (store
// 'eventos', ver db.js) leído y ordenado con un criterio — no hay ningún
// store nuevo acá.
//
// Reglas centrales del pedido, resueltas acá y solo acá:
//
//   1) Orden por FECHA REAL del acontecimiento (evento.fecha), nunca por
//      createdAt — ver compararEventosPorFecha (utils.js). Cargar hoy una
//      observación de 2022 no la vuelve "reciente".
//   2) Varios eventos que comparten evento.batchId (ej. un riego múltiple
//      — ver views/riego-multiple.js) se muestran como UN solo movimiento
//      agrupado ("Riego · 15 cultivos"), no repetidos cinco veces
//      ocupando toda la sección.

// Trae los últimos `limit` movimientos, ya agrupados y listos para pintar
// (con el nombre de especie resuelto solo para los que efectivamente se
// van a mostrar). No pagina ni pretende ser un historial completo — para
// eso ya existe el historial por cultivo (ver views/detalle.js).
async function getUltimosMovimientos(limit = 5) {
  const eventos = await DB.getAllEventos();
  if (!eventos.length) return [];

  // Separar eventos con batchId (posible grupo) de los sueltos. Un
  // "grupo" de un solo evento no es realmente un grupo (puede pasar si se
  // borró el resto de un lote a mano, punto de edición/borrado individual
  // aceptado como V1) — esos vuelven a tratarse como sueltos.
  const porBatch = new Map();
  const sueltos = [];
  eventos.forEach((e) => {
    if (e.batchId) {
      if (!porBatch.has(e.batchId)) porBatch.set(e.batchId, []);
      porBatch.get(e.batchId).push(e);
    } else {
      sueltos.push(e);
    }
  });

  const movimientos = sueltos.map((e) => ({
    batch: false,
    tipo: e.tipo,
    fecha: e.fecha,
    createdAt: e.createdAt,
    id: e.id,
    cultivoId: e.cultivoId,
  }));

  porBatch.forEach((grupo, batchId) => {
    if (grupo.length === 1) {
      const e = grupo[0];
      movimientos.push({ batch: false, tipo: e.tipo, fecha: e.fecha, createdAt: e.createdAt, id: e.id, cultivoId: e.cultivoId });
      return;
    }
    // Todos los eventos de un mismo batchId comparten fecha y tipo por
    // construcción (se crean juntos, en una sola transacción — ver
    // DB.addEventosMultiples). Se usa el más "reciente" del grupo como
    // representante para el desempate por createdAt/id del mismo día.
    const representante = grupo.reduce((max, e) => (compararEventosPorFecha(e, max) < 0 ? e : max));
    movimientos.push({
      batch: true,
      tipo: representante.tipo,
      fecha: representante.fecha,
      createdAt: representante.createdAt,
      id: representante.id,
      batchId,
      count: grupo.length,
    });
  });

  movimientos.sort(compararEventosPorFecha);
  const top = movimientos.slice(0, limit);

  // Resolver nombre de cultivo solo para los movimientos que efectivamente
  // se van a mostrar (nunca para los descartados) — evita leer más
  // cultivos de los necesarios en cada render de Inicio.
  const idsAResolver = [...new Set(top.filter((m) => !m.batch).map((m) => m.cultivoId))];
  const cultivos = await Promise.all(idsAResolver.map((id) => DB.getCultivo(id)));
  const cultivoPorId = new Map(cultivos.filter(Boolean).map((c) => [c.id, c]));

  return top.map((m) => {
    if (m.batch) return { ...m, cultivoNombre: null };
    const cultivo = cultivoPorId.get(m.cultivoId);
    return { ...m, cultivoNombre: cultivo ? cultivo.especie : 'Cultivo eliminado' };
  });
}
