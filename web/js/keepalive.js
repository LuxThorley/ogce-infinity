// v9.0 background-robust media: keeps music, sound effects, voice chat and voice control alive when the tab is switched,
// minimised, moved to another window or left inactive.
//  • Ticks come from a dedicated worker (page timers in hidden tabs are throttled to ~1/s or slower).
//  • The soundtrack schedules further ahead on the AudioContext clock while the page is hidden.
//  • The AudioContext is resumed on visibilitychange / focus / pageshow / any user gesture (never suspended on blur).
//  • MediaSession metadata tells the browser this tab is playing media.
// Browser limits that cannot be overcome are documented in docs/V9_0_AUDIO.md (e.g. iOS Safari stops the microphone in the background).
export const LOOKAHEAD = Object.freeze({ visible: 0.3, hidden: 3.5 });
/** Seconds of audio to schedule ahead (pure; unit-tested). Hidden tabs may only tick about once a second. */
export function lookahead(hidden) { return hidden ? LOOKAHEAD.hidden : LOOKAHEAD.visible; }
/** Should we try to resume this AudioContext state? (pure; unit-tested). 'interrupted' is Safari's state after calls/Siri. */
export function shouldResume(state, wanted) { return !!wanted && (state === 'suspended' || state === 'interrupted'); }
export const RESUME_EVENTS = Object.freeze(['visibilitychange', 'focus', 'pageshow', 'pointerdown', 'keydown', 'touchstart', 'click']);

let worker = null, nextId = 1; const cbs = new Map();
function getWorker() {
  if (worker !== null) return worker;
  try { worker = new Worker('/js/tickworker.js'); worker.onmessage = (e) => cbs.get(e.data?.id)?.(); worker.onerror = () => { worker = false; for (const [id, f] of cbs) fallback(id, f); }; }
  catch { worker = false; }
  return worker;
}
const fallbacks = new Map();
function fallback(id, f) { if (!fallbacks.has(id)) fallbacks.set(id, setInterval(f, f.ms || 100)); }
/** setInterval that keeps ticking in background tabs (worker-driven, falls back to setInterval). Returns a stop function. */
export function bgInterval(fn, ms) {
  const id = nextId++; fn.ms = ms; cbs.set(id, fn);
  const w = typeof Worker !== 'undefined' ? getWorker() : false;
  if (w) w.postMessage({ op: 'start', id, ms }); else fallback(id, fn);
  return () => { cbs.delete(id); if (w) w.postMessage({ op: 'stop', id }); clearInterval(fallbacks.get(id)); fallbacks.delete(id); };
}

/** Wire resume-on-anything and MediaSession for the game's audio. */
export function initMediaKeepalive({ audio, music, title = 'Strata: Lux Genesis', onToggle } = {}) {
  const kick = () => audio?.resume?.();
  for (const ev of RESUME_EVENTS) (ev === 'visibilitychange' ? document : window).addEventListener(ev, kick, { capture: true, passive: true });
  const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : null;
  const sync = () => {
    if (!ms) return;
    try {
      if (audio?.on) { ms.metadata = new MediaMetadata({ title, artist: 'Procedural soundtrack', album: 'OGCE engine', artwork: [{ src: '/icons/strata-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icons/strata-512.png', sizes: '512x512', type: 'image/png' }] }); }
      ms.playbackState = audio?.on ? 'playing' : 'paused';
    } catch { /* MediaMetadata unsupported */ }
  };
  if (ms) {
    const h = (a, f) => { try { ms.setActionHandler(a, f); } catch { /* action unsupported */ } };
    h('play', () => { onToggle?.(true); kick(); sync(); }); h('pause', () => { onToggle?.(false); sync(); }); h('stop', () => { onToggle?.(false); sync(); });
  }
  sync();
  return { sync, kick };
}
