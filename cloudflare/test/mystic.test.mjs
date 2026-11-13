// v9.0 mysticism: the JS port must match the canonical Python engine exactly, and the labels must stay honest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../../web/js/mystic.js';
const F = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8')).mystic;
const PY = JSON.parse(readFileSync(new URL('../../ogce4/v90/mystic.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));

test('mystic data module equals the canonical JSON', () => { assert.deepEqual(M.MY, PY); });
test('sky, puzzles and Grand Year match Python', () => {
  for (const [tick, seed, sky, pz] of F.sky) { assert.deepEqual(M.sky(tick, seed), sky, `sky ${tick}/${seed}`); assert.deepEqual(M.puzzles(tick, seed), pz); }
  for (const [c, g] of F.grand) assert.deepEqual(M.grandYear(c), g);
});
test('blessings, spirits, star charts and enchantments match Python step by step', () => {
  const st = M.normState(null);
  const W = ['fists', 'traveller_blade', 'stone_edge', 'crystal_sabre'];
  for (const o of F.ops) {
    const [kind, arg, , tick, extra] = o.step;
    const far = o.step[2] === 'far';
    const site = M.SITES[o.step[2]];
    const ex = far ? { realm: 'aurelia', x: 40, y: 40, bag: {} } : { realm: site.realm, x: site.x + 1, y: site.y, bag: { crystal: 6, lux_mote: 4, stone: 3, petal: 3 } };
    let r;
    try {
      if (kind === 'bless') r = M.bless(st, ex, arg, tick, 777);
      else if (kind === 'commune') r = M.commune(st, ex, arg, tick, 777);
      else if (kind === 'solve') r = M.solve(st, ex, arg, extra, tick, 777);
      else r = M.enchant(st, ex, extra, arg, W);
    } catch (e) { if (!(e instanceof M.MysticError)) throw e; r = { error: e.code }; }
    assert.deepEqual(r, o.result, JSON.stringify(o.step)); assert.deepEqual(ex, o.ex); assert.deepEqual(clone(st), o.state);
  }
});
test('duel modifiers apply identically and blessings are consumed once', () => {
  for (const a of F.apply) {
    const st = clone(a.state_in), m = M.duelMods(st, a.tick, a.seed, a.cfg.weapon);
    assert.deepEqual(m, a.mods); assert.deepEqual(st, a.state_out); assert.deepEqual(M.apply(a.cfg, m), a.out);
    assert.deepEqual(M.view(st, a.tick, a.seed, F.apply.indexOf(a)), a.view);
    assert.deepEqual(M.card(M.sky(a.tick, a.seed), M.grandYear(F.apply.indexOf(a))), a.card);
    for (const d of M.apply(a.cfg, m).loadout) assert.ok(d.focus >= 10);
  }
});
test('labels: mystical content is MYSTICAL/IN-GAME, never science; caps hold', () => {
  assert.match(M.MY.label, /MYSTICAL\/IN-GAME/); assert.match(M.MY.label, /never established science/);
  const c = M.card(M.sky(24 * 3 + 12, 5), M.grandYear(2));
  for (const s of c.statements) assert.ok(['FACT', 'SSR/CRA THEORY', 'MYSTICAL/IN-GAME'].includes(s.label));
  assert.ok(c.statements.some((s) => s.label === 'MYSTICAL/IN-GAME' && /not a science/.test(s.text)));
  assert.ok(!c.statements.some((s) => s.label === 'FACT' && /zodiac sign|abilit|blessing/i.test(s.text)));
  for (let t = 0; t < 24 * 3000; t += 24 * 7) { const e = M.sky(t, 99).effects; for (const k of Object.keys(M.CAPS)) assert.ok(e[k] >= 0 && e[k] <= M.CAPS[k]); }
  const sall = M.SITES.sallow; assert.match(sall.name, /Sallow 'Healing' Stream/); assert.equal(sall.effect.hp, 20);
});

import { OGCEApp, _resetCombatWindows } from '../src/app.js';
import { memoryDb } from './helpers.mjs';
async function call(app, method, path, body) {
  const r = await app.handle(new Request('https://strata.test' + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }));
  return { status: r.status, data: await r.json() };
}
test('API: mystic view, Sallow shrine blessing feeds the next server-issued duel, then is used up', async () => {
  _resetCombatWindows();
  const app = new OGCEApp(memoryDb(), ''), pl = 'mira';
  const v = await call(app, 'GET', '/api/v90/mystic/Aurelia?player=' + pl);
  assert.equal(v.status, 200); assert.match(v.data.label, /MYSTICAL\/IN-GAME/); assert.equal(v.data.puzzles.length, 3);
  assert.ok(v.data.puzzles.every((p) => !('answer' in p))); assert.ok(v.data.card.statements.length >= 6);
  assert.equal((await call(app, 'POST', '/api/v90/mystic/Aurelia', { player_id: pl, operation: 'bless', site: 'sallow' })).data.error, 'too_far');
  const S = M.SITES.sallow;
  for (let i = 0; i < 3; i++) {
    const me = (await call(app, 'GET', '/api/v90/omni/me/Aurelia?player=' + pl)).data.explorer;
    const dx = Math.max(-12, Math.min(12, S.x - me.x)), rest = 12 - Math.abs(dx), dy = Math.max(-rest, Math.min(rest, S.y - me.y));
    if (!dx && !dy) break;
    await call(app, 'POST', '/api/v90/omni/Aurelia', { player_id: pl, operation: 'move', x: me.x + dx, y: me.y + dy });
  }
  const b = await call(app, 'POST', '/api/v90/mystic/Aurelia', { player_id: pl, operation: 'bless', site: 'sallow' });
  assert.equal(b.status, 200, JSON.stringify(b.data)); assert.deepEqual(b.data.result.effect, { hp: 20 }); assert.equal(b.data.mystic.blessing.site, 'sallow');
  const f = await call(app, 'POST', '/api/v90/combat/Aurelia', { operation: 'start', player_id: pl, target: 'practice' });
  assert.equal(f.status, 200); assert.ok(f.data.result.fight.mystic.sources.includes('blessing:sallow')); assert.ok(f.data.result.fight.hp >= 120);
  assert.equal((await call(app, 'GET', '/api/v90/mystic/Aurelia?player=' + pl)).data.blessing, null);
  const fin = await call(app, 'POST', '/api/v90/combat/Aurelia', { operation: 'abandon', player_id: pl });
  assert.equal(fin.status, 200);
  const pz = v.data.puzzles[0];
  const s1 = await call(app, 'POST', '/api/v90/mystic/Aurelia', { player_id: pl, operation: 'solve', puzzle: pz.id, choice: 0 });
  assert.equal(s1.status, 200); assert.equal(typeof s1.data.result.correct, 'boolean');
  assert.equal((await call(app, 'POST', '/api/v90/mystic/Aurelia', { player_id: pl, operation: 'solve', puzzle: pz.id, choice: 1 })).data.error, 'already_solved');
});
