// sw.js — Service Worker de Cultivarnos
// Estrategia: network-first con fallback a cache para el shell de la app
// (así las actualizaciones se ven al toque sin depender de que el usuario
// borre el caché a mano), con reserva completa para uso 100% offline.

const CACHE_NAME = 'cultivarnos-v6';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/utils.js',
  './js/data/cultivos-data.js',
  './js/motor-estacional.js',
  './js/data/preguntas-cultivos.js',
  './js/motor-observacion.js',
  './js/views/inicio.js',
  './js/views/cultivos.js',
  './js/views/nuevo.js',
  './js/views/detalle.js',
  './js/views/configuracion.js',
  './js/views/calendario.js',
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
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
