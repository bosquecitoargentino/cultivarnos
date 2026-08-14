// motor-estacional.js — motor local, sin IA.
//
// Solo calcula datos objetivos (ventanas de siembra por hemisferio y mes)
// a partir de la biblioteca de especies. No redacta ningún texto: la
// interfaz arma el mensaje con lo que este módulo devuelve. Pensado para
// que, más adelante, el asistente de IA pueda tomar esta misma
// información estructurada como base en vez de reinventar el cálculo.

const MESES_LABEL = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function nombreMes(mes) {
  return MESES_LABEL[mes] || '';
}

// Desplaza una lista de meses (1-12) seis meses hacia adelante — se usa
// para derivar la ventana del hemisferio Norte a partir de la del Sur
// cuando la especie no tiene un dato explícito cargado para el Norte.
function desplazarSeisMeses(meses) {
  return (meses || []).map((m) => ((m + 5) % 12) + 1).sort((a, b) => a - b);
}

function sumarMeses(mes, cantidad) {
  return (((mes - 1 + cantidad) % 12) + 12) % 12 + 1;
}

// { almacigo: [...], directa: [...] } resuelto para el hemisferio pedido.
function obtenerVentanaSiembra(cultivoData, hemisferio) {
  const siembra = cultivoData.siembra || {};
  const sur = siembra.hemisferioSur || { almacigo: [], directa: [] };
  if (hemisferio === 'norte') {
    if (siembra.hemisferioNorte) return siembra.hemisferioNorte;
    return {
      almacigo: desplazarSeisMeses(sur.almacigo),
      directa: desplazarSeisMeses(sur.directa),
    };
  }
  return sur;
}

// Ventana aproximada de trasplante: se deriva sumando al inicio del
// almácigo el promedio de trasplanteDias (convertido a meses). Es una
// estimación adicional, no un dato cargado — por eso se muestra siempre
// como "aproximado" en la interfaz.
function obtenerVentanaTrasplante(cultivoData, hemisferio) {
  const trasplanteDias = (cultivoData.etapas || {}).trasplanteDias;
  if (!trasplanteDias) return [];
  const almacigo = obtenerVentanaSiembra(cultivoData, hemisferio).almacigo || [];
  if (!almacigo.length) return [];
  const offsetMeses = Math.round(((trasplanteDias[0] + trasplanteDias[1]) / 2) / 30);
  const meses = new Set();
  almacigo.forEach((m) => meses.add(sumarMeses(m, offsetMeses)));
  return Array.from(meses).sort((a, b) => a - b);
}

function estaEnVentana(mes, meses) {
  return Array.isArray(meses) && meses.includes(mes);
}

// "Esta temporada" (Inicio): entre 4 y 8 sugerencias, priorizando las
// especies que recién arrancan su ventana este mes por sobre las que ya
// están a mitad de camino.
function obtenerRecomendacionesTemporada(hemisferio, mes, limite = 8) {
  const candidatos = [];
  CULTIVOS_DATA.forEach((c) => {
    const ventana = obtenerVentanaSiembra(c, hemisferio);
    ['almacigo', 'directa'].forEach((tipo) => {
      const meses = ventana[tipo];
      if (estaEnVentana(mes, meses)) {
        candidatos.push({ id: c.id, nombre: c.nombre, tipo, recienEmpieza: meses[0] === mes });
      }
    });
  });

  candidatos.sort((a, b) => {
    if (a.recienEmpieza !== b.recienEmpieza) return a.recienEmpieza ? -1 : 1;
    return a.nombre.localeCompare(b.nombre, 'es');
  });

  return candidatos.slice(0, limite);
}

// Calendario completo de un mes: todas las especies en ventana, agrupadas
// por tipo (acá no hay límite — es la vista dedicada al detalle).
function obtenerCalendarioMes(hemisferio, mes) {
  const grupos = { almacigo: [], directa: [], trasplante: [] };
  CULTIVOS_DATA.forEach((c) => {
    const ventana = obtenerVentanaSiembra(c, hemisferio);
    if (estaEnVentana(mes, ventana.almacigo)) grupos.almacigo.push({ id: c.id, nombre: c.nombre });
    if (estaEnVentana(mes, ventana.directa)) grupos.directa.push({ id: c.id, nombre: c.nombre });
    if (estaEnVentana(mes, obtenerVentanaTrasplante(c, hemisferio))) grupos.trasplante.push({ id: c.id, nombre: c.nombre });
  });
  grupos.almacigo.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  grupos.directa.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  grupos.trasplante.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return grupos;
}
