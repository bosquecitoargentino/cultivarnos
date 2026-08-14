// data/preguntas-cultivos.js — biblioteca local de preguntas de observación
//
// Dos niveles, para no duplicar contenido:
//   - generales: aplicables a casi cualquier cultivo (agua, luz, suelo,
//     crecimiento, estado, entorno).
//   - especies: preguntas propias de cada especie, organizadas por etapa
//     aproximada (germinacion, plantula, crecimiento, floracion,
//     produccion). No todas las especies usan todas las etapas.
//
// Cada pregunta es orientativa, no una regla rígida. Los campos opcionales:
//   - cooldownDias: cuántos días esperar antes de volver a mostrarla si no
//     fue "resuelta". Si no se especifica, el motor usa un valor por
//     defecto.
//   - resuelvePermanente: lista de respuestas que retiran la pregunta para
//     siempre una vez contestada (ej. "¿ya germinó?" -> "Sí").
//   - pista: una frase corta, prudente, orientada a observar — nunca una
//     instrucción tajante.
//   - accion: { respuesta, eventoTipo, label } — si la respuesta coincide,
//     la interfaz puede ofrecer crear ese evento real (nunca automático).
//   - recordatorio: { respuesta, dias, titulo } — si la respuesta coincide,
//     la interfaz puede ofrecer un recordatorio con esa fecha sugerida
//     (nunca creado automáticamente).

const PREGUNTAS_CULTIVOS = {
  generales: {
    crecimiento: [
      {
        id: 'gen-crecimiento-activo',
        texto: '¿Cómo está creciendo?',
        etiqueta: 'Crecimiento',
        opciones: ['Fuerte', 'Normal', 'Lento', 'Detenido'],
        cooldownDias: 5,
      },
      {
        id: 'gen-hojas-nuevas',
        texto: '¿Aparecieron hojas nuevas desde la última vez?',
        etiqueta: 'Hojas nuevas',
        opciones: ['Sí', 'No', 'No sé'],
        cooldownDias: 5,
      },
      {
        id: 'gen-cambio-crecimiento',
        texto: '¿El crecimiento cambió desde la última observación?',
        etiqueta: 'Cambio de ritmo',
        opciones: ['Igual', 'Más rápido', 'Más lento'],
        cooldownDias: 6,
      },
    ],
    agua: [
      {
        id: 'gen-humedad',
        texto: '¿Cómo está la humedad del sustrato?',
        etiqueta: 'Humedad',
        opciones: ['Seco', 'Húmedo', 'Muy húmedo', 'No sé'],
        cooldownDias: 3,
        pista: '💧 Revisá debajo de la cobertura; la superficie puede parecer seca aunque el suelo todavía conserve humedad.',
      },
      {
        id: 'gen-humedad-cobertura',
        texto: '¿El suelo permanece húmedo debajo de la cobertura?',
        etiqueta: 'Humedad bajo cobertura',
        opciones: ['Sí', 'No', 'No tiene cobertura'],
        cooldownDias: 5,
      },
      {
        id: 'gen-exceso-agua',
        texto: '¿Hay señales de exceso de agua?',
        etiqueta: 'Exceso de agua',
        opciones: ['No', 'Un poco', 'Sí'],
        cooldownDias: 5,
      },
    ],
    luz: [
      {
        id: 'gen-sol-directo',
        texto: '¿Dónde está recibiendo luz?',
        etiqueta: 'Luz',
        opciones: ['Buena luz', 'Poca luz', 'No sé'],
        cooldownDias: 8,
      },
      {
        id: 'gen-sombreado',
        texto: '¿Está demasiado sombreado?',
        etiqueta: 'Sombra',
        opciones: ['No', 'Un poco', 'Bastante'],
        cooldownDias: 8,
      },
      {
        id: 'gen-cambio-sombra',
        texto: '¿Cambió la sombra alrededor?',
        etiqueta: 'Cambio de sombra',
        opciones: ['No', 'Más sombra', 'Menos sombra'],
        cooldownDias: 10,
      },
    ],
    suelo: [
      {
        id: 'gen-suelo-cubierto',
        texto: '¿El suelo está cubierto?',
        etiqueta: 'Cobertura',
        opciones: ['Sí', 'No', 'Parcial'],
        cooldownDias: 8,
      },
      {
        id: 'gen-materia-organica',
        texto: '¿Hay materia orgánica alrededor?',
        etiqueta: 'Materia orgánica',
        opciones: ['Sí', 'Poca', 'No'],
        cooldownDias: 10,
      },
      {
        id: 'gen-suelo-compactado',
        texto: '¿La superficie está compactada?',
        etiqueta: 'Compactación',
        opciones: ['No', 'Un poco', 'Sí'],
        cooldownDias: 10,
      },
    ],
    estado: [
      {
        id: 'gen-hojas-sanas',
        texto: '¿Las hojas nuevas se ven sanas?',
        etiqueta: 'Estado de hojas',
        opciones: ['Sí', 'Algo raro', 'No'],
        cooldownDias: 4,
      },
      {
        id: 'gen-cambio-color',
        texto: '¿Observás cambios de color en las hojas?',
        etiqueta: 'Color de hojas',
        opciones: ['No', 'Amarillean', 'Violáceas', 'Manchas'],
        cooldownDias: 4,
      },
      {
        id: 'gen-dano-visible',
        texto: '¿Hay daño visible (mordidas, roturas, manchas)?',
        etiqueta: 'Daño visible',
        opciones: ['No', 'Un poco', 'Sí'],
        cooldownDias: 4,
      },
    ],
    entorno: [
      {
        id: 'gen-competencia',
        texto: '¿Hay otras plantas compitiendo por espacio?',
        etiqueta: 'Competencia',
        opciones: ['No', 'Un poco', 'Sí'],
        cooldownDias: 10,
      },
      {
        id: 'gen-cambio-vegetacion',
        texto: '¿Cambió la vegetación alrededor?',
        etiqueta: 'Vegetación alrededor',
        opciones: ['No', 'Sí'],
        cooldownDias: 12,
      },
      {
        id: 'gen-insectos',
        texto: '¿Hay insectos presentes?',
        etiqueta: 'Insectos',
        opciones: ['No', 'Pocos', 'Bastantes'],
        cooldownDias: 4,
        pista: '🌱 Un foco pequeño no necesariamente requiere intervención inmediata. Observar su evolución y la presencia de depredadores puede dar más información.',
      },
    ],
  },

  especies: {
    tomate: {
      germinacion: [
        {
          id: 'tomate-germino',
          texto: '¿Ya germinó?',
          etiqueta: 'Germinación',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 3,
          accion: { respuesta: 'Sí', eventoTipo: 'germinacion', label: 'Registrar germinación' },
          recordatorio: { respuesta: 'Todavía no', dias: 3, titulo: 'Revisar germinación' },
        },
      ],
      plantula: [
        {
          id: 'tomate-hojas-verdaderas',
          texto: '¿Aparecieron las hojas verdaderas?',
          etiqueta: 'Hojas verdaderas',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 4,
        },
        {
          id: 'tomate-tallo-alargado',
          texto: '¿El tallo se está alargando demasiado?',
          etiqueta: 'Tallo',
          opciones: ['No', 'Un poco', 'Mucho'],
          cooldownDias: 5,
          pista: '🌱 Si el tallo se alarga mucho, primero observá la disponibilidad de luz antes de pensar en nutrientes.',
        },
        {
          id: 'tomate-listo-trasplante',
          texto: '¿Está desarrollando estructura suficiente para trasplante?',
          etiqueta: 'Listo para trasplante',
          opciones: ['Todavía no', 'Casi', 'Sí'],
          cooldownDias: 5,
          accion: { respuesta: 'Sí', eventoTipo: 'trasplante', label: 'Registrar trasplante' },
        },
      ],
      crecimiento: [
        {
          id: 'tomate-primeras-flores',
          texto: '¿Aparecieron las primeras flores?',
          etiqueta: 'Primeras flores',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 5,
          accion: { respuesta: 'Sí', eventoTipo: 'floracion', label: 'Registrar floración' },
        },
        {
          id: 'tomate-tutorado',
          texto: '¿Necesita tutorado?',
          etiqueta: 'Tutorado',
          opciones: ['No', 'Pronto', 'Ya lo necesita'],
          cooldownDias: 8,
        },
      ],
      floracion: [
        {
          id: 'tomate-frutos-cuajando',
          texto: '¿Hay frutos cuajando?',
          etiqueta: 'Frutos cuajando',
          opciones: ['Todavía no', 'Algunos', 'Varios'],
          cooldownDias: 6,
        },
      ],
      produccion: [
        {
          id: 'tomate-frutos-maduros',
          texto: '¿Hay frutos listos para cosechar?',
          etiqueta: 'Frutos maduros',
          opciones: ['No', 'Algunos', 'Varios'],
          cooldownDias: 4,
          accion: { respuesta: 'Varios', eventoTipo: 'cosecha', label: 'Registrar cosecha' },
        },
      ],
    },

    'tomate-cherry': {
      germinacion: [
        {
          id: 'tomate-cherry-germino',
          texto: '¿Ya germinó?',
          etiqueta: 'Germinación',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 3,
          accion: { respuesta: 'Sí', eventoTipo: 'germinacion', label: 'Registrar germinación' },
          recordatorio: { respuesta: 'Todavía no', dias: 3, titulo: 'Revisar germinación' },
        },
      ],
      plantula: [
        {
          id: 'tomate-cherry-hojas-verdaderas',
          texto: '¿Aparecieron las hojas verdaderas?',
          etiqueta: 'Hojas verdaderas',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 4,
        },
        {
          id: 'tomate-cherry-listo-trasplante',
          texto: '¿Está desarrollando estructura suficiente para trasplante?',
          etiqueta: 'Listo para trasplante',
          opciones: ['Todavía no', 'Casi', 'Sí'],
          cooldownDias: 5,
          accion: { respuesta: 'Sí', eventoTipo: 'trasplante', label: 'Registrar trasplante' },
        },
      ],
      crecimiento: [
        {
          id: 'tomate-cherry-primeras-flores',
          texto: '¿Aparecieron las primeras flores?',
          etiqueta: 'Primeras flores',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 5,
          accion: { respuesta: 'Sí', eventoTipo: 'floracion', label: 'Registrar floración' },
        },
        {
          id: 'tomate-cherry-tutorado',
          texto: '¿Necesita tutorado?',
          etiqueta: 'Tutorado',
          opciones: ['No', 'Pronto', 'Ya lo necesita'],
          cooldownDias: 8,
        },
      ],
      floracion: [
        {
          id: 'tomate-cherry-frutos-cuajando',
          texto: '¿Hay frutos cuajando?',
          etiqueta: 'Frutos cuajando',
          opciones: ['Todavía no', 'Algunos', 'Varios'],
          cooldownDias: 6,
        },
      ],
      produccion: [
        {
          id: 'tomate-cherry-frutos-maduros',
          texto: '¿Hay frutos listos para cosechar?',
          etiqueta: 'Frutos maduros',
          opciones: ['No', 'Algunos', 'Varios'],
          cooldownDias: 3,
          accion: { respuesta: 'Varios', eventoTipo: 'cosecha', label: 'Registrar cosecha' },
        },
      ],
    },

    berenjena: {
      germinacion: [
        {
          id: 'berenjena-germino',
          texto: '¿Ya germinó?',
          etiqueta: 'Germinación',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 4,
          accion: { respuesta: 'Sí', eventoTipo: 'germinacion', label: 'Registrar germinación' },
          recordatorio: { respuesta: 'Todavía no', dias: 4, titulo: 'Revisar germinación' },
        },
      ],
      plantula: [
        {
          id: 'berenjena-listo-trasplante',
          texto: '¿Está desarrollando estructura suficiente para trasplante?',
          etiqueta: 'Listo para trasplante',
          opciones: ['Todavía no', 'Casi', 'Sí'],
          cooldownDias: 6,
          accion: { respuesta: 'Sí', eventoTipo: 'trasplante', label: 'Registrar trasplante' },
        },
      ],
      crecimiento: [
        {
          id: 'berenjena-primeras-flores',
          texto: '¿Aparecieron las primeras flores?',
          etiqueta: 'Primeras flores',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 6,
          accion: { respuesta: 'Sí', eventoTipo: 'floracion', label: 'Registrar floración' },
        },
      ],
      floracion: [
        {
          id: 'berenjena-frutos-cuajando',
          texto: '¿Hay frutos cuajando?',
          etiqueta: 'Frutos cuajando',
          opciones: ['Todavía no', 'Algunos', 'Varios'],
          cooldownDias: 7,
        },
      ],
      produccion: [
        {
          id: 'berenjena-frutos-maduros',
          texto: '¿Hay frutos listos para cosechar?',
          etiqueta: 'Frutos maduros',
          opciones: ['No', 'Algunos', 'Varios'],
          cooldownDias: 5,
          accion: { respuesta: 'Varios', eventoTipo: 'cosecha', label: 'Registrar cosecha' },
        },
      ],
    },

    morron: {
      germinacion: [
        {
          id: 'morron-germino',
          texto: '¿Ya germinó?',
          etiqueta: 'Germinación',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 4,
          accion: { respuesta: 'Sí', eventoTipo: 'germinacion', label: 'Registrar germinación' },
          recordatorio: { respuesta: 'Todavía no', dias: 4, titulo: 'Revisar germinación' },
        },
      ],
      plantula: [
        {
          id: 'morron-listo-trasplante',
          texto: '¿Está desarrollando estructura suficiente para trasplante?',
          etiqueta: 'Listo para trasplante',
          opciones: ['Todavía no', 'Casi', 'Sí'],
          cooldownDias: 6,
          accion: { respuesta: 'Sí', eventoTipo: 'trasplante', label: 'Registrar trasplante' },
        },
      ],
      crecimiento: [
        {
          id: 'morron-primeras-flores',
          texto: '¿Aparecieron las primeras flores?',
          etiqueta: 'Primeras flores',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 6,
          accion: { respuesta: 'Sí', eventoTipo: 'floracion', label: 'Registrar floración' },
        },
      ],
      floracion: [
        {
          id: 'morron-frutos-cuajando',
          texto: '¿Hay frutos cuajando?',
          etiqueta: 'Frutos cuajando',
          opciones: ['Todavía no', 'Algunos', 'Varios'],
          cooldownDias: 7,
        },
      ],
      produccion: [
        {
          id: 'morron-frutos-maduros',
          texto: '¿Hay frutos listos para cosechar?',
          etiqueta: 'Frutos maduros',
          opciones: ['No', 'Algunos', 'Varios'],
          cooldownDias: 5,
          accion: { respuesta: 'Varios', eventoTipo: 'cosecha', label: 'Registrar cosecha' },
        },
      ],
    },

    zucchini: {
      plantula: [
        {
          id: 'zucchini-hojas-verdaderas',
          texto: '¿Aparecieron las hojas verdaderas?',
          etiqueta: 'Hojas verdaderas',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 3,
        },
      ],
      crecimiento: [
        {
          id: 'zucchini-hojas-grandes',
          texto: '¿Está desarrollando hojas grandes activamente?',
          etiqueta: 'Desarrollo de hojas',
          opciones: ['Sí', 'Lento', 'No'],
          cooldownDias: 5,
        },
        {
          id: 'zucchini-flores',
          texto: '¿Aparecieron flores?',
          etiqueta: 'Flores',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 4,
          accion: { respuesta: 'Sí', eventoTipo: 'floracion', label: 'Registrar floración' },
        },
      ],
      floracion: [
        {
          id: 'zucchini-flores-mf',
          texto: '¿Ves flores masculinas y femeninas?',
          etiqueta: 'Flores masc./fem.',
          opciones: ['Solo masculinas', 'Ambas', 'No sé distinguirlas'],
          cooldownDias: 5,
          pista: '🌱 Las femeninas tienen un pequeño fruto en la base de la flor; al principio suelen aparecer sobre todo masculinas.',
        },
        {
          id: 'zucchini-frutos-iniciando',
          texto: '¿Observás frutos iniciando?',
          etiqueta: 'Frutos iniciando',
          opciones: ['No', 'Algunos', 'Varios'],
          cooldownDias: 4,
        },
      ],
      produccion: [
        {
          id: 'zucchini-frutos-listos',
          texto: '¿Hay frutos listos para cosechar?',
          etiqueta: 'Frutos listos',
          opciones: ['No', 'Algunos', 'Varios'],
          cooldownDias: 3,
          accion: { respuesta: 'Varios', eventoTipo: 'cosecha', label: 'Registrar cosecha' },
        },
      ],
    },

    zapallito: {
      plantula: [
        {
          id: 'zapallito-hojas-verdaderas',
          texto: '¿Aparecieron las hojas verdaderas?',
          etiqueta: 'Hojas verdaderas',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 3,
        },
      ],
      crecimiento: [
        {
          id: 'zapallito-hojas-grandes',
          texto: '¿Está desarrollando hojas grandes activamente?',
          etiqueta: 'Desarrollo de hojas',
          opciones: ['Sí', 'Lento', 'No'],
          cooldownDias: 5,
        },
        {
          id: 'zapallito-flores',
          texto: '¿Aparecieron flores?',
          etiqueta: 'Flores',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 4,
          accion: { respuesta: 'Sí', eventoTipo: 'floracion', label: 'Registrar floración' },
        },
      ],
      floracion: [
        {
          id: 'zapallito-frutos-iniciando',
          texto: '¿Observás frutos iniciando?',
          etiqueta: 'Frutos iniciando',
          opciones: ['No', 'Algunos', 'Varios'],
          cooldownDias: 4,
        },
      ],
      produccion: [
        {
          id: 'zapallito-frutos-listos',
          texto: '¿Hay frutos listos para cosechar?',
          etiqueta: 'Frutos listos',
          opciones: ['No', 'Algunos', 'Varios'],
          cooldownDias: 3,
          accion: { respuesta: 'Varios', eventoTipo: 'cosecha', label: 'Registrar cosecha' },
        },
      ],
    },

    calabaza: {
      plantula: [
        {
          id: 'calabaza-hojas-verdaderas',
          texto: '¿Aparecieron las hojas verdaderas?',
          etiqueta: 'Hojas verdaderas',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 4,
        },
      ],
      crecimiento: [
        {
          id: 'calabaza-guia-activa',
          texto: '¿La guía está creciendo activamente?',
          etiqueta: 'Guía',
          opciones: ['Sí', 'Lento', 'No'],
          cooldownDias: 6,
        },
        {
          id: 'calabaza-flores',
          texto: '¿Aparecieron flores?',
          etiqueta: 'Flores',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 6,
          accion: { respuesta: 'Sí', eventoTipo: 'floracion', label: 'Registrar floración' },
        },
      ],
      floracion: [
        {
          id: 'calabaza-frutos-iniciando',
          texto: '¿Observás frutos iniciando?',
          etiqueta: 'Frutos iniciando',
          opciones: ['No', 'Algunos', 'Varios'],
          cooldownDias: 6,
        },
      ],
      produccion: [
        {
          id: 'calabaza-cascara-dura',
          texto: '¿La cáscara ya está dura al presionarla con la uña?',
          etiqueta: 'Cáscara madura',
          opciones: ['No', 'Casi', 'Sí'],
          cooldownDias: 6,
          accion: { respuesta: 'Sí', eventoTipo: 'cosecha', label: 'Registrar cosecha' },
        },
      ],
    },

    pepino: {
      plantula: [
        {
          id: 'pepino-hojas-verdaderas',
          texto: '¿Aparecieron las hojas verdaderas?',
          etiqueta: 'Hojas verdaderas',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 3,
        },
      ],
      crecimiento: [
        {
          id: 'pepino-guia-activa',
          texto: '¿Está trepando o extendiéndose activamente?',
          etiqueta: 'Guía',
          opciones: ['Sí', 'Lento', 'No'],
          cooldownDias: 5,
        },
        {
          id: 'pepino-flores',
          texto: '¿Aparecieron flores?',
          etiqueta: 'Flores',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 4,
          accion: { respuesta: 'Sí', eventoTipo: 'floracion', label: 'Registrar floración' },
        },
      ],
      floracion: [
        {
          id: 'pepino-frutos-iniciando',
          texto: '¿Observás frutos iniciando?',
          etiqueta: 'Frutos iniciando',
          opciones: ['No', 'Algunos', 'Varios'],
          cooldownDias: 4,
        },
      ],
      produccion: [
        {
          id: 'pepino-frutos-listos',
          texto: '¿Hay frutos listos para cosechar?',
          etiqueta: 'Frutos listos',
          opciones: ['No', 'Algunos', 'Varios'],
          cooldownDias: 3,
          accion: { respuesta: 'Varios', eventoTipo: 'cosecha', label: 'Registrar cosecha' },
        },
      ],
    },

    melon: {
      plantula: [
        {
          id: 'melon-hojas-verdaderas',
          texto: '¿Aparecieron las hojas verdaderas?',
          etiqueta: 'Hojas verdaderas',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 4,
        },
      ],
      crecimiento: [
        {
          id: 'melon-guia-activa',
          texto: '¿La guía está creciendo activamente?',
          etiqueta: 'Guía',
          opciones: ['Sí', 'Lento', 'No'],
          cooldownDias: 6,
        },
        {
          id: 'melon-flores',
          texto: '¿Aparecieron flores?',
          etiqueta: 'Flores',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 6,
          accion: { respuesta: 'Sí', eventoTipo: 'floracion', label: 'Registrar floración' },
        },
      ],
      floracion: [
        {
          id: 'melon-frutos-iniciando',
          texto: '¿Observás frutos iniciando?',
          etiqueta: 'Frutos iniciando',
          opciones: ['No', 'Algunos', 'Varios'],
          cooldownDias: 6,
        },
      ],
      produccion: [
        {
          id: 'melon-aroma-color',
          texto: '¿El fruto cambió de color o empezó a tener aroma?',
          etiqueta: 'Señales de madurez',
          opciones: ['No', 'Empezando', 'Sí'],
          cooldownDias: 5,
          accion: { respuesta: 'Sí', eventoTipo: 'cosecha', label: 'Registrar cosecha' },
        },
      ],
    },

    sandia: {
      plantula: [
        {
          id: 'sandia-hojas-verdaderas',
          texto: '¿Aparecieron las hojas verdaderas?',
          etiqueta: 'Hojas verdaderas',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 4,
        },
      ],
      crecimiento: [
        {
          id: 'sandia-guia-activa',
          texto: '¿La guía está creciendo activamente?',
          etiqueta: 'Guía',
          opciones: ['Sí', 'Lento', 'No'],
          cooldownDias: 6,
        },
        {
          id: 'sandia-flores',
          texto: '¿Aparecieron flores?',
          etiqueta: 'Flores',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 6,
          accion: { respuesta: 'Sí', eventoTipo: 'floracion', label: 'Registrar floración' },
        },
      ],
      floracion: [
        {
          id: 'sandia-frutos-iniciando',
          texto: '¿Observás frutos iniciando?',
          etiqueta: 'Frutos iniciando',
          opciones: ['No', 'Algunos', 'Varios'],
          cooldownDias: 6,
        },
      ],
      produccion: [
        {
          id: 'sandia-zarcillo-seco',
          texto: '¿El zarcillo más cercano al fruto ya se secó?',
          etiqueta: 'Señal de madurez',
          opciones: ['No', 'Empezando', 'Sí'],
          cooldownDias: 5,
          pista: '🍉 El zarcillo seco cerca del fruto suele ser una señal más confiable que el color de la cáscara.',
          accion: { respuesta: 'Sí', eventoTipo: 'cosecha', label: 'Registrar cosecha' },
        },
      ],
    },

    maiz: {
      germinacion: [
        {
          id: 'maiz-germino',
          texto: '¿Ya germinó?',
          etiqueta: 'Germinación',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 3,
          accion: { respuesta: 'Sí', eventoTipo: 'germinacion', label: 'Registrar germinación' },
          recordatorio: { respuesta: 'Todavía no', dias: 3, titulo: 'Revisar germinación' },
        },
      ],
      crecimiento: [
        {
          id: 'maiz-altura',
          texto: '¿Cómo viene la altura de la planta?',
          etiqueta: 'Altura',
          opciones: ['Buena', 'Despareja', 'Baja para la etapa'],
          cooldownDias: 7,
        },
        {
          id: 'maiz-panoja',
          texto: '¿Apareció la panoja (flor macho, arriba)?',
          etiqueta: 'Panoja',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 6,
          accion: { respuesta: 'Sí', eventoTipo: 'floracion', label: 'Registrar floración' },
        },
      ],
      floracion: [
        {
          id: 'maiz-chalas',
          texto: '¿Aparecieron los pelos/chalas de las espigas?',
          etiqueta: 'Chalas',
          opciones: ['No', 'Algunas', 'Varias'],
          cooldownDias: 5,
        },
      ],
      produccion: [
        {
          id: 'maiz-choclos-listos',
          texto: '¿Los choclos ya se ven llenos y listos?',
          etiqueta: 'Choclos listos',
          opciones: ['No', 'Casi', 'Sí'],
          cooldownDias: 4,
          accion: { respuesta: 'Sí', eventoTipo: 'cosecha', label: 'Registrar cosecha' },
        },
      ],
    },

    papa: {
      germinacion: [
        {
          id: 'papa-brotes',
          texto: '¿Emergieron los brotes?',
          etiqueta: 'Brotes',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 5,
          accion: { respuesta: 'Sí', eventoTipo: 'germinacion', label: 'Registrar emergencia' },
        },
      ],
      crecimiento: [
        {
          id: 'papa-aporque',
          texto: '¿Conviene agregar cobertura o tierra alrededor del tallo?',
          etiqueta: 'Aporque/cobertura',
          opciones: ['Todavía no', 'Pronto', 'Sí, ya'],
          cooldownDias: 8,
        },
        {
          id: 'papa-vigor-follaje',
          texto: '¿El follaje se ve vigoroso y verde?',
          etiqueta: 'Vigor de follaje',
          opciones: ['Sí', 'Parcial', 'No'],
          cooldownDias: 7,
        },
      ],
      floracion: [
        {
          id: 'papa-floracion',
          texto: '¿La planta está entrando en floración?',
          etiqueta: 'Floración',
          opciones: ['No', 'Empezando', 'Sí'],
          cooldownDias: 6,
          accion: { respuesta: 'Sí', eventoTipo: 'floracion', label: 'Registrar floración' },
        },
      ],
      produccion: [
        {
          id: 'papa-follaje-decae',
          texto: '¿El follaje empieza a amarillear o decaer de forma pareja?',
          etiqueta: 'Follaje decayendo',
          opciones: ['No', 'Empezando', 'Sí, bastante'],
          cooldownDias: 6,
          pista: '🌱 En papa, el follaje que decae parejo suele indicar que los tubérculos están terminando de formarse — no siempre es un problema.',
          accion: { respuesta: 'Sí, bastante', eventoTipo: 'cosecha', label: 'Registrar cosecha' },
        },
      ],
    },

    batata: {
      crecimiento: [
        {
          id: 'batata-guias-activas',
          texto: '¿Las guías están creciendo activamente?',
          etiqueta: 'Guías',
          opciones: ['Sí', 'Lento', 'No'],
          cooldownDias: 8,
        },
        {
          id: 'batata-cobertura',
          texto: '¿Las guías ya cubren bien el suelo?',
          etiqueta: 'Cobertura del suelo',
          opciones: ['No', 'Parcial', 'Sí'],
          cooldownDias: 10,
        },
        {
          id: 'batata-vigor',
          texto: '¿Las guías se ven vigorosas y con hojas grandes?',
          etiqueta: 'Vigor de guías',
          opciones: ['Sí', 'Parcial', 'No'],
          cooldownDias: 8,
        },
      ],
      produccion: [
        {
          id: 'batata-tiempo-cosecha',
          texto: '¿Ya pasó bastante tiempo desde la plantación (110+ días)?',
          etiqueta: 'Tiempo transcurrido',
          opciones: ['No todavía', 'Se acerca', 'Sí'],
          cooldownDias: 10,
        },
        {
          id: 'batata-tuberculos-expuestos',
          texto: '¿Hay raíces o tubérculos asomando en la superficie?',
          etiqueta: 'Tubérculos expuestos',
          opciones: ['No', 'Algunos'],
          cooldownDias: 8,
        },
      ],
    },

    acelga: {
      plantula: [
        {
          id: 'acelga-hojas-verdaderas',
          texto: '¿Aparecieron las hojas verdaderas?',
          etiqueta: 'Hojas verdaderas',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 4,
        },
      ],
      crecimiento: [
        {
          id: 'acelga-listas-cosecha',
          texto: '¿Las pencas ya tienen buen tamaño para cosechar de a poco?',
          etiqueta: 'Listas para cosecha',
          opciones: ['Todavía no', 'Algunas', 'Sí'],
          cooldownDias: 5,
        },
        {
          id: 'acelga-densidad',
          texto: '¿Las plantas están muy juntas entre sí?',
          etiqueta: 'Densidad',
          opciones: ['No', 'Un poco', 'Sí, conviene raleo'],
          cooldownDias: 8,
        },
      ],
      produccion: [
        {
          id: 'acelga-rebrote',
          texto: '¿Rebrotó bien después del último corte?',
          etiqueta: 'Rebrote',
          opciones: ['Sí', 'Lento', 'No corté todavía'],
          cooldownDias: 6,
        },
        {
          id: 'acelga-floracion-riesgo',
          texto: '¿Está empezando a espigar (subir flor)?',
          etiqueta: 'Espigado',
          opciones: ['No', 'Empezando', 'Sí'],
          cooldownDias: 6,
        },
      ],
    },

    espinaca: {
      plantula: [
        {
          id: 'espinaca-hojas-verdaderas',
          texto: '¿Aparecieron las hojas verdaderas?',
          etiqueta: 'Hojas verdaderas',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 3,
        },
      ],
      crecimiento: [
        {
          id: 'espinaca-listas-cosecha',
          texto: '¿Las hojas ya tienen buen tamaño?',
          etiqueta: 'Listas para cosecha',
          opciones: ['Todavía no', 'Algunas', 'Sí'],
          cooldownDias: 4,
        },
        {
          id: 'espinaca-espigando',
          texto: '¿Está empezando a espigar (subir flor)?',
          etiqueta: 'Espigado',
          opciones: ['No', 'Empezando', 'Sí'],
          cooldownDias: 4,
          pista: '🌱 El calor suele adelantar el espigado; si ya empezó, conviene cosechar pronto antes de que amargue.',
        },
        {
          id: 'espinaca-densidad',
          texto: '¿Las plantas están muy juntas entre sí?',
          etiqueta: 'Densidad',
          opciones: ['No', 'Un poco', 'Sí, conviene raleo'],
          cooldownDias: 8,
        },
      ],
      produccion: [
        {
          id: 'espinaca-rebrote',
          texto: '¿Rebrotó bien después del último corte?',
          etiqueta: 'Rebrote',
          opciones: ['Sí', 'Lento', 'No corté todavía'],
          cooldownDias: 6,
        },
      ],
    },

    rucula: {
      germinacion: [
        {
          id: 'rucula-germino',
          texto: '¿Ya germinó?',
          etiqueta: 'Germinación',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 2,
          accion: { respuesta: 'Sí', eventoTipo: 'germinacion', label: 'Registrar germinación' },
        },
      ],
      crecimiento: [
        {
          id: 'rucula-listas-cosecha',
          texto: '¿Las hojas ya tienen buen tamaño?',
          etiqueta: 'Listas para cosecha',
          opciones: ['Todavía no', 'Algunas', 'Sí'],
          cooldownDias: 3,
        },
        {
          id: 'rucula-espigando',
          texto: '¿Está empezando a espigar (subir flor)?',
          etiqueta: 'Espigado',
          opciones: ['No', 'Empezando', 'Sí'],
          cooldownDias: 3,
        },
        {
          id: 'rucula-densidad',
          texto: '¿Las plantas están muy juntas entre sí?',
          etiqueta: 'Densidad',
          opciones: ['No', 'Un poco', 'Sí, conviene raleo'],
          cooldownDias: 6,
        },
      ],
      produccion: [
        {
          id: 'rucula-rebrote',
          texto: '¿Rebrotó bien después del último corte?',
          etiqueta: 'Rebrote',
          opciones: ['Sí', 'Lento', 'No corté todavía'],
          cooldownDias: 5,
        },
      ],
    },

    lechuga: {
      germinacion: [
        {
          id: 'lechuga-germino',
          texto: '¿Ya germinó?',
          etiqueta: 'Germinación',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 3,
          accion: { respuesta: 'Sí', eventoTipo: 'germinacion', label: 'Registrar germinación' },
        },
      ],
      plantula: [
        {
          id: 'lechuga-listo-trasplante',
          texto: '¿Está desarrollando estructura suficiente para trasplante?',
          etiqueta: 'Listo para trasplante',
          opciones: ['Todavía no', 'Casi', 'Sí'],
          cooldownDias: 5,
          accion: { respuesta: 'Sí', eventoTipo: 'trasplante', label: 'Registrar trasplante' },
        },
      ],
      crecimiento: [
        {
          id: 'lechuga-formando-cabeza',
          texto: '¿Está formando cabeza o buen volumen de hojas?',
          etiqueta: 'Formación',
          opciones: ['Todavía no', 'Empezando', 'Sí'],
          cooldownDias: 5,
        },
        {
          id: 'lechuga-espigando',
          texto: '¿Está empezando a espigar (subir flor)?',
          etiqueta: 'Espigado',
          opciones: ['No', 'Empezando', 'Sí'],
          cooldownDias: 4,
        },
      ],
      produccion: [
        {
          id: 'lechuga-lista-cosecha',
          texto: '¿Ya tiene tamaño para cosechar (entera o de a hojas)?',
          etiqueta: 'Lista para cosecha',
          opciones: ['Todavía no', 'De a hojas', 'Entera'],
          cooldownDias: 5,
        },
      ],
    },

    haba: {
      germinacion: [
        {
          id: 'haba-germino',
          texto: '¿Ya germinó?',
          etiqueta: 'Germinación',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 4,
          accion: { respuesta: 'Sí', eventoTipo: 'germinacion', label: 'Registrar germinación' },
          recordatorio: { respuesta: 'Todavía no', dias: 4, titulo: 'Revisar germinación' },
        },
      ],
      crecimiento: [
        {
          id: 'haba-altura',
          texto: '¿Cómo viene la altura de la planta?',
          etiqueta: 'Altura',
          opciones: ['Buena', 'Despareja', 'Baja para la etapa'],
          cooldownDias: 7,
        },
        {
          id: 'haba-tutor',
          texto: '¿Necesita algo para no tumbarse (tutorado o rodrigón)?',
          etiqueta: 'Tutorado',
          opciones: ['No', 'Pronto', 'Ya lo necesita'],
          cooldownDias: 8,
        },
      ],
      floracion: [
        {
          id: 'haba-flores',
          texto: '¿Aparecieron flores?',
          etiqueta: 'Flores',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 6,
          accion: { respuesta: 'Sí', eventoTipo: 'floracion', label: 'Registrar floración' },
        },
      ],
      produccion: [
        {
          id: 'haba-vainas',
          texto: '¿Hay vainas formándose?',
          etiqueta: 'Vainas',
          opciones: ['No', 'Algunas', 'Varias'],
          cooldownDias: 5,
        },
      ],
    },

    arveja: {
      germinacion: [
        {
          id: 'arveja-germino',
          texto: '¿Ya germinó?',
          etiqueta: 'Germinación',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 4,
          accion: { respuesta: 'Sí', eventoTipo: 'germinacion', label: 'Registrar germinación' },
          recordatorio: { respuesta: 'Todavía no', dias: 4, titulo: 'Revisar germinación' },
        },
      ],
      crecimiento: [
        {
          id: 'arveja-tutor',
          texto: '¿Ya necesita algo para trepar o apoyarse?',
          etiqueta: 'Tutorado',
          opciones: ['No', 'Pronto', 'Ya lo necesita'],
          cooldownDias: 7,
        },
        {
          id: 'arveja-altura',
          texto: '¿Cómo viene la altura de la planta?',
          etiqueta: 'Altura',
          opciones: ['Buena', 'Despareja', 'Baja para la etapa'],
          cooldownDias: 7,
        },
      ],
      floracion: [
        {
          id: 'arveja-flores',
          texto: '¿Aparecieron flores?',
          etiqueta: 'Flores',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 5,
          accion: { respuesta: 'Sí', eventoTipo: 'floracion', label: 'Registrar floración' },
        },
      ],
      produccion: [
        {
          id: 'arveja-vainas',
          texto: '¿Hay vainas formándose?',
          etiqueta: 'Vainas',
          opciones: ['No', 'Algunas', 'Varias'],
          cooldownDias: 4,
        },
      ],
    },

    albahaca: {
      germinacion: [
        {
          id: 'albahaca-germino',
          texto: '¿Ya germinó?',
          etiqueta: 'Germinación',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 3,
          accion: { respuesta: 'Sí', eventoTipo: 'germinacion', label: 'Registrar germinación' },
          recordatorio: { respuesta: 'Todavía no', dias: 3, titulo: 'Revisar germinación' },
        },
      ],
      plantula: [
        {
          id: 'albahaca-hojas-verdaderas',
          texto: '¿Aparecieron las hojas verdaderas?',
          etiqueta: 'Hojas verdaderas',
          opciones: ['Sí', 'Todavía no'],
          resuelvePermanente: ['Sí'],
          cooldownDias: 4,
        },
      ],
      crecimiento: [
        {
          id: 'albahaca-pinzado',
          texto: '¿Conviene despuntarla para que ramifique más?',
          etiqueta: 'Despunte',
          opciones: ['Todavía no', 'Sí, ya está lista'],
          cooldownDias: 6,
          pista: '🌿 Despuntar por encima de un par de hojas suele estimular ramas nuevas y retrasar la floración.',
        },
        {
          id: 'albahaca-espigando',
          texto: '¿Está empezando a florecer?',
          etiqueta: 'Floración',
          opciones: ['No', 'Empezando', 'Sí'],
          cooldownDias: 5,
        },
      ],
      produccion: [
        {
          id: 'albahaca-hojas-listas',
          texto: '¿Hay suficientes hojas para cosechar?',
          etiqueta: 'Hojas listas',
          opciones: ['Pocas', 'Algunas', 'Muchas'],
          cooldownDias: 5,
        },
      ],
    },

    // Especies de servicio / agroforestales — biblioteca reducida a
    // propósito, para probar la arquitectura sin cargar contenido de más.
    tithonia: {
      crecimiento: [
        {
          id: 'tithonia-creciendo',
          texto: '¿Está creciendo activamente?',
          etiqueta: 'Crecimiento',
          opciones: ['Sí', 'Lento', 'Detenido'],
          cooldownDias: 8,
        },
        {
          id: 'tithonia-sombreando',
          texto: '¿Está empezando a sombrear otra planta?',
          etiqueta: 'Sombra sobre otras plantas',
          opciones: ['No', 'Un poco', 'Sí'],
          cooldownDias: 8,
        },
      ],
      produccion: [
        {
          id: 'tithonia-biomasa-poda',
          texto: '¿Acumuló suficiente biomasa para una poda?',
          etiqueta: 'Lista para poda',
          opciones: ['Todavía no', 'Casi', 'Sí'],
          cooldownDias: 10,
          accion: { respuesta: 'Sí', eventoTipo: 'poda', label: 'Registrar poda' },
        },
        {
          id: 'tithonia-rebrote',
          texto: '¿Rebrotó bien después de la última poda?',
          etiqueta: 'Rebrote',
          opciones: ['Sí', 'Lento', 'No podé todavía'],
          cooldownDias: 10,
        },
        {
          id: 'tithonia-destino-biomasa',
          texto: '¿Dónde podría aprovecharse mejor esa biomasa?',
          etiqueta: 'Destino de la biomasa',
          opciones: ['Cobertura', 'Compost', 'Todavía no decidido'],
          cooldownDias: 12,
        },
      ],
    },

    leucaena: {
      crecimiento: [
        {
          id: 'leucaena-estructura',
          texto: '¿Está desarrollando suficiente estructura?',
          etiqueta: 'Estructura',
          opciones: ['Sí', 'Lento', 'Todavía poco'],
          cooldownDias: 10,
        },
        {
          id: 'leucaena-espacio-aereo',
          texto: '¿Está ocupando demasiado espacio aéreo?',
          etiqueta: 'Espacio aéreo',
          opciones: ['No', 'Un poco', 'Sí'],
          cooldownDias: 10,
        },
      ],
      produccion: [
        {
          id: 'leucaena-sombra-estratos',
          texto: '¿Está sombreando especies de estratos inferiores?',
          etiqueta: 'Sombra sobre estratos bajos',
          opciones: ['No', 'Un poco', 'Sí, bastante'],
          cooldownDias: 8,
        },
        {
          id: 'leucaena-momento-poda',
          texto: '¿Es momento de evaluar una poda?',
          etiqueta: 'Evaluar poda',
          opciones: ['Todavía no', 'Podría ser', 'Sí'],
          cooldownDias: 10,
          accion: { respuesta: 'Sí', eventoTipo: 'poda', label: 'Registrar poda' },
        },
        {
          id: 'leucaena-respuesta-corte',
          texto: '¿Cómo respondió al último corte?',
          etiqueta: 'Respuesta al corte',
          opciones: ['Bien', 'Lenta', 'No podé todavía'],
          cooldownDias: 10,
        },
      ],
    },

    banano: {
      crecimiento: [
        {
          id: 'banano-hijuelos',
          texto: '¿Está emitiendo hijuelos?',
          etiqueta: 'Hijuelos',
          opciones: ['No', 'Uno', 'Varios'],
          cooldownDias: 10,
        },
        {
          id: 'banano-pseudotallos',
          texto: '¿Cuántos pseudotallos activos hay aproximadamente?',
          etiqueta: 'Pseudotallos activos',
          opciones: ['Uno', 'Dos o tres', 'Varios'],
          cooldownDias: 12,
        },
        {
          id: 'banano-vigor',
          texto: '¿El pseudotallo principal se ve vigoroso?',
          etiqueta: 'Vigor',
          opciones: ['Sí', 'Parcial', 'No'],
          cooldownDias: 10,
        },
      ],
      produccion: [
        {
          id: 'banano-sombra-generada',
          texto: '¿Está generando demasiada sombra alrededor?',
          etiqueta: 'Sombra generada',
          opciones: ['No', 'Un poco', 'Sí'],
          cooldownDias: 10,
        },
        {
          id: 'banano-material-cobertura',
          texto: '¿Hay hojas u otro material disponible para usar como cobertura?',
          etiqueta: 'Material para cobertura',
          opciones: ['No', 'Poco', 'Sí, bastante'],
          cooldownDias: 10,
        },
      ],
    },
  },
};

// Alias de nombres libres -> id interno (mismo id que cultivos-data.js para
// las especies que están en ambas bibliotecas). Ordenados de más específico
// a más genérico para que "tomate cherry" no matchee primero con "tomate".
const ALIAS_ESPECIES_PREGUNTAS = {
  'tomate-cherry': ['tomate cherry', 'cherry tomate', 'cherry'],
  tomate: ['tomate'],
  berenjena: ['berenjena'],
  morron: ['morron', 'pimiento', 'aji', 'morron pimiento', 'aji morron'],
  zucchini: ['zucchini', 'zapallo italiano'],
  zapallito: ['zapallito'],
  calabaza: ['calabaza', 'zapallo'],
  pepino: ['pepino'],
  melon: ['melon'],
  sandia: ['sandia'],
  maiz: ['maiz', 'choclo'],
  papa: ['papa', 'patata'],
  batata: ['batata', 'boniato', 'camote'],
  acelga: ['acelga'],
  espinaca: ['espinaca'],
  rucula: ['rucula'],
  lechuga: ['lechuga'],
  haba: ['haba'],
  arveja: ['arveja', 'chicharo'],
  albahaca: ['albahaca'],
  tithonia: ['tithonia'],
  leucaena: ['leucaena'],
  banano: ['banano', 'banana', 'platano'],

  // Estas 5 especies están en cultivos-data.js (siembra/etapas/imagen)
  // pero todavía no tienen preguntas específicas cargadas en este archivo
  // — identificarEspecie() igual las resuelve para que la imagen
  // predeterminada y la estimación de etapa (que sí usa cultivos-data.js)
  // funcionen bien; obtenerPreguntasActuales cae a preguntas generales
  // para ellas, tal como ya hacía antes de que existiera este alias.
  zanahoria: ['zanahoria'],
  remolacha: ['remolacha', 'betarraga', 'beterraga'],
  poroto: ['poroto', 'frijol', 'judia', 'chaucha'],
  puerro: ['puerro'],
  cebolla: ['cebolla'],
};

// Encuentra el id interno de especie a partir de un nombre libre (el que
// escribe el usuario en "Especie"). Devuelve null si no hay coincidencia —
// en ese caso el motor de observación usa solo preguntas generales.
function identificarEspecie(nombreEspecie) {
  const norm = normalizarTexto(nombreEspecie);
  if (!norm) return null;

  const candidatos = [];
  Object.entries(ALIAS_ESPECIES_PREGUNTAS).forEach(([id, alias]) => {
    alias.forEach((a) => candidatos.push({ id, alias: a }));
  });
  candidatos.sort((a, b) => b.alias.length - a.alias.length);

  const exacto = candidatos.find((c) => c.alias === norm);
  if (exacto) return exacto.id;

  const parcial = candidatos.find((c) => norm.includes(c.alias));
  return parcial ? parcial.id : null;
}
