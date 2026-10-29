// Speichert die App-Dateien zwischen, damit die App auch ohne Internet startet.
// Bei jeder Änderung an den Dateien VERSION erhöhen, sonst sehen Nutzer die alte Version.
const VERSION = 'rezepte-v1';
const DATEIEN = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Erst aus dem Netz laden (damit Updates sofort ankommen), ohne Netz aus dem Zwischenspeicher.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((antwort) => {
        if (antwort.ok) {
          const kopie = antwort.clone();
          caches.open(VERSION).then((cache) => cache.put(event.request, kopie));
        }
        return antwort;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
