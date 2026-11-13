// v9.0 Genesis backbone: Lux (mostly from understanding), Strata Reached, core-law puzzles, endings, rewards and
// New Genesis cycles match Python exactly; API flow end to end.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as G from '../src/genesis.js';
import { OGCEApp } from '../src/app.js';
import { memoryDb } from './helpers.mjs';

const F = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8')).genesis90;
const clone = (x) => JSON.parse(JSON.stringify(x));
const call = async (app, method, path, body) => {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Length'] = String(Buffer.byteLength(init.body)); }
  const r = await app.handle(new Request('https://strata.test' + path, init)); return { status: r.status, data: await r.json() };
};

test('Genesis design data: premise, objective, the seven constants, four endings (one hidden) and labelled law cards', () => {
  assert.match(G.GEN.premise, /newcomer/); assert.match(G.GEN.objective, /Source Stratum/); assert.match(G.GEN.after, /New Genesis/);
  assert.deepEqual(G.GEN.laws.map((l) => l.value), ['4500', '12.32', '72', '144', '144000', '26000', '365.26']);
  assert.deepEqual(Object.keys(G.GEN.endings), ['harmony', 'power', 'sacrifice', 'stranger']); assert.equal(G.GEN.endings.stranger.hidden, true);
  for (const l of G.GEN.laws) { assert.ok(l.fact.length > 20 && /Oliver/.test(l.theory), l.id); assert.ok(l.answer < l.options.length); }
  assert.match(G.GEN.label, /theory, not established science/);
  const kinds = new Set(G.GEN.rewards.map((r) => r.kind)); for (const k of ['ability', 'material', 'cosmetic', 'title', 'option']) assert.ok(kinds.has(k), k);
});

test('Genesis runs (laws, rewards, titles, endings, New Genesis) and views match Python step by step', () => {
  for (const run of F.runs) {
    const facts = G.normFacts(clone(run.facts_in)); assert.deepEqual(facts, run.facts);
    const rec = G.newRecord(), ex = { bag: {}, inventions: [{ id: 'i1', name: 'Ember Lamp', category: 'scientific', domain: 'heat' }], appearance: { skin: 1, hair: 1, outfit: 0, hat: 0, cape: 0 } };
    for (const st of run.steps) {
      const [op, arg, ans] = st.op; let r;
      try {
        if (op === 'law') r = G.claimLaw(rec, facts, arg, ans);
        else if (op === 'reward') r = G.claimReward(rec, facts, ex, arg);
        else if (op === 'title') r = G.setTitle(rec, arg);
        else if (op === 'ending') r = G.chooseEnding(rec, facts, arg);
        else r = G.newGenesis(rec, facts, ex, ans);
      } catch (e) { if (!(e instanceof G.GenesisError)) throw e; r = { error: e.message }; }
      assert.deepEqual(r, st.result, JSON.stringify(st.op)); assert.deepEqual(rec, st.rec); assert.deepEqual(ex.bag, st.bag);
    }
    assert.deepEqual(G.genesisView(rec, facts), run.view);
  }
  F.strata.forEach((sl, c) => assert.deepEqual(G.strataList(c), sl));
  for (const f of F.facts) assert.deepEqual(G.factsFrom(clone(f.explorer), clone(f.prof90), clone(f.combat), f.legacy), f.facts);
});

test('Lux is earned mostly by understanding: fights are capped', () => {
  const fighter = G.lux(G.newRecord(), G.normFacts({ wins: 5000 })), thinker = G.lux(G.newRecord(), G.normFacts({ discoveries: 5, principles: 5 }));
  assert.ok(fighter.total <= G.GEN.lux.win_cap); assert.ok(thinker.total > fighter.total); assert.equal(thinker.understanding_pct, 100);
});

test('API: progress screen data, law puzzle, rewards into the bag, New Genesis needs confirmation and an ending', async () => {
  const app = new OGCEApp(memoryDb(), ''), w = '/api/v90/genesis/Gen', pl = 'neo';
  const v = await call(app, 'GET', w + '?player=' + pl);
  assert.equal(v.status, 200); assert.equal(v.data.genesis.stratum.index, 0); assert.equal(v.data.genesis.laws.length, 7);
  assert.equal(v.data.genesis.laws[0].fact, null, 'law facts are revealed when claimed');
  assert.equal(v.data.genesis.endings.find((e) => e.id === 'stranger').name, '???');
  assert.equal((await call(app, 'POST', w, { operation: 'claim_law', player_id: pl, law: 'c4500', answer: 1 })).data.error, 'law_locked');
  // make a discovery in the explorer, then the first law opens
  const ex = app.explorer('Gen', pl); ex.bestiary.push('mossback'); app.saveExplorer('Gen', pl, ex);
  const wrong = await call(app, 'POST', w, { operation: 'claim_law', player_id: pl, law: 'c4500', answer: 0 });
  assert.equal(wrong.data.result.correct, false);
  const right = await call(app, 'POST', w, { operation: 'claim_law', player_id: pl, law: 'c4500', answer: 1 });
  assert.equal(right.data.result.correct, true); assert.match(right.data.result.fact, /12\.32 years/);
  assert.equal(right.data.genesis.laws_claimed, 1); assert.ok(right.data.genesis.lux.total >= 35);
  assert.equal((await call(app, 'POST', w, { operation: 'new_genesis', player_id: pl })).data.error, 'confirm_required');
  assert.equal((await call(app, 'POST', w, { operation: 'new_genesis', player_id: pl, confirm: true })).data.error, 'finish_the_story_first');
  assert.equal((await call(app, 'POST', w, { operation: 'choose_ending', player_id: pl, ending: 'harmony' })).data.error, 'reach_the_source_first');
  assert.equal((await call(app, 'POST', w, { operation: 'fly', player_id: pl })).data.error, 'unknown_genesis_operation');
});
