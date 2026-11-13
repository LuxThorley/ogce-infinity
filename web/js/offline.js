// v9.0 installable PWA + offline play.
//  • Install: captures the browser's install prompt and offers an "Install" button (works on Android/desktop Chrome/Edge;
//    iOS uses Share → Add to Home Screen, which we explain).
//  • Offline solo play: when the server can't be reached, the SAME world rules (the vendored JS port of the authoritative
//    runtime) run locally in a private "Offline practice" world saved on this device. It is clearly labelled and never
//    counts towards leaderboards (the server can't verify it).
//  • Sync: actions you made online that failed because the connection dropped are queued and replayed IN ORDER when you
//    reconnect. The server re-validates every one (server-authoritative), so nothing can be faked. Notes you write offline
//    are uploaded to your Journal on reconnect.
import { GameRuntime } from './vendor/runtime.js';

export const OFFLINE_WORLD = 'Offline';
export const QUEUE_MAX = 40;
/** Minimal synchronous SQL adapter covering exactly the statements GameRuntime issues; state persists via save(). */
export function memoryDb(saved = null) {
  const worlds = new Map(Object.entries(saved?.worlds || {})), players = new Map(Object.entries(saved?.players || {}));
  const db = {
    run(sql, ...a) {
      if (/^CREATE TABLE/.test(sql) || /^INSERT INTO events/.test(sql)) return;
      if (/^INSERT INTO worlds VALUES\(\?,\?,0\)/.test(sql)) { worlds.set(a[0], { state: a[1], revision: 0 }); return; }
      if (/^UPDATE worlds SET state=\?,revision=\? WHERE id=\? AND revision=\?/.test(sql)) { const w = worlds.get(a[2]); if (w && w.revision === a[3]) worlds.set(a[2], { state: a[0], revision: a[1] }); return; }
      if (/^INSERT OR REPLACE INTO players/.test(sql)) { players.set(a[0], { world: a[1], state: a[2] }); return; }
      throw new Error('offline db: unsupported ' + sql.slice(0, 40));
    },
    all(sql, ...a) {
      if (/^SELECT state,revision FROM worlds WHERE id=\?/.test(sql)) { const w = worlds.get(a[0]); return w ? [{ ...w }] : []; }
      if (/^UPDATE worlds SET state=\?,revision=revision\+1 WHERE id=\? AND revision=\? RETURNING revision/.test(sql)) { const w = worlds.get(a[1]); if (!w || w.revision !== a[2]) return []; worlds.set(a[1], { state: a[0], revision: w.revision + 1 }); return [{ revision: w.revision + 1 }]; }
      throw new Error('offline db: unsupported ' + sql.slice(0, 40));
    },
    dump() { return { worlds: Object.fromEntries(worlds), players: Object.fromEntries(players) }; },
  };
  return db;
}
export function createOfflineGame(store) {
  const db = memoryDb(store.get('offline_db', null)), rt = new GameRuntime(db);
  const save = () => { try { store.set('offline_db', db.dump()); } catch { /* storage full: still playable this session */ } };
  return {
    load() { const r = rt.load(OFFLINE_WORLD); save(); return r; },
    act(pid, action) { const r = rt.act(OFFLINE_WORLD, pid, action); save(); return r; },
    reset() { store.set('offline_db', null); },
  };
}
/** Queue of server actions that failed only because the network dropped. */
export function createQueue(store) {
  let q = store.get('offline_queue', []); if (!Array.isArray(q)) q = [];
  const persist = () => store.set('offline_queue', q);
  return {
    get size() { return q.length; },
    push(item) { q.push({ ...item, t: Date.now() }); q = q.slice(-QUEUE_MAX); persist(); },
    async flush(send) { // send(item) -> Promise; stops at the first network failure, drops items the server rejects
      let sent = 0, rejected = 0;
      while (q.length) { const it = q[0]; try { await send(it); sent++; } catch (e) { if (e.network) break; rejected++; } q.shift(); persist(); }
      return { sent, rejected, left: q.length };
    },
    clear() { q = []; persist(); },
  };
}
export const isNetworkError = (e) => !e?.status && (e?.name === 'TypeError' || /fetch|network|Failed/i.test(e?.message || ''));
export function initInstall({ $, toast }) {
  let deferred = null; const btn = $('installbtn');
  const standalone = () => matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; btn?.classList.remove('hidden'); });
  window.addEventListener('appinstalled', () => { btn?.classList.add('hidden'); toast('📲 Installed! Strata now opens like an app, even offline.'); });
  if (btn) btn.onclick = async () => {
    if (deferred) { deferred.prompt(); await deferred.userChoice.catch(() => null); deferred = null; btn.classList.add('hidden'); }
    else toast(/iphone|ipad/i.test(navigator.userAgent) ? 'On iPhone/iPad: tap Share, then “Add to Home Screen”.' : 'Use your browser menu → “Install app”.');
  };
  if (!standalone() && /iphone|ipad/i.test(navigator.userAgent)) btn?.classList.remove('hidden');
}
