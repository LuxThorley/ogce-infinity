// Strata: Lux Genesis v9.0 camera rig: fully adjustable third-person orbit + first-person POV with a smooth blend.
// Pure maths (no DOM / GL) so it is unit-tested in Node. renderer3d.js asks it for eye/look/fov each frame.
//  - zoom from close over-the-shoulder (1.6 m) to far overview (60 m); pitch from near ground level to straight top-down
//  - 360° orbit, smooth damping (user "smoothing"), collision pull-in against terrain and props, shoulder side L/centre/R
//  - mouse drag/right-drag, wheel, pinch, gamepad right stick, keyboard rotate/tilt/zoom, voice ops, one-tap recenter
//  - sensitivity, invert X/Y, smoothing, shoulder, FOV, head bob; built-in + 3 saved presets
export const LIMITS = { dist: [1.6, 60], pitch: [-0.1, 1.5533], fpPitch: [-1.25, 1.25], fov: [40, 90], fpFov: [55, 100], sens: [0.2, 3], smoothing: [0, 1] };
export const DEFAULTS = { sens: 1, invertX: false, invertY: false, smoothing: 0.5, shoulder: 'right', shoulderOffset: 0.55, height: 0.9, fov: 50, fpFov: 74, headBob: true, autoRecenter: false };
export const PRESETS = {
  shoulder: { name: 'Over the shoulder', pitch: 0.1, dist: 2.4 },
  classic: { name: 'Classic', pitch: 0.55, dist: 10 },
  action: { name: 'Action', pitch: 0.28, dist: 5.5 },
  overview: { name: 'Overview', pitch: 0.95, dist: 34 },
  topdown: { name: 'Top-down', pitch: 1.5533, dist: 46 },
  ground: { name: 'Ground level', pitch: -0.06, dist: 4.5 },
};
export const DEFAULT_KEYS = { rotateLeft: ['z', ','], rotateRight: ['x', '.'], tiltUp: ['y', 'pageup'], tiltDown: ['g', 'pagedown'],
  zoomIn: ['=', '+'], zoomOut: ['-', '_'], recenter: ['l'], toggleView: ['n'], preset1: ['7'], preset2: ['8'], preset3: ['9'] };
const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
const angDamp = (a, b, k, dt) => a + wrap(b - a) * (1 - Math.exp(-k * dt));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export function sanitizeSettings(s) {
  const o = { ...DEFAULTS };
  if (!s || typeof s !== 'object') return o;
  if (Number.isFinite(+s.sens)) o.sens = clamp(+s.sens, ...LIMITS.sens);
  if (Number.isFinite(+s.smoothing)) o.smoothing = clamp(+s.smoothing, ...LIMITS.smoothing);
  if (Number.isFinite(+s.fov)) o.fov = clamp(+s.fov, ...LIMITS.fov);
  if (Number.isFinite(+s.fpFov)) o.fpFov = clamp(+s.fpFov, ...LIMITS.fpFov);
  if (Number.isFinite(+s.height)) o.height = clamp(+s.height, 0.2, 2.5);
  if (Number.isFinite(+s.shoulderOffset)) o.shoulderOffset = clamp(+s.shoulderOffset, 0, 1.5);
  for (const k of ['invertX', 'invertY', 'headBob', 'autoRecenter']) if (typeof s[k] === 'boolean') o[k] = s[k];
  if (['left', 'centre', 'right'].includes(s.shoulder)) o.shoulder = s.shoulder;
  return o;
}
export function sanitizeKeys(k) {
  const o = {}; for (const [a, v] of Object.entries(DEFAULT_KEYS)) o[a] = [...v];
  if (k && typeof k === 'object') for (const a of Object.keys(DEFAULT_KEYS)) if (Array.isArray(k[a]) && k[a].length && k[a].every((x) => typeof x === 'string' && x.length >= 1 && x.length <= 12)) o[a] = k[a].slice(0, 3).map((x) => x.toLowerCase());
  return o;
}
export function keyAction(keys, key) { const k = String(key).toLowerCase(); for (const [a, list] of Object.entries(keys)) if (list.includes(k)) return a; return null; }

export class CameraRig {
  constructor(settings = {}, init = {}) {
    this.s = sanitizeSettings(settings);
    this.yaw = this.tYaw = init.yaw ?? Math.PI + 0.62;
    this.pitch = this.tPitch = init.pitch ?? 0.55;
    this.dist = this.tDist = init.dist ?? 10;
    this.fpPitch = this.tFpPitch = 0;
    this.mode = 'third'; this.blend = 0; this.side = this.sideTarget();
    this.colDist = this.dist; this.pivot = null; this.bobT = 0; this.shake = 0; this.kick = 0;
    this.user = [null, null, null];
  }
  configure(s) { this.s = sanitizeSettings({ ...this.s, ...s }); }
  sideTarget() { return this.s.shoulder === 'left' ? -1 : this.s.shoulder === 'centre' ? 0 : 1; }
  get first() { return this.mode === 'first'; }
  // ---- inputs (all go to targets; update() damps towards them) ----
  orbit(dx, dy) { // pixels of drag
    const sx = (this.s.invertX ? -1 : 1) * this.s.sens, sy = (this.s.invertY ? -1 : 1) * this.s.sens;
    this.tYaw = wrap(this.tYaw - dx * 0.008 * sx);
    if (this.first) this.tFpPitch = clamp(this.tFpPitch - dy * 0.006 * sy, ...LIMITS.fpPitch);
    else this.tPitch = clamp(this.tPitch + dy * 0.006 * sy, ...LIMITS.pitch);
  }
  stick(x, y, dt, dead = 0.18) { // gamepad right stick, -1..1
    const m = Math.hypot(x, y); if (m < dead) return false;
    const k = (m - dead) / (1 - dead) / m;
    this.orbit(x * k * 380 * dt / 0.6, y * k * 260 * dt / 0.6);
    return true;
  }
  rotate(dir, amount = 0.26) { this.tYaw = wrap(this.tYaw - dir * amount * (this.s.invertX ? -1 : 1)); }
  tilt(dir, amount = 0.14) { if (this.first) this.tFpPitch = clamp(this.tFpPitch + dir * amount, ...LIMITS.fpPitch); else this.tPitch = clamp(this.tPitch + dir * amount, ...LIMITS.pitch); }
  zoom(f) { // f < 1 zooms in; zooming fully in from 3rd person does NOT force 1st person (the toggle does)
    if (this.first) { if (f > 1.02) this.setMode('third'); return; }
    this.tDist = clamp(this.tDist * f, ...LIMITS.dist);
  }
  pinch(scale) { this.zoom(1 / scale); }
  wheel(deltaY) { this.zoom(Math.exp(deltaY * 0.0012 * this.s.sens)); }
  recenter(face) { this.tYaw = wrap(face + Math.PI); if (this.first) this.tFpPitch = 0; }
  setMode(m) { this.mode = m === 'first' ? 'first' : 'third'; if (this.first) { this.tFpPitch = 0; } }
  toggleMode() { this.setMode(this.first ? 'third' : 'first'); return this.mode; }
  reset() { this.setMode('third'); this.tYaw = Math.PI + 0.62; this.tPitch = 0.55; this.tDist = 10; this.s.shoulder = this.s.shoulder || 'right'; }
  applyPreset(p) {
    const q = typeof p === 'string' ? PRESETS[p] : p; if (!q) return false;
    this.setMode(q.mode === 'first' ? 'first' : 'third');
    if (Number.isFinite(q.pitch)) this.tPitch = clamp(q.pitch, ...LIMITS.pitch);
    if (Number.isFinite(q.dist)) this.tDist = clamp(q.dist, ...LIMITS.dist);
    if (Number.isFinite(q.yaw)) this.tYaw = wrap(q.yaw);
    if (['left', 'centre', 'right'].includes(q.shoulder)) this.s.shoulder = q.shoulder;
    return true;
  }
  snapshot(name = 'My view') { return { name: String(name).slice(0, 24), pitch: +this.tPitch.toFixed(3), dist: +this.tDist.toFixed(2), yaw: +wrap(this.tYaw).toFixed(3), shoulder: this.s.shoulder, mode: this.mode }; }
  // voice / command ops
  op(o, face = 0) {
    switch (o) {
      case 'zoom_in': this.zoom(0.7); break;
      case 'zoom_out': this.zoom(1.45); break;
      case 'left': this.rotate(1, 0.6); break;
      case 'right': this.rotate(-1, 0.6); break;
      case 'up': case 'from_above': if (o === 'up') this.tilt(1, 0.3); else this.applyPreset('topdown'); break;
      case 'down': this.tilt(-1, 0.3); break;
      case 'ground': this.applyPreset('ground'); break;
      case 'overview': this.applyPreset('overview'); break;
      case 'shoulder': this.applyPreset('shoulder'); break;
      case 'recenter': this.recenter(face); break;
      case 'first': this.setMode('first'); break;
      case 'third': this.setMode('third'); break;
      case 'toggle': this.toggleMode(); break;
      case 'swap_shoulder': this.s.shoulder = this.s.shoulder === 'right' ? 'left' : 'right'; break;
      case 'reset': this.reset(); break;
      default: return false;
    }
    return true;
  }
  // ---- per-frame solve ----
  // ctx: { feet:[x,y,z], face, moving(0..1), ground(x,z)->y, obstacles:[{x,z,r,h}] , water }
  update(dt, ctx) {
    dt = clamp(dt, 0, 0.1);
    const k = lerp(22, 3.2, this.s.smoothing);
    this.yaw = angDamp(this.yaw, this.tYaw, k, dt);
    this.pitch = damp(this.pitch, this.tPitch, k, dt);
    this.dist = damp(this.dist, this.tDist, k * 0.8, dt);
    this.fpPitch = damp(this.fpPitch, this.tFpPitch, k * 1.4, dt);
    this.side = damp(this.side, this.sideTarget(), 6, dt);
    this.blend = clamp(this.blend + (this.first ? 1 : -1) * dt / 0.45, 0, 1);
    this.shake = Math.max(0, this.shake - dt * 2.5); this.kick = Math.max(0, this.kick - dt * 3);
    const [fx, fy, fz] = ctx.feet, g = ctx.ground || (() => -1e9);
    // third person: pivot above the player with a shoulder offset that fades out as you zoom away
    const near = clamp(1 - (this.dist - 2) / 14, 0, 1);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw); // camera-right on the ground plane
    const sh = this.s.shoulderOffset * this.side * near;
    const piv = [fx + rx * sh, fy + this.s.height + 0.25 * near, fz + rz * sh];
    const dir = [Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)];
    const want = this.dist, hit = this.collide(piv, dir, want, g, ctx.obstacles || [], ctx.water);
    // pull in instantly when blocked, ease back out when clear (no popping through walls)
    this.colDist = hit < this.colDist ? hit : damp(this.colDist, hit, 4, dt);
    const d = Math.min(this.colDist, want);
    const tpEye = [piv[0] + dir[0] * d, piv[1] + dir[1] * d, piv[2] + dir[2] * d];
    const lookAhead = 0.6 * near;
    const tpLook = [piv[0] - Math.sin(this.yaw) * lookAhead, piv[1] - 0.15 * near, piv[2] - Math.cos(this.yaw) * lookAhead];
    // first person: eyes at head height, look along -yaw (same "forward" as third-person controls)
    const moving = clamp(ctx.moving || 0, 0, 1);
    this.bobT += dt * (6 + 4 * moving) * moving;
    const bob = this.s.headBob ? Math.sin(this.bobT * 2) * 0.035 * moving : 0;
    const fpEye = [fx, fy + 1.55 + bob, fz];
    const fdir = [-Math.sin(this.yaw) * Math.cos(this.fpPitch), Math.sin(this.fpPitch), -Math.cos(this.yaw) * Math.cos(this.fpPitch)];
    const fpLook = [fpEye[0] + fdir[0] * 10, fpEye[1] + fdir[1] * 10, fpEye[2] + fdir[2] * 10];
    const b = smooth(this.blend);
    const eye = tpEye.map((v, i) => lerp(v, fpEye[i], b)), look = tpLook.map((v, i) => lerp(v, fpLook[i], b));
    if (this.shake > 0) { const a = this.shake * this.shake * 0.25 * (1 + b); const t = this.bobT * 37 + this.shake * 91; eye[0] += Math.sin(t) * a; eye[1] += Math.sin(t * 1.3 + 1) * a; look[0] += Math.sin(t * 0.7 + 2) * a * 0.5; }
    const fov = lerp(this.s.fov, this.s.fpFov, b) + this.kick * 8;
    return { eye, look, fov: fov * Math.PI / 180, blend: b, first: b > 0.6, bob, dist: d, collided: hit < want - 0.05 };
  }
  collide(piv, dir, want, ground, obstacles, water) {
    const steps = 24; let best = want;
    for (let i = 1; i <= steps; i++) {
      const t = (want * i) / steps, x = piv[0] + dir[0] * t, y = piv[1] + dir[1] * t, z = piv[2] + dir[2] * t;
      const floor = Math.max(ground(x, z), water ?? -1e9) + 0.35;
      let blocked = y < floor;
      if (!blocked) for (const o of obstacles) { if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + 0.3) ** 2 && y < o.y + o.h) { blocked = true; break; } }
      if (blocked) { best = Math.max(LIMITS.dist[0] * 0.6, ((want * (i - 1)) / steps) * 0.92); break; }
    }
    return best;
  }
  addShake(a) { this.shake = Math.min(1.2, this.shake + a); }
  addKick(a) { this.kick = Math.min(1, this.kick + a); }
}
