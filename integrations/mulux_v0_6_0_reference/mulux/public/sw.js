// μLux service worker — offline cache-first for the app shell. No network calls beyond same-origin assets.
const CACHE = 'mulux-v0.6.0';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './css/app.css', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './js/app.js', './js/worker.js', './js/ui/dom.js', './js/ui/views.js', './js/ui/universes.js', './js/policy/engine.js', './js/policy/pinned.js',
  './js/engine/rng.js', './js/engine/mathx.js', './js/engine/sets.js', './js/engine/lattice.js', './js/engine/cra.js', './js/engine/strata.js', './js/engine/transfer.js',
  './js/engine/receipt.js', './js/engine/observatory.js', './js/engine/chronos.js', './js/engine/symmetry.js', './js/engine/grades.js', './js/engine/doctrine.js',
  './js/engine/living.js', './js/engine/omnigenesis.js', './js/engine/narrator.js', './js/net/malcolm.js', './js/ui/views5.js', './js/engine/ceremony.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // never proxy or touch cross-origin traffic
  if (url.pathname.includes('/api/')) return; // live Worker API: never cached, never served offline
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
