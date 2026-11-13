// v9.0 accessibility, comfort and healthy play: colour-blind modes, subtitles/captions, text scaling, remappable
// gameplay keys, one-handed layouts, reduced motion, high contrast and gentle break reminders.
// Healthy play by design: no streaks, no loot boxes, no paid currency, no countdowns that take things away. HEALTHY-PLAY-OK
export const GAME_ACTIONS = { forward: 'w', left: 'a', back: 's', right: 'd', gather: 'e', attack: 'f', build: 'b', rest: 'r', potion: 'p', drink: 'q', wait: 't', help: 'h', progress: 'i', photo: '0', sky: '5', together: '6', quickchat: 'u' }; // letters are almost all taken (camera Z/X/Y/G/L/N, J/K/M/O/V/C panels), so the new panels use digits
export const ACTION_LABEL = { forward: 'Walk forward', left: 'Walk left', back: 'Walk back', right: 'Walk right', gather: 'Collect', attack: 'Attack / duel', build: 'Build campfire', rest: 'Rest', potion: 'Brew potion', drink: 'Drink potion', wait: 'Let time pass', help: 'Help', progress: 'Progress & Codex', photo: 'Photo mode', sky: 'Sky & Spirits', together: 'Together (multiplayer)', quickchat: 'Quick-chat wheel' };
export const ONE_HANDED = {
  off: {},
  left: { forward: 'w', left: 'a', back: 's', right: 'd', gather: 'e', attack: 'f', drink: 'q', rest: 'r', build: 'b', potion: '1', wait: 't', photo: '5', sky: '3', together: '4', quickchat: '2' },
  right: { forward: 'arrowup', left: 'arrowleft', back: 'arrowdown', right: 'arrowright', gather: '[', attack: ']', drink: ';', rest: "'", build: '\\', potion: 'p', wait: 'end', photo: 'delete', sky: 'insert', together: 'backspace', quickchat: '0', help: 'h', progress: 'home' },
};
export const CB_MODES = { none: 'Off', protanopia: 'Protanopia (red-weak)', deuteranopia: 'Deuteranopia (green-weak)', tritanopia: 'Tritanopia (blue-weak)', mono: 'Monochrome + high contrast' };
// Daltonisation-style correction matrices (shift lost contrast into channels the viewer can see).
const CB_MATRIX = {
  protanopia: '0.0 2.02344 -2.52581 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0',
  deuteranopia: '1 0 0 0 0  0.494207 0 1.24827 0 0  0 0 1 0 0  0 0 0 1 0',
  tritanopia: '1 0 0 0 0  0 1 0 0 0  -0.395913 0.801109 0 0 0  0 0 0 1 0',
  mono: '0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0',
};
/** Keys a remap may not take: menus (J/K/M/O/C/Enter), voice (V and /), and every default camera key. */
export const RESERVED = ['escape', 'enter', 'v', '/', 'j', 'k', 'm', 'o', 'c', 'n', 'l', 'z', 'x', 'y', 'g', ',', '.', '=', '+', '-', '_', '7', '8', '9', 'pageup', 'pagedown', '`'];
export const DEFAULTS = { cb: 'none', captions: true, scale: 100, reduced: null, contrast: false, onehand: 'off', keys: {}, breaks: 45, caption_sfx: true };
export function sanitize(s = {}) {
  const o = { ...DEFAULTS, ...(s && typeof s === 'object' ? s : {}) };
  if (!CB_MODES[o.cb]) o.cb = 'none';
  o.scale = Math.max(80, Math.min(160, Math.round(+o.scale || 100)));
  o.captions = o.captions !== false; o.caption_sfx = o.caption_sfx !== false; o.contrast = !!o.contrast;
  o.reduced = o.reduced === true || o.reduced === false ? o.reduced : null;
  if (!ONE_HANDED[o.onehand]) o.onehand = 'off';
  o.breaks = [0, 20, 30, 45, 60, 90].includes(+o.breaks) ? +o.breaks : 45;
  const k = {}; for (const [a, v] of Object.entries(o.keys || {})) if (GAME_ACTIONS[a] && typeof v === 'string' && v.length <= 12) k[a] = v.toLowerCase();
  o.keys = k; return o;
}
/** Effective binding: defaults ← one-handed preset ← personal remaps. Duplicate keys are resolved in favour of the later layer. */
export function bindings(s) {
  const b = { ...GAME_ACTIONS, ...ONE_HANDED[s.onehand], ...s.keys };
  const seen = new Map(); for (const [a, k] of Object.entries(b)) { if (seen.has(k) && seen.get(k) !== a && !(a in s.keys)) b[a] = null; else seen.set(k, a); }
  return b;
}
/** Translate a pressed key into the DEFAULT key the game logic understands (or null if the key is unbound). */
export function translate(b, key) {
  for (const [a, k] of Object.entries(b)) if (k === key) return GAME_ACTIONS[a];
  if (Object.values(GAME_ACTIONS).includes(key)) return '__unbound__';
  return key;
}
export const SFX_CAPTION = { gather: '[soft chime: collected]', attack: '[swish]', build: '[wooden knocks: built]', heal: '[warm rising tones: healed]', level: '[fanfare: level up]', achieve: '[bright fanfare: achievement]', correct: '[ding: correct]', wrong: '[low tone: not quite]', message: '[message blip]' };

export function initAccess({ $, store, renderer, audio, toast }) {
  let s = sanitize(store.get('access', {}));
  const sysReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reduced = () => (s.reduced === null ? sysReduced : s.reduced);
  // SVG filters for colour-blind modes
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
  svg.innerHTML = Object.entries(CB_MATRIX).map(([k, m]) => `<filter id="cb-${k}"><feColorMatrix type="matrix" values="${m}"/></filter>`).join('');
  document.body.append(svg);
  // captions
  const cap = document.createElement('div'); cap.id = 'subtitles'; cap.setAttribute('aria-live', 'polite'); cap.setAttribute('role', 'status'); document.body.append(cap);
  let capTimer = null;
  function caption(text, who = '') {
    if (!s.captions || !text) return;
    const line = document.createElement('div'); line.className = 'capline'; line.textContent = (who ? who + ': ' : '') + text; cap.append(line);
    while (cap.children.length > 3) cap.firstChild.remove();
    clearTimeout(capTimer); capTimer = setTimeout(() => { cap.textContent = ''; }, Math.min(9000, 2500 + text.length * 60));
  }
  if (audio) audio.onPlay = (k) => { if (s.caption_sfx && SFX_CAPTION[k]) caption(SFX_CAPTION[k]); };
  if (window.speechSynthesis && !window.speechSynthesis.__capWrapped) { // spoken lines (Malcolm, NPCs) are always captioned
    const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (u) => { try { const vc = document.getElementById('captions'); if (!vc || vc.classList.contains('hidden')) caption(u.text); } catch { /* */ } return orig(u); }; // voice replies already show their own caption box window.speechSynthesis.__capWrapped = true;
  }
  // reduced motion: no camera shake/kick, no head bob
  if (renderer?.rig) { const R = renderer.rig, sh = R.addShake?.bind(R), kk = R.addKick?.bind(R); if (sh) R.addShake = (v) => (reduced() ? undefined : sh(v)); if (kk) R.addKick = (v) => (reduced() ? undefined : kk(v)); }
  function apply() {
    const B = document.body;
    B.classList.toggle('reduced', reduced()); B.classList.toggle('hicontrast', s.contrast || s.cb === 'mono');
    B.classList.toggle('onehand-left', s.onehand === 'left'); B.classList.toggle('onehand-right', s.onehand === 'right');
    for (const k of Object.keys(CB_MODES)) B.classList.toggle('cb-' + k, s.cb === k && k !== 'none');
    document.documentElement.style.setProperty('--ui-scale', String(s.scale / 100));
    const cv = $('worldview'); if (cv) cv.style.filter = s.cb !== 'none' ? `url(#cb-${s.cb})` : '';
    if (renderer) { renderer.reducedMotion = reduced(); if (reduced() && renderer.rig?.configure) renderer.rig.configure({ headBob: false }); }
    cap.classList.toggle('hidden', !s.captions);
  }
  function save() { store.set('access', s); apply(); }
  // settings UI
  function render() {
    const host = $('access-settings'); if (!host) return;
    const b = bindings(s);
    host.innerHTML = `<fieldset class="camset"><legend>♿ Accessibility &amp; comfort</legend>
      <label>Colour-blind mode <select id="ax-cb">${Object.entries(CB_MODES).map(([k, v]) => `<option value="${k}" ${s.cb === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" id="ax-contrast" ${s.contrast ? 'checked' : ''}> High-contrast interface</label>
      <label>Text size <input type="range" id="ax-scale" min="80" max="160" step="10" value="${s.scale}"> <span id="ax-scale-v">${s.scale}%</span></label>
      <label class="check"><input type="checkbox" id="ax-captions" ${s.captions ? 'checked' : ''}> Subtitles for speech (Malcolm, characters, voice replies)</label>
      <label class="check"><input type="checkbox" id="ax-capsfx" ${s.caption_sfx ? 'checked' : ''}> Caption sound effects too</label>
      <label>Reduced motion <select id="ax-reduced"><option value="auto" ${s.reduced === null ? 'selected' : ''}>Follow my device (${sysReduced ? 'on' : 'off'})</option><option value="on" ${s.reduced === true ? 'selected' : ''}>On: no shake, flashes or bobbing</option><option value="off" ${s.reduced === false ? 'selected' : ''}>Off</option></select></label>
      <label>One-handed controls <select id="ax-onehand"><option value="off">Off</option><option value="left" ${s.onehand === 'left' ? 'selected' : ''}>Left hand (keys around WASD; touch buttons on the left)</option><option value="right" ${s.onehand === 'right' ? 'selected' : ''}>Right hand (arrows + keys around Enter; touch buttons on the right)</option></select></label>
      <details><summary>Game keys (click to remap)</summary><div class="keygrid" id="ax-keys">${Object.keys(GAME_ACTIONS).map((a) => `<label>${ACTION_LABEL[a]} <button data-gk="${a}">${b[a] ? (b[a] === ' ' ? 'space' : b[a]) : 'unbound'}</button></label>`).join('')}<button id="ax-keys-reset">Reset game keys</button></div></details>
      <label>Break reminders <select id="ax-breaks">${[[0, 'Off'], [20, 'Every 20 min'], [30, 'Every 30 min'], [45, 'Every 45 min (default)'], [60, 'Every hour'], [90, 'Every 90 min']].map(([v, l]) => `<option value="${v}" ${s.breaks === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="small muted">Healthy play: Strata has no daily streaks, no loot boxes, no paid currency and nothing that expires if you take a break. Your progress waits for you. Session so far: <b id="ax-session">0</b> min.</p></fieldset>`; // HEALTHY-PLAY-OK (this line is the disclaimer)
    const ch = (id, f) => { const el = $(id); if (el) el.onchange = el.oninput = () => { f(el); save(); if (id !== 'ax-scale') render(); }; };
    ch('ax-cb', (el) => { s.cb = el.value; }); ch('ax-contrast', (el) => { s.contrast = el.checked; });
    ch('ax-scale', (el) => { s.scale = +el.value; $('ax-scale-v').textContent = s.scale + '%'; });
    ch('ax-captions', (el) => { s.captions = el.checked; }); ch('ax-capsfx', (el) => { s.caption_sfx = el.checked; });
    ch('ax-reduced', (el) => { s.reduced = el.value === 'auto' ? null : el.value === 'on'; });
    ch('ax-onehand', (el) => { s.onehand = el.value; toast(el.value === 'off' ? 'Two-handed controls' : `One-handed (${el.value}) controls on. See Settings → Game keys.`); });
    ch('ax-breaks', (el) => { s.breaks = +el.value; });
    host.querySelectorAll('[data-gk]').forEach((btn) => (btn.onclick = () => {
      btn.textContent = 'press a key…';
      const h = (e) => { e.preventDefault(); e.stopPropagation(); window.removeEventListener('keydown', h, true); const k = e.key === ' ' ? ' ' : e.key.toLowerCase();
        if (RESERVED.includes(k)) { toast(`“${e.key}” is reserved (menus, voice or camera). Pick another.`); render(); return; }
        for (const [a2, k2] of Object.entries(s.keys)) if (k2 === k) delete s.keys[a2];
        s.keys[btn.dataset.gk] = k; save(); render(); };
      window.addEventListener('keydown', h, true);
    }));
    $('ax-keys-reset').onclick = () => { s.keys = {}; save(); render(); };
  }
  // break reminders (gentle; never punish leaving)
  const t0 = Date.now(); let lastBreak = Date.now(), pausedAt = 0;
  setInterval(() => {
    const el = $('ax-session'); if (el) el.textContent = Math.floor((Date.now() - t0) / 60000);
    if (!s.breaks || document.visibilityState !== 'visible') { if (document.visibilityState !== 'visible') pausedAt = pausedAt || Date.now(); return; }
    if (pausedAt) { if (Date.now() - pausedAt > 5 * 60000) lastBreak = Date.now(); pausedAt = 0; } // a real break resets the timer
    if (Date.now() - lastBreak >= s.breaks * 60000) { lastBreak = Date.now(); showBreak(); }
  }, 15000);
  function showBreak() {
    const o = $('breakmodal'); if (!o) return;
    $('break-mins').textContent = String(Math.round((Date.now() - t0) / 60000));
    o.classList.remove('hidden'); $('break-ok').focus();
  }
  const bo = $('break-ok'), bp = $('break-pause');
  if (bo) bo.onclick = () => { $('breakmodal').classList.add('hidden'); lastBreak = Date.now(); };
  if (bp) bp.onclick = () => { $('breakmodal').classList.add('hidden'); document.body.classList.add('paused'); toast('Paused. Everything is saved: take your time.'); };
  apply(); render();
  return { get settings() { return s; }, get bindings() { return bindings(s); }, translate: (k) => translate(bindings(s), k), caption, reduced, apply, render, showBreak };
}
