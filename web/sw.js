// OGCE v8.3 service worker: network-first so updates arrive immediately; cached shell for offline viewing.
const CACHE = 'ogce-v83';
const SHELL = ['/', '/index.html', '/style.css', '/manifest.webmanifest', '/icons/ogce.svg', '/js/app.js', '/js/renderer3d.js', '/js/gl-math.js', '/js/world3d.js', '/js/minimap.js', '/js/controls.js', '/js/hints.js', '/js/text.js', '/js/lab.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname === '/ws' || u.pathname === '/health') return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});
