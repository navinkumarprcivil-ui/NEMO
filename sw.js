/* Nemo Aqua Store — service worker (offline fallback + always-fresh code) */
const CACHE = 'nemo-v5';
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
  // Never touch Firebase / Google / CDN — always straight to network
  if (/gstatic|googleapis|firebaseio|firebasedatabase|google|unpkg|jsdelivr/.test(url.host)) return;
  if (e.request.method !== 'GET') return;

  const isCode = /\.(html|jsx|js)$/.test(url.pathname) || e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/');

  if (isCode) {
    // NETWORK-FIRST for app code: a fresh deploy always loads immediately when online.
    // Falls back to cache only when offline.
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // CACHE-FIRST for static assets (images, fonts, manifest) — fast & rarely change.
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }))
    );
  }
});
