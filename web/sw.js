// Strata: Lux Genesis (OGCE v9.0) service worker. Installable PWA with offline solo play:
//  • the whole app shell (every module, including the vendored world rules) is pre-cached on install;
//  • pages and code are network-first so updates arrive immediately, falling back to the cache offline;
//  • /api and /ws are never cached (live data stays live; the client switches to Offline practice when they fail).
const CACHE = 'strata-v90-3';
const SHELL = ["/", "/index.html", "/style.css", "/manifest.webmanifest", "/icons/ogce.svg", "/icons/strata-192.png", "/icons/strata-512.png", "/icons/strata.svg", "/js/access.js", "/js/app.js", "/js/audio.js", "/js/camera.js", "/js/cardrender.js", "/js/codexgraph.js", "/js/combat.js", "/js/combatdata.js", "/js/controls.js", "/js/directorclient.js", "/js/duel.js", "/js/expedition.js", "/js/gl-math.js", "/js/hints.js", "/js/lab.js", "/js/lore.js", "/js/minimap.js", "/js/mpdata.js", "/js/multiplayer.js", "/js/music.js", "/js/mystic.js", "/js/mysticdata.js", "/js/mysticui.js", "/js/netsync.js", "/js/offline.js", "/js/opening.js", "/js/photo.js", "/js/progress.js", "/js/renderer3d.js", "/js/rules.js", "/js/shaders90.js", "/js/strata.js", "/js/text.js", "/js/vendor/pyjson.js", "/js/vendor/runtime.js", "/js/voice.js", "/js/voicechat.js", "/js/voicegrammar.js", "/js/world3d.js"];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname === '/ws' || u.pathname === '/health') return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || (e.request.mode === 'navigate' ? caches.match('/index.html') : undefined))));
});
