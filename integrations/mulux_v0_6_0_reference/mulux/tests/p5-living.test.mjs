// P5: Living World — persistent, autonomous, homeostatic, evolving, self-modelling, self-healing.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/js/engine/living.js';
import { kleeneTrace, closure } from '../public/js/engine/lattice.js';
import { monotoneExhaustive, powerSet } from '../public/js/engine/sets.js';
import { makeGamma } from '../public/js/engine/lattice.js';

const grow = async (opts, n) => { const w = L.createWorld(opts); await L.sealGenesis(w); await L.tick(w, n); return w; };

test('determinism: same seed and inputs → identical state hash; different seed → different', async () => {
  const a = await grow({ seed: 7, mode: 'autonomous' }, 120), b = await grow({ seed: 7, mode: 'autonomous' }, 120), c = await grow({ seed: 8, mode: 'autonomous' }, 120);
  assert.equal(await L.stateHash(a), await L.stateHash(b)); assert.equal(a.ledger.head, b.ledger.head); assert.notEqual(await L.stateHash(a), await L.stateHash(c));
});
test('homeostasis: PI controller holds population near the set-point; without it the population runs away', async () => {
  const dev = (w) => w.history.reduce((s, p) => s + Math.abs(p - w.setpoint), 0) / w.history.length / w.setpoint;
  const on = await grow({ seed: 144, mode: 'autonomous' }, 864), off = await grow({ seed: 144, mode: 'autonomous', homeostat: false }, 864);
  assert.ok(dev(on) < 0.35, `with homeostat ${dev(on)}`); assert.ok(dev(off) > 2, `without ${dev(off)}`); assert.ok(dev(on) * 5 < dev(off));
});
test('evolution and emergence: generations deepen, laws are learned, and the self-model predicts well', async () => {
  const w = await grow({ seed: 144, mode: 'autonomous' }, 432); const v = L.vitals(w);
  assert.ok(v.maxGen >= 3, `gen ${v.maxGen}`); assert.ok(v.births > 0 && v.deaths > 0); assert.ok(v.rules >= 3, `rules ${v.rules}`);
  assert.ok(w.rules.some((r) => r.head === 'gained' && r.body.includes('harvest')), 'learns that harvesting gains energy');
  assert.ok(v.selfModel.precision >= 0.95, `precision ${v.selfModel.precision}`); assert.ok(v.selfModel.recall >= 0.4, `recall ${v.selfModel.recall}`);
  for (const r of w.rules) assert.ok(r.conf >= L.LIFE.retireConf && r.body.length && L.OUTCOMES.includes(r.head));
});
test('thesis link: the world model is a Horn operator — monotone, and semi-naive μΓ equals the Kleene limit', async () => {
  const w = await grow({ seed: 144, mode: 'autonomous' }, 288);
  for (const ctx of [['hungry', 'harvest', 'light_here'], ['sated', 'split'], ['wander'], []]) {
    const u = L.knowledgeUniverse(w.rules, ctx); const path = kleeneTrace(u); assert.deepEqual([...closure(u)].sort(), [...path[path.length - 1]].sort());
  }
  const small = L.knowledgeUniverse(w.rules.slice(0, 4), []); const atoms = [...new Set(w.rules.slice(0, 4).flatMap((r) => [r.head, ...r.body]))];
  assert.equal(monotoneExhaustive(makeGamma({ ...small, atoms }), powerSet(atoms)).ok, true);
  // more laws never shrink predictions (monotone in the rule set too)
  const ctx = new Set(['light_here', 'harvest', 'sated']); const p1 = L.predict(w.rules.slice(0, 1), ctx), p2 = L.predict(w.rules, ctx);
  assert.ok(p1.every((x) => p2.includes(x)));
});
test('sandbox: a law that lets a consistent context derive a forbidden pair is refused', () => {
  const rules = [{ head: 'gained', body: ['harvest'] }];
  assert.equal(L.admissible(rules, { head: 'lost', body: ['light_here'] }), false);
  assert.equal(L.admissible(rules, { head: 'lost', body: ['wander'] }), true, 'harvest ∧ wander is impossible (one action), so no conflict');
});
test('hybrid mode: mined laws wait for approval; approve and decline are logged intents', async () => {
  const w = await grow({ seed: 144, mode: 'hybrid' }, 96); assert.equal(w.rules.length, 0); assert.ok(w.pending.length > 0);
  const [a, b] = w.pending; await L.intent(w, 'approve', L.pendingKey(a)); assert.equal(w.rules.length, 1);
  if (b) { await L.intent(w, 'reject', L.pendingKey(b)); assert.ok(w.rejected[L.pendingKey(b)] !== undefined); }
  assert.ok(w.intents.length >= 1); assert.equal((await L.verify(w)).ok, true);
});
test('integrity: ledger verifies; corruption is detected; heal restores by replay that reproduces the sealed hash', async () => {
  const w = await grow({ seed: 2026, mode: 'hybrid' }, 40); await L.intent(w, 'approve', L.pendingKey(w.pending[0] || { head: 'x', body: [] })); await L.tick(w, 5);
  await L.intent(w, 'setpoint', 30); const sealed = w.ledger.stateHash;
  assert.equal((await L.verify(w)).ok, true); L.corrupt(w); assert.equal((await L.verify(w)).ok, false);
  const r = await L.heal(w); assert.equal(r.ok, true); assert.equal(await L.stateHash({ ...r.world, chronicle: r.world.chronicle.slice(0, -1) }), sealed);
  assert.equal((await L.verify(r.world)).ok, true); assert.equal(r.world.setpoint, 30);
});
test('persistence: serialise → deserialise keeps the hash; catch-up lives while away, capped by the Governor, and never in manual mode', async () => {
  const w = await grow({ seed: 9, mode: 'autonomous', now: 0 }, 12); const h = await L.stateHash(w);
  const back = L.deserialise(L.serialise(w)); assert.equal(await L.stateHash(back), h);
  const n = await L.catchUp(back, 100 * L.LIFE.tickMs, { allowAuto: true }); assert.equal(n, 100); assert.equal(back.tick, 112);
  const m = L.deserialise(L.serialise(w)); m.mode = 'manual'; assert.equal(await L.catchUp(m, 1e12, { allowAuto: true }), 0);
  const p = L.deserialise(L.serialise(w)); assert.equal(await L.catchUp(p, 1e12, { allowAuto: false }), 0, 'Omni-Policy can veto autonomy');
  assert.throws(() => L.deserialise('{"app":"other"}'));
});
test('Growth Governor and regeneration: agent cap holds; extinction regenerates from the seed bank', async () => {
  const w = L.createWorld({ seed: 3, mode: 'autonomous' }); await L.sealGenesis(w); w.agents.forEach((a) => { a.e = -1; }); w.archive.push({ age: 50, g: [{ if: ['light_here'], then: 'harvest' }], lineage: 1 });
  await L.tick(w, 1); assert.equal(w.regenerations, 1); assert.equal(w.agents.length, 6);
  assert.ok(w.chronicle.some((c) => /regenerated/.test(c.text)));
  const big = await grow({ seed: 5, mode: 'autonomous', homeostat: false }, 300); assert.ok(big.agents.length <= L.LIFE.maxAgents);
});
test('chronicle and names are generated, graded, and bounded', async () => {
  const w = await grow({ seed: 144, mode: 'autonomous' }, 300);
  assert.ok(w.chronicle.length > 3 && w.chronicle.length <= L.LIFE.chronicleMax);
  assert.ok(w.chronicle.every((c) => ['FACT', 'BELIEF'].includes(c.grade))); assert.ok(w.chronicle.some((c) => c.grade === 'BELIEF' && /symbolic/.test(c.text)));
  assert.equal(L.nameOf(144, 0), L.nameOf(144, 0)); assert.match(L.nameOf(144, 1), /^[A-Z][a-z]+$/);
  assert.equal(L.strataCensus(w).length, 9);
});
