// Strata: Lux Genesis (OGCE engine v9.0) HD renderer: WebGL1, static/stdlib-first, no libraries.
// Consolidates every earlier OGCE renderer: v7.0 2D map fallback (app.js), v7.7/v8.0/v8.2 vertex-colour terrain,
// depth fog and day/night, v8.3 shadow maps, cloud/star sky, Fresnel water, wind sway, animated actors and picking,
// and the v4.1–v5.2 Python renderer specs (tone mapping, gamma, PBR metal/roughness, AO probes, post-FX chain,
// distance LOD, ocean/storm weather). v9.0 HD: HDR target, ACES tone mapping + grading, bloom, SSAO, FXAA,
// 2-cascade Poisson-PCF soft shadows, GGX lighting, planar water reflections with shoreline foam and caustics,
// atmospheric scattering sky with aurora, meteors and Milky Way, seasons (autumn foliage, winter snow), GPU particles,
// finer terrain with baked AO, strata pillars and the Lux obelisk, devicePixelRatio-aware Low/Medium/High/Ultra tiers.
import { m4 } from './gl-math.js';
import { height, groundY, groundColor, slope, scatterProps, skyState, pathDistance, WATER_LEVEL } from './world3d.js';
import * as SH from './shaders90.js';
import { CameraRig } from './camera.js';

const STRIDE = 10; // pos3 normal3 color3 sway1
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const angDamp = (a, b, k, dt) => { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * (1 - Math.exp(-k * dt)); };
const hueRGB = (h, s = 0.55, l = 0.5) => { const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };
const nameHue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 997; return h / 997; };
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
// SSR strata palette, M0 (proto-pattern) at the bottom to M7+ (mathematics) at the top
export const STRATA_COLOURS = [[0.32, 0.27, 0.36], [0.30, 0.52, 0.30], [0.62, 0.42, 0.26], [0.48, 0.50, 0.58], [0.30, 0.55, 0.78], [0.55, 0.40, 0.75], [0.20, 0.22, 0.45], [0.95, 0.85, 0.55]];
/** Quality tiers. Phones start at Medium, desktops at High; Ultra is opt-in or earned by a fast GPU. */
export const TIERS = [
  { name: 'Low', dpr: 0.75, shadow: 0, cascades: 0, taps: 0, post: false, bloom: false, ssao: false, refl: 0, terrain: 1, particles: 120, detail: 0, grass: 0, grassFar: 0, refr: false, shafts: false, depthTex: false, fogH: 0.0 },
  { name: 'Medium', dpr: 1.0, shadow: 1024, cascades: 1, taps: 6, post: true, bloom: false, ssao: false, refl: 0, terrain: 1, particles: 320, detail: 256, grass: 2500, grassFar: 18, refr: false, shafts: false, depthTex: false, fogH: 0.004 },
  { name: 'High', dpr: 1.5, shadow: 2048, cascades: 2, taps: 10, post: true, bloom: true, ssao: false, refl: 0.5, terrain: 0.5, particles: 700, detail: 512, grass: 9000, grassFar: 26, refr: true, shafts: true, depthTex: true, fogH: 0.006 },
  { name: 'Ultra', dpr: 3.0, shadow: 4096, cascades: 2, taps: 16, post: true, bloom: true, ssao: true, refl: 0.75, terrain: 0.5, particles: 1400, detail: 1024, grass: 26000, grassFar: 38, refr: true, shafts: true, depthTex: true, fogH: 0.008 }, // Ultra: full native devicePixelRatio (4K/Retina, capped at 3×)
];
const MAXQ = TIERS.length - 1;

// ---------- geometry builder ----------
class Geo {
  constructor() { this.v = []; }
  tri(a, b, c, col, sw = [0, 0, 0]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const P = [a, b, c];
    for (let i = 0; i < 3; i++) this.v.push(P[i][0], P[i][1], P[i][2], nx, ny, nz, col[0], col[1], col[2], sw[i]);
  }
  triN(P, N, C, S = [0, 0, 0]) { for (let i = 0; i < 3; i++) this.v.push(P[i][0], P[i][1], P[i][2], N[i][0], N[i][1], N[i][2], C[i][0], C[i][1], C[i][2], S[i]); }
  quad(a, b, c, d, col, sw) { this.tri(a, b, c, col, sw && [sw[0], sw[1], sw[2]]); this.tri(a, c, d, col, sw && [sw[0], sw[2], sw[3]]); }
  // transformed primitives (m = 4×4 column-major)
  box(m, col, swayTop = 0, shade = true) {
    const P = [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, .5, -.5], [-.5, .5, -.5], [-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]].map((p) => m4.xform(m, ...p));
    const sw = (i) => (i === 2 || i === 3 || i === 6 || i === 7 ? swayTop : 0);
    const F = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [1, 2, 6, 5], [0, 4, 7, 3]];
    F.forEach((f, k) => { const c = shade ? col.map((x) => x * (1 - k * 0.015)) : col; this.quad(P[f[0]], P[f[1]], P[f[2]], P[f[3]], c, f.map(sw)); });
  }
  cone(m, col, seg = 7, swayTop = 0, base = true) {
    const top = m4.xform(m, 0, 1, 0);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2;
      const p = m4.xform(m, Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5), q = m4.xform(m, Math.cos(b) * 0.5, 0, Math.sin(b) * 0.5);
      this.tri(p, top, q, col, [swayTop * 0.3, swayTop, swayTop * 0.3]);
      if (base) this.tri(p, q, m4.xform(m, 0, 0, 0), col.map((x) => x * 0.7), [swayTop * 0.3, swayTop * 0.3, swayTop * 0.3]);
    }
  }
  cyl(m, col, seg = 6, swayTop = 0) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2;
      const p0 = m4.xform(m, Math.cos(a) * .5, 0, Math.sin(a) * .5), p1 = m4.xform(m, Math.cos(b) * .5, 0, Math.sin(b) * .5);
      const p2 = m4.xform(m, Math.cos(b) * .5, 1, Math.sin(b) * .5), p3 = m4.xform(m, Math.cos(a) * .5, 1, Math.sin(a) * .5);
      this.quad(p0, p3, p2, p1, col, [0, swayTop, swayTop, 0]);
      this.tri(p3, m4.xform(m, 0, 1, 0), p2, col, [swayTop, swayTop, swayTop]);
    }
  }
  ico(m, col, sub = 1, jitter = 0, rnd = Math.random, swayAll = 0) {
    const t = (1 + Math.sqrt(5)) / 2;
    let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((v) => { const l = Math.hypot(...v); return v.map((x) => x / l); });
    let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let s = 0; s < sub; s++) {
      const cache = new Map(), mid = (a, b) => { const k = a < b ? a + ',' + b : b + ',' + a; if (cache.has(k)) return cache.get(k); const p = V[a].map((x, i) => (x + V[b][i]) / 2), l = Math.hypot(...p); V.push(p.map((x) => x / l)); cache.set(k, V.length - 1); return V.length - 1; };
      F = F.flatMap(([a, b, c]) => { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]; });
    }
    if (jitter) V = V.map((v) => { const k = 1 + (rnd() - 0.5) * jitter; return v.map((x) => x * k); });
    const W = V.map((v) => m4.xform(m, v[0] * .5, v[1] * .5, v[2] * .5));
    for (const [a, b, c] of F) this.tri(W[a], W[b], W[c], col, [swayAll, swayAll, swayAll]);
  }
  crystal(m, col) { // elongated octahedron
    const P = [[0, 1, 0], [.5, .45, 0], [0, .45, .5], [-.5, .45, 0], [0, .45, -.5], [0, -0.1, 0]].map((p) => m4.xform(m, ...p));
    for (let i = 0; i < 4; i++) { const a = 1 + i, b = 1 + ((i + 1) % 4); this.tri(P[0], P[b], P[a], col); this.tri(P[5], P[a], P[b], col.map((x) => x * 0.8)); }
  }
  ring(r0, r1, seg, col) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2;
      this.quad([Math.cos(a) * r0, 0, Math.sin(a) * r0], [Math.cos(a) * r1, 0, Math.sin(a) * r1], [Math.cos(b) * r1, 0, Math.sin(b) * r1], [Math.cos(b) * r0, 0, Math.sin(b) * r0], col);
    }
  }
  disk(r, seg, col) { for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2; this.tri([0, 0, 0], [Math.cos(a) * r, 0, Math.sin(a) * r], [Math.cos(b) * r, 0, Math.sin(b) * r], col); } }
}

// ---------- renderer ----------
export class OGCE3D {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserveDrawingBuffer })
      || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    this.prec = hp && hp.precision > 0 ? 'highp' : 'mediump';
    this.ext = { half: gl.getExtension('OES_texture_half_float'), halfLinear: gl.getExtension('OES_texture_half_float_linear'), depthTex: gl.getExtension('WEBGL_depth_texture'), cbHalf: gl.getExtension('EXT_color_buffer_half_float'), inst: gl.getExtension('ANGLE_instanced_arrays'), aniso: gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') };
    this.renderScale = clamp(+(opts.renderScale ?? 1), 0.5, 1); this.dof = null;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.rig = new CameraRig(opts.camera || {}, { yaw: opts.yaw ?? Math.PI + 0.62, pitch: 0.55, dist: 10 });
    this.view = null; this.obstacles = []; this.fx = []; this.duel = null;
    this.time = 0; this.last = 0; this.state = null; this.playerId = null; this.seedKey = null;
    this.actors = new Map(); this.effects = []; this.marker = null; this.hintTarget = null; this.labels = [];
    this.env = { event: 'calm', season: 'Spring' };
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.quality = clamp(opts.quality ?? (coarse ? 1 : 2), 0, MAXQ); this.qualityLocked = false; this.autoMax = coarse ? 2 : MAXQ;
    this.shadowSize = 1024; this.cascades = 0; this.frameMs = 16; this.slowFor = 0; this.fastFor = 0; this.lastDowngrade = -1e9; this.drawCalls = 0; this.fps = 60;
    this.onFrame = opts.onFrame || null;
    this.init();
    this.loop = this.loop.bind(this);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.targets = {}; this.init(); this.seedKey = null; });
    requestAnimationFrame(this.loop);
  }

  // ----- setup -----
  program(vs, fs, mode = this.outMode) {
    const gl = this.gl, pre = `#define OUTMODE ${mode}\n`;
    const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, pre + s.replace(/PREC/g, this.prec)); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, a = {};
    for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) { const n = gl.getActiveUniform(p, i).name; u[n] = gl.getUniformLocation(p, n); }
    for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i++) { const n = gl.getActiveAttrib(p, i).name; a[n] = gl.getAttribLocation(p, n); }
    return { p, u, a };
  }
  mesh(geo) { const gl = this.gl, b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); const data = geo instanceof Float32Array ? geo : new Float32Array(geo.v); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return { b, n: data.length / STRIDE }; }
  init() {
    const gl = this.gl;
    this.targets = {};
    this.hdrType = this.detectHdr();
    this.buildPrograms();
    this.quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const W = 420; this.waterBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.waterBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-W + 32, -W + 32, W + 32, -W + 32, W + 32, W + 32, -W + 32, -W + 32, W + 32, W + 32, -W + 32, W + 32]), gl.STATIC_DRAW);
    this.rainBuf = gl.createBuffer(); this.pointBuf = gl.createBuffer();
    const I = m4.ident(), g = (f) => { const G = new Geo(); f(G); return this.mesh(G); };
    this.parts = {
      box: g((G) => G.box(I, [1, 1, 1], 0, false)),
      limb: g((G) => G.box(m4.trs(0, -0.5, 0), [1, 1, 1], 0, false)),
      cone: g((G) => G.cone(I, [1, 1, 1], 10)),
      sphere: g((G) => G.ico(I, [1, 1, 1], 2)),
      lowsphere: g((G) => G.ico(I, [1, 1, 1], 1)),
      crystal: g((G) => G.crystal(I, [1, 1, 1])),
      ring: g((G) => G.ring(0.42, 0.5, 40, [1, 1, 1])),
      disk: g((G) => G.disk(0.5, 28, [1, 1, 1])),
      cyl: g((G) => G.cyl(I, [1, 1, 1], 12)),
    };
    this.heightTex = null;
    this.applyTier();
  }
  detectHdr() {
    const gl = this.gl;
    if (!this.ext.half) return 0;
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, this.ext.half.HALF_FLOAT_OES, null);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(f); gl.deleteTexture(t);
    return ok ? this.ext.half.HALF_FLOAT_OES : 0;
  }
  buildPrograms() {
    const tier = TIERS[this.quality] || TIERS[1];
    const mode = !tier.post ? 0 : this.hdrType ? 1 : 2;
    if (mode === this.outMode && this.lit) return;
    this.outMode = mode;
    this.lit = this.program(SH.LIT_VS, SH.LIT_FS); this.depth = this.program(SH.DEPTH_VS, SH.DEPTH_FS);
    this.sky = this.program(SH.SKY_VS, SH.SKY_FS); this.water = this.program(SH.WATER_VS, SH.WATER_FS); this.line = this.program(SH.LINE_VS, SH.LINE_FS);
    this.points = this.program(SH.POINT_VS, SH.POINT_FS);
    try { this.grassProg = this.ext.inst ? this.program(SH.GRASS_VS, SH.GRASS_FS) : null; } catch (e) { console.warn('grass shader', e); this.grassProg = null; }
    if (mode) {
      this.bright = this.program(SH.POST_VS, SH.BRIGHT_FS); this.blur = this.program(SH.POST_VS, SH.BLUR_FS);
      this.composite = this.program(SH.POST_VS, SH.COMPOSITE_FS); this.fxaa = this.program(SH.POST_VS, SH.FXAA_FS);
    }
  }
  // render targets: { fbo, tex, depthTex?, rb?, w, h }
  target(name, w, h, opts = {}) {
    const gl = this.gl, old = this.targets[name];
    if (old && old.w === w && old.h === h && !!old.wantDepthTex === !!opts.depthTex) return old;
    if (old) { gl.deleteFramebuffer(old.fbo); gl.deleteTexture(old.tex); if (old.rb) gl.deleteRenderbuffer(old.rb); if (old.depthTex) gl.deleteTexture(old.depthTex); }
    const type = opts.ldr ? gl.UNSIGNED_BYTE : (this.hdrType || gl.UNSIGNED_BYTE);
    const linear = opts.linear && (type === gl.UNSIGNED_BYTE || this.ext.halfLinear);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const t = { fbo, tex, w, h };
    if (opts.depth) {
      if (opts.depthTex && this.ext.depthTex) {
        t.depthTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t.depthTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, t.depthTex, 0);
      } else {
        t.rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, t.rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.rb);
      }
    }
    t.ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    t.wantDepthTex = !!opts.depthTex; this.targets[name] = t; return t;
  }
  initShadow(size, cascades) {
    const gl = this.gl;
    if (this.shadowFbo) { gl.deleteFramebuffer(this.shadowFbo); gl.deleteTexture(this.shadowTex); gl.deleteRenderbuffer(this.shadowRb); this.shadowFbo = null; }
    size = Math.min(size, this.maxTex / Math.max(1, cascades)); this.shadowSize = size; this.cascades = cascades;
    const w = size * cascades, h = size;
    this.shadowTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowRb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, this.shadowRb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    this.shadowFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.shadowRb);
    this.shadowOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  applyTier() {
    const T = TIERS[this.quality];
    this.buildPrograms();
    if (T.shadow) this.initShadow(T.shadow, T.cascades); else this.shadowOk = this.shadowOk && false;
    this.buildDetail(T.detail); this.grassKey = null;
    if (this.terrainStep !== T.terrain) { this.terrainStep = T.terrain; this.seedKey = null; if (this.state) this.render(this.state, this.playerId); }
  }
  setQuality(q, locked = false) {
    q = clamp(q | 0, 0, MAXQ); this.qualityLocked = locked;
    if (q === this.quality) return; this.quality = q; this.applyTier();
  }
  setRenderScale(s) { this.renderScale = clamp(+s || 1, 0.5, 1); }
  /** Procedural PBR detail texture (no licensed assets): R = albedo variation, GB = tangent-space normal (from a tileable fbm height field), A = roughness. */
  buildDetail(size) {
    const gl = this.gl;
    if (!size) { this.detailOn = false; return; }
    if (this.detailTex && this.detailSize === size) { this.detailOn = true; return; }
    const N = size, H = new Float32Array(N * N), R = new Float32Array(N * N);
    const lat = (g, s) => { const a = new Float32Array(g * g); let x = s; for (let i = 0; i < a.length; i++) { x = (x * 16807) % 2147483647; a[i] = x / 2147483647; } return a; };
    const oct = [[8, 0.5, 11], [16, 0.25, 23], [32, 0.14, 37], [64, 0.08, 51], [128, 0.03, 71]].filter((o) => o[0] <= N);
    const L = oct.map(([g, , s]) => lat(g, s)), L2 = oct.map(([g, , s]) => lat(g, s * 7 + 3));
    const sm = (f) => f * f * (3 - 2 * f);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let h = 0, r = 0;
      oct.forEach(([g, amp], k) => { const fx = (x / N) * g, fy = (y / N) * g, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
        const at = (A, i, j) => A[((j % g) * g) + (i % g)];
        const v = (A) => { const a = at(A, ix, iy), b = at(A, ix + 1, iy), c = at(A, ix, iy + 1), d = at(A, ix + 1, iy + 1); return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty; };
        h += v(L[k]) * amp; r += v(L2[k]) * amp; });
      H[y * N + x] = h; R[y * N + x] = r;
    }
    const px = new Uint8Array(N * N * 4), at = (x, y) => H[((y + N) % N) * N + ((x + N) % N)];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, dx = (at(x + 1, y) - at(x - 1, y)) * N * 0.045, dy = (at(x, y + 1) - at(x, y - 1)) * N * 0.045, l = Math.hypot(dx, dy, 1);
      px[i * 4] = clamp((H[i] - 0.15) * 1.7, 0, 1) * 255; px[i * 4 + 1] = (-dx / l * 0.5 + 0.5) * 255; px[i * 4 + 2] = (-dy / l * 0.5 + 0.5) * 255; px[i * 4 + 3] = clamp((R[i] - 0.1) * 1.6, 0, 1) * 255;
    }
    if (this.detailTex) gl.deleteTexture(this.detailTex);
    this.detailTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.detailTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.generateMipmap(gl.TEXTURE_2D);
    if (this.ext.aniso) gl.texParameterf(gl.TEXTURE_2D, this.ext.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(this.ext.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    this.detailSize = N; this.detailOn = true;
  }
  /** Dense instanced grass around the camera focus: near blades + far alpha-card clumps (impostors), rebuilt as you move. */
  buildGrass(fx, fz) {
    const gl = this.gl, T = TIERS[this.quality];
    if (!this.grassProg || !T.grass) { this.grassN = 0; return; }
    const key = `${Math.round(fx / 6)},${Math.round(fz / 6)},${this.quality},${this.seedKey}`; if (key === this.grassKey) return; this.grassKey = key;
    if (!this.bladeBuf) { // blade: tapered strip of 3 quads (pos only, 3 floats); card: one wide quad
      const b = [], seg = 3; for (let i = 0; i < seg; i++) { const y0 = i / seg, y1 = (i + 1) / seg, w0 = 0.06 * (1 - y0), w1 = 0.06 * (1 - y1); b.push(-w0, y0, 0, w0, y0, 0, w1, y1, 0, -w0, y0, 0, w1, y1, 0, -w1, y1, 0); }
      this.bladeBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.bladeBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(b), gl.STATIC_DRAW); this.bladeN = b.length / 3;
      const c = [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0, 0, 0, -0.5, 0, 0, 0.5, 0, 1, 0.5, 0, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5];
      this.cardBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.cardBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(c), gl.STATIC_DRAW); this.cardN = c.length / 3;
      this.grassBuf = gl.createBuffer(); this.grassBuf2 = gl.createBuffer(); this.cardInst = gl.createBuffer(); this.cardInst2 = gl.createBuffer();
    }
    let s = (Math.round(fx / 6) * 73856093) ^ (Math.round(fz / 6) * 19349663) ^ 0x5bd1e995; const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
    const ok = (x, z) => { const h0 = height(x, z); return h0 > WATER_LEVEL + 0.3 && slope(x, z) < 0.55 && pathDistance(x, z) > 0.9 && Math.hypot(x - 2, z - 2) > 1.6; };
    const near = T.grassFar, A = [], B = [], C = [], D = [];
    for (let tries = 0; A.length / 4 < T.grass && tries < T.grass * 6; tries++) {
      const r = Math.sqrt(rnd()) * near, a = rnd() * 6.2832, x = fx + Math.cos(a) * r, z = fz + Math.sin(a) * r;
      if (!ok(x, z)) continue; A.push(x, groundY(x, z) - 0.02, z, 0.22 + rnd() * 0.3); B.push(rnd() * 6.2832, rnd());
    }
    const far = near * 2.2, nCards = Math.round(T.grass / 18);
    for (let tries = 0; C.length / 4 < nCards && tries < nCards * 4; tries++) {
      const r = near * 0.8 + rnd() * (far - near * 0.8), a = rnd() * 6.2832, x = fx + Math.cos(a) * r, z = fz + Math.sin(a) * r;
      if (!ok(x, z)) continue; C.push(x, groundY(x, z) - 0.03, z, 0.5 + rnd() * 0.35); D.push(rnd() * 6.2832, rnd());
    }
    const up = (buf, arr) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW); };
    up(this.grassBuf, A); up(this.grassBuf2, B); up(this.cardInst, C); up(this.cardInst2, D);
    this.grassN = A.length / 4; this.cardInstN = C.length / 4; this.grassFar = near; this.cardFar = far;
  }
  drawGrass(c) {
    const gl = this.gl, G = this.grassProg, I = this.ext.inst, Lg = c.Lg, S = Lg.S; if (!G || !this.grassN) return;
    gl.useProgram(G.p); gl.disable(gl.CULL_FACE);
    gl.uniformMatrix4fv(G.u.uVP, false, c.VP); gl.uniform1f(G.u.uTime, this.time); gl.uniform1f(G.u.uWind, S.wind); gl.uniform3fv(G.u.uCam, this.eye);
    gl.uniform3fv(G.u.uSunDir, Lg.lightDir); gl.uniform3fv(G.u.uSunCol, Lg.sunCol); gl.uniform3fv(G.u.uSkyAmb, Lg.skyAmb); gl.uniform3fv(G.u.uGroundAmb, Lg.groundAmb);
    gl.uniform3fv(G.u.uFogCol, Lg.horizon); gl.uniform1f(G.u.uFog, S.fog); gl.uniform1f(G.u.uExposure, Lg.exposure); gl.uniform1f(G.u.uAutumn, Lg.autumn); gl.uniform1f(G.u.uSnow, Lg.snow);
    const draw = (geo, n, inst, inst2, count, far, card) => {
      gl.uniform1f(G.u.uFar, far); gl.uniform1f(G.u.uCard, card ? 1 : 0);
      for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
      const a = G.a.aPos, b = G.a.aInst, d = G.a.aInst2;
      gl.bindBuffer(gl.ARRAY_BUFFER, geo); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 12, 0); I.vertexAttribDivisorANGLE(a, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, inst); gl.enableVertexAttribArray(b); gl.vertexAttribPointer(b, 4, gl.FLOAT, false, 16, 0); I.vertexAttribDivisorANGLE(b, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, inst2); gl.enableVertexAttribArray(d); gl.vertexAttribPointer(d, 2, gl.FLOAT, false, 8, 0); I.vertexAttribDivisorANGLE(d, 1);
      I.drawArraysInstancedANGLE(gl.TRIANGLES, 0, n, count); this.drawCalls++;
      I.vertexAttribDivisorANGLE(b, 0); I.vertexAttribDivisorANGLE(d, 0);
    };
    draw(this.bladeBuf, this.bladeN, this.grassBuf, this.grassBuf2, this.grassN, this.grassFar, false);
    if (this.cardInstN) draw(this.cardBuf, this.cardN, this.cardInst, this.cardInst2, this.cardInstN, this.cardFar, true);
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    this.grassDrawn = this.grassN + this.cardInstN;
  }
  setEnvironment(env = {}) { this.env = { ...this.env, ...env }; }
  get pipeline() {
    const T = TIERS[this.quality];
    return { tier: T.name, hdr: this.outMode === 1 ? 'half-float' : this.outMode === 2 ? 'rgba8-reinhard' : 'direct', shadows: this.quality > 0 && !!this.shadowOk, cascades: T.cascades, pcfTaps: T.taps,
      bloom: T.bloom && this.outMode > 0, ssao: T.ssao && !!this.ext.depthTex && this.outMode > 0, fxaa: this.outMode > 0, msaa: this.outMode === 0, reflections: T.refl > 0 && this.outMode > 0,
      terrainStep: this.terrainStep, particles: T.particles, pbrDetail: this.detailOn ? `${this.detailSize}px procedural albedo/normal/roughness` : 'off', grass: this.grassDrawn || 0, refraction: !!T.refr && this.outMode > 0, lightShafts: !!T.shafts && this.outMode > 0, dof: !!this.dof, renderScale: this.renderScale, heightFog: T.fogH > 0, dpr: this.dpr, renderSize: `${this.canvas.width}x${this.canvas.height}`, event: this.env.event, season: this.env.season };
  }

  // ----- static world (built once per world and terrain detail) -----
  buildStatic(state) {
    const keep = [{ x: 2, y: 2 }, ...(state.entities || []), ...(state.creatures || [])];
    const T = new Geo(), X0 = -34, X1 = 98, F0 = -12, F1 = 76;
    const props = scatterProps(state.world_id || 'Aurelia', keep);
    // camera collision: tree trunks/canopies as short cylinders (bushes are see-through for the camera)
    this.obstacles = props.filter((p) => p.type !== 'bush').map((p) => ({ x: p.x, z: p.z, y: groundY(p.x, p.z), r: (p.type === 'pine' ? 0.5 : 0.75) * p.s, h: 4.2 * p.s }));
    // canopy density grid for baked ground AO under trees (v4.1 GI probe idea, done per vertex)
    const canopy = new Map(); const ck = (x, z) => `${Math.floor(x / 2)},${Math.floor(z / 2)}`;
    for (const p of props) if (p.type === 'pine' || p.type === 'broadleaf') canopy.set(ck(p.x, p.z), (canopy.get(ck(p.x, p.z)) || 0) + 1);
    const vert = (x, z, hOverride) => {
      const h = hOverride ?? height(x, z), e = 0.5;
      const hL = height(x - e, z), hR = height(x + e, z), hD = height(x, z - e), hU = height(x, z + e);
      const nx = (hL - hR) / (2 * e), nz = (hD - hU) / (2 * e), l = Math.hypot(nx, 1, nz);
      const curv = (hL + hR + hD + hU) / 4 - h; // concave → occluded
      let c = groundColor(x, z, h, Math.hypot(nx, nz));
      const micro = 0.94 + 0.12 * hash(Math.floor(x * 3) * 7.1 + Math.floor(z * 3) * 3.3);
      const ao = clamp(1 - Math.max(0, curv) * 1.6, 0.6, 1) * (1 - 0.13 * Math.min(3, canopy.get(ck(x, z)) || 0));
      c = c.map((v) => v * micro * ao);
      return { p: [x, h, z], n: [nx / l, 1 / l, nz / l], c };
    };
    const grid = (x0, x1, step, skipInner, snap) => {
      const N = Math.round((x1 - x0) / step) + 1, V = new Array(N * N);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = x0 + i * step, z = x0 + j * step;
        let hOv;
        // T-junction fix: fine boundary vertices between two coarse vertices take the coarse edge height
        if (snap && (i === 0 || j === 0 || i === N - 1 || j === N - 1) && ((i === 0 || i === N - 1) ? j % 2 : i % 2)) {
          const [ax, az, bx, bz] = (i === 0 || i === N - 1) ? [x, z - step, x, z + step] : [x - step, z, x + step, z];
          hOv = (height(ax, az) + height(bx, bz)) / 2;
        }
        V[j * N + i] = vert(x, z, hOv);
      }
      for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
        const xa = x0 + i * step, za = x0 + j * step;
        if (skipInner && xa >= F0 && za >= F0 && xa + step <= F1 && za + step <= F1) continue;
        const q = [V[j * N + i], V[j * N + i + 1], V[(j + 1) * N + i + 1], V[(j + 1) * N + i]];
        if (q.every((v) => v.p[1] < WATER_LEVEL - 1.6)) continue;
        T.triN([q[0].p, q[2].p, q[1].p], [q[0].n, q[2].n, q[1].n], [q[0].c, q[2].c, q[1].c]);
        T.triN([q[0].p, q[3].p, q[2].p], [q[0].n, q[3].n, q[2].n], [q[0].c, q[3].c, q[2].c]);
      }
    };
    const step = this.terrainStep || 1;
    if (step < 1) { grid(X0, X1, 1, true, false); grid(F0, F1, step, false, true); } else grid(X0, X1, 1, false, false);
    const terrainVerts = T.v.length;
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const hd = this.quality >= 2;
    let pillars = 0;
    for (const p of props) {
      const { x, z, s, rot } = p, y = p.y - 0.05, start = T.v.length;
      if (p.type === 'pine') {
        T.cyl(m4.trs(x, y, z, rot, 0, 0.22 * s, 1.0 * s, 0.22 * s), [0.33, 0.23, 0.15], 6);
        const g = 0.8 + p.hue * 0.35, tiers = hd ? 4 : 3;
        for (let k = 0; k < tiers; k++) T.cone(m4.trs(x, y + (0.55 + k * (1.9 / tiers)) * s, z, rot + k, 0, (1.75 - k * (1.3 / tiers)) * s, (1.3 - k * 0.1) * s), [0.09 * g, 0.29 * g + k * 0.012, 0.16 * g], hd ? 9 : 7, 0.6 + k * 0.35, false);
      } else if (p.type === 'broadleaf') {
        T.cyl(m4.trs(x, y, z, rot, 0, 0.26 * s, 1.25 * s, 0.26 * s), [0.37, 0.26, 0.16], 6);
        T.cyl(m4.trs(x, y + 1.0 * s, z, rot, 0.6, 0.12 * s, 0.7 * s, 0.12 * s), [0.37, 0.26, 0.16], 5);
        const c = hueRGB(0.24 + p.hue * 0.1, 0.5, 0.3 + p.hue * 0.08);
        T.ico(m4.trs(x, y + 1.8 * s, z, rot, 0, 1.9 * s, 1.6 * s, 1.9 * s), c, hd ? 2 : 1, 0.3, rnd, 0.8);
        T.ico(m4.trs(x + 0.55 * s, y + 1.4 * s, z + 0.3 * s, rot, 0, 1.1 * s), c.map((v) => v * 0.9), 1, 0.3, rnd, 0.6);
        if (hd) T.ico(m4.trs(x - 0.5 * s, y + 1.55 * s, z - 0.35 * s, rot, 0, 1.0 * s), c.map((v) => v * 1.06), 1, 0.3, rnd, 0.6);
      } else if (p.type === 'bush') {
        T.ico(m4.trs(x, y + 0.3 * s, z, rot, 0, 1.1 * s, 0.75 * s, 1.1 * s), hueRGB(0.27 + p.hue * 0.06, 0.45, 0.27), hd ? 2 : 1, 0.4, rnd, 0.3);
        if (p.hue > 0.6) for (let k = 0; k < 5; k++) { const a = rot + k * 1.3; T.box(m4.trs(x + Math.cos(a) * 0.4 * s, y + 0.5 * s, z + Math.sin(a) * 0.4 * s, a, 0, 0.08), [0.85, 0.15, 0.2], 0.3); }
      } else if (p.type === 'rock') {
        if (p.hue > 0.93 && s > 0.55 && pillars < 14) { // SSR strata pillar: eight banded layers, M0 at the base to M7+ at the top
          pillars++;
          for (let k = 0; k < 8; k++) { const w = (1.0 - k * 0.07) * s * 1.1; T.box(m4.trs(x, y + 0.2 * s + k * 0.34 * s, z, rot + k * 0.11, 0, w, 0.36 * s, w * 0.85), STRATA_COLOURS[k]); }
          T.crystal(m4.trs(x, y + 2.95 * s, z, rot, 0, 0.35 * s, 0.9 * s, 0.35 * s), [1, 0.9, 0.55]);
        } else {
          const g = 0.42 + p.hue * 0.15; T.ico(m4.trs(x, y + 0.15 * s, z, rot, 0.2, 1.2 * s, 0.75 * s, 0.95 * s), [g, g * 0.98, g * 0.93], hd ? 1 : 0, 0.45, rnd);
          if (hd && p.hue < 0.4) T.ico(m4.trs(x, y + 0.42 * s, z, rot, 0, 0.9 * s, 0.12 * s, 0.7 * s), [0.3, 0.45, 0.22], 0, 0.3, rnd); // moss cap
        }
      } else if (p.type === 'grass') {
        const c = hueRGB(0.25 + p.hue * 0.05, 0.55, 0.32), blades = hd ? 7 : 4;
        for (let k = 0; k < blades; k++) { const a = rot + k * (6.28 / blades) + hash(k + x) * 0.6, r = 0.18 * s * (0.6 + hash(k * 3 + z) * 0.6); const bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r, ht = (0.38 + hash(k + x * 2) * 0.2) * s;
          T.tri([bx - 0.05, y, bz], [bx + 0.05, y, bz + 0.02], [bx + Math.cos(a) * 0.17, y + ht, bz + Math.sin(a) * 0.17], c.map((v, i) => v * (0.85 + 0.3 * hash(k + i))), [0, 0, 1]); }
      } else if (p.type === 'flowers') {
        const c = [[0.95, 0.85, 0.3], [0.9, 0.45, 0.6], [0.75, 0.6, 0.95], [1, 1, 1]][Math.floor(p.hue * 4)];
        for (let k = 0; k < (hd ? 8 : 5); k++) { const a = rot + k * 1.3, r = 0.35 * s * ((k % 3) + 1) / 3, bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r;
          T.tri([bx, y, bz], [bx + 0.02, y + 0.25, bz], [bx - 0.02, y + 0.25, bz + 0.02], [0.2, 0.45, 0.15], [0, 0.5, 0.5]);
          T.box(m4.trs(bx, y + 0.28, bz, a, 0, 0.12, 0.05, 0.12), c, 0.5); T.box(m4.trs(bx, y + 0.31, bz, a, 0, 0.05), [1, 0.9, 0.4], 0.5); }
      }
      // baked contact AO: darken prop vertices close to the ground
      for (let i = start; i < T.v.length; i += STRIDE) { const k = clamp((T.v[i + 1] - y) / (1.2 * s), 0, 1), ao = 0.5 + 0.5 * k * (2 - k); T.v[i + 6] *= ao; T.v[i + 7] *= ao; T.v[i + 8] *= ao; }
    }
    // HD meadow detail: extra grass tufts and mushrooms near the play field (High/Ultra only)
    if (hd) {
      for (let i = 0; i < 2600; i++) {
        const x = -4 + hash(i * 1.7) * 72, z = -4 + hash(i * 2.9 + 5) * 72, h = height(x, z);
        if (h < WATER_LEVEL + 0.3 || pathDistance(x, z) < 1.1 || keep.some((p) => Math.abs(p.x - x) < 1.4 && Math.abs(p.y - z) < 1.4)) continue;
        if (hash(i * 5.3) < 0.04) { T.cyl(m4.trs(x, h, z, 0, 0, 0.05, 0.14, 0.05), [0.9, 0.88, 0.8], 5); T.cone(m4.trs(x, h + 0.13, z, 0, 0, 0.2, 0.1, 0.2), hash(i) < 0.5 ? [0.8, 0.2, 0.15] : [0.7, 0.55, 0.35], 7); continue; }
        const c = hueRGB(0.25 + hash(i * 3.1) * 0.06, 0.5, 0.3);
        for (let k = 0; k < 3; k++) { const a = hash(i + k) * 6.28; T.tri([x - 0.04, h, z], [x + 0.04, h, z + 0.02], [x + Math.cos(a) * 0.12, h + 0.28 + hash(i * k) * 0.15, z + Math.sin(a) * 0.12], c, [0, 0, 1]); }
      }
    }
    if (this.staticMesh) this.gl.deleteBuffer(this.staticMesh.b);
    this.staticMesh = this.mesh(T);
    this.propsCount = props.length; this.pillars = pillars; this.terrainTris = terrainVerts / STRIDE / 3; this.staticTris = T.v.length / STRIDE / 3;
    this.buildHeightTex(X0, X1);
    // v9.0 Sallow 'Healing' stream shrine (echo near camp): a willow-ringed stone by the nearest water's edge
    this.shrine = null;
    for (let r = 5; r < 16 && !this.shrine; r += 0.5) for (let a = 0; a < 6.28; a += 0.25) {
      const x = 2 + Math.cos(a) * r, z = 2 + Math.sin(a) * r, h0 = height(x, z);
      if (h0 > WATER_LEVEL + 0.15 && h0 < WATER_LEVEL + 0.9 && keep.every((p) => Math.hypot(p.x - x, p.y - z) > 1.6)) { this.shrine = { x, z }; break; }
    }
    // Lux obelisk: a glowing waymarker on dry ground beside the starting camp
    this.obelisk = null;
    for (let r = 2.5; r < 6 && !this.obelisk; r += 0.5) for (let a = 0; a < 6.28; a += 0.4) {
      const x = 2 + Math.cos(a) * r, z = 2 + Math.sin(a) * r;
      if (height(x, z) > WATER_LEVEL + 0.4 && pathDistance(x, z) > 1.3 && keep.every((p) => Math.hypot(p.x - x, p.y - z) > 1.6)) { this.obelisk = { x, z }; break; }
    }
  }
  buildHeightTex(X0, X1) {
    const gl = this.gl, N = 256, data = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const v = clamp(Math.round((height(X0 + (i + 0.5) / N * (X1 - X0), X0 + (j + 0.5) / N * (X1 - X0)) + 6) / 10 * 255), 0, 255); data.set([v, v, v, 255], (j * N + i) * 4); }
    if (!this.heightTex) this.heightTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.heightTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.hRange = [X0, X0, X1 - X0, X1 - X0];
  }

  // ----- public API -----
  render(state, playerId) {
    this.state = state; this.playerId = playerId;
    const key = (state?.world_id || 'Aurelia') + ':' + (this.terrainStep || 1) + ':' + (this.quality >= 2 ? 'hd' : 'sd');
    if (key !== this.seedKey) { this.seedKey = key; this.buildStatic(state); }
    const now = this.time, seen = new Set();
    const upd = (id, kind, x, y, extra) => {
      seen.add(id); let a = this.actors.get(id);
      if (!a) { a = { id, kind, x, y, rx: x, rz: y, ry: groundY(x, y), face: 0, walk: 0, speed: 0, born: now, anim: null }; this.actors.set(id, a); }
      if ((a.x !== x || a.y !== y)) { if (Math.abs(a.x - x) + Math.abs(a.y - y) > 4) { a.rx = x; a.rz = y; } a.x = x; a.y = y; }
      Object.assign(a, extra);
    };
    for (const [id, p] of Object.entries(state?.players || {})) upd('p:' + id, 'player', p.x, p.y, { data: p, name: p.name || id, me: id === playerId, pid: id });
    for (const c of state?.creatures || []) upd('c:' + c.id, c.species === 'silverhart' ? 'deer' : 'wolf', c.x, c.y, { data: c, name: c.name, alive: c.alive !== false });
    for (const k of [...this.actors.keys()]) if (!seen.has(k)) this.actors.delete(k);
  }
  me() { return this.actors.get('p:' + this.playerId); }
  setMarker(x, y) { this.marker = x == null ? null : { x, y, t: this.time }; }
  setHintTarget(t) { this.hintTarget = t ? { x: t.x, y: t.y } : null; }
  playEffect(kind, x, y) { this.effects.push({ kind, x, y, t: this.time }); if (kind === 'attack' || kind === 'gather') { const a = this.me(); if (a) a.anim = { kind, t: this.time }; } }
  orbit(dx, dy) { this.rig.orbit(dx, dy); }
  zoom(f) { this.rig.zoom(f); }
  resetCamera() { this.rig.reset(); }
  recenter() { const m = this.me(); this.rig.recenter(m ? m.face : 0); }
  cameraOp(op) { const m = this.me(); return this.rig.op(op, m ? m.face : 0); }
  get yaw() { return this.rig.yaw; }
  get firstPerson() { return !!(this.view && this.view.first); }
  // v9.0 combat VFX: sparks, swing trails, rings, light bursts. Teen-safe: light and colour only.
  combatFx(kind, o = {}) {
    const m = this.me(), at = o.at || (m ? [m.rx, m.ry + 1.0, m.rz] : [2, 1, 2]), fp = this.firstPerson ? 1.6 : 1;
    const col = o.colour || [1, 0.9, 0.5];
    const push = (f) => { this.fx.push({ t: this.time, at: [...at], col, n: 24, life: 0.6, speed: 2.5, ...f }); if (this.fx.length > 40) this.fx.shift(); };
    if (kind === 'swing') push({ kind: 'arc', life: 0.28, n: Math.round(28 * fp), heavy: !!o.heavy, face: m ? m.face : 0, at: m ? [m.rx, m.ry, m.rz] : at });
    else if (kind === 'hit') { push({ kind: 'spark', n: Math.round((o.big ? 40 : 22) * fp), speed: o.big ? 4 : 3 }); this.rig.addShake(o.big ? 0.35 : 0.15); }
    else if (kind === 'blocked') push({ kind: 'spark', col: [0.6, 0.8, 1], n: 14, speed: 2 });
    else if (kind === 'parry') { push({ kind: 'ring', col: [1, 0.95, 0.7], life: 0.5 }); push({ kind: 'spark', col: [1, 1, 0.8], n: 50, speed: 5 }); this.rig.addShake(0.3); this.rig.addKick(0.5); }
    else if (kind === 'perfect') { push({ kind: 'ring', col: [0.4, 1, 1], life: 0.6, at: m ? [m.rx, m.ry + 0.2, m.rz] : at }); this.rig.addKick(0.35); }
    else if (kind === 'hurt') { push({ kind: 'spark', col: [0.75, 0.6, 1], n: 18, speed: 2.2, at: m ? [m.rx, m.ry + 1.1, m.rz] : at }); this.rig.addShake(0.3); }
    else if (kind === 'guard_break') { push({ kind: 'ring', col: [1, 0.6, 0.3], life: 0.4 }); this.rig.addShake(0.4); }
    else if (kind === 'special') {
      const F = o.fx || {};
      for (let r = 0; r < (F.ring || 1); r++) push({ kind: 'ring', life: 0.5 + r * 0.18, delay: r * 0.08, scale: 1 + r * 0.6 });
      push({ kind: 'spark', n: Math.round((F.particles || 60) * fp), speed: 4 + (F.ring || 1), life: 0.9, rainbow: !!F.rainbow });
      push({ kind: 'column', life: 0.8, n: Math.round(30 * fp) });
      this.rig.addShake((F.shake || 4) / 12); this.rig.addKick(0.6 + (F.flash || 0) * 0.2);
    } else if (kind === 'win') push({ kind: 'spark', col: [1, 0.85, 0.4], n: 80, speed: 3, life: 1.4 });
  }
  setDuel(d) { this.duel = d; }

  /** Screen → world tile or object. */
  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect(), nx = ((clientX - r.left) / r.width) * 2 - 1, ny = 1 - ((clientY - r.top) / r.height) * 2;
    let best = null, bd = 34;
    const consider = (kind, obj, x, z, yOff) => { const s = this.project(x, groundY(x, z) + yOff, z); if (!s) return; const d = Math.hypot(s.x - clientX, s.y - clientY); if (d < bd) { bd = d; best = { kind, obj, x, y: z }; } };
    for (const c of this.state?.creatures || []) if (c.alive !== false) consider('creature', c, c.x, c.y, 0.5);
    for (const e of this.state?.entities || []) if (e.kind === 'resource' && e.quantity > 0) consider('resource', e, e.x, e.y, 0.5);
    if (best) return best;
    if (!this.invVP) return null;
    const a = m4.xform(this.invVP, nx, ny, -1), b = m4.xform(this.invVP, nx, ny, 1);
    const o = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], e = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
    const d = [e[0] - o[0], e[1] - o[1], e[2] - o[2]], L = Math.hypot(...d); d[0] /= L; d[1] /= L; d[2] /= L;
    let t = 0, prev = 0;
    for (let i = 0; i < 600 && t < 160; i++) {
      const px = o[0] + d[0] * t, py = o[1] + d[1] * t, pz = o[2] + d[2] * t;
      if (py <= groundY(px, pz)) { let lo = prev, hi = t; for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; const qy = o[1] + d[1] * m; if (qy <= groundY(o[0] + d[0] * m, o[2] + d[2] * m)) hi = m; else lo = m; } t = hi; break; }
      prev = t; t += 0.12 + t * 0.01;
    }
    const x = Math.round(o[0] + d[0] * t), z = Math.round(o[2] + d[2] * t);
    return { kind: 'ground', x: clamp(x, 0, 63), y: clamp(z, 0, 63), outside: x < 0 || z < 0 || x > 63 || z > 63 };
  }
  project(x, y, z) {
    if (!this.VP) return null; const p = m4.xform(this.VP, x, y, z); if (p[3] <= 0.01) return null;
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (p[0] / p[3] * 0.5 + 0.5) * r.width, y: r.top + (1 - (p[1] / p[3] * 0.5 + 0.5)) * r.height, depth: p[3] };
  }

  // ----- per-frame -----
  loop(ts) {
    requestAnimationFrame(this.loop);
    if (this.lost) return;
    const dt = Math.min(0.1, (ts - (this.last || ts)) / 1000); this.last = ts; this.time += dt;
    this.adapt(dt);
    try { this.frame(dt); } catch (e) { if (!this.errored) { this.errored = true; console.warn('render error', e); } }
    if (this.onFrame) this.onFrame(this);
    if (this._capture) { const f = this._capture; this._capture = null; try { f(this.canvas); } catch (e) { console.warn('capture failed', e); } }
  }
  /** Calls fn(canvas) right after the next frame is drawn (same task, so the WebGL buffer is still readable). */
  captureNext(fn) { this._capture = fn; }
  adapt(dt) {
    if (dt <= 0) return;
    this.frameMs = lerp(this.frameMs, dt * 1000, 0.05); this.fps = Math.round(1000 / this.frameMs);
    if (this.qualityLocked) return;
    if (this.frameMs > 34) { this.slowFor += dt; this.fastFor = 0; } else if (this.frameMs < 17.5) { this.fastFor += dt; this.slowFor = 0; } else { this.slowFor = 0; this.fastFor = 0; }
    if (this.slowFor > 2.5 && this.quality > 0) { this.setQuality(this.quality - 1); this.slowFor = 0; this.lastDowngrade = this.time; }
    if (this.fastFor > 10 && this.quality < this.autoMax && this.time - this.lastDowngrade > 40) { this.setQuality(this.quality + 1); this.fastFor = 0; }
  }
  resize() {
    const cap = TIERS[this.quality].dpr;
    this.dpr = Math.min(window.devicePixelRatio || 1, cap) * (this.renderScale || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr)), h = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }
  lighting(dt) {
    const st = this.state, sky = skyState(st?.tick ?? 0, st?.weather ?? 'clear');
    this.skyP = this.skyP || { ...sky };
    for (const k of ['elev', 'day', 'cloud', 'fog', 'wind']) this.skyP[k] = damp(this.skyP[k], sky[k], 1.5, dt);
    this.skyP.az = angDamp(this.skyP.az, sky.az, 1.5, dt); this.skyP.rain = sky.rain;
    const S = this.skyP, day = S.day, ev = this.env.event, season = this.env.season;
    const sunUp = Math.max(S.elev, -0.2);
    const sun = [Math.cos(S.az) * Math.cos(sunUp), Math.sin(sunUp), Math.sin(S.az) * Math.cos(sunUp)];
    const night = S.elev < 0;
    const lightDir = night ? [-sun[0], Math.max(0.35, -sun[1]), -sun[2]] : [sun[0], Math.max(0.12, sun[1]), sun[2]];
    { const l = Math.hypot(...lightDir); lightDir[0] /= l; lightDir[1] /= l; lightDir[2] /= l; }
    const warm = 1 - clamp(S.elev * 2.5, 0, 1), cloudDim = 1 - S.cloud * 0.4;
    // linear-light intensities (HDR); the tone mapper brings them back to display range
    const sunCol = night ? [0.16, 0.2, 0.36] : [lerp(2.9, 2.6, warm) * cloudDim, lerp(2.7, 1.55, warm) * cloudDim, lerp(2.45, 0.85, warm) * cloudDim];
    const zenith = [lerp(0.03, 0.2, day), lerp(0.05, 0.42, day), lerp(0.14, 0.85, day)].map((v) => v * (1 - S.cloud * 0.25 * day));
    const horizon = [lerp(0.08, lerp(0.72, 1.0, warm * day), day), lerp(0.11, lerp(0.84, 0.6, warm * day), day), lerp(0.2, lerp(0.95, 0.45, warm * day), day)].map((v, i) => lerp(v, [0.62, 0.66, 0.7][i] * (0.3 + 0.7 * day), S.cloud * 0.45));
    const skyAmb = [lerp(0.05, 0.36, day), lerp(0.07, 0.44, day), lerp(0.14, 0.6, day)];
    const groundAmb = [lerp(0.03, 0.2, day), lerp(0.03, 0.17, day), lerp(0.05, 0.11, day)];
    const haze = [1.0, lerp(0.85, 0.6, warm), lerp(0.7, 0.35, warm)].map((v) => v * (0.5 + 0.5 * day));
    const lux = ev === 'lux_tide' ? 1 : 0;
    return { S, day, night, sun: sun.map((v) => v / Math.hypot(...sun)), lightDir, warm, sunCol, zenith, horizon, skyAmb, groundAmb, haze,
      exposure: lerp(1.9, 1.0, day), aurora: ev === 'aurora' ? 1 : season === 'Winter' ? 0.45 : 0, meteors: ev === 'meteor_shower' ? 1 : 0, lux,
      snow: season === 'Winter' ? 0.85 : 0, autumn: season === 'Autumn' ? 0.8 : 0 };
  }
  frame(dt) {
    const gl = this.gl; this.resize(); this.drawCalls = 0;
    const T = TIERS[this.quality], Lg = this.lighting(dt), S = Lg.S;
    for (const a of this.actors.values()) {
      const px = a.rx, pz = a.rz; const k = a.kind === 'player' ? 11 : 6;
      a.rx = damp(a.rx, a.x, k, dt); a.rz = damp(a.rz, a.y, k, dt);
      const mv = Math.hypot(a.rx - px, a.rz - pz); a.speed = damp(a.speed, mv / Math.max(dt, 1e-3), 10, dt);
      if (mv > 1e-4) a.face = angDamp(a.face, Math.atan2(a.rx - px, a.rz - pz), 14, dt);
      a.walk += mv * 5.5; a.ry = damp(a.ry, groundY(a.rx, a.rz), 14, dt);
    }
    const me = this.me();
    const feet0 = me ? [me.rx, me.ry, me.rz] : [2, groundY(2, 2), 2];
    const feet = this.photo ? [feet0[0] + this.photo.dx, Math.max(groundY(feet0[0] + this.photo.dx, feet0[2] + this.photo.dz), feet0[1] + this.photo.dy), feet0[2] + this.photo.dz] : feet0; // photo mode: free camera offset
    const obs = this.obstacles.filter((o) => Math.abs(o.x - feet[0]) < 40 && Math.abs(o.z - feet[2]) < 40);
    const CV = this.rig.update(dt, { feet, face: me ? me.face : 0, moving: me ? clamp(me.speed / 3, 0, 1) : 0, ground: groundY, obstacles: obs, water: WATER_LEVEL });
    this.view = CV; const eye = CV.eye;
    if (this.staticMesh) this.buildGrass(feet[0], feet[2]);
    if (this.dof?.auto) this.dof.focus = Math.max(0.5, Math.hypot(eye[0] - feet[0], eye[1] - feet[1] - 0.9, eye[2] - feet[2])); // focus on the player
    const W = this.canvas.width, H = this.canvas.height, aspect = W / H;
    this.near = CV.blend > 0.3 ? 0.04 : 0.2; this.far = 420;
    const P = m4.persp(CV.fov, aspect, this.near, this.far), V = m4.lookAt(eye, CV.look);
    this.VP = m4.mul(P, V); this.invVP = m4.invert(this.VP); this.eye = eye;
    const items = this.buildItems();
    // ---- shadow cascades (near: sharp 16 m radius, far: 56 m) ----
    const shadows = this.quality > 0 && this.shadowOk;
    const C = { target: feet }; const fwd = [CV.look[0] - eye[0], 0, CV.look[2] - eye[2]]; { const l = Math.hypot(fwd[0], fwd[2]) || 1; fwd[0] /= l; fwd[2] /= l; }
    const cascadeVP = (R, push) => {
      const snap = (R * 2) / this.shadowSize; // texel snapping keeps shadow edges from shimmering
      const lc = [Math.round((C.target[0] + fwd[0] * push) / snap) * snap, C.target[1], Math.round((C.target[2] + fwd[2] * push) / snap) * snap];
      const LV = m4.lookAt([lc[0] + Lg.lightDir[0] * 80, lc[1] + Lg.lightDir[1] * 80, lc[2] + Lg.lightDir[2] * 80], lc, Math.abs(Lg.lightDir[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0]);
      return m4.mul(m4.ortho(-R, R, -R, R, 1, 180), LV);
    };
    const nC = shadows ? this.cascades : 0;
    const LVP0 = cascadeVP(nC > 1 ? 15 : 26, nC > 1 ? 4 : 2), LVP1 = cascadeVP(58, 26);
    if (shadows) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
      gl.viewport(0, 0, this.shadowSize * nC, this.shadowSize);
      gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
      const D = this.depth; gl.useProgram(D.p); gl.uniform1f(D.u.uTime, this.time); gl.uniform1f(D.u.uWind, S.wind);
      for (let c = 0; c < nC; c++) {
        gl.viewport(c * this.shadowSize, 0, this.shadowSize, this.shadowSize);
        gl.uniformMatrix4fv(D.u.uLightVP, false, c ? LVP1 : LVP0);
        for (const it of items) if (it.cast !== false && it.alpha === undefined) this.drawMesh(D, it.mesh, it.m);
      }
    }
    const post = this.outMode > 0;
    const ctx = { Lg, eye, LVP0, LVP1, shadows, nC, items };
    // ---- planar water reflection (High/Ultra) ----
    let refl = null;
    if (post && T.refl > 0) {
      refl = this.target('refl', Math.max(1, Math.round(W * T.refl)), Math.max(1, Math.round(H * T.refl)), { depth: true, linear: true });
      if (refl.ok) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, refl.fbo); gl.viewport(0, 0, refl.w, refl.h);
        const M = new Float32Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 2 * WATER_LEVEL, 0, 1]);
        const rVP = m4.mul(this.VP, M);
        this.drawScene({ ...ctx, VP: rVP, invVP: m4.invert(rVP), skyEye: [eye[0], 2 * WATER_LEVEL - eye[1], eye[2]], clipY: WATER_LEVEL - 0.02, reflection: true });
      } else refl = null;
    }
    // ---- main scene ----
    let scene = null;
    if (post) {
      scene = this.target('scene', W, H, { depth: true, depthTex: T.ssao || T.depthTex || !!this.dof }); // DoF (photo mode/cinematics) needs scene depth on any tier
      if (!scene.ok) { this.outMode = 0; this.lit = null; this.buildPrograms(); return; }
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
    } else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    this.drawScene({ ...ctx, VP: this.VP, invVP: this.invVP, skyEye: eye, clipY: -1e9, refl, scene });
    if (!post) return;
    // ---- bloom: bright-pass at 1/4 resolution, two separable Gaussian iterations ----
    const bw = Math.max(1, W >> 2), bh = Math.max(1, H >> 2);
    let bloomTex = null;
    if (T.bloom) {
      const b1 = this.target('bloom1', bw, bh, { linear: true }), b2 = this.target('bloom2', bw, bh, { linear: true });
      this.postPass(this.bright, b1, { uTex: scene.tex }, { uTexel: [1 / W, 1 / H], uThreshold: 1.1 });
      for (let i = 0; i < (this.quality >= 3 ? 2 : 1); i++) {
        this.postPass(this.blur, b2, { uTex: b1.tex }, { uDir: [(1 + i) / bw, 0] });
        this.postPass(this.blur, b1, { uTex: b2.tex }, { uDir: [0, (1 + i) / bh] });
      }
      bloomTex = b1.tex;
    }
    // ---- composite (SSAO, bloom, ACES, grading, vignette, gamma) → LDR, then FXAA to screen ----
    const ldr = this.target('ldr', W, H, { ldr: true, linear: true });
    const ssao = T.ssao && !!scene.depthTex;
    // sun position on screen for light shafts
    let sunUV = [-9, -9], shaftK = 0;
    if (T.shafts && scene.depthTex && Lg.day > 0.2) { const s = Lg.sun, P = [eye[0] + s[0] * 500, eye[1] + s[1] * 500, eye[2] + s[2] * 500], V = this.VP;
      const x = V[0] * P[0] + V[4] * P[1] + V[8] * P[2] + V[12], y = V[1] * P[0] + V[5] * P[1] + V[9] * P[2] + V[13], w = V[3] * P[0] + V[7] * P[1] + V[11] * P[2] + V[15];
      if (w > 0) { sunUV = [x / w * 0.5 + 0.5, y / w * 0.5 + 0.5]; const off = Math.max(Math.abs(sunUV[0] - 0.5), Math.abs(sunUV[1] - 0.5)); shaftK = clamp(1.6 - off * 1.6, 0, 1) * 0.55 * Lg.day * (1 - Lg.S.cloud * 0.5); } }
    const dofOn = this.dof && scene.depthTex ? 1 : 0;
    this.postPass(this.composite, ldr, { uScene: scene.tex, uBloom: bloomTex || scene.tex, uDepth: scene.depthTex || scene.tex },
      { uRes: [W, H], uExposure: Lg.exposure, uBloomOn: bloomTex ? 1 : 0, uBloomK: 0.55 + Lg.lux * 0.3, uAOOn: ssao ? 1 : 0, uNear: this.near, uFar: this.far,
        uNight: 1 - Lg.day, uVignette: 0.55, uWarm: Lg.warm * Lg.day, uTime: this.time, uSunUV: sunUV, uShaftK: shaftK, uDofOn: dofOn, uFocus: this.dof?.focus ?? 8, uAperture: this.dof?.aperture ?? 0 });
    this.postPass(this.fxaa, null, { uTex: ldr.tex }, { uTexel: [1 / W, 1 / H] });
  }
  postPass(prog, target, tex, uni) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : this.canvas.width, target ? target.h : this.canvas.height);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.useProgram(prog.p);
    let unit = 0;
    for (const [k, t] of Object.entries(tex)) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(prog.u[k], unit); unit++; }
    for (const [k, v] of Object.entries(uni)) { if (!prog.u[k]) continue; if (Array.isArray(v)) gl['uniform' + v.length + 'fv'](prog.u[k], v); else gl.uniform1f(prog.u[k], v); }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf); this.attribs(prog, [['aPos', 2, 0]], 8); gl.drawArrays(gl.TRIANGLES, 0, 3); this.drawCalls++;
    gl.enable(gl.DEPTH_TEST);
  }
  drawScene(c) {
    const gl = this.gl, { Lg, items } = c, S = Lg.S, T = TIERS[this.quality];
    gl.clearColor(Lg.horizon[0], Lg.horizon[1], Lg.horizon[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // sky
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
    const K = this.sky; gl.useProgram(K.p);
    gl.uniformMatrix4fv(K.u.uInvVP, false, c.invVP); gl.uniform3fv(K.u.uCam, c.skyEye); gl.uniform3fv(K.u.uSunDir, Lg.sun);
    gl.uniform3fv(K.u.uZenith, Lg.zenith); gl.uniform3fv(K.u.uHorizon, Lg.horizon); gl.uniform3fv(K.u.uSunCol, [2.2, lerp(2.0, 1.4, Lg.warm), lerp(1.8, 0.8, Lg.warm)]);
    gl.uniform1f(K.u.uTime, this.time); gl.uniform1f(K.u.uDay, Lg.day); gl.uniform1f(K.u.uCloud, S.cloud); gl.uniform1f(K.u.uExposure, Lg.exposure);
    gl.uniform1f(K.u.uAurora, Lg.aurora); gl.uniform1f(K.u.uMeteors, Lg.meteors); gl.uniform1f(K.u.uLux, Lg.lux);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf); this.attribs(K, [['aPos', 2, 0]], 8); gl.drawArrays(gl.TRIANGLES, 0, 3); this.drawCalls++;
    gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
    // lit pass
    const L = this.lit; gl.useProgram(L.p);
    gl.uniformMatrix4fv(L.u.uVP, false, c.VP); gl.uniformMatrix4fv(L.u.uLightVP0, false, c.LVP0); gl.uniformMatrix4fv(L.u.uLightVP1, false, c.LVP1);
    gl.uniform3fv(L.u.uSunDir, Lg.lightDir); gl.uniform3fv(L.u.uSunCol, Lg.sunCol); gl.uniform3fv(L.u.uSkyAmb, Lg.skyAmb); gl.uniform3fv(L.u.uGroundAmb, Lg.groundAmb);
    gl.uniform3fv(L.u.uFogCol, Lg.horizon); gl.uniform3fv(L.u.uHazeCol, Lg.haze); gl.uniform3fv(L.u.uCam, this.eye); gl.uniform1f(L.u.uFog, S.fog); gl.uniform1f(L.u.uTime, this.time); gl.uniform1f(L.u.uWind, S.wind);
    gl.uniform1f(L.u.uShadowOn, c.shadows && !c.reflection ? 1 : 0); gl.uniform1f(L.u.uCascades, c.nC);
    gl.uniform2fv(L.u.uTexel, [1 / (this.shadowSize * Math.max(1, c.nC)), 1 / this.shadowSize]); gl.uniform1i(L.u.uTaps, T.taps || 1);
    gl.uniform1f(L.u.uExposure, Lg.exposure); gl.uniform1f(L.u.uClipY, c.clipY); gl.uniform1f(L.u.uWaterY, WATER_LEVEL);
    gl.uniform1f(L.u.uSnow, Lg.snow); gl.uniform1f(L.u.uAutumn, Lg.autumn);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex || null); gl.uniform1i(L.u.uShadow, 0);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.detailTex || null); gl.uniform1i(L.u.uDetail, 3); gl.uniform1f(L.u.uDetailOn, this.detailOn && !c.reflection ? 1 : 0);
    gl.uniform1f(L.u.uFogH, (T.fogH || 0) * (1 + (S.fog > 0.02 ? 3 : 0))); gl.activeTexture(gl.TEXTURE0);
    gl.disable(gl.BLEND);
    const blended = [];
    for (const it of items) {
      if (it.alpha !== undefined) { blended.push(it); continue; }
      if (c.reflection && this.quality < 3 && it.mesh !== this.staticMesh && !it.em) continue; // High reflects the landscape; Ultra reflects actors too
      this.setItem(L, it); this.drawMesh(L, it.mesh, it.m);
    }
    if (c.reflection) { gl.disable(gl.BLEND); return; }
    this.drawGrass(c);
    // refraction: copy the opaque scene (terrain, bed, actors) so the water can bend and absorb it
    let refr = null;
    if (T.refr && c.scene && this.blur) {
      refr = this.target('refr', Math.max(1, c.scene.w >> 1), Math.max(1, c.scene.h >> 1), { linear: true });
      this.postPass(this.blur, refr, { uTex: c.scene.tex }, { uDir: [0, 0] });
      gl.bindFramebuffer(gl.FRAMEBUFFER, c.scene.fbo); gl.viewport(0, 0, c.scene.w, c.scene.h); gl.enable(gl.DEPTH_TEST);
      for (let u = 0; u < 5; u++) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, null); } // break any scene-texture binding (no feedback loop)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex || null);
    }
    // water
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const Wt = this.water; gl.useProgram(Wt.p);
    gl.uniformMatrix4fv(Wt.u.uVP, false, c.VP); gl.uniform1f(Wt.u.uLevel, WATER_LEVEL); gl.uniform3fv(Wt.u.uCam, this.eye); gl.uniform3fv(Wt.u.uSunDir, Lg.lightDir);
    gl.uniform3fv(Wt.u.uSunCol, Lg.night ? [0.3, 0.35, 0.55] : Lg.sunCol); gl.uniform3fv(Wt.u.uZenith, Lg.zenith); gl.uniform3fv(Wt.u.uHorizon, Lg.horizon); gl.uniform3fv(Wt.u.uFogCol, Lg.horizon);
    gl.uniform1f(Wt.u.uTime, this.time); gl.uniform1f(Wt.u.uFog, S.fog); gl.uniform1f(Wt.u.uDay, Lg.day); gl.uniform1f(Wt.u.uExposure, Lg.exposure);
    gl.uniform1f(Wt.u.uReflOn, c.refl ? 1 : 0); gl.uniform2fv(Wt.u.uRes, [this.canvas.width, this.canvas.height]); gl.uniform4fv(Wt.u.uHRange, this.hRange || [0, 0, 1, 1]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, c.refl ? c.refl.tex : this.heightTex); gl.uniform1i(Wt.u.uRefl, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.heightTex); gl.uniform1i(Wt.u.uHeight, 2);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, refr ? refr.tex : this.heightTex); gl.uniform1i(Wt.u.uRefr, 4); gl.uniform1f(Wt.u.uRefrOn, refr ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.waterBuf); this.attribs(Wt, [['aPos', 2, 0]], 8); gl.drawArrays(gl.TRIANGLES, 0, 6); this.drawCalls++;
    gl.activeTexture(gl.TEXTURE0);
    // translucent items (glows, markers)
    gl.useProgram(L.p); gl.depthMask(false);
    for (const it of blended) { this.setItem(L, it); this.drawMesh(L, it.mesh, it.m); }
    gl.depthMask(true);
    if (S.rain) this.drawRain(this.eye, Lg);
    this.drawParticles(Lg);
    gl.disable(gl.BLEND);
  }
  setItem(L, it) {
    const gl = this.gl; gl.uniform3fv(L.u.uTint, it.tint || [1, 1, 1]); gl.uniform1f(L.u.uEmissive, it.em || 0); gl.uniform1f(L.u.uAlpha, it.alpha ?? 1);
    gl.uniform1f(L.u.uRough, it.rough ?? (it.mesh === this.staticMesh ? 0.88 : 0.7)); gl.uniform1f(L.u.uMetal, it.metal ?? 0);
    gl.uniform1f(L.u.uSeasonOK, it.mesh === this.staticMesh ? 1 : 0);
  }
  attribs(prog, list, stride) {
    const gl = this.gl;
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    for (const [name, size, off] of list) { const loc = prog.a[name]; if (loc === undefined || loc < 0) continue; gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off); }
  }
  drawMesh(prog, mesh, m) {
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, mesh.b);
    this.attribs(prog, [['aPos', 3, 0], ['aNor', 3, 12], ['aCol', 3, 24], ['aSway', 1, 36]], STRIDE * 4);
    gl.uniformMatrix4fv(prog.u.uModel, false, m || m4.ident());
    gl.drawArrays(gl.TRIANGLES, 0, mesh.n); this.drawCalls++;
  }
  drawRain(eye) {
    const gl = this.gl, n = this.quality >= 2 ? 1400 : 500, v = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const sx = ((i * 7.31) % 1) * 36 - 18, sz = ((i * 3.77 + 0.13) % 1) * 36 - 18; const fall = ((this.time * 1.4 + i * 0.137) % 1);
      const x = eye[0] + sx + Math.sin(i) * 3, z = eye[2] + sz, y = eye[1] + 9 - fall * 18;
      v.set([x, y, z, x - 0.05, y - 0.55, z - 0.02], i * 6);
    }
    const P = this.line; gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, this.VP); gl.uniform4fv(P.u.uColor, [0.6, 0.68, 0.85, 0.35]); gl.uniform1f(P.u.uExposure, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rainBuf); gl.bufferData(gl.ARRAY_BUFFER, v, gl.DYNAMIC_DRAW); this.attribs(P, [['aPos', 3, 0]], 12);
    gl.drawArrays(gl.LINES, 0, n * 2); this.drawCalls++;
  }
  // GPU point-sprite particles: fireflies, embers, crystal sparkles, Lux motes, pollen, autumn leaves, winter snow, rain splashes
  drawParticles(Lg) {
    const gl = this.gl, T = TIERS[this.quality], max = T.particles, add = [], alpha = [], t = this.time, st = this.state || {};
    const me = this.me(), cx = me ? me.rx : 2, cz = me ? me.rz : 2;
    const push = (arr, x, y, z, r, g, b, a, size) => { if (arr.length < max * 8) arr.push(x, y, z, r, g, b, a, size); };
    const night = 1 - Lg.day;
    if (night > 0.3) for (let i = 0; i < max * 0.25; i++) { // fireflies
      const bx = cx + (hash(i) - 0.5) * 40, bz = cz + (hash(i + 99) - 0.5) * 40, x = bx + Math.sin(t * 0.7 + i) * 0.8, z = bz + Math.cos(t * 0.6 + i * 1.3) * 0.8;
      const blink = Math.max(0, Math.sin(t * (1.5 + hash(i * 3)) + i * 7)); push(add, x, groundY(x, z) + 0.5 + Math.sin(t + i) * 0.3, z, 0.8, 1.0, 0.35, blink * night, 0.22);
    }
    for (const e of st.entities || []) {
      if (Math.abs(e.x - cx) > 30 || Math.abs(e.y - cz) > 30) continue;
      const y0 = groundY(e.x, e.y);
      if (e.kind === 'structure' && e.structure === 'campfire') for (let i = 0; i < 26; i++) { const k = (t * 0.55 + i / 26) % 1; push(add, e.x + Math.sin(i * 5.1 + t) * 0.3 * k, y0 + 0.3 + k * 2.6, e.y + Math.cos(i * 3.7 + t) * 0.3 * k, 1.0, 0.55 + 0.3 * (1 - k), 0.15, (1 - k) * 1.2, 0.12 + (1 - k) * 0.08);
        if (i < 10) push(alpha, e.x + Math.sin(i + t * 0.3) * 0.5 * k, y0 + 1.2 + k * 3.5, e.y + Math.cos(i * 2 + t * 0.3) * 0.5 * k, 0.35, 0.35, 0.38, 0.22 * (1 - k), 0.9 + k * 1.6); }
      if (e.kind === 'resource' && e.resource === 'crystal' && e.quantity > 0) for (let i = 0; i < 10; i++) { const k = (t * 0.4 + i / 10) % 1, a = i * 2.4 + t * 0.5; push(add, e.x + Math.cos(a) * 0.6, y0 + 0.2 + k * 1.8, e.y + Math.sin(a) * 0.6, 0.4, 0.95, 1.0, (1 - k) * 1.4, 0.1); }
    }
    if (this.obelisk) { const o = this.obelisk, oy = groundY(o.x, o.z); for (let i = 0; i < 24; i++) { const k = (t * 0.25 + i / 24) % 1, a = i * 1.7 + t * 0.3; push(add, o.x + Math.cos(a) * (0.5 + k), oy + 0.5 + k * 4.5, o.z + Math.sin(a) * (0.5 + k), 1.0, 0.85, 0.45, (1 - k) * 1.3, 0.12); } }
    if (Lg.lux) for (let i = 0; i < max * 0.2; i++) { const k = (t * 0.12 + hash(i)) % 1, x = cx + (hash(i * 7) - 0.5) * 36, z = cz + (hash(i * 11) - 0.5) * 36; push(add, x, groundY(x, z) + k * 8, z, 1.0, 0.85, 0.4, (1 - k) * 0.9, 0.16); }
    if (Lg.day > 0.5 && !Lg.S.rain && this.env.season !== 'Winter') for (let i = 0; i < max * 0.12; i++) { const x = cx + (hash(i * 2.1) - 0.5) * 20 + Math.sin(t * 0.3 + i) * 1.5, z = cz + (hash(i * 4.3) - 0.5) * 20 + Math.cos(t * 0.25 + i) * 1.5; push(add, x, groundY(x, z) + 0.6 + hash(i) * 2 + Math.sin(t * 0.5 + i) * 0.2, z, 1, 0.95, 0.75, 0.25, 0.05); }
    if (this.env.season === 'Autumn' || Lg.S.wind > 2) for (let i = 0; i < max * 0.15; i++) { const k = (t * 0.08 + hash(i * 3)) % 1, x = cx + (hash(i) - 0.5) * 30 + k * 6 * Lg.S.wind, z = cz + (hash(i + 5) - 0.5) * 30 + Math.sin(t + i) * 1.2; push(alpha, x, groundY(x, z) + 6 * (1 - k), z, 0.85, 0.45 + hash(i) * 0.3, 0.12, 0.9, 0.12); }
    if (this.env.season === 'Winter') for (let i = 0; i < max * 0.5; i++) { const k = (t * 0.07 + hash(i * 1.3)) % 1, x = this.eye[0] + (hash(i) - 0.5) * 34 + Math.sin(t * 0.5 + i) * 0.8, z = this.eye[2] + (hash(i + 17) - 0.5) * 34; push(alpha, x, this.eye[1] + 9 - k * 16, z, 0.95, 0.97, 1.0, 0.85, 0.09); }
    if (Lg.S.rain) for (let i = 0; i < max * 0.2; i++) { const k = (t * 2 + hash(i)) % 1, x = cx + (hash(i * 9) - 0.5) * 24, z = cz + (hash(i * 13) - 0.5) * 24; push(alpha, x, groundY(x, z) + 0.05, z, 0.8, 0.85, 0.95, (1 - k) * 0.5, 0.05 + k * 0.12); }
    // v9.0 combat VFX (sparks, swing trails, rings, light columns). Budget-capped by tier; brighter in first person.
    this.fx = this.fx.filter((f) => t - f.t < f.life + (f.delay || 0));
    for (const f of this.fx) {
      const age = t - f.t - (f.delay || 0); if (age < 0) continue;
      const k = age / f.life, fade = 1 - k, [x0, y0, z0] = f.at;
      if (f.kind === 'spark') for (let i = 0; i < f.n; i++) {
        const th = hash(i * 1.7 + f.t) * 6.283, ph = hash(i * 3.1 + f.t) * 1.2 + 0.2, sp = f.speed * (0.5 + hash(i * 5.3) * 0.7) * age;
        const c = f.rainbow ? hueRGB((i / f.n + t * 0.5) % 1, 0.8, 0.65) : f.col;
        push(add, x0 + Math.cos(th) * Math.cos(ph) * sp, y0 + Math.sin(ph) * sp - 3 * age * age, z0 + Math.sin(th) * Math.cos(ph) * sp, c[0], c[1], c[2], fade, 0.07 + 0.05 * fade);
      } else if (f.kind === 'ring') for (let i = 0; i < 36; i++) {
        const th = (i / 36) * 6.283, rr = (0.3 + k * 2.2) * (f.scale || 1);
        push(add, x0 + Math.cos(th) * rr, y0 - 0.6 + k * 0.3, z0 + Math.sin(th) * rr, f.col[0], f.col[1], f.col[2], fade * 0.9, 0.12);
      } else if (f.kind === 'column') for (let i = 0; i < f.n; i++) {
        const th = i * 2.4 + age * 6, rr = 0.35 + 0.25 * hash(i);
        push(add, x0 + Math.cos(th) * rr, y0 - 0.9 + ((i / f.n + age * 1.5) % 1) * 3, z0 + Math.sin(th) * rr, f.col[0], f.col[1], f.col[2], fade, 0.1);
      } else if (f.kind === 'arc') for (let i = 0; i < f.n; i++) { // swing trail: an arc in front of the player at chest height
        const u = i / (f.n - 1), sweep = (f.heavy ? 2.4 : 1.8), th = f.face - sweep / 2 + u * sweep * Math.min(1, k * 2.2);
        const rr = 0.9 + (f.heavy ? 0.25 : 0), hy = y0 + 1.0 + (f.heavy ? 0.7 - u * 0.9 : 0.15 - u * 0.2);
        push(add, x0 + Math.sin(th) * rr, hy, z0 + Math.cos(th) * rr, f.col[0], f.col[1], f.col[2], fade * (0.4 + 0.6 * u), 0.09);
      }
    }
    const P = this.points; gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, this.VP); gl.uniform1f(P.u.uExposure, Lg.exposure);
    gl.uniform1f(P.u.uScale, this.canvas.height * 0.9);
    gl.depthMask(false); gl.enable(gl.BLEND);
    for (const [arr, additive] of [[alpha, 0], [add, 1]]) {
      if (!arr.length) continue;
      gl.uniform1f(P.u.uAdd, additive);
      if (additive) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW);
      this.attribs(P, [['aPos', 3, 0], ['aCol', 4, 12], ['aSize', 1, 28]], 32);
      gl.drawArrays(gl.POINTS, 0, arr.length / 8); this.drawCalls++;
    }
    this.particleCount = (add.length + alpha.length) / 8;
    gl.depthMask(true); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  // ----- dynamic scene description -----
  // ----- dynamic scene description -----
  buildItems() {
    const items = this.staticMesh ? [{ mesh: this.staticMesh, m: m4.ident() }] : [], P = this.parts, t = this.time, st = this.state || {};
    const add = (mesh, m, tint, em, extra) => items.push({ mesh, m, tint, em, ...extra });
    const lbl = []; this.labels = lbl;
    const me = this.me(); const mx = me ? me.rx : 2, mz = me ? me.rz : 2;
    const near = (x, z, r = 48) => Math.abs(x - mx) < r && Math.abs(z - mz) < r;
    // entities
    for (const e of st.entities || []) {
      if (!near(e.x, e.y)) continue;
      const y = groundY(e.x, e.y), x = e.x, z = e.y;
      if (e.kind === 'resource') {
        const q = e.quantity || 0, alive = q > 0;
        if (e.resource === 'crystal') {
          const pulse = 0.55 + 0.35 * Math.sin(t * 2.4 + x);
          const n = alive ? 3 + Math.min(3, Math.ceil(q / 3)) : 3;
          for (let i = 0; i < n; i++) { const a = i * 2.1 + x, r = i ? 0.28 : 0; const s = alive ? (i ? 0.45 : 0.7) * (0.8 + 0.25 * Math.sin(i * 7)) : 0.25;
            add(P.crystal, m4.trs(x + Math.cos(a) * r, y - 0.05, z + Math.sin(a) * r, a, i ? 0.35 * Math.sin(a) : 0, s * 0.55, s * 1.6, s * 0.55, i ? 0.35 * Math.cos(a) : 0), alive ? [0.35, 0.95, 1.0] : [0.45, 0.5, 0.55], alive ? pulse : 0, { rough: 0.12, metal: 0.1 }); }
          if (alive) add(P.disk, m4.trs(x, y + 0.03, z, 0, 0, 1.6 + 0.2 * Math.sin(t * 2)), [0.3, 0.9, 1], 1.2, { alpha: 0.18, cast: false });
          for (let i = 0; alive && i < 3; i++) { const a = t * 0.8 + i * 2.09; add(P.box, m4.trs(x + Math.cos(a) * 0.7, y + 0.6 + 0.3 * Math.sin(t * 1.7 + i), z + Math.sin(a) * 0.7, a, a, 0.06), [0.6, 1, 1], 2, { cast: false }); }
        } else if (e.resource === 'wood') {
          add(P.cyl, m4.trs(x + 0.3, y - 0.05, z - 0.2, 0, 0, 0.5, 0.45, 0.5), [0.45, 0.31, 0.19]);
          add(P.disk, m4.trs(x + 0.3, y + 0.41, z - 0.2, 0, 0, 0.45), [0.8, 0.65, 0.42], 0.05);
          const logs = alive ? Math.min(4, Math.ceil(q / 3)) : 0;
          for (let i = 0; i < logs; i++) add(P.cyl, m4.trs(x - 0.35 + (i % 2) * 0.05, y + 0.12 + Math.floor(i / 2) * 0.22, z + 0.1 + (i % 2 ? 0.24 : -0.02) - Math.floor(i / 2) * 0.12, 0, 0, 0.22, 0.95, 0.22, Math.PI / 2), [0.5, 0.35, 0.2]);
          if (alive) add(P.ring, m4.trs(x, y + 0.04, z, t * 0.5, 0, 1.6), [0.9, 0.75, 0.4], 0.6, { alpha: 0.35, cast: false });
        } else {
          const n = alive ? 2 + Math.min(3, Math.ceil(q / 3)) : 1;
          for (let i = 0; i < n; i++) { const a = i * 2.4 + x; add(P.sphere, m4.trs(x + Math.cos(a) * 0.3 * (i > 0), y + 0.1, z + Math.sin(a) * 0.3 * (i > 0), a, 0.3, (i ? 0.45 : 0.75) * (alive ? 1 : 0.5), (i ? 0.35 : 0.55) * (alive ? 1 : 0.5), (i ? 0.45 : 0.65) * (alive ? 1 : 0.5)), [0.55, 0.55, 0.58]); }
          if (alive) add(P.ring, m4.trs(x, y + 0.04, z, -t * 0.5, 0, 1.6), [0.85, 0.85, 0.9], 0.6, { alpha: 0.35, cast: false });
        }
        lbl.push({ x, y: y + 1.3, z, text: (e.resource === 'crystal' ? '💎 ' : e.resource === 'wood' ? '🪵 ' : '🪨 ') + (alive ? `${e.resource} ×${q}` : 'used up'), cls: alive ? 'res' : 'res dim' });
      } else if (e.kind === 'quest_board') {
        add(P.box, m4.trs(x - 0.45, y + 0.6, z, 0, 0, 0.1, 1.2, 0.1), [0.42, 0.29, 0.17]);
        add(P.box, m4.trs(x + 0.45, y + 0.6, z, 0, 0, 0.1, 1.2, 0.1), [0.42, 0.29, 0.17]);
        add(P.box, m4.trs(x, y + 0.95, z, 0, 0, 1.15, 0.65, 0.08), [0.6, 0.44, 0.27]);
        add(P.box, m4.trs(x - 0.22, y + 0.98, z + 0.05, 0.05, 0, 0.3, 0.38, 0.02), [0.95, 0.92, 0.8], 0.15);
        add(P.box, m4.trs(x + 0.2, y + 0.92, z + 0.05, -0.08, 0, 0.32, 0.3, 0.02), [0.95, 0.9, 0.75], 0.15);
        add(P.cone, m4.trs(x, y + 1.32, z, 0, 0, 1.35, 0.3, 0.4), [0.55, 0.3, 0.2]);
        add(P.sphere, m4.trs(x, y + 1.95 + 0.12 * Math.sin(t * 3), z, t, 0, 0.22), [1, 0.85, 0.3], 1.4, { cast: false });
        lbl.push({ x, y: y + 2.4, z, text: '📜 Quest board', cls: 'quest' });
      } else if (e.kind === 'structure') {
        if (e.structure === 'campfire') {
          for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; add(P.sphere, m4.trs(x + Math.cos(a) * 0.38, y + 0.05, z + Math.sin(a) * 0.38, a, 0, 0.2, 0.14, 0.2), [0.5, 0.5, 0.52]); }
          for (let i = 0; i < 3; i++) add(P.cyl, m4.trs(x, y + 0.06, z, i * 1.05, 0, 0.11, 0.62, 0.11, Math.PI / 2 - 0.25), [0.35, 0.22, 0.12]);
          for (let i = 0; i < 3; i++) { const f = 0.75 + 0.25 * Math.sin(t * 9 + i * 2); add(P.cone, m4.trs(x + (i - 1) * 0.08, y + 0.1, z + (i % 2) * 0.06, t * (i + 1), 0, 0.32 - i * 0.06, (0.75 - i * 0.15) * f, 0.32 - i * 0.06), [[1, 0.45, 0.1], [1, 0.7, 0.2], [1, 0.95, 0.6]][i], 2.4, { cast: false }); }
          add(P.disk, m4.trs(x, y + 0.03, z, 0, 0, 3.4 + 0.2 * Math.sin(t * 7)), [1, 0.55, 0.2], 1.5, { alpha: 0.2, cast: false });
          lbl.push({ x, y: y + 1.2, z, text: '🔥 Campfire', cls: 'camp' });
        } else {
          add(P.box, m4.trs(x - 0.33, y + 0.5, z, 0, 0, 0.08, 1.15, 1.2, 0.55), [0.62, 0.5, 0.33]);
          add(P.box, m4.trs(x + 0.33, y + 0.5, z, 0, 0, 0.08, 1.15, 1.2, -0.55), [0.58, 0.47, 0.3]);
          add(P.cyl, m4.trs(x, y + 0.97, z - 0.65, 0, Math.PI / 2, 0.08, 1.3, 0.08), [0.4, 0.28, 0.16]);
          lbl.push({ x, y: y + 1.6, z, text: '⛺ Shelter', cls: 'camp' });
        }
      }
    }
    // Lux obelisk beside the starting camp (Strata: Lux Genesis waymarker)
    if (this.obelisk && near(this.obelisk.x, this.obelisk.z)) {
      const o = this.obelisk, oy = groundY(o.x, o.z), glow = 0.8 + 0.4 * Math.sin(t * 1.7);
      add(P.box, m4.trs(o.x, oy + 0.15, o.z, 0.4, 0, 1.3, 0.3, 1.3), [0.32, 0.3, 0.34], 0, { rough: 0.9 });
      for (let k = 0; k < 8; k++) add(P.box, m4.trs(o.x, oy + 0.45 + k * 0.42, o.z, 0.4 + k * 0.05, 0, 0.62 - k * 0.04, 0.4, 0.62 - k * 0.04), STRATA_COLOURS[k], k === 7 ? 0.6 : 0.05, { rough: 0.55 });
      add(P.crystal, m4.trs(o.x, oy + 3.95 + 0.12 * Math.sin(t * 2), o.z, t * 0.6, 0, 0.45, 1.1, 0.45), [1, 0.88, 0.5], 1.6 * glow, { rough: 0.1, cast: false });
      add(P.ring, m4.trs(o.x, oy + 4.3, o.z, -t * 0.8, 0.3, 1.2), [1, 0.85, 0.4], 2, { alpha: 0.5, cast: false });
      add(P.disk, m4.trs(o.x, oy + 0.32, o.z, 0, 0, 3.2), [1, 0.8, 0.4], 1.2 * glow, { alpha: 0.15, cast: false });
      lbl.push({ x: o.x, y: oy + 4.9, z: o.z, text: '✨ Lux obelisk', cls: 'quest' });
    }
    // v9.0 mysticism (MYSTICAL/IN-GAME): the Sallow shrine, gentle spirits at night, planets in the night sky
    const MY = this.mystic;
    if (this.shrine && near(this.shrine.x, this.shrine.z)) {
      const s = this.shrine, sy = groundY(s.x, s.z), pul = 0.7 + 0.3 * Math.sin(t * 1.3);
      add(P.box, m4.trs(s.x, sy + 0.35, s.z, 0.3, 0, 0.55, 0.7, 0.4), [0.55, 0.58, 0.6], 0, { rough: 0.85 });
      add(P.sphere, m4.trs(s.x, sy + 0.95 + 0.06 * Math.sin(t * 2), s.z, t, 0, 0.16), [0.55, 0.95, 1], 1.8 * pul, { cast: false });
      add(P.disk, m4.trs(s.x, sy + 0.04, s.z, 0, 0, 2.2), [0.4, 0.9, 1], 0.9 * pul, { alpha: 0.16, cast: false });
      for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4, wx = s.x + Math.cos(a) * 1.6, wz = s.z + Math.sin(a) * 1.6, wy = groundY(wx, wz);
        add(P.cyl, m4.trs(wx, wy + 0.6, wz, 0, 0, 0.12, 1.2, 0.12), [0.4, 0.3, 0.2]); add(P.cone, m4.trs(wx, wy + 1.45, wz, a, 0, 0.75, 1.1, 0.75), [0.45, 0.65, 0.35], 0, { sway: 1 }); }
      lbl.push({ x: s.x, y: sy + 1.6, z: s.z, text: "⛩️ Sallow 'Healing' stream shrine", cls: 'quest' });
      if (MY && MY.night) for (let i = 0; i < 3 + (MY.full ? 3 : 0); i++) { const a = t * (0.4 + i * 0.07) + i * 2.1, r = 1.2 + 0.5 * Math.sin(t * 0.7 + i);
        add(P.sphere, m4.trs(s.x + Math.cos(a) * r, sy + 1.1 + 0.4 * Math.sin(t * 1.5 + i), s.z + Math.sin(a) * r, 0, 0, 0.09), MY.full ? [0.9, 0.85, 1] : [0.5, 0.85, 1], 3, { cast: false, alpha: 0.85 }); }
    }
    if (MY && MY.night && MY.planets && me && !this.photoHidePlanets) {
      MY.planets.forEach((p, i) => { const a = (p.lon / 360000) * Math.PI * 2; const R = 60;
        add(P.sphere, m4.trs(mx + Math.cos(a) * R, 26 + 6 * Math.sin(a * 2 + i), mz + Math.sin(a) * R, 0, 0, 0.9), p.colour, 4, { cast: false }); });
    }
    // actors
    for (const a of this.actors.values()) {
      if (!near(a.rx, a.rz)) continue;
      if (a.kind === 'player') { if (!(a.me && this.view && this.view.first)) this.humanoid(items, a, lbl); }
      else if (a.alive) this.creature(items, a, lbl);
    }
    if (this.duel) this.duelItems(items, lbl);
    if (me && this.view && this.view.blend > 0.5) this.viewmodel(items, me);
    // effects
    this.effects = this.effects.filter((f) => t - f.t < 0.9);
    for (const f of this.effects) {
      const k = (t - f.t) / 0.9, y = groundY(f.x, f.y);
      const col = f.kind === 'attack' ? [1, 0.4, 0.3] : f.kind === 'gather' ? [0.5, 1, 1] : f.kind === 'heal' ? [0.4, 1, 0.5] : [1, 0.9, 0.4];
      add(P.ring, m4.trs(f.x, y + 0.1 + k * 0.6, f.y, 0, 0, 0.6 + k * 2.2), col, 2, { alpha: 0.7 * (1 - k), cast: false });
      for (let i = 0; i < 6; i++) { const ang = i * 1.05 + f.t; add(P.box, m4.trs(f.x + Math.cos(ang) * k * 1.1, y + 0.4 + k * 1.4 - k * k * 0.8, f.y + Math.sin(ang) * k * 1.1, ang, ang, 0.08 * (1 - k)), col, 2, { cast: false }); }
    }
    // marker and hint arrow
    if (this.marker) {
      const k = clamp((t - this.marker.t) * 3, 0, 1), y = groundY(this.marker.x, this.marker.y);
      add(P.ring, m4.trs(this.marker.x, y + 0.06, this.marker.y, t, 0, 1.3 - 0.4 * k + 0.1 * Math.sin(t * 6)), [1, 0.85, 0.3], 1.5, { alpha: 0.8, cast: false });
    }
    if (this.hintTarget) {
      const h = this.hintTarget, y = groundY(h.x, h.y), b = 0.25 * Math.sin(t * 3.2);
      add(P.cone, m4.trs(h.x, y + 2.4 + b, h.y, t * 1.5, Math.PI, 0.4, 0.55, 0.4), [1, 0.78, 0.2], 1.3, { cast: false });
      add(P.ring, m4.trs(h.x, y + 0.05, h.y, -t, 0, 2.0 + 0.15 * Math.sin(t * 4)), [1, 0.8, 0.25], 1.2, { alpha: 0.55, cast: false });
      // breadcrumb arrows from the player towards the target
      if (me) { const dx = h.x - me.rx, dz = h.y - me.rz, d = Math.hypot(dx, dz);
        if (d > 2.5) { const ux = dx / d, uz = dz / d, ang = Math.atan2(ux, uz);
          for (let i = 1; i <= Math.min(3, Math.floor(d - 1)); i++) { const px = me.rx + ux * (0.9 + i * 0.75), pz = me.rz + uz * (0.9 + i * 0.75), ph = (t * 2 - i * 0.35) % 1;
            add(P.cone, m4.trs(px, groundY(px, pz) + 0.08, pz, ang, Math.PI / 2, 0.32, 0.4, 0.12), [1, 0.82, 0.3], 1.4, { alpha: 0.35 + 0.5 * (1 - ph), cast: false }); } } }
    }
    return items;
  }
  // Room-mates share palette indices (validated server-side); map them through the omniverse palette once it is loaded.
  lookOf(pid) {
    const l = pid && this.remoteLooks?.[pid], ap = this.lookPalette;
    if (!l || !ap) return null;
    return { skin: ap.skin?.[l.skin], hair: ap.hair?.[l.hair], outfit: ap.outfit?.[l.outfit], hat: l.hat, cape: l.cape };
  }
  humanoid(items, a, lbl) {
    const P = this.parts, t = this.time, p = a.data || {};
    const x = a.rx, z = a.rz, y = a.ry, f = a.face;
    const moving = clamp(a.speed / 3, 0, 1), sw = Math.sin(a.walk) * 0.75 * moving, bob = Math.abs(Math.cos(a.walk)) * 0.06 * moving + Math.sin(t * 2) * 0.012;
    const base = m4.trs(x, y + bob, z, f);
    const hue = a.me ? 0.48 : nameHue(a.name);
    const hex = (h) => (typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map((i) => Math.pow(parseInt(h.slice(i, i + 2), 16) / 255, 2.2)) : null);
    const look = a.me ? (this.appearance || null) : this.lookOf(a.pid);
    const tunic = (look && hex(look.outfit)) || (a.me ? [0.12, 0.55, 0.62] : hueRGB(hue, 0.5, 0.45)), trim = a.me ? [0.95, 0.75, 0.25] : hueRGB((hue + 0.5) % 1, 0.4, 0.6);
    const skin = (look && hex(look.skin)) || [0.93, 0.75, 0.6], dark = [0.2, 0.18, 0.22];
    const part = (mesh, local, col, em = 0, extra = {}) => items.push({ mesh, m: m4.mul(base, local), tint: col, em, ...extra });
    // anim offsets
    let armSwing = sw, armR = -sw, lean = 0, crouch = 0;
    const dp = a.me && this.duel ? this.duelPose() : null;
    if (dp) { armR = dp.armR; lean = dp.lean; crouch = dp.crouch; }
    else if (a.anim) { const k = (t - a.anim.t) / 0.45; if (k > 1) a.anim = null; else if (a.anim.kind === 'attack') { armR = -2.4 + Math.sin(k * Math.PI) * 3.2; lean = Math.sin(k * Math.PI) * 0.2; } else { crouch = Math.sin(k * Math.PI) * 0.18; armSwing = armR = -1.2 * Math.sin(k * Math.PI); lean = 0.35 * Math.sin(k * Math.PI); } }
    const hip = 0.62 - crouch;
    part(P.limb, m4.trs(-0.12, hip, 0, 0, sw, 0.15, hip, 0.17), dark);
    part(P.limb, m4.trs(0.12, hip, 0, 0, -sw, 0.15, hip, 0.17), dark);
    const body = m4.mul(m4.trs(0, hip, 0, 0, lean), m4.ident());
    const bpart = (mesh, local, col, em = 0) => items.push({ mesh, m: m4.mul(base, m4.mul(body, local)), tint: col, em });
    bpart(P.box, m4.trs(0, 0.25, 0, 0, 0, 0.44, 0.52, 0.26), tunic);
    bpart(P.box, m4.trs(0, 0.03, 0, 0, 0, 0.47, 0.09, 0.29), trim);
    bpart(P.box, m4.trs(0, 0.3, -0.14, 0, 0.1, 0.42, 0.55, 0.04), a.me ? [0.75, 0.2, 0.2] : tunic.map((v) => v * 0.7)); // cape
    bpart(P.box, m4.trs(0, 0.72, 0, 0, 0, 0.3, 0.3, 0.3), skin);
    bpart(P.box, m4.trs(0, 0.86, -0.02, 0, 0, 0.33, 0.1, 0.34), a.me ? [0.35, 0.22, 0.12] : hueRGB(nameHue(a.name + 'h'), 0.4, 0.3));
    bpart(P.box, m4.trs(-0.07, 0.74, 0.151, 0, 0, 0.05, 0.05, 0.01), dark); bpart(P.box, m4.trs(0.07, 0.74, 0.151, 0, 0, 0.05, 0.05, 0.01), dark);
    part(P.box, m4.trs(-0.12, 0.06, 0.03, 0, sw * 0.6, 0.17, 0.12, 0.24), [0.28, 0.18, 0.1], 0, { rough: 0.6 }); // boots
    part(P.box, m4.trs(0.12, 0.06, 0.03, 0, -sw * 0.6, 0.17, 0.12, 0.24), [0.28, 0.18, 0.1], 0, { rough: 0.6 });
    bpart(P.box, m4.trs(0, 0.03, 0.15, 0, 0, 0.09, 0.07, 0.02), [0.95, 0.8, 0.3], 0.2); // buckle
    bpart(P.box, m4.trs(-0.27, 0.5, 0, 0, 0, 0.16, 0.08, 0.3), trim); bpart(P.box, m4.trs(0.27, 0.5, 0, 0, 0, 0.16, 0.08, 0.3), trim); // shoulder pads
    bpart(P.box, m4.trs(0, 0.82, 0.13, 0, 0, 0.32, 0.06, 0.06), (look && hex(look.hair)) || (a.me ? [0.35, 0.22, 0.12] : hueRGB(nameHue(a.name + 'h'), 0.4, 0.3))); // fringe
    if (look?.hat === 1) bpart(P.box, m4.trs(0, 0.86, -0.02, 0, 0, 0.4, 0.2, 0.38), tunic.map((v) => v * 0.7)); // hood
    if (look?.hat === 2) for (let k = 0; k < 6; k++) bpart(P.box, m4.trs(Math.cos(k * 1.05) * 0.18, 0.9, Math.sin(k * 1.05) * 0.18, k, 0, 0.08, 0.05, 0.12), [0.3, 0.7, 0.3]); // leaf crown
    if (look?.hat === 3) { bpart(P.box, m4.trs(0, 0.9, 0, 0, 0, 0.5, 0.03, 0.5), [0.55, 0.4, 0.2]); bpart(P.box, m4.trs(0, 0.98, 0, 0, 0, 0.3, 0.14, 0.3), [0.55, 0.4, 0.2]); } // explorer
    if (look?.hat === 4) { bpart(P.box, m4.trs(0, 0.9, 0, 0, 0, 0.46, 0.04, 0.46), [0.28, 0.2, 0.6]); bpart(P.crystal || P.box, m4.trs(0, 1.08, 0, 0, 0, 0.22, 0.42, 0.22), [0.3, 0.22, 0.65], 0.1); } // wizard hat (make-believe)
    if (look?.cape) bpart(P.box, m4.trs(0, look.cape === 1 ? 0.42 : 0.3, -0.17, 0, 0, 0.42, look.cape === 1 ? 0.3 : 0.55, 0.03), look.cape === 3 ? [1, 0.8, 0.35] : [0.5, 0.12, 0.18], look.cape === 3 ? 0.5 : 0); // cape
    bpart(P.box, m4.trs(0, 0.68, 0.16, 0, 0, 0.05, 0.06, 0.04), skin.map((v) => v * 0.9)); // nose
    if (a.me) { bpart(P.box, m4.trs(0, 0.28, -0.2, 0, 0, 0.3, 0.36, 0.14), [0.45, 0.32, 0.18]); bpart(P.box, m4.trs(0, 0.46, -0.27, 0, 0, 0.32, 0.06, 0.04), [0.3, 0.2, 0.1]); } // backpack
    bpart(P.limb, m4.trs(-0.29, 0.48, 0, 0, armSwing, 0.12, 0.46, 0.13), tunic.map((v) => v * 0.9));
    bpart(P.box, m4.mul(m4.trs(-0.29, 0.48, 0, 0, armSwing), m4.trs(0, -0.5, 0, 0, 0, 0.11)), skin); // left hand
    const armM = m4.trs(0.29, 0.48, 0, 0, armR, 0.12, 0.46, 0.13);
    bpart(P.limb, armM, tunic.map((v) => v * 0.9));
    // sword in right hand
    const weapon = p.equipment?.weapon || 'traveller_blade';
    const blade = weapon === 'crystal_sabre' ? [0.4, 0.95, 1] : weapon === 'stone_edge' ? [0.6, 0.58, 0.55] : [0.82, 0.85, 0.9];
    const hand = m4.mul(m4.trs(0.29, 0.48, 0, 0, armR), m4.trs(0, -0.45, 0.06, 0, Math.PI / 2 - 0.2));
    items.push({ mesh: P.box, m: m4.mul(base, m4.mul(body, m4.mul(hand, m4.trs(0, 0.32, 0, 0, 0, 0.05, weapon === 'stone_edge' ? 0.6 : 0.68, weapon === 'stone_edge' ? 0.1 : 0.06)))), tint: blade, em: weapon === 'crystal_sabre' ? 0.9 : 0.05, rough: weapon === 'stone_edge' ? 0.8 : 0.25, metal: weapon === 'stone_edge' ? 0 : 1 });
    items.push({ mesh: P.box, m: m4.mul(base, m4.mul(body, m4.mul(hand, m4.trs(0, 0, 0, 0, 0, 0.18, 0.04, 0.06)))), tint: [0.6, 0.45, 0.2] });
    if (a.me) items.push({ mesh: P.ring, m: m4.trs(x, y + 0.04, z, t * 0.6, 0, 1.1), tint: [0.3, 0.9, 1], em: 1, alpha: 0.45, cast: false });
    if (a.me && this.cosmetics?.has('cos_aura')) for (let k = 0; k < 3; k++) items.push({ mesh: P.ring, m: m4.trs(x, y + 0.5 + k * 0.45 + 0.08 * Math.sin(t * 2 + k), z, t * (0.8 + k * 0.3), 0, 0.55 - k * 0.08), tint: [1, 0.85, 0.4], em: 2, alpha: 0.35, cast: false }); // Lux aura (reward)
    if (a.me && this.cosmetics?.has('cos_prism_cape')) items.push({ mesh: P.box, m: m4.mul(base, m4.trs(0, hip + 0.32, -0.18, 0, 0.12, 0.46, 0.62, 0.03)), tint: hueRGB((t * 0.1) % 1, 0.7, 0.6), em: 0.8 }); // Prism mantle (reward)
    if (this.quality === 0) items.push({ mesh: P.disk, m: m4.trs(x, y + 0.03, z, 0, 0, 0.8), tint: [0, 0, 0], alpha: 0.35, cast: false });
    lbl.push({ x, y: y + 1.75, z, text: (a.me ? '⭐ ' : '') + a.name, cls: a.me ? 'me' : 'player', hp: (p.health ?? 100) / (p.max_health || 100) });
  }
  // ----- v9.0 duel presentation -----
  duelPose() {
    const S = this.duel?.S; if (!S) return null;
    const P = S.P, k = P.dur ? P.pt / P.dur : 0, mv = P.move || {};
    const heavy = mv.kind === 'heavy' || mv.kind === 'finisher' || mv.kind === 'special';
    if (P.phase === 'windup') return { armR: -1.2 - k * (heavy ? 1.9 : 1.3), lean: -0.08 * k, crouch: heavy ? 0.08 * k : 0 };
    if (P.phase === 'active') return { armR: 0.9, lean: 0.22, crouch: 0.04 };
    if (P.phase === 'recovery') return { armR: 0.9 - 1.0 * k, lean: 0.22 * (1 - k), crouch: 0 };
    if (P.phase === 'dodge') return { armR: -0.5, lean: 0.3, crouch: 0.3 * Math.sin(k * Math.PI) };
    if (P.phase === 'stun') return { armR: -0.3, lean: -0.25, crouch: 0.05 };
    if (P.blocking) return { armR: -1.6, lean: -0.06, crouch: 0.06 };
    return { armR: -0.5 + Math.sin(this.time * 3) * 0.05, lean: 0.04, crouch: 0.04 };
  }
  duelGeom() {
    const d = this.duel, m = this.me(); if (!d || !m || !d.S) return null;
    const dist = d.S.dist / 10, f = d.face ?? m.face;
    let ex = m.rx + Math.sin(f) * dist, ez = m.rz + Math.cos(f) * dist;
    if (d.S.E.phase === 'sidestep') { const s = Math.sin((d.S.E.pt / 6) * Math.PI) * 0.9; ex += Math.cos(f) * s; ez -= Math.sin(f) * s; }
    return { ex, ez, ey: groundY(ex, ez), f, m };
  }
  duelItems(items, lbl) {
    const g = this.duelGeom(); if (!g) return;
    const P = this.parts, t = this.time, S = this.duel.S, E = S.E, m = g.m;
    m.face = g.f; // keep facing the foe
    const a = this.duel.enemyId ? this.actors.get('c:' + this.duel.enemyId) : null;
    const k = E.dur ? E.pt / E.dur : 0, heavyWind = E.phase === 'windup' && E.move && E.move.kind === 'heavy';
    const lunge = E.phase === 'active' ? 0.35 : E.phase === 'windup' ? -0.12 * k : 0;
    const ex = g.ex - Math.sin(g.f) * lunge, ez = g.ez - Math.cos(g.f) * lunge;
    if (a) { a.rx = ex; a.rz = ez; a.ry = groundY(ex, ez); a.face = g.f + Math.PI; a.speed = E.phase === 'active' ? 2 : 0; }
    else { // practice golem (make-believe Lux construct)
      const base = m4.trs(ex, g.ey, ez, g.f + Math.PI), stone = [0.5, 0.48, 0.55], glow = 0.6 + 0.4 * Math.sin(t * 3);
      const part = (mesh, l, c, em = 0) => items.push({ mesh, m: m4.mul(base, l), tint: c, em });
      part(P.box, m4.trs(0, 1.0 - (E.phase === 'stun' ? 0.1 : 0), 0, 0, E.phase === 'windup' ? -0.2 * k : 0, 0.8, 0.9, 0.5), stone);
      part(P.box, m4.trs(0, 1.72, 0.02, 0, 0, 0.46, 0.4, 0.42), stone);
      part(P.box, m4.trs(0, 1.75, 0.22, 0, 0, 0.3, 0.07, 0.02), [1, 0.85, 0.4], 2 * glow);
      for (const sd of [-1, 1]) {
        const swing = E.phase === 'windup' ? -1.4 * k : E.phase === 'active' ? 1.0 : 0;
        part(P.box, m4.mul(m4.trs(0.55 * sd, 1.35, 0, 0, swing), m4.trs(0, -0.35, 0, 0, 0, 0.24, 0.75, 0.26)), stone);
        part(P.box, m4.trs(0.2 * sd, 0.3, 0, 0, 0, 0.26, 0.6, 0.3), stone);
      }
      part(P.crystal || P.box, m4.trs(0, 1.05, 0.27, t, 0, 0.16, 0.26, 0.16), [0.6, 0.9, 1], 1.4 * glow);
      lbl.push({ x: ex, y: g.ey + 2.3, z: ez, text: '🗿 ' + (this.duel.name || 'Practice golem'), cls: 'foe', hp: E.hp / E.hpmax });
    }
    // telegraphs: heavy wind-ups glow orange, guards show a blue shield, stuns show circling stars
    if (heavyWind) items.push({ mesh: P.ring, m: m4.trs(ex, g.ey + 0.08, ez, t * 4, 0, 0.9 + k * 0.6), tint: [1, 0.55, 0.2], em: 2.5, alpha: 0.4 + 0.5 * k, cast: false });
    else if (E.phase === 'windup') items.push({ mesh: P.ring, m: m4.trs(ex, g.ey + 0.08, ez, t * 3, 0, 0.8), tint: [1, 0.9, 0.5], em: 1.4, alpha: 0.35, cast: false });
    if (E.phase === 'guard') items.push({ mesh: P.disk, m: m4.mul(m4.trs(ex - Math.sin(g.f) * 0.5, g.ey + 0.9, ez - Math.cos(g.f) * 0.5, g.f), m4.trs(0, 0, 0, 0, Math.PI / 2, 0.75)), tint: [0.45, 0.75, 1], em: 1.5, alpha: 0.35, cast: false });
    if (E.phase === 'stun') for (let i = 0; i < 4; i++) { const an = t * 5 + i * 1.57; items.push({ mesh: P.crystal || P.box, m: m4.trs(ex + Math.cos(an) * 0.45, g.ey + 1.9, ez + Math.sin(an) * 0.45, an, 0, 0.07), tint: [1, 0.95, 0.5], em: 2, cast: false }); }
    if (S.P.blocking && !this.firstPerson) items.push({ mesh: P.disk, m: m4.mul(m4.trs(m.rx + Math.sin(g.f) * 0.45, m.ry + 0.95, m.rz + Math.cos(g.f) * 0.45, g.f), m4.trs(0, 0, 0, 0, Math.PI / 2, 0.55)), tint: [0.5, 0.9, 1], em: 1.2, alpha: 0.28, cast: false });
    this.duel.enemyPos = [ex, g.ey + 1.0, ez];
  }
  // first-person hands + weapon, built in camera space (head bob, sway, attack/block poses)
  viewmodel(items, me) {
    const V = this.view, P = this.parts, t = this.time; if (!V) return;
    const f = [V.look[0] - V.eye[0], V.look[1] - V.eye[1], V.look[2] - V.eye[2]], fl = Math.hypot(...f); f[0] /= fl; f[1] /= fl; f[2] /= fl;
    let r = [f[2], 0, -f[0]]; const rl = Math.hypot(...r) || 1; r = r.map((v) => -v / rl);
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const cam = new Float32Array([r[0], r[1], r[2], 0, u[0], u[1], u[2], 0, -f[0], -f[1], -f[2], 0, V.eye[0], V.eye[1], V.eye[2], 1]);
    const dp = this.duel ? this.duelPose() : null, an = me.anim && !dp ? clamp((t - me.anim.t) / 0.45, 0, 1) : 0;
    const sway = Math.sin(t * 1.6) * 0.006 + V.bob * 0.5, mv = clamp(me.speed / 3, 0, 1);
    let rx = 0.26, ry = -0.24 + sway, rz = -0.48, rot = -0.35, roll = 0.25;
    if (dp) { rot = -0.35 + (dp.armR + 0.5) * 0.55; roll = 0.25 + dp.lean; rz -= dp.lean * 0.3; if (this.duel.S.P.blocking) { rx = 0.08; ry = -0.12; roll = 1.35; } if (this.duel.S.P.phase === 'dodge') ry -= 0.08; }
    else if (an) { rot = -0.35 - Math.sin(an * Math.PI) * 1.6; rx -= Math.sin(an * Math.PI) * 0.15; }
    ry += Math.abs(Math.sin(me.walk)) * 0.02 * mv;
    const look = this.appearance, hex = (h) => (typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map((i) => Math.pow(parseInt(h.slice(i, i + 2), 16) / 255, 2.2)) : null);
    const skin = (look && hex(look.skin)) || [0.93, 0.75, 0.6], sleeve = (look && hex(look.outfit)) || [0.12, 0.55, 0.62];
    const add = (mesh, local, tint, em = 0, extra = {}) => items.push({ mesh, m: m4.mul(cam, local), tint, em, cast: false, ...extra });
    const hand = m4.mul(m4.trs(rx, ry, rz, 0.15, rot, 1, 1, 1, roll), m4.ident());
    add(P.box, m4.mul(hand, m4.trs(0, -0.02, 0.16, 0, 0, 0.08, 0.08, 0.26)), sleeve.map((v) => v * 0.9)); // forearm
    add(P.box, m4.mul(hand, m4.trs(0, 0, 0, 0, 0, 0.075, 0.07, 0.08)), skin); // fist
    const weapon = (this.duel && this.duel.weapon) || me.data?.equipment?.weapon || 'traveller_blade';
    if (weapon !== 'fists') {
      const blade = weapon === 'crystal_sabre' ? [0.4, 0.95, 1] : weapon === 'stone_edge' ? [0.6, 0.58, 0.55] : [0.82, 0.85, 0.9];
      add(P.box, m4.mul(hand, m4.trs(0, 0.0, 0, 0, 0, 0.16, 0.03, 0.04)), [0.6, 0.45, 0.2]); // guard
      add(P.box, m4.mul(hand, m4.trs(0, 0.32, -0.02, 0, 0, 0.035, weapon === 'stone_edge' ? 0.55 : 0.62, weapon === 'stone_edge' ? 0.08 : 0.045)), blade, weapon === 'crystal_sabre' ? 1.1 : 0.08, { rough: weapon === 'stone_edge' ? 0.8 : 0.2, metal: weapon === 'stone_edge' ? 0 : 1 });
    }
    add(P.box, m4.trs(-0.3, -0.3 + sway * 0.7, -0.5, -0.2, -0.3, 0.075, 0.07, 0.08), skin); // off hand
    add(P.box, m4.trs(-0.3, -0.33 + sway * 0.7, -0.36, -0.2, -0.3, 0.08, 0.08, 0.24), sleeve.map((v) => v * 0.9));
    this.vmCam = cam;
  }
  creature(items, a, lbl) {
    const P = this.parts, t = this.time, c = a.data || {};
    const x = a.rx, z = a.rz, y = a.ry, f = a.face;
    const moving = clamp(a.speed / 2, 0, 1), sw = Math.sin(a.walk * 1.3) * 0.6 * moving;
    const base = m4.trs(x, y, z, f);
    const part = (mesh, local, col, em = 0) => items.push({ mesh, m: m4.mul(base, local), tint: col, em });
    if (a.kind === 'wolf') {
      const fur = [0.36, 0.42, 0.33], darkf = [0.25, 0.3, 0.23], breathe = 1 + Math.sin(t * 3 + x) * 0.03;
      part(P.box, m4.trs(0, 0.55, 0, 0, 0, 0.42 * breathe, 0.4 * breathe, 0.95), fur);
      part(P.box, m4.trs(0, 0.75, 0.55, 0, -0.15 + Math.sin(t * 2) * 0.05, 0.36, 0.34, 0.38), fur);
      part(P.box, m4.trs(0, 0.68, 0.82, 0, 0, 0.2, 0.17, 0.25), darkf);
      part(P.cone, m4.trs(-0.11, 0.9, 0.52, 0, 0, 0.12, 0.2, 0.08), darkf); part(P.cone, m4.trs(0.11, 0.9, 0.52, 0, 0, 0.12, 0.2, 0.08), darkf);
      part(P.box, m4.trs(-0.09, 0.8, 0.745, 0, 0, 0.06, 0.05, 0.01), [1, 0.25, 0.15], 2); part(P.box, m4.trs(0.09, 0.8, 0.745, 0, 0, 0.06, 0.05, 0.01), [1, 0.25, 0.15], 2);
      part(P.box, m4.trs(0, 0.78, 0.3, 0, 0.2, 0.48, 0.32, 0.3), fur.map((v) => v * 0.85)); // mane
      part(P.box, m4.trs(0, 0.36, 0.05, 0, 0, 0.32, 0.08, 0.8), fur.map((v) => v * 1.15)); // pale belly
      part(P.limb, m4.trs(0, 0.66, -0.47, 0, -0.9 + Math.sin(t * 6) * 0.2 * (1 - moving), 0.1, 0.5, 0.1, Math.sin(t * 5) * 0.4), darkf);
      for (const [lx, lz, ph] of [[-0.14, 0.33, 0], [0.14, 0.33, Math.PI], [-0.14, -0.33, Math.PI], [0.14, -0.33, 0]]) part(P.limb, m4.trs(lx, 0.42, lz, 0, Math.sin(a.walk * 1.3 + ph) * 0.6 * moving, 0.1, 0.42, 0.1), darkf);
    } else {
      const coat = [0.86, 0.86, 0.9], legc = [0.7, 0.68, 0.72];
      part(P.box, m4.trs(0, 0.8, 0, 0, 0, 0.36, 0.38, 0.8), coat);
      part(P.box, m4.trs(0, 1.05, 0.42, 0, -0.6, 0.18, 0.5, 0.2), coat);
      part(P.box, m4.trs(0, 1.3, 0.6, 0, 0.2 + Math.sin(t * 1.3) * 0.15, 0.2, 0.2, 0.32), coat);
      for (const s of [-1, 1]) { part(P.box, m4.trs(0.1 * s, 1.55, 0.56, 0, 0, 0.03, 0.32, 0.03, 0.4 * s), [0.95, 0.9, 0.7], 0.4); part(P.box, m4.trs(0.2 * s, 1.68, 0.56, 0, 0, 0.03, 0.18, 0.03, 1.1 * s), [0.95, 0.9, 0.7], 0.4); }
      for (const [lx, lz, ph] of [[-0.12, 0.3, 0], [0.12, 0.3, Math.PI], [-0.12, -0.3, Math.PI], [0.12, -0.3, 0]]) part(P.limb, m4.trs(lx, 0.65, lz, 0, Math.sin(a.walk * 1.3 + ph) * 0.6 * moving, 0.08, 0.65, 0.08), legc);
      items.push({ mesh: P.disk, m: m4.trs(x, y + 0.03, z, 0, 0, 1.4), tint: [0.8, 0.85, 1], em: 1, alpha: 0.12, cast: false });
    }
    if (this.quality === 0) items.push({ mesh: P.disk, m: m4.trs(x, y + 0.03, z, 0, 0, 1.0), tint: [0, 0, 0], alpha: 0.35, cast: false });
    lbl.push({ x, y: y + (a.kind === 'wolf' ? 1.35 : 1.95), z, text: (a.kind === 'wolf' ? '🐺 ' : '🦌 ') + a.name, cls: c.hostile ? 'foe' : 'friend', hp: (c.health ?? 1) / (c.max_health || 1) });
  }
}
