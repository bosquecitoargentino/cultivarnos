// motorLoader.js — carga el motor de sugerencias (motor-observacion.js +
// motor-biblioteca.js + los datos de biblioteca/especies/preguntas) TAL
// CUAL corre en el navegador, sin reescribir ni una línea de lógica
// agronómica acá.
//
// Los archivos en functions/motor/ los copia el paso `predeploy` de
// firebase.json (ver ahí) desde js/ — nunca se editan a mano, y nunca se
// commitean (agregar functions/motor/ al .gitignore de functions si hace
// falta): en cada `firebase deploy` se vuelven a copiar desde la fuente
// real. Cero duplicación de lógica de negocio; ver la sección "Push
// Notifications" de docs/firebase-architecture.md para el razonamiento
// completo de esta decisión (opción B del pedido: reusar el motor en vez
// de sincronizar "candidatas" a Firestore).
//
// Se ejecutan con Node `vm` en un sandbox que imita el global scope de un
// <script> clásico de navegador (`window === el propio sandbox`, los
// `function`/`var` de nivel superior se adjuntan solos) — así estos
// archivos no necesitan ningún `module.exports` ni ningún cambio para
// funcionar acá exactamente igual que en el cliente.
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const fechasCompat = require('./fechas-compat');

const ARCHIVOS_MOTOR = [
  'cultivos-data.js',
  'biblioteca-especies.js',
  'preguntas-cultivos.js',
  'motor-biblioteca.js',
  'motor-observacion.js',
];

let motorCache = null;

function cargarMotor() {
  if (motorCache) return motorCache;

  const sandbox = {
    console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Map, Set,
    // Subconjunto puro de utils.js (cliente) que el motor necesita — ver
    // fechas-compat.js sobre por qué esto SÍ está duplicado a mano (a
    // diferencia de todo lo demás, que se copia solo en el deploy).
    aFechaLocal: fechasCompat.aFechaLocal,
    esFechaCalendario: fechasCompat.esFechaCalendario,
    normalizarTexto: fechasCompat.normalizarTexto,
    compararEventosPorFecha: fechasCompat.compararEventosPorFecha,
  };
  sandbox.window = sandbox; // mismo truco que un navegador real: window === el global scope.
  vm.createContext(sandbox);

  const dir = path.join(__dirname, '..', 'motor');
  for (const archivo of ARCHIVOS_MOTOR) {
    const ruta = path.join(dir, archivo);
    if (!fs.existsSync(ruta)) {
      throw new Error(
        `Falta functions/motor/${archivo}. Este directorio lo genera el ` +
        `predeploy de firebase.json copiando desde js/ — si estás corriendo ` +
        `el emulador local sin haber pasado por "firebase deploy" o ` +
        `"firebase emulators:start" (que también dispara predeploy), copialo ` +
        `a mano una vez para probar localmente.`
      );
    }
    const codigo = fs.readFileSync(ruta, 'utf8');
    vm.runInContext(codigo, sandbox, { filename: archivo });
  }

  motorCache = sandbox;
  return sandbox;
}

module.exports = { cargarMotor };
