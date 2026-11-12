// P0 exit test: 73-check parity with the Masterpiece Edition's results.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIX } from './helpers.mjs';
import { runDoctrineChecks } from '../public/js/engine/doctrine.js';

// Checks whose detail depends on a random generator (different PRNG from NumPy/MT) or on float-list formatting.
const STOCHASTIC_OR_FORMAT = new Set(['C9-born-sums-to-1', 'C21-typeI-near-alpha', 'C22-page-unimodal', 'C5-no-signalling', 'C5-norm-1', 'C16-alpha-invariant']);
const r = runDoctrineChecks();

test('ledger reads 73 passed, 0 failed, 73 total (fixture says the same)', () => {
  assert.equal(FIX.n_checks, 73); assert.equal(FIX.n_pass, 73);
  assert.equal(r.nChecks, 73); assert.equal(r.nPass, 73); assert.equal(r.nFail, 0);
});
test('check names appear in the same order as the thesis', () => {
  assert.deepEqual(r.CHECKS.map((c) => c.name), FIX.CHECKS.map((c) => c.name));
});
for (const [i, c] of r.CHECKS.entries()) {
  test(`parity ${String(i + 1).padStart(2, '0')} ${c.name}`, () => {
    const p = FIX.CHECKS[i]; assert.equal(c.ok, p.ok, 'verdict');
    if (STOCHASTIC_OR_FORMAT.has(c.name) || p.detail === '') return;
    const a = Number(c.detail), b = Number(p.detail);
    if (Number.isFinite(a) && Number.isFinite(b)) assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${c.detail} vs ${p.detail}`);
    else assert.equal(c.detail, p.detail);
  });
}
test('CRA Kleene sizes match the thesis exactly', () => { assert.deepEqual(r.R.C17_kleene_sizes, FIX.C17_kleene_sizes); });
