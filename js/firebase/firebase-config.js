// firebase-config.js — capa de configuración de Firebase.
//
// Es un ES module (por eso index.html lo carga con <script type="module">,
// distinto del resto de la app que usa <script src> clásicos compartiendo
// window). El SDK de Firebase se importa DINÁMICAMENTE (import() dentro de
// un try/catch en inicializar(), más abajo) — nunca con un `import` estático
// arriba del archivo — a propósito: si el CDN no responde (sin internet,
// firewall corporativo, Firebase caído) esto tiene que degradar con
// gracia, nunca romper el arranque de la app. Cultivarnos es local-first:
// todo lo que ya funciona offline hoy tiene que seguir funcionando offline
// mañana, con o sin Firebase disponible.
//
// ---------------------------------------------------------------------
// CÓMO CONFIGURAR (antes de usar cuentas/sync con un proyecto real):
//
// 1. https://console.firebase.google.com → Crear proyecto. Un solo
//    proyecto, claramente identificado para testers de la beta (ver
//    docs/firebase-architecture.md, sección "Entornos").
// 2. Build > Authentication > Sign-in method → habilitar "Correo
//    electrónico/contraseña" y "Google". No habilitar nada más por ahora.
// 3. Build > Firestore Database → Crear base de datos, cualquier región.
//    Las reglas reales de seguridad viven en firestore.rules (en la raíz
//    del repo) — desplegarlas con `firebase deploy --only firestore:rules`
//    en vez de dejar las reglas abiertas de prueba de la consola.
// 4. ⚙ Configuración del proyecto > pestaña "Tus apps" > ícono Web (</>)
//    → registrar la app → copiar el objeto `firebaseConfig` que te
//    muestra ahí y pegarlo reemplazando FIREBASE_CONFIG acá abajo.
//
// El objeto de acá abajo es la configuración PÚBLICA de Firebase — el
// apiKey de un proyecto Firebase no es un secreto (identifica el
// proyecto, no autoriza nada por sí solo: la autorización real vive en
// Firestore Security Rules, ver firestore.rules). Aun así, NUNCA poner
// acá: claves de service account, credenciales de servidor, tokens
// admin, ni ningún secreto real.
// ---------------------------------------------------------------------

const FIREBASE_CONFIG = {
  apiKey: 'TU_API_KEY_ACA',
  authDomain: 'TU_PROYECTO.firebaseapp.com',
  projectId: 'TU_PROYECTO',
  storageBucket: 'TU_PROYECTO.appspot.com',
  messagingSenderId: 'TU_SENDER_ID',
  appId: 'TU_APP_ID',
};

// Versión fija del SDK (no "latest") — para que un cambio de versión del
// SDK sea una decisión explícita (editar esta línea), no algo que cambie
// solo un día cualquiera para todo el mundo a la vez.
const SDK_VERSION = '10.14.1';
const CDN_BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

function configurado() {
  return !!FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith('TU_');
}

let appPromise = null;

// Devuelve { app, auth, db, authMod, firestoreMod } una vez inicializado,
// o `null` si Firebase todavía no está configurado (valores de ejemplo)
// o si el SDK no se pudo cargar (sin red, CDN bloqueado, proyecto mal
// configurado, etc.). NUNCA lanza — nunca hay un throw que un caller
// pueda olvidarse de atrapar. Todo lo que dependa de esto (firebase-auth.js,
// firebase-sync.js) tiene que tratar `null` como "seguir funcionando
// local/offline", nunca como un error fatal que bloquee la app.
// Memoizado: la inicialización real corre una sola vez por carga de
// página, llamadas siguientes devuelven la misma promesa.
function obtenerFirebaseApp() {
  if (!appPromise) appPromise = inicializar();
  return appPromise;
}

async function inicializar() {
  if (!configurado()) {
    console.warn(
      '[Cultivarnos] Firebase todavía no está configurado (js/firebase/firebase-config.js ' +
      'tiene valores de ejemplo) — la app sigue funcionando 100% local, sin cuentas ni sync.'
    );
    return null;
  }
  try {
    const [{ initializeApp }, authMod, firestoreMod] = await Promise.all([
      import(/* @vite-ignore */ `${CDN_BASE}/firebase-app.js`),
      import(/* @vite-ignore */ `${CDN_BASE}/firebase-auth.js`),
      import(/* @vite-ignore */ `${CDN_BASE}/firebase-firestore.js`),
    ]);
    const app = initializeApp(FIREBASE_CONFIG);
    const auth = authMod.getAuth(app);
    const db = firestoreMod.getFirestore(app);
    return { app, auth, db, authMod, firestoreMod };
  } catch (err) {
    // Caso esperado y frecuente: sin conexión, CDN bloqueado por un
    // firewall/proxy corporativo, o el proyecto Firebase todavía no
    // existe de verdad. Se loguea como warning (no error) a propósito —
    // no es una falla de la app, es "sin nube por ahora".
    console.warn(
      '[Cultivarnos] No se pudo inicializar Firebase (sin conexión, CDN bloqueado, o ' +
      'configuración inválida) — la app sigue funcionando 100% local. Detalle:',
      err
    );
    return null;
  }
}

export { obtenerFirebaseApp, configurado, FIREBASE_CONFIG, SDK_VERSION };
