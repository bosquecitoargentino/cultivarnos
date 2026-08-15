// motor-cosecha.js — motor local, sin IA. Todo lo relacionado a "cuánto se
// cosechó" vive acá: qué unidades existen, cómo se suman entre sí, y cómo
// se muestran de forma humana. Ninguna otra parte de la app debería sumar
// o formatear una medición de cosecha por su cuenta (punto 5 del pedido:
// "no dispersar conversiones por la UI").
//
// Modelo de datos (evento tipo 'cosecha', vive en el store `eventos` que ya
// existía, sin store nuevo ni cambio de DB_VERSION):
//   {
//     tipo: 'cosecha',
//     mediciones: [{ valor: 12, unidad: 'unidad' }, { valor: 1.8, unidad: 'kg' }] | null,
//     ubicacion: 'Bancal 2' | null,
//     nota, fecha, fotoId  — igual que cualquier otro evento
//   }
// `mediciones` puede faltar o venir null/[] por completo: la cosecha sigue
// siendo válida sin cantidad (punto 3 del pedido) — cuenta como cosecha,
// nunca como "0 kg".

const UNIDADES_COSECHA = [
  { value: 'unidad', label: 'unidades', singular: 'unidad' },
  { value: 'kg', label: 'kg', singular: 'kg' },
  { value: 'g', label: 'g', singular: 'g' },
  { value: 'atado', label: 'atados', singular: 'atado' },
  { value: 'otro', label: 'otra unidad...', singular: 'otro' },
];

function etiquetaUnidadCosecha(unidad) {
  const found = UNIDADES_COSECHA.find((u) => u.value === unidad);
  return found ? found.label : unidad;
}

// A qué "familia" de magnitud pertenece una unidad — determina qué se
// puede sumar entre sí (punto 6 del pedido: "no mezclar magnitudes
// diferentes"). Peso (g/kg) es la única familia con más de una unidad
// posible; el resto son 1:1 con su propia familia. 'otro' se agrupa por el
// texto libre que cargó la persona (dos cosechas con unidad libre "cajones"
// SÍ se suman entre sí; "cajones" y "bolsas" no).
function familiaUnidad(unidad, unidadLibre) {
  if (unidad === 'kg' || unidad === 'g') return 'peso';
  if (unidad === 'otro') return `otro:${normalizarTexto(unidadLibre || '')}`;
  return unidad; // 'unidad' | 'atado'
}

// Normaliza UNA medición a su forma interna comparable: para peso, siempre
// en gramos (así 500 g y 1,2 kg son directamente sumables); para el resto,
// el valor tal cual. No se expone fuera de este archivo — nadie más debería
// tener que saber que el peso se acumula en gramos.
function _valorNormalizado(medicion) {
  if (medicion.unidad === 'kg') return medicion.valor * 1000;
  return medicion.valor;
}

// Suma una lista de mediciones (de una o varias cosechas) agrupando por
// familia de magnitud compatible. Nunca mezcla unidades/atados/kg en una
// sola cifra (punto 6) — devuelve un array, una entrada por magnitud
// presente, en un orden estable y legible.
// mediciones: [{ valor, unidad, unidadLibre? }]
// devuelve: [{ valor, unidad, unidadLibre? }] — ya sumado y en la unidad
// "humana" más adecuada (ver formatearMedicion).
function sumarMedicionesCompatibles(mediciones) {
  const lista = (mediciones || []).filter((m) => m && Number.isFinite(m.valor));
  if (!lista.length) return [];

  const grupos = new Map(); // familia -> { unidadBase, unidadLibre, totalNormalizado }
  lista.forEach((m) => {
    const familia = familiaUnidad(m.unidad, m.unidadLibre);
    const acumulado = grupos.get(familia) || { unidadBase: m.unidad, unidadLibre: m.unidadLibre || null, total: 0 };
    acumulado.total += _valorNormalizado(m);
    grupos.set(familia, acumulado);
  });

  const ORDEN_FAMILIA = ['unidad', 'peso', 'atado'];
  const entradas = Array.from(grupos.entries());
  entradas.sort((a, b) => {
    const ia = ORDEN_FAMILIA.indexOf(a[0]);
    const ib = ORDEN_FAMILIA.indexOf(b[0]);
    const pa = ia === -1 ? ORDEN_FAMILIA.length : ia;
    const pb = ib === -1 ? ORDEN_FAMILIA.length : ib;
    return pa - pb;
  });

  return entradas.map(([familia, g]) => {
    if (familia === 'peso') {
      // Gramos normalizados -> unidad humana más clara (punto 5: mostrar
      // "850 g" o "2,5 kg" según corresponda, nunca una cifra rara).
      if (g.total < 1000) return { valor: Math.round(g.total), unidad: 'g' };
      return { valor: Math.round((g.total / 1000) * 100) / 100, unidad: 'kg' };
    }
    if (familia.startsWith('otro:')) {
      return { valor: g.total, unidad: 'otro', unidadLibre: g.unidadLibre };
    }
    return { valor: g.total, unidad: g.unidadBase };
  });
}

// Formatea un número al estilo local (coma decimal, sin ceros de más):
// 1.8 -> "1,8"; 2.5 -> "2,5"; 12 -> "12"; 850 -> "850".
function formatearNumeroDecimal(n) {
  if (!Number.isFinite(n)) return '';
  const redondeado = Math.round(n * 100) / 100;
  const texto = redondeado % 1 === 0 ? String(redondeado) : redondeado.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return texto.replace('.', ',');
}

// Una medición ya sumada -> texto humano: "2,5 kg", "12 unidades", "1
// atado", "3 cajones".
function formatearMedicion(medicion) {
  const n = formatearNumeroDecimal(medicion.valor);
  if (medicion.unidad === 'otro') {
    const etiqueta = medicion.unidadLibre || 'otro';
    return `${n} ${etiqueta}`;
  }
  const info = UNIDADES_COSECHA.find((u) => u.value === medicion.unidad);
  const singular = info ? info.singular : medicion.unidad;
  const plural = info ? info.label : medicion.unidad;
  return `${n} ${medicion.valor === 1 ? singular : plural}`;
}

// Lista de mediciones YA sumadas por magnitud -> "12 unidades · 1,8 kg"
// (punto 6: dos magnitudes distintas se muestran juntas, nunca fusionadas).
function formatearListaMediciones(medicionesSumadas) {
  return (medicionesSumadas || []).map(formatearMedicion).join(' · ');
}

window.UNIDADES_COSECHA = UNIDADES_COSECHA;
window.etiquetaUnidadCosecha = etiquetaUnidadCosecha;
window.sumarMedicionesCompatibles = sumarMedicionesCompatibles;
window.formatearNumeroDecimal = formatearNumeroDecimal;
window.formatearMedicion = formatearMedicion;
window.formatearListaMediciones = formatearListaMediciones;
