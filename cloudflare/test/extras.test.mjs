// v9.0 extras: Malcolm director (deterministic rules + optional narration with fallback), lore Easter eggs, healthy play.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as D from '../src/director.js';
import * as L from '../../web/js/lore.js';
import * as M from '../../web/js/mystic.js';
import { OGCEApp, _resetCombatWindows } from '../src/app.js';
import { memoryDb } from './helpers.mjs';
async function call(app, method, path, body) {
  const r = await app.handle(new Request('https://strata.test' + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }));
  return { status: r.status, data: await r.json() };
}

test('director: deterministic classification and bounded adjustments', () => {
  const S = (o) => D.sanitizeSignals(o);
  assert.equal(D.classifyPlayer(S({ duels: ['win', 'loss', 'loss', 'loss'] })).mode, 'stuck');
  assert.equal(D.classifyPlayer(S({ idle_s: 300, hints: 2 })).mode, 'stuck');
  assert.equal(D.classifyPlayer(S({ duels: ['win', 'win', 'win', 'win', 'win'], idle_s: 10 })).mode, 'racing');
  assert.equal(D.classifyPlayer(S({ session_min: 20, apm: 1, discoveries_10m: 0 })).mode, 'bored');
  assert.equal(D.classifyPlayer(S({ session_min: 3, apm: 30 })).mode, 'flow');
  assert.deepEqual(S({ idle_s: 'x', duels: ['win', 'hack', 5], apm: 1e9 }), { idle_s: 0, session_min: 0, apm: 200, hints: 0, faints: 0, discoveries_10m: 0, lux_10m: 0, duels: ['win'] });
  let st = { offset: 0, hint_level: 1 };
  for (let i = 0; i < 5; i++) st = D.adjust(st, { mode: 'racing' });
  assert.equal(st.offset, 2); assert.equal(st.hint_level, 0);
  for (let i = 0; i < 6; i++) st = D.adjust(st, { mode: 'stuck' });
  assert.equal(st.offset, -2); assert.equal(st.hint_level, 2); assert.ok(st.changed.length === 0 || st.changed.every((c) => /duels_|hints_/.test(c)));
  st = D.adjust(st, { mode: 'flow' }); assert.equal(st.offset, -1);
  assert.equal(D.adjust(st, { mode: 'racing' }, false).offset, 0);
});

test('director API: fallback narration offline, Malcolm line only when enabled and clean, difficulty offset reaches duels', async () => {
  _resetCombatWindows();
  const app = new OGCEApp(memoryDb(), '');
  const r = await call(app, 'POST', '/api/v90/director/Aurelia', { player_id: 'zed', signals: { duels: ['win', 'win', 'win', 'win', 'win'], idle_s: 5 } });
  assert.equal(r.status, 200); assert.equal(r.data.director.mode, 'racing'); assert.equal(r.data.director.source, 'fallback'); assert.ok(r.data.director.line);
  assert.equal(r.data.director.offset, 1); assert.deepEqual(r.data.director.changed, ['duels_harder', 'hints_subtle']);
  const f = await call(app, 'POST', '/api/v90/combat/Aurelia', { operation: 'start', player_id: 'zed', target: 'practice' });
  const base = await call(new OGCEApp(memoryDb(), ''), 'POST', '/api/v90/combat/Aurelia', { operation: 'start', player_id: 'zed', target: 'practice' });
  assert.equal(f.data.result.fight.enemy.level, base.data.result.fight.enemy.level + 1);
  const off = await call(app, 'POST', '/api/v90/director/Aurelia', { player_id: 'zed', enabled: false });
  assert.equal(off.data.director.enabled, false); assert.equal(off.data.director.offset, 0); assert.equal(off.data.director.line, null);
  // Malcolm narration (mocked) is used only when enabled, and rejected if it pushes purchases/streaks
  for (const [reply, expectSource] of [['Brave work, realigner. The strata grow sharper for you.', 'malcolm'], ['Buy the gem pack to keep your streak!', 'fallback']]) {
    const db = memoryDb();
    const a2 = new OGCEApp(db, '', { env: { OGCE_MALCOLM_ENABLED: 'yes', MALCOLM_INFINITY_BOT_TOKEN: 'tok-DIR' }, fetch: async () => new Response(JSON.stringify({ reply, text: reply, response: reply }), { status: 200, headers: { 'content-type': 'application/json' } }) });
    a2.identity = async () => ({ account: 'kim', unauthorized: false });
    const d = await call(a2, 'POST', '/api/v90/director/Aurelia', { signals: { duels: ['loss', 'loss', 'loss', 'loss'] } });
    assert.equal(d.data.director.mode, 'stuck'); assert.equal(d.data.director.source, expectSource, JSON.stringify(d.data));
  }
});

test('lore: crop-circle glyphs are binary-decodable, pages come from real progress, 365.26-day solar return', async () => {
  for (const g of L.GLYPHS) assert.equal(L.decodeGlyph(L.encodeGlyph(g.word)), g.word);
  assert.deepEqual(L.encodeGlyph('A'), [[0, 0, 0, 0, 1]]);
  assert.equal(L.PAGES.length, 12); assert.ok(L.PAGES.some((p) => p.label === 'SSR/CRA THEORY' && /not established science/.test(p.text)));
  assert.ok(L.isSolarReturn(366) && !L.isSolarReturn(365) && L.isSolarReturn(731)); // 365.26-day years
  const lore = L.normLore(null), my = M.normState(null);
  assert.equal(L.visibleGlyphs(my).length, 1);
  assert.throws(() => L.decode(lore, my, 'g_star', 'LUX'), /glyph_not_found_yet/);
  assert.equal(L.decode(lore, my, 'g_sallow', 'hea').correct, false);
  assert.deepEqual(L.decode(lore, my, 'g_sallow', ' heal '), { correct: true, already: false, page: 'p01' });
  my.visits.sallow = 3; my.spirits.push('wisp');
  assert.deepEqual(L.pagesOwned(lore, my, 1), ['p01', 'p07', 'p09']);
  const app = new OGCEApp(memoryDb(), '');
  const v = await call(app, 'GET', '/api/v90/lore/Aurelia?player=lu');
  assert.equal(v.status, 200); assert.equal(v.data.glyphs.length, 1); assert.equal(v.data.glyphs[0].decoded, null); assert.ok(!('text' in v.data.pages[0]));
  const d = await call(app, 'POST', '/api/v90/lore/Aurelia', { player_id: 'lu', operation: 'decode', glyph: 'g_sallow', answer: 'HEAL' });
  assert.equal(d.data.result.page, 'p01'); assert.equal(d.data.lore.pages[0].owned, true); assert.ok(d.data.lore.pages[0].text);
  assert.equal((await call(app, 'POST', '/api/v90/lore/Aurelia', { player_id: 'lu', operation: 'solar' })).data.error, 'not_solar_return');
});

test('healthy play: no loot boxes, paid currency, daily-streak rewards or FOMO timers anywhere in the game code', () => {
  const dirs = ['../../web/js/', '../src/'], bad = /loot\s*box|gacha|gem\s*pack|daily\s*streak|login\s*streak|streak\s*reward|premium\s*currency|limited[- ]time\s*offer|pay\s*to\s*win/i;
  for (const d of dirs) for (const f of readdirSync(new URL(d, import.meta.url))) {
    if (!f.endsWith('.js')) continue;
    const src = readFileSync(new URL(d + f, import.meta.url), 'utf8').split('\n').filter((l) => !/HEALTHY-PLAY-OK/.test(l)).join('\n');
    assert.ok(!bad.test(src), `${d}${f} mentions a manipulative mechanic`);
  }
});
