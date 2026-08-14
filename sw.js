// sw.js — Service Worker de Cultivarnos
// Estrategia: network-first con fallback a cache para el shell de la app
// (así las actualizaciones se ven al toque sin depender de que el usuario
// borre el caché a mano), con reserva completa para uso 100% offline.

const CACHE_NAME = 'cultivarnos-v3';
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
  './js/views/inicio.js',
  './js/views/cultivos.js',
  './js/views/nuevo.js',
  './js/views/detalle.js',
  './js/views/configuracion.js',
  './js/views/calendario.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
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
