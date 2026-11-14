// Strata: Lux Genesis (v9.0, OGCE engine) client: game loop glue between the server API, the HD 3D renderer, controls, hints,
// panels, the Strata layer (Journal/Codex/Malcolm), the Expedition omniverse, audio and voice control.
import { OGCE3D } from './renderer3d.js';
import { drawMap } from './minimap.js';
import { nextHint, nearest } from './hints.js';
import { cameraRelativeStep, heldVector, joystickVector, planPath, approachTarget } from './controls.js';
import { friendlyError, friendlyChronicle, WEAPON, QUEST, ITEM_ICON, KEYS } from './text.js';
import { skyState, groundY } from './world3d.js';
import { initLab } from './lab.js';
import { precheck } from './rules.js';
import { initStrata } from './strata.js';
import { initExpedition } from './expedition.js';
import { initVoice } from './voice.js';
import { createAudio } from './audio.js';
import { TIERS } from './renderer3d.js';
import { initDuel } from './duel.js';
import { initProgress } from './progress.js';
import { PRESETS, sanitizeSettings, sanitizeKeys, keyAction, DEFAULT_KEYS } from './camera.js';
import { initAccess } from './access.js';
import { initPhoto } from './photo.js';
import { playOpening, initTutorial } from './opening.js';
import { initMysticUI } from './mysticui.js';
import { createMusic } from './music.js';
import { initMediaKeepalive, bgInterval } from './keepalive.js';
import { initMultiplayer, roomFromUrl } from './multiplayer.js';
import { createOfflineGame, createQueue, isNetworkError, initInstall } from './offline.js';
import { initDirector } from './directorclient.js';

const $ = (id) => document.getElementById(id);
const ROOM = roomFromUrl(location.search); // ?room=CODE -> that shared world (its own Durable Object)
const WORLD = ROOM ? 'sw_' + ROOM : 'Aurelia';
const store = { get: (k, d) => { try { const v = localStorage.getItem('strata90:' + k) ?? localStorage.getItem('ogce83:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('strata90:' + k, JSON.stringify(v)); } catch { /* private mode */ } } };

// ---------- state ----------
let state = null, revision = 0;
let session = store.get('session', null);
if (session && session.expires < Date.now()) session = null;
let guestId = store.get('guest', null); if (!guestId) { guestId = 'guest-' + Math.random().toString(36).slice(2, 8); store.set('guest', guestId); }
const playerId = () => (session ? session.username : guestId);
let guestBlocked = false, joinDismissed = false;
const done = new Set(store.get('done:' + playerId(), []));
const markDone = (k) => { if (!done.has(k)) { done.add(k); store.set('done:' + playerId(), [...done]); updateHint(); tutorial?.update(); } };
let tutorial = null, access = null, photo = null, mysticui = null, music = null, mp = null, director = null, offlineGame = null, offlineMode = false;
const caption = (t, who) => access?.caption(t, who);
const queue = createQueue(store);
let lastError = null, tipsOn = store.get('tips', true), labelsOn = store.get('labels', true);
const settings = { camSpeed: store.get('camspeed', 1), quality: store.get('quality', 'auto'), joystick: store.get('joystick', false) };
let strata = null, expedition = null, voice = null, audio = null, duel = null, progress = null;
window.__ogce = { get state() { return state; }, get renderer() { return renderer; }, playerId, done, groundY, WORLD, get mp() { return mp; }, get photo() { return photo; }, get access() { return access; }, get music() { return music; }, get mysticui() { return mysticui; }, get director() { return director; }, get offline() { return offlineMode; }, get queue() { return queue; }, get strata() { return strata; }, get expedition() { return expedition; }, get voice() { return voice; }, get audio() { return audio; } }; // for tests & curious players

// ---------- renderer ----------
const canvas = $('worldview');
let renderer = null;
try {
  renderer = new OGCE3D(canvas, { onFrame: frameHook, quality: settings.quality === 'auto' ? undefined : +settings.quality, camera: store.get('camera', {}), renderScale: store.get('renderscale', 1) });
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
let loadFails = 0;
async function load() {
  try {
    const d = await api('GET', `/api/world/${WORLD}`); loadFails = 0;
    if (offlineMode) { offlineMode = false; document.body.classList.remove('offline-solo'); toast('🌐 Back online: you are in the shared world again. Your offline practice is saved on this device.'); }
    applyState(d.state, d.revision); setNet(ws && ws.readyState === 1 ? 'live' : 'online');
    if (queue.size) flushQueue();
  } catch (e) {
    setNet(offlineMode ? 'solo' : 'offline');
    if (!e.status && ++loadFails >= 2 && !offlineMode && !ROOM) startOffline(); // the server can't be reached: offline solo play
  }
}
function startOffline() {
  try { offlineGame = offlineGame || createOfflineGame(store); const r = offlineGame.load(); offlineMode = true; document.body.classList.add('offline-solo'); applyState(r.state, r.revision); setNet('solo');
    toast('📴 No connection: playing Offline practice on this device (same rules; not counted on leaderboards).'); } catch (e) { console.warn('offline play unavailable', e); }
}
async function flushQueue() {
  const r = await queue.flush(async (it) => { try { const d = await api('POST', `/api/world/${WORLD}/action`, { player_id: session ? undefined : playerId(), action: it.action }); applyState(d.state, d.revision); } catch (e) { if (isNetworkError(e)) e.network = true; throw e; } });
  if (r.sent || r.rejected) toast(`🔄 Synced ${r.sent} saved action${r.sent === 1 ? '' : 's'}${r.rejected ? ` (${r.rejected} no longer possible)` : ''}.`);
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
  inflight = action; director?.signals.action();
  try {
    if (offlineMode && offlineGame) { const d = offlineGame.act(playerId(), action); applyState(d.state, d.revision); afterAction(action, p0); return true; }
    if (ws && ws.readyState === 1) {
      await wsAct(action);
    } else {
      const d = await api('POST', `/api/world/${WORLD}/action`, { player_id: session ? undefined : playerId(), action });
      applyState(d.state, d.revision);
      if (d.v90?.unlocked?.length) strata?.onUnlocked(d.v90.unlocked);
    }
    afterAction(action, p0);
    return true;
  } catch (e) {
    if (!offlineMode && isNetworkError(e) && action.type !== 'move') { queue.push({ action }); toast('📶 Connection dropped: saved, and it will be sent when you are back online.'); return false; }
    onActionError(e, action, opts);
    return false;
  } finally { inflight = null; }
}
let actionsSinceRefresh = 0;
function afterAction(action, p0) {
  const p = me();
  audio?.play({ gather: 'gather', attack: 'attack', build: 'build', rest: 'heal', drink_potion: 'heal', craft: 'build', chat: 'message' }[action.type]);
  if (++actionsSinceRefresh >= 6 || action.type !== 'move') { actionsSinceRefresh = 0; strata?.refresh(); }
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
  if ((p.level || 1) > (p0.level || 1)) { toast(`🎉 Level up! You are now level ${p.level}.`); audio?.play('level'); }
  if (p.x === 2 && p.y === 2 && (p0.x !== 2 || p0.y !== 2) && (p0.health || 0) < 20) { toast('You fainted and woke up back at camp. Be careful!'); director?.signals.faint(); }
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
  else if (mode === 'solo') { el.textContent = '🟣 Offline practice'; pill.classList.add('warn'); pill.title = 'No connection: playing a private practice world on this device (same rules). Reconnects automatically.'; }
  else { el.textContent = '🔴 Offline'; pill.title = 'Can’t reach the game server right now'; }
}
let liveCapable = false;
async function connectLive() {
  if (!session) return;
  if (!liveCapable && !ROOM && !$('wsurl').value.trim()) { setNet('online'); return; }
  try { ws?.close(); } catch { /* ignore */ }
  let url = $('wsurl').value.trim();
  try {
    const t = await api('POST', '/api/auth/ws-ticket', {});
    if (!url) url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws' + (ROOM ? '?room=' + ROOM : '');
    const sock = new WebSocket(url + (url.includes('?') ? '&' : '?') + 'ticket=' + encodeURIComponent(t.ticket));
    ws = sock;
    sock.onopen = () => { wsRetry = 0; sock.send(JSON.stringify({ type: 'join', world: WORLD, player_id: playerId() })); };
    sock.onmessage = (ev) => {
      let d; try { d = JSON.parse(ev.data); } catch { return; }
      if (d.type === 'snapshot') { setNet('live'); applyState(d.state, d.revision); mp?.attach(sock); }
      else if (d.type === 'update') { applyState(d.state, d.revision); if (d.player_id === playerId()) settleWs(null); }
      else if (d.type === 'error') settleWs(new Error(d.error));
      else if (d.type === 'v90') strata?.onUnlocked(d.unlocked);
      else if (d.type === 'pong') { /* keepalive */ }
      else mp?.handle(d);
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

// ---------- v9.0 camera: settings, presets, saved views, rebindable keys, gamepad ----------
let camKeys = sanitizeKeys(store.get('camkeys', {}));
let camSlots = store.get('camslots', [null, null, null]); if (!Array.isArray(camSlots) || camSlots.length !== 3) camSlots = [null, null, null];
function saveCam() { if (renderer) store.set('camera', renderer.rig.s); }
function cameraKey(a, repeat) {
  const R = renderer.rig;
  if (a === 'rotateLeft') R.rotate(1, repeat ? 0.12 : 0.26); else if (a === 'rotateRight') R.rotate(-1, repeat ? 0.12 : 0.26);
  else if (a === 'tiltUp') R.tilt(1, repeat ? 0.07 : 0.14); else if (a === 'tiltDown') R.tilt(-1, repeat ? 0.07 : 0.14);
  else if (a === 'zoomIn') R.zoom(0.82); else if (a === 'zoomOut') R.zoom(1.22);
  else if (!repeat && a === 'recenter') renderer.recenter();
  else if (!repeat && a === 'toggleView') { R.toggleMode(); toast(R.mode === 'first' ? '👁️ First person' : '🎥 Third person'); }
  else if (!repeat && a.startsWith('preset')) { const s = camSlots[+a.slice(6) - 1]; if (s) { R.applyPreset(s); toast(`🎥 ${s.name}`); } else toast('Save a view in Settings → Camera first.'); }
}
function confirmAction(text, fn) {
  const yes = $('vconfirm-yes'), no = $('vconfirm-no'), oy = yes.onclick, on = no.onclick;
  const done = () => { yes.onclick = oy; no.onclick = on; $('vconfirm').classList.add('hidden'); };
  $('vconfirm-text').textContent = text; $('vconfirm').classList.remove('hidden');
  yes.onclick = () => { done(); fn(); }; no.onclick = () => done(); yes.focus();
}
function startDuel(c) {
  if (!duel) return act({ type: 'attack', target: c.id });
  const p = me(); const face = Math.atan2(c.x - p.x, c.y - p.y);
  duel.start(c.id, { face }).then(() => { if (!duel.active) act({ type: 'attack', target: c.id }); });
}
function initCameraSettings() {
  if (!renderer) return;
  const R = renderer.rig, s = R.s, bind = (id, key, conv = (v) => +v) => { const el = $(id); if (!el) return; if (el.type === 'checkbox') el.checked = !!s[key]; else el.value = s[key]; el.oninput = el.onchange = () => { R.configure({ [key]: el.type === 'checkbox' ? el.checked : conv(el.value) }); saveCam(); }; };
  bind('cam-sens', 'sens'); bind('cam-smooth', 'smoothing'); bind('cam-invx', 'invertX'); bind('cam-invy', 'invertY'); bind('cam-shoulder', 'shoulder', (v) => v);
  bind('cam-fov', 'fov'); bind('cam-fpfov', 'fpFov'); bind('cam-bob', 'headBob');
  $('cam-presets').innerHTML = Object.entries(PRESETS).map(([k, p]) => `<button data-preset="${k}">${p.name}</button>`).join('') + '<button data-preset="first">First person</button>';
  $('cam-presets').querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => { if (b.dataset.preset === 'first') R.setMode('first'); else R.applyPreset(b.dataset.preset); }));
  const slots = () => { $('cam-slots').innerHTML = camSlots.map((v, i) => `<span class="slot"><button data-load="${i}" ${v ? '' : 'disabled'}>${i + 7}: ${v ? v.name : 'empty'}</button><button data-save="${i}" title="Save the current view here">💾</button></span>`).join('');
    $('cam-slots').querySelectorAll('[data-save]').forEach((b) => (b.onclick = () => { const i = +b.dataset.save; camSlots[i] = R.snapshot(`View ${i + 1}`); store.set('camslots', camSlots); slots(); toast(`Saved view ${i + 1} (press ${i + 7})`); }));
    $('cam-slots').querySelectorAll('[data-load]').forEach((b) => (b.onclick = () => R.applyPreset(camSlots[+b.dataset.load]))); };
  slots();
  const LABEL = { rotateLeft: 'Rotate left', rotateRight: 'Rotate right', tiltUp: 'Tilt up (towards top-down)', tiltDown: 'Tilt down (towards ground)', zoomIn: 'Zoom in', zoomOut: 'Zoom out', recenter: 'Recenter behind you', toggleView: 'First / third person', preset1: 'Saved view 1', preset2: 'Saved view 2', preset3: 'Saved view 3' };
  const RESERVED = new Set(['w', 'a', 's', 'd', 'e', 'f', 'q', 'r', 'v', 'b', 'p', 't', 'c', 'h', 'j', 'k', 'm', 'o', 'i', '/', 'enter', 'escape', 'shift', 'space', '1', '2']);
  const keys = () => { $('cam-keys').innerHTML = Object.keys(DEFAULT_KEYS).map((a) => `<label>${LABEL[a]} <button data-key="${a}">${camKeys[a].join(' / ')}</button></label>`).join('') + '<button id="cam-keys-reset">Reset keys</button>';
    $('cam-keys').querySelectorAll('[data-key]').forEach((b) => (b.onclick = () => { b.textContent = 'press a key…'; const h = (e) => { e.preventDefault(); e.stopPropagation(); window.removeEventListener('keydown', h, true); const k = e.key.toLowerCase(); if (RESERVED.has(k) || k === ' ') { toast(`“${e.key}” is used by the game. Pick another.`); keys(); return; } for (const [a2, l] of Object.entries(camKeys)) camKeys[a2] = l.filter((x) => x !== k); camKeys[b.dataset.key] = [k, ...camKeys[b.dataset.key].filter((x) => x !== k)].slice(0, 2); for (const a2 of Object.keys(camKeys)) if (!camKeys[a2].length) camKeys[a2] = [...DEFAULT_KEYS[a2]]; store.set('camkeys', camKeys); keys(); }; window.addEventListener('keydown', h, true); }));
    $('cam-keys-reset').onclick = () => { camKeys = sanitizeKeys({}); store.set('camkeys', camKeys); keys(); }; };
  keys();
}
initCameraSettings();
let padPrev = null, padLast = performance.now();
setInterval(() => {
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null; const now = performance.now(), dt = (now - padLast) / 1000; padLast = now;
  if (!gp || !renderer) { padPrev = null; return; }
  const ax = (i) => gp.axes[i] || 0, b = (i) => !!gp.buttons[i]?.pressed, was = (i) => !!padPrev?.[i];
  renderer.rig.stick(ax(2), ax(3), dt);
  if (b(11) && !was(11)) renderer.recenter();
  if (b(8) && !was(8)) renderer.cameraOp('toggle');
  if (b(12)) renderer.rig.zoom(1 - dt * 1.2); if (b(13)) renderer.rig.zoom(1 + dt * 1.2);
  if (!duel?.active) { const lx = ax(0), ly = ax(1); joy = Math.hypot(lx, ly) > 0.25 ? { right: lx, forward: -ly } : (padPrev ? { right: 0, forward: 0 } : joy); if (b(2) && !was(2)) doAttack(); if (b(0) && !was(0)) doGather(); }
  duel?.pad(gp, padPrev);
  padPrev = gp.buttons.map((x) => x.pressed);
}, 33);

// ---------- controls ----------
const held = new Set(), tapped = new Set(); let path = [], pendingUse = null, lastMoveAt = 0, diagToggle = false, joy = { right: 0, forward: 0 };
const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
window.addEventListener('keydown', (e) => {
  if (duel?.active && !typing() && duel.onKey(e, true)) { e.preventDefault(); return; }
  if (e.key === 'Escape') { // Esc always works, even from inside a text box
    if (typing()) document.activeElement.blur();
    if (!$('vconfirm').classList.contains('hidden')) { $('vconfirm-no').click(); return; }
    $('cmdbox').classList.add('hidden'); $('chatbox').classList.add('hidden');
    if (expedition?.open) expedition.onKey('escape'); else closeOverlays();
    return;
  }
  if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (photo?.on) { if (photo.onKey(e.key.toLowerCase())) e.preventDefault(); return; }
  const raw = e.key.toLowerCase(), k = access ? access.translate(raw) : raw; // remappable + one-handed controls
  if (k === '__unbound__') return;
  if (!e.repeat && k === '0' && !expedition?.open) { e.preventDefault(); closeOverlays(); photo?.open(); return; }
  if (!e.repeat && k === '5' && !expedition?.open) { e.preventDefault(); mysticui?.open(); return; }
  if (!e.repeat && k === '6' && !expedition?.open) { e.preventDefault(); mp?.open(); return; }
  if (!e.repeat && k === 'u' && !expedition?.open) { e.preventDefault(); mp?.toggleWheel(); return; }
  if (voice?.keyDown(e)) { e.preventDefault(); return; }
  if (expedition?.open || k === 'o') { if (expedition?.onKey(k)) { e.preventDefault(); return; } }
  if (!e.repeat && strata?.onKey(k)) { e.preventDefault(); return; }
  { const ca = renderer && keyAction(camKeys, k === ' ' ? 'space' : k); if (ca && !expedition?.open) { e.preventDefault(); cameraKey(ca, e.repeat); return; } }
  if (k === 'i' && !e.repeat) { e.preventDefault(); progress.open(); markDone('progress'); return; }
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { e.preventDefault(); held.add(k); if (!e.repeat) tapped.add(k); path = []; pendingUse = null; renderer?.setMarker(null); return; }
  if (e.repeat) return;
  const map = { e: doGather, f: doAttack, b: () => act({ type: 'build', recipe: 'campfire' }), r: () => act({ type: 'rest' }), p: () => act({ type: 'craft', recipe: 'healing_potion' }), q: () => act({ type: 'drink_potion' }), t: () => act({ type: 'advance' }), c: () => renderer?.resetCamera(), h: toggleHelp, '?': toggleHelp, escape: closeOverlays };
  if (map[k]) { e.preventDefault(); map[k](); }
});
window.addEventListener('keyup', (e) => { const rk = e.key.toLowerCase(); held.delete(rk); if (access) held.delete(access.translate(rk)); if (duel?.active && duel.onKey(e, false)) return; if (!typing()) voice?.keyUp(e); });
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
  if (t.kind === 'creature') { const s = approachTarget(p, t.obj, 2); walkTo(s.x, s.y, () => startDuel(t.obj)); }
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
  if (c) return startDuel(c);
  const far = nearest(state?.creatures, p, (c) => c.alive !== false && c.hostile);
  if (far) { toast(`Heading towards ${far.name}…`); useTarget({ kind: 'creature', obj: far }); } else toast('No creatures nearby. Press T to let time pass.');
}

// pointer: drag = orbit, click/tap = walk/use, pinch/wheel = zoom
const pointers = new Map(); let pinch = 0, downAt = null;
const surface = renderer ? canvas : $('map2d');
surface.addEventListener('contextmenu', (e) => e.preventDefault());
surface.addEventListener('pointerdown', (e) => { if (e.button === 1) { e.preventDefault(); renderer?.recenter(); return; } if (duel?.active && e.pointerType === 'mouse') duel.onPointer(e, true); surface.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); downAt = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
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
  if (wasTap && e.type === 'pointerup' && duel?.active) { pointers.delete(e.pointerId); downAt = null; return; }
  if (wasTap && e.type === 'pointerup') {
    if (guestBlocked && !session) { openJoin(); downAt = null; return; }
    const t = renderer ? renderer.pick(e.clientX, e.clientY) : mapPick(e.clientX, e.clientY);
    if (t) useTarget(t);
  }
  if (pointers.size === 0) downAt = null;
};
surface.addEventListener('pointerup', endPointer); surface.addEventListener('pointercancel', endPointer);
surface.addEventListener('wheel', (e) => { e.preventDefault(); renderer?.rig.wheel(e.deltaY); }, { passive: false });
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
document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
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
function closeOverlays() { strata?.closeAll(); mp?.closeAll(); mysticui?.close(); photo?.close(); $('breakmodal')?.classList.add('hidden'); $('progress').classList.add('hidden'); $('combatpanel').classList.add('hidden'); $('help').classList.add('hidden'); if (!$('joinmodal').classList.contains('hidden')) { joinDismissed = true; $('joinmodal').classList.add('hidden'); } }
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
  if (h.id !== hintId) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); hintId = h.id; director?.signals.hint(); }
}

// ---------- per-frame: labels + minimap ----------
const labelPool = []; let mapAt = 0;
function frameHook(r) {
  document.body.classList.toggle('fp', !!r.firstPerson);
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
  if (now % 1000 < 20) $('perf').textContent = `Graphics: ${(TIERS[r.quality] || TIERS[0]).name} · about ${r.fps} frames per second`;
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

// ---------- Strata layer, Expedition, audio and voice ----------
audio = createAudio();
const isGuest = () => !session;
const announce = (t) => { const el = $('srlive'); if (el) { el.textContent = ''; setTimeout(() => { el.textContent = t; }, 30); } };
strata = initStrata({ api, toast, audio, world: WORLD, store, isGuest, playerId, friendly: friendlyError, renderer, act, skipTitle: !!ROOM || new URLSearchParams(location.search).has('play') || store.get('seenTitle', false) && innerWidth < 0, onPlay: () => store.set('seenTitle', true) });
expedition = initExpedition({ api, toast, audio, world: WORLD, isGuest, playerId, friendly: friendlyError, renderer });
duel = initDuel({ $, api, toast, renderer, world: WORLD, playerId, session: () => session, sfx: (k) => audio?.sfx?.(k === 'hit' ? 'attack' : k === 'parry' ? 'level' : 'step'),
  onWorld: () => { load(); markDone('duel'); }, getPrinciples: async () => expedition.state.me?.principles || (await api('GET', `/api/v90/omni/me/${WORLD}?player=${encodeURIComponent(playerId())}`)).explorer?.principles || [] });
progress = initProgress({ $, api, toast, world: WORLD, playerId, session: () => session, confirmAction, onUnlocked: (g) => { if (renderer) renderer.cosmetics = new Set(g.unlocked); if (g.stratum) music?.set({ stratum: g.stratum.index }); } });
$('progressbtn').onclick = () => { progress.open(); markDone('progress'); };
$('combatbtn').onclick = () => duel.openPanel();
$('viewbtn').onclick = () => { if (renderer) { renderer.cameraOp('toggle'); saveCam(); } };
$('recenterbtn').onclick = () => renderer?.recenter();
const checkbox = (id, v) => { const el = $(id); if (el && el.checked !== v) { el.checked = v; el.dispatchEvent(new Event('change')); } };
const NSEW = { north: { dx: 0, dy: -1 }, south: { dx: 0, dy: 1 }, east: { dx: 1, dy: 0 }, west: { dx: -1, dy: 0 } };
const BASE_RECIPES = ['healing_potion', 'stone_edge', 'crystal_sabre'];
async function profileOp(body) { const d = await api('POST', `/api/v90/profile/${WORLD}`, { ...body, ...(session ? {} : { player_id: playerId() }) }); strata.onUnlocked(d.unlocked); strata.refresh(); return d; }
async function execute(a) {
  switch (a.type) {
    case 'move': {
      const step = NSEW[a.dir] || cameraRelativeStep(a.dir === 'left' ? -1 : a.dir === 'right' ? 1 : 0, a.dir === 'forward' ? 1 : a.dir === 'back' ? -1 : 0, renderer ? renderer.yaw : Math.PI, false);
      path = Array.from({ length: a.steps }, () => ({ ...step })); pendingUse = null; return `Walking ${a.dir}${a.steps > 1 ? ' ' + a.steps + ' steps' : ''}.`;
    }
    case 'gather': doGather(); return '';
    case 'attack': doAttack(); return '';
    case 'rest': await act({ type: 'rest' }); return '';
    case 'wait': await act({ type: 'advance' }); return 'Time passes.';
    case 'drink': await act({ type: 'drink_potion' }); return '';
    case 'craft':
      if (BASE_RECIPES.includes(a.recipe)) { await act({ type: 'craft', recipe: a.recipe }); return ''; }
      try { const d = await api('POST', `/api/v90/omni/${WORLD}`, { operation: 'craft', recipe: a.recipe, ...(session ? {} : { player_id: playerId() }) }); return `Crafted ${d.result.crafted.replace('_', ' ')} (in your Expedition bag).`; } catch (e) { return friendlyError(e.message); }
    case 'build':
      if (a.recipe === 'campfire' || a.recipe === 'shelter') { await act({ type: 'build', recipe: a.recipe }); return ''; }
      await expedition.run({ type: 'open', panel: 'expedition' }); return `Pick “${a.recipe}” under Build, then tap a free square next to you.`;
    case 'open':
      if (a.panel === 'journal' || a.panel === 'malcolm') { strata.show(a.panel); return ''; }
      if (a.panel === 'codex') { strata.openCodex(); return ''; }
      if (['expedition', 'workshop', 'wildlife', 'people', 'character'].includes(a.panel)) { await expedition.run(a); return ''; }
      if (a.panel === 'help') { $('help').classList.remove('hidden'); return ''; }
      if (a.panel === 'progress') { progress.open(); return ''; }
      if (a.panel === 'combat') { duel.openPanel(); return ''; }
      $('panel').classList.remove('closed'); document.querySelector('[data-tab="adventure"]')?.click(); return a.panel === 'map' ? 'The map is in the corner of the screen.' : '';
    case 'close': closeOverlays(); expedition.hide(); $('cmdbox').classList.add('hidden'); return '';
    case 'mode': $('panel').classList.remove('closed'); document.querySelector(`[data-tab="${a.mode}"]`)?.click(); return `${{ adventure: 'Adventure', academy: 'Magic and Science', lifelab: 'Tiny Life Lab' }[a.mode]} mode.`;
    case 'camera':
      if (!renderer) return 'The 3D view is off on this device.';
      renderer.cameraOp(a.op); saveCam();
      return { first: 'First person.', third: 'Third person.', toggle: renderer.rig.mode === 'first' ? 'First person.' : 'Third person.', from_above: 'Looking from above.', recenter: 'Camera behind you.', reset: 'Camera reset.' }[a.op] || '';
    case 'combat': return duel.voice(a.op);
    case 'new_genesis': await progress.confirmed(); return '';
    case 'setting':
      if (a.name === 'quality') { optQ.value = { auto: 'auto', low: '0', medium: '1', high: '2', ultra: '3' }[a.value]; optQ.dispatchEvent(new Event('change')); return `Graphics set to ${a.value}.`; }
      checkbox({ sound: 'opt-sound', labels: 'opt-labels', tips: 'opt-tips', joystick: 'opt-joystick' }[a.name], a.value === 'on'); return `${a.name} ${a.value}.`;
    case 'say': await act({ type: 'chat', message: a.message }); return '';
    case 'ask': strata.show('malcolm'); document.querySelector(`.mmode[data-mode="${a.mode}"]`)?.click(); $('m-input').value = a.message; $('m-form').requestSubmit(); return '';
    case 'accept_bounty': { const o = strata.view?.offers?.[0]; if (!o) { await strata.refresh(); } const off = strata.view?.offers?.[0]; if (!off) return 'No bounty offers right now.'; await profileOp({ operation: 'accept_bounty', bounty_id: off.id }); return `Bounty accepted: ${off.title}.`; }
    case 'claim_bounty': await profileOp({ operation: 'claim_bounty' }); return 'Bounty claimed!';
    case 'abandon_bounty': await profileOp({ operation: 'abandon_bounty' }); return 'Bounty dropped.';
    case 'travel': case 'talk': case 'customise': case 'invent': return expedition.run(a);
    case 'sign_out': $('logout').click(); return 'Signed out.';
    case 'reset_settings': for (const k of ['quality', 'tips', 'labels', 'camspeed', 'joystick', 'sound', 'wake', 'speak']) for (const pre of ['strata90:', 'ogce83:']) { try { localStorage.removeItem(pre + k); } catch { /* */ } } optQ.value = 'auto'; optQ.dispatchEvent(new Event('change')); return 'Settings reset.';
    default: return '';
  }
}
voice = initVoice({ api, store, isGuest, playerId, friendly: friendlyError, execute, announce, inConversation: () => expedition.inConversation(), converse: (t) => expedition.converse(t), endConversation: () => expedition.endConversation() });
expedition.attachVoice(voice);
if (renderer) strata.refresh();

// ---------- v9.0 extras: accessibility, photo mode, sky & spirits, soundtrack, opening + tutorial, Together, PWA, director ----------
access = initAccess({ $, store, renderer, audio, toast });
photo = initPhoto({ $, renderer, toast, onOpen: () => { $('panel').classList.add('closed'); }, onClose: () => {} });
music = createMusic(audio); music.start();
// Background-robust media (tab switched, minimised, other window, inactive): resume audio on any return or gesture,
// MediaSession so the browser treats the tab as playing media, voice-chat playback restarted if the browser paused it.
const media = initMediaKeepalive({ audio, music, onToggle: (v) => { if (audio.on !== v) $('soundbtn')?.click(); } });
$('soundbtn')?.addEventListener('click', () => setTimeout(media.sync, 0));
const firstGesture = () => { if (!audio.on && store.get('sound', false)) { audio.set(true); media.sync(); } };
window.addEventListener('pointerdown', firstGesture, { once: true, capture: true }); window.addEventListener('keydown', firstGesture, { once: true, capture: true });
const backToLife = () => { media.kick(); mp?.resumeVoice?.(); if (document.visibilityState === 'visible' && session && !(ws && ws.readyState <= 1)) { wsRetry = 0; connectLive(); } };
document.addEventListener('visibilitychange', backToLife); window.addEventListener('focus', backToLife); window.addEventListener('pageshow', backToLife); window.addEventListener('online', backToLife);
// WebSocket keepalive from the background-safe ticker (answered by the Durable Object's auto-response without waking it).
bgInterval(() => { try { if (ws && ws.readyState === 1) ws.send('{"type":"ping"}'); } catch { /* reconnect handles it */ } }, 25000);
setInterval(() => { // the soundtrack follows the world: time of day, combat and the in-game sky
  if (!state) return; const sky = skyState(state.tick ?? 0, state.weather);
  music.set({ day: Math.max(0, Math.min(1, sky.day ?? 1)), combat: !!duel?.active });
  mp?.syncLook?.(); // room-mates see my customised avatar
}, 2000);
mysticui = initMysticUI({ $, api, toast, world: WORLD, playerId, session: () => session, renderer, audio,
  onSky: (v) => { const s = v?.sky; if (s) music.set({ element: s.element, fullMoon: s.moon?.phase === 4, alignments: (s.active || []).length }); }, markDone });
tutorial = initTutorial({ $, done, toast, caption, onComplete: () => audio?.play('achieve') });
tutorial.update();
mp = initMultiplayer({ $, api, toast, session: () => session, playerId, roomCode: ROOM, caption,
  getLook: () => renderer?.myLook || null, onLooks: (l) => { if (renderer) renderer.remoteLooks = l; },
  startTrial: (path, label) => duel.start('trial', { trial: { path, label } }),
  onVoiceAudio: (id, stream) => { const a = new Audio(); a.srcObject = stream; a.autoplay = true; a.play().catch(() => {}); return a; } });
// Prime my avatar look (palette indices) so room-mates see it from the first hello, not only after opening the Expedition.
(async () => {
  if (!renderer || !ROOM) return;
  try {
    const meta = await api('GET', '/api/v90/omni/realms'), ap = meta?.appearance;
    if (ap) renderer.lookPalette = ap;
    const me = await api('GET', `/api/v90/omni/me/${WORLD}?player=${encodeURIComponent(playerId())}`);
    const a = me?.explorer?.appearance;
    if (ap && a && !renderer.myLook) { renderer.myLook = { skin: a.skin, hair: a.hair, outfit: a.outfit, hat: a.hat, cape: a.cape }; renderer.appearance = { skin: ap.skin[a.skin], hair: ap.hair[a.hair], outfit: ap.outfit[a.outfit], hat: a.hat, cape: a.cape }; mp?.syncLook?.(); }
  } catch { /* optional cosmetic */ }
})();
director = initDirector({ api, world: WORLD, playerId, session: () => session, caption, toast, store,
  onAdjust: (d) => { if (d?.hint_level >= 2 && !tipsOn) { tipsOn = true; updateHint(); } } }); // a stuck explorer gets the hint card back (not saved)
initInstall({ $, toast });
$('skybtn').onclick = () => mysticui.open();
$('togetherbtn').onclick = () => mp.open();
$('lbbtn').onclick = () => mp.openLb();
$('photobtn').onclick = () => { closeOverlays(); photo.open(); };
for (const id of ['skypanel', 'together', 'leaderboard']) $(id).addEventListener('click', (e) => { if (e.target.id === id) $(id).classList.add('hidden'); });
document.querySelectorAll('[data-close]').forEach((b) => { if (['skypanel', 'together', 'leaderboard'].includes(b.dataset.close)) b.addEventListener('click', () => $(b.dataset.close).classList.add('hidden')); });
if (ROOM) { $('world').textContent = `Shared world ${ROOM}`; document.title = `Strata: Lux Genesis · room ${ROOM}`; if (!session) setTimeout(() => toast('Shared worlds need a free account: sign in to join this room.'), 1500); else setTimeout(() => mp.open('party'), 1200); }
{ const os = $('opt-scale'); if (os) { os.value = String(store.get('renderscale', 1)); os.onchange = () => { store.set('renderscale', +os.value); renderer?.setRenderScale(+os.value); }; } }
{ const od = $('opt-director'); if (od) { od.checked = director.enabled; od.onchange = () => director.setEnabled(od.checked); } }
{ const om = $('opt-music'); if (om) { om.checked = store.get('music', true); music.enable(om.checked); om.onchange = () => { store.set('music', om.checked); music.enable(om.checked); }; } }
function runOpening() {
  playOpening({ $, reduced: () => access.reduced(), caption, speak: null, onDone: () => { store.set('opening_seen', true); tutorial.update(); } });
}
$('opt-opening')?.addEventListener('click', () => { closeOverlays(); runOpening(); });
$('playbtn')?.addEventListener('click', () => { if (!store.get('opening_seen', false) && !ROOM) setTimeout(runOpening, 150); });
