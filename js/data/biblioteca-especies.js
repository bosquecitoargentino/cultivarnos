// data/biblioteca-especies.js — Biblioteca agronómica estructurada
//
// Esto NO es una enciclopedia de texto largo: es una base de conocimiento
// reutilizable por toda la app (ficha de especie, calendario, alta de
// cultivo, observación guiada, recordatorios sugeridos). Prioriza
// estructura correcta por sobre cantidad — arranca con 10 especies piloto,
// elegidas a propósito para poner a prueba distintas formas de esta misma
// estructura (fruto tutorado de ciclo largo, solanácea de clima cálido,
// cucurbitácea rápida y expansiva, hoja de ciclo corto, hoja de ciclo más
// largo, raíz de siembra directa, tubérculo, leguminosa de estación fría,
// aromática, y una especie de servicio/biomasa con un ciclo de vida
// totalmente distinto). Pensada para crecer más adelante a 60-100 especies
// sin romper nada de lo que ya la usa.
//
// Fuente única de conocimiento por especie: getEspecie(id) devuelve TODA
// la información agronómica estructurada disponible para esa especie. El
// resto de la app (motor-biblioteca.js, views/biblioteca.js,
// views/ficha-especie.js y, vía capa de compatibilidad, motor-estacional.js)
// consume esto — nadie más define de nuevo ventanas de siembra, ambiente,
// etc. para estas 10 especies.
//
// Los ids son los MISMOS que ya usan cultivos-data.js y
// preguntas-cultivos.js (tomate, berenjena, zucchini, rucula, acelga,
// zanahoria, papa, haba, albahaca, tithonia) — así identificarEspecie()
// (definida en preguntas-cultivos.js) sirve tal cual para encontrar la
// ficha de un cultivo real ya cargado, sin un segundo sistema de alias.
//
// Precisión: cuando un dato depende demasiado de variedad, suelo, clima
// local o manejo como para dar un número único confiable (pH, rendimiento,
// distancias exactas de algunas especies, etc.), el campo queda en `null`
// en vez de inventarse. Los valores temporales son SIEMPRE orientativos —
// rangos, nunca una cifra exacta disfrazada de precisión.
//
// Preguntas de observación: a propósito esta Biblioteca NO repite las
// preguntas interactivas de preguntas-cultivos.js (con opciones,
// cooldown, acción sugerida, etc.) — sería duplicar la misma información
// en dos formatos. En cambio, `etapas.<etapa>.observar` acá son frases
// breves, narrativas, pensadas para la ficha de especie ("qué vale la pena
// mirar en esta etapa"), y views/ficha-especie.js complementa esa sección
// leyendo en vivo las preguntas reales de PREGUNTAS_CULTIVOS.especies[id]
// cuando existen — una sola fuente para el contenido interactivo, sin
// copiarlo acá.

const BIBLIOTECA_ESPECIES = [
  // ---------------------------------------------------------------------
  // TOMATE — fruto tutorado, ciclo largo, muy sensible al frío. Especie de
  // referencia: la más completa de las 10, para validar que el template
  // soporta bien el caso "más complejo" (siembra en almácigo, trasplante,
  // tutorado, poda, cosecha escalonada).
  // ---------------------------------------------------------------------
  {
    id: 'tomate',
    identidad: {
      nombre: 'Tomate',
      nombreCientifico: 'Solanum lycopersicum',
      familia: 'Solanaceae',
      categorias: ['fruto'],
      ciclo: 'anual (por manejo; en climas cálidos puede comportarse como perenne de vida corta)',
      estrato: null,
      tipoCrecimiento: 'variable según variedad: indeterminado (trepador, tutorado) o determinado (arbustivo, más compacto)',
      tipoSeguimiento: 'horticola',
    },
    visual: { imagen: 'assets/cultivos/tomate.webp', icono: '🍅' },
    siembra: {
      metodos: ['almacigo', 'directa'],
      metodoPreferido: 'almacigo',
      profundidadCm: [0.5, 1],
      semillasPorCelda: [2, 3],
      germinacionDias: [5, 12],
      temperaturaGerminacion: { minima: 10, ideal: [20, 27], maxima: 35 },
      trasplante: { recomendado: true, diasOrientativos: [30, 50], hojasVerdaderasOrientativas: [4, 6] },
    },
    calendario: {
      templado: {
        hemisferioSur: { almacigo: [7, 8, 9], directa: [9, 10, 11] },
      },
    },
    ambiente: {
      luz: { nivel: 'sol_pleno', horasMinimas: 6, notas: null },
      agua: { demanda: 'media', sensibilidadSequia: 'media', notas: 'El riego irregular (seco-mojado-seco) favorece el rajado de frutos.' },
      temperatura: { minima: 10, ideal: [18, 27], maxima: 32, sensibilidadFrio: 'alta', notas: 'Muy sensible a heladas; el frío también afecta el cuajado de flores.' },
      suelo: { tipoPreferido: 'franco, profundo, rico en materia orgánica', drenaje: 'bueno', phIdeal: null },
    },
    manejo: {
      distanciaCm: [40, 60],
      tutorado: 'recomendado en variedades indeterminadas; opcional en determinadas',
      poda: 'destallado (brotes axilares) frecuente en indeterminados; menos relevante en determinados',
      coberturaSuelo: 'beneficiosa — ayuda a mantener humedad pareja',
      demandaFertilidad: 'media_alta',
    },
    etapas: {
      tipo: 'horticola_estandar',
      germinacion: { diasOrientativos: [5, 12], observar: ['¿Emergieron los cotiledones parejos?', '¿La humedad del sustrato se mantiene constante, sin encharcar?'] },
      plantula: { diasOrientativos: [15, 30], observar: ['¿Aparecieron las hojas verdaderas?', '¿El tallo se alarga demasiado por falta de luz?'] },
      crecimiento: { diasOrientativos: [30, 50], observar: ['¿La planta desarrolla estructura firme antes de florecer?', '¿Ya necesita tutor?'] },
      floracion: { diasOrientativos: [45, 70], observar: ['¿Aparecieron las primeras flores?', '¿Hay polinizadores u otro movimiento de aire que ayude al cuajado?'] },
      produccion: { diasOrientativos: [80, 140], observar: ['¿Hay frutos cambiando de color de forma pareja?', '¿El follaje inferior se ve sano o conviene despejarlo?'] },
      senescencia: { diasOrientativos: null, observar: ['¿La producción empieza a bajar de forma sostenida hacia el fin de temporada?'] },
    },
    cosecha: {
      diasDesdeSiembra: [80, 140],
      tipo: 'escalonada',
      indicadoresMadurez: ['Color de fruto virado por completo', 'Se desprende con una leve torsión'],
      frecuenciaOrientativaDias: [3, 5],
    },
    ecologia: {
      demandaFertilidad: 'media_alta',
      coberturaRecomendada: true,
      funciones: ['produccion_alimento'],
      interaccionesAObservar: [
        'Competencia por luz con vecinas más altas',
        'Circulación de aire alrededor del follaje (afecta hongos)',
        'Sombreado sobre especies bajas cercanas a medida que crece',
      ],
      principiosManejo: ['Observar antes de intervenir', 'Rotar la familia botánica entre temporadas', 'Priorizar cobertura y suelo vivo por sobre insumos externos'],
    },
  },

  // ---------------------------------------------------------------------
  // BERENJENA — otra solanácea, pero de clima más cálido, ciclo más largo
  // y sin siembra directa habitual. Puesta a prueba: variante cercana a
  // tomate pero con matices distintos.
  // ---------------------------------------------------------------------
  {
    id: 'berenjena',
    identidad: {
      nombre: 'Berenjena',
      nombreCientifico: 'Solanum melongena',
      familia: 'Solanaceae',
      categorias: ['fruto'],
      ciclo: 'anual (manejada como anual en clima templado; perenne en climas cálidos)',
      estrato: null,
      tipoCrecimiento: 'arbustivo, semi-erecto',
      tipoSeguimiento: 'horticola',
    },
    visual: { imagen: 'assets/cultivos/berenjena.webp', icono: '🍆' },
    siembra: {
      metodos: ['almacigo'],
      metodoPreferido: 'almacigo',
      profundidadCm: [0.5, 1],
      semillasPorCelda: [2, 3],
      germinacionDias: [8, 15],
      temperaturaGerminacion: { minima: 15, ideal: [22, 28], maxima: 35 },
      trasplante: { recomendado: true, diasOrientativos: [45, 60], hojasVerdaderasOrientativas: [4, 6] },
    },
    calendario: {
      templado: {
        hemisferioSur: { almacigo: [7, 8, 9], directa: [] },
      },
    },
    ambiente: {
      luz: { nivel: 'sol_pleno', horasMinimas: 6, notas: null },
      agua: { demanda: 'media', sensibilidadSequia: 'media', notas: null },
      temperatura: { minima: 13, ideal: [22, 30], maxima: 35, sensibilidadFrio: 'alta', notas: 'Más exigente en calor que el tomate; el frío frena mucho su crecimiento.' },
      suelo: { tipoPreferido: 'franco, rico en materia orgánica', drenaje: 'bueno', phIdeal: null },
    },
    manejo: {
      distanciaCm: [50, 70],
      tutorado: 'ocasional, sobre todo con carga alta de frutos',
      poda: 'liviana — despuntar brotes débiles o muy bajos',
      coberturaSuelo: 'beneficiosa',
      demandaFertilidad: 'media_alta',
    },
    etapas: {
      tipo: 'horticola_estandar',
      germinacion: { diasOrientativos: [8, 15], observar: ['¿Germinó de forma pareja? (esta especie suele ser más lenta que el tomate)'] },
      plantula: { diasOrientativos: [20, 40], observar: ['¿Desarrolló estructura suficiente antes del trasplante?'] },
      crecimiento: { diasOrientativos: [40, 70], observar: ['¿Cómo responde al calor y la luz disponible?'] },
      floracion: { diasOrientativos: [70, 100], observar: ['¿Aparecieron las primeras flores?', '¿Hay buen movimiento de polinizadores?'] },
      produccion: { diasOrientativos: [90, 150], observar: ['¿La cáscara del fruto se ve brillante y firme?'] },
      senescencia: { diasOrientativos: null, observar: ['¿Baja la producción con el descenso de temperatura?'] },
    },
    cosecha: {
      diasDesdeSiembra: [90, 150],
      tipo: 'escalonada',
      indicadoresMadurez: ['Cáscara brillante y firme (la pérdida de brillo indica sobremadurez)', 'Tamaño típico de la variedad alcanzado'],
      frecuenciaOrientativaDias: [5, 8],
    },
    ecologia: {
      demandaFertilidad: 'media_alta',
      coberturaRecomendada: true,
      funciones: ['produccion_alimento'],
      interaccionesAObservar: ['Competencia por luz y calor con vecinas altas', 'Circulación de aire alrededor del follaje'],
      principiosManejo: ['Observar antes de intervenir', 'Rotar la familia botánica entre temporadas'],
    },
  },

  // ---------------------------------------------------------------------
  // ZUCCHINI — cucurbitácea rápida y expansiva, siembra directa habitual,
  // ciclo corto, mucha demanda de espacio y agua.
  // ---------------------------------------------------------------------
  {
    id: 'zucchini',
    identidad: {
      nombre: 'Zucchini',
      nombreCientifico: 'Cucurbita pepo',
      familia: 'Cucurbitaceae',
      categorias: ['fruto'],
      ciclo: 'anual',
      estrato: null,
      tipoCrecimiento: 'arbustivo/rastrero según variedad, muy expansivo',
      tipoSeguimiento: 'horticola',
    },
    visual: { imagen: 'assets/cultivos/zucchini.webp', icono: '🥒' },
    siembra: {
      metodos: ['almacigo', 'directa'],
      metodoPreferido: 'directa',
      profundidadCm: [2, 3],
      semillasPorCelda: [1, 2],
      germinacionDias: [5, 10],
      temperaturaGerminacion: { minima: 13, ideal: [21, 30], maxima: 35 },
      trasplante: { recomendado: false, diasOrientativos: [20, 30], hojasVerdaderasOrientativas: [2, 3] },
    },
    calendario: {
      templado: {
        hemisferioSur: { almacigo: [8, 9], directa: [9, 10, 11, 12] },
      },
    },
    ambiente: {
      luz: { nivel: 'sol_pleno', horasMinimas: 6, notas: null },
      agua: { demanda: 'alta', sensibilidadSequia: 'alta', notas: 'Hojas grandes, pierde agua rápido en días de calor.' },
      temperatura: { minima: 10, ideal: [18, 27], maxima: 32, sensibilidadFrio: 'media', notas: null },
      suelo: { tipoPreferido: 'franco, muy rico en materia orgánica', drenaje: 'bueno', phIdeal: null },
    },
    manejo: {
      distanciaCm: [80, 100],
      tutorado: 'no',
      poda: 'ocasional — retirar hojas muy grandes o enfermas de la base',
      coberturaSuelo: 'muy beneficiosa (planta de gran demanda de agua)',
      demandaFertilidad: 'alta',
    },
    etapas: {
      tipo: 'horticola_estandar',
      germinacion: { diasOrientativos: [5, 10], observar: ['¿Germinó parejo?'] },
      plantula: { diasOrientativos: [10, 20], observar: ['¿Aparecieron las hojas verdaderas?'] },
      crecimiento: { diasOrientativos: [20, 35], observar: ['¿Está desarrollando hojas grandes activamente?'] },
      floracion: { diasOrientativos: [35, 50], observar: ['¿Ves flores masculinas y femeninas? (las femeninas tienen un pequeño fruto en la base)'] },
      produccion: { diasOrientativos: [45, 65], observar: ['¿Hay frutos listos antes de que se agranden demasiado? (se cosechan tiernos)'] },
      senescencia: { diasOrientativos: null, observar: ['¿Bajó el vigor general de la planta tras varias semanas de producción?'] },
    },
    cosecha: {
      diasDesdeSiembra: [45, 65],
      tipo: 'escalonada',
      indicadoresMadurez: ['Tamaño moderado, cáscara todavía tierna (se recomienda no dejar crecer demasiado el fruto)'],
      frecuenciaOrientativaDias: [2, 3],
    },
    ecologia: {
      demandaFertilidad: 'alta',
      coberturaRecomendada: true,
      funciones: ['produccion_alimento'],
      interaccionesAObservar: ['Ocupa mucho espacio horizontal — competencia con vecinas bajas', 'Sus hojas grandes generan sombra propia sobre el suelo (puede ser positivo como cobertura viva)'],
      principiosManejo: ['Observar antes de intervenir', 'Dar espacio suficiente desde la siembra para no tener que corregir después'],
    },
  },

  // ---------------------------------------------------------------------
  // RÚCULA — hoja de ciclo muy corto y rápido, siembra directa, cosecha
  // por rebrote.
  // ---------------------------------------------------------------------
  {
    id: 'rucula',
    identidad: {
      nombre: 'Rúcula',
      nombreCientifico: 'Eruca vesicaria',
      familia: 'Brassicaceae',
      categorias: ['hoja'],
      ciclo: 'anual, ciclo muy corto',
      estrato: null,
      tipoCrecimiento: 'roseta baja',
      tipoSeguimiento: 'horticola',
    },
    visual: { imagen: 'assets/cultivos/rucula.webp', icono: '🌿' },
    siembra: {
      metodos: ['directa'],
      metodoPreferido: 'directa',
      profundidadCm: [0.5, 1],
      semillasPorCelda: null,
      germinacionDias: [4, 8],
      temperaturaGerminacion: { minima: 8, ideal: [15, 22], maxima: 28 },
      trasplante: { recomendado: false, diasOrientativos: null, hojasVerdaderasOrientativas: null },
    },
    calendario: {
      templado: {
        hemisferioSur: { almacigo: [], directa: [3, 4, 5, 8, 9, 10] },
      },
    },
    ambiente: {
      luz: { nivel: 'sol_parcial', horasMinimas: 4, notas: 'Tolera algo de sombra; el calor fuerte adelanta el espigado.' },
      agua: { demanda: 'media', sensibilidadSequia: 'media', notas: null },
      temperatura: { minima: 5, ideal: [12, 22], maxima: 28, sensibilidadFrio: 'baja', notas: 'Prefiere estaciones frescas; el calor intenso la hace espigar rápido y amargar.' },
      suelo: { tipoPreferido: 'suelto, rico en materia orgánica', drenaje: 'bueno', phIdeal: null },
    },
    manejo: {
      distanciaCm: [10, 15],
      tutorado: 'no',
      poda: 'no — se cosecha cortando hojas u la planta entera',
      coberturaSuelo: 'beneficiosa, ayuda a mantener frescura',
      demandaFertilidad: 'baja_media',
    },
    etapas: {
      tipo: 'horticola_estandar',
      germinacion: { diasOrientativos: [4, 8], observar: ['¿Germinó parejo? (suele ser rápida)'] },
      plantula: { diasOrientativos: [8, 15], observar: ['¿Las plántulas están muy juntas entre sí?'] },
      crecimiento: { diasOrientativos: [15, 30], observar: ['¿Las hojas ya tienen buen tamaño?', '¿Empieza a espigar (subir flor)?'] },
      floracion: { diasOrientativos: null, observar: ['Si espiga, el sabor se vuelve más picante/amargo — suele ser momento de cosechar lo que queda.'] },
      produccion: { diasOrientativos: [25, 40], observar: ['¿Rebrotó bien después del último corte?'] },
      senescencia: { diasOrientativos: null, observar: [] },
    },
    cosecha: {
      diasDesdeSiembra: [25, 40],
      tipo: 'por corte/rebrote',
      indicadoresMadurez: ['Hojas de buen tamaño, antes de que la planta espigue'],
      frecuenciaOrientativaDias: [10, 15],
    },
    ecologia: {
      demandaFertilidad: 'baja_media',
      coberturaRecomendada: true,
      funciones: ['produccion_alimento'],
      interaccionesAObservar: ['Densidad alta entre plantas (compite consigo misma más que con otras especies)', 'Sombra de vecinas más altas puede retrasar el espigado en días calurosos (a veces conviene)'],
      principiosManejo: ['Observar antes de intervenir', 'Siembras escalonadas cada pocas semanas para cosecha continua'],
    },
  },

  // ---------------------------------------------------------------------
  // ACELGA — hoja de ciclo más prolongado que la rúcula, cosecha por
  // rebrote durante meses.
  // ---------------------------------------------------------------------
  {
    id: 'acelga',
    identidad: {
      nombre: 'Acelga',
      nombreCientifico: 'Beta vulgaris var. cicla',
      familia: 'Amaranthaceae (ex Chenopodiaceae)',
      categorias: ['hoja'],
      ciclo: 'bianual (se cosecha durante su primer año, antes de que espigue)',
      estrato: null,
      tipoCrecimiento: 'roseta de pencas',
      tipoSeguimiento: 'horticola',
    },
    visual: { imagen: 'assets/cultivos/acelga.webp', icono: '🥬' },
    siembra: {
      metodos: ['almacigo', 'directa'],
      metodoPreferido: 'directa',
      profundidadCm: [1, 2],
      semillasPorCelda: [2, 3],
      germinacionDias: [7, 14],
      temperaturaGerminacion: { minima: 8, ideal: [15, 24], maxima: 30 },
      trasplante: { recomendado: true, diasOrientativos: [25, 35], hojasVerdaderasOrientativas: [3, 4] },
    },
    calendario: {
      templado: {
        hemisferioSur: { almacigo: [2, 3, 8, 9], directa: [2, 3, 4, 8, 9, 10, 11] },
      },
    },
    ambiente: {
      luz: { nivel: 'sol_pleno', horasMinimas: 5, notas: 'Tolera sol parcial.' },
      agua: { demanda: 'media', sensibilidadSequia: 'media', notas: null },
      temperatura: { minima: 5, ideal: [15, 24], maxima: 30, sensibilidadFrio: 'baja', notas: 'Bastante tolerante al frío moderado.' },
      suelo: { tipoPreferido: 'franco, rico en materia orgánica', drenaje: 'bueno', phIdeal: null },
    },
    manejo: {
      distanciaCm: [25, 35],
      tutorado: 'no',
      poda: 'no — se cosecha de a pencas exteriores',
      coberturaSuelo: 'beneficiosa',
      demandaFertilidad: 'media',
    },
    etapas: {
      tipo: 'horticola_estandar',
      germinacion: { diasOrientativos: [7, 14], observar: ['¿Germinó parejo?'] },
      plantula: { diasOrientativos: [15, 30], observar: ['¿Aparecieron las hojas verdaderas?'] },
      crecimiento: { diasOrientativos: [30, 50], observar: ['¿Las pencas ya tienen buen tamaño para empezar a cosechar de a poco?', '¿Las plantas están muy juntas (conviene raleo)?'] },
      floracion: { diasOrientativos: null, observar: ['¿Está empezando a espigar? (con calor prolongado o estrés puede pasar)'] },
      produccion: { diasOrientativos: [50, 70], observar: ['¿Rebrotó bien después del último corte?'] },
      senescencia: { diasOrientativos: null, observar: ['¿La producción de pencas nuevas se hace más lenta con el tiempo?'] },
    },
    cosecha: {
      diasDesdeSiembra: [50, 70],
      tipo: 'por corte/rebrote',
      indicadoresMadurez: ['Pencas exteriores de buen tamaño (se cosechan de afuera hacia adentro, dejando el centro para que siga produciendo)'],
      frecuenciaOrientativaDias: [15, 25],
    },
    ecologia: {
      demandaFertilidad: 'media',
      coberturaRecomendada: true,
      funciones: ['produccion_alimento'],
      interaccionesAObservar: ['Densidad entre plantas — compite consigo misma si no se ralea a tiempo', 'Sombra parcial de vecinas altas suele ser bien tolerada'],
      principiosManejo: ['Observar antes de intervenir', 'Cosechar de a pocas pencas por planta para extender la producción'],
    },
  },

  // ---------------------------------------------------------------------
  // ZANAHORIA — raíz de siembra directa obligatoria, germinación lenta y
  // despareja, muy sensible a la estructura del suelo.
  // ---------------------------------------------------------------------
  {
    id: 'zanahoria',
    identidad: {
      nombre: 'Zanahoria',
      nombreCientifico: 'Daucus carota',
      familia: 'Apiaceae',
      categorias: ['raiz'],
      ciclo: 'bianual (se cosecha en su primer año, antes de la floración)',
      estrato: null,
      tipoCrecimiento: 'roseta baja de hojas, raíz pivotante',
      tipoSeguimiento: 'horticola',
    },
    visual: { imagen: 'assets/cultivos/zanahoria.webp', icono: '🥕' },
    siembra: {
      metodos: ['directa'],
      metodoPreferido: 'directa',
      profundidadCm: [0.5, 1],
      semillasPorCelda: null,
      germinacionDias: [10, 20],
      temperaturaGerminacion: { minima: 7, ideal: [15, 22], maxima: 28 },
      trasplante: { recomendado: false, diasOrientativos: null, hojasVerdaderasOrientativas: null },
    },
    calendario: {
      templado: {
        hemisferioSur: { almacigo: [], directa: [2, 3, 4, 8, 9, 10] },
      },
    },
    ambiente: {
      luz: { nivel: 'sol_pleno', horasMinimas: 6, notas: null },
      agua: { demanda: 'media', sensibilidadSequia: 'media', notas: 'La humedad despareja durante el llenado de la raíz puede rajarla.' },
      temperatura: { minima: 5, ideal: [15, 22], maxima: 28, sensibilidadFrio: 'baja', notas: null },
      suelo: { tipoPreferido: 'suelto, profundo, sin piedras ni terrones — la compactación deforma o bifurca la raíz', drenaje: 'bueno', phIdeal: null },
    },
    manejo: {
      distanciaCm: [5, 8],
      tutorado: 'no',
      poda: 'no',
      coberturaSuelo: 'con cuidado — debe permitir que la raíz se hinche sin obstáculos',
      demandaFertilidad: 'baja_media',
    },
    etapas: {
      tipo: 'horticola_estandar',
      germinacion: { diasOrientativos: [10, 20], observar: ['¿Germinó de forma pareja? (es normal que sea lenta y despareja en esta especie)', '¿El suelo se mantuvo húmedo durante toda la germinación?'] },
      plantula: { diasOrientativos: [20, 40], observar: ['¿Conviene ralear? (la zanahoria no tolera bien la competencia entre plantas muy juntas)'] },
      crecimiento: { diasOrientativos: [40, 70], observar: ['¿El follaje se ve vigoroso?'] },
      floracion: { diasOrientativos: null, observar: [] },
      produccion: { diasOrientativos: [70, 100], observar: ['¿El "hombro" de la raíz asoma con buen diámetro sobre la superficie?'] },
      senescencia: { diasOrientativos: null, observar: [] },
    },
    cosecha: {
      diasDesdeSiembra: [70, 100],
      tipo: 'única por planta',
      indicadoresMadurez: ['Diámetro del hombro de la raíz acorde a la variedad (se puede chequear escarbando un poco)'],
      frecuenciaOrientativaDias: null,
    },
    ecologia: {
      demandaFertilidad: 'baja_media',
      coberturaRecomendada: true,
      funciones: ['produccion_alimento'],
      interaccionesAObservar: ['Muy sensible a la compactación del suelo por pisoteo cercano', 'Competencia con malezas en las primeras semanas (germinación lenta le da desventaja inicial)'],
      principiosManejo: ['Observar antes de intervenir', 'Preparar bien el suelo antes de sembrar en vez de corregir después'],
    },
  },

  // ---------------------------------------------------------------------
  // PAPA — tubérculo, siembra directa por "semilla" vegetativa (tubérculo
  // o trozo con brotes), sin verdadera germinación de semilla botánica.
  // ---------------------------------------------------------------------
  {
    id: 'papa',
    identidad: {
      nombre: 'Papa',
      nombreCientifico: 'Solanum tuberosum',
      familia: 'Solanaceae',
      categorias: ['raiz'],
      ciclo: 'anual (se propaga por tubérculo, no por semilla botánica)',
      estrato: null,
      tipoCrecimiento: 'arbustivo bajo, con tubérculos subterráneos',
      tipoSeguimiento: 'horticola',
    },
    visual: { imagen: 'assets/cultivos/papa.webp', icono: '🥔' },
    siembra: {
      metodos: ['directa (tubérculo o trozo con brotes)'],
      metodoPreferido: 'directa (tubérculo o trozo con brotes)',
      profundidadCm: [8, 12],
      semillasPorCelda: null,
      germinacionDias: [15, 25],
      temperaturaGerminacion: { minima: 7, ideal: [15, 20], maxima: 28 },
      trasplante: { recomendado: false, diasOrientativos: null, hojasVerdaderasOrientativas: null },
    },
    calendario: {
      templado: {
        hemisferioSur: { almacigo: [], directa: [8, 9, 10] },
      },
    },
    ambiente: {
      luz: { nivel: 'sol_pleno', horasMinimas: 6, notas: null },
      agua: { demanda: 'media', sensibilidadSequia: 'media', notas: 'Sensible a sequía sobre todo durante la formación de tubérculos.' },
      temperatura: { minima: 5, ideal: [15, 20], maxima: 28, sensibilidadFrio: 'media', notas: 'Los brotes tiernos se dañan con helada; el calor fuerte frena la tuberización.' },
      suelo: { tipoPreferido: 'suelto, bien drenado, fácil de aporcar', drenaje: 'bueno', phIdeal: null },
    },
    manejo: {
      distanciaCm: [30, 40],
      tutorado: 'no',
      poda: 'no',
      coberturaSuelo: 'el aporque (acercar tierra o cobertura al tallo) cumple una función similar y es clave en esta especie',
      demandaFertilidad: 'media',
    },
    etapas: {
      tipo: 'horticola_estandar',
      germinacion: { diasOrientativos: [15, 25], observar: ['¿Emergieron los brotes?'] },
      plantula: { diasOrientativos: null, observar: [] },
      crecimiento: { diasOrientativos: [25, 60], observar: ['¿Conviene aporcar (sumar tierra o cobertura alrededor del tallo)?', '¿El follaje se ve vigoroso y verde?'] },
      floracion: { diasOrientativos: [50, 70], observar: ['¿La planta está entrando en floración? (suele coincidir con el inicio de formación de tubérculos)'] },
      produccion: { diasOrientativos: [90, 130], observar: [] },
      senescencia: { diasOrientativos: [90, 130], observar: ['¿El follaje amarillea o decae de forma pareja? (suele indicar que los tubérculos están terminando de formarse, no necesariamente un problema)'] },
    },
    cosecha: {
      diasDesdeSiembra: [90, 130],
      tipo: 'única por planta',
      indicadoresMadurez: ['Follaje decaído de forma pareja (cosecha para guardar)', 'Tamaño deseado si se cosecha en verde ("papa nueva")'],
      frecuenciaOrientativaDias: null,
    },
    ecologia: {
      demandaFertilidad: 'media',
      coberturaRecomendada: true,
      funciones: ['produccion_alimento'],
      interaccionesAObservar: ['Necesita espacio despejado alrededor para el aporque', 'Buena cobertura del follaje reduce malezas mientras crece'],
      principiosManejo: ['Observar antes de intervenir', 'Usar tubérculos-semilla sanos, de origen confiable'],
    },
  },

  // ---------------------------------------------------------------------
  // HABA — leguminosa de estación fría, fija nitrógeno, ciclo más largo
  // que otras leguminosas de verano.
  // ---------------------------------------------------------------------
  {
    id: 'haba',
    identidad: {
      nombre: 'Haba',
      nombreCientifico: 'Vicia faba',
      familia: 'Fabaceae',
      categorias: ['leguminosa'],
      ciclo: 'anual, de estación fría',
      estrato: null,
      tipoCrecimiento: 'erecto, tallos gruesos',
      tipoSeguimiento: 'horticola',
    },
    visual: { imagen: 'assets/cultivos/haba.webp', icono: '🫘' },
    siembra: {
      metodos: ['directa'],
      metodoPreferido: 'directa',
      profundidadCm: [3, 5],
      semillasPorCelda: null,
      germinacionDias: [7, 14],
      temperaturaGerminacion: { minima: 5, ideal: [12, 20], maxima: 25 },
      trasplante: { recomendado: false, diasOrientativos: null, hojasVerdaderasOrientativas: null },
    },
    calendario: {
      templado: {
        hemisferioSur: { almacigo: [], directa: [3, 4, 5, 7, 8] },
      },
    },
    ambiente: {
      luz: { nivel: 'sol_pleno', horasMinimas: 5, notas: null },
      agua: { demanda: 'media', sensibilidadSequia: 'media', notas: null },
      temperatura: { minima: 0, ideal: [10, 20], maxima: 25, sensibilidadFrio: 'baja', notas: 'Tolera heladas leves ya establecida; no tolera calor fuerte.' },
      suelo: { tipoPreferido: 'franco, bien drenado', drenaje: 'bueno', phIdeal: null },
    },
    manejo: {
      distanciaCm: [20, 30],
      tutorado: 'puede necesitar apoyo en variedades altas o zonas ventosas',
      poda: 'despunte del ápice cuando cuaja bien, ayuda a controlar pulgón y concentrar energía en vainas',
      coberturaSuelo: 'beneficiosa',
      demandaFertilidad: 'baja (fija nitrógeno atmosférico junto a bacterias del suelo — típicamente aporta más de lo que demanda)',
    },
    etapas: {
      tipo: 'horticola_estandar',
      germinacion: { diasOrientativos: [7, 14], observar: ['¿Germinó parejo?'] },
      plantula: { diasOrientativos: null, observar: [] },
      crecimiento: { diasOrientativos: [15, 50], observar: ['¿Cómo viene la altura de la planta?', '¿Necesita algo para no tumbarse?'] },
      floracion: { diasOrientativos: [60, 80], observar: ['¿Aparecieron flores?'] },
      produccion: { diasOrientativos: [90, 130], observar: ['¿Hay vainas formándose?'] },
      senescencia: { diasOrientativos: null, observar: [] },
    },
    cosecha: {
      diasDesdeSiembra: [90, 130],
      tipo: 'escalonada',
      indicadoresMadurez: ['Vainas hinchadas, con el contorno de las semillas marcado (para consumo fresco); vaina y semilla secas (para guardar semilla o consumo seco)'],
      frecuenciaOrientativaDias: [5, 10],
    },
    ecologia: {
      demandaFertilidad: 'baja',
      coberturaRecomendada: true,
      funciones: ['produccion_alimento', 'fijacion_nitrogeno'],
      interaccionesAObservar: ['Buena candidata para anteceder a especies exigentes en nitrógeno en la rotación', 'Atrae pulgón con facilidad — vale la pena observar la punta de los tallos'],
      principiosManejo: ['Observar antes de intervenir', 'Aprovechar su aporte de nitrógeno en la planificación de rotaciones'],
    },
  },

  // ---------------------------------------------------------------------
  // ALBAHACA — aromática, muy sensible al frío, cosecha por despunte
  // continuo.
  // ---------------------------------------------------------------------
  {
    id: 'albahaca',
    identidad: {
      nombre: 'Albahaca',
      nombreCientifico: 'Ocimum basilicum',
      familia: 'Lamiaceae',
      categorias: ['aromatica'],
      ciclo: 'anual',
      estrato: null,
      tipoCrecimiento: 'arbustivo bajo, muy ramificado si se despunta',
      tipoSeguimiento: 'horticola',
    },
    visual: { imagen: 'assets/cultivos/albahaca.webp', icono: '🌿' },
    siembra: {
      metodos: ['almacigo', 'directa'],
      metodoPreferido: 'almacigo',
      profundidadCm: [0.5, 1],
      semillasPorCelda: [3, 4],
      germinacionDias: [7, 14],
      temperaturaGerminacion: { minima: 15, ideal: [20, 27], maxima: 32 },
      trasplante: { recomendado: true, diasOrientativos: [25, 35], hojasVerdaderasOrientativas: [3, 4] },
    },
    calendario: {
      templado: {
        hemisferioSur: { almacigo: [8, 9], directa: [10, 11, 12] },
      },
    },
    ambiente: {
      luz: { nivel: 'sol_pleno', horasMinimas: 6, notas: 'Tolera sol parcial en climas muy cálidos.' },
      agua: { demanda: 'media', sensibilidadSequia: 'media', notas: null },
      temperatura: { minima: 10, ideal: [20, 28], maxima: 33, sensibilidadFrio: 'alta', notas: 'Muy sensible al frío — se daña incluso sin llegar a helada.' },
      suelo: { tipoPreferido: 'franco, rico en materia orgánica', drenaje: 'bueno', phIdeal: null },
    },
    manejo: {
      distanciaCm: [20, 30],
      tutorado: 'no',
      poda: 'despunte frecuente por encima de un par de hojas — estimula ramificación y retrasa la floración',
      coberturaSuelo: 'beneficiosa',
      demandaFertilidad: 'media',
    },
    etapas: {
      tipo: 'horticola_estandar',
      germinacion: { diasOrientativos: [7, 14], observar: ['¿Germinó parejo?'] },
      plantula: { diasOrientativos: [15, 30], observar: ['¿Aparecieron las hojas verdaderas?'] },
      crecimiento: { diasOrientativos: [30, 50], observar: ['¿Conviene despuntarla para que ramifique más?'] },
      floracion: { diasOrientativos: [45, 60], observar: ['¿Está empezando a florecer? (una vez que florece, las hojas suelen perder algo de sabor)'] },
      produccion: { diasOrientativos: [50, 70], observar: ['¿Hay suficientes hojas para cosechar sin debilitar la planta?'] },
      senescencia: { diasOrientativos: null, observar: [] },
    },
    cosecha: {
      diasDesdeSiembra: [50, 70],
      tipo: 'por corte/rebrote',
      indicadoresMadurez: ['Hojas de buen tamaño, planta con al menos un par de niveles de ramas'],
      frecuenciaOrientativaDias: [10, 15],
    },
    ecologia: {
      demandaFertilidad: 'media',
      coberturaRecomendada: true,
      funciones: ['produccion_alimento', 'atraccion_polinizadores'],
      interaccionesAObservar: ['Las flores (si se dejan) atraen polinizadores e insectos benéficos', 'Sensible a competir por luz con vecinas más altas'],
      principiosManejo: ['Observar antes de intervenir', 'Despuntar con regularidad en vez de esperar a que florezca del todo'],
    },
  },

  // ---------------------------------------------------------------------
  // TITHONIA — especie de servicio/biomasa, leñosa/semileñosa, perenne,
  // propagación típicamente vegetativa. A propósito NO usa el mismo
  // conjunto de etapas horticolas (germinación/floración/cosecha de
  // fruto) que las 9 especies anteriores — ver etapas.tipo === 'servicio'.
  // Esta es la especie que pone a prueba que la estructura de `etapas` sea
  // flexible y no fuerce un único ciclo de vida a todas las especies
  // (importante para futuras especies de este mismo grupo: leucaena,
  // banano, pasto elefante, consuelda, sesbania, eucalipto, ricino).
  // ---------------------------------------------------------------------
  {
    id: 'tithonia',
    identidad: {
      nombre: 'Tithonia',
      nombreCientifico: 'Tithonia diversifolia',
      familia: 'Asteraceae',
      categorias: ['servicio'],
      ciclo: 'perenne, leñosa/semileñosa — rebrota tras cada poda',
      estrato: 'medio (arbusto alto / árbol pequeño según manejo y poda)',
      tipoCrecimiento: 'arbustivo vigoroso, rebrota con fuerza tras el corte',
      tipoSeguimiento: 'servicio',
    },
    visual: { imagen: 'assets/cultivos/tithonia.webp', icono: '🌻' },
    siembra: {
      metodos: ['esqueje', 'semilla'],
      metodoPreferido: 'esqueje',
      profundidadCm: null,
      semillasPorCelda: null,
      germinacionDias: null,
      temperaturaGerminacion: { minima: null, ideal: null, maxima: null },
      trasplante: { recomendado: false, diasOrientativos: null, hojasVerdaderasOrientativas: null },
    },
    calendario: {
      templado: {
        // Ventana orientativa para plantar esquejes/plantines — no hay un
        // dato sólido de "siembra por semilla" cargado a propósito: en la
        // práctica esta especie se multiplica casi siempre por estaca.
        hemisferioSur: { almacigo: [8, 9, 10], directa: [] },
      },
    },
    ambiente: {
      luz: { nivel: 'sol_pleno', horasMinimas: 5, notas: 'Tolera sol parcial ya establecida.' },
      agua: { demanda: 'baja', sensibilidadSequia: 'baja', notas: 'Especie rústica, bastante tolerante una vez establecida.' },
      temperatura: { minima: 5, ideal: null, maxima: null, sensibilidadFrio: 'media', notas: 'El follaje se daña con heladas fuertes, pero suele rebrotar desde la base/tallo.' },
      suelo: { tipoPreferido: 'tolerante a suelos pobres o degradados', drenaje: 'bueno', phIdeal: null },
    },
    manejo: {
      distanciaCm: [100, 150],
      tutorado: 'no',
      poda: 'frecuente y planificada — es la base de su manejo como especie de servicio',
      coberturaSuelo: 'genera abundante biomasa útil como cobertura o para compost',
      demandaFertilidad: 'baja',
    },
    etapas: {
      // Estructura distinta a propósito: sin germinación/floración/cosecha
      // de fruto. El "ciclo" de una especie de servicio gira en torno al
      // establecimiento y a rondas repetidas de crecimiento-poda-rebrote.
      tipo: 'servicio',
      establecimiento: { diasOrientativos: [20, 45], observar: ['¿El esqueje/plantín prendió y muestra brotes nuevos?', '¿Se mantiene en pie sin ayuda?'] },
      crecimiento: { diasOrientativos: null, observar: ['¿Está creciendo activamente?', '¿Empieza a sombrear alguna planta vecina?'] },
      acumulacion_biomasa: { diasOrientativos: null, observar: ['¿Acumuló suficiente volumen de ramas y hojas para justificar una poda?'] },
      poda: { diasOrientativos: null, observar: ['¿Es un buen momento para podar? (antes de que sombree demasiado, o cuando se necesita biomasa)'] },
      rebrote: { diasOrientativos: [15, 30], observar: ['¿Rebrotó bien después del corte?', '¿El rebrote es parejo en toda la planta o solo en algunos puntos?'] },
    },
    cosecha: {
      // En una especie de servicio, "cosecha" es en realidad la poda de
      // biomasa — se deja el campo por consistencia con el resto de la
      // Biblioteca, pero con semántica distinta (no hay fruto).
      diasDesdeSiembra: null,
      tipo: 'biomasa (poda, no fruto)',
      indicadoresMadurez: ['Altura y volumen de ramas suficiente para una poda útil', 'Buen rebrote tras la poda anterior (señal de que la planta está bien establecida)'],
      frecuenciaOrientativaDias: null,
    },
    ecologia: {
      demandaFertilidad: 'baja',
      coberturaRecomendada: true,
      funciones: ['produccion_biomasa', 'atraccion_polinizadores', 'sombra'],
      interaccionesAObservar: [
        'Sombra creciente sobre especies bajas cercanas a medida que gana altura',
        'Compite por espacio aéreo — vale la pena observar antes de plantarla muy cerca de cultivos bajos',
        'Buen destino para la biomasa podada: cobertura de suelo o compost',
      ],
      principiosManejo: ['Observar antes de intervenir', 'Planificar la poda como parte del manejo, no como una emergencia', 'Priorizar producción de biomasa y cobertura por sobre insumos externos'],
    },
  },
];

// Devuelve la ficha completa de una especie por id, o null si no está en
// la Biblioteca todavía. Única función que el resto de la app debería usar
// para leer datos agronómicos estructurados — evita que cada vista vuelva
// a recorrer BIBLIOTECA_ESPECIES por su cuenta.
function getEspecie(id) {
  if (!id) return null;
  return BIBLIOTECA_ESPECIES.find((e) => e.id === id) || null;
}

window.BIBLIOTECA_ESPECIES = BIBLIOTECA_ESPECIES;
window.getEspecie = getEspecie;
