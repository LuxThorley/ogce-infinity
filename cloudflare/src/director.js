// v9.0 Malcolm director: an adaptive narrator that notices when a player is stuck, bored or racing ahead and adjusts
// hints, pacing and duel difficulty. Deterministic first (the rules below always decide the adjustment); Malcolm only
// words the narration line, server-side, with a fixed fallback. Everything it changes is shown to the player and can be
// switched off. It never uses streaks, timers-to-lose-rewards or purchases to pull players back.
import { enabled as malcolmEnabled, callUpstream, ensureUsageTable } from './malcolm.js';
import { classify } from './v90.js';

export const DIRECTOR = Object.freeze({ minGapS: 20, maxOffset: 2, malcolmPerHour: 200, idleStuckS: 240, sessionBoredMin: 12 });
export const MODES = ['flow', 'stuck', 'bored', 'racing'];
const FALLBACK = {
  flow: ['You are finding your rhythm. The strata hum along with you.', 'Steady and curious: that is how realigners work.'],
  stuck: ['Let us try a smaller step: I have lit the next clue a little brighter.', 'Stuck is just the moment before the answer. Here is a clearer hint.'],
  bored: ['Fancy something new? The sky has changed tonight, and a shrine is awake.', 'How about a different stratum? Something unusual is waiting out there.'],
  racing: ['You are racing ahead! I have made the next duels a little sharper.', 'Impressive pace. The strata will test you a bit harder now.'],
};
const SUGGEST = {
  stuck: 'Open the hint (🧭), or ask me in 🤖 for a step-by-step clue.',
  bored: 'Try the 🔮 Sky panel (a star chart, a shrine, a spirit), a weekly challenge in 👥, or travel to a new stratum in 🌍.',
  racing: 'Try a harder duel, a weekly challenge, or the Codex laws in ✨.',
  flow: '',
};
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : 0; };
export function sanitizeSignals(s = {}) {
  const res = Array.isArray(s.duels) ? s.duels.slice(-6).map((x) => (x === 'win' || x === 'loss' ? x : null)).filter(Boolean) : [];
  return { idle_s: num(s.idle_s, 0, 3600), session_min: num(s.session_min, 0, 600), apm: num(s.apm, 0, 200), hints: num(s.hints, 0, 50),
    faints: num(s.faints, 0, 20), discoveries_10m: num(s.discoveries_10m, 0, 100), lux_10m: num(s.lux_10m, 0, 1000), duels: res };
}
/** Pure, deterministic classification. */
export function classifyPlayer(sig) {
  const w = sig.duels.filter((x) => x === 'win').length, l = sig.duels.filter((x) => x === 'loss').length, last4 = sig.duels.slice(-4);
  const lossy = last4.filter((x) => x === 'loss').length >= 3;
  if (lossy || sig.faints >= 3 || (sig.idle_s >= DIRECTOR.idleStuckS && sig.hints >= 1)) return { mode: 'stuck', why: lossy ? 'lost_duels' : sig.faints >= 3 ? 'fainting' : 'idle_after_hint' };
  if (sig.duels.length >= 5 && w >= 5 && l === 0 && sig.idle_s < 60) return { mode: 'racing', why: 'win_run' };
  if (sig.lux_10m >= 120 && sig.idle_s < 60) return { mode: 'racing', why: 'fast_progress' };
  if (sig.session_min >= DIRECTOR.sessionBoredMin && sig.apm < 4 && sig.discoveries_10m === 0) return { mode: 'bored', why: 'low_activity' };
  return { mode: 'flow', why: 'ok' };
}
/** Applies a classification to the stored director state (difficulty offset is bounded and drifts back toward 0). */
export function adjust(prev, cls, enabledFlag = true) {
  const st = { offset: num(prev?.offset, -DIRECTOR.maxOffset, DIRECTOR.maxOffset), hint_level: num(prev?.hint_level ?? 1, 0, 2), mode: prev?.mode || 'flow', enabled: enabledFlag !== false };
  if (!st.enabled) return { ...st, offset: 0, hint_level: 1, mode: 'off', changed: [] };
  const before = { ...st }, changed = [];
  if (cls.mode === 'stuck') { st.hint_level = 2; st.offset = Math.max(-DIRECTOR.maxOffset, st.offset - 1); }
  else if (cls.mode === 'racing') { st.hint_level = 0; st.offset = Math.min(DIRECTOR.maxOffset, st.offset + 1); }
  else if (cls.mode === 'bored') { st.hint_level = 1; }
  else { st.hint_level = 1; st.offset = st.offset > 0 ? st.offset - 1 : st.offset < 0 ? st.offset + 1 : 0; }
  st.mode = cls.mode;
  if (st.offset !== before.offset) changed.push(st.offset > before.offset ? 'duels_harder' : 'duels_easier');
  if (st.hint_level !== before.hint_level) changed.push('hints_' + ['subtle', 'normal', 'clear'][st.hint_level]);
  return { ...st, changed };
}
export function fallbackLine(mode, seed = 0) { const L = FALLBACK[mode] || FALLBACK.flow; return L[Math.abs(seed) % L.length]; }
const SYSTEM = 'You are Malcolm, the warm narrator of the teen-friendly game Strata: Lux Genesis. Write ONE short encouraging narration line (max 25 words) for the player, in British English, matching the mode given. No questions about personal details, no pressure to keep playing, no mention of money or rewards for returning. Reply with the line only.';
export function ensureDirectorTable(db) { db.run('CREATE TABLE IF NOT EXISTS director_v90(world_id TEXT NOT NULL, player_id TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(world_id, player_id))'); }
export function load(db, wid, pid) { ensureDirectorTable(db); const r = db.all('SELECT record FROM director_v90 WHERE world_id=? AND player_id=?', wid, pid)[0]; return r ? JSON.parse(r.record) : { offset: 0, hint_level: 1, mode: 'flow', enabled: true, at: 0 }; }
export function save(db, wid, pid, st) { ensureDirectorTable(db); db.run('INSERT INTO director_v90(world_id,player_id,record) VALUES(?,?,?) ON CONFLICT(world_id,player_id) DO UPDATE SET record=excluded.record', wid, pid, JSON.stringify(st)); }
export async function direct({ db, env, fetchImpl, wid, pid, body, nowMs = Date.now(), account = null }) {
  const prev = load(db, wid, pid);
  if (body.enabled === false || body.enabled === true) prev.enabled = body.enabled;
  if (prev.at && nowMs / 1000 - prev.at < DIRECTOR.minGapS && body.enabled === undefined) return { ...prev, line: null, source: 'cooldown', changed: [], suggest: '' };
  const sig = sanitizeSignals(body.signals || {}), cls = classifyPlayer(sig), st = adjust(prev, cls, prev.enabled);
  let line = st.enabled ? fallbackLine(cls.mode, Math.floor(nowMs / 60000)) : null, source = 'fallback';
  if (st.enabled && account && cls.mode !== 'flow' && malcolmEnabled(env)) {
    ensureUsageTable(db);
    const bucket = `dir:hour:${new Date(nowMs).toISOString().slice(0, 13)}`, n = db.all('SELECT n FROM malcolm_usage WHERE bucket=?', bucket)[0]?.n ?? 0;
    if (n < DIRECTOR.malcolmPerHour) {
      db.run('INSERT INTO malcolm_usage(bucket,n) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET n=n+1', bucket);
      const reply = await callUpstream({ env, fetchImpl, system: SYSTEM, messages: [{ role: 'user', content: `Mode: ${cls.mode}. Reason: ${cls.why}. Changes: ${st.changed.join(', ') || 'none'}.` }] }).catch(() => null);
      const t = String(reply || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (t && !classify(t) && !/https?:|@|£|\$|buy|purchase|streak/i.test(t)) { line = t; source = 'malcolm'; }
    }
  }
  const out = { offset: st.offset, hint_level: st.hint_level, mode: st.mode, enabled: st.enabled, at: Math.floor(nowMs / 1000) };
  save(db, wid, pid, out);
  return { ...out, why: cls.why, line, source, changed: st.changed, suggest: st.enabled ? SUGGEST[cls.mode] || '' : '' };
}
