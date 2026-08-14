// ia/contexto.js — arma el contexto compacto que se le manda a la IA.
//
// Principio importante (Parte 14/21 del pedido original): nunca mandar
// toda la base de datos. Cada función acá junta solo lo necesario para
// responder — eventos recientes, no todo el historial; un resumen de
// cultivos activos, no la ficha completa de cada uno.

// Contexto de un cultivo puntual: usado cuando la consulta arranca desde
// la ficha de esa planta (Etapa D en adelante).
async function construirContextoCultivo(cultivoId) {
  const cultivo = await DB.getCultivo(cultivoId);
  if (!cultivo) return '';

  const [eventos, recordatorios, config] = await Promise.all([
    DB.getEventosByCultivo(cultivoId),
    DB.getRecordatoriosByCultivo(cultivoId),
    DB.getConfiguracion(),
  ]);

  const dias = diasDesde(cultivo.fechaInicio);
  const eventosRecientes = eventos.slice(0, 8); // ya vienen del más nuevo al más viejo
  const recPendientes = recordatorios.filter((r) => r.estado === 'pendiente');

  const lineas = [];
  lineas.push(`Cultivo: ${cultivo.especie}${cultivo.variedad ? ' (' + cultivo.variedad + ')' : ''}`);
  lineas.push(`Inicio: ${TIPO_INICIO_LABELS[cultivo.tipoInicio] || cultivo.tipoInicio}`);
  lineas.push(`Fecha de inicio: ${formatFecha(cultivo.fechaInicio)}`);
  lineas.push(`Días desde inicio: ${dias}`);
  if (cultivo.ubicacion) lineas.push(`Ubicación registrada: ${cultivo.ubicacion}`);
  lineas.push(`Estado: ${cultivo.estado === 'finalizado' ? 'Finalizado' : 'Activo'}`);

  if (eventosRecientes.length) {
    lineas.push('');
    lineas.push('Eventos recientes:');
    eventosRecientes.forEach((e) => {
      lineas.push(`${formatFechaCorta(e.fecha)} - ${eventoLabel(e.tipo)}${e.nota ? ': ' + e.nota : ''}`);
    });
  }

  if (recPendientes.length) {
    lineas.push('');
    lineas.push('Recordatorios pendientes:');
    recPendientes.forEach((r) => lineas.push(`${formatFechaCorta(r.fecha)} - ${r.titulo}`));
  }

  if (config.hemisferio) {
    lineas.push('');
    lineas.push(`Temporada: Hemisferio ${config.hemisferio === 'sur' ? 'Sur' : 'Norte'}, ${nombreMes(new Date().getMonth() + 1)}`);
  }

  return lineas.join('\n');
}

// Contexto general de la huerta: un resumen por cultivo activo, no la
// ficha completa de cada uno. Pensado para "Preguntale a tu huerta"
// (Etapa F), pero queda listo desde ya.
async function construirContextoHuerta() {
  const [cultivos, config] = await Promise.all([DB.getAllCultivos(), DB.getConfiguracion()]);
  const activos = cultivos.filter((c) => c.estado === 'activo');

  if (!activos.length) {
    return 'No hay cultivos activos registrados todavía.';
  }

  const lineas = [`Cultivos activos: ${activos.length}`];
  if (config.hemisferio) {
    lineas.push(`Temporada: Hemisferio ${config.hemisferio === 'sur' ? 'Sur' : 'Norte'}, ${nombreMes(new Date().getMonth() + 1)}`);
  }
  lineas.push('');

  for (const c of activos) {
    const [eventos, recordatorios] = await Promise.all([
      DB.getEventosByCultivo(c.id),
      DB.getRecordatoriosByCultivo(c.id),
    ]);
    const dias = diasDesde(c.fechaInicio);
    const ultimaObs = textoUltimaObservacion(eventos);
    const pendientes = recordatorios.filter((r) => r.estado === 'pendiente').length;
    lineas.push(
      `- ${c.especie}${c.variedad ? ' (' + c.variedad + ')' : ''} · Día ${dias}` +
        `${c.ubicacion ? ' · ' + c.ubicacion : ''} · Última observación: ${ultimaObs}` +
        `${pendientes ? ` · ${pendientes} recordatorio(s) pendiente(s)` : ''}`
    );
  }

  return lineas.join('\n');
}

// Contexto de temporada solo (sin un cultivo puntual): preparado para
// cuando "Esta temporada" se redacte con IA (Etapa C). No se usa todavía
// en ninguna vista.
function construirContextoTemporada(hemisferio, mes) {
  if (!hemisferio) return '';
  const cal = obtenerCalendarioMes(hemisferio, mes);
  const lineas = [`Temporada: Hemisferio ${hemisferio === 'sur' ? 'Sur' : 'Norte'}, ${nombreMes(mes)}`];
  if (cal.almacigo.length) lineas.push(`Almácigo: ${cal.almacigo.map((c) => c.nombre).join(', ')}`);
  if (cal.directa.length) lineas.push(`Siembra directa: ${cal.directa.map((c) => c.nombre).join(', ')}`);
  if (cal.trasplante.length) lineas.push(`Trasplante aproximado: ${cal.trasplante.map((c) => c.nombre).join(', ')}`);
  return lineas.join('\n');
}
