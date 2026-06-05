/* Nemo Aqua Store — service worker (offline shell + faster reloads) */
const CACHE = 'nemo-v3';
const ASSETS = ['./index.html', './app.jsx', './assets/nemo-logo.png', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'nemo-compiled').map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never cache Firebase / Google / fonts — always go to network
  if (/gstatic|googleapis|firebaseio|firebasedatabase|google|unpkg|jsdelivr/.test(url.host)) return;
  if (e.request.method !== 'GET') return;
  // Stale-while-revalidate for our own app shell: serve cache INSTANTLY (fast repeat loads),
  // then refresh the cache in the background so the next load gets any update.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
