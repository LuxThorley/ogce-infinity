// Parity tests: the JS Worker engine must reproduce the canonical Python engine's outputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PyRandom } from '../src/pyrandom.js';
import { LivingWorld, leastFixedPoint, gradeClaim, decide } from '../src/mulux.js';
import { LivingWorld82, WorldError } from '../src/living82.js';
import { GameRuntime } from '../src/runtime.js';
import { memoryDb, stripTime } from './helpers.mjs';

const F = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));

test('PyRandom is bit-exact with CPython random.Random', () => {
  for (const c of F.rng) {
    const r = new PyRandom(c.seed);
    assert.deepEqual(Array.from({ length: 5 }, () => r.random()), c.random, `random() seed ${c.seed}`);
    assert.deepEqual(Array.from({ length: 10 }, () => r.randrange(12)), c.randrange12);
    assert.deepEqual(Array.from({ length: 10 }, () => r.choice([0, 1, 2, 3, 4])), c.choice5);
    assert.deepEqual(Array.from({ length: 5 }, () => r.randrange(1440)), c.randrange1440);
  }
});

test('μLux LivingWorld matches Python: genesis, ticks, ledger hashes, reload', async () => {
  const w = await LivingWorld.create(F.mulux.seed);
  const [init, ...rest] = F.mulux.steps;
  assert.deepEqual(w.snapshot(), init.snapshot);
  assert.deepEqual(w.ledger, init.ledger);
  assert.deepEqual(await w.verifyLedger(), init.verify);
  for (const s of rest.filter((s) => s.op === 'tick')) {
    assert.deepEqual(await w.tick(s.count), s.snapshot, `tick ${s.count}`);
    assert.deepEqual(await w.verifyLedger(), s.verify);
  }
  const reload = rest.find((s) => s.op === 'reload_tick');
  const w2 = LivingWorld.fromRecord(JSON.parse(JSON.stringify(F.mulux.record)));
  assert.deepEqual(await w2.tick(reload.count), reload.snapshot);
  assert.deepEqual(await w2.verifyLedger(), reload.verify);
});

test('genesis, grading and policy match Python', () => {
  for (const g of F.genesis) assert.deepEqual(leastFixedPoint(...g.args), g.result);
  for (const g of F.grades) assert.deepEqual(gradeClaim(...g.args), g.result);
  for (const p of F.policy) assert.deepEqual(decide(p.args[0], true, p.args[1]), p.result);
});

test('v8.2 LivingWorld82 matches Python step by step (incl. non-ASCII ledger hashing)', async () => {
  const w = await LivingWorld82.create(F.v82.seed);
  for (const s of F.v82.steps) {
    const k = s.kw; let res;
    try {
      switch (s.op) {
        case 'character': res = await w.createCharacter(k.character_id, k.name, k.birth_cycle, k.path); break;
        case 'cast': res = await w.cast(k.character_id, k.spell, k.target); break;
        case 'reading': res = w.celestialReading(k.character_id); break;
        case 'train': res = await w.train(k.character_id, k.discipline, k.amount); break;
        case 'invent': res = await w.invent(k.character_id, k.technology); break;
        case 'hypothesis': res = await w.submitHypothesis(k.character_id, k.title, k.discipline, k.hypothesis, k.method); break;
        case 'experiment': res = await w.experiment(k.character_id, k.research_id, k.observation, k.repeat); break;
        case 'tick': res = await w.tick(k.count); break;
        case 'learn_spell': res = await w.learnSpell(k.character_id, k.spell); break;
      }
      assert.ok(!s.error, `expected error ${s.error} for ${s.op}`);
      assert.deepEqual(res, s.result, `result ${s.op}`);
    } catch (e) {
      if (!(e instanceof WorldError)) throw e;
      assert.equal(e.message, s.error);
    }
    assert.deepEqual(await w.snapshot(), s.snapshot, `snapshot after ${s.op}`);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(w.toRecord())), F.v82.record);
  const re = await LivingWorld82.fromRecord(JSON.parse(JSON.stringify(F.v82.record)));
  assert.equal(await re.verifyLedger(), true);
});

test('v7.4 GameRuntime matches Python action-by-action', () => {
  const rt = new GameRuntime(memoryDb());
  const [first, ...steps] = F.runtime;
  assert.deepEqual(rt.load('Aurelia'), first.result);
  for (const s of steps) {
    try {
      const r = rt.act('Aurelia', 'tester', s.action);
      assert.ok(!s.error, `expected error ${s.error}`);
      assert.deepEqual(stripTime(r), stripTime(s.result), JSON.stringify(s.action));
    } catch (e) {
      if (!s.error) throw e;
      assert.equal(e.message, s.error);
    }
  }
});
