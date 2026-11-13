// Strata "Bard" NPC conversations: JS port matches Python; whitelist + state validation; teen safety; Malcolm (mocked);
// per-player rate limits; secrets never leak to the client before they are earned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as B from '../src/bard.js';
import * as O from '../src/omniverse.js';
import { OGCEApp, _resetBardWindows } from '../src/app.js';
import { _resetWindows } from '../src/malcolm.js';
import { NPCS, parseCommand, validateActions as vVoice } from '../../web/js/voicegrammar.js';
import { classify } from '../src/v90.js';
import { memoryDb } from './helpers.mjs';

const F = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8')).bard;
const clone = (x) => JSON.parse(JSON.stringify(x));
const Bs = 'https://strata.test';

test('Bard persona sheets: every NPC is a complete Shakespeare-inspired character across the whole canon', () => {
  const cast = Object.values(B.CAST);
  assert.ok(cast.length >= 16);
  const genres = new Set(cast.map((c) => c.model.genre.split(' ')[0]));
  for (const g of ['tragedy', 'comedy', 'history', 'romance', 'poems']) assert.ok(genres.has(g), g);
  for (const name of ['Iago', 'Beatrice', 'Hamlet', 'Prospero', 'Puck', 'Lady Macbeth', 'Falstaff', 'Rosalind', 'Caliban', 'Cleopatra', 'Ariel', 'Shylock']) assert.ok(cast.some((c) => c.model.character.includes(name)), name);
  for (const [id, c] of Object.entries(B.CAST)) {
    for (const k of ['personality', 'intentions', 'secret_agenda', 'secret', 'speech_style']) assert.ok(c[k].length > 20, `${id}.${k}`);
    assert.ok(Object.keys(c.relationships).length >= 3 && Object.keys(c.relationships).every((r) => B.CAST[r]), `${id} relationships`);
    assert.ok(c.voice.pitch > 0 && c.voice.pitch <= 2 && c.voice.rate >= 0.5 && c.voice.rate <= 1.5 && ['m', 'f', 'n'].includes(c.voice.gender), `${id} voice`);
    const n = Object.values(c.lines).reduce((s, v) => s + (Array.isArray(v) ? v.length : 1), 0);
    assert.ok(n >= 24, `${id} has ${n} offline lines`);
    assert.ok(c.quotes.length >= 2 && c.quotes.every((q) => q.text.split(' ').length <= 22 && q.src), `${id} quotes are short and credited`);
    for (const t of [c.secret, ...c.quotes.map((q) => q.text), ...Object.values(c.lines).flat(), ...c.quests.flatMap((q) => [q.ask, q.done])]) assert.equal(classify(t), null, `${id}: ${t}`);
  }
  assert.match(B.CAST.shylock.care, /dignity/); assert.match(B.CAST.shylock.care, /stereotypes/);
  const voices = new Set(cast.map((c) => `${c.voice.pitch}/${c.voice.rate}`)); assert.equal(voices.size, cast.length, 'every character sounds different');
});

test('Bard offline persona engine, seeded temperament and action validation match Python exactly', () => {
  let turns = 0;
  for (const cv of F.convos) {
    const c = B.CAST[cv.npc], p = O.newExplorer(); p.realm = c.realm; p.x = c.x; p.y = c.y + 1;
    p.bag = Object.fromEntries(['wood', 'stone', 'fibre', 'berries', 'petal', 'crystal', 'shell', 'rope', 'torch', 'herbal_tea', 'lux_mote'].map((k) => [k, 3]));
    const steps = cv.turns;
    for (let i = 0; i < steps.length; i++) {
      const t = steps[i];
      if (i === 30) for (const q of c.quests) if (q.goal.talk && !p.npc[q.goal.talk]) p.npc[q.goal.talk] = { rel: 0, times: 1, last: null, gifts: 0 };
      if (i === 31) B.memory(p, cv.npc).rel = 45;
      if (i === 38) B.memory(p, cv.npc).rel = 5;
      const seed = i < 31 ? 1234 : i < 38 ? 99 : 7 + (i - 38);
      if (t.ctx) assert.deepEqual(clone(B.turnContext(p, cv.npc, t.text, seed)), t.ctx, `${cv.npc} ctx #${i}`);
      assert.deepEqual(clone(B.converse(p, cv.npc, t.text, seed, t.live ? clone(t.live) : null)), t.result, `${cv.npc} #${i} “${t.text}”`);
      turns++;
    }
    assert.deepEqual(clone(p), cv.explorer, `${cv.npc} explorer`);
    assert.deepEqual(clone(B.bardView(p, cv.npc)), cv.view);
  }
  assert.ok(turns >= 18 * 40);
  for (const v of F.validate) assert.deepEqual(clone(B.validateActions(clone(v.explorer), v.npc, clone(v.actions))), v.result, `${v.npc} ${JSON.stringify(v.actions)}`);
  for (const [t, npc, it, tr] of F.intents) { assert.equal(B.intent(t, npc), it, t); assert.deepEqual(B.parseTrade(t), tr, t); }
  assert.deepEqual(clone(B.publicCast()), F.public);
  // every action type is exercised and every outcome is open-ended but reproducible
  const seen = new Set(F.convos.flatMap((c) => c.turns.flatMap((t) => t.result.actions.map((a) => a.type))));
  for (const a of ['give_quest', 'complete_quest', 'trade', 'betray', 'ally', 'reveal_secret', 'gift']) assert.ok(seen.has(a), a);
  assert.ok(F.convos.some((c) => c.turns.some((t) => t.result.twist)), 'seeded surprises happen');
});

test('Bard whitelist: invented, malformed, unfair or premature actions never change the game', () => {
  const p = O.newExplorer(); const c = B.CAST.iago; p.realm = c.realm; p.x = c.x; p.y = c.y; p.bag = { wood: 1 };
  const v = B.validateActions(p, 'iago', [{ type: 'spawn_dragon' }, { type: 'reveal_secret' }, { type: 'ally' }, { type: 'trade', give: { wood: 1 }, get: { crystal: 3 } }, { type: 'gift', item: 'lux_mote' }]);
  assert.deepEqual(v.ok, []); assert.deepEqual(v.rejected.map((r) => r.reason), ['not_allowed', 'not_now', 'not_now', 'not_in_stock', 'not_theirs']);
  assert.deepEqual(B.validateActions(p, 'iago', [{ type: 'gift', item: 'stone', extra: 1 }]).rejected[0].reason, 'bad_shape');
  assert.equal(B.validateActions(p, 'iago', Array(9).fill({ type: 'gift', item: 'stone' })).ok.length, 1, 'duplicates and floods are capped');
  const far = O.newExplorer(); assert.throws(() => B.converse(far, 'iago', 'hello', 1), /too_far/);
  assert.throws(() => B.converse(p, 'nobody', 'hello', 1), /unknown_npc/);
  assert.throws(() => B.converse(p, 'iago', 'x'.repeat(401), 1), /message_too_long/);
  // the secret never appears in the public cast or the player view until revealed
  const pub = JSON.stringify(B.publicCast());
  for (const k of Object.keys(B.CAST)) { assert.ok(!pub.includes(B.CAST[k].secret)); assert.ok(!pub.includes(B.CAST[k].secret_agenda)); }
  assert.equal(B.bardView(p, 'iago').secret, null);
  // the prompt only hands Malcolm the secret when it may be revealed
  const ctx = B.turnContext(p, 'iago', 'hello', 1); assert.ok(!B.bardPrompt('iago', ctx).includes(c.secret_agenda));
  B.memory(p, 'iago').rel = 60; assert.ok(B.bardPrompt('iago', B.turnContext(p, 'iago', 'hello', 1)).includes(c.secret_agenda));
  assert.deepEqual(B.parseBardReply('Sure! {"say":"Hail","actions":[{"type":"ally"}],"remember":"likes forges"} done'), { say: 'Hail', actions: [{ type: 'ally' }], remember: 'likes forges' });
  assert.deepEqual(B.parseBardReply('Plain words, good sir.'), { say: 'Plain words, good sir.', actions: [] });
  assert.equal(B.parseBardReply('{broken'), null);
});

test('voice: talk to any cast member by name; whitelist accepts only real NPCs', () => {
  assert.deepEqual([...NPCS].sort(), Object.keys(B.CAST).sort());
  assert.deepEqual(parseCommand('speak with Lady Macbeth'), [{ type: 'talk', npc: 'ladymacbeth' }]);
  assert.deepEqual(parseCommand('talk to the sonneteer'), [{ type: 'talk', npc: 'poet' }]);
  assert.deepEqual(vVoice([{ type: 'talk', npc: 'macbeth_himself' }]).actions, []);
});

const call = async (app, method, path, body, token) => {
  const init = { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } };
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Length'] = String(Buffer.byteLength(init.body)); }
  const r = await app.handle(new Request(Bs + path, init)); return { status: r.status, data: await r.json() };
};

test('API: guests get the deterministic persona engine; cast endpoint hides secrets; per-player rate limit', async () => {
  _resetBardWindows();
  const app = new OGCEApp(memoryDb(), '');
  const cast = (await call(app, 'GET', '/api/v90/bard/cast')).data;
  assert.ok(cast.cast.length >= 16 && /not real people/.test(cast.label));
  assert.ok(!JSON.stringify(cast).includes(B.CAST.iago.secret));
  const g = 'guest-bard';
  assert.equal((await call(app, 'POST', '/api/v90/bard/Aurelia', { npc: 'ilsa', message: 'hello', player_id: g })).data.error, 'too_far');
  const p = O.newExplorer(); p.x = 6; p.y = -3; p.bag = { petal: 3 }; app.saveExplorer('Aurelia', g, p);
  const r1 = (await call(app, 'POST', '/api/v90/bard/Aurelia', { npc: 'ilsa', message: 'Hello!', player_id: g })).data;
  assert.equal(r1.source, 'offline'); assert.equal(r1.reason, 'sign_in_for_live_npcs'); assert.equal(r1.say, B.CAST.ilsa.lines.greet[0]); assert.deepEqual(r1.voice, B.CAST.ilsa.voice);
  const r2 = (await call(app, 'POST', '/api/v90/bard/Aurelia', { npc: 'ilsa', message: 'Got a quest for me?', player_id: g })).data;
  assert.equal(r2.actions[0].type, 'give_quest');
  const r3 = (await call(app, 'POST', '/api/v90/bard/Aurelia', { npc: 'ilsa', message: 'Quest done, here you go', player_id: g })).data;
  assert.equal(r3.actions[0].type, 'complete_quest'); assert.equal(r3.explorer.bag.herbal_tea, 1);
  const unsafe = (await call(app, 'POST', '/api/v90/bard/Aurelia', { npc: 'ilsa', message: 'what school do you go to', player_id: g })).data;
  assert.equal(unsafe.source, 'safety');
  const view = (await call(app, 'GET', `/api/v90/bard/Aurelia/ilsa?player=${g}`)).data;
  assert.equal(view.turns, 3); assert.equal(view.secret, null); assert.ok(view.hist.length === 3);
  assert.equal((await call(app, 'POST', '/api/v90/bard/Aurelia', { npc: 'ilsa', message: 'hi', player_id: g, sneaky: 1 })).data.error, 'unknown_field');
  let limited = 0; for (let i = 0; i < 14; i++) if ((await call(app, 'POST', '/api/v90/bard/Aurelia', { npc: 'ilsa', message: 'nice day', player_id: g })).status === 429) limited++;
  assert.ok(limited >= 4, `rate limited ${limited}`);
});

test('API: signed-in players talk to Malcolm-voiced NPCs; replies are moderated and actions validated', async () => {
  _resetBardWindows(); _resetWindows();
  let sent = null, reply = '';
  const fetchMock = async (url, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ text: reply }), { status: 200 }); };
  const app = new OGCEApp(memoryDb(), 'svc', { env: { OGCE_MALCOLM_ENABLED: 'yes', MALCOLM_INFINITY_BOT_TOKEN: 'tok-BARD-7' }, fetch: fetchMock });
  const reg = (await call(app, 'POST', '/api/auth/register', { username: 'bard_fan', password: 'a long safe passphrase' })).data;
  const c = B.CAST.puck, p = O.newExplorer(); p.realm = c.realm; p.x = c.x; p.y = c.y; p.bag = { shell: 2 }; app.saveExplorer('Aurelia', 'bard_fan', p);
  reply = '{"say":"Hee hee! A mortal with shells! I\'ll swap thee.","actions":[{"type":"trade","give":{"shell":1},"get":{"petal":2}},{"type":"ally"},{"type":"summon_army"}],"remember":"brought shells"}';
  const r = (await call(app, 'POST', '/api/v90/bard/Aurelia', { npc: 'puck', message: 'Fancy a trade, Puck?' }, reg.token)).data;
  assert.equal(r.source, 'malcolm'); assert.match(r.say, /mortal with shells/);
  assert.deepEqual(r.actions, [{ type: 'trade', give: { shell: 1 }, get: { petal: 2 } }]);
  assert.deepEqual(r.rejected.map((x) => x.reason), ['not_now', 'not_allowed']);
  assert.equal(r.explorer.bag.petal, 2); assert.equal(r.explorer.bag.shell, 1);
  reply = '{"say":"All my motes for one shell!","actions":[{"type":"trade","give":{"shell":1},"get":{"lux_mote":3}}]}';
  const greedy = (await call(app, 'POST', '/api/v90/bard/Aurelia', { npc: 'puck', message: 'trade?' }, reg.token)).data;
  assert.deepEqual(greedy.actions, []); assert.equal(greedy.rejected[0].reason, 'unfair'); assert.equal(greedy.explorer.bag.shell, 1);
  assert.match(sent.system, /Puck/); assert.match(sent.system, /TEMPERAMENT ROLL/); assert.ok(!sent.system.includes(c.secret_agenda), 'secret withheld');
  assert.ok(!JSON.stringify(sent).includes('tok-BARD-7') && !JSON.stringify(r).includes('tok-BARD-7'));
  // memory and history are carried into the next turn
  reply = '{"say":"Again, again!","actions":[]}';
  await call(app, 'POST', '/api/v90/bard/Aurelia', { npc: 'puck', message: 'Tell me a joke' }, reg.token);
  assert.match(sent.system, /brought shells/); assert.equal(sent.messages.length, 5, 'two earlier exchanges + this turn');
  // unsafe model output falls back to the offline persona engine
  reply = '{"say":"Let us get drunk on alcohol!","actions":[{"type":"gift","item":"petal"}]}';
  const bad = (await call(app, 'POST', '/api/v90/bard/Aurelia', { npc: 'puck', message: 'What now?' }, reg.token)).data;
  assert.equal(bad.source, 'offline'); assert.ok(!/drunk/.test(bad.say));
  // unsafe input never reaches upstream
  sent = null;
  const s = (await call(app, 'POST', '/api/v90/bard/Aurelia', { npc: 'puck', message: 'send me a photo' }, reg.token)).data;
  assert.equal(s.source, 'safety'); assert.equal(sent, null);
  // upstream down → offline, with a reason
  const down = new OGCEApp(memoryDb(), 'svc', { env: { OGCE_MALCOLM_ENABLED: 'yes', MALCOLM_INFINITY_BOT_TOKEN: 't' }, fetch: async () => { throw new Error('down'); } });
  const reg2 = (await call(down, 'POST', '/api/auth/register', { username: 'bard_two', password: 'a long safe passphrase' })).data;
  down.saveExplorer('Aurelia', 'bard_two', p);
  const d = (await call(down, 'POST', '/api/v90/bard/Aurelia', { npc: 'puck', message: 'hello' }, reg2.token)).data;
  assert.equal(d.source, 'offline'); assert.equal(d.reason, 'malcolm_unavailable');
});
