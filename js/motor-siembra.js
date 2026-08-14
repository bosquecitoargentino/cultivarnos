// motor-siembra.js — motor local, sin IA. Deriva el seguimiento cuantitativo
// de un lote de siembra (sembradas / germinadas / en semillero / trasplantadas
// / bajas) a partir de los eventos reales del cultivo — no hay contadores
// guardados aparte, todo se recalcula cada vez que hace falta (ver el
// pedido original: "los eventos deberían ser la fuente de verdad").
//
// Un cultivo tiene seguimiento cuantitativo "activo" solo si su evento de
// siembra inicial tiene un campo `cantidad` cargado. Cultivos viejos, o
// nuevos donde la persona no cargó cantidad, simplemente no lo tienen —
// resumen.activo === false y ninguna vista debe asumir cantidad 1.
//
// Modelo de eventos (todos siguen viviendo en el store `eventos` que ya
// existía, sin store nuevo):
//   { tipo: 'siembra',     cantidad: 20 }                                 — al crear el cultivo
//   { tipo: 'germinacion', cantidad: 5  }                                 — NUEVAS germinaciones (delta, no total)
//   { tipo: 'trasplante',  cantidad: 10, destino: 'Bancal 2' }            — movimiento parcial
//   { tipo: 'baja',        cantidad: 2,  origen: 'origen'|'destino', motivo }

const METODO_SIEMBRA_LABELS = {
  semillero: 'Semillero',
  directa: 'Siembra directa',
  plantin: 'Plantín',
  trasplante: 'Trasplante',
};

const MOTIVOS_BAJA = [
  { value: 'no_prospero', label: 'No prosperó' },
  { value: 'dano', label: 'Daño' },
  { value: 'trasplante', label: 'Trasplante' },
  { value: 'frio', label: 'Frío' },
  { value: 'otro', label: 'Otro' },
];

function etiquetaMotivoBaja(motivo) {
  const found = MOTIVOS_BAJA.find((m) => m.value === motivo);
  return found ? found.label : null;
}

// Determina el método de siembra de un cultivo: metodoSiembra (solo se
// carga cuando tipoInicio === 'semilla', para elegir entre semillero y
// siembra directa) o, si no está, el propio tipoInicio para plantín/
// trasplante — sin campo nuevo para esos dos casos.
function obtenerMetodoSiembra(cultivo) {
  if (cultivo.metodoSiembra) return cultivo.metodoSiembra;
  if (cultivo.tipoInicio === 'plantin' || cultivo.tipoInicio === 'trasplante') return cultivo.tipoInicio;
  return null;
}

function calcularResumenSiembra(cultivo, eventos) {
  const lista = eventos || [];
  const eventoSiembra = lista.find((e) => e.tipo === 'siembra' && e.cantidad != null);
  if (!eventoSiembra) {
    return { activo: false };
  }

  const sembradas = eventoSiembra.cantidad;
  const metodo = obtenerMetodoSiembra(cultivo);
  // Plantín/trasplante: no hay etapa de germinación que la persona haya
  // presenciado — la cantidad inicial ya representa plantas vivas.
  const sinGerminacion = metodo === 'plantin' || metodo === 'trasplante';

  const germinadas = sinGerminacion
    ? sembradas
    : lista.filter((e) => e.tipo === 'germinacion' && e.cantidad != null).reduce((s, e) => s + e.cantidad, 0);

  const eventosTrasplante = lista.filter((e) => e.tipo === 'trasplante' && e.cantidad != null);
  const trasplantadas = eventosTrasplante.reduce((s, e) => s + e.cantidad, 0);

  const eventosBaja = lista.filter((e) => e.tipo === 'baja' && e.cantidad != null);
  const bajasOrigen = eventosBaja.filter((e) => e.origen !== 'destino').reduce((s, e) => s + e.cantidad, 0);
  const bajasDestino = eventosBaja.filter((e) => e.origen === 'destino').reduce((s, e) => s + e.cantidad, 0);
  const bajas = bajasOrigen + bajasDestino;

  const enOrigen = Math.max(0, germinadas - trasplantadas - bajasOrigen);
  const enDestino = Math.max(0, trasplantadas - bajasDestino);
  const pctGerminacion = !sinGerminacion && sembradas > 0 ? Math.round((germinadas / sembradas) * 100) : null;

  const destinosMap = new Map();
  eventosTrasplante.forEach((e) => {
    const key = e.destino || 'Sin destino especificado';
    destinosMap.set(key, (destinosMap.get(key) || 0) + e.cantidad);
  });

  const muestraSemillero = metodo === 'semillero';
  const todoTrasplantado = muestraSemillero && germinadas > 0 && enOrigen === 0 && trasplantadas > 0;

  return {
    activo: true,
    metodo,
    sinGerminacion,
    muestraSemillero,
    sembradas,
    germinadas,
    trasplantadas,
    bajas,
    bajasOrigen,
    bajasDestino,
    enOrigen,
    enDestino,
    pctGerminacion,
    destinos: Array.from(destinosMap.entries()).map(([destino, cantidad]) => ({ destino, cantidad })),
    todoTrasplantado,
  };
}

// Un cultivo "puede" recibir datos de siembra retroactivos si su tipo de
// inicio admite el concepto (semilla/plantín/trasplante — no tiene mucho
// sentido para algo que ya se registró de otra forma) y todavía no tiene
// ningún dato cuantitativo cargado.
function puedeAgregarDatosSiembra(cultivo, resumen) {
  if (resumen.activo) return false;
  return ['semilla', 'plantin', 'trasplante'].includes(cultivo.tipoInicio);
}

// ---------------------------------------------------------------------
// Validaciones — evitan estados imposibles (punto 25 del pedido). Cada una
// devuelve { ok, mensaje }; nunca lanzan excepción, para poder mostrar el
// mensaje amigable directamente en el formulario.
// ---------------------------------------------------------------------

function validarCantidadGerminacion(resumen, cantidad) {
  if (resumen.sinGerminacion) return { ok: false, mensaje: 'Este cultivo no tiene etapa de germinación para registrar.' };
  if (!Number.isFinite(cantidad) || cantidad <= 0) return { ok: false, mensaje: 'Ingresá una cantidad mayor a 0.' };
  const restantes = resumen.sembradas - resumen.germinadas;
  if (cantidad > restantes) {
    return {
      ok: false,
      mensaje: restantes > 0
        ? `Como máximo pueden germinar ${restantes} más (ya germinaron ${resumen.germinadas} de ${resumen.sembradas}).`
        : `Ya está registrada la germinación de las ${resumen.sembradas} sembradas.`,
    };
  }
  return { ok: true };
}

function validarCantidadTrasplante(resumen, cantidad) {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return { ok: false, mensaje: 'Ingresá una cantidad mayor a 0.' };
  if (cantidad > resumen.enOrigen) {
    return {
      ok: false,
      mensaje: resumen.enOrigen > 0
        ? `Solo quedan ${resumen.enOrigen} disponibles para trasplantar.`
        : 'No quedan unidades disponibles para trasplantar.',
    };
  }
  return { ok: true };
}

function validarCantidadBaja(resumen, cantidad, origen) {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return { ok: false, mensaje: 'Ingresá una cantidad mayor a 0.' };
  const disponible = origen === 'destino' ? resumen.enDestino : resumen.enOrigen;
  if (cantidad > disponible) {
    return {
      ok: false,
      mensaje: disponible > 0 ? `Solo hay ${disponible} disponibles ahí.` : 'No hay unidades disponibles ahí.',
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------
// Historial narrativo: recorre los eventos en orden cronológico (más
// viejo -> más nuevo) y calcula, para cada evento cuantitativo, los
// totales acumulados hasta ese punto — así el historial cuenta la
// historia completa del lote (punto 22 del pedido) sin que la vista tenga
// que reimplementar la acumulación.
// ---------------------------------------------------------------------
function calcularAnotacionesHistorialSiembra(eventos) {
  // Orden cronológico explícito (más viejo -> más nuevo), con el mismo
  // desempate que DB.getEventosByCultivo (fecha -> createdAt -> id) — no
  // asumimos que `eventos` ya viene perfectamente ordenado, para que esta
  // función sea correcta incluso si varios eventos comparten fecha (sin
  // hora) por haberse cargado el mismo día.
  const cronologico = [...(eventos || [])].sort((a, b) => {
    const porFecha = new Date(a.fecha) - new Date(b.fecha);
    if (porFecha !== 0) return porFecha;
    const porCreacion = new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    if (porCreacion !== 0) return porCreacion;
    return (a.id || 0) - (b.id || 0);
  });
  const anotaciones = new Map();
  let sembradas = null;
  let germinadasAcum = 0;
  let trasplantadasAcum = 0;
  let bajasOrigenAcum = 0;

  cronologico.forEach((e) => {
    if (e.tipo === 'siembra' && e.cantidad != null) {
      sembradas = e.cantidad;
    } else if (e.tipo === 'germinacion' && e.cantidad != null) {
      germinadasAcum += e.cantidad;
      anotaciones.set(e.id, {
        tipo: 'germinacion',
        nuevas: e.cantidad,
        totalGerminadas: germinadasAcum,
        sembradas,
        pct: sembradas ? Math.round((germinadasAcum / sembradas) * 100) : null,
      });
    } else if (e.tipo === 'trasplante' && e.cantidad != null) {
      trasplantadasAcum += e.cantidad;
      anotaciones.set(e.id, {
        tipo: 'trasplante',
        cantidad: e.cantidad,
        destino: e.destino || null,
        enOrigen: Math.max(0, germinadasAcum - trasplantadasAcum - bajasOrigenAcum),
      });
    } else if (e.tipo === 'baja' && e.cantidad != null) {
      if (e.origen !== 'destino') bajasOrigenAcum += e.cantidad;
      anotaciones.set(e.id, {
        tipo: 'baja',
        cantidad: e.cantidad,
        origen: e.origen === 'destino' ? 'destino' : 'origen',
        motivo: e.motivo || null,
        enOrigen: Math.max(0, germinadasAcum - trasplantadasAcum - bajasOrigenAcum),
      });
    }
  });

  return anotaciones;
}
