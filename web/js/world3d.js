// Pure, deterministic landscape for the OGCE 3D view (no DOM, no WebGL) so it can be unit-tested.
// Island of Aurelia: the 64×64 play area sits on gentle meadows, sea to the north-west, mountains to the south-east.

export const WATER_LEVEL = -0.35;
const fract = (v) => v - Math.floor(v);
const hash2 = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
const smooth = (t) => t * t * (3 - 2 * t);
export const smoothstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

export function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  return mix(mix(hash2(ix, iy), hash2(ix + 1, iy), fx), mix(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), fx), fy);
}
export function fbm(x, y, oct = 4) {
  let a = 0.5, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * valueNoise(x, y); n += a; x = x * 2.03 + 17.1; y = y * 2.03 + 9.2; a *= 0.5; }
  return s / n;
}

// Footpaths link the camp to the first resources so new players can “follow the path”.
export const PATHS = [[[2, 2], [4, 3], [5, 4], [8, 6], [14, 12], [22, 18]], [[4, 3], [3, 8]], [[8, 6], [12, 8]], [[14, 12], [18, 14]], [[5, 4], [9, 18]]];
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}
export function pathDistance(x, z) {
  let d = Infinity;
  for (const line of PATHS) for (let i = 1; i < line.length; i++) d = Math.min(d, segDist(x, z, line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]));
  return d;
}
export const POND = { x: 46, z: 30, r: 4.2 };

/** Ground height at world position (x = tile x, z = tile y). */
export function height(x, z) {
  // Rolling meadows (based on the v7.7 terrain wave) plus fractal detail.
  let h = 0.42 * Math.sin(x * 0.21) * Math.cos(z * 0.17) + (fbm(x * 0.055, z * 0.055) - 0.5) * 2.4;
  // Keep the play field gentle and the early area almost flat.
  const out = Math.max(-x, -z, x - 63, z - 63, 0);
  const inside = out === 0;
  if (inside) h *= 0.55;
  const early = Math.hypot(x - 9, z - 8);
  h = mix(0.15 + h * 0.25, h, smoothstep(6, 16, early));
  h *= 1 - 0.7 * smoothstep(2.0, 0.4, pathDistance(x, z)); // paths are flatter
  // Pond.
  const pd = Math.hypot(x - POND.x, z - POND.z);
  if (pd < POND.r + 2) h = mix(-1.0, h, smoothstep(POND.r - 1.6, POND.r + 2, pd));
  // Outside the play field: sea to the north/west, mountains to the south/east.
  if (!inside) {
    const seaSide = Math.max(-x, -z), hillSide = Math.max(x - 63, z - 63);
    if (seaSide >= hillSide) h -= smoothstep(1, 16, seaSide) * 4.5;
    else {
      const ridge = 1 - Math.abs(fbm(x * 0.045 + 3, z * 0.045 - 7, 5) * 2 - 1);
      h += smoothstep(2, 24, hillSide) * (4 + ridge * 11);
    }
  }
  return h;
}
/** Where feet stand: wade in shallow water rather than sinking. */
export const groundY = (x, z) => Math.max(height(x, z), WATER_LEVEL - 0.18);

export function slope(x, z) {
  const e = 0.5;
  return Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e);
}

/** Terrain colour (linear-ish RGB 0..1). */
export function groundColor(x, z, h, s) {
  const n = fbm(x * 0.18 + 40, z * 0.18, 3), n2 = valueNoise(x * 0.9, z * 0.9);
  let c = [mix(0.20, 0.33, n), mix(0.42, 0.56, n), mix(0.14, 0.20, n)];               // grass
  if (n > 0.62) c = [mix(c[0], 0.46, 0.5), mix(c[1], 0.58, 0.4), mix(c[2], 0.18, 0.5)];  // dry meadow
  const pd = pathDistance(x, z);
  if (pd < 1.0) { const t = smoothstep(1.0, 0.45, pd); c = c.map((v, i) => mix(v, [0.52, 0.42, 0.28][i] * (0.9 + n2 * 0.2), t)); }
  if (h < WATER_LEVEL + 0.35) { const t = smoothstep(WATER_LEVEL + 0.35, WATER_LEVEL + 0.05, h); c = c.map((v, i) => mix(v, [0.80, 0.72, 0.52][i], t)); }
  if (h < WATER_LEVEL) c = c.map((v, i) => mix(v, [0.55, 0.5, 0.38][i], 0.6));
  if (s > 0.9 || h > 3) { const t = Math.max(smoothstep(0.9, 1.5, s), smoothstep(3, 5, h)); c = c.map((v, i) => mix(v, [0.45, 0.43, 0.41][i] * (0.85 + n2 * 0.3), t)); }
  if (h > 8.5) { const t = smoothstep(8.5, 10.5, h + n * 1.5); c = c.map((v, i) => mix(v, 0.95, t)); }
  return c;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function seedFrom(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Decorative props (trees, rocks, bushes, flowers, grass) kept clear of paths, water and gameplay spots. */
export function scatterProps(seedText, keepClear = [], bounds = [-26, 92]) {
  const rnd = mulberry32(seedFrom(seedText || 'Aurelia'));
  const props = [];
  const clearOf = (x, z, r) => keepClear.every((p) => Math.hypot(p.x - x, p.y - z) > r);
  for (let gx = bounds[0]; gx < bounds[1]; gx += 1.6) for (let gz = bounds[0]; gz < bounds[1]; gz += 1.6) {
    const x = gx + (rnd() - 0.5) * 1.4, z = gz + (rnd() - 0.5) * 1.4, r = rnd();
    const h = height(x, z), s = slope(x, z);
    if (h < WATER_LEVEL + 0.25 || pathDistance(x, z) < 1.4 || !clearOf(x, z, 2.2)) continue;
    const forest = fbm(x * 0.07 - 11, z * 0.07 + 5, 3);
    const inside = x >= -1 && z >= -1 && x <= 64 && z <= 64;
    const nearStart = x < 26 && z < 22;
    let density = smoothstep(0.42, 0.68, forest) * (inside ? (nearStart ? 0.22 : 0.55) : 0.8);
    if (h > 7.5 || s > 1.6) density *= 0.25;
    const kindRoll = rnd();
    if (r < density) props.push({ type: h > 2.5 || kindRoll < 0.5 ? 'pine' : kindRoll < 0.85 ? 'broadleaf' : 'bush', x, z, y: h, s: 0.75 + rnd() * 0.6, rot: rnd() * 6.283, hue: rnd() });
    else if (r < density + 0.05) props.push({ type: 'rock', x, z, y: h, s: 0.3 + rnd() * 0.7, rot: rnd() * 6.283, hue: rnd() });
    else if (h < 3 && s < 0.8 && r < density + 0.17) props.push({ type: rnd() < 0.3 ? 'flowers' : 'grass', x, z, y: h, s: 0.6 + rnd() * 0.6, rot: rnd() * 6.283, hue: rnd() });
  }
  return props;
}

/** Day/night from the world tick (24 ticks = one day; tick 0 is a bright morning). */
export function skyState(tick, weather = 'clear') {
  const phase = ((tick % 24) + 24) % 24 / 24, a = phase * Math.PI * 2;
  const elev = Math.sin(a + 0.62);
  const az = a * 0.9 + 2.2;
  const day = smoothstep(-0.12, 0.25, elev);
  const label = elev > 0.8 ? 'Midday' : elev > 0.1 ? (Math.cos(a + 0.62) > 0 ? 'Morning' : 'Afternoon') : elev > -0.15 ? (Math.cos(a + 0.62) > 0 ? 'Sunrise' : 'Sunset') : 'Night';
  const cloud = { clear: 0.35, rain: 0.9, wind: 0.55, mist: 0.7 }[weather] ?? 0.4;
  const fog = { clear: 0.010, rain: 0.020, wind: 0.011, mist: 0.040 }[weather] ?? 0.012;
  return { phase, elev, az, day, label, cloud, fog, wind: weather === 'wind' ? 2.2 : weather === 'rain' ? 1.4 : 0.7, rain: weather === 'rain' };
}
