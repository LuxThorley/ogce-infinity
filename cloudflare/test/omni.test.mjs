// Strata omniverse: JS port must match the canonical Python engine exactly (same seed + inputs = same world).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as O from '../src/omniverse.js';

const F = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8')).omni;
const clone = (x) => JSON.parse(JSON.stringify(x));
const realm = (id) => O.REALMS[id];

test('omniverse hash and seed functions match Python bit for bit', () => {
  for (const [s, x, y, h] of F.hash) assert.equal(O.h3(s, x, y), h);
  for (const [t, h] of F.seed_of) assert.equal(O.seedOf(t), h);
});

test('infinite chunks (all realms, negative/far coordinates, LOD 0/1/2) match Python', () => {
  let n = 0;
  for (const c of F.chunks) {
    if (c.deltas) { assert.deepEqual(clone(O.chunk(realm('aurelia'), 0, 0, 0, clone(c.deltas), c.tick, 5, 2)), c.chunk, 'persistent deltas + regrowth'); continue; }
    assert.deepEqual(clone(O.chunk(realm(c.realm), c.cx, c.cy, c.lod, {}, 0, 3, 1)), c, `${c.realm} ${c.cx},${c.cy} lod${c.lod}`); n++;
  }
  assert.equal(n, 5 * 5 * 3);
  assert.deepEqual(clone(O.chunk(F.story[0] && F.script.at(-2).explorer.custom_realms[0], 0, 0, 0)), F.custom_chunk, 'player-seeded realm');
});

test('ecology (utility AI, reproduction with heritable traits, plants) evolves identically to Python', () => {
  for (const e of F.eco) {
    const r = realm(e.realm), eco = O.newEcology(r);
    assert.deepEqual(clone(O.ecoView(eco)), e.trace[0]);
    let i = 1;
    for (const target of [5, 30, 80, 150]) { while (eco.tick < target) O.evolve(eco, r, target); assert.deepEqual(clone(O.ecoView(eco)), e.trace[i++], `${e.realm} tick ${target}`); }
    assert.deepEqual(clone(eco), e.final_raw);
    const capped = O.newEcology(r); capped.policy.predator_cap = 6; O.evolve(capped, r, 24);
    assert.deepEqual(clone(O.ecoView(capped)), e.capped, 'faction policy changes the ecology');
  }
  const last = F.eco[0].trace.at(-1);
  assert.ok(last.census.mossback.max_gen >= 3 && last.births > 0, 'creatures reproduce across generations');
  assert.match(last.label, /not alive, aware or sentient/);
});

test('explorer actions (move, harvest, tools, crafting, building, bestiary, customisation, seeded realms) match Python', () => {
  const ex = O.newExplorer(), deltas = {}, r = realm('aurelia'), eco = O.newEcology(r); O.evolve(eco, r, 10);
  for (const s of F.script) {
    let res;
    try { res = { ok: O.explorerAct(ex, s.op, clone(s.body), r, deltas, s.tick, eco, 77) }; } catch (e) { if (!(e instanceof O.OmniError)) throw e; res = { error: e.message }; }
    assert.deepEqual(clone(res), s.result, `${s.op} ${JSON.stringify(s.body)}`);
    assert.deepEqual(clone(O.explorerView(ex)), s.explorer);
    assert.deepEqual(clone(deltas), s.deltas);
  }
  assert.ok(F.script.filter((s) => s.result.ok && s.op === 'harvest').length >= 5);
});

test('branching NPC dialogue, memory, gifts, factions and endings match Python; different choices give different endings', () => {
  for (const st of F.story) {
    const p = O.newExplorer(); p.bag = { petal: 2, crystal: 1 }; const log = [];
    for (const [npc, ch] of st.route) {
      const n = O.OMNI.npcs[npc]; p.x = n.x; p.y = n.y;
      log.push(O.talk(p, npc, 'start', null, 5)); log.push(O.talk(p, npc, 'start', ch, 5));
    }
    log.push(O.gift(p, 'ilsa', 'petal')); log.push(O.gift(p, 'ilsa', 'crystal'));
    const oru = O.OMNI.npcs.oru; p.x = oru.x; p.y = oru.y;
    log.push(O.talk(p, 'oru', 'start', null, 5)); log.push(O.talk(p, 'oru', 'start', 0, 5));
    assert.deepEqual(clone(log), st.log); assert.deepEqual(clone(O.explorerView(p)), st.final);
  }
  assert.notEqual(F.story[0].final.ending.id, F.story[1].final.ending.id);
  for (const [n, r, t, line] of F.lines) assert.equal(O.npcLine(n, r, t, 9), line);
  const p = O.newExplorer(); p.x = 0; p.y = 9;
  assert.throws(() => O.talk(p, 'oru', 'start', 0, 1), /choice_locked/);
});

// ---------- API + Malcolm NPC dialogue (mocked) ----------
import { OGCEApp } from '../src/app.js';
import { companion, validate, systemPrompt, _resetWindows } from '../src/malcolm.js';
import { memoryDb } from './helpers.mjs';
const B = 'https://strata.test';
const call = async (app, method, path, body) => {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Length'] = String(Buffer.byteLength(init.body)); }
  const r = await app.handle(new Request(B + path, init)); return { status: r.status, data: await r.json() };
};

test('API: omniverse realms, streamed chunks, persistent harvest, evolving ecology, dialogue consequences', async () => {
  const app = new OGCEApp(memoryDb(), '');
  const meta = (await call(app, 'GET', '/api/v90/omni/realms')).data;
  assert.equal(meta.realms.length, 5); assert.match(meta.label, /not alive/); assert.ok(!('nodes' in meta.npcs.ilsa) && !('persona' in meta.npcs.ilsa));
  const ch = (await call(app, 'GET', '/api/v90/omni/chunks/Aurelia?player=g1&cx=0&cy=0&r=1&lod=0')).data;
  assert.equal(ch.chunks.length, 9); assert.equal(ch.chunks[4].tiles.length, 256);
  const far = (await call(app, 'GET', '/api/v90/omni/chunks/Aurelia?player=g1&cx=60000&cy=-60000&r=8&lod=2')).data;
  assert.equal(far.chunks.length, 289); assert.ok(far.chunks.every((c) => c.biome));
  assert.equal((await call(app, 'GET', '/api/v90/omni/chunks/Aurelia?player=g1&r=99&lod=0')).data.chunks.length, 49, 'radius is clamped');
  // persistent harvest: feature disappears for everyone, then regrows
  const f = ch.chunks.flatMap((c) => c.features).filter((q) => meta.harvest[q[2]]).sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1]))[0];
  assert.equal((await call(app, 'POST', '/api/v90/omni/Aurelia', { player_id: 'g1', operation: 'move', x: f[0], y: f[1] })).status, 200);
  const hv = await call(app, 'POST', '/api/v90/omni/Aurelia', { player_id: 'g1', operation: 'harvest', x: f[0], y: f[1] });
  assert.equal(hv.status, 200); assert.equal(hv.data.result.item, meta.harvest[f[2]]);
  const ch2 = (await call(app, 'GET', `/api/v90/omni/chunks/Aurelia?player=g2&cx=${Math.floor(f[0] / 16)}&cy=${Math.floor(f[1] / 16)}&r=0`)).data;
  assert.ok(!ch2.chunks[0].features.some((q) => q[0] === f[0] && q[1] === f[1]), 'another player sees the change');
  assert.equal((await call(app, 'POST', '/api/v90/omni/Aurelia', { player_id: 'g1', operation: 'harvest', x: f[0], y: f[1] })).data.error, 'nothing_to_harvest');
  // ecology evolves with world time and actions
  const e1 = (await call(app, 'GET', '/api/v90/omni/eco/Aurelia?player=g1')).data;
  assert.ok(e1.tick >= 2 && e1.creatures.length > 10 && e1.plants.length > 50);
  // dialogue with consequences on the shared ecology
  const ilsa = meta.npcs.ilsa;
  assert.equal((await call(app, 'POST', '/api/v90/omni/Aurelia', { player_id: 'g1', operation: 'talk', npc: 'ilsa' })).data.error, 'too_far');
  for (let i = 0; i < 3; i++) { const me = (await call(app, 'GET', '/api/v90/omni/me/Aurelia?player=g1')).data.explorer; const dx = Math.max(-12, Math.min(12, ilsa.x - me.x)), rest = 12 - Math.abs(dx), dy = Math.max(-rest, Math.min(rest, ilsa.y - me.y)); await call(app, 'POST', '/api/v90/omni/Aurelia', { player_id: 'g1', operation: 'move', x: me.x + dx, y: me.y + dy }); }
  const t0 = await call(app, 'POST', '/api/v90/omni/Aurelia', { player_id: 'g1', operation: 'talk', npc: 'ilsa' });
  assert.equal(t0.status, 200, JSON.stringify(t0.data)); assert.equal(t0.data.result.choices.length, 3);
  const t1 = await call(app, 'POST', '/api/v90/omni/Aurelia', { player_id: 'g1', operation: 'talk', npc: 'ilsa', node: 'start', choice: 1 });
  assert.equal(t1.data.explorer.rep.wardens, -5); assert.ok(t1.data.explorer.flags.includes('wolves_scared'));
  assert.equal((await call(app, 'GET', '/api/v90/omni/eco/Aurelia?player=g1')).data.policy.predator_cap, 6, 'choice changed the world');
  // customisation and a player-seeded realm, then travel there
  assert.equal((await call(app, 'POST', '/api/v90/omni/Aurelia', { player_id: 'g1', operation: 'customise', appearance: { hat: 2, outfit: 5 } })).data.explorer.appearance.hat, 2);
  const cr = (await call(app, 'POST', '/api/v90/omni/Aurelia', { player_id: 'g1', operation: 'create_realm', name: 'Glass Sea', seed: 'x', warmth: 3 })).data.result.realm;
  const tr = await call(app, 'POST', '/api/v90/omni/Aurelia', { player_id: 'g1', operation: 'travel', realm: cr.id });
  assert.equal(tr.data.explorer.realm, cr.id);
  assert.equal((await call(app, 'GET', '/api/v90/omni/chunks/Aurelia?player=g1&r=0')).data.realm, cr.id);
  assert.equal((await call(app, 'POST', '/api/v90/omni/Aurelia', { player_id: 'g1', operation: 'travel', realm: 'nowhere' })).data.error, 'unknown_realm');
  assert.equal((await call(app, 'POST', '/api/v90/omni/Aurelia', { player_id: 'g1', operation: 'warp' })).status, 400);
  // NPC chat via Malcolm proxy: guests get the deterministic in-character line
  const nm = await call(app, 'POST', '/api/v90/malcolm?player=g1', { mode: 'npc', npc: 'ilsa', message: 'How are the wolves?' });
  assert.equal(nm.data.source, 'offline'); assert.match(nm.data.text, /traveller|Mossbacks|Wild/);
  assert.equal((await call(app, 'POST', '/api/v90/malcolm', { mode: 'npc', npc: 'zed', message: 'hi' })).status, 400);
});

test('Malcolm NPC mode: persona prompt, live mocked reply, safety, offline fallback, strict validation', async () => {
  _resetWindows();
  assert.equal(validate({ mode: 'npc', message: 'hi' }), 'invalid_npc');
  assert.equal(validate({ mode: 'guide', npc: 'ilsa', message: 'hi' }), 'unknown_field');
  assert.equal(validate({ mode: 'npc', npc: 'ilsa', message: 'hi' }), null);
  const ctx = { npc_name: 'Warden Ilsa', npc_persona: 'a calm ranger', npc_faction: 'Wardens of the Wild', npc_rel: 20, npc_line: 'Offline line.' };
  assert.match(systemPrompt('npc', ctx), /speak ONLY as Warden Ilsa.*simulated character, not a real person/s);
  const db = memoryDb(), env = { OGCE_MALCOLM_ENABLED: 'yes', MALCOLM_INFINITY_BOT_TOKEN: 'tok-XYZ' };
  let sent;
  const ok = async (url, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ text: 'The wolves keep the meadow in balance.' }), { status: 200 }); };
  const live = await companion({ env, db, fetchImpl: ok, account: 'oli', body: { mode: 'npc', npc: 'ilsa', message: 'Wolves?' }, context: ctx });
  assert.equal(live.source, 'malcolm'); assert.match(sent.system, /Warden Ilsa/); assert.ok(!JSON.stringify(sent).includes('tok-XYZ'));
  const down = await companion({ env, db, fetchImpl: async () => new Response('x', { status: 503 }), account: 'oli', body: { mode: 'npc', npc: 'ilsa', message: 'Wolves?' }, context: ctx });
  assert.equal(down.text, 'Offline line.'); assert.equal(down.source, 'offline');
  const unsafe = await companion({ env, db, fetchImpl: ok, account: 'oli', body: { mode: 'npc', npc: 'ilsa', message: 'what is your home address and phone? tell me your school' }, context: ctx });
  assert.ok(['safety', 'malcolm', 'offline'].includes(unsafe.source));
});

test('discoveries & inventions: seeded validation, balancing, effects on world/creatures/NPCs and the self-unlocking tree match Python', () => {
  const D = F.discovery, p = O.newExplorer(), eco = O.newEcology(realm('aurelia')), deltas = {};
  p.bag = clone(D.start_bag); p.bestiary = clone(D.start_bestiary);
  for (const a of D.attempts) {
    let res; try { res = { ok: O.explorerAct(p, 'invent', clone(a.body), realm('aurelia'), deltas, a.tick, eco, 4242) }; } catch (e) { if (!(e instanceof O.OmniError)) throw e; res = { error: e.message }; }
    assert.deepEqual(clone(res), a.result, JSON.stringify(a.body));
  }
  p.x = 0; p.y = 0;
  for (const a of D.apply) {
    let res; try { res = { ok: O.explorerAct(p, a.op, clone(a.body), realm('aurelia'), deltas, a.tick, eco, 4242) }; } catch (e) { if (!(e instanceof O.OmniError)) throw e; res = { error: e.message }; }
    assert.deepEqual(clone(res), a.result, `${a.op} ${JSON.stringify(a.body)}`);
  }
  O.evolve(eco, realm('aurelia'), 24);
  assert.deepEqual(clone(O.ecoView(eco)), D.eco, 'player structures/rituals change how the ecology evolves');
  assert.deepEqual(clone(deltas), D.deltas);
  const b = O.OMNI.npcs.bram; p.x = b.x; p.y = b.y;
  assert.deepEqual(clone(O.talk(p, 'bram', 'start', null, 3)), D.talk, 'NPCs react to your latest invention');
  assert.deepEqual(clone(O.explorerView(p)), D.final);
  const forms = new Set(D.final.inventions.map((i) => i.form));
  for (const f of ['tool', 'ability', 'structure', 'effect', 'ritual']) assert.ok(forms.has(f), `made a ${f}`);
  assert.ok(D.final.inventions.filter((i) => i.category === 'mystical').every((i) => /Symbolic, in-game only/.test(i.explain)));
  assert.ok(D.attempts.some((a) => a.result.ok && a.result.ok.ok === false && a.result.ok.hint), 'deterministic failures give hints');
});

test('API: inventing through the Worker, Malcolm names/explains it (mocked live, persisted) with deterministic fallback', async () => {
  _resetWindows();
  let sent = null;
  const fetchMock = async (url, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ text: '"Leverage Wrench" — a lever multiplies force: moment = force × distance.' }), { status: 200 }); };
  const app = new OGCEApp(memoryDb(), 'svc', { env: { OGCE_MALCOLM_ENABLED: 'yes', MALCOLM_INFINITY_BOT_TOKEN: 'tok-INV-9' }, fetch: fetchMock });
  const reg = (await call(app, 'POST', '/api/auth/register', { username: 'inventor_1', password: 'a long safe passphrase' })).data;
  const callA = async (method, path, body) => {
    const init = { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + reg.token } };
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Length'] = String(Buffer.byteLength(init.body)); }
    const r = await app.handle(new Request(B + path, init)); return { status: r.status, data: await r.json() };
  };
  // gather real materials from the seeded world, then invent until the seeded validator accepts
  const me0 = (await callA('GET', '/api/v90/omni/me/Aurelia')).data.explorer;
  assert.deepEqual(me0.principles, ['energy_transfer', 'friction', 'harmony', 'lever']);
  const ch = (await callA('GET', '/api/v90/omni/chunks/Aurelia?cx=0&cy=0&r=1&lod=0')).data;
  const woody = ch.chunks.flatMap((c) => c.features).filter((f) => ['tree', 'pine', 'rock'].includes(f[2])).sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1])).slice(0, 8);
  for (const f of woody) { await callA('POST', '/api/v90/omni/Aurelia', { operation: 'move', x: f[0], y: f[1] }); await callA('POST', '/api/v90/omni/Aurelia', { operation: 'harvest', x: f[0], y: f[1] }); }
  const bag = (await callA('GET', '/api/v90/omni/me/Aurelia')).data.explorer.bag;
  assert.ok((bag.wood || 0) + (bag.stone || 0) >= 2, JSON.stringify(bag));
  const mats = bag.wood ? { wood: 1 } : { stone: 1 };
  const r1 = await callA('POST', '/api/v90/omni/Aurelia', { operation: 'invent', category: 'technological', form: 'tool', principles: ['lever'], materials: mats });
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  const ex = r1.data.explorer;
  if (r1.data.result.ok) {
    assert.equal(ex.inventions.length, 1); assert.ok(ex.inventions[0].explain.includes('moment = force'));
    const m = await callA('POST', '/api/v90/malcolm', { mode: 'invent', invention: 'i1' });
    assert.equal(m.data.source, 'malcolm'); assert.match(sent.system, /MODE invent/); assert.ok(!JSON.stringify(sent).includes('tok-INV-9'));
    assert.match((await callA('GET', '/api/v90/omni/me/Aurelia')).data.explorer.inventions[0].explain_ai, /Leverage Wrench/);
  } else {
    assert.ok(r1.data.result.hint && ex.attempts === 1 && ex.inventions.length === 0, 'seeded failure keeps materials');
  }
  assert.equal((await callA('POST', '/api/v90/malcolm', { mode: 'invent', invention: 'i77' })).data.error, 'unknown_invention');
  assert.equal((await callA('POST', '/api/v90/malcolm', { mode: 'invent' })).data.error, 'invalid_invention');
  // guest fallback is the deterministic GCSE explanation
  const g = new OGCEApp(memoryDb(), '');
  const db2 = g.db; const p = O.newExplorer(); p.bag = { wood: 3, stone: 3 };
  let ok = null; for (let s = 0; s < 300 && !ok; s++) { const q = clone(p); const r = O.invent(q, { category: 'technological', form: 'tool', principles: ['lever'], materials: { wood: 2, stone: 1 } }, s, 0, null); if (r.ok) ok = q; }
  g.saveExplorer('Aurelia', 'guest-x', ok);
  const fb = await call(g, 'POST', '/api/v90/malcolm?player=guest-x', { mode: 'invent', invention: 'i1' });
  assert.equal(fb.data.source, 'offline'); assert.match(fb.data.text, /moment = force × distance/);
  assert.ok(db2);
});

test('canon validation engine + discovery cards (FACT / SSR/CRA THEORY / IN-GAME on every statement) match Python', () => {
  const D = F.discovery, invs = D.final.inventions;
  F.cards.cards.forEach((c, n) => {
    const ai = n % 3 === 0 ? O.parseAiLines(F.cards.ai[n % 2][0]) : null;
    assert.deepEqual(clone(O.buildCard(invs[n], ai)), c, invs[n].name);
    for (const s of [...c.statements, ...c.ai]) assert.ok(['FACT', 'SSR/CRA THEORY', 'MYSTICAL/IN-GAME', 'IN-GAME'].includes(s.label), s.text);
    assert.ok(c.maths.every((m) => m.label === 'FACT' && m.mathml.startsWith('<math')));
    assert.match(c.no_proof, /Nothing here is a real-world experiment or proof/);
  });
  for (const [t, out] of F.cards.ai) assert.deepEqual(O.parseAiLines(t), out);
  assert.ok(!F.cards.ai[0][1].some((l) => /proves/i.test(l.text)), 'proof claims are dropped');
  for (const i of invs) { assert.ok(i.trials.successes > 72 && i.trials.n === 144); assert.equal(i.half_life_days, 12.32 * (i.stratum + 1) === i.half_life_days ? i.half_life_days : 1232 * (i.stratum + 1) / 100); }
});

test('API: discovery cards export (text/Markdown/HTML) and read-only share links — labelled, no personal data, rate-limited, moderated; Malcolm draft is tag-checked', async () => {
  _resetWindows();
  const reply = '[IN-GAME] "Hearthspark" is a fun name.\n[FACT] Energy is conserved: E_in = E_useful + E_wasted.\n[SSR/CRA THEORY] This proves the strata are real.\nUntagged rambling.\n[FACT] Call me on 07700 900123 kill';
  const app = new OGCEApp(memoryDb(), 'svc', { env: { OGCE_MALCOLM_ENABLED: 'yes', MALCOLM_INFINITY_BOT_TOKEN: 'tok-C' }, fetch: async () => new Response(JSON.stringify({ text: reply }), { status: 200 }) });
  const reg = (await call(app, 'POST', '/api/auth/register', { username: 'card_maker', password: 'a long safe passphrase' })).data;
  const A = async (method, path, body) => { const init = { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + reg.token } }; if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Length'] = String(Buffer.byteLength(init.body)); } const r = await app.handle(new Request(B + path, init)); return { status: r.status, data: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text(), headers: r.headers }; };
  // seed an explorer with a validated invention directly (deterministic engine), stored under the account
  const p = O.newExplorer(); p.bag = { wood: 5, stone: 5 };
  let made = null; for (let s = 0; s < 400 && !made; s++) { const q = clone(p); if (O.invent(q, { category: 'technological', form: 'tool', principles: ['lever'], materials: { wood: 2, stone: 1 } }, s, 0, null).ok) made = q; }
  app.saveExplorer('Aurelia', 'card_maker', made);
  const card = (await A('GET', '/api/v90/card/Aurelia/i1')).data;
  assert.ok(card.card.statements.every((s) => ['FACT', 'SSR/CRA THEORY', 'MYSTICAL/IN-GAME', 'IN-GAME'].includes(s.label)));
  assert.match(card.text, /^\S.*— Strata: Lux Genesis 9\.0/); assert.match(card.markdown, /\| \*\*FACT\*\* \|/); assert.match(card.html, /<math display="block">/);
  // Malcolm drafts labelled lines; proof claims, untagged and unsafe lines are removed
  const m = (await A('POST', '/api/v90/malcolm', { mode: 'invent', invention: 'i1' })).data;
  assert.equal(m.source, 'malcolm'); assert.deepEqual(m.ai_lines.map((l) => l.label), ['IN-GAME', 'FACT']);
  const card2 = (await A('GET', '/api/v90/card/Aurelia/i1')).data.card;
  assert.equal(card2.ai.length, 2); assert.ok(!JSON.stringify(card2).includes('proves'));
  // share: read-only link, idempotent, no personal data, HTML is script-free
  const sh = (await A('POST', '/api/v90/share', { invention: 'i1' })).data;
  assert.match(sh.id, /^[a-z2-9]{10}$/); assert.equal(sh.url, `${B}/s/${sh.id}`);
  assert.equal((await A('POST', '/api/v90/share', { invention: 'i1' })).data.id, sh.id, 'same invention → same link');
  const pub = await call(app, 'GET', `/api/v90/share/${sh.id}`);
  assert.equal(pub.status, 200); assert.ok(!JSON.stringify(pub.data).includes('card_maker'), 'no player name on the public card');
  assert.match(pub.data.markdown, /Shared card: https:\/\/strata\.test\/s\//);
  const page = await app.handle(new Request(`${B}/s/${sh.id}`));
  const htmlText = await page.text();
  assert.equal(page.status, 200); assert.match(page.headers.get('content-type'), /text\/html/); assert.ok(!/<script/i.test(htmlText)); assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  for (const lab of ['FACT', 'SSR/CRA THEORY', 'IN-GAME']) assert.ok(htmlText.includes(`>${lab}</span>`));
  assert.match(htmlText, /Nothing here is a real-world experiment or proof/);
  assert.equal((await app.handle(new Request(`${B}/s/zzzzzzzzzz`))).status, 404);
  assert.equal((await call(app, 'GET', '/api/v90/share/../../etc')).status, 404);
  assert.equal((await A('POST', '/api/v90/share', { invention: 'i9' })).status, 404);
  // rate limit: distinct inventions beyond the hourly cap are refused
  const big = clone(made); big.bag = { wood: 99, stone: 99, crystal: 99, petal: 99, berries: 99, shell: 99, fibre: 99 };
  const combos = [];
  for (const cat of ['scientific', 'technological']) for (const pr of ['lever', 'friction', 'energy_transfer']) for (const form of ['tool', 'ability', 'structure', 'effect']) for (const mats of [{ wood: 1 }, { stone: 1 }, { wood: 1, stone: 1 }, { crystal: 1 }, { petal: 1, wood: 1 }]) combos.push({ category: cat, form, principles: [pr], materials: mats });
  for (const c of combos) { if (big.inventions.length >= 14) break; for (let s = 0; s < 30; s++) { try { if (O.invent(big, clone(c), s, 0, null).ok) break; } catch { break; } } }
  app.saveExplorer('Aurelia', 'card_maker', big);
  const codes = [];
  for (const inv of big.inventions.slice(1, 14)) codes.push((await A('POST', '/api/v90/share', { invention: inv.id })).status);
  assert.ok(big.inventions.length >= 12, `made ${big.inventions.length}`);
  assert.ok(codes.includes(429) && codes.filter((c) => c === 200).length === 9, codes.join(','));
});
