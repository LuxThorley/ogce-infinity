// v9.0 procedural soundtrack (WebAudio only, no audio files): a generative score that adapts to the stratum you have
// reached, the time of day, combat and the in-game sky (MYSTICAL/IN-GAME astrology: the Sun's element picks the timbre,
// a full moon adds a shimmer, planetary alignments add a harmony voice). Off whenever sound is off.
import { bgInterval, lookahead } from './keepalive.js';
const MODES = { ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], pentatonic: [0, 2, 4, 7, 9], hirajoshi: [0, 2, 3, 7, 8] };
const STRATUM_MODE = ['pentatonic', 'ionian', 'dorian', 'mixolydian', 'lydian', 'aeolian', 'phrygian', 'hirajoshi'];
const TIMBRE = { fire: 'sawtooth', water: 'sine', air: 'triangle', earth: 'square' };
/** Pure plan for a musical state (unit-tested): tempo, scale, root, timbre and active layers. */
export function musicPlan(s = {}) {
  const stratum = Math.max(0, Math.min(7, s.stratum | 0)), day = Math.max(0, Math.min(1, +s.day || 0)), combat = !!s.combat;
  const mode = combat ? (stratum >= 5 ? 'phrygian' : 'aeolian') : STRATUM_MODE[stratum];
  const tempo = Math.round(combat ? 112 + stratum * 2 : 58 + day * 14 + stratum);
  const root = 110 * Math.pow(2, ((stratum * 2) % 12) / 12) * (day < 0.3 && !combat ? 0.75 : 1);
  const layers = ['pad', 'melody'];
  if (day > 0.4 || combat) layers.push('bass');
  if (combat) layers.push('drums');
  if (s.fullMoon) layers.push('shimmer');
  if ((s.alignments | 0) > 0) layers.push('harmony');
  if (s.event === 'eclipse' || s.event === 'fracture') layers.push('drone');
  return { mode, scale: MODES[mode], tempo, root: Math.round(root * 100) / 100, timbre: TIMBRE[s.element] || 'triangle', layers, reverb: day < 0.3 ? 0.5 : 0.3 };
}
export function createMusic(audio) {
  let st = { stratum: 0, day: 1, combat: false, element: 'air', fullMoon: false, alignments: 0, event: '' }, plan = musicPlan(st), timer = null, nextT = 0, step = 0, seed = 7, out = null, enabled = true;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let deg = 0;
  function bus() { if (!out && audio.ctx) { out = audio.ctx.createGain(); out.gain.value = 0.32; out.connect(audio.master); if (audio.reverb) out.connect(audio.reverb); } return out; }
  function note(freq, t, dur, vol, type) {
    const c = audio.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = type; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = type === 'sawtooth' || type === 'square' ? 1400 : 4000;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(bus()); o.start(t); o.stop(t + dur + 0.05);
  }
  function hit(t, vol, hp) {
    const c = audio.ctx, len = Math.floor(c.sampleRate * 0.12), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, hp ? 6 : 2);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = b; f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = hp ? 5000 : 180; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(bus()); s.start(t);
  }
  const fq = (d, oct = 0) => { const sc = plan.scale, n = sc.length, o = Math.floor(d / n), i = ((d % n) + n) % n; return plan.root * Math.pow(2, (sc[i] + 12 * (o + oct)) / 12); };
  function tick() {
    if (!enabled || !audio.on || !audio.ctx) return;
    const c = audio.ctx, beat = 60 / plan.tempo / 2; // eighth notes
    if (nextT < c.currentTime) nextT = c.currentTime + 0.05;
    // schedule on the AudioContext clock; a hidden tab may tick rarely, so look further ahead there
    const ahead = lookahead(typeof document !== 'undefined' && document.hidden);
    while (nextT < c.currentTime + ahead) {
      const t = nextT, L = plan.layers, s8 = step % 16;
      if (L.includes('melody') && (plan.tempo > 90 ? rnd() < 0.55 : s8 % 2 === 0 && rnd() < 0.6)) { deg = Math.max(-3, Math.min(12, deg + Math.round((rnd() - 0.5) * 4))); note(fq(deg, 1), t, beat * (plan.tempo > 90 ? 1.2 : 3), 0.05, plan.timbre); }
      if (L.includes('harmony') && s8 % 4 === 2) note(fq(deg + 2, 1), t, beat * 2.5, 0.025, 'sine');
      if (L.includes('bass') && s8 % 8 === 0) note(fq(s8 === 0 ? 0 : 4, -1), t, beat * 6, 0.07, 'triangle');
      if (L.includes('pad') && s8 === 0) for (const d of [0, 2, 4]) note(fq(d), t, beat * 15, 0.018, 'sine');
      if (L.includes('drums')) { if (s8 % 4 === 0) hit(t, 0.22, false); if (s8 % 2 === 1) hit(t, 0.05, true); }
      if (L.includes('shimmer') && s8 % 2 === 0) note(fq(7 + (s8 % 6), 2), t, beat * 1.5, 0.012, 'sine');
      if (L.includes('drone') && s8 === 0) note(plan.root / 2, t, beat * 16, 0.03, 'sawtooth');
      nextT += beat; step++;
    }
  }
  return {
    set(s) { st = { ...st, ...s }; plan = musicPlan(st); audio.duck?.(st.combat); },
    get plan() { return plan; }, get state() { return st; },
    enable(v) { enabled = !!v; if (enabled && !timer) timer = bgInterval(tick, 100); },
    start() { if (!timer) timer = bgInterval(tick, 100); },
    tick, get scheduledUntil() { return nextT; },
  };
}
