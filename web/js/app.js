// OGCE v8.3 client: game loop glue between the server API, the 3D renderer, controls, hints and panels.
import { OGCE3D } from './renderer3d.js';
import { drawMap } from './minimap.js';
import { nextHint, nearest } from './hints.js';
import { cameraRelativeStep, heldVector, joystickVector, planPath, approachTarget } from './controls.js';
import { friendlyError, friendlyChronicle, WEAPON, QUEST, ITEM_ICON, KEYS } from './text.js';
import { skyState, groundY } from './world3d.js';
import { initLab } from './lab.js';
import { precheck } from './rules.js';

const $ = (id) => document.getElementById(id);
const WORLD = 'Aurelia';
const store = { get: (k, d) => { try { const v = localStorage.getItem('ogce83:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('ogce83:' + k, JSON.stringify(v)); } catch { /* private mode */ } } };

// ---------- state ----------
let state = null, revision = 0;
let session = store.get('session', null);
if (session && session.expires < Date.now()) session = null;
let guestId = store.get('guest', null); if (!guestId) { guestId = 'guest-' + Math.random().toString(36).slice(2, 8); store.set('guest', guestId); }
const playerId = () => (session ? session.username : guestId);
let guestBlocked = false, joinDismissed = false;
const done = new Set(store.get('done:' + playerId(), []));
const markDone = (k) => { if (!done.has(k)) { done.add(k); store.set('done:' + playerId(), [...done]); updateHint(); } };
let lastError = null, tipsOn = store.get('tips', true), labelsOn = store.get('labels', true);
const settings = { camSpeed: store.get('camspeed', 1), quality: store.get('quality', 'auto'), joystick: store.get('joystick', false) };
window.__ogce = { get state() { return state; }, get renderer() { return renderer; }, playerId, done, groundY }; // for tests & curious players

// ---------- renderer ----------
const canvas = $('worldview');
let renderer = null;
try {
  renderer = new OGCE3D(canvas, { onFrame: frameHook, quality: settings.quality === 'auto' ? undefined : +settings.quality });
  if (settings.quality !== 'auto') renderer.setQuality(+settings.quality, true);
} catch (e) {
  console.warn('3D unavailable, using the map view', e);
  canvas.classList.add('hidden'); $('map2d').classList.remove('hidden'); $('minimap').classList.add('hidden');
  toast('Your device can’t show 3D, so here’s the map view instead.');
}

// ---------- networking ----------
const authHeader = () => (session ? { Authorization: 'Bearer ' + session.token } : {});
async function api(method, path, body) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...authHeader() }, body: body ? JSON.stringify(body) : undefined });
  let d = {}; try { d = await r.json(); } catch { /* empty */ }
  if (!r.ok) { const err = new Error(d.error || 'HTTP ' + r.status); err.status = r.status; throw err; }
  return d;
}
async function load() {
  try { const d = await api('GET', `/api/world/${WORLD}`); applyState(d.state, d.revision); setNet(ws && ws.readyState === 1 ? 'live' : 'online'); }
  catch (e) { setNet('offline'); }
}
function applyState(s, rev) {
  if (!s) return; state = s; revision = rev ?? revision; state.world_id = WORLD;
  if (renderer) renderer.render(state, playerId());
  renderHUD(); updateHint();
}
function me() { return state?.players?.[playerId()] || { x: 2, y: 2, health: 100, max_health: 100, hunger: 0, inventory: {}, level: 1, xp: 0, potions: 0, equipment: { weapon: 'traveller_blade' }, quests: {} }; }

// one action in flight at a time keeps movement smooth and the server happy
let inflight = null;
async function act(action, opts = {}) {
  if (inflight) return false;
  if (guestBlocked && !session) { if (!joinDismissed) openJoin(); else toast(friendlyError('unauthorized')); return false; }
  const p0 = me();
  const local = (session || !guestBlocked) && precheck(action, state, p0);
  if (local) { onActionError(new Error(local), action, opts); return false; }
  inflight = action;
  try {
    if (ws && ws.readyState === 1) {
      await wsAct(action);
    } else {
      const d = await api('POST', `/api/world/${WORLD}/action`, { player_id: session ? undefined : playerId(), action });
      applyState(d.state, d.revision);
    }
    afterAction(action, p0);
    return true;
  } catch (e) {
    onActionError(e, action, opts);
    return false;
  } finally { inflight = null; }
}
function afterAction(action, p0) {
  const p = me();
  if (action.type === 'move') markDone('moved');
  if (action.type === 'gather') { markDone('gathered'); renderer?.playEffect('gather', p.x, p.y); }
  if (action.type === 'attack') { const c = (state.creatures || []).find((c) => c.id === action.target); if (c) renderer?.playEffect('attack', c.x, c.y); }
  if (action.type === 'craft' && action.recipe === 'healing_potion') markDone('potion');
  if (action.type === 'drink_potion' || action.type === 'rest') renderer?.playEffect('heal', p.x, p.y);
  if (action.type === 'build') renderer?.playEffect('build', p.x, p.y);
  if (action.type !== 'move') {
    const last = (state.chronicle || []).filter((c) => !c.player || c.player === playerId().slice(0, 12)).slice(-1)[0];
    if (last) toast(friendlyChronicle(last.message));
  }
  if ((p.level || 1) > (p0.level || 1)) toast(`🎉 Level up! You are now level ${p.level}.`);
  if (p.x === 2 && p.y === 2 && (p0.x !== 2 || p0.y !== 2) && (p0.health || 0) < 20) toast('You fainted and woke up back at camp. Be careful!');
}
function onActionError(e, action, opts) {
  const code = e.message;
  if (e.status === 401 || code === 'unauthorized') {
    if (session) { session = null; store.set('session', null); renderAccount(); }
    guestBlocked = true; path = []; held.clear();
    if (!joinDismissed) openJoin();
  } else if (!opts.quiet) {
    if (code === 'movement_blocked') path = [];
    lastError = { code, at: Date.now() }; toast(friendlyError(code)); updateHint(); setTimeout(updateHint, 6100);
  }
}

// ---------- live mode (WebSocket with one-time ticket) ----------
let ws = null, wsWaiters = [], wsRetry = 0, wsTimer = null;
function setNet(mode) {
  const el = $('netstatus'), pill = $('netpill'); pill.classList.remove('ok', 'warn');
  if (mode === 'live') { el.textContent = '🟢 Live'; pill.classList.add('ok'); pill.title = 'Live mode: you see other players move instantly'; }
  else if (mode === 'online') { el.textContent = '🟡 Online'; pill.classList.add('warn'); pill.title = 'Online: your progress is saved. Sign in for live mode.'; }
  else { el.textContent = '🔴 Offline'; pill.title = 'Can’t reach the game server right now'; }
}
let liveCapable = false;
async function connectLive() {
  if (!session) return;
  if (!liveCapable && !$('wsurl').value.trim()) { setNet('online'); return; }
  try { ws?.close(); } catch { /* ignore */ }
  let url = $('wsurl').value.trim();
  try {
    const t = await api('POST', '/api/auth/ws-ticket', {});
    if (!url) url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    const sock = new WebSocket(url + (url.includes('?') ? '&' : '?') + 'ticket=' + encodeURIComponent(t.ticket));
    ws = sock;
    sock.onopen = () => { wsRetry = 0; sock.send(JSON.stringify({ type: 'join', world: WORLD, player_id: playerId() })); };
    sock.onmessage = (ev) => {
      let d; try { d = JSON.parse(ev.data); } catch { return; }
      if (d.type === 'snapshot') { setNet('live'); applyState(d.state, d.revision); }
      else if (d.type === 'update') { applyState(d.state, d.revision); if (d.player_id === playerId()) settleWs(null); }
      else if (d.type === 'error') settleWs(new Error(d.error));
    };
    sock.onclose = () => { if (ws === sock) { ws = null; settleWs(new Error('connection_lost')); setNet('online'); if (session && wsRetry < 5) { clearTimeout(wsTimer); wsTimer = setTimeout(connectLive, 2000 * ++wsRetry); } } };
    sock.onerror = () => { /* onclose follows */ };
  } catch (e) { if (e.status === 401) onActionError(e, {}, {}); setNet(state ? 'online' : 'offline'); }
}
function wsAct(action) {
  return new Promise((resolve, reject) => {
    const w = { resolve, reject, timer: setTimeout(() => { wsWaiters = wsWaiters.filter((x) => x !== w); resolve(); }, 4000) };
    wsWaiters.push(w); ws.send(JSON.stringify({ type: 'action', action }));
  });
}
function settleWs(err) { const w = wsWaiters.shift(); if (!w) return; clearTimeout(w.timer); err ? w.reject(err) : w.resolve(); }
setInterval(() => { if (document.visibilityState === 'visible' && !(ws && ws.readyState === 1) && !inflight) load(); }, 3500);

// ---------- controls ----------
const held = new Set(), tapped = new Set(); let path = [], pendingUse = null, lastMoveAt = 0, diagToggle = false, joy = { right: 0, forward: 0 };
const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
window.addEventListener('keydown', (e) => {
  if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { e.preventDefault(); held.add(k); if (!e.repeat) tapped.add(k); path = []; pendingUse = null; renderer?.setMarker(null); return; }
  if (e.repeat) return;
  const map = { e: doGather, f: doAttack, b: () => act({ type: 'build', recipe: 'campfire' }), r: () => act({ type: 'rest' }), p: () => act({ type: 'craft', recipe: 'healing_potion' }), q: () => act({ type: 'drink_potion' }), t: () => act({ type: 'advance' }), c: () => renderer?.resetCamera(), h: toggleHelp, '?': toggleHelp, escape: closeOverlays };
  if (map[k]) { e.preventDefault(); map[k](); }
});
window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => held.clear());

function stepTick() {
  if (guestBlocked && !session) { if (held.size || tapped.size || joy.right || joy.forward) { held.clear(); tapped.clear(); joy = { right: 0, forward: 0 }; if (!joinDismissed) openJoin(); else toast(friendlyError('unauthorized')); } return; }
  if (inflight || !state) return;
  const now = performance.now(); if (now - lastMoveAt < 150) return;
  let [r, f] = heldVector(new Set([...held, ...tapped])); tapped.clear();
  if (!r && !f && (joy.right || joy.forward)) { r = Math.abs(joy.right) > 0.38 ? Math.sign(joy.right) : 0; f = Math.abs(joy.forward) > 0.38 ? Math.sign(joy.forward) : 0; }
  let step = null;
  if (r || f) { diagToggle = !diagToggle; step = cameraRelativeStep(r, f, renderer ? renderer.yaw : Math.PI, diagToggle); }
  else if (path.length) step = path.shift();
  else if (pendingUse) { const u = pendingUse; pendingUse = null; renderer?.setMarker(null); u(); return; }
  if (!step) return;
  const p = me(); const nx = p.x + step.dx, ny = p.y + step.dy;
  if (nx < 0 || ny < 0 || nx > 63 || ny > 63) { path = []; return; }
  lastMoveAt = now; act({ type: 'move', dx: step.dx, dy: step.dy });
  if (!path.length && !pendingUse) renderer?.setMarker(null);
}
setInterval(stepTick, 40);

const blocked = (x, y) => (state?.entities || []).some((e) => e.kind === 'structure' && e.structure === 'shelter' && e.x === x && e.y === y);
function walkTo(x, y, then) {
  const p = me(); const steps = planPath(p, { x, y }, blocked);
  if (!steps) { toast('I can’t find a way there.'); return; }
  path = steps; pendingUse = then || null; renderer?.setMarker(x, y);
}
function useTarget(t) {
  const p = me();
  if (t.kind === 'creature') { const s = approachTarget(p, t.obj, 2); walkTo(s.x, s.y, () => act({ type: 'attack', target: t.obj.id })); }
  else if (t.kind === 'resource') { const s = approachTarget(p, t.obj, 1); walkTo(s.x, s.y, () => act({ type: 'gather', target: t.obj.id })); }
  else { if (t.outside) toast('That’s the edge of the island — you can explore squares 0 to 63.'); walkTo(t.x, t.y); }
}
function doGather() {
  const p = me(); const r = nearest(state?.entities, p, (e) => e.kind === 'resource' && e.quantity > 0 && Math.abs(e.x - p.x) + Math.abs(e.y - p.y) <= 1);
  if (r) return act({ type: 'gather', target: r.id });
  const far = nearest(state?.entities, p, (e) => e.kind === 'resource' && e.quantity > 0);
  if (far) { toast(`Walking to the nearest ${far.resource}…`); useTarget({ kind: 'resource', obj: far }); } else toast('Everything nearby has been collected.');
}
function doAttack() {
  const p = me(); const inReach = (c) => c.alive !== false && Math.abs(c.x - p.x) + Math.abs(c.y - p.y) <= 2;
  const c = nearest(state?.creatures, p, (c) => inReach(c) && c.hostile) || nearest(state?.creatures, p, inReach);
  if (c) return act({ type: 'attack', target: c.id });
  const far = nearest(state?.creatures, p, (c) => c.alive !== false && c.hostile);
  if (far) { toast(`Heading towards ${far.name}…`); useTarget({ kind: 'creature', obj: far }); } else toast('No creatures nearby. Press T to let time pass.');
}

// pointer: drag = orbit, click/tap = walk/use, pinch/wheel = zoom
const pointers = new Map(); let pinch = 0, downAt = null;
const surface = renderer ? canvas : $('map2d');
surface.addEventListener('contextmenu', (e) => e.preventDefault());
surface.addEventListener('pointerdown', (e) => { surface.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); downAt = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
surface.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId); if (!prev) return;
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (downAt) downAt.moved += Math.abs(dx) + Math.abs(dy);
  if (pointers.size === 2 && renderer) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) renderer.zoom(pinch / d); pinch = d; return; }
  if (renderer && downAt && downAt.moved > 6) renderer.orbit(dx * settings.camSpeed, dy * settings.camSpeed);
});
const endPointer = (e) => {
  const wasTap = downAt && downAt.moved <= 8 && performance.now() - downAt.t < 450 && pointers.size === 1;
  pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0;
  if (wasTap && e.type === 'pointerup') {
    if (guestBlocked && !session) { openJoin(); downAt = null; return; }
    const t = renderer ? renderer.pick(e.clientX, e.clientY) : mapPick(e.clientX, e.clientY);
    if (t) useTarget(t);
  }
  if (pointers.size === 0) downAt = null;
};
surface.addEventListener('pointerup', endPointer); surface.addEventListener('pointercancel', endPointer);
surface.addEventListener('wheel', (e) => { e.preventDefault(); renderer?.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
function mapPick(cx, cy) { const c = $('map2d'), r = c.getBoundingClientRect(), span = 26, s = Math.min(r.width, r.height) / span, p = me(); return { kind: 'ground', x: Math.max(0, Math.min(63, Math.floor((cx - r.left) / s + p.x - span / 2 + 0.5))), y: Math.max(0, Math.min(63, Math.floor((cy - r.top) / s + p.y - span / 2 + 0.5))) }; }

// touch joystick
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const joyEl = $('joystick'), knob = $('knob');
function showJoystick() { joyEl.classList.toggle('hidden', !(isTouch || settings.joystick)); }
showJoystick();
let joyId = null;
joyEl.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joyEl.setPointerCapture(e.pointerId); moveJoy(e); path = []; pendingUse = null; });
joyEl.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) moveJoy(e); });
const endJoy = (e) => { if (e.pointerId !== joyId) return; joyId = null; joy = { right: 0, forward: 0 }; knob.style.transform = ''; };
joyEl.addEventListener('pointerup', endJoy); joyEl.addEventListener('pointercancel', endJoy);
function moveJoy(e) { const r = joyEl.getBoundingClientRect(); const v = joystickVector(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), r.width / 2 - 10); joy = v; knob.style.transform = `translate(${v.knob[0]}px,${v.knob[1]}px)`; }

// ---------- buttons ----------
const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
on('gather', doGather); on('attack', doAttack);
on('campfire', () => act({ type: 'build', recipe: 'campfire' })); on('campfire2', () => act({ type: 'build', recipe: 'campfire' }));
on('rest', () => act({ type: 'rest' })); on('advance', () => act({ type: 'advance' })); on('drink', () => act({ type: 'drink_potion' }));
on('potioncraft', () => act({ type: 'craft', recipe: 'healing_potion' })); on('potioncraft2', () => act({ type: 'craft', recipe: 'healing_potion' }));
on('stoneweapon', () => act({ type: 'craft', recipe: 'stone_edge' })); on('crystalweapon', () => act({ type: 'craft', recipe: 'crystal_sabre' }));
on('contextbtn', () => contextAction?.());
on('helpbtn', toggleHelp); on('helpclose', toggleHelp);
on('panelbtn', () => $('panel').classList.toggle('closed'));
on('hintclose', () => { setTips(false); }); on('hintshow', () => setTips(true));
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tabpage').forEach((x) => x.classList.toggle('active', x.id === 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'academy') markDone('academy'); if (b.dataset.tab === 'lifelab') markDone('lifelab');
}));
if (innerWidth < 760) $('panel').classList.add('closed');

// settings
const optTips = $('opt-tips'), optLabels = $('opt-labels'), optJoy = $('opt-joystick'), optQ = $('opt-quality'), optCam = $('opt-camspeed');
optTips.checked = tipsOn; optLabels.checked = labelsOn; optJoy.checked = settings.joystick; optQ.value = String(settings.quality); optCam.value = settings.camSpeed;
optTips.onchange = () => setTips(optTips.checked);
optLabels.onchange = () => { labelsOn = optLabels.checked; store.set('labels', labelsOn); if (!labelsOn) $('labels').textContent = ''; };
optJoy.onchange = () => { settings.joystick = optJoy.checked; store.set('joystick', settings.joystick); showJoystick(); };
optQ.onchange = () => { settings.quality = optQ.value; store.set('quality', optQ.value); if (renderer) { if (optQ.value === 'auto') renderer.qualityLocked = false; else renderer.setQuality(+optQ.value, true); } };
optCam.oninput = () => { settings.camSpeed = +optCam.value; store.set('camspeed', settings.camSpeed); };
on('connect', () => { wsRetry = 0; if (!session) { toast('Sign in first to use live mode.'); return; } connectLive(); });
function setTips(v) { tipsOn = v; store.set('tips', v); optTips.checked = v; updateHint(); }

// help overlay
$('keytable').innerHTML = ''; for (const [k, v] of KEYS) { const tr = document.createElement('tr'); const a = document.createElement('td'), b = document.createElement('td'); a.textContent = k; b.textContent = v; tr.append(a, b); $('keytable').append(tr); }
function toggleHelp() { $('help').classList.toggle('hidden'); }
function closeOverlays() { $('help').classList.add('hidden'); if (!$('joinmodal').classList.contains('hidden')) { joinDismissed = true; $('joinmodal').classList.add('hidden'); } }
$('help').addEventListener('click', (e) => { if (e.target.id === 'help') toggleHelp(); });

// ---------- account ----------
function renderAccount() {
  $('signedout').classList.toggle('hidden', !!session); $('signedin').classList.toggle('hidden', !session);
  $('whoami').textContent = session ? `Signed in as ${session.username} ✔` : '';
}
async function account(kind, u, pw, statusEl) {
  statusEl.textContent = kind === 'register' ? 'Making your account…' : 'Signing in…';
  try {
    const d = await api('POST', '/api/auth/' + kind, { username: u.trim(), password: pw });
    session = { token: d.token, username: d.username, expires: Date.now() + (d.expires_in || 43200) * 1000 };
    store.set('session', session); guestBlocked = false;
    done.clear(); for (const k of store.get('done:' + session.username, [])) done.add(k);
    statusEl.textContent = kind === 'register' ? `Welcome, ${d.username}! Your account is ready.` : `Welcome back, ${d.username}!`;
    $('joinmodal').classList.add('hidden'); renderAccount(); await load(); connectLive(); lab.refresh();
    toast(kind === 'register' ? '🎉 Account made — let’s explore!' : '👋 Signed in');
    return true;
  } catch (e) { statusEl.textContent = friendlyError(e.message); statusEl.classList.add('err'); return false; }
}
on('register', () => account('register', $('username').value, $('password').value, $('authstatus')));
on('login', () => account('login', $('username').value, $('password').value, $('authstatus')));
on('j-register', () => account('register', $('j-username').value, $('j-password').value, $('j-status')));
on('j-login', () => account('login', $('j-username').value, $('j-password').value, $('j-status')));
on('j-close', () => { joinDismissed = true; $('joinmodal').classList.add('hidden'); });
on('logout', () => { session = null; store.set('session', null); try { ws?.close(); } catch { /* */ } ws = null; renderAccount(); load(); lab.refresh(); toast('Signed out'); });
for (const id of ['password', 'j-password']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') $(id === 'password' ? 'login' : 'j-register').click(); });
function openJoin() { $('joinmodal').classList.remove('hidden'); setTimeout(() => $('j-username').focus(), 50); updateHint(); }

// ---------- HUD ----------
function renderHUD() {
  const p = me();
  $('player').textContent = session ? session.username : 'Guest explorer';
  $('level').textContent = p.level || 1;
  const hp = p.health ?? 100, mh = p.max_health || 100, xpNeed = (p.level || 1) * 100;
  $('health').textContent = `${hp}/${mh}`; $('hpfill').style.width = (100 * hp / mh) + '%';
  $('hunger').textContent = p.hunger || 0; $('hungerfill').style.width = (p.hunger || 0) + '%';
  $('xp').textContent = `${p.xp || 0}/${xpNeed}`; $('xpfill').style.width = (100 * (p.xp || 0) / xpNeed) + '%';
  $('potions').textContent = p.potions || 0; $('weapon').textContent = WEAPON[p.equipment?.weapon] || 'Traveller’s Blade';
  const inv = Object.entries(p.inventory || {}).filter(([, v]) => v > 0);
  $('inventory').textContent = inv.length ? inv.map(([k, v]) => `${ITEM_ICON[k] || '•'} ${v} ${k}`).join('  ') : 'Empty backpack';
  $('coords').textContent = `${p.x}, ${p.y}`; $('tick').textContent = state?.tick ?? 0;
  const sky = skyState(state?.tick ?? 0, state?.weather);
  $('daytime').textContent = sky.label; $('weather').textContent = { clear: 'Clear', rain: 'Rainy', wind: 'Windy', mist: 'Misty' }[state?.weather] || 'Clear';
  $('timepill').firstChild.textContent = (sky.label === 'Night' ? '🌙' : state?.weather === 'rain' ? '🌧️' : state?.weather === 'mist' ? '🌫️' : state?.weather === 'wind' ? '🍃' : '☀️') + ' ';
  // quests
  const ql = $('questlist'); ql.textContent = '';
  for (const [id, q] of Object.entries(QUEST)) {
    const s = p.quests?.[id] || {}, need = id === 'frontier_hunt' ? 2 : 6, prog = Math.min(need, s.progress || 0);
    const row = document.createElement('div'); row.className = 'quest';
    const info = document.createElement('div'); info.style.flex = '1';
    info.innerHTML = `<b></b><div class="small muted"></div><div class="prog"><i></i></div>`;
    info.querySelector('b').textContent = q.title + (s.claimed ? ' ✔' : '');
    info.querySelector('.small').textContent = `${q.goal} · Reward: ${q.reward}` + (s.accepted && !s.claimed ? ` · ${prog}/${need}` : '');
    info.querySelector('i').style.width = (s.accepted ? 100 * prog / need : 0) + '%';
    const btn = document.createElement('button');
    if (!s.accepted) { btn.textContent = 'Accept'; btn.id = id === 'frontier_hunt' ? 'questhunt' : 'questgather'; btn.onclick = () => act({ type: 'quest', operation: 'accept', quest_id: id }); }
    else if (!s.claimed && prog >= need) { btn.textContent = 'Claim reward'; btn.className = 'primary'; btn.id = 'questclaim'; btn.onclick = () => act({ type: 'quest', operation: 'claim', quest_id: id }); }
    else { btn.textContent = s.claimed ? 'Done' : 'In progress'; btn.disabled = true; }
    row.append(info, btn); ql.append(row);
  }
  // chronicle
  const ch = $('chronicle'); ch.textContent = '';
  for (const c of (state?.chronicle || []).filter((c) => c.type !== 'chat').slice(-8).reverse()) { const li = document.createElement('li'); li.textContent = (c.player && c.player !== playerId().slice(0, 12) ? c.player + ': ' : '') + friendlyChronicle(c.message || c.type); ch.append(li); }
  if (!ch.children.length) { const li = document.createElement('li'); li.textContent = 'Your story begins.'; ch.append(li); }
  updateContext();
}

let contextAction = null;
function updateContext() {
  const btn = $('contextbtn'), p = me(); contextAction = null;
  if (!state) { btn.classList.add('hidden'); return; }
  const res = nearest(state.entities, p, (e) => e.kind === 'resource' && e.quantity > 0 && Math.abs(e.x - p.x) + Math.abs(e.y - p.y) <= 1);
  const foe = nearest(state.creatures, p, (c) => c.alive !== false && Math.abs(c.x - p.x) + Math.abs(c.y - p.y) <= 2);
  const camp = (state.entities || []).some((e) => e.kind === 'structure' && Math.abs(e.x - p.x) + Math.abs(e.y - p.y) <= 1);
  let label = '';
  if (foe && foe.hostile) { label = `<kbd>F</kbd> Attack ${foe.name}`; contextAction = () => act({ type: 'attack', target: foe.id }); }
  else if (res) { label = `<kbd>E</kbd> Collect ${res.resource} ${ITEM_ICON[res.resource] || ''}`; contextAction = () => act({ type: 'gather', target: res.id }); }
  else if (camp && ((p.health ?? 100) < (p.max_health || 100) || (p.hunger || 0) > 0)) { label = '<kbd>R</kbd> Rest by the fire'; contextAction = () => act({ type: 'rest' }); }
  btn.innerHTML = label; btn.classList.toggle('hidden', !label);
}

// ---------- hints ----------
let hintId = null, hintTarget = null;
function updateHint() {
  const h = nextHint({ state, player: state ? me() : null, signedIn: !!session, guestBlocked, done, lastError, now: Date.now(), touch: isTouch });
  hintTarget = tipsOn ? h.target || null : null;
  renderer?.setHintTarget(hintTarget);
  $('hint').classList.toggle('hidden', !tipsOn); $('hintshow').classList.toggle('hidden', tipsOn);
  if (!tipsOn) return;
  const el = $('hint'); el.className = h.tone; $('hinttext').textContent = h.text;
  $('hinticon').textContent = { tip: '🧭', warn: '⚠️', error: '🙈', done: '🏆' }[h.tone] || '🧭';
  if (h.id !== hintId) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); hintId = h.id; }
}

// ---------- per-frame: labels + minimap ----------
const labelPool = []; let mapAt = 0;
function frameHook(r) {
  if (labelsOn) {
    const L = r.labels || [], eye = r.eye || [0, 0, 0]; let n = 0;
    for (const l of L) {
      const d = Math.hypot(l.x - eye[0], l.y - eye[1], l.z - eye[2]); if (d > 26) continue;
      const s = r.project(l.x, l.y, l.z); if (!s || s.x < -50 || s.y < -20 || s.x > innerWidth + 50 || s.y > innerHeight + 20) continue;
      let el = labelPool[n]; if (!el) { el = document.createElement('div'); el.innerHTML = '<span></span><span class="hpb"><i></i></span>'; $('labels').append(el); labelPool[n] = el; }
      el.className = 'lbl ' + l.cls; el.firstChild.textContent = l.text;
      el.lastChild.style.display = l.hp != null && l.hp < 1 ? 'block' : 'none'; if (l.hp != null) el.lastChild.firstChild.style.width = Math.max(0, l.hp * 100) + '%';
      el.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%) scale(${Math.max(0.7, Math.min(1.1, 14 / d))})`; el.style.left = '0'; el.style.top = '0'; el.style.display = 'block'; el.style.opacity = d > 20 ? (26 - d) / 6 : 1;
      n++;
    }
    for (let i = n; i < labelPool.length; i++) labelPool[i].style.display = 'none';
  }
  const now = performance.now();
  if (now - mapAt > 200 && state) { mapAt = now; drawMap($('minimap'), state, playerId(), { yaw: r.yaw, hint: hintTarget, marker: r.marker }); }
  if (now % 1000 < 20) $('perf').textContent = `Graphics: ${['Low', 'Medium', 'High'][r.quality]} · about ${r.fps} frames per second`;
}
if (!renderer) { const c = $('map2d'); const draw = () => { c.width = innerWidth; c.height = innerHeight; if (state) drawMap(c, state, playerId(), { span: 26, hint: hintTarget }); requestAnimationFrame(draw); }; draw(); }
setInterval(() => { if (lastError && Date.now() - lastError.at > 6000) { lastError = null; updateHint(); } }, 1000);

// ---------- toast ----------
let toastTimer = null;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800); }

// ---------- boot ----------
const lab = initLab({ getSession: () => session, playerId, toast, onUnauthorized: () => { guestBlocked = true; if (!joinDismissed) openJoin(); } });
renderAccount(); setNet('offline'); updateHint();
fetch('/health').then((r) => r.json()).then((h) => { liveCapable = /durable-object/.test(h.runtime || ''); if (h.accounts_required && !session) { guestBlocked = true; updateHint(); } }).catch(() => {})
  .finally(() => load().then(() => { if (session) connectLive(); }));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
