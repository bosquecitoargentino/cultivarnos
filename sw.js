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
const APP_VERSION = '1.2.0';

const CACHE_NAME = `cultivarnos-v${APP_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/utils.js',
  './js/data/cultivos-data.js',
  './js/data/biblioteca-especies.js',
  './js/motor-biblioteca.js',
  './js/motor-estacional.js',
  './js/data/preguntas-cultivos.js',
  './js/motor-observacion.js',
  './js/motor-siembra.js',
  './js/views/inicio.js',
  './js/views/cultivos.js',
  './js/views/nuevo.js',
  './js/views/detalle.js',
  './js/views/configuracion.js',
  './js/views/calendario.js',
  './js/views/biblioteca.js',
  './js/views/ficha-especie.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
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
