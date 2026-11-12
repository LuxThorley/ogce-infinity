// OGCE v8.3 3D renderer (WebGL1, no libraries).
// Grown from the v7.7 OGCE3D renderer (same orbit camera, procedural terrain wave, cube/cone builders,
// fog-to-sky idea) and rebuilt for quality and speed: static GPU meshes built once, sun + sky lighting,
// real-time shadow maps, animated water, sky with sun/stars/clouds, wind-swayed forests, animated
// characters and creatures, smooth movement, click picking and adaptive quality.
import { m4 } from './gl-math.js';
import { height, groundY, groundColor, slope, scatterProps, skyState, WATER_LEVEL } from './world3d.js';

const STRIDE = 10; // pos3 normal3 color3 sway1
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const angDamp = (a, b, k, dt) => { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * (1 - Math.exp(-k * dt)); };
const hueRGB = (h, s = 0.55, l = 0.5) => { const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };
const nameHue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 997; return h / 997; };

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

// ---------- shaders ----------
const LIT_VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute float aSway;
uniform mat4 uVP, uModel, uLightVP; uniform float uTime, uWind;
varying vec3 vNor, vCol, vWorld; varying vec4 vLight;
void main(){
  vec4 w = uModel * vec4(aPos,1.0);
  float ph = uTime*1.6 + w.x*0.35 + w.z*0.27;
  w.x += sin(ph)*aSway*uWind*0.12; w.z += cos(ph*0.8)*aSway*uWind*0.07;
  vWorld = w.xyz; vNor = normalize(mat3(uModel) * aNor); vCol = aCol;
  vLight = uLightVP * w;
  gl_Position = uVP * w;
}`;
const LIT_FS = `
precision PREC float;
varying vec3 vNor, vCol, vWorld; varying vec4 vLight;
uniform vec3 uSunDir, uSunCol, uSkyAmb, uGroundAmb, uFogCol, uCam, uTint;
uniform float uFog, uEmissive, uAlpha, uShadowOn, uTexel, uTime;
uniform sampler2D uShadow;
float unpack(vec4 c){ return dot(c, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0)); }
float shadowAt(vec2 uv, float z){ return z - 0.0025 > unpack(texture2D(uShadow, uv)) ? 0.0 : 1.0; }
void main(){
  vec3 n = normalize(vNor);
  if(!gl_FrontFacing) n = -n;
  float nd = dot(n, uSunDir);
  float sh = 1.0;
  if (uShadowOn > 0.5) {
    vec3 p = vLight.xyz / vLight.w * 0.5 + 0.5;
    if (p.x > 0.0 && p.x < 1.0 && p.y > 0.0 && p.y < 1.0 && p.z < 1.0) {
      float t = uTexel; sh = 0.0;
      sh += shadowAt(p.xy + vec2(-t,-t), p.z); sh += shadowAt(p.xy + vec2(t,-t), p.z);
      sh += shadowAt(p.xy + vec2(-t,t), p.z);  sh += shadowAt(p.xy + vec2(t,t), p.z);
      sh *= 0.25;
      vec2 e = smoothstep(0.0, 0.08, p.xy) * smoothstep(1.0, 0.92, p.xy); sh = mix(1.0, sh, e.x*e.y);
    }
  }
  vec3 albedo = vCol * uTint;
  vec3 amb = mix(uGroundAmb, uSkyAmb, n.y*0.5+0.5);
  vec3 v = normalize(uCam - vWorld);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.18;
  vec3 col = albedo * (amb + uSunCol * max(nd, 0.0) * sh) + rim * uSkyAmb * 0.6 + albedo * uEmissive;
  float d = length(uCam - vWorld);
  float f = 1.0 - exp(-pow(d * uFog, 2.0));
  col = mix(col, uFogCol, clamp(f, 0.0, 1.0));
  gl_FragColor = vec4(col, uAlpha);
}`;
const DEPTH_VS = `
attribute vec3 aPos; attribute float aSway; uniform mat4 uLightVP, uModel; uniform float uTime, uWind; varying float vZ;
void main(){ vec4 w = uModel * vec4(aPos,1.0); float ph = uTime*1.6 + w.x*0.35 + w.z*0.27;
  w.x += sin(ph)*aSway*uWind*0.12; w.z += cos(ph*0.8)*aSway*uWind*0.07;
  vec4 p = uLightVP * w; vZ = p.z / p.w * 0.5 + 0.5; gl_Position = p; }`;
const DEPTH_FS = `
precision PREC float; varying float vZ;
vec4 pack(float d){ vec4 e = vec4(1.0, 255.0, 65025.0, 16581375.0) * d; e = fract(e); e -= e.yzww * vec4(1.0/255.0,1.0/255.0,1.0/255.0,0.0); return e; }
void main(){ gl_FragColor = pack(clamp(vZ, 0.0, 0.9999)); }`;
const SKY_VS = `attribute vec2 aPos; varying vec2 vP; void main(){ vP = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }`;
const SKY_FS = `
precision PREC float; varying vec2 vP;
uniform mat4 uInvVP; uniform vec3 uCam, uSunDir, uZenith, uHorizon, uSunCol; uniform float uTime, uDay, uCloud;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n2(p); p=p*2.03+7.1; a*=0.5; } return s; }
void main(){
  vec4 w = uInvVP * vec4(vP, 1.0, 1.0); vec3 dir = normalize(w.xyz / w.w - uCam);
  float y = dir.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), 0.55));
  if (y < 0.0) col = mix(uHorizon, uHorizon*0.75, clamp(-y*4.0, 0.0, 1.0));
  float sd = max(dot(dir, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.25) * smoothstep(-0.05, 0.05, uSunDir.y);
  vec3 md = -uSunDir; float m = max(dot(dir, md), 0.0);
  col += vec3(0.75,0.8,0.95) * pow(m, 2000.0) * 3.0 * (1.0 - uDay);
  if (y > 0.0) {
    vec3 sp = floor(dir * 260.0); float st = h(sp.xy + sp.z*13.1);
    col += vec3(1.0) * step(0.9965, st) * (1.0 - uDay) * (0.6 + 0.4*sin(uTime*3.0 + st*90.0)) * smoothstep(0.0, 0.2, y);
    vec2 uv = dir.xz / (y + 0.12) * 0.9 + vec2(uTime*0.006, uTime*0.002);
    float c = smoothstep(1.0 - uCloud*0.75, 1.15 - uCloud*0.5, fbm(uv*1.4)+0.2);
    vec3 cc = mix(vec3(0.25,0.27,0.35), vec3(1.0,0.98,0.95), uDay) * (0.75 + 0.35*pow(sd,4.0));
    col = mix(col, cc, c * smoothstep(0.0, 0.18, y) * 0.9);
  }
  gl_FragColor = vec4(col, 1.0);
}`;
const WATER_VS = `attribute vec2 aPos; uniform mat4 uVP; uniform float uLevel; varying vec3 vW; void main(){ vW = vec3(aPos.x, uLevel, aPos.y); gl_Position = uVP * vec4(vW,1.0); }`;
const WATER_FS = `
precision PREC float; varying vec3 vW;
uniform vec3 uCam, uSunDir, uSunCol, uZenith, uHorizon, uFogCol; uniform float uTime, uFog, uDay;
void main(){
  vec2 p = vW.xz; float t = uTime;
  vec2 g = vec2(0.0);
  g += vec2(0.8,0.6) * cos(dot(p, vec2(0.8,0.6))*1.3 + t*1.6) * 0.10;
  g += vec2(-0.5,0.85) * cos(dot(p, vec2(-0.5,0.85))*2.1 + t*2.0) * 0.06;
  g += vec2(0.95,-0.3) * cos(dot(p, vec2(0.95,-0.3))*3.7 + t*2.7) * 0.035;
  g += vec2(0.2,0.98) * cos(dot(p, vec2(0.2,0.98))*6.3 + t*3.4) * 0.02;
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 v = normalize(uCam - vW);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(r.y,0.0,1.0),0.5));
  vec3 deep = mix(vec3(0.02,0.07,0.12), vec3(0.05,0.28,0.36), uDay);
  vec3 col = mix(deep, sky, clamp(fres, 0.0, 1.0));
  col += uSunCol * pow(max(dot(r, uSunDir), 0.0), 180.0) * 2.5;
  float d = length(uCam - vW); float f = 1.0 - exp(-pow(d * uFog, 2.0));
  col = mix(col, uFogCol, clamp(f,0.0,1.0));
  gl_FragColor = vec4(col, mix(0.78, 0.95, fres));
}`;
const LINE_VS = `attribute vec3 aPos; uniform mat4 uVP; void main(){ gl_Position = uVP * vec4(aPos,1.0); }`;
const LINE_FS = `precision PREC float; uniform vec4 uColor; void main(){ gl_FragColor = uColor; }`;

// ---------- renderer ----------
export class OGCE3D {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserveDrawingBuffer })
      || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    this.prec = hp && hp.precision > 0 ? 'highp' : 'mediump';
    this.cam = { yaw: opts.yaw ?? Math.PI + 0.62, pitch: 0.62, dist: 13, tYaw: opts.yaw ?? Math.PI + 0.62, tPitch: 0.62, tDist: 13, target: [2, 0, 2] };
    this.time = 0; this.last = 0; this.state = null; this.playerId = null; this.seedKey = null;
    this.actors = new Map(); this.effects = []; this.marker = null; this.hintTarget = null; this.labels = [];
    this.quality = opts.quality ?? (matchMedia?.('(pointer: coarse)').matches ? 1 : 2); this.qualityLocked = false;
    this.frameMs = 16; this.slowFor = 0; this.fastFor = 0; this.lastDowngrade = -1e9; this.drawCalls = 0; this.fps = 60;
    this.onFrame = opts.onFrame || null;
    this.init();
    this.loop = this.loop.bind(this);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.init(); this.seedKey = null; });
    requestAnimationFrame(this.loop);
  }

  // ----- setup -----
  program(vs, fs) {
    const gl = this.gl, mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s.replace(/PREC/g, this.prec)); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
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
    this.lit = this.program(LIT_VS, LIT_FS); this.depth = this.program(DEPTH_VS, DEPTH_FS);
    this.sky = this.program(SKY_VS, SKY_FS); this.water = this.program(WATER_VS, WATER_FS); this.line = this.program(LINE_VS, LINE_FS);
    this.quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const W = 420; this.waterBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.waterBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-W + 32, -W + 32, W + 32, -W + 32, W + 32, W + 32, -W + 32, -W + 32, W + 32, W + 32, -W + 32, W + 32]), gl.STATIC_DRAW);
    this.rainBuf = gl.createBuffer();
    // unit parts for animated models
    const I = m4.ident(), g = (f) => { const G = new Geo(); f(G); return this.mesh(G); };
    this.parts = {
      box: g((G) => G.box(I, [1, 1, 1], 0, false)),
      limb: g((G) => G.box(m4.trs(0, -0.5, 0), [1, 1, 1], 0, false)),
      cone: g((G) => G.cone(I, [1, 1, 1], 8)),
      sphere: g((G) => G.ico(I, [1, 1, 1], 1)),
      crystal: g((G) => G.crystal(I, [1, 1, 1])),
      ring: g((G) => G.ring(0.42, 0.5, 28, [1, 1, 1])),
      disk: g((G) => G.disk(0.5, 20, [1, 1, 1])),
      cyl: g((G) => G.cyl(I, [1, 1, 1], 8)),
    };
    this.initShadow(this.quality >= 2 ? 2048 : 1024);
  }
  initShadow(size) {
    const gl = this.gl;
    if (this.shadowFbo) { gl.deleteFramebuffer(this.shadowFbo); gl.deleteTexture(this.shadowTex); gl.deleteRenderbuffer(this.shadowRb); }
    this.shadowSize = size;
    this.shadowTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowRb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, this.shadowRb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
    this.shadowFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.shadowRb);
    this.shadowOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  setQuality(q, locked = false) {
    q = clamp(q | 0, 0, 2); this.qualityLocked = locked;
    if (q === this.quality) return; this.quality = q;
    if (q > 0) this.initShadow(q >= 2 ? 2048 : 1024);
  }

  // ----- static world (built once per world) -----
  buildStatic(state) {
    const keep = [{ x: 2, y: 2 }, ...(state.entities || []), ...(state.creatures || [])];
    const T = new Geo(), STEP = 1, X0 = -34, X1 = 98;
    const N = Math.round((X1 - X0) / STEP) + 1, H = new Float32Array(N * N), NOR = new Array(N * N), COL = new Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = X0 + i * STEP, z = X0 + j * STEP; H[j * N + i] = height(x, z); }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const hL = H[j * N + Math.max(0, i - 1)], hR = H[j * N + Math.min(N - 1, i + 1)], hD = H[Math.max(0, j - 1) * N + i], hU = H[Math.min(N - 1, j + 1) * N + i];
      const nx = (hL - hR) / (2 * STEP), nz = (hD - hU) / (2 * STEP), l = Math.hypot(nx, 1, nz);
      NOR[j * N + i] = [nx / l, 1 / l, nz / l];
      const x = X0 + i * STEP, z = X0 + j * STEP; COL[j * N + i] = groundColor(x, z, H[j * N + i], Math.hypot(nx, nz));
    }
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const id = [j * N + i, j * N + i + 1, (j + 1) * N + i + 1, (j + 1) * N + i];
      const P = id.map((k) => [X0 + (k % N) * STEP, H[k], X0 + Math.floor(k / N) * STEP]);
      if (P.every((p) => p[1] < WATER_LEVEL - 1.2)) continue; // deep sea floor never visible
      T.triN([P[0], P[2], P[1]], [NOR[id[0]], NOR[id[2]], NOR[id[1]]], [COL[id[0]], COL[id[2]], COL[id[1]]]);
      T.triN([P[0], P[3], P[2]], [NOR[id[0]], NOR[id[3]], NOR[id[2]]], [COL[id[0]], COL[id[3]], COL[id[2]]]);
    }
    // forests, rocks, flowers
    const props = scatterProps(state.world_id || 'Aurelia', keep);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const p of props) {
      const { x, z, s, rot } = p, y = p.y - 0.05;
      if (p.type === 'pine') {
        T.cyl(m4.trs(x, y, z, rot, 0, 0.22 * s, 0.9 * s, 0.22 * s), [0.35, 0.24, 0.15], 5);
        const g = 0.8 + p.hue * 0.35;
        for (let k = 0; k < 3; k++) T.cone(m4.trs(x, y + (0.6 + k * 0.62) * s, z, rot + k, 0, (1.7 - k * 0.42) * s, (1.25 - k * 0.12) * s), [0.10 * g, 0.30 * g, 0.17 * g], 7, 0.6 + k * 0.4, false);
      } else if (p.type === 'broadleaf') {
        T.cyl(m4.trs(x, y, z, rot, 0, 0.26 * s, 1.2 * s, 0.26 * s), [0.38, 0.26, 0.16], 5);
        const c = hueRGB(0.24 + p.hue * 0.1, 0.5, 0.3 + p.hue * 0.08);
        T.ico(m4.trs(x, y + 1.75 * s, z, rot, 0, 1.9 * s, 1.6 * s, 1.9 * s), c, 1, 0.35, rnd, 0.8);
        T.ico(m4.trs(x + 0.5 * s, y + 1.35 * s, z + 0.3 * s, rot, 0, 1.1 * s), c.map((v) => v * 0.9), 0, 0.3, rnd, 0.6);
      } else if (p.type === 'bush') {
        T.ico(m4.trs(x, y + 0.3 * s, z, rot, 0, 1.1 * s, 0.75 * s, 1.1 * s), hueRGB(0.27 + p.hue * 0.06, 0.45, 0.27), 1, 0.4, rnd, 0.3);
      } else if (p.type === 'rock') {
        const g = 0.42 + p.hue * 0.15; T.ico(m4.trs(x, y + 0.15 * s, z, rot, 0.2, 1.2 * s, 0.75 * s, 0.95 * s), [g, g * 0.98, g * 0.93], 0, 0.45, rnd);
      } else if (p.type === 'grass') {
        const c = hueRGB(0.25 + p.hue * 0.05, 0.55, 0.32);
        for (let k = 0; k < 4; k++) { const a = rot + k * 1.6, r = 0.18 * s; const bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r;
          T.tri([bx - 0.06, y, bz], [bx + 0.06, y, bz + 0.02], [bx + Math.cos(a) * 0.15, y + 0.45 * s, bz + Math.sin(a) * 0.15], c, [0, 0, 1]); }
      } else if (p.type === 'flowers') {
        const c = [[0.95, 0.85, 0.3], [0.9, 0.45, 0.6], [0.75, 0.6, 0.95], [1, 1, 1]][Math.floor(p.hue * 4)];
        for (let k = 0; k < 5; k++) { const a = rot + k * 1.3, r = 0.35 * s * ((k % 3) + 1) / 3, bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r;
          T.tri([bx, y, bz], [bx + 0.02, y + 0.25, bz], [bx - 0.02, y + 0.25, bz + 0.02], [0.2, 0.45, 0.15], [0, 0.5, 0.5]);
          T.box(m4.trs(bx, y + 0.28, bz, a, 0, 0.12), c, 0.5); }
      }
    }
    if (this.staticMesh) this.gl.deleteBuffer(this.staticMesh.b);
    this.staticMesh = this.mesh(T);
    this.propsCount = props.length;
  }

  // ----- public API -----
  render(state, playerId) {
    this.state = state; this.playerId = playerId;
    const key = state?.world_id || 'Aurelia';
    if (key !== this.seedKey) { this.seedKey = key; this.buildStatic(state); }
    const now = this.time, seen = new Set();
    const upd = (id, kind, x, y, extra) => {
      seen.add(id); let a = this.actors.get(id);
      if (!a) { a = { id, kind, x, y, rx: x, rz: y, ry: groundY(x, y), face: 0, walk: 0, speed: 0, born: now, anim: null }; this.actors.set(id, a); }
      if ((a.x !== x || a.y !== y)) { if (Math.abs(a.x - x) + Math.abs(a.y - y) > 4) { a.rx = x; a.rz = y; } a.x = x; a.y = y; }
      Object.assign(a, extra);
    };
    for (const [id, p] of Object.entries(state?.players || {})) upd('p:' + id, 'player', p.x, p.y, { data: p, name: p.name || id, me: id === playerId });
    for (const c of state?.creatures || []) upd('c:' + c.id, c.species === 'silverhart' ? 'deer' : 'wolf', c.x, c.y, { data: c, name: c.name, alive: c.alive !== false });
    for (const k of [...this.actors.keys()]) if (!seen.has(k)) this.actors.delete(k);
  }
  me() { return this.actors.get('p:' + this.playerId); }
  setMarker(x, y) { this.marker = x == null ? null : { x, y, t: this.time }; }
  setHintTarget(t) { this.hintTarget = t ? { x: t.x, y: t.y } : null; }
  playEffect(kind, x, y) { this.effects.push({ kind, x, y, t: this.time }); if (kind === 'attack' || kind === 'gather') { const a = this.me(); if (a) a.anim = { kind, t: this.time }; } }
  orbit(dx, dy) { this.cam.tYaw -= dx * 0.008; this.cam.tPitch = clamp(this.cam.tPitch + dy * 0.006, 0.18, 1.35); }
  zoom(f) { this.cam.tDist = clamp(this.cam.tDist * f, 5, 34); }
  resetCamera() { this.cam.tYaw = Math.PI + 0.62; this.cam.tPitch = 0.62; this.cam.tDist = 13; }
  get yaw() { return this.cam.yaw; }

  /** Screen → world tile or object. */
  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect(), nx = ((clientX - r.left) / r.width) * 2 - 1, ny = 1 - ((clientY - r.top) / r.height) * 2;
    // objects first (screen-space proximity)
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
  }
  adapt(dt) {
    if (dt <= 0) return;
    this.frameMs = lerp(this.frameMs, dt * 1000, 0.05); this.fps = Math.round(1000 / this.frameMs);
    if (this.qualityLocked) return;
    if (this.frameMs > 34) { this.slowFor += dt; this.fastFor = 0; } else if (this.frameMs < 19) { this.fastFor += dt; this.slowFor = 0; } else { this.slowFor = 0; this.fastFor = 0; }
    if (this.slowFor > 2.5 && this.quality > 0) { this.setQuality(this.quality - 1); this.slowFor = 0; this.lastDowngrade = this.time; }
    if (this.fastFor > 8 && this.quality < 2 && this.time - this.lastDowngrade > 30) { this.setQuality(this.quality + 1); this.fastFor = 0; }
  }
  resize() {
    const dprCap = [0.75, 1.25, 2][this.quality];
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap), w = Math.max(1, Math.round(this.canvas.clientWidth * dpr)), h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }
  frame(dt) {
    const gl = this.gl; this.resize(); this.drawCalls = 0;
    const st = this.state, sky = skyState(st?.tick ?? 0, st?.weather ?? 'clear');
    // smooth sky transitions
    this.skyP = this.skyP || { ...sky };
    for (const k of ['elev', 'day', 'cloud', 'fog', 'wind']) this.skyP[k] = damp(this.skyP[k], sky[k], 1.5, dt);
    this.skyP.az = angDamp(this.skyP.az, sky.az, 1.5, dt); this.skyP.rain = sky.rain;
    const S = this.skyP, day = S.day;
    const sunUp = Math.max(S.elev, -0.2);
    let sun = [Math.cos(S.az) * Math.cos(sunUp), Math.sin(sunUp), Math.sin(S.az) * Math.cos(sunUp)];
    const night = S.elev < 0;
    const lightDir = night ? [-sun[0], Math.max(0.35, -sun[1]), -sun[2]] : [sun[0], Math.max(0.12, sun[1]), sun[2]];
    { const l = Math.hypot(...lightDir); lightDir[0] /= l; lightDir[1] /= l; lightDir[2] /= l; }
    const warm = 1 - clamp(S.elev * 2.5, 0, 1);
    const cloudDim = 1 - S.cloud * 0.35;
    const sunCol = night ? [0.34, 0.4, 0.62] : [lerp(1.15, 1.2, warm) * cloudDim, lerp(1.08, 0.78, warm) * cloudDim, lerp(0.98, 0.5, warm) * cloudDim];
    const zenith = [lerp(0.04, 0.22, day), lerp(0.07, 0.45, day), lerp(0.18, 0.82, day)].map((v) => v * (1 - S.cloud * 0.25 * day));
    const horizon = [lerp(0.12, lerp(0.70, 0.98, warm * day), day), lerp(0.16, lerp(0.82, 0.62, warm * day), day), lerp(0.28, lerp(0.92, 0.48, warm * day), day)].map((v, i) => lerp(v, [0.62, 0.66, 0.7][i] * (0.3 + 0.7 * day), S.cloud * 0.45));
    const skyAmb = [lerp(0.2, 0.42, day), lerp(0.24, 0.48, day), lerp(0.38, 0.58, day)];
    const groundAmb = [lerp(0.12, 0.26, day), lerp(0.12, 0.23, day), lerp(0.16, 0.17, day)];
    // actors smoothing
    for (const a of this.actors.values()) {
      const px = a.rx, pz = a.rz; const k = a.kind === 'player' ? 11 : 6;
      a.rx = damp(a.rx, a.x, k, dt); a.rz = damp(a.rz, a.y, k, dt);
      const mv = Math.hypot(a.rx - px, a.rz - pz); a.speed = damp(a.speed, mv / Math.max(dt, 1e-3), 10, dt);
      if (mv > 1e-4) a.face = angDamp(a.face, Math.atan2(a.rx - px, a.rz - pz), 14, dt);
      a.walk += mv * 5.5; a.ry = damp(a.ry, groundY(a.rx, a.rz), 14, dt);
    }
    const me = this.me();
    const tgt = me ? [me.rx, me.ry, me.rz] : [2, groundY(2, 2), 2];
    const C = this.cam;
    C.target = C.target.map((v, i) => damp(v, tgt[i] + (i === 1 ? 0.8 : 0), 6, dt));
    C.yaw = angDamp(C.yaw, C.tYaw, 10, dt); C.pitch = damp(C.pitch, C.tPitch, 10, dt); C.dist = damp(C.dist, C.tDist, 8, dt);
    let eye = [C.target[0] + Math.sin(C.yaw) * Math.cos(C.pitch) * C.dist, C.target[1] + Math.sin(C.pitch) * C.dist, C.target[2] + Math.cos(C.yaw) * Math.cos(C.pitch) * C.dist];
    eye[1] = Math.max(eye[1], groundY(eye[0], eye[2]) + 0.6, WATER_LEVEL + 0.4);
    const aspect = this.canvas.width / this.canvas.height;
    const P = m4.persp(0.88, aspect, 0.2, 420), V = m4.lookAt(eye, C.target);
    this.VP = m4.mul(P, V); this.invVP = m4.invert(this.VP); this.eye = eye;
    // draw list
    const items = this.buildItems(sky);
    // shadow pass
    const shadows = this.quality > 0 && this.shadowOk;
    const R = 24, lc = [Math.round(C.target[0]), C.target[1], Math.round(C.target[2])];
    const LV = m4.lookAt([lc[0] + lightDir[0] * 60, lc[1] + lightDir[1] * 60, lc[2] + lightDir[2] * 60], lc, Math.abs(lightDir[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0]);
    const LVP = m4.mul(m4.ortho(-R, R, -R, R, 1, 130), LV);
    const wind = S.wind;
    if (shadows) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo); gl.viewport(0, 0, this.shadowSize, this.shadowSize);
      gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
      const D = this.depth; gl.useProgram(D.p); gl.uniformMatrix4fv(D.u.uLightVP, false, LVP); gl.uniform1f(D.u.uTime, this.time); gl.uniform1f(D.u.uWind, wind);
      for (const it of items) if (it.cast !== false && it.alpha === undefined) this.drawMesh(D, it.mesh, it.m);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(horizon[0], horizon[1], horizon[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // sky
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    const K = this.sky; gl.useProgram(K.p);
    gl.uniformMatrix4fv(K.u.uInvVP, false, this.invVP); gl.uniform3fv(K.u.uCam, eye); gl.uniform3fv(K.u.uSunDir, sun.map((v) => v / Math.hypot(...sun)));
    gl.uniform3fv(K.u.uZenith, zenith); gl.uniform3fv(K.u.uHorizon, horizon); gl.uniform3fv(K.u.uSunCol, [1.0, lerp(0.95, 0.7, warm), lerp(0.85, 0.45, warm)]);
    gl.uniform1f(K.u.uTime, this.time); gl.uniform1f(K.u.uDay, day); gl.uniform1f(K.u.uCloud, S.cloud);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf); this.attribs(K, [['aPos', 2, 0]], 8); gl.drawArrays(gl.TRIANGLES, 0, 3); this.drawCalls++;
    gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
    // lit pass
    const L = this.lit; gl.useProgram(L.p);
    gl.uniformMatrix4fv(L.u.uVP, false, this.VP); gl.uniformMatrix4fv(L.u.uLightVP, false, LVP);
    gl.uniform3fv(L.u.uSunDir, lightDir); gl.uniform3fv(L.u.uSunCol, sunCol); gl.uniform3fv(L.u.uSkyAmb, skyAmb); gl.uniform3fv(L.u.uGroundAmb, groundAmb);
    gl.uniform3fv(L.u.uFogCol, horizon); gl.uniform3fv(L.u.uCam, eye); gl.uniform1f(L.u.uFog, S.fog); gl.uniform1f(L.u.uTime, this.time); gl.uniform1f(L.u.uWind, wind);
    gl.uniform1f(L.u.uShadowOn, shadows ? 1 : 0); gl.uniform1f(L.u.uTexel, 1 / this.shadowSize);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex); gl.uniform1i(L.u.uShadow, 0);
    gl.disable(gl.BLEND);
    const blended = [];
    for (const it of items) { if (it.alpha !== undefined) { blended.push(it); continue; } this.setItem(L, it); this.drawMesh(L, it.mesh, it.m); }
    // water
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const Wt = this.water; gl.useProgram(Wt.p);
    gl.uniformMatrix4fv(Wt.u.uVP, false, this.VP); gl.uniform1f(Wt.u.uLevel, WATER_LEVEL); gl.uniform3fv(Wt.u.uCam, eye); gl.uniform3fv(Wt.u.uSunDir, lightDir);
    gl.uniform3fv(Wt.u.uSunCol, night ? [0.4, 0.45, 0.6] : sunCol); gl.uniform3fv(Wt.u.uZenith, zenith); gl.uniform3fv(Wt.u.uHorizon, horizon); gl.uniform3fv(Wt.u.uFogCol, horizon);
    gl.uniform1f(Wt.u.uTime, this.time); gl.uniform1f(Wt.u.uFog, S.fog); gl.uniform1f(Wt.u.uDay, day);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.waterBuf); this.attribs(Wt, [['aPos', 2, 0]], 8); gl.drawArrays(gl.TRIANGLES, 0, 6); this.drawCalls++;
    // translucent items (glows, markers, blob shadows)
    gl.useProgram(L.p); gl.depthMask(false);
    for (const it of blended) { this.setItem(L, it); this.drawMesh(L, it.mesh, it.m); }
    gl.depthMask(true);
    if (S.rain) this.drawRain(eye, day);
    gl.disable(gl.BLEND);
  }
  setItem(L, it) {
    const gl = this.gl; gl.uniform3fv(L.u.uTint, it.tint || [1, 1, 1]); gl.uniform1f(L.u.uEmissive, it.em || 0); gl.uniform1f(L.u.uAlpha, it.alpha ?? 1);
  }
  attribs(prog, list, stride) {
    const gl = this.gl;
    for (let i = 0; i < 6; i++) gl.disableVertexAttribArray(i);
    for (const [name, size, off] of list) { const loc = prog.a[name]; if (loc === undefined || loc < 0) continue; gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off); }
  }
  drawMesh(prog, mesh, m) {
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, mesh.b);
    this.attribs(prog, [['aPos', 3, 0], ['aNor', 3, 12], ['aCol', 3, 24], ['aSway', 1, 36]], STRIDE * 4);
    gl.uniformMatrix4fv(prog.u.uModel, false, m || m4.ident());
    gl.drawArrays(gl.TRIANGLES, 0, mesh.n); this.drawCalls++;
  }
  drawRain(eye) {
    const gl = this.gl, n = this.quality >= 2 ? 900 : 450, v = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const sx = ((i * 7.31) % 1) * 36 - 18, sz = ((i * 3.77 + 0.13) % 1) * 36 - 18; const fall = ((this.time * 1.4 + i * 0.137) % 1);
      const x = eye[0] + sx + Math.sin(i) * 3, z = eye[2] + sz, y = eye[1] + 9 - fall * 18;
      v.set([x, y, z, x - 0.05, y - 0.55, z - 0.02], i * 6);
    }
    const P = this.line; gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, this.VP); gl.uniform4fv(P.u.uColor, [0.75, 0.82, 0.95, 0.35]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rainBuf); gl.bufferData(gl.ARRAY_BUFFER, v, gl.DYNAMIC_DRAW); this.attribs(P, [['aPos', 3, 0]], 12);
    gl.drawArrays(gl.LINES, 0, n * 2); this.drawCalls++;
  }

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
            add(P.crystal, m4.trs(x + Math.cos(a) * r, y - 0.05, z + Math.sin(a) * r, a, i ? 0.35 * Math.sin(a) : 0, s * 0.55, s * 1.6, s * 0.55, i ? 0.35 * Math.cos(a) : 0), alive ? [0.35, 0.95, 1.0] : [0.45, 0.5, 0.55], alive ? pulse : 0); }
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
    // actors
    for (const a of this.actors.values()) {
      if (!near(a.rx, a.rz)) continue;
      if (a.kind === 'player') this.humanoid(items, a, lbl);
      else if (a.alive) this.creature(items, a, lbl);
    }
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
  humanoid(items, a, lbl) {
    const P = this.parts, t = this.time, p = a.data || {};
    const x = a.rx, z = a.rz, y = a.ry, f = a.face;
    const moving = clamp(a.speed / 3, 0, 1), sw = Math.sin(a.walk) * 0.75 * moving, bob = Math.abs(Math.cos(a.walk)) * 0.06 * moving + Math.sin(t * 2) * 0.012;
    const base = m4.trs(x, y + bob, z, f);
    const hue = a.me ? 0.48 : nameHue(a.name);
    const tunic = a.me ? [0.12, 0.55, 0.62] : hueRGB(hue, 0.5, 0.45), trim = a.me ? [0.95, 0.75, 0.25] : hueRGB((hue + 0.5) % 1, 0.4, 0.6);
    const skin = [0.93, 0.75, 0.6], dark = [0.2, 0.18, 0.22];
    const part = (mesh, local, col, em = 0) => items.push({ mesh, m: m4.mul(base, local), tint: col, em });
    // anim offsets
    let armSwing = sw, armR = -sw, lean = 0, crouch = 0;
    if (a.anim) { const k = (t - a.anim.t) / 0.45; if (k > 1) a.anim = null; else if (a.anim.kind === 'attack') { armR = -2.4 + Math.sin(k * Math.PI) * 3.2; lean = Math.sin(k * Math.PI) * 0.2; } else { crouch = Math.sin(k * Math.PI) * 0.18; armSwing = armR = -1.2 * Math.sin(k * Math.PI); lean = 0.35 * Math.sin(k * Math.PI); } }
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
    bpart(P.limb, m4.trs(-0.29, 0.48, 0, 0, armSwing, 0.12, 0.46, 0.13), tunic.map((v) => v * 0.9));
    const armM = m4.trs(0.29, 0.48, 0, 0, armR, 0.12, 0.46, 0.13);
    bpart(P.limb, armM, tunic.map((v) => v * 0.9));
    // sword in right hand
    const weapon = p.equipment?.weapon || 'traveller_blade';
    const blade = weapon === 'crystal_sabre' ? [0.4, 0.95, 1] : weapon === 'stone_edge' ? [0.6, 0.58, 0.55] : [0.82, 0.85, 0.9];
    const hand = m4.mul(m4.trs(0.29, 0.48, 0, 0, armR), m4.trs(0, -0.45, 0.06, 0, Math.PI / 2 - 0.2));
    items.push({ mesh: P.box, m: m4.mul(base, m4.mul(body, m4.mul(hand, m4.trs(0, 0.32, 0, 0, 0, 0.05, weapon === 'stone_edge' ? 0.6 : 0.68, weapon === 'stone_edge' ? 0.1 : 0.06)))), tint: blade, em: weapon === 'crystal_sabre' ? 0.9 : 0.1 });
    items.push({ mesh: P.box, m: m4.mul(base, m4.mul(body, m4.mul(hand, m4.trs(0, 0, 0, 0, 0, 0.18, 0.04, 0.06)))), tint: [0.6, 0.45, 0.2] });
    if (a.me) items.push({ mesh: P.ring, m: m4.trs(x, y + 0.04, z, t * 0.6, 0, 1.1), tint: [0.3, 0.9, 1], em: 1, alpha: 0.45, cast: false });
    if (this.quality === 0) items.push({ mesh: P.disk, m: m4.trs(x, y + 0.03, z, 0, 0, 0.8), tint: [0, 0, 0], alpha: 0.35, cast: false });
    lbl.push({ x, y: y + 1.75, z, text: (a.me ? '⭐ ' : '') + a.name, cls: a.me ? 'me' : 'player', hp: (p.health ?? 100) / (p.max_health || 100) });
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
