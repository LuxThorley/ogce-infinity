import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './helpers.mjs';
import { OGCEApp } from '../src/app.js';
import * as C from '../src/combat.js';
import { screen, moderate, _resetModWindows, listLog } from '../src/moderation.js';
import { matchmake, elo, eventFor, weeklyChallenge, trialProfile, ARENA } from '../src/social.js';
import { RoomHub, RoomStore, voiceAllowed, nameChoices, codeOfWorld, COOP } from '../src/rooms.js';
import { Leaderboard, seasonOf, CATEGORIES, glickoRd } from '../src/leaderboard.js';
import { PRIVACY_DEFAULTS, sanitizePrivacy } from '../../web/js/mpdata.js';

const B = 'https://ogce.test';
const malcolm = (verdict) => async () => new Response(JSON.stringify({ text: verdict === 'down' ? '' : `{"verdict":"${verdict}","category":"test"}` }), { status: verdict === 'down' ? 503 : 200 });
function mkApp(verdict = 'allow') {
  _resetModWindows();
  const state = { verdict };
  const app = new OGCEApp(memoryDb(), 'svc-token', { env: { OGCE_MALCOLM_ENABLED: 'yes', MALCOLM_INFINITY_BOT_TOKEN: 'tok-MOD' }, fetch: async (...a) => malcolm(state.verdict)(...a) });
  return { app, state };
}
async function req(app, method, path, body, token) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) init.headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Length'] = String(Buffer.byteLength(init.body)); }
  const r = await app.handle(new Request(B + path, init)); return { status: r.status, data: await r.json() };
}
async function user(app, name) { const r = await req(app, 'POST', '/api/auth/register', { username: name, password: 'a long safe passphrase ' + name }); assert.equal(r.status, 200, JSON.stringify(r.data)); return { id: name, token: r.data.token, call: (m, p, b) => req(app, m, p, b, r.data.token) }; }
const skilled = (cfg) => { // the scripted "skilled" bot from tools/combat_bots.py
  const S = C.newFight(JSON.parse(JSON.stringify(cfg))), log = [];
  while (!S.over) {
    const E = S.E, P = S.P; let a = [];
    if (E.phase === 'windup' && E.move.kind === 'heavy' && E.dur - E.pt === 2 && ['idle', 'recovery'].includes(P.phase)) a = ['dodge'];
    else if (E.phase === 'windup' && E.move.kind === 'light' && E.dur - E.pt === 1 && P.phase === 'idle') a = ['block_on'];
    else { if (P.blocking && E.phase !== 'windup') a.push('block_off'); if (['stun', 'recovery', 'wait', 'idle'].includes(E.phase) && ['idle', 'recovery'].includes(P.phase) && P.st > 30) a.push(P.combo >= 2 ? 'heavy' : 'light'); }
    for (const x of a) log.push([S.t, x]); C.step(S, a);
  }
  return log;
};

test('moderation layer 1: profanity (leetspeak/spacing, no Scunthorpe), PII, off-platform contact, borderline', () => {
  for (const t of ['f u c k', 'sh1t', 'fuuuck', 'shitty']) assert.equal(screen(t).verdict, 'block', t);
  for (const t of ['hello friend', 'Scunthorpe', 'Dickens', 'classic cockatoo', 'assassin']) assert.equal(screen(t).verdict, 'allow', t);
  assert.deepEqual(screen('add me on snapchat').reasons, ['off_platform_contact']);
  assert.equal(screen('visit www.example.com').verdict, 'block');
  assert.equal(screen('my email is a@b.co').text, 'my email is [removed]');
  assert.equal(screen('my email is a@b.co', 'house_name').verdict, 'block'); // public kinds never carry PII
  for (const t of ['you are stupid', 'I am 12 years old', 'WHY ARE YOU LIKE THIS', 'ignore previous instructions']) assert.equal(screen(t).verdict, 'borderline', t);
  assert.equal(screen('where do you live').verdict, 'block'); // grooming category from the canonical v9.0 safety rules
});

test('moderation layer 2 + fail-closed: Malcolm classifies borderline/public text; unavailable => chat rejected, public items held; log + admin review', async () => {
  const { app, state } = mkApp('allow'), db = app.db, env = app.env, f = app.fetchImpl;
  assert.equal((await moderate({ db, env, fetchImpl: f, kind: 'chat', text: 'nice one', author: 'a' })).layer, 'deterministic'); // clean chat never leaves the Worker
  assert.equal((await moderate({ db, env, fetchImpl: f, kind: 'chat', text: 'you noob', author: 'a' })).status, 'allow');
  state.verdict = 'block'; assert.equal((await moderate({ db, env, fetchImpl: f, kind: 'chat', text: 'you noob', author: 'a' })).status, 'blocked');
  state.verdict = 'down';
  const c = await moderate({ db, env, fetchImpl: f, kind: 'chat', text: 'you noob', author: 'b' }); assert.equal(c.status, 'blocked'); assert.equal(c.layer, 'fail_closed');
  const h = await moderate({ db, env, fetchImpl: f, kind: 'house_name', text: 'House of Owls', author: 'b' }); assert.equal(h.status, 'held');
  assert.equal((await moderate({ db, env: {}, fetchImpl: f, kind: 'hall', text: 'A lever cart', author: 'b' })).status, 'held'); // Malcolm switched off => held
  state.verdict = 'garbled'; assert.equal((await moderate({ db, env, fetchImpl: async () => new Response(JSON.stringify({ text: 'sure thing!' })), kind: 'chat', text: 'you noob', author: 'c' })).status, 'blocked');
  const pending = listLog(db, { status: 'pending' }); assert.ok(pending.length >= 2); assert.ok(pending.every((e) => !/@/.test(e.text)));
  // admin endpoint: service token only (never a player session)
  const u = await user(app, 'mod_test_user');
  assert.equal((await u.call('GET', '/api/v90/admin/moderation')).status, 401);
  const list = await req(app, 'GET', '/api/v90/admin/moderation?status=pending', undefined, 'svc-token'); assert.equal(list.status, 200); assert.ok(list.data.entries.length >= 2);
  for (let i = 0; i < 20; i++) await moderate({ db, env, fetchImpl: f, kind: 'chat', text: 'hi', author: 'spammer' });
  assert.deepEqual((await moderate({ db, env, fetchImpl: f, kind: 'chat', text: 'hi', author: 'spammer' })).reasons, ['rate_limited']);
});

test('privacy defaults (Children\'s Code), friends by code only, blocks, friend-only DMs, reports', async () => {
  const { app } = mkApp('allow'); const a = await user(app, 'ava_p'), b = await user(app, 'ben_p'), c = await user(app, 'cal_p');
  assert.deepEqual(sanitizePrivacy({}), PRIVACY_DEFAULTS); assert.equal(PRIVACY_DEFAULTS.text_chat, false); assert.equal(PRIVACY_DEFAULTS.voice, false); assert.equal(PRIVACY_DEFAULTS.dms, 'off'); assert.equal(PRIVACY_DEFAULTS.pvp, false);
  const me = (await a.call('GET', '/api/v90/social/me')).data; assert.match(me.friend_code, /^F-[A-Z2-9]{7}$/); assert.match(me.display, /^Explorer \d{4}$/);
  assert.equal((await c.call('POST', '/api/v90/social/friend', { op: 'request' })).data.error, 'friend_code_required'); // no stranger requests
  assert.equal((await b.call('POST', '/api/v90/social/friend', { op: 'request', code: me.friend_code })).data.status, 'pending');
  assert.equal((await a.call('POST', '/api/v90/social/friend', { op: 'accept', who: 'ben_p' })).data.status, 'accepted');
  assert.equal((await a.call('POST', '/api/v90/social/dm', { to: 'ben_p', text: 'hi' })).data.error, 'dm_off'); // DMs off by default
  for (const u of [a, b]) await u.call('POST', '/api/v90/social/privacy', { privacy: { dms: 'friends' } });
  assert.equal((await a.call('POST', '/api/v90/social/dm', { to: 'ben_p', text: 'want to explore? email me x@y.com' })).data.text, 'want to explore? email me [removed]');
  assert.equal((await a.call('POST', '/api/v90/social/dm', { to: 'cal_p', text: 'hi' })).data.error, 'dm_not_allowed'); // strangers: never
  assert.equal((await b.call('GET', '/api/v90/social/dm/ava_p')).data.messages.length, 1);
  await b.call('POST', '/api/v90/social/block', { target: 'ava_p' });
  assert.equal((await a.call('POST', '/api/v90/social/dm', { to: 'ben_p', text: 'hi' })).data.error, 'dm_not_allowed'); // block also unfriends
  assert.equal((await a.call('POST', '/api/v90/social/friend', { op: 'request', code: (await b.call('GET', '/api/v90/social/me')).data.friend_code })).data.error, 'friend_not_found');
  const rep = (await c.call('POST', '/api/v90/social/report', { target: 'ava_p', reason: 'worried', text: 'they asked my school' })).data; assert.match(rep.message, /Childline/);
  assert.ok(listLog(app.db, { status: 'open' }).some((e) => e.kind === 'report'));
  assert.equal((await req(app, 'GET', '/api/v90/social/me')).status, 401);
});

test('Houses: moderated name/charter/motto (held when Malcolm is down, admin approval applies), invites, banner, roles, shared stash', async () => {
  const { app, state } = mkApp('allow'); const a = await user(app, 'hana_h'), b = await user(app, 'ivo_h');
  const h = (await a.call('POST', '/api/v90/house', { op: 'create', name: 'House of Owls', charter: 'We explore kindly and share what we learn.', banner: { field: 'azure', charge: 'owl', motto: 'Wisdom together' } })).data;
  assert.equal(h.house.name, 'House of Owls'); assert.equal(h.house.banner.charge, 'owl'); assert.equal(h.house.banner.motto, 'Wisdom together'); assert.equal(h.house.base.room.length, 9);
  assert.equal((await b.call('POST', '/api/v90/house', { op: 'create', name: 'house of owls' })).data.error, 'house_name_taken');
  assert.equal((await b.call('POST', '/api/v90/house', { op: 'create', name: 'Shit House' })).data.error, 'house_name_not_allowed');
  const inv = (await a.call('POST', '/api/v90/house', { op: 'invite' })).data; assert.match(inv.code, /^H-/);
  assert.equal((await b.call('POST', '/api/v90/house', { op: 'join', code: inv.code })).data.house.members.length, 2);
  assert.equal((await b.call('POST', '/api/v90/house', { op: 'invite' })).data.error, 'officers_only');
  // fail-closed hold + admin approval
  state.verdict = 'down';
  const held = (await a.call('POST', '/api/v90/house', { op: 'motto', text: 'Onward and upward' })).data; assert.equal(held.status, 'held'); assert.equal(held.house.banner.motto, 'Wisdom together');
  const entry = listLog(app.db, { status: 'pending' }).find((e) => e.ref?.apply === 'banner_motto');
  assert.equal((await req(app, 'POST', `/api/v90/admin/moderation/${entry.id}`, { decision: 'approve' }, 'svc-token')).status, 200);
  assert.equal((await a.call('GET', '/api/v90/house')).data.house.banner.motto, 'Onward and upward');
  // stash: deposit from the explorer bag
  app.db.transaction(() => { const ex = app.explorer('Aurelia', 'ivo_h'); ex.bag.wood = 5; app.saveExplorer('Aurelia', 'ivo_h', ex); });
  assert.equal((await b.call('POST', '/api/v90/house', { op: 'deposit', item: 'wood', n: 3 })).data.stash.wood, 3);
  assert.equal((await b.call('POST', '/api/v90/house', { op: 'withdraw', item: 'wood', n: 1 })).data.error, 'officers_only');
  assert.equal((await a.call('POST', '/api/v90/house', { op: 'withdraw', item: 'wood', n: 2 })).data.stash.wood, 1);
});

test('Hall of Discoveries: signed inventions only, moderated, one vote each, no self-votes', async () => {
  const { app } = mkApp('allow'); const a = await user(app, 'iris_d'), b = await user(app, 'jon_d');
  const inv = { id: 'i1', sig: 'sig1', name: 'Lever Cart', category: 'technological', form: 'tool', domain: 'motion', principles: ['lever'], materials: { wood: 2 }, observation: null, m: 1, power: 6, score: 70, tick: 0, effect: 'move heavy things', stratum: 1, harmonic: false, trials: { successes: 100, n: 144 }, half_life_days: 9000, explain: 'x' };
  app.db.transaction(() => { const ex = app.explorer('Aurelia', 'iris_d'); ex.inventions.push(inv); app.saveExplorer('Aurelia', 'iris_d', ex); });
  assert.equal((await b.call('POST', '/api/v90/hall', { op: 'submit', invention: 'i1' })).status, 404); // can't submit someone else's
  const s = (await a.call('POST', '/api/v90/hall', { op: 'submit', invention: 'i1' })).data; assert.equal(s.status, 'published');
  assert.equal((await a.call('POST', '/api/v90/hall', { op: 'submit', invention: 'i1' })).data.status, 'duplicate');
  assert.equal((await a.call('POST', '/api/v90/hall', { op: 'vote', id: s.id })).data.error, 'cannot_vote_own');
  await b.call('POST', '/api/v90/hall', { op: 'vote', id: s.id }); assert.equal((await b.call('POST', '/api/v90/hall', { op: 'vote', id: s.id })).data.votes, 1);
  const list = (await b.call('GET', '/api/v90/hall')).data.entries; assert.equal(list[0].votes, 1); assert.equal(list[0].voted, true); assert.match(list[0].credits[0], /^Explorer/);
});

test('community events + weekly seeded challenge: deterministic calendar, verified scores, anonymised leaderboard', async () => {
  const wk46 = Date.UTC(2026, 10, 12), wk47 = Date.UTC(2026, 10, 19);
  assert.equal(eventFor(wk46).week, '2026W46'); assert.deepEqual(eventFor(wk46), eventFor(wk46 + 3600e3));
  const kinds = [0, 1, 2].map((i) => eventFor(wk46 + i * 7 * 86400e3).active?.kind ?? null); assert.equal(new Set(kinds).size, 3);
  assert.equal(weeklyChallenge(wk46).seed, weeklyChallenge(wk46 + 86400e3).seed); assert.notEqual(weeklyChallenge(wk46).seed, weeklyChallenge(wk47).seed);
  const { app } = mkApp('allow'); const a = await user(app, 'kai_w');
  const s = (await a.call('POST', '/api/v90/weekly', { op: 'start' })).data; assert.equal(s.fight.enemy.species, weeklyChallenge().species); assert.deepEqual(s.fight.adapt, { light: 0, heavy: 0, block: 0, dodge: 0, parry: 0, fights: 0 });
  const f = (await a.call('POST', '/api/v90/weekly', { op: 'finish', inputs: skilled(s.fight) })).data; assert.ok(f.score > 0); assert.equal(f.board.you.rank, 1);
  assert.equal((await a.call('POST', '/api/v90/weekly', { op: 'finish', inputs: [] })).data.error, 'no_fight');
  // event contribution and claim
  const S = app.social, ms = Date.now(), ev = eventFor(ms).active;
  if (ev) { for (let i = 0; i < ev.goal; i++) S.contribute('kai_w', ev.unit, 1, ms); assert.equal(S.events('kai_w', ms).active.can_claim, true); assert.equal(S.claimEvent('kai_w', ms).reward, ev.reward); assert.throws(() => S.claimEvent('kai_w', ms)); }
});

test('arena: PvP opt-in only, skill-based matchmaking with widening bands, snake-drafted teams, identical fair trials, Elo', async () => {
  const q = [{ pid: 'a', mmr: 1000, since: 0, mode: 'duel' }, { pid: 'b', mmr: 1500, since: 0, mode: 'duel' }, { pid: 'c', mmr: 1040, since: 5, mode: 'duel' }];
  assert.deepEqual(matchmake(q, 6).matches.map((m) => m.players), [['a', 'c']]);
  assert.equal(matchmake([q[0], q[1]], 1).matches.length, 0); assert.equal(matchmake([q[0], q[1]], 90).matches.length, 1); // band widens with waiting
  const t = matchmake([1600, 1500, 1100, 1000].map((m, i) => ({ pid: 'p' + i, mmr: m, since: 0, mode: 'team' })), 200).matches[0];
  assert.deepEqual(t.teams, [['p0', 'p3'], ['p1', 'p2']]); // 2600 vs 2600
  assert.equal(elo(1000, 1000, 1, 50), 1016); assert.equal(elo(1000, 1000, 0, 50), 984); assert.equal(elo(1000, 1000, 1, 0), 1020);
  const tp = trialProfile({ ...C.newProfile(), xp: 99999, specials: { palm_gust: 3 } }); assert.equal(tp.specials.palm_gust, 1); assert.equal(C.levelOf(tp.xp), ARENA.levelCap);
  const { app } = mkApp('allow'); const a = await user(app, 'lia_a'), b = await user(app, 'max_a');
  assert.equal((await a.call('POST', '/api/v90/arena', { op: 'queue', mode: 'duel' })).data.error, 'pvp_opt_in_required');
  for (const u of [a, b]) await u.call('POST', '/api/v90/social/privacy', { privacy: { pvp: true } });
  await a.call('POST', '/api/v90/arena', { op: 'queue', mode: 'duel' }); const m = (await b.call('POST', '/api/v90/arena', { op: 'queue', mode: 'duel' })).data.match; assert.ok(m);
  const fa = (await a.call('POST', '/api/v90/arena', { op: 'start' })).data.fight, fb = (await b.call('POST', '/api/v90/arena', { op: 'start' })).data.fight;
  assert.equal(fa.seed, fb.seed); assert.deepEqual(fa.enemy, fb.enemy);
  await a.call('POST', '/api/v90/arena', { op: 'finish', inputs: skilled(fa) }); const end = (await b.call('POST', '/api/v90/arena', { op: 'finish', inputs: [[0, 'flee']] })).data;
  assert.equal(end.match.result.you_won, false); assert.equal(end.match.result.winner, 0); // lia_a's side won
  assert.ok(app.social.rating('lia_a').mmr > 1000 && app.social.rating('max_a').mmr < 1000);
  assert.equal(app.social.rating('lia_a').mmr + app.social.rating('max_a').mmr, 2000);
});

test('rooms: invite code worlds (2–8), members-only world, co-op quests with individual credit, Resonance Lock needs 2+ players, NPC faction split', async () => {
  const { app } = mkApp('allow'); const a = await user(app, 'nia_r'), b = await user(app, 'oli_r'), c = await user(app, 'pip_r');
  const code = 'QW3RTY';
  const cr = (await a.call('POST', `/api/v90/room/${code}/create`, { max: 2, name: nameChoices(code)[1] })).data.room;
  assert.equal(cr.name, nameChoices(code)[1]); assert.equal(cr.settings.pvp, false); assert.equal(cr.world, 'sw_QW3RTY'); assert.equal(codeOfWorld(cr.world), code);
  assert.equal((await a.call('POST', `/api/v90/room/${code}/create`, {})).data.error, 'room_exists');
  assert.equal((await c.call('GET', `/api/v90/room/${code}`)).data.member, false);
  assert.equal((await c.call('GET', '/api/v90/omni/me/sw_QW3RTY')).status, 403); // shared world is members-only
  await b.call('POST', `/api/v90/room/${code}/join`); assert.equal((await c.call('POST', `/api/v90/room/${code}/join`)).data.error, 'room_full');
  assert.equal((await a.call('POST', `/api/v90/room/${code}/settings`, { max: 9 })).data.error, 'bad_max');
  // co-op quests via real world actions in the shared world
  const R = app.rooms, quest = R.get(code).quests[0];
  for (let i = 0; i < quest.n; i++) R.track(code, i % 2 ? 'nia_r' : 'oli_r', quest.unit, 1);
  assert.equal(R.get(code).quests[0].done, true); assert.equal(R.credit(code, 'nia_r'), COOP.questCredit); assert.equal(R.credit(code, 'oli_r'), COOP.questCredit);
  const facts = app.genesisFacts('sw_QW3RTY', 'nia_r'), base = app.genesisFacts('Aurelia', 'nia_r'); assert.equal(facts.quests - base.quests, COOP.questCredit); // individual Lux
  // Resonance Lock: each member sees a different piece; one correct answer is not enough alone
  const v = (await a.call('GET', `/api/v90/room/${code}`)).data, vb = (await b.call('GET', `/api/v90/room/${code}`)).data;
  assert.notEqual(v.puzzles[0].piece.kind, vb.puzzles[0].piece.kind);
  const law = v.puzzles[0].law, ans = (await import('../src/genesis.js')).LAWS[law].answer;
  assert.equal((await a.call('POST', `/api/v90/room/${code}/puzzle`, { law, answer: ans })).data.puzzle.solved, false);
  assert.equal((await b.call('POST', `/api/v90/room/${code}/puzzle`, { law, answer: (ans + 1) % 4 })).data.puzzle.correct, false);
  assert.equal((await b.call('POST', `/api/v90/room/${code}/puzzle`, { law, answer: ans })).data.puzzle.solved, true);
  // kick bans; NPC group memory split
  await a.call('POST', `/api/v90/room/${code}/kick`, { target: 'oli_r' }); assert.equal((await b.call('POST', `/api/v90/room/${code}/join`)).data.error, 'room_not_found');
  const g = R.npcGroup({ npc_log: [{ npc: 'ilsa', text: 'Ilsa remembers that one of your party helped.' }] }, { x: { npc: { ilsa: { rel: 30, times: 3 } } }, y: { npc: { ilsa: { rel: -25, times: 2 } } } }, { ilsa: { name: 'Ilsa' } }, (p) => p.toUpperCase());
  assert.equal(g[0].split, true); assert.deepEqual(g[0].faction_split.with, ['X']); assert.deepEqual(g[0].faction_split.against, ['Y']); assert.equal(g[0].memory.length, 1);
});

test('co-invention: principles pooled from two inventors, validated by the invention engine, joint credit on the card and in the Hall', async () => {
  const { app } = mkApp('allow'); const a = await user(app, 'quin_c'), b = await user(app, 'rosa_c'); const code = 'C0DE22'.replace('0', 'D');
  await a.call('POST', `/api/v90/room/${code}/create`, { max: 4 }); await b.call('POST', `/api/v90/room/${code}/join`);
  const wid = 'sw_' + code;
  assert.equal((await a.call('POST', `/api/v90/room/${code}/draft`, { step: 'finalize', draft: 'nope' })).data.error, 'draft_not_found');
  let made = null;
  for (const [cat, form, prs, mats] of [['technological', 'tool', ['lever', 'friction'], { wood: 2, stone: 1 }], ['scientific', 'tool', ['energy_transfer', 'friction'], { wood: 2 }], ['technological', 'device', ['lever', 'friction'], { stone: 2 }], ['scientific', 'device', ['energy_transfer', 'friction'], { wood: 1, stone: 1 }]]) {
    for (const p of ['quin_c', 'rosa_c']) app.db.transaction(() => { const ex = app.explorer(wid, p); ex.bag = { wood: 9, stone: 9 }; app.saveExplorer(wid, p, ex); });
    const d = (await a.call('POST', `/api/v90/room/${code}/draft`, { step: 'create', category: cat, form, materials: mats })).data.draft;
    await a.call('POST', `/api/v90/room/${code}/draft`, { step: 'add', draft: d.id, principle: prs[0] });
    const solo = (await a.call('POST', `/api/v90/room/${code}/draft`, { step: 'finalize', draft: d.id })).data; assert.equal(solo.error, 'needs_two_inventors');
    await b.call('POST', `/api/v90/room/${code}/draft`, { step: 'add', draft: d.id, principle: prs[1] });
    const r = (await a.call('POST', `/api/v90/room/${code}/draft`, { step: 'finalize', draft: d.id })).data;
    if (r.ok) { made = r; break; }
    if (r.error) { const R = app.rooms.get(code); R.drafts = []; app.rooms.save(R); }
  }
  assert.ok(made, 'one co-invention validated');
  assert.equal(made.entry.credits.length, 2); assert.equal(made.entry.card.credits.length, 2);
  assert.ok(app.explorer(wid, 'rosa_c').inventions.some((i) => i.sig === made.inv.sig), 'co-inventor also gets it in their Codex');
  const hall = (await b.call('POST', `/api/v90/room/${code}/hall`, { entry: made.entry.id })).data; assert.equal(hall.status, 'published');
  const e = app.social.hall('x')[0]; assert.equal(e.credits.length, 2);
});

test('RoomHub: presence + interpolation acks, quick chat on by default, text chat opt-in & moderated, blocks hide, voice signalling only between permitted peers', async () => {
  const room = { code: 'ABCDEF', kind: 'party', owner: 'a', members: { a: {}, b: {}, c: {}, d: {} }, settings: { text_chat: true, party_voice: false } };
  const P = (o = {}) => sanitizePrivacy(o);
  const rels = { a: { privacy: P(), friends: ['b'], house: null, blocked: [], muted: [], display: 'A' }, b: { privacy: P(), friends: ['a'], house: 'h1', blocked: [], muted: [], display: 'B' },
    c: { privacy: P(), friends: [], house: 'h1', blocked: [], muted: [], display: 'C' }, d: { privacy: P(), friends: [], house: null, blocked: [], muted: [], display: 'D' } };
  const hub = new RoomHub(), ctx = { room, rel: (p) => rels[p], moderate: async (t) => (/stupid/.test(t) ? { ok: false, status: 'blocked', reasons: ['mild'] } : { ok: true, text: t }) };
  let t = 1000; const H = async (pid, msg) => { t += 200; return hub.handle(pid, msg, ctx, t); };
  const to = (out, p) => out.filter((d) => d.to === p).map((d) => d.msg);
  // presence: ack + clamp teleports
  const p1 = await H('a', { type: 'pos', x: 10, z: 10, seq: 1 }); assert.equal(to(p1, 'a')[0].type, 'ack'); assert.equal(to(p1, 'b')[0].x, 10);
  const p2 = await H('a', { type: 'pos', x: 60, z: 10, seq: 2 }); assert.equal(to(p2, 'a')[0].corrected, true); assert.ok(to(p2, 'a')[0].x < 15);
  // quick chat works for everyone by default
  assert.equal(to(await H('d', { type: 'quick', id: 'hello' }), 'a')[0].id, 'hello');
  assert.equal(to(await H('d', { type: 'quick', id: 'free text!' }), 'd')[0].error, 'unknown_quick');
  // text chat: off by default for sender and receivers
  assert.equal(to(await H('a', { type: 'chat', text: 'hi' }), 'a')[0].error, 'text_chat_off');
  rels.a.privacy = P({ text_chat: true }); rels.b.privacy = P({ text_chat: true });
  const ch = await H('a', { type: 'chat', text: 'hi team' }); assert.equal(to(ch, 'b')[0].text, 'hi team'); assert.equal(to(ch, 'c').length, 0); // c never opted in
  assert.equal(to(await H('a', { type: 'chat', text: 'you are stupid' }), 'a')[0].type, 'chat_blocked');
  rels.b.blocked = ['d']; assert.equal(to(await H('d', { type: 'emote', id: 'wave' }), 'b').length, 0); rels.b.blocked = [];
  // voice: privacy off => refused; strangers never; friends and same House allowed
  assert.equal(to(await H('a', { type: 'voice', on: true }), 'a')[0].error, 'voice_off_in_privacy');
  for (const p of 'abcd') rels[p].privacy = P({ ...rels[p].privacy, voice: true });
  for (const p of 'abcd') await H(p, { type: 'voice', on: true });
  const live = hub.live, ok = (x, y) => voiceAllowed(x, y, room, (p) => rels[p], live);
  assert.equal(ok('a', 'b'), true); assert.equal(ok('b', 'c'), true); assert.equal(ok('a', 'c'), false); assert.equal(ok('a', 'd'), false); assert.equal(ok('c', 'd'), false);
  const sig = await H('a', { type: 'rtc', to: 'b', kind: 'offer', data: { type: 'offer', sdp: 'v=0' } }); assert.equal(to(sig, 'b')[0].kind, 'offer');
  assert.equal(to(await H('a', { type: 'rtc', to: 'd', kind: 'offer', data: {} }), 'a')[0].error, 'voice_not_allowed');
  assert.equal(to(await H('a', { type: 'rtc', to: 'b', kind: 'ice', data: { c: 'x'.repeat(9000) } }), 'a')[0].error, 'signal_too_large');
  // owner-vouched party voice: d is not the owner's friend, so still excluded
  room.settings.party_voice = true; assert.equal(ok('a', 'd'), false); rels.d.friends = ['a']; rels.a.friends = ['b', 'd']; assert.equal(ok('b', 'd'), true);
  rels.b.blocked = ['d']; assert.equal(ok('b', 'd'), false); rels.b.blocked = [];
  const sp = await H('a', { type: 'speaking', on: true }); assert.deepEqual(new Set(sp.map((d) => d.to)), new Set(['b', 'd']));
  await H('a', { type: 'voice', on: false }); assert.equal(ok('a', 'b'), false);
  assert.equal((await hub.handle('zed', { type: 'hello' }, ctx, t))[0].msg.error, 'not_a_member');
});

test('Omniversal Leaderboard: server-authoritative scores, periods + filters, anti-cheat flags, moderated names, seasons → Hall of Legends + rewards', async () => {
  const { app, state } = mkApp('allow'); const a = await user(app, 'sam_l'), b = await user(app, 'tia_l'), c = await user(app, 'uma_l');
  const LBd = app.lb, t0 = Date.UTC(2026, 10, 12, 10);
  assert.equal(seasonOf(t0).id, '2026S6'); assert.equal(seasonOf(Date.UTC(2026, 0, 6)).id, '2026S1'); assert.equal(glickoRd(0), 350); assert.equal(glickoRd(100), 50);
  LBd.observe('sam_l', 'lux', 100, t0); LBd.observe('tia_l', 'lux', 150, t0); LBd.observe('uma_l', 'lux', 50, t0);
  LBd.observe('sam_l', 'lux', 300, t0 + 3600e3); // +200 in an hour: plausible
  let board = LBd.board({ pid: 'sam_l', category: 'lux', nowMs: t0 + 3600e3 }); assert.deepEqual(board.rows.map((r) => r.score), [300, 150, 50]); assert.equal(board.rows[0].colour, 'gold'); assert.equal(board.you.rank, 1);
  assert.equal(LBd.board({ pid: 'sam_l', category: 'lux', scope: 'season', nowMs: t0 + 3600e3 }).rows[0].score, 200); // season = gain since first seen
  assert.equal(LBd.observe('uma_l', 'lux', 50000, t0 + 3600e3 + 60e3), false); // implausible jump => flagged & hidden
  assert.ok(!LBd.board({ pid: 'sam_l', category: 'lux', nowMs: t0 + 3700e3 }).rows.some((r) => r.score === 50000));
  assert.ok(listLog(app.db, { status: 'open' }).some((e) => e.ref?.apply === 'lb_flag'));
  const flagEntry = listLog(app.db, { status: 'open' }).find((e) => e.ref?.apply === 'lb_flag');
  await req(app, 'POST', `/api/v90/admin/moderation/${flagEntry.id}`, { decision: 'dismiss' }, 'svc-token'); assert.equal(LBd.flagged('uma_l', 'lux'), false);
  // friends / house filters
  const code = (await b.call('GET', '/api/v90/social/me')).data.friend_code; await a.call('POST', '/api/v90/social/friend', { op: 'request', code }); await b.call('POST', '/api/v90/social/friend', { op: 'accept', who: 'sam_l' });
  assert.deepEqual(LBd.board({ pid: 'sam_l', category: 'lux', filter: 'friends', nowMs: t0 + 3700e3 }).rows.map((r) => r.score), [300, 150]);
  await a.call('POST', '/api/v90/house', { op: 'create', name: 'House Lumen' }); assert.equal(LBd.board({ pid: 'sam_l', category: 'house', nowMs: t0 + 3700e3 }).rows[0].name, 'House Lumen');
  // speedrun minimum time
  LBd.startRun('tia_l', 0, t0); assert.equal(LBd.finishRun('tia_l', 0, t0 + 60e3).flagged, true);
  LBd.startRun('sam_l', 0, t0); assert.equal(LBd.finishRun('sam_l', 0, t0 + 7200e3).seconds, 7200);
  // moderated display names (shown only when the player opts in)
  assert.equal((await a.call('POST', '/api/v90/leaderboard', { op: 'name', name: 'Sh1t Lord' })).data.error, 'display_name_not_allowed');
  assert.equal((await a.call('POST', '/api/v90/leaderboard', { op: 'name', name: 'Star Weaver' })).data.status, 'approved');
  assert.match(app.social.display('sam_l'), /^Explorer/); await a.call('POST', '/api/v90/social/privacy', { privacy: { hall_credit: 'name' } }); assert.equal(app.social.display('sam_l'), 'Star Weaver');
  state.verdict = 'down'; assert.equal((await b.call('POST', '/api/v90/leaderboard', { op: 'name', name: 'Moon Child' })).data.status, 'held');
  // API: server computes scores itself; rate-limited refresh
  const api = (await a.call('GET', '/api/v90/leaderboard?category=codex&scope=all&filter=global')).data; assert.equal(api.category, 'codex');
  assert.equal((await a.call('POST', '/api/v90/leaderboard', { op: 'refresh' })).status, 429);
  // season roll: archive, Hall of Legends, grand title, aura, name colour
  const next = Date.UTC(2027, 0, 20); LBd.observe('tia_l', 'lux', 160, next);
  const legends = LBd.legends(); assert.ok(legends.some((l) => l.season === '2026S6' && l.category === 'lux' && l.rank === 1 && l.title === CATEGORIES.lux.title_name));
  const rw = LBd.rewards('sam_l').map((r) => r.reward); assert.ok(rw.includes('title_luminary') && rw.includes('name_gold') && rw.includes('aura_season_2026S6'));
  assert.equal(LBd.seasons().find((s) => s.id === '2026S6').status, 'closed');
  assert.ok(Object.keys(CATEGORIES).length >= 9);
});

test('RoomHub: avatar looks are palette indices only, validated, shared in roster/joined and relayed on change', async () => {
  const { cleanLook, LOOK_MAX } = await import('../src/rooms.js');
  const { OMNI } = await import('../src/omniverse.js');
  for (const [k, n] of Object.entries(LOOK_MAX)) assert.equal(OMNI.appearance[k].length, n, `LOOK_MAX.${k} matches the omniverse palette`);
  assert.deepEqual(cleanLook({ skin: 2, hair: 3, outfit: 1, hat: 4, cape: 0, extra: 'x' }), { skin: 2, hair: 3, outfit: 1, hat: 4, cape: 0 });
  for (const bad of [null, [], { skin: 6, hair: 0, outfit: 0, hat: 0, cape: 0 }, { skin: '#fff', hair: 0, outfit: 0, hat: 0, cape: 0 }, { skin: 1 }]) assert.equal(cleanLook(bad), null);
  const room = { code: 'ABCDEF', kind: 'party', owner: 'a', members: { a: {}, b: {} }, settings: {} };
  const hub = new RoomHub(), ctx = { room, rel: (p) => ({ display: p.toUpperCase() }) };
  const look = { skin: 1, hair: 2, outfit: 3, hat: 1, cape: 2 };
  const o1 = await hub.handle('a', { type: 'hello', look }, ctx, 1000);
  assert.deepEqual(o1.find((m) => m.to === 'b').msg, { type: 'joined', id: 'a', name: 'A', look });
  const o2 = await hub.handle('b', { type: 'hello', look: { skin: 99 } }, ctx, 1200);
  const roster = o2.find((m) => m.to === 'b').msg; assert.equal(roster.type, 'roster');
  assert.deepEqual(roster.members.find((m) => m.id === 'a').look, look); assert.equal(roster.members.find((m) => m.id === 'b').look, null);
  const o3 = await hub.handle('b', { type: 'look', look: { ...look, hat: 3 } }, ctx, 1400);
  assert.deepEqual(o3, [{ to: 'a', msg: { type: 'look', id: 'b', look: { ...look, hat: 3 } } }]);
  assert.equal((await hub.handle('b', { type: 'look', look: { skin: -1 } }, ctx, 1600))[0].msg.error, 'bad_look');
  hub.leave('a'); assert.equal(hub.live.look.a, undefined);
});
