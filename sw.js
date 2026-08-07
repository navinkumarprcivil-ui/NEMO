/* Nemo Aqua Store — service worker (offline fallback + always-fresh code) */
const CACHE = 'nemo-v73';
const ASSETS = ['./index.html', './app.js', './app.jsx', './assets/nemo-logo.png', './manifest.webmanifest'];

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
    // NETWORK-FIRST WITH A SHORT TIMEOUT for app code:
    //  • fast network  → serve fresh (a new deploy shows immediately)
    //  • slow network  → serve cached instantly after ~1.5s, while the fetch keeps
    //                     running in the background to refresh the cache for next time
    //  • offline       → serve cached
    e.respondWith((async () => {
      const cached = await caches.match(e.request);
      const network = fetch(e.request)
        .then((res) => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); } return res; })
        .catch(() => null);
      if (!cached) { const n = await network; return n || fetch(e.request); }
      const timeout = new Promise((r) => setTimeout(() => r('__timeout__'), 1500));
      const winner = await Promise.race([network, timeout]);
      return (winner && winner !== '__timeout__') ? winner : cached;
    })());
  } else {
    // CACHE-FIRST for static assets (images, fonts, manifest) — fast & rarely change.
    // A cached error/opaque response would be served forever — a deploy that briefly 404'd an
    // image (or an interrupted write) is exactly how the splash logo ends up permanently
    // "broken" on a device. So only OK responses are cached, and only OK ones are served back.
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached && cached.ok) return cached;
        return fetch(e.request).then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          }
          return res;
        }).catch(() => cached || Response.error());
      })
    );
  }
});
