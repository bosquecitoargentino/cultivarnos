// motor-resumen.js — EL motor central de esta etapa. Única función capaz
// de mirar un cultivo + sus eventos y devolver "qué pasó con este cultivo"
// de forma estructurada. Ficha activa, cierre de ciclo y tarjeta
// compartible consumen este mismo objeto — ninguno de los tres vuelve a
// calcular total cosechado, número de cosechas, % de germinación, fotos u
// observaciones por su cuenta (ver pedido: "evitar inconsistencias
// futuras").
//
//   cultivo + eventos
//           ↓
//   generarResumenCultivo()
//           ↓
//     objeto resumen
//    ↙  ↓  ↘
// ficha cierre compartir
//
// Principio: el motor reporta TODO lo que puede calcular; las vistas
// deciden qué mostrar y qué omitir cuando no aplica (ej. un cultivo que
// arrancó como plantín nunca tuvo germinación — `siembra` sencillamente
// queda null, no se inventa "0 germinadas · 0%").

const MOTIVOS_FINALIZACION = [
  { value: 'fin_natural', label: 'Fin natural del ciclo' },
  { value: 'cosecha_completada', label: 'Cosecha completada' },
  { value: 'no_prospero', label: 'No prosperó' },
  { value: 'dano', label: 'Daño / pérdida' },
  { value: 'helada', label: 'Helada' },
  { value: 'reemplazado', label: 'Reemplazado' },
  { value: 'otro', label: 'Otro' },
];

function etiquetaMotivoFinalizacion(motivo) {
  const found = MOTIVOS_FINALIZACION.find((m) => m.value === motivo);
  return found ? found.label : null;
}

// Qué cuenta como "observación" (punto 15 del pedido): eventos donde la
// persona efectivamente miró y registró algo sobre el estado del cultivo —
// respuesta rápida/revisión guiada (tipo 'revision') u observación libre
// (tipo 'observacion'). Fotografía queda afuera a propósito: ya se cuenta
// aparte en `fotos`, y contarla también acá la duplicaría. Cosecha, poda,
// trasplante, etc. son acciones concretas, no observaciones — no deben
// inflar este número aunque casi siempre vengan acompañadas de mirar la
// planta.
function esEventoObservacion(evento) {
  return evento.tipo === 'observacion' || evento.tipo === 'revision';
}

function generarResumenCultivo(cultivo, eventos) {
  const lista = eventos || [];
  const resumenSiembra = calcularResumenSiembra(cultivo, lista);

  const cosechaEventos = lista.filter((e) => e.tipo === 'cosecha');
  const todasMediciones = cosechaEventos.flatMap((e) => e.mediciones || []);
  const produccion = todasMediciones.length ? sumarMedicionesCompatibles(todasMediciones) : [];
  const fechasCosecha = cosechaEventos.map((e) => e.fecha).filter(Boolean).sort();

  // Solo fotografías REALES del usuario (evento.fotoId apunta al store
  // `fotos`) — nunca la ilustración botánica predeterminada ni íconos,
  // que ni siquiera pasan por acá (punto 14).
  const fotos = lista.filter((e) => e.fotoId != null).length;
  const observaciones = lista.filter(esEventoObservacion).length;

  const finalizado = cultivo.estado === 'finalizado';
  const fechaFin = finalizado ? (cultivo.fechaFinalizado || null) : null;
  const diasSeguimiento = cultivo.fechaInicio
    ? diasEntreFechas(cultivo.fechaInicio, fechaFin || new Date())
    : null;

  return {
    cultivoId: cultivo.id,
    especie: cultivo.especie,
    variedad: cultivo.variedad || null,
    estado: cultivo.estado,
    fechaInicio: cultivo.fechaInicio,
    fechaFin,
    diasSeguimiento,

    // null si el cultivo nunca tuvo seguimiento cuantitativo cargado
    // (punto 13: no mostrar "0 semillas · 0 germinadas · 0%").
    siembra: resumenSiembra.activo ? {
      metodo: resumenSiembra.metodo,
      etiquetaCantidadInicial: resumenSiembra.etiquetaCantidadInicial,
      sinGerminacion: resumenSiembra.sinGerminacion,
      sembradas: resumenSiembra.sembradas,
      germinadas: resumenSiembra.germinadas,
      pctGerminacion: resumenSiembra.pctGerminacion,
      trasplantadas: resumenSiembra.trasplantadas,
      bajas: resumenSiembra.bajas,
    } : null,

    // Dónde está el lote HOY. La cosecha nunca toca esto (punto 10) — sale
    // pura de motor-siembra.js vía motor-espacios.js.
    distribucionActual: obtenerDistribucionActual(cultivo, lista),

    // null si nunca se registró ninguna cosecha — distinto de "cosechas
    // registradas pero sin cantidad cargada" (cantidad > 0, produccion: []).
    cosechas: cosechaEventos.length ? {
      cantidad: cosechaEventos.length,
      produccion, // [{valor, unidad, unidadLibre?}] ya sumado por magnitud compatible
      primeraFecha: fechasCosecha[0] || null,
      ultimaFecha: fechasCosecha[fechasCosecha.length - 1] || null,
    } : null,

    fotos,
    observaciones,

    // null si el cultivo sigue activo.
    finalizacion: finalizado ? {
      motivo: cultivo.motivoFinalizacion || null,
      motivoLabel: etiquetaMotivoFinalizacion(cultivo.motivoFinalizacion),
      nota: cultivo.notaFinalizacion || null,
    } : null,
  };
}

// Qué indicadores mostrar de un resumen ya generado, y en qué orden —
// UNA sola función para que la ficha ("Ciclo completado") y la futura
// tarjeta compartible (motor-tarjeta.js) elijan siempre lo mismo frente a
// los mismos datos. Omite por completo cualquier métrica que no aplique
// (punto 13 del pedido) en vez de mostrar un "0" inventado. El llamador
// decide cuántos de estos usar (la ficha puede mostrar todos los que
// haya; la tarjeta compartible recorta a 4-6 para no sobrecargar el
// diseño — ver motor-tarjeta.js).
function elegirIndicadoresCiclo(resumen) {
  const items = [];
  if (resumen.siembra) {
    items.push({ icon: '🌱', texto: `${resumen.siembra.sembradas} ${resumen.siembra.etiquetaCantidadInicial}` });
    if (!resumen.siembra.sinGerminacion) {
      const pct = resumen.siembra.pctGerminacion != null ? ` · ${resumen.siembra.pctGerminacion}%` : '';
      items.push({ icon: '🌿', texto: `${resumen.siembra.germinadas} germinadas${pct}` });
    }
    if (resumen.siembra.trasplantadas > 0) {
      items.push({ icon: '📍', texto: `${resumen.siembra.trasplantadas} trasplantadas` });
    }
    if (resumen.siembra.bajas > 0) {
      items.push({ icon: '❌', texto: `${resumen.siembra.bajas} baja${resumen.siembra.bajas === 1 ? '' : 's'}` });
    }
  }
  if (resumen.cosechas) {
    items.push({ icon: '🍅', texto: `${resumen.cosechas.cantidad} cosecha${resumen.cosechas.cantidad === 1 ? '' : 's'}` });
    if (resumen.cosechas.produccion.length && typeof formatearListaMediciones === 'function') {
      items.push({ icon: '⚖️', texto: `${formatearListaMediciones(resumen.cosechas.produccion)} cosechado${resumen.cosechas.produccion.length === 1 ? '' : 's'}` });
    }
  }
  if (resumen.fotos > 0) items.push({ icon: '📷', texto: `${resumen.fotos} foto${resumen.fotos === 1 ? '' : 's'}` });
  if (resumen.observaciones > 0) items.push({ icon: '👁️', texto: `${resumen.observaciones} observaci${resumen.observaciones === 1 ? 'ón' : 'ones'}` });
  return items;
}

window.MOTIVOS_FINALIZACION = MOTIVOS_FINALIZACION;
window.etiquetaMotivoFinalizacion = etiquetaMotivoFinalizacion;
window.esEventoObservacion = esEventoObservacion;
window.generarResumenCultivo = generarResumenCultivo;
window.elegirIndicadoresCiclo = elegirIndicadoresCiclo;
