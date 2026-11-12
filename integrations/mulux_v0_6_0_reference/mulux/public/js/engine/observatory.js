// μLux — Observatory: honest physics demonstrations (all FACT-graded computations from the thesis).
import { C } from './mathx.js';

// Bell state |Φ+⟩ with observables cosθ Z + sinθ X: E(a,b) = cos(a − b).
export function correlator(a, b) {
  // explicit 4×4 computation (real arithmetic suffices)
  const o = (t) => [[Math.cos(t), Math.sin(t)], [Math.sin(t), -Math.cos(t)]];
  const A = o(a), B = o(b); const phi = [1 / Math.SQRT2, 0, 0, 1 / Math.SQRT2];
  let e = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) e += phi[i] * A[i >> 1][j >> 1] * B[i & 1][j & 1] * phi[j];
  return e;
}
export const chsh = (a0, a1, b0, b1) => correlator(a0, b0) + correlator(a0, b1) + correlator(a1, b0) - correlator(a1, b1);
export function classicalMax() {
  let best = 0; const v = [-1, 1];
  for (const A0 of v) for (const A1 of v) for (const B0 of v) for (const B1 of v) best = Math.max(best, Math.abs(A0 * B0 + A0 * B1 + A1 * B0 - A1 * B1));
  return best;
}
// Max CHSH with all four angles restricted to a grid of step `deg` degrees (closed form cos(a−b)).
export function chshGrid(deg) {
  const n = Math.round(360 / deg); const ang = Array.from({ length: n }, (_, k) => (k * deg * Math.PI) / 180);
  const cs = new Float64Array(n * n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cs[i * n + j] = Math.cos(ang[i] - ang[j]);
  let best = 0;
  for (let a0 = 0; a0 < n; a0++) for (let a1 = 0; a1 < n; a1++) for (let b0 = 0; b0 < n; b0++) {
    const p = cs[a0 * n + b0] + cs[a1 * n + b0];
    for (let b1 = 0; b1 < n; b1++) { const v = Math.abs(p + cs[a0 * n + b1] - cs[a1 * n + b1]); if (v > best) best = v; }
  }
  return best;
}
// No-signalling: Bob's reduced state after Alice measures at angle θ (non-selective) equals I/2.
export function bobMarginal(theta) {
  const phi = [1 / Math.SQRT2, 0, 0, 1 / Math.SQRT2];
  const rho = phi.map((x) => phi.map((y) => x * y));
  const O = [[Math.cos(theta), Math.sin(theta)], [Math.sin(theta), -Math.cos(theta)]];
  const rb = [[0, 0], [0, 0]];
  for (const s of [1, -1]) {
    const P = [[(1 + s * O[0][0]) / 2, (s * O[0][1]) / 2], [(s * O[1][0]) / 2, (1 + s * O[1][1]) / 2]];
    const K = (i, j) => P[i >> 1][j >> 1] * (((i & 1) === (j & 1)) ? 1 : 0); // P ⊗ I
    const M = Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => {
      let t = 0; for (let k = 0; k < 4; k++) for (let l = 0; l < 4; l++) t += K(i, k) * rho[k][l] * K(l, j); return t;
    }));
    for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) for (let a = 0; a < 2; a++) rb[b][c] += M[a * 2 + b][a * 2 + c];
  }
  return rb;
}
// Born rule on a normalised qubit (α, β complex).
export function born(alpha, beta) { const n = Math.hypot(...alpha, ...beta); const p0 = (alpha[0] ** 2 + alpha[1] ** 2) / n ** 2; return [p0, (beta[0] ** 2 + beta[1] ** 2) / n ** 2]; }

// Page (1993) / Foong–Kanno average entropy, nats.
export function pageEntropy(m, n) {
  if (m < 1 || n < 1) return 0; if (m > n) return pageEntropy(n, m);
  let s = 0; for (let k = n + 1; k <= m * n; k++) s += 1 / k; return s - (m - 1) / (2 * n);
}
export function pageCurve(nq = 12) {
  return Array.from({ length: nq + 1 }, (_, k) => {
    const m = 2 ** k, n = 2 ** (nq - k); const S = k === 0 || k === nq ? 0 : pageEntropy(m, n);
    return { k, dimR: m, S_bits: S ? S / Math.LN2 : 0, naive_bits: k };
  });
}
// Mandelbrot hyperbolic centre of the p/q bulb by Newton on f_c^q(0), with exact period detection.
export function bulbCentre(p, q, iters = 400, tol = 1e-16, ztol = 1e-8) {
  const mu = C.exp_i((2 * Math.PI * p) / q); const root = C.sub(C.scale(mu, 0.5), C.scale(C.mul(mu, mu), 0.25));
  const r = 1 + 1.2 / (q * q); const rmu = C.scale(mu, r); let c = C.sub(C.scale(rmu, 0.5), C.scale(C.mul(rmu, rmu), 0.25));
  for (let it = 0; it < iters; it++) {
    let z = [0, 0], dz = [0, 0];
    for (let k = 0; k < q; k++) { dz = C.add(C.scale(C.mul(z, dz), 2), [1, 0]); z = C.add(C.mul(z, z), c); }
    const st = C.div(z, dz); c = C.sub(c, st); if (C.abs(st) < tol) break;
  }
  let z = [0, 0], per = null;
  for (let k = 1; k <= q; k++) { z = C.add(C.mul(z, z), c); if (C.abs(z) < ztol) { per = k; break; } }
  return { root, centre: c, period: per };
}
export const FIB_BULBS = [[1, 2], [1, 3], [2, 5], [3, 8], [5, 13], [8, 21], [13, 34]];
// Gibbs: ΔG = ΔH − TΔS for ice fusion.
export const gibbs = (T, dH = 6010, dS = 22) => dH - T * dS;
