// v9.0 camera rig: zoom/pitch ranges, 360° orbit, smoothing, collision, every input path (mouse, wheel, pinch,
// gamepad, keyboard, voice), recenter, first/third-person blend, settings (sensitivity, invert, smoothing, shoulder) and presets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraRig, LIMITS, PRESETS, DEFAULT_KEYS, sanitizeSettings, sanitizeKeys, keyAction, wrap } from '../../web/js/camera.js';
import { parseCommand, validateActions } from '../../web/js/voicegrammar.js';

const flat = () => 0;
const settle = (r, ctx = {}, n = 240) => { let v; for (let i = 0; i < n; i++) v = r.update(1 / 60, { feet: [0, 0, 0], face: 0, ground: flat, ...ctx }); return v; };
const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('zoom spans close over-the-shoulder to far overview; pitch spans ground level to top-down', () => {
  const r = new CameraRig();
  for (let i = 0; i < 40; i++) r.zoom(0.7);
  assert.equal(r.tDist, LIMITS.dist[0]); assert.ok(LIMITS.dist[0] <= 2);
  for (let i = 0; i < 60; i++) r.zoom(1.4);
  assert.equal(r.tDist, LIMITS.dist[1]); assert.ok(LIMITS.dist[1] >= 50);
  for (let i = 0; i < 60; i++) r.tilt(1);
  assert.ok(Math.abs(r.tPitch - Math.PI / 2) < 0.02, 'top-down');
  const top = settle(r); assert.ok(top.eye[1] > 40 && Math.hypot(top.eye[0], top.eye[2]) < 1.5);
  for (let i = 0; i < 60; i++) r.tilt(-1);
  assert.ok(r.tPitch < 0, 'can go to ground level / slightly below the pivot');
});

test('360° orbit wraps smoothly with damping (no jump at ±π)', () => {
  const r = new CameraRig({ smoothing: 0.5 }, { yaw: 3.1 });
  r.rotate(-1, 0.2); // crosses +π
  assert.ok(Math.abs(r.tYaw) <= Math.PI);
  const steps = []; for (let i = 0; i < 30; i++) { r.update(1 / 60, { feet: [0, 0, 0], ground: flat }); steps.push(r.yaw); }
  for (let i = 1; i < steps.length; i++) assert.ok(Math.abs(wrap(steps[i] - steps[i - 1])) < 0.1, 'smooth');
  let total = 0; const r2 = new CameraRig(); for (let i = 0; i < 24; i++) { const b = r2.tYaw; r2.rotate(1); total += wrap(r2.tYaw - b); }
  assert.ok(Math.abs(Math.abs(total) - 24 * 0.26) < 1e-9, 'full turns accumulate');
});

test('smoothing setting controls responsiveness', () => {
  const fast = new CameraRig({ smoothing: 0 }), slow = new CameraRig({ smoothing: 1 });
  for (const r of [fast, slow]) { r.zoom(3); r.update(1 / 30, { feet: [0, 0, 0], ground: flat }); }
  assert.ok(Math.abs(fast.dist - fast.tDist) < Math.abs(slow.dist - slow.tDist));
});

test('collision: the camera pulls in in front of hills and trees, then eases back out', () => {
  const r = new CameraRig({}, { yaw: 0, pitch: 0.2, dist: 12 });
  const free = settle(r);
  const wall = (x, z) => (z > 4 ? 30 : 0);
  const blocked = settle(new CameraRig({}, { yaw: 0, pitch: 0.2, dist: 12 }), { ground: wall });
  assert.ok(blocked.collided && blocked.dist < 5 && free.dist > 11);
  const tree = settle(new CameraRig({}, { yaw: 0, pitch: 0.15, dist: 12 }), { obstacles: [{ x: 0, z: 6, y: 0, r: 0.8, h: 8 }] });
  assert.ok(tree.collided && tree.dist < 6.5);
  // ease out (no pop)
  const rr = new CameraRig({}, { yaw: 0, pitch: 0.2, dist: 12 }); settle(rr, { ground: wall });
  const v1 = rr.update(1 / 60, { feet: [0, 0, 0], ground: flat }); assert.ok(v1.dist < 6, 'does not snap back in one frame');
});

test('inputs: mouse drag + invert X/Y + sensitivity, wheel, pinch, gamepad stick with dead zone', () => {
  const a = new CameraRig(), b = new CameraRig({ invertX: true, invertY: true }), c = new CameraRig({ sens: 2 });
  for (const r of [a, b, c]) r.orbit(50, 30);
  assert.ok(Math.sign(wrap(a.tYaw - Math.PI - 0.62)) === -Math.sign(wrap(b.tYaw - Math.PI - 0.62)));
  assert.ok(Math.sign(a.tPitch - 0.55) === -Math.sign(b.tPitch - 0.55));
  assert.ok(Math.abs(wrap(c.tYaw - Math.PI - 0.62)) > Math.abs(wrap(a.tYaw - Math.PI - 0.62)) * 1.9);
  const w = new CameraRig(); const d0 = w.tDist; w.wheel(300); assert.ok(w.tDist > d0); w.wheel(-600); assert.ok(w.tDist < d0);
  const p = new CameraRig(); const p0 = p.tDist; p.pinch(1.5); assert.ok(p.tDist < p0);
  const g = new CameraRig(); assert.equal(g.stick(0.1, 0.05, 1 / 60), false, 'dead zone'); assert.equal(g.stick(1, 0, 1 / 60), true); assert.notEqual(g.tYaw, Math.PI + 0.62);
});

test('keyboard bindings are rebindable and avoid the gameplay keys (Q E R F V)', () => {
  const keys = sanitizeKeys({});
  for (const k of ['q', 'e', 'r', 'f', 'v', 'w', 'a', 's', 'd']) assert.equal(keyAction(keys, k), null, k);
  assert.equal(keyAction(keys, 'z'), 'rotateLeft'); assert.equal(keyAction(keys, 'X'), 'rotateRight'); assert.equal(keyAction(keys, 'pageup'), 'tiltUp');
  assert.equal(keyAction(keys, 'l'), 'recenter'); assert.equal(keyAction(keys, 'n'), 'toggleView');
  const custom = sanitizeKeys({ rotateLeft: ['Q'], bogus: ['k'], tiltUp: [5] });
  assert.deepEqual(custom.rotateLeft, ['q']); assert.deepEqual(custom.tiltUp, DEFAULT_KEYS.tiltUp); assert.equal(custom.bogus, undefined);
});

test('one-tap recenter puts the camera behind the player; first/third person blend smoothly', () => {
  const r = new CameraRig(); r.recenter(0.7); assert.ok(Math.abs(wrap(r.tYaw - (0.7 + Math.PI))) < 1e-9);
  const v = settle(r, { face: 0.7 });
  const fwd = [Math.sin(0.7), Math.cos(0.7)], back = [v.eye[0], v.eye[2]];
  assert.ok(fwd[0] * back[0] + fwd[1] * back[1] < 0, 'camera is behind the facing direction');
  r.op('first'); const mid = r.update(0.2, { feet: [0, 0, 0], ground: flat }); assert.ok(mid.blend > 0 && mid.blend < 1, 'animated transition');
  const fp = settle(r); assert.equal(fp.first, true); assert.ok(Math.abs(fp.eye[1] - 1.55) < 0.06); assert.ok(fp.fov > settle(new CameraRig()).fov);
  r.op('toggle'); assert.equal(r.mode, 'third');
});

test('voice: zoom out, look from above, reset camera, recenter, first/third person all validate and drive the rig', () => {
  const r = new CameraRig(); r.zoom(0.5);
  for (const [t, op] of [['zoom out', 'zoom_out'], ['look from above', 'from_above'], ['reset camera', 'reset'], ['recenter the camera', 'recenter'], ['first person', 'first'], ['third person', 'third'], ['ground level', 'ground'], ['over the shoulder', 'shoulder'], ['swap shoulder', 'swap_shoulder']]) {
    const a = parseCommand(t); assert.deepEqual(a, [{ type: 'camera', op }], t); assert.equal(validateActions(a).ok, true, t);
    assert.equal(r.op(op, 0), true, op);
  }
  r.op('from_above'); assert.equal(r.tPitch, PRESETS.topdown.pitch);
  assert.equal(validateActions([{ type: 'camera', op: 'spin_forever' }]).ok, false);
});

test('settings are clamped and presets save/restore views (built-ins + user snapshots)', () => {
  const s = sanitizeSettings({ sens: 99, smoothing: -2, shoulder: 'up', invertY: 'yes', fov: 10, headBob: false });
  assert.equal(s.sens, LIMITS.sens[1]); assert.equal(s.smoothing, 0); assert.equal(s.shoulder, 'right'); assert.equal(s.invertY, false); assert.equal(s.fov, LIMITS.fov[0]); assert.equal(s.headBob, false);
  const r = new CameraRig({ shoulder: 'left' });
  for (const k of Object.keys(PRESETS)) assert.equal(r.applyPreset(k), true);
  r.applyPreset('overview'); const snap = r.snapshot('Scout'); assert.equal(snap.dist, PRESETS.overview.dist);
  r.applyPreset('shoulder'); assert.notEqual(r.tDist, snap.dist);
  r.applyPreset(snap); assert.equal(r.tDist, snap.dist); assert.equal(r.s.shoulder, 'left');
  assert.equal(r.applyPreset('nope'), false);
  // shoulder side shifts the pivot left/right when close
  const L = settle(new CameraRig({ shoulder: 'left' }, { yaw: 0, pitch: 0.1, dist: 2.4 })), R = settle(new CameraRig({ shoulder: 'right' }, { yaw: 0, pitch: 0.1, dist: 2.4 }));
  assert.ok(Math.abs(L.eye[0] - R.eye[0]) > 0.6);
});
