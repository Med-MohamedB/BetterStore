/**
 * service-worker.js — App-shell offline caching.
 *
 * Strategy: cache-first for the app shell (HTML/CSS/JS/icons) so the app
 * opens instantly with no network, falling back to network + cache-fill
 * for anything not yet cached. IndexedDB (the real data) is untouched by
 * this file — the service worker only caches static app files.
 *
 * IMPORTANT: bump CACHE_NAME whenever you change any cached file, or
 * Android will keep serving the old version from cache.
 */

const CACHE_NAME = 'store-app-shell-v20';

const APP_SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './db.js',
  './app.js',
  './products.js',
  './scanner.js',
  './vendor/zxing.min.js',
  './pos.js',
  './inventory.js',
  './sales.js',
  './reports.js',
  './customers.js',
  './suppliers.js',
  './backup.js',
  './settings.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests for our own origin — everything else (if any
  // external calls ever exist) passes straight through to the network.
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          // Cache a copy of newly-fetched shell files for next time.
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline and not cached — fall back to the app shell for
          // navigation requests so the app still opens.
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
