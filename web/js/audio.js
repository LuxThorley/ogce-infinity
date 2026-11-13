// Strata: Lux Genesis procedural audio (WebAudio only, no files): ambient pad that follows day/night and events,
// birdsong by day, crickets at night, wind, and short effects. Off by default; browsers need a click to start audio.
export function createAudio() {
  let onPlay = null, ctx = null, master = null, padGain = null, pad = [], natureGain = null, on = false, mood = { day: 1, event: 'calm' }, timer = null;
  function start() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    const verb = ctx.createConvolver(); const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    verb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.35; verb.connect(wet); wet.connect(master);
    padGain = ctx.createGain(); padGain.gain.value = 0.05; padGain.connect(master); padGain.connect(verb);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(padGain);
    for (const f of [110, 164.81, 220, 277.18]) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.18; o.connect(g); g.connect(lp); o.start(); pad.push(o); }
    // wind: filtered noise
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = nb; noise.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6;
    natureGain = ctx.createGain(); natureGain.gain.value = 0.02; noise.connect(bp); bp.connect(natureGain); natureGain.connect(master); noise.start();
    timer = setInterval(nature, 900);
  }
  function chirp(f0, f1, dur, vol, type = 'sine') {
    if (!ctx || !on) return; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function nature() {
    if (!on || !ctx) return;
    if (mood.day > 0.5 && Math.random() < 0.35) { const b = 1800 + Math.random() * 1600; chirp(b, b * 1.3, 0.12, 0.03); setTimeout(() => chirp(b * 1.2, b * 0.9, 0.1, 0.025), 140); }
    if (mood.day < 0.4 && Math.random() < 0.6) for (let i = 0; i < 3; i++) setTimeout(() => chirp(4200, 4000, 0.04, 0.012, 'square'), i * 70);
  }
  function setMood(m) {
    mood = { ...mood, ...m }; if (!ctx) return;
    const t = ctx.currentTime, root = mood.event === 'wolf_moon' ? 98 : mood.event === 'aurora' || mood.event === 'lux_tide' ? 130.81 : 110;
    const chord = mood.day > 0.5 ? [1, 1.4983, 2, 2.5198] : [1, 1.1892, 1.4983, 2];
    pad.forEach((o, i) => o.frequency.setTargetAtTime(root * chord[i], t, 2.5));
    natureGain.gain.setTargetAtTime(mood.wind ? 0.05 : 0.018, t, 1.5);
  }
  const fx = {
    gather: () => { chirp(660, 990, 0.18, 0.08); setTimeout(() => chirp(990, 1320, 0.15, 0.06), 90); },
    attack: () => chirp(220, 60, 0.18, 0.12, 'sawtooth'),
    build: () => { chirp(180, 120, 0.12, 0.1, 'square'); setTimeout(() => chirp(240, 160, 0.12, 0.08, 'square'), 120); },
    heal: () => { chirp(523, 784, 0.35, 0.06); setTimeout(() => chirp(659, 1046, 0.35, 0.05), 120); },
    level: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => chirp(f, f, 0.25, 0.07, 'triangle'), i * 110)),
    achieve: () => [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => chirp(f, f * 1.01, 0.3, 0.06, 'triangle'), i * 90)),
    correct: () => { chirp(880, 1320, 0.2, 0.06); },
    wrong: () => chirp(300, 200, 0.25, 0.06, 'triangle'),
    message: () => chirp(1200, 1500, 0.08, 0.04),
  };
  return {
    get on() { return on; },
    get ctx() { return ctx; }, get master() { return master; }, get reverb() { return padGain; },
    duck(v) { if (padGain && ctx) padGain.gain.setTargetAtTime(v ? 0.015 : 0.05, ctx.currentTime, 1.2); },
    sfx(kind) { if (on && fx[kind]) fx[kind](); },
    set(v) { on = !!v; if (on) start(); if (master) master.gain.setTargetAtTime(on ? 0.7 : 0, ctx.currentTime, 0.4); },
    play(kind) { if (on && fx[kind]) { fx[kind](); onPlay?.(kind); } },
    set onPlay(f) { onPlay = f; },
    setMood,
    stop() { clearInterval(timer); },
  };
}
