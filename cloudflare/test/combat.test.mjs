// v9.0 combat: shared JS engine matches the Python canonical engine tick-for-tick; server replays input logs to verify
// outcomes (the client cannot claim damage); progression, specials, upgrades and canon-validated invented moves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../src/combat.js';
import { OGCEApp, _resetCombatWindows } from '../src/app.js';
import { memoryDb } from './helpers.mjs';

const F = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8')).combat;
const clone = (x) => JSON.parse(JSON.stringify(x));
const Bs = 'https://strata.test';
const call = async (app, method, path, body) => {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Length'] = String(Buffer.byteLength(init.body)); }
  const r = await app.handle(new Request(Bs + path, init)); return { status: r.status, data: await r.json() };
};

test('combat data: browser copy equals the canonical JSON; every weapon has special moves', () => {
  const canon = JSON.parse(readFileSync(new URL('../../ogce4/v90/combat.json', import.meta.url), 'utf8'));
  assert.deepEqual(C.CB, canon);
  for (const w of Object.keys(C.CB.weapons)) assert.ok(Object.values(C.CB.specials).some((s) => s.weapon === w), w);
  assert.match(C.CB.label, /teen-safe/); assert.match(C.CB.label, /no gore/);
  for (const s of Object.values(C.CB.specials)) assert.doesNotMatch(s.desc, /blood|gore|wound|kill|dead/i);
});

test('duel replay parity: 80 seeded fights (5 play styles) give identical tick-by-tick events, outcomes and awards', () => {
  let ticks = 0;
  for (const f of F.fights) {
    const res = C.runFight(clone(f.cfg), clone(f.inputs));
    assert.deepEqual(res, f.result);
    ticks += res.ticks;
  }
  assert.ok(ticks > 20000, `replayed ${ticks} ticks`);
});

test('progression, learnable specials, invention budget and input validation match Python', () => {
  for (const [xp, lv, pw, learn, budget] of F.progress) {
    const p = C.newProfile(); p.xp = xp;
    assert.equal(C.levelOf(xp), lv); assert.equal(C.parryWindow(lv), pw); assert.deepEqual(C.learnable(p), learn); assert.equal(C.inventBudget(p), budget);
  }
  for (const [bad, exp] of F.invalid) {
    let got; try { got = C.validateInputs(bad); } catch (e) { got = 'ERR:' + e.message; }
    assert.deepEqual(got, exp);
  }
});

test('invented moves: canon validation (conservation, harmonic, fair test) and the move itself match Python', () => {
  let ok = 0;
  for (const c of F.invent) {
    const p = clone(c.profile), ex = clone(c.explorer); let r;
    try { r = C.inventMove(p, ex, clone(c.req), c.seed); } catch (e) { r = { error: e.message }; }
    assert.deepEqual(r, c.result); assert.deepEqual(p, c.after);
    if (r.ok) { ok++; assert.deepEqual(r.move.card.map((l) => l.label).slice(-2), ['SSR/CRA THEORY', 'IN-GAME']); assert.match(r.move.card[2].text, /not established science/); }
  }
  assert.ok(ok >= 8);
});

test('awards: XP, levels, mastery and decaying enemy pattern memory match Python', () => {
  for (const f of F.fights) {
    const res = C.runFight(clone(f.cfg), clone(f.inputs));
    // rebuild the pre-fight profile the generator used
    const lvl = C.levelOf(f.profile.xp - f.award.xp);
    const p = C.newProfile(); p.xp = f.profile.xp - f.award.xp;
    for (const s of C.learnable(p)) C.learn(p, s);
    if (f.cfg.adapt.fights) p.adapt[f.cfg.enemy.species] = { light: f.cfg.adapt.light, heavy: f.cfg.adapt.heavy, block: f.cfg.adapt.block, dodge: f.cfg.adapt.dodge, parry: f.cfg.adapt.parry, fights: f.cfg.adapt.fights };
    assert.equal(C.levelOf(p.xp), lvl);
    const award = C.applyResult(p, clone(f.cfg), res);
    assert.deepEqual(award, f.award); assert.deepEqual(p, f.profile);
  }
});

test('ranks: upgrades cost explorer materials and raise damage/lower focus; loadouts are per weapon', () => {
  const p = C.newProfile(); p.xp = 700; C.learn(p, 'wayfarers_arc');
  assert.throws(() => C.learn(p, 'lux_nova'), /level_too_low/);
  const ex = { bag: { crystal: 1, lux_mote: 1 } };
  assert.throws(() => C.upgrade(p, ex, 'wayfarers_arc'), /missing_crystal/);
  ex.bag.crystal = 6; ex.bag.lux_mote = 4;
  const r1 = C.specialDef(p, 'wayfarers_arc'); C.upgrade(p, ex, 'wayfarers_arc'); C.upgrade(p, ex, 'wayfarers_arc');
  const r3 = C.specialDef(p, 'wayfarers_arc');
  assert.equal(r3.rank, 3); assert.ok(r3.mult > r1.mult && r3.focus < r1.focus); assert.deepEqual(ex.bag, {});
  assert.throws(() => C.upgrade(p, ex, 'wayfarers_arc'), /max_rank/);
  assert.throws(() => C.equip(p, 'stone_edge', ['wayfarers_arc']), /wrong_weapon/);
  assert.deepEqual(C.equip(p, 'traveller_blade', ['wayfarers_arc']).loadout, ['wayfarers_arc']);
});

test('API: server-issued practice fight; replayed input log is the only thing that counts', async () => {
  _resetCombatWindows();
  const app = new OGCEApp(memoryDb(), '');
  const w = '/api/v90/combat/Arena', pl = 'ava';
  assert.equal((await call(app, 'GET', '/api/v90/combat/catalogue')).data.specials.lux_nova.name, 'Lux Nova');
  assert.equal((await call(app, 'POST', w, { operation: 'finish', player_id: pl, inputs: [] })).data.error, 'no_fight');
  const s = await call(app, 'POST', w, { operation: 'start', player_id: pl, target: 'practice' });
  assert.equal(s.status, 200); const cfg = s.data.result.fight; assert.equal(cfg.enemy.species, 'lux_golem');
  // play it in "the browser" with the shared engine, then claim the outcome
  const S = C.newFight(clone(cfg)), log = [];
  while (!S.over) { const a = S.t % 4 === 0 ? ['light'] : []; for (const x of a) log.push([S.t, x]); C.step(S, a); }
  const fin = await call(app, 'POST', w, { operation: 'finish', player_id: pl, inputs: log, claimed: S.over });
  assert.equal(fin.status, 200); assert.equal(fin.data.result.verified, true); assert.equal(fin.data.result.result.outcome, S.over);
  assert.equal(fin.data.combat.fights, 1); assert.ok(fin.data.combat.xp > 0); assert.ok(fin.data.combat.adapt.lux_golem.habit === 'light');
  // a forged claim is detected (server replays an empty log → the player never attacks)
  await call(app, 'POST', w, { operation: 'start', player_id: pl, target: 'practice' });
  const lie = await call(app, 'POST', w, { operation: 'finish', player_id: pl, inputs: [], claimed: 'win' });
  assert.equal(lie.data.result.verified, false); assert.notEqual(lie.data.result.result.outcome, 'win');
  for (const bad of [[[0, 'nuke']], [[5, 'light'], [1, 'light']], 'x']) {
    await call(app, 'POST', w, { operation: 'start', player_id: pl, target: 'practice' });
    assert.equal((await call(app, 'POST', w, { operation: 'finish', player_id: pl, inputs: bad })).data.error, 'bad_inputs');
  }
  assert.equal((await call(app, 'POST', w, { operation: 'learn', player_id: pl, special: 'lux_nova' })).data.error, 'level_too_low');
  assert.equal((await call(app, 'POST', w, { operation: 'teleport', player_id: pl })).data.error, 'unknown_combat_operation');
  // per-player start rate limit
  let limited = 0; for (let i = 0; i < 25; i++) if ((await call(app, 'POST', w, { operation: 'start', player_id: 'rl', target: 'practice' })).status === 429) limited++;
  assert.ok(limited >= 5);
});

test('API: a verified win over a world creature resolves through the v7.4 attack rules (XP, loot, respawn timer)', async () => {
  _resetCombatWindows();
  const db = memoryDb(), app = new OGCEApp(db, ''), wid = 'Duel';
  app.actWithProgress(wid, 'kit', { type: 'chat', message: 'hello' });
  const row = db.all('SELECT state FROM worlds WHERE id=?', wid)[0], st = JSON.parse(row.state);
  const wolf = st.creatures.find((c) => c.species === 'moss_wolf'); wolf.x = 3; wolf.y = 2; st.players.kit.x = 2; st.players.kit.y = 2;
  db.run('UPDATE worlds SET state=? WHERE id=?', JSON.stringify(st), wid);
  const far = st.creatures.find((c) => c.species === 'silverhart');
  assert.equal((await call(app, 'POST', '/api/v90/combat/' + wid, { operation: 'start', player_id: 'kit', target: far.id })).data.error, 'target_out_of_reach');
  const s = await call(app, 'POST', '/api/v90/combat/' + wid, { operation: 'start', player_id: 'kit', target: wolf.id });
  const cfg = s.data.result.fight; assert.equal(cfg.enemy.species, 'moss_wolf'); assert.equal(cfg.weapon, 'traveller_blade');
  const S = C.newFight(clone(cfg)), log = [];
  // the "skilled" scripted player from tools/combat_bots.py: parry lights, dodge heavies, punish openings
  while (!S.over) {
    const E = S.E, P = S.P; let a = [];
    if (E.phase === 'windup' && E.move.kind === 'heavy' && E.dur - E.pt === 2 && ['idle', 'recovery'].includes(P.phase)) a = ['dodge'];
    else if (E.phase === 'windup' && E.move.kind === 'light' && E.dur - E.pt === 1 && P.phase === 'idle') a = ['block_on'];
    else {
      if (P.blocking && E.phase !== 'windup') a.push('block_off');
      if (['stun', 'recovery', 'wait', 'idle'].includes(E.phase) && ['idle', 'recovery'].includes(P.phase) && P.st > 30) a.push(P.combo >= 2 ? 'heavy' : 'light');
    }
    for (const x of a) log.push([S.t, x]); C.step(S, a);
  }
  assert.equal(S.over, 'win');
  const fin = await call(app, 'POST', '/api/v90/combat/' + wid, { operation: 'finish', player_id: 'kit', inputs: log, claimed: 'win' });
  assert.equal(fin.data.result.verified, true);
  assert.ok(fin.data.world && fin.data.world.player.inventory.wood >= 2, 'v7.4 loot applied');
  const after = JSON.parse(db.all('SELECT state FROM worlds WHERE id=?', wid)[0].state).creatures.find((c) => c.id === wolf.id);
  assert.equal(after.alive, false); assert.equal(after.respawn, 8);
});
