// P3 exit tests: OmniGenesis Mirror reproduces the thesis T1–T4 toy tables exactly; receipts are deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIX } from './helpers.mjs';
import { auditTransfer, globalChecks, mapFromAtoms, rightAdjoint, bestAbstraction } from '../public/js/engine/transfer.js';
import { makeReceipt, verifyReceipt, canonical } from '../public/js/engine/receipt.js';
import { toyGamma, toyF, toyFd, toyLamd, toyGal, TOY_ATOMS, ABC } from '../public/js/engine/doctrine.js';
import { kleene, fmt, inter, eq, powerSet, subset, diff, S } from '../public/js/engine/sets.js';
import { craGamma } from '../public/js/engine/cra.js';
import { restrict } from '../public/js/engine/strata.js';
import { chainUniverse, makeGamma } from '../public/js/engine/lattice.js';
const O = 'abcdδ'; const G = toyGamma(TOY_ATOMS); const Lam = (Y) => inter(G(Y), ABC);

test('EXIT T3/T2 table: intersection map rows (16) equal thesis Table 2 exactly', () => {
  const g = globalChecks({ gamma: G, F: toyF, Lam, sourceAtoms: TOY_ATOMS, order: O });
  assert.deepEqual(g.rows.map(({ X, FX, FGX, LFX, eq: e, lax }) => ({ X, FX, FGX, LFX, eq: e, lax })), FIX.C2_rows);
  assert.deepEqual(g.failures, FIX.C2_U1_failures); assert.equal(g.joinPreserving, true); assert.equal(g.laxAll, true); assert.equal(g.u1Global, false);
  const a = auditTransfer({ gamma: G, F: toyF, Lam, order: O }); assert.equal(a.u1prime, true); assert.equal(a.transfer, true); assert.equal(a.Fmu, FIX.C2_F_lfp);
});
test('EXIT T1 table: exactly commuting Fδ rows equal thesis Table 3 exactly', () => {
  const g = globalChecks({ gamma: G, F: toyFd, Lam: toyLamd, sourceAtoms: TOY_ATOMS, order: O });
  assert.deepEqual(g.rows.map(({ X, FX, FGX, LFX, eq: e }) => ({ X, FX, FGX, LFX, eq: e })), FIX.C3_rows); assert.equal(g.u1Global, true);
  assert.deepEqual(kleene(toyLamd).map((X) => fmt(X, O)), FIX.C3_kleene_Lambda);
});
test('EXIT T4 table: best abstraction Λ♯ via the computed right adjoint equals thesis Table 4', () => {
  const gamma = rightAdjoint(toyF, TOY_ATOMS);
  for (const Y of powerSet(['a', 'b', 'c'])) assert.ok(eq(gamma(Y), toyGal(Y)), 'right adjoint equals γ(Y) = Y ∪ {d}');
  const Ls = bestAbstraction(toyF, G, gamma);
  assert.deepEqual(powerSet(['a', 'b', 'c']).map((Y) => ({ Y: fmt(Y, O), L: fmt(Ls(Y), O) })), FIX.C4_table);
  assert.deepEqual(kleene(Ls).map((X) => fmt(X, O)), FIX.C4_kleene);
  for (const X of powerSet(TOY_ATOMS)) assert.ok(subset(toyF(G(X)), Ls(toyF(X))), 'sound (T4)');
});
test('all 16 deployed realisations of the thesis satisfy (U1′) and transfer', () => {
  const pC = kleene(craGamma); const list = [
    { gamma: G, F: (X) => X, Lam: G }, { gamma: G, F: toyF, Lam }, { gamma: G, F: toyFd, Lam: toyLamd }, { gamma: craGamma, F: (X) => X, Lam: craGamma, path: pC },
    ...Array.from({ length: 9 }, (_, n) => ({ gamma: craGamma, F: (X) => restrict(X, n), Lam: (Y) => restrict(craGamma(Y), n), path: pC })),
    ...[4, 72, 144].map((n) => { const Gn = makeGamma(chainUniverse(n)); const Fn = (X) => diff(X, S(['d'])); return { gamma: Gn, F: Fn, Lam: (Y) => Fn(Gn(Y)) }; })];
  const reps = list.map((p) => auditTransfer(p)); assert.equal(reps.length, 16);
  reps.forEach((r, i) => { assert.ok(r.u1prime && r.transfer, `realisation ${i}`); assert.equal(r.nFmu, FIX.C17_realisations[i].n_Fmu); assert.equal(r.steps, FIX.C17_realisations[i].steps); });
});
test('Mirror refuses to certify a map that breaks (U1′)', () => {
  const bad = mapFromAtoms({ a: ['a'], b: [], c: ['c'], d: ['d'] }); const r = auditTransfer({ gamma: G, F: bad, Lam: G, order: O });
  assert.equal(r.u1prime, false); assert.equal(r.verdict, 'NOT CERTIFIED');
});
test('receipts: canonical, deterministic SHA-256, tamper-evident', async () => {
  assert.equal(canonical({ b: 1, a: [S(['y', 'x'])] }), '{"a":[["x","y"]],"b":1}');
  const opts = { createdAt: '12/11/2026, 01:00:00 Europe/London', policyHash: 'abc' };
  const r1 = await makeReceipt('transfer', { mu: '{a, b, c}' }, opts); const r2 = await makeReceipt('transfer', { mu: '{a, b, c}' }, opts);
  assert.equal(r1.sha256, r2.sha256); assert.match(r1.sha256, /^[0-9a-f]{64}$/); assert.ok(await verifyReceipt(r1));
  assert.equal(await verifyReceipt({ ...r1, payload: { mu: '{a, b}' } }), false);
});
