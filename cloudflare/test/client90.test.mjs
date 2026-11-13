// v9.0 client systems: soundtrack plan, accessibility bindings (no key clashes), photo mode, opening/tutorial,
// Together helpers, offline solo play (same rules as the server), PWA shell coverage, director signals, HD shaders.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { musicPlan } from '../../web/js/music.js';
import * as A from '../../web/js/access.js';
import { clampOffset } from '../../web/js/photo.js';
import { TUTORIAL, tutorialState, OPENING_LINES, OPENING_SECONDS } from '../../web/js/opening.js';
import { roomFromUrl, PRIVACY_LABEL, REPORT_REASONS } from '../../web/js/multiplayer.js';
import { PRIVACY_DEFAULTS } from '../../web/js/mpdata.js';
import { memoryDb as offlineDb, createOfflineGame, createQueue, OFFLINE_WORLD } from '../../web/js/offline.js';
import { GameRuntime } from '../src/runtime.js';
import { memoryDb } from './helpers.mjs';
import { createSignals } from '../../web/js/directorclient.js';
import { DEFAULT_KEYS } from '../../web/js/camera.js';
import * as SH from '../../web/js/shaders90.js';

const root = new URL('../../', import.meta.url);
test('soundtrack plan adapts to stratum, time of day, combat and the in-game sky', () => {
  const calm = musicPlan({ stratum: 0, day: 1 }), night = musicPlan({ stratum: 0, day: 0.1 }), fight = musicPlan({ stratum: 6, day: 1, combat: true });
  assert.equal(calm.mode, 'pentatonic'); assert.ok(!calm.layers.includes('drums'));
  assert.ok(night.root < calm.root && night.reverb > calm.reverb && !night.layers.includes('bass'));
  assert.equal(fight.mode, 'phrygian'); assert.ok(fight.layers.includes('drums') && fight.tempo > 110);
  assert.equal(musicPlan({ element: 'fire' }).timbre, 'sawtooth'); assert.equal(musicPlan({ element: 'water' }).timbre, 'sine');
  assert.ok(musicPlan({ fullMoon: true }).layers.includes('shimmer')); assert.ok(musicPlan({ alignments: 2 }).layers.includes('harmony'));
  assert.notEqual(musicPlan({ stratum: 3 }).mode, musicPlan({ stratum: 4 }).mode);
});
test('accessibility: remaps and one-handed layouts never clash with camera or panel keys', () => {
  const camera = new Set(Object.values(DEFAULT_KEYS).flat()), panels = new Set(['j', 'k', 'm', 'o', 'v', 'c', 'n', 'l', '/', 'enter']);
  for (const oh of Object.keys(A.ONE_HANDED)) {
    const b = A.bindings(A.sanitize({ onehand: oh }));
    const keys = Object.values(b).filter(Boolean);
    assert.equal(new Set(keys).size, keys.length, `${oh}: duplicate keys`);
    for (const [act, k] of Object.entries(b)) { assert.ok(k, `${oh}: ${act} unbound`); assert.ok(!camera.has(k), `${oh}: ${act}=${k} clashes with a camera key`); assert.ok(!panels.has(k), `${oh}: ${act}=${k} clashes with a panel key`); }
  }
  const s = A.sanitize({ keys: { gather: 'H', attack: 'x'.repeat(20) }, scale: 999, cb: 'nope', onehand: 'left' });
  assert.equal(s.scale, 160); assert.equal(s.cb, 'none'); assert.equal(s.keys.gather, 'h'); assert.ok(!('attack' in s.keys));
  const b = A.bindings(s);
  assert.equal(A.translate(b, 'h'), 'e'); // personal remap wins
  assert.equal(A.translate(b, '1'), 'p'); // one-handed (left) potion
  assert.equal(A.translate(A.bindings(A.sanitize({ onehand: 'right' })), 'arrowup'), 'w');
  assert.equal(A.translate(A.bindings(A.sanitize({ keys: { gather: 'h' } })), 'e'), '__unbound__');
  assert.ok(Object.keys(A.CB_MODES).length >= 4 && A.SFX_CAPTION.gather);
});
test('photo mode keeps the free camera near the explorer', () => {
  assert.deepEqual(clampOffset({ dx: 99, dy: -9, dz: -99 }), { dx: 14, dy: -1, dz: -14 });
  assert.deepEqual(clampOffset({ dx: 'x', dy: 3, dz: 2 }), { dx: 0, dy: 3, dz: 2 });
});
test('opening and First Light tutorial', () => {
  assert.ok(OPENING_LINES.length >= 4 && OPENING_LINES.every(([t], i) => i === 0 || t > OPENING_LINES[i - 1][0]) && OPENING_LINES.at(-1)[0] < OPENING_SECONDS);
  assert.equal(tutorialState(new Set()).step.id, 'moved');
  assert.equal(tutorialState(new Set(['moved', 'gathered'])).step.id, 'duel');
  assert.ok(tutorialState(new Set(TUTORIAL.map((s) => s.id))).complete);
  assert.ok(TUTORIAL.find((s) => s.id === 'sky').how.includes('key 5'));
});
test('Together helpers: room codes from links, privacy labels, report reasons', () => {
  assert.equal(roomFromUrl('?room=k7q2zp'), 'K7Q2ZP'); assert.equal(roomFromUrl('?room=bad!'), null); assert.equal(roomFromUrl(''), null);
  for (const k of Object.keys(PRIVACY_DEFAULTS)) assert.ok(PRIVACY_LABEL[k], k);
  assert.ok(REPORT_REASONS.some(([k]) => k === 'worried'));
});
test('offline solo play runs the SAME rules as the server runtime', () => {
  const v = readFileSync(new URL('web/js/vendor/runtime.js', root), 'utf8'), s = readFileSync(new URL('cloudflare/src/runtime.js', root), 'utf8');
  assert.equal(v.slice(v.indexOf('\n') + 1), s, 'vendored runtime.js is stale: run node cloudflare/tools/vendor_runtime.mjs');
  const pv = readFileSync(new URL('web/js/vendor/pyjson.js', root), 'utf8'), ps = readFileSync(new URL('cloudflare/src/pyjson.js', root), 'utf8');
  assert.equal(pv.slice(pv.indexOf('\n') + 1), ps);
  const server = new GameRuntime(memoryDb()), mem = {}, store = { get: (k, d) => (k in mem ? JSON.parse(mem[k]) : d), set: (k, v2) => { mem[k] = JSON.stringify(v2); } };
  const off = createOfflineGame(store); server.load(OFFLINE_WORLD); off.load();
  const script = [{ type: 'move', dx: 1, dy: 0 }, { type: 'move', dx: 1, dy: 0 }, { type: 'move', dx: 0, dy: 1 }, { type: 'gather', target: 'crystal-01' }, { type: 'advance' }, { type: 'rest' }, { type: 'quest', operation: 'accept', quest_id: 'frontier_hunt' }];
  let a, b; for (const act of script) { try { a = server.act(OFFLINE_WORLD, 'p1', act); } catch (e) { a = { error: e.message }; } try { b = off.act('p1', act); } catch (e) { b = { error: e.message }; } assert.deepEqual(b.state ?? b, a.state ?? a); }
  const again = createOfflineGame(store).load(); assert.equal(again.revision, b.revision); // persisted on this device
  const db = offlineDb(); assert.throws(() => db.run('DROP TABLE worlds'));
});
test('offline queue replays in order, keeps going past rejects, stops on network loss', async () => {
  const mem = {}, store = { get: (k, d) => (k in mem ? JSON.parse(mem[k]) : d), set: (k, v) => { mem[k] = JSON.stringify(v); } };
  const q = createQueue(store); for (let i = 0; i < 4; i++) q.push({ action: { type: 'gather', n: i } });
  const seen = []; let r = await q.flush(async (it) => { seen.push(it.action.n); if (it.action.n === 1) throw new Error('bad'); if (it.action.n === 2) { const e = new Error('net'); e.network = true; throw e; } });
  assert.deepEqual(seen, [0, 1, 2]); assert.deepEqual(r, { sent: 1, rejected: 1, left: 2 });
  r = await q.flush(async () => {}); assert.deepEqual(r, { sent: 2, rejected: 0, left: 0 });
  for (let i = 0; i < 60; i++) q.push({ action: { i } }); assert.equal(q.size, 40);
});
test('PWA shell pre-caches every module and the icons; manifest is installable', () => {
  const sw = readFileSync(new URL('web/sw.js', root), 'utf8');
  const walk = (d) => readdirSync(new URL(d, root), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}${e.name}/`) : [`${d}${e.name}`]));
  for (const f of walk('web/js/')) assert.ok(sw.includes(`"/${f.slice(4)}"`), `sw.js SHELL is missing /${f.slice(4)}`);
  assert.ok(!/\/api\/.*caches\.put/.test(sw));
  const m = JSON.parse(readFileSync(new URL('web/manifest.webmanifest', root), 'utf8'));
  assert.equal(m.display, 'standalone'); assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.type === 'image/png'));
});
test('director signals are coarse and local', () => {
  let t = 0; const s = createSignals(() => t);
  s.action(); t += 30000; s.action(); s.duel(true); s.duel(false); s.hint(); s.discovery(2); s.lux(50); t += 90000;
  const snap = s.snapshot();
  assert.deepEqual(Object.keys(snap).sort(), ['apm', 'discoveries_10m', 'duels', 'faints', 'hints', 'idle_s', 'lux_10m', 'session_min']);
  assert.equal(snap.idle_s, 90); assert.deepEqual(snap.duels, ['win', 'loss']); assert.equal(snap.discoveries_10m, 2); assert.equal(snap.lux_10m, 50);
});
test('HD renderer shaders carry the photoreal features', () => {
  assert.match(SH.LIT_FS, /uDetail/); assert.match(SH.LIT_FS, /triplanar/); assert.match(SH.LIT_FS, /ground fog/);
  assert.match(SH.COMPOSITE_FS, /depth of field/); assert.match(SH.COMPOSITE_FS, /light shafts/); assert.match(SH.COMPOSITE_FS, /ACES|aces/i);
  assert.match(SH.WATER_FS, /refraction/); assert.match(SH.WATER_FS, /fres/);
  assert.match(SH.GRASS_VS, /aInst/); assert.match(SH.GRASS_FS, /uCard/);
  const r = readFileSync(new URL('web/js/renderer3d.js', root), 'utf8');
  assert.match(r, /ANGLE_instanced_arrays/); assert.match(r, /name: 'Ultra', dpr: 3\.0/); assert.match(r, /renderScale/);
});
test('remapping refuses every camera and menu key', () => {
  for (const k of Object.values(DEFAULT_KEYS).flat()) assert.ok(A.RESERVED.includes(k), `camera key ${k} must be reserved`);
  for (const k of Object.values(A.GAME_ACTIONS)) assert.ok(!A.RESERVED.includes(k), `default game key ${k} must not be reserved`);
});
