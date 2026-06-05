/* Nemo Aqua Store — service worker (offline shell + faster reloads) */
const CACHE = 'nemo-v1';
const ASSETS = ['./index.html', './app.jsx', './assets/nemo-logo.png', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never cache Firebase / Google / fonts — always go to network
  if (/gstatic|googleapis|firebaseio|firebasedatabase|google|unpkg/.test(url.host)) return;
  if (e.request.method !== 'GET') return;
  // Network-first for our own app files so updates show; fall back to cache offline
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
