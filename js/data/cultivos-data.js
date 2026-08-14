// data/cultivos-data.js — biblioteca local de especies (orientativa)
//
// Esto NO es una enciclopedia ni reglas rígidas: son ventanas aproximadas
// pensadas para un clima templado típico de Argentina (hemisferio Sur).
// Los valores de "hemisferioNorte" se derivan automáticamente desplazando
// seis meses los del hemisferio Sur (ver motor-estacional.js), salvo que
// una especie tenga acá un bloque `hemisferioNorte` explícito — en ese
// caso se usa ese dato en vez del derivado.
//
// etapas.*Dias son rangos [mínimo, máximo] en días, siempre orientativos.
// Estructura pensada para ampliarse (más especies, más datos por especie)
// sin romper nada de lo que ya la usa.

const CULTIVOS_DATA = [
  {
    id: 'tomate',
    nombre: 'Tomate',
    categorias: ['hortaliza', 'fruto'],
    siembra: { hemisferioSur: { almacigo: [7, 8, 9], directa: [9, 10, 11] } },
    etapas: { germinacionDias: [5, 12], trasplanteDias: [30, 50], floracionDias: [50, 90], cosechaDias: [80, 140] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'alta', necesidadAgua: 'media' },
  },
  {
    id: 'tomate-cherry',
    nombre: 'Tomate cherry',
    categorias: ['hortaliza', 'fruto'],
    siembra: { hemisferioSur: { almacigo: [7, 8, 9], directa: [9, 10, 11] } },
    etapas: { germinacionDias: [5, 10], trasplanteDias: [25, 40], floracionDias: [45, 70], cosechaDias: [65, 100] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'alta', necesidadAgua: 'media' },
  },
  {
    id: 'berenjena',
    nombre: 'Berenjena',
    categorias: ['hortaliza', 'fruto'],
    siembra: { hemisferioSur: { almacigo: [7, 8, 9], directa: [] } },
    etapas: { germinacionDias: [8, 15], trasplanteDias: [45, 60], floracionDias: [70, 100], cosechaDias: [90, 150] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'alta', necesidadAgua: 'media' },
  },
  {
    id: 'morron',
    nombre: 'Morrón / Pimiento',
    categorias: ['hortaliza', 'fruto'],
    siembra: { hemisferioSur: { almacigo: [7, 8, 9], directa: [] } },
    etapas: { germinacionDias: [10, 18], trasplanteDias: [45, 60], floracionDias: [70, 100], cosechaDias: [100, 150] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'alta', necesidadAgua: 'media' },
  },
  {
    id: 'zucchini',
    nombre: 'Zucchini',
    categorias: ['hortaliza', 'fruto'],
    siembra: { hemisferioSur: { almacigo: [8, 9], directa: [9, 10, 11, 12] } },
    etapas: { germinacionDias: [5, 10], trasplanteDias: [20, 30], floracionDias: [35, 50], cosechaDias: [45, 65] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'media', necesidadAgua: 'alta' },
  },
  {
    id: 'zapallito',
    nombre: 'Zapallito',
    categorias: ['hortaliza', 'fruto'],
    siembra: { hemisferioSur: { almacigo: [8, 9], directa: [9, 10, 11, 12] } },
    etapas: { germinacionDias: [5, 10], trasplanteDias: [20, 30], floracionDias: [35, 50], cosechaDias: [45, 65] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'media', necesidadAgua: 'alta' },
  },
  {
    id: 'calabaza',
    nombre: 'Calabaza',
    categorias: ['hortaliza', 'fruto'],
    siembra: { hemisferioSur: { almacigo: [9, 10], directa: [10, 11, 12] } },
    etapas: { germinacionDias: [6, 12], trasplanteDias: [20, 30], floracionDias: [50, 70], cosechaDias: [90, 140] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'media', necesidadAgua: 'media' },
  },
  {
    id: 'pepino',
    nombre: 'Pepino',
    categorias: ['hortaliza', 'fruto'],
    siembra: { hemisferioSur: { almacigo: [8, 9], directa: [9, 10, 11] } },
    etapas: { germinacionDias: [5, 10], trasplanteDias: [20, 30], floracionDias: [35, 50], cosechaDias: [50, 70] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'alta', necesidadAgua: 'alta' },
  },
  {
    id: 'melon',
    nombre: 'Melón',
    categorias: ['hortaliza', 'fruto'],
    siembra: { hemisferioSur: { almacigo: [9, 10], directa: [10, 11] } },
    etapas: { germinacionDias: [6, 12], trasplanteDias: [20, 30], floracionDias: [45, 60], cosechaDias: [80, 110] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'alta', necesidadAgua: 'media' },
  },
  {
    id: 'sandia',
    nombre: 'Sandía',
    categorias: ['hortaliza', 'fruto'],
    siembra: { hemisferioSur: { almacigo: [9, 10], directa: [10, 11] } },
    etapas: { germinacionDias: [6, 12], trasplanteDias: [20, 30], floracionDias: [45, 60], cosechaDias: [80, 120] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'alta', necesidadAgua: 'media' },
  },
  {
    id: 'maiz',
    nombre: 'Maíz',
    categorias: ['hortaliza', 'grano'],
    siembra: { hemisferioSur: { almacigo: [], directa: [9, 10, 11, 12] } },
    etapas: { germinacionDias: [6, 10], floracionDias: [55, 70], cosechaDias: [80, 120] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'media', necesidadAgua: 'media' },
  },
  {
    id: 'papa',
    nombre: 'Papa',
    categorias: ['hortaliza', 'raiz'],
    siembra: { hemisferioSur: { almacigo: [], directa: [8, 9, 10] } },
    etapas: { germinacionDias: [15, 25], floracionDias: [50, 70], cosechaDias: [90, 130] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'media', necesidadAgua: 'media' },
  },
  {
    id: 'batata',
    nombre: 'Batata',
    categorias: ['hortaliza', 'raiz'],
    siembra: { hemisferioSur: { almacigo: [], directa: [10, 11, 12] } },
    etapas: { cosechaDias: [120, 160] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'alta', necesidadAgua: 'media' },
  },
  {
    id: 'zanahoria',
    nombre: 'Zanahoria',
    categorias: ['hortaliza', 'raiz'],
    siembra: { hemisferioSur: { almacigo: [], directa: [2, 3, 4, 8, 9, 10] } },
    etapas: { germinacionDias: [10, 20], cosechaDias: [70, 100] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'baja', necesidadAgua: 'media' },
  },
  {
    id: 'remolacha',
    nombre: 'Remolacha',
    categorias: ['hortaliza', 'raiz'],
    siembra: { hemisferioSur: { almacigo: [], directa: [2, 3, 4, 8, 9, 10] } },
    etapas: { germinacionDias: [7, 14], cosechaDias: [60, 90] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'baja', necesidadAgua: 'media' },
  },
  {
    id: 'acelga',
    nombre: 'Acelga',
    categorias: ['hortaliza', 'hoja'],
    siembra: { hemisferioSur: { almacigo: [2, 3, 8, 9], directa: [2, 3, 4, 8, 9, 10, 11] } },
    etapas: { germinacionDias: [7, 14], trasplanteDias: [25, 35], cosechaDias: [50, 70] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'baja', necesidadAgua: 'media' },
  },
  {
    id: 'espinaca',
    nombre: 'Espinaca',
    categorias: ['hortaliza', 'hoja'],
    siembra: { hemisferioSur: { almacigo: [], directa: [3, 4, 5, 8, 9] } },
    etapas: { germinacionDias: [7, 14], cosechaDias: [40, 60] },
    caracteristicas: { luz: 'sol parcial', sensibilidadFrio: 'baja', necesidadAgua: 'media' },
  },
  {
    id: 'rucula',
    nombre: 'Rúcula',
    categorias: ['hortaliza', 'hoja'],
    siembra: { hemisferioSur: { almacigo: [], directa: [3, 4, 5, 8, 9, 10] } },
    etapas: { germinacionDias: [4, 8], cosechaDias: [25, 40] },
    caracteristicas: { luz: 'sol parcial', sensibilidadFrio: 'baja', necesidadAgua: 'media' },
  },
  {
    id: 'lechuga',
    nombre: 'Lechuga',
    categorias: ['hortaliza', 'hoja'],
    siembra: { hemisferioSur: { almacigo: [2, 3, 8, 9], directa: [2, 3, 4, 8, 9, 10] } },
    etapas: { germinacionDias: [5, 10], trasplanteDias: [20, 30], cosechaDias: [45, 70] },
    caracteristicas: { luz: 'sol parcial', sensibilidadFrio: 'baja', necesidadAgua: 'media' },
  },
  {
    id: 'arveja',
    nombre: 'Arveja',
    categorias: ['hortaliza', 'legumbre'],
    siembra: { hemisferioSur: { almacigo: [], directa: [3, 4, 5, 8] } },
    etapas: { germinacionDias: [7, 14], floracionDias: [50, 70], cosechaDias: [70, 100] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'baja', necesidadAgua: 'media' },
  },
  {
    id: 'haba',
    nombre: 'Haba',
    categorias: ['hortaliza', 'legumbre'],
    siembra: { hemisferioSur: { almacigo: [], directa: [3, 4, 5, 7, 8] } },
    etapas: { germinacionDias: [7, 14], floracionDias: [60, 80], cosechaDias: [90, 130] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'baja', necesidadAgua: 'media' },
  },
  {
    id: 'poroto',
    nombre: 'Poroto',
    categorias: ['hortaliza', 'legumbre'],
    siembra: { hemisferioSur: { almacigo: [], directa: [9, 10, 11, 12] } },
    etapas: { germinacionDias: [6, 12], floracionDias: [40, 55], cosechaDias: [60, 90] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'alta', necesidadAgua: 'media' },
  },
  {
    id: 'puerro',
    nombre: 'Puerro',
    categorias: ['hortaliza', 'bulbo'],
    siembra: { hemisferioSur: { almacigo: [6, 7, 8], directa: [] } },
    etapas: { germinacionDias: [10, 18], trasplanteDias: [50, 70], cosechaDias: [120, 160] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'baja', necesidadAgua: 'media' },
  },
  {
    id: 'cebolla',
    nombre: 'Cebolla',
    categorias: ['hortaliza', 'bulbo'],
    siembra: { hemisferioSur: { almacigo: [4, 5, 6], directa: [] } },
    etapas: { germinacionDias: [10, 18], trasplanteDias: [60, 80], cosechaDias: [150, 200] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'baja', necesidadAgua: 'baja' },
  },
  {
    id: 'albahaca',
    nombre: 'Albahaca',
    categorias: ['aromatica', 'hoja'],
    siembra: { hemisferioSur: { almacigo: [8, 9], directa: [10, 11, 12] } },
    etapas: { germinacionDias: [7, 14], trasplanteDias: [25, 35], floracionDias: [45, 60], cosechaDias: [50, 70] },
    caracteristicas: { luz: 'sol', sensibilidadFrio: 'alta', necesidadAgua: 'media' },
  },
];

function obtenerCultivoDataPorId(id) {
  return CULTIVOS_DATA.find((c) => c.id === id) || null;
}

window.CULTIVOS_DATA = CULTIVOS_DATA;
window.obtenerCultivoDataPorId = obtenerCultivoDataPorId;
