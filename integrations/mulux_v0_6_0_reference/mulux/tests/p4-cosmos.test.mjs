// P4 exit tests: Observatory, Chronos Clock, Symmetry Finder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIX } from './helpers.mjs';
import { chsh, classicalMax, chshGrid, bobMarginal, pageCurve, bulbCentre, FIB_BULBS, gibbs, born, correlator } from '../public/js/engine/observatory.js';
import { tritiumRatio, epochs, precessionPeriod, YEARS } from '../public/js/engine/chronos.js';
import { commutingPermutations, cyclicUniverse } from '../public/js/engine/symmetry.js';
import { toyGamma, TOY_ATOMS } from '../public/js/engine/doctrine.js';
import { Frac } from '../public/js/engine/mathx.js';

test('EXIT CHSH = 2√2 at the optimal angles; classical max 2; quintile grid ½+√5', () => {
  assert.ok(Math.abs(chsh(0, Math.PI / 2, Math.PI / 4, -Math.PI / 4) - 2 * Math.SQRT2) < 1e-12); assert.equal(classicalMax(), 2);
  assert.ok(Math.abs(chshGrid(72) - (0.5 + Math.sqrt(5))) < 1e-12); assert.ok(Math.abs(correlator(0.3, 1.1) - Math.cos(0.3 - 1.1)) < 1e-12);
});
test('no-signalling: Bob’s state is I/2 for every Alice angle', () => {
  for (let t = 0; t <= Math.PI; t += Math.PI / 12) { const m = bobMarginal(t); assert.ok(Math.abs(m[0][0] - 0.5) < 1e-12 && Math.abs(m[0][1]) < 1e-12 && Math.abs(m[1][1] - 0.5) < 1e-12); }
});
test('EXIT Page curve: midpoint 5.2789 bits at k = 6; whole curve matches thesis Table 12', () => {
  const pc = pageCurve(12); assert.equal(pc[6].S_bits.toFixed(4), '5.2789');
  pc.forEach((r, k) => assert.ok(Math.abs(r.S_bits - FIX.C22_page[k].S_page_bits) < 1e-12, `k=${k}`));
});
test('EXIT Chronos: 4500 / 12.32 = 28,125/77 = 365.2(597402) days exactly', () => {
  const t = tritiumRatio('4500', '12.32'); assert.equal(t.exact, '28125/77'); assert.equal(t.repeating, '365.(259740)'); assert.equal(FIX.B_ratio_exact, '28125/77');
  for (const r of t.vsYears) assert.ok(Math.abs(r.diffDays - FIX.B_year_diffs[r.name].diff_d) < 1e-12, r.name);
  assert.equal(Object.keys(YEARS).length, 5); assert.equal(new Frac(1n, 3n).repeating(), '0.(3)');
});
test('symbolic epochs match the thesis and carry the BELIEF grade', () => {
  const e = epochs(2026); const f = Object.values(FIX.B2_epochs);
  e.forEach((x, i) => { assert.equal(x.astronomicalYear, f[i].astronomical_year); assert.equal(x.label, f[i].label); assert.match(x.grade, /^BELIEF/); });
  assert.equal(precessionPeriod(50.29).toFixed(1), FIX.B2_period_from_rate.toFixed(1));
});
test('Mandelbrot bulbs: Fibonacci periods, and 55/144 has period 144', () => {
  FIB_BULBS.forEach(([p, q], i) => { const b = bulbCentre(p, q, 200, 1e-15, 1e-9); assert.equal(b.period, q); assert.equal(`${b.centre[0].toFixed(6)}${b.centre[1] >= 0 ? '+' : ''}${b.centre[1].toFixed(6)}i`, FIX.C6_bulbs[i].centre); });
  assert.equal(bulbCentre(55, 144).period, 144);
});
test('Gibbs ΔG = 0 at 273.18 K; Born probabilities sum to 1', () => { assert.ok(Math.abs(gibbs(6010 / 22)) < 1e-9); const [p0, p1] = born([0.3, -0.4], [1.2, 0.5]); assert.ok(Math.abs(p0 + p1 - 1) < 1e-12); });
test('Symmetry Finder: toy has identity only; ℤ₁₄₄ μΓ = 72 evens, +72 commutes', () => {
  assert.deepEqual(commutingPermutations(toyGamma(TOY_ATOMS), TOY_ATOMS), FIX.C14_commuting_perms);
  const z = cyclicUniverse(144, [0, 72], 2); assert.equal(z.mu.size, 72); assert.equal(z.steps, FIX.C15_Z144_steps); assert.ok([...z.mu].every((k) => k % 2 === 0));
  assert.ok(z.shifts.includes(72)); assert.deepEqual(z.shifts, FIX.C15_Z144_other_shifts);
});
