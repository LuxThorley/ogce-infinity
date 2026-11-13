// v9.0 Malcolm the narrator/director (client side). Collects only coarse, anonymous play signals on this device
// (idle seconds, actions per minute, hints shown, faints, recent duel results, discoveries/Lux in the last 10 minutes)
// and asks the server about once a minute. The SERVER decides (deterministic rules: stuck / bored / racing / flow) and
// may adjust hint level and duel difficulty by ±2; Malcolm only words the line. Nothing is sent while the tab is hidden.
export const DIRECTOR_EVERY_MS = 60000;
export function createSignals(now = () => Date.now()) {
  const t0 = now(); let lastAct = now(); const acts = [], duels = [], disc = [], lux = []; let hints = 0, faints = 0;
  const within = (arr, ms) => arr.filter((t) => t > now() - ms);
  return {
    action() { lastAct = now(); acts.push(now()); while (acts.length > 400) acts.shift(); },
    hint() { hints++; }, faint() { faints++; },
    duel(won) { duels.push(won ? 'win' : 'loss'); while (duels.length > 6) duels.shift(); lastAct = now(); },
    discovery(n = 1) { for (let i = 0; i < n; i++) disc.push(now()); }, lux(n) { if (n > 0) lux.push([now(), n]); },
    snapshot() {
      return { idle_s: Math.round((now() - lastAct) / 1000), session_min: Math.round((now() - t0) / 60000), apm: within(acts, 60000).length,
        hints, faints, discoveries_10m: within(disc, 600000).length, lux_10m: lux.filter(([t]) => t > now() - 600000).reduce((a, [, n]) => a + n, 0), duels: [...duels] };
    },
    resetHints() { hints = 0; faints = 0; },
  };
}
export function initDirector({ api, world, playerId, session, caption, toast, store, onAdjust }) {
  const sig = createSignals(); let enabled = store.get('director', true), timer = null, last = null;
  async function tick(extra = {}) {
    if (document.visibilityState !== 'visible' && extra.enabled === undefined) return;
    try {
      const d = await api('POST', `/api/v90/director/${world}`, { player_id: session() ? undefined : playerId(), signals: sig.snapshot(), ...extra });
      last = d.director; onAdjust?.(last);
      if (last?.line && enabled) { caption?.(`Malcolm: ${last.line}`); toast(`🤖 ${last.line}`); }
      if (last?.mode === 'stuck') sig.resetHints();
    } catch { /* director is optional; the game never waits for it */ }
  }
  function setEnabled(v) { enabled = !!v; store.set('director', enabled); tick({ enabled }); }
  timer = setInterval(tick, DIRECTOR_EVERY_MS);
  return { signals: sig, tick, setEnabled, get enabled() { return enabled; }, get last() { return last; }, stop() { clearInterval(timer); } };
}
