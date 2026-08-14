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

// Etiqueta del "bucket" de origen (lo que todavía no se movió a un destino
// final), según el método. 'directa' y 'trasplante' no tienen uno: en
// siembra directa lo germinado ya está en su lugar final, y en un cultivo
// que arrancó como "Trasplante" las unidades iniciales YA se consideran en
// destino desde el día 0 (ver calcularResumenSiembra). null = no aplica,
// la vista no debe mostrar ningún bucket de origen.
function etiquetaOrigen(metodo) {
  if (metodo === 'semillero') return 'Semillero';
  if (metodo === 'plantin') return 'Sin trasplantar';
  return null;
}

// Etiqueta de la cantidad inicial, adaptada al método (punto 6 del pedido:
// "evitar que todo diga siempre Sembradas").
function etiquetaCantidadInicial(metodo) {
  if (metodo === 'plantin') return 'plantines iniciales';
  if (metodo === 'trasplante') return 'plantas trasplantadas';
  return 'sembradas';
}

function calcularResumenSiembra(cultivo, eventos) {
  // DB.getEventosByCultivo devuelve más nuevo primero; acá necesitamos
  // orden cronológico (más viejo -> más nuevo) para que la Distribución
  // actual liste los destinos en el orden en que realmente ocurrieron los
  // trasplantes, no en el orden (arbitrario para esto) en que llegó la
  // lista. Mismo desempate que el resto de la app — ver utils.js.
  const lista = [...(eventos || [])].sort((a, b) => {
    const porFecha = parseLocalDate(a.fecha) - parseLocalDate(b.fecha);
    if (porFecha !== 0) return porFecha;
    const porCreacion = new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    if (porCreacion !== 0) return porCreacion;
    return (a.id || 0) - (b.id || 0);
  });
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

  // Un cultivo que arrancó como "Trasplante" ya tiene sus unidades iniciales
  // en destino desde el momento de la carga (nunca "esperando trasplante") —
  // se tratan como si hubiera existido un trasplante inicial al destino
  // guardado en el propio evento de siembra (ver nuevo.js / abrirModalAgregarSiembra,
  // que reutilizan el campo "Ubicación" del cultivo para esto, sin agregar un
  // campo nuevo al formulario).
  const yaEnDestinoDesdeInicio = metodo === 'trasplante';

  const eventosTrasplante = lista.filter((e) => e.tipo === 'trasplante' && e.cantidad != null);
  const trasplantadas = (yaEnDestinoDesdeInicio ? sembradas : 0) + eventosTrasplante.reduce((s, e) => s + e.cantidad, 0);

  const eventosBaja = lista.filter((e) => e.tipo === 'baja' && e.cantidad != null);
  const bajasOrigen = eventosBaja.filter((e) => e.origen !== 'destino').reduce((s, e) => s + e.cantidad, 0);
  const bajasDestino = eventosBaja.filter((e) => e.origen === 'destino').reduce((s, e) => s + e.cantidad, 0);
  const bajas = bajasOrigen + bajasDestino;

  const enOrigen = Math.max(0, germinadas - trasplantadas - bajasOrigen);
  const enDestino = Math.max(0, trasplantadas - bajasDestino);
  const pctGerminacion = !sinGerminacion && sembradas > 0 ? Math.round((germinadas / sembradas) * 100) : null;

  // Distribución por destino: cantidad trasplantada a cada uno (incluyendo,
  // para tipo "trasplante", el destino inicial), neta de las bajas
  // registradas específicamente en ESE destino (punto 5 del pedido) — así
  // "Bancal 2: 10" pasa a "Bancal 2: 8" cuando se registran 2 bajas ahí,
  // sin perder la trazabilidad de a dónde fueron esas 2 bajas.
  const destinosMap = new Map();
  if (yaEnDestinoDesdeInicio) {
    const destinoInicial = eventoSiembra.destino || 'Sin destino especificado';
    destinosMap.set(destinoInicial, sembradas);
  }
  eventosTrasplante.forEach((e) => {
    const key = e.destino || 'Sin destino especificado';
    destinosMap.set(key, (destinosMap.get(key) || 0) + e.cantidad);
  });
  eventosBaja
    .filter((e) => e.origen === 'destino' && e.destino && destinosMap.has(e.destino))
    .forEach((e) => {
      destinosMap.set(e.destino, Math.max(0, destinosMap.get(e.destino) - e.cantidad));
    });

  const muestraSemillero = metodo === 'semillero';
  const todoTrasplantado = muestraSemillero && germinadas > 0 && enOrigen === 0 && trasplantadas > 0;

  // La siembra directa ya está en su lugar final desde que germina — no
  // tiene sentido ofrecer "trasplante" como próxima acción (punto 6: "NO
  // ofrecer trasplante como acción inmediata incoherente"). El resto de los
  // métodos usan enOrigen (0 para "trasplante" por construcción, ver arriba).
  const permiteTrasplante = metodo !== 'directa';

  const origenLabel = etiquetaOrigen(metodo);
  const distribucion = [];
  if (origenLabel && enOrigen > 0) distribucion.push({ ubicacion: origenLabel, cantidad: enOrigen, tipo: 'origen' });
  Array.from(destinosMap.entries()).forEach(([destino, cantidad]) => {
    if (cantidad > 0) distribucion.push({ ubicacion: destino, cantidad, tipo: 'destino' });
  });

  return {
    activo: true,
    metodo,
    sinGerminacion,
    muestraSemillero,
    permiteTrasplante,
    origenLabel,
    etiquetaCantidadInicial: etiquetaCantidadInicial(metodo),
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
    distribucion,
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

// `destino` es opcional: cuando la baja ocurre en el lugar definitivo y el
// lote tiene más de un destino, hay que saber en CUÁL — la disponibilidad
// se valida contra ese destino puntual (resumen.destinos), no contra el
// total agregado, para no permitir de más en un destino puntual aunque
// sobre stock en otro (punto 5 del pedido).
function validarCantidadBaja(resumen, cantidad, origen, destino) {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return { ok: false, mensaje: 'Ingresá una cantidad mayor a 0.' };
  if (origen === 'destino' && destino) {
    const entrada = (resumen.destinos || []).find((d) => d.destino === destino);
    const disponible = entrada ? entrada.cantidad : 0;
    if (cantidad > disponible) {
      return {
        ok: false,
        mensaje: disponible > 0 ? `En ${destino} quedan ${disponible} disponibles.` : `No hay plantas disponibles en ${destino}.`,
      };
    }
    return { ok: true };
  }
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
    // fecha es 'YYYY-MM-DD': parseLocalDate (utils.js) evita el corrimiento
    // de día de `new Date(fecha)` en husos negativos como Argentina.
    const porFecha = parseLocalDate(a.fecha) - parseLocalDate(b.fecha);
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
        destino: e.origen === 'destino' ? (e.destino || null) : null,
        motivo: e.motivo || null,
        enOrigen: Math.max(0, germinadasAcum - trasplantadasAcum - bajasOrigenAcum),
      });
    }
  });

  return anotaciones;
}
