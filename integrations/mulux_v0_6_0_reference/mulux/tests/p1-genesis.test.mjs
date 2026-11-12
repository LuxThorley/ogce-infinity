// P1 exit tests: Genesis Engine, Lattice Studio DSL, CRA-33, Strata Lens; 144,000-atom chain closes in < 12.32 s.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUniverse, makeGamma, kleeneTrace, closure, chainUniverse, GOVERNOR, serialiseUniverse, forbiddenViolations, makeUniverse } from '../public/js/engine/lattice.js';
import { craGamma, craHornUniverse, U_CRA, UNGENERATED } from '../public/js/engine/cra.js';
import { kleene, eq, fmt, powerSet, monotoneExhaustive, monotoneSampled, S } from '../public/js/engine/sets.js';
import { act, restrict, qProject, coherent } from '../public/js/engine/strata.js';
import { mulberry32 } from '../public/js/engine/rng.js';
import { FIX } from './helpers.mjs';

const TOY = 'universe "Toy"\natoms a b c d\naxiom a\nb <- a\nc <- b\nc <- d\nd <- d';
test('DSL parses the thesis toy and reproduces Table 1 (all 16 Γ(X))', () => {
  const u = parseUniverse(TOY); assert.deepEqual(u.errors, []); const G = makeGamma(u);
  const rows = powerSet(['a', 'b', 'c', 'd']).map((X) => ({ X: fmt(X, 'abcd'), GX: fmt(G(X), 'abcd') }));
  assert.deepEqual(rows, FIX.C1_table.map((r) => ({ X: r.X, GX: r.GX })));
});
test('toy: Kleene ∅→{a}→{a,b}→{a,b,c}; μΓ excludes self-supporting d; closure agrees', () => {
  const u = parseUniverse(TOY); const t = kleeneTrace(u);
  assert.deepEqual(t.map((X) => fmt(X, 'abcd')), FIX.C1_kleene); assert.ok(eq(closure(u), t.at(-1))); assert.ok(!closure(u).has('d'));
});
test('admissibility filter: Adm={a,b,d} gives μΓ={a,b}', () => { const u = parseUniverse(TOY + '\nadm a b d'); assert.equal(fmt(closure(u), 'abcd'), '{a, b}'); assert.deepEqual(kleeneTrace(u).map((X) => fmt(X, 'abcd')), FIX.C1_tight_kleene); });
test('monotonicity: exhaustive on toy (81 pairs) and sampled on CRA Horn encoding', () => {
  const u = parseUniverse(TOY); assert.deepEqual(monotoneExhaustive(makeGamma(u), powerSet(u.atoms)), { ok: true, pairs: 81 });
  const c = craHornUniverse(); assert.ok(monotoneSampled(makeGamma(c), c.atoms, mulberry32(1), 2000));
});
test('DSL errors are reported, not thrown', () => { const u = parseUniverse('axiom a\nthis is nonsense\nstratum M9: x'); assert.equal(u.errors.length, 2); });
test('serialise → parse round-trip preserves μΓ', () => { const c = craHornUniverse(); const back = parseUniverse(serialiseUniverse(c)); assert.deepEqual(back.errors, []); assert.ok(eq(closure(back), closure(c))); });
test('ONIC forbidden pairs are flagged when both atoms are generated', () => { const u = parseUniverse(TOY + '\nforbid a c\nforbid a d'); assert.deepEqual(forbiddenViolations(u, closure(u)), [['a', 'c']]); });
test('CRA-33 thesis operator: 9 steps, sizes 0,5,10,…,31, ungenerated atoms', () => {
  const p = kleene(craGamma); assert.equal(U_CRA.length, 33); assert.equal(p.length - 1, 9);
  assert.deepEqual(p.map((X) => X.size), [0, 5, 10, 13, 18, 21, 24, 27, 30, 31]);
  assert.deepEqual(U_CRA.filter((a) => !p.at(-1).has(a)).sort(), [...UNGENERATED].sort());
  assert.deepEqual(p.map((X) => [...act(X)].sort()), FIX.C17_kleene_strata.map((s) => [...s].sort()));
});
test('CRA Horn encoding reaches the same 31-atom μΓ (semi-naive and Kleene)', () => {
  const c = craHornUniverse(); const mu = kleene(craGamma).at(-1);
  assert.ok(eq(closure(c), mu)); assert.ok(eq(kleeneTrace(c).at(-1), mu));
});
test('Strata Lens: T8 coherence on every Kleene state, μΓ minus each atom and 500 random states, all n', () => {
  const p = kleene(craGamma); const mu = p.at(-1); const rng = mulberry32(8); const states = [...p, S(U_CRA), S(), ...[...mu].map((e) => S([...mu].filter((x) => x !== e)))];
  for (let i = 0; i < 500; i++) states.push(S(U_CRA.filter(() => rng() < 0.5)));
  let n = 0; for (const X of states) for (let k = 0; k < 9; k++) { assert.ok(coherent(X, k)); n++; }
  assert.equal(n, 543 * 9); assert.equal(restrict(mu, 3).size, 12); assert.deepEqual([...qProject(act(mu), 2)], ['M0', 'M1', 'M2']);
});
test('EXIT: 144,000-atom chain closes in under 12.32 s with |μΓ| = 144,000 and d excluded', () => {
  const t0 = performance.now(); const u = chainUniverse(144000); const mu = closure(u); const ms = performance.now() - t0;
  assert.equal(mu.size, 144000); assert.ok(!mu.has('d')); assert.ok(ms < 12320, `${ms.toFixed(0)} ms`);
  console.log(`# 144,000-atom closure: ${ms.toFixed(0)} ms (limit 12,320 ms)`);
});
test('Growth Governor refuses runaway work', () => {
  const u = chainUniverse(500); assert.throws(() => kleeneTrace(u, { maxSteps: 100 }), /Growth Governor/);
  const big = 'atoms ' + Array.from({ length: GOVERNOR.maxAtoms + 1 }, (_, i) => `z${i}`).join(' ');
  assert.match(parseUniverse(big).errors.join(' '), /Growth Governor/);
  assert.ok(makeUniverse({ atoms: ['a'], axioms: ['a'] }));
});
