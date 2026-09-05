// sw.js — Service Worker de Cultivarnos
// Estrategia: network-first con fallback a cache para el shell de la app
// (así las actualizaciones se ven al toque sin depender de que el usuario
// borre el caché a mano), con reserva completa para uso 100% offline.
//
// Versionado: APP_VERSION vive ACÁ, y solo acá, a propósito. El navegador
// detecta que hay una actualización comparando byte a byte el contenido de
// ESTE archivo contra la versión registrada — un archivo separado cargado
// con importScripts() no se compara, así que definir la versión en otro
// lado no dispararía el aviso de actualización. Por eso el resto de la app
// (ej. la pantalla de Configuración) NO tiene su propia copia del número:
// lo consulta en tiempo de ejecución mandándole un mensaje a este Service
// Worker (ver utils.js#obtenerVersionApp). Una sola fuente de verdad real.
const APP_VERSION = '1.23.0';

const CACHE_NAME = `cultivarnos-v${APP_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/icons.js',
  './js/db.js',
  './js/utils.js',
  // Identidad + cuenta + sincronización (Firebase) — mismo motivo que
  // cualquier otro <script> de esta lista: sin esto acá, en el primer
  // arranque de la PWA (antes de que este Service Worker termine de
  // instalarse y tome control) el listener de 'fetch' de más abajo
  // todavía no intercepta nada, así que estos archivos NO quedarían
  // cacheados solos con el cacheo en tiempo de ejecución — recién en una
  // segunda visita con red. Precachearlos acá garantiza que estén
  // disponibles offline desde la primera instalación, igual que el resto
  // del App Shell. (Esto es distinto del SDK de Firebase en sí, que se
  // importa dinámicamente desde gstatic.com — cross-origin, `response.type`
  // 'cors'/'opaque' — y a propósito NO se cachea acá: ver el comentario en
  // el listener de 'fetch' más abajo.)
  './js/firebase/firebase-config.js',
  './js/firebase/firebase-auth.js',
  './js/firebase/firebase-sync.js',
  './js/firebase/firebase-messaging.js',
  './js/data/cultivos-data.js',
  './js/data/biblioteca-especies.js',
  './js/motor-biblioteca.js',
  './js/motor-home-layout.js',
  './js/motor-orden-cultivos.js',
  './js/motor-lista-reordenable.js',
  './js/motor-estacional.js',
  './js/data/preguntas-cultivos.js',
  './js/motor-observacion.js',
  './js/motor-siembra.js',
  './js/motor-cosecha.js',
  './js/motor-espacios.js',
  './js/motor-movimientos.js',
  './js/motor-resumen.js',
  './js/motor-tarjeta.js',
  './js/views/inicio.js',
  './js/views/cultivos.js',
  './js/views/nuevo.js',
  './js/views/detalle.js',
  './js/views/configuracion.js',
  './js/views/calendario.js',
  './js/views/biblioteca.js',
  './js/views/ficha-especie.js',
  './js/views/espacios.js',
  './js/views/compartir.js',
  './js/motor-banco.js',
  './js/views/banco.js',
  './js/views/banco-nuevo.js',
  './js/views/banco-detalle.js',
  './js/views/riego-multiple.js',
  './js/views/auth.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  // Logo del header (ver css/styles.css#.topbar-title) — se precachea acá
  // igual que los íconos de PWA de arriba, así aparece desde la primera
  // apertura offline y no depende de haber tenido señal antes.
  './assets/logo-cultivarnos.svg',
  // Imágenes predeterminadas por especie (assets locales, livianas — ver
  // js/data/cultivos-data.js#imagen). Se precachean acá para que se vean
  // offline desde la primera instalación, sin depender de haber tenido
  // conexión antes en cada cultivo.
  './assets/cultivos/tomate.webp',
  './assets/cultivos/tomate-cherry.webp',
  './assets/cultivos/berenjena.webp',
  './assets/cultivos/morron.webp',
  './assets/cultivos/zucchini.webp',
  './assets/cultivos/zapallito.webp',
  './assets/cultivos/calabaza.webp',
  './assets/cultivos/pepino.webp',
  './assets/cultivos/melon.webp',
  './assets/cultivos/sandia.webp',
  './assets/cultivos/maiz.webp',
  './assets/cultivos/papa.webp',
  './assets/cultivos/batata.webp',
  './assets/cultivos/zanahoria.webp',
  './assets/cultivos/remolacha.webp',
  './assets/cultivos/acelga.webp',
  './assets/cultivos/espinaca.webp',
  './assets/cultivos/rucula.webp',
  './assets/cultivos/lechuga.webp',
  './assets/cultivos/arveja.webp',
  './assets/cultivos/haba.webp',
  './assets/cultivos/poroto.webp',
  './assets/cultivos/puerro.webp',
  './assets/cultivos/cebolla.webp',
  './assets/cultivos/albahaca.webp',
  './assets/cultivos/tithonia.webp',
  './assets/cultivos/leucaena.webp',
  './assets/cultivos/banano.webp',
];

// Ampliación de la Biblioteca (ahora 123 especies, incluida la categoría
// "🌸 Flores" con 19 especies nuevas más Achiras, y Pasto limón como
// especie aromática): a propósito NO agregamos
// acá las imágenes nuevas de assets/cultivos/. Precachear cada WebP nuevo
// engordaría el App Shell y demoraría la instalación/actualización sin
// necesidad real — el listener de 'fetch' de abajo ya cachea en tiempo de
// ejecución cualquier GET exitoso (network-first, con cache.put() del
// clone de la respuesta), así que la primera vez que alguien abre la ficha
// de una especie nueva, su imagen queda disponible offline desde ese
// momento en adelante, sin ningún cambio de código acá. Las imágenes de
// las 10 especies piloto originales siguen precacheadas arriba porque ya
// lo estaban desde v1 — no las sacamos para no cambiar comportamiento
// existente sin necesidad.

// ---------------------------------------------------------------------
// Push Notifications (Firebase Cloud Messaging) — solo la recepción en
// SEGUNDO PLANO/app cerrada. Con la app en primer plano, el manejo de
// mensajes vive en js/firebase/firebase-messaging.js (onMessage) — a
// propósito separado, para no mostrar una notificación del sistema Y un
// aviso interno a la vez (ver docs/firebase-architecture.md).
//
// Un Service Worker clásico (este archivo no se registra con
// {type:'module'} — ver app.js#inicializarServiceWorker) no puede usar
// `import` de ES modules: solo puede cargar scripts clásicos con
// importScripts(). Por eso acá se usa el SDK "compat" de Firebase en vez
// del modular que usa el resto de la app — es el patrón oficial y VIGENTE
// de Firebase para Service Workers (no una API vieja/deprecated), ver
// https://firebase.google.com/docs/cloud-messaging/js/receive.
//
// Se integra en ESTE Service Worker (no en un firebase-messaging-sw.js
// aparte) a propósito: dos Service Workers distintos sobre el mismo scope
// no son compatibles entre sí — solo puede haber uno activo por scope, y
// separar esto rompería justamente el cache/offline/actualización que ya
// funciona. Todo lo de abajo es aditivo: si falla (sin red, CDN
// bloqueado, navegador sin soporte), el resto del Service Worker sigue
// funcionando exactamente igual.
try {
  importScripts(`https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js`);
  importScripts(`https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js`);

  // Mismos valores públicos que js/firebase/firebase-config.js (el apiKey
  // de Firebase no es un secreto — ver el comentario largo ahí). Se
  // duplican acá porque este contexto no puede import() el módulo de
  // configuración — es el mismo patrón que documenta Firebase para
  // firebase-messaging-sw.js. Si el proyecto Firebase cambia alguna vez,
  // actualizar los dos lugares.
  firebase.initializeApp({
    apiKey: 'AIzaSyCxGhrf-ZLt1jR8pita2tBG1FIqcWgy-KI',
    authDomain: 'cultivarnos-8331b.firebaseapp.com',
    projectId: 'cultivarnos-8331b',
    storageBucket: 'cultivarnos-8331b.firebasestorage.app',
    messagingSenderId: '841085924387',
    appId: '1:841085924387:web:5ec340e123e587c42d2d96',
  });

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const titulo = (payload.notification && payload.notification.title) || 'Cultivarnos';
    const cuerpo = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || '';
    self.registration.showNotification(titulo, {
      body: cuerpo,
      // Ícono PWA ya aprobado (mismo que manifest.json) — nunca un emoji
      // como ícono del sistema.
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: payload.data || {},
    });
  });
} catch (err) {
  console.warn('[Cultivarnos SW] Firebase Messaging no disponible (sin red, CDN bloqueado, o sin soporte):', err);
}

// Toque en la notificación del sistema: enfocar una ventana ya abierta si
// existe (pedido explícito: no abrir instancias nuevas si se puede
// evitar) y llevarla al destino correspondiente. Recordatorio o
// sugerencia con cultivo asociado -> ficha de ese cultivo. Recordatorio
// sin cultivo -> Inicio (no hay una pantalla separada de "Recordatorios").
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const datos = event.notification.data || {};
  const destino = datos.cultivoId ? `./#/cultivo/${datos.cultivoId}` : './#/inicio';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (lista) => {
      const existente = lista.find((c) => 'focus' in c);
      if (existente) {
        try {
          await existente.navigate(destino);
        } catch (err) {
          // navigate() no está soportado en todos los navegadores (ej.
          // algunas versiones de Safari/iOS) — igual enfocamos la ventana
          // existente, mejor que nada.
        }
        return existente.focus();
      }
      return clients.openWindow(destino);
    })
  );
});

// A propósito NO llamamos self.skipWaiting() acá. Si es la primera
// instalación de la PWA (no hay ningún Service Worker activo todavía), este
// paso ni siquiera existe — el navegador activa este worker directamente.
// Si ya había una versión anterior activa, este worker nuevo queda
// "esperando" hasta que la persona confirme la actualización desde el
// banner (ver app.js) y mandemos el mensaje SKIP_WAITING de abajo. Así
// nunca se reemplaza el código en uso sin avisar, y nunca se interrumpe un
// formulario a mitad de completar.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  // Disparado desde app.js cuando la persona toca "Actualizar ahora" en el
  // banner de nueva versión. Nunca se llama solo — siempre por confirmación
  // explícita.
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  // Consulta de versión (ver utils.js#obtenerVersionApp) — así ningún otro
  // archivo necesita tener su propia copia de APP_VERSION.
  if (event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: APP_VERSION });
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // `response.type === 'basic'` de paso excluye, a propósito, los
        // imports dinámicos del SDK de Firebase (gstatic.com/firebasejs —
        // ver js/firebase/firebase-config.js): al ser cross-origin llegan
        // acá con type 'cors' u 'opaque', nunca 'basic', así que nunca se
        // cachean. Es lo que corresponde: Firebase mismo decide cuándo
        // conviene cachear su propio SDK, y `firebase-config.js` ya está
        // escrito para funcionar sin red de todos modos (ver el try/catch
        // de `inicializar()` ahí) — no hace falta ni conviene que este
        // Service Worker intente cachear un CDN de terceros.
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') return caches.match('./index.html');
        })
      )
  );
});
