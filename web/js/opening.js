// v9.0 cinematic opening ("reality fracturing") and the tutorial woven into the first quest, "First Light".
// The opening is procedural canvas art (no video files), captioned, skippable, and calm under reduced motion.
const STRATA = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#9775fa', '#f783ac'];
export const OPENING_LINES = [
  [0.0, 'Before the strata, there was one clear light.'],
  [4.2, 'Then reality fractured.'],
  [7.6, 'Every shard became a layer of the world, eight colours of the first light.'],
  [12.0, 'The layers drifted apart. The Lux grew dim.'],
  [15.8, 'Realigner, the strata are waiting. Gather the light. Make the world whole.'],
];
export const OPENING_SECONDS = 20.5;
export const TUTORIAL = [
  { id: 'moved', title: 'Take your first steps', how: 'Walk with WASD or the arrow keys, tap the ground, or use the joystick.', narr: 'Good. The ground remembers you now.' },
  { id: 'gathered', title: 'Gather a shard of the world', how: 'Walk to a glowing crystal, wood or stone and press E (or tap it).', narr: 'Every shard you gather holds a little Lux.' },
  { id: 'duel', title: 'Face a guardian', how: 'Press F near a creature (or ⚔️ → Practice duel). Light/heavy attacks, block, dodge, parry.', narr: 'Sparks, not wounds. Guardians test you; they do not hate you.' },
  { id: 'sky', title: 'Read the sky', how: 'Open 🔮 Sky & Spirits (key 5). See tonight\'s planets and how they change your powers (in-game magic).', narr: 'The sky in Strata is part of the story: watch it, and it will help you.' },
  { id: 'progress', title: 'Find your purpose', how: 'Open ✨ Progress & Codex (I) to see the Lux, the 7 laws and the 4 endings.', narr: 'Now you know why you are here. First Light is complete. Welcome, Realigner.' },
];
export function tutorialState(done) { const i = TUTORIAL.findIndex((s) => !done.has(s.id)); return { index: i < 0 ? TUTORIAL.length : i, step: i < 0 ? null : TUTORIAL[i], complete: i < 0 }; }

export function playOpening({ $, reduced, caption, speak, onDone }) {
  const o = $('opening'), cv = $('opening-canvas'), g = cv.getContext('2d'), sub = $('opening-sub');
  o.classList.remove('hidden'); let t0 = performance.now(), raf = 0, shown = -1, ended = false;
  const W = () => (cv.width = innerWidth * Math.min(2, devicePixelRatio || 1)), H = () => (cv.height = innerHeight * Math.min(2, devicePixelRatio || 1));
  W(); H();
  const rnd = (() => { let s = 99; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  const cracks = Array.from({ length: 14 }, () => { const a = rnd() * Math.PI * 2; const pts = [[0, 0]]; let x = 0, y = 0, ang = a; for (let i = 0; i < 9; i++) { ang += (rnd() - 0.5) * 0.9; x += Math.cos(ang) * 0.06; y += Math.sin(ang) * 0.06; pts.push([x, y]); } return pts; });
  const shards = STRATA.map((c, i) => ({ c, a: (i / 8) * Math.PI * 2 + 0.3, spin: (rnd() - 0.5) * 2, r: 0.05 + rnd() * 0.03, sides: 3 + (i % 3) }));
  function end() { if (ended) return; ended = true; cancelAnimationFrame(raf); o.classList.add('hidden'); window.removeEventListener('keydown', key, true); onDone?.(); }
  function key(e) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); end(); } }
  window.addEventListener('keydown', key, true); $('opening-skip').onclick = end; $('opening-skip').focus();
  function frame(now) {
    const t = (now - t0) / 1000, w = cv.width, h = cv.height, m = Math.min(w, h), cx = w / 2, cy = h / 2;
    g.fillStyle = '#05070f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) { const sx = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1, sy = (Math.sin(i * 78.233) * 12345.678 % 1 + 1) % 1; g.fillStyle = `rgba(255,255,255,${0.15 + 0.5 * ((i * 7) % 10) / 10})`; g.fillRect(sx * w, sy * h, 1.5, 1.5); }
    const crack = Math.max(0, Math.min(1, (t - 4) / 2.5)), burst = reduced() ? Math.min(1, Math.max(0, (t - 7.5) / 3)) : Math.max(0, Math.min(1, (t - 7) / 4));
    // the first light
    const glow = (1 - burst) * (0.9 + 0.1 * Math.sin(t * 3)), R = m * 0.16 * (1 + Math.min(1, t / 4) * 0.15);
    if (glow > 0.01) { const rg = g.createRadialGradient(cx, cy, 0, cx, cy, R * 2.2); rg.addColorStop(0, `rgba(255,250,225,${glow})`); rg.addColorStop(0.35, `rgba(255,220,140,${glow * 0.6})`); rg.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, R * 2.2, 0, 7); g.fill(); }
    // cracks race across the light
    if (crack > 0 && burst < 1) { g.strokeStyle = `rgba(20,10,40,${0.9 * (1 - burst)})`; g.lineWidth = m * 0.004; for (const c of cracks) { const n = Math.floor(c.length * crack); g.beginPath(); for (let i = 0; i < n; i++) { const [x, y] = c[i]; i ? g.lineTo(cx + x * m * 2, cy + y * m * 2) : g.moveTo(cx, cy); } g.stroke(); } }
    // shards fly out and settle into eight layers
    if (burst > 0) {
      const settle = Math.max(0, Math.min(1, (t - 12) / 4));
      shards.forEach((s, i) => {
        const fly = burst * m * 0.38, ex = cx + Math.cos(s.a) * fly, ey = cy + Math.sin(s.a) * fly;
        const lx = cx, ly = h * 0.25 + i * h * 0.07;
        const x = ex + (lx - ex) * settle, y = ey + (ly - ey) * settle, rot = reduced() ? 0 : t * s.spin * (1 - settle);
        if (settle > 0.05) { g.fillStyle = s.c + '33'; g.fillRect(cx - w * 0.4 * settle, ly - h * 0.02, w * 0.8 * settle, h * 0.04); }
        g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = s.c; g.shadowColor = s.c; g.shadowBlur = 25; g.beginPath();
        for (let k = 0; k < s.sides; k++) { const a = (k / s.sides) * Math.PI * 2; const r = m * s.r * (1 - settle * 0.4); k ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
        g.closePath(); g.fill(); g.restore();
      });
    }
    if (t > 17.5) { g.fillStyle = `rgba(255,236,170,${Math.min(1, (t - 17.5) / 1.5)})`; g.font = `700 ${Math.round(m * 0.07)}px Georgia, serif`; g.textAlign = 'center'; g.fillText('STRATA', cx, h * 0.88); g.font = `400 ${Math.round(m * 0.03)}px Georgia, serif`; g.fillText('Lux Genesis', cx, h * 0.93); }
    let li = -1; for (let i = 0; i < OPENING_LINES.length; i++) if (t >= OPENING_LINES[i][0]) li = i;
    if (li !== shown) { shown = li; sub.textContent = OPENING_LINES[li][1]; caption?.(OPENING_LINES[li][1], 'Malcolm'); speak?.(OPENING_LINES[li][1]); }
    if (t >= OPENING_SECONDS) return end();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return { end };
}

export function initTutorial({ $, done, toast, caption, onComplete }) {
  let last = null;
  function update() {
    const el = $('tutorialcard'); if (!el) return;
    const S = tutorialState(done);
    if (S.complete) { el.classList.add('hidden'); if (last !== 'complete' && last !== null) { toast('🌟 Quest complete: First Light. The strata are yours to explore.'); caption?.(TUTORIAL[TUTORIAL.length - 1].narr, 'Malcolm'); onComplete?.(); } last = 'complete'; return; }
    el.classList.remove('hidden');
    el.innerHTML = `<div class="tq"><b>🌅 First Light</b> <span class="small muted">step ${S.index + 1} of ${TUTORIAL.length}</span></div><div class="tstep">${S.step.title}</div><div class="small">${S.step.how}</div>
      <div class="tdots">${TUTORIAL.map((s, i) => `<i class="${i < S.index ? 'on' : i === S.index ? 'cur' : ''}" title="${s.title}"></i>`).join('')}</div><button class="small" id="tut-hide" aria-label="Hide the tutorial">Hide</button>`;
    $('tut-hide').onclick = () => { el.classList.add('hidden'); el.dataset.hidden = '1'; };
    if (el.dataset.hidden === '1') el.classList.add('hidden');
    if (last !== null && last !== S.step.id) { const prev = TUTORIAL[S.index - 1]; if (prev) { toast('✅ ' + prev.title); caption?.(prev.narr, 'Malcolm'); } }
    last = S.step.id;
  }
  return { update, state: () => tutorialState(done) };
}
