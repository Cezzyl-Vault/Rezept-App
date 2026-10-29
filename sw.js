// Speichert die App-Dateien zwischen, damit die App auch ohne Internet startet.
// Bei jeder Änderung an den Dateien VERSION erhöhen, sonst sehen Nutzer die alte Version.
const VERSION = 'rezepte-v2';
const DATEIEN = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/bilder.js',
  'js/dom.js',
  'js/entwurf.js',
  'js/konfig.js',
  'js/navigation.js',
  'js/speicher.js',
  'js/suche.js',
  'js/supabase.js',
  'js/sync.js',
  'js/texterkennung.js',
  'js/ui.js',
  'js/zutaten.js',
  'js/ansichten/editor.js',
  'js/ansichten/einkauf.js',
  'js/ansichten/erkennen.js',
  'js/ansichten/konto.js',
  'js/ansichten/liste.js',
  'js/ansichten/plan.js',
  'js/ansichten/rezept.js',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png',
];

// Bibliotheken mit fester Versionsnummer ändern sich nie → dauerhaft zwischenspeichern
const CDN = 'https://cdn.jsdelivr.net/';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== VERSION && n !== 'cdn').map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const anfrage = event.request;
  if (anfrage.method !== 'GET') return;

  if (anfrage.url.startsWith(CDN)) {
    event.respondWith(caches.open('cdn').then(async (cache) => {
      const treffer = await cache.match(anfrage);
      if (treffer) return treffer;
      const antwort = await fetch(anfrage);
      if (antwort.ok) cache.put(anfrage, antwort.clone());
      return antwort;
    }));
    return;
  }

  // Eigene Dateien: erst aus dem Netz (damit Updates sofort ankommen), ohne Netz aus dem Zwischenspeicher.
  // Supabase und andere fremde Adressen werden nie zwischengespeichert.
  if (new URL(anfrage.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(anfrage)
      .then((antwort) => {
        if (antwort.ok) {
          const kopie = antwort.clone();
          caches.open(VERSION).then((cache) => cache.put(anfrage, kopie));
        }
        return antwort;
      })
      .catch(() => caches.match(anfrage, { ignoreSearch: true }).then((t) => t || caches.match('./')))
  );
});
