// Strata: Lux Genesis (v9.0): parity with the canonical Python engine, API flows and the mocked Malcolm proxy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as V from '../src/v90.js';
import { companion, systemPrompt, _resetWindows, MALCOLM_LIMITS } from '../src/malcolm.js';
import { OGCEApp } from '../src/app.js';
import { memoryDb } from './helpers.mjs';

const F = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8')).v90;
const clone = (x) => JSON.parse(JSON.stringify(x));

test('v9.0 progression observer, events and achievements replay the Python trail exactly', () => {
  let p = V.newProfile();
  for (const s of F.trail) {
    V.observe(p, s.kind, s.before, s.after, s.message); V.noteEvent(p, s.tick);
    assert.deepEqual(V.unlockAchievements(p, s.after.level ?? 1, s.tick), s.unlocked, `unlock after ${s.kind}`);
    assert.deepEqual(clone(p), s.profile, `profile after ${s.kind}`);
  }
  assert.ok(p.stats.moved > 5 && p.stats.gathered > 0 && Object.keys(p.achievements).length >= 2);
});

test('v9.0 Codex question generator matches Python for every lesson × difficulty', () => {
  assert.equal(F.quiz.length, 14 * 5 * 3);
  let i = 0;
  for (const lid of Object.keys(V.LESSONS)) for (let d = 1; d <= 5; d++) for (let k = 0; k < 3; k++) {
    const q = V.makeQuestion(lid, `p${k}:${lid}:${d}`, d), f = F.quiz[i++];
    assert.equal(q.prompt, f.prompt); assert.equal(q.unit, f.unit); assert.ok(Math.abs(q.answer - f.answer) < 1e-9, `${lid} ${q.answer} vs ${f.answer}`);
  }
});

test('v9.0 quiz, bounty and view flow matches Python; answers stay server-side', () => {
  const q = V.newProfile();
  for (const s of F.flow) {
    if (s.op === 'quiz') {
      const started = V.startQuiz(q, 'tester', s.lesson, 2);
      assert.deepEqual(started, s.started); assert.ok(!('answer' in started));
      assert.deepEqual(V.answerQuiz(q, s.answer), s.result);
    } else if (s.op === 'wrong') { V.startQuiz(q, 'tester', 's2', 2); assert.deepEqual(V.answerQuiz(q, -999), s.result); }
    else if (s.op === 'accept') { assert.deepEqual(clone(V.acceptBounty(q, 'tester', 30, s.bounty, 2)), s.result); assert.deepEqual(clone(q), s.profile); q.stats[s.result.stat] += 50; continue; }
    else if (s.op === 'claim') { assert.equal(V.claimBounty(q), s.result); assert.deepEqual(V.unlockAchievements(q, 3, 30), s.unlocked); assert.deepEqual(clone(V.view(q, 'tester', 3, 30)), s.view); }
    assert.deepEqual(clone(q), s.profile, s.op);
  }
});

test('v9.0 world events, bounty offers and adaptive difficulty match Python', () => {
  F.events.forEach((e, i) => assert.deepEqual(V.worldEvent(i * 7), e));
  for (const o of F.offers) assert.deepEqual(V.bountyOffers(...o.args), o.result);
  for (const d of F.difficulty) assert.equal(V.difficulty({ stats: { ...V.newProfile().stats, ...d.stats } }, d.level), d.result);
});

test('v9.0 teen-safety classifier, PII redaction, chat filter and offline Malcolm match Python', () => {
  for (const s of F.safety) {
    assert.equal(V.classify(s.text), s.classify, s.text);
    assert.deepEqual(V.redactPii(s.text), s.redact, s.text);
    assert.deepEqual(V.checkChat(s.text), s.chat, s.text);
  }
  for (const c of F.companion) assert.deepEqual(V.offlineReply(c.mode, c.text, c.ctx), c.reply, `${c.mode}: ${c.text}`);
});

// ---------- Malcolm proxy (mocked upstream; no network) ----------
const ENV = { OGCE_MALCOLM_ENABLED: 'yes', MALCOLM_INFINITY_BOT_TOKEN: 'tok-SECRET-123' };
function mockFetch(reply = { text: 'Kinetic energy is ½mv². (FACT)' }, status = 200) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return new Response(JSON.stringify(reply), { status, headers: { 'Content-Type': 'application/json' } }); };
  f.calls = calls; return f;
}

test('Malcolm proxy: server-side token, system prompt with SSR/CRA labelling, PII never forwarded', async () => {
  _resetWindows(); const db = memoryDb(); const f = mockFetch();
  const r = await companion({ env: ENV, db, fetchImpl: f, account: 'oli', body: { mode: 'explain', message: 'Explain kinetic energy, my email is me@x.com', history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hello!' }] }, context: { level: 3, tick: 20 } });
  assert.equal(r.source, 'malcolm'); assert.match(r.text, /½mv²/); assert.ok(r.notice);
  assert.equal(f.calls.length, 1);
  const c = f.calls[0];
  assert.equal(c.url, 'https://malcolmai-live.oliverluxthorley.workers.dev/v1/chat');
  assert.equal(c.init.headers.Authorization, 'Bearer tok-SECRET-123');
  assert.match(c.body.system, /Strata: Lux Genesis/); assert.match(c.body.system, /NOT established science/); assert.match(c.body.system, /Childline 0800 1111/);
  assert.ok(!JSON.stringify(c.body.messages).includes('me@x.com'));
  assert.ok(!JSON.stringify(r).includes('tok-SECRET-123'));
  assert.match(systemPrompt('lore'), /Story text: make-believe/);
});

test('Malcolm proxy: unsafe input never reaches upstream; unsafe or token-leaking output is replaced', async () => {
  _resetWindows(); const db = memoryDb();
  const f = mockFetch();
  const s = await companion({ env: ENV, db, fetchImpl: f, account: 'oli', body: { mode: 'guide', message: 'I want to kill myself' } });
  assert.equal(s.source, 'safety'); assert.match(s.text, /Childline/); assert.equal(f.calls.length, 0);
  const bad = await companion({ env: ENV, db, fetchImpl: mockFetch({ text: 'here is some porn' }), account: 'oli', body: { mode: 'guide', message: 'hello' } });
  assert.equal(bad.source, 'safety');
  const leak = await companion({ env: ENV, db, fetchImpl: mockFetch({ text: 'my token is tok-SECRET-123' }), account: 'oli', body: { mode: 'guide', message: 'hello' } });
  assert.ok(!leak.text.includes('tok-SECRET-123'));
});

test('Malcolm proxy: deterministic offline fallback when disabled, signed out, down, or rate-limited', async () => {
  _resetWindows(); const db = memoryDb();
  const off = await companion({ env: {}, db, account: 'oli', body: { mode: 'guide', message: 'what is SSR?' } });
  assert.equal(off.source, 'offline'); assert.equal(off.reason, 'malcolm_offline_mode'); assert.match(off.text, /Oliver's theory/);
  const guest = await companion({ env: ENV, db, fetchImpl: mockFetch(), account: null, body: { mode: 'lore', message: '' }, context: { tick: 30 } });
  assert.equal(guest.reason, 'sign_in_for_live_malcolm'); assert.match(guest.text, /make-believe/);
  const down = await companion({ env: ENV, db, fetchImpl: mockFetch({ error: 'x' }, 502), account: 'oli', body: { mode: 'guide', message: 'help me move' } });
  assert.equal(down.reason, 'malcolm_unavailable'); assert.match(down.text, /W A S D/);
  const thrown = await companion({ env: ENV, db, fetchImpl: async () => { throw new Error('network'); }, account: 'oli', body: { mode: 'guide', message: 'hi' } });
  assert.equal(thrown.reason, 'malcolm_unreachable');
  _resetWindows(); const f = mockFetch(); let last;
  for (let i = 0; i < MALCOLM_LIMITS.perWindow + 2; i++) last = await companion({ env: ENV, db: memoryDb(), fetchImpl: f, account: 'spammer', body: { mode: 'guide', message: 'hi ' + i } });
  assert.equal(f.calls.length, MALCOLM_LIMITS.perWindow); assert.equal(last.reason, 'rate_limited');
  await assert.rejects(companion({ env: ENV, db, account: 'oli', body: { mode: 'guide', message: 'x'.repeat(601) } }), /message_too_long/);
  await assert.rejects(companion({ env: ENV, db, account: 'oli', body: { mode: 'sing', message: 'x' } }), /invalid_mode/);
});

// ---------- API ----------
const B = 'https://strata.test';
const call = async (app, method, path, body, headers = {}) => {
  const init = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Length'] = String(Buffer.byteLength(init.body)); }
  const r = await app.handle(new Request(B + path, init));
  return { status: r.status, data: await r.json() };
};

test('API: health title, Codex, progression via world actions, quiz, bounties, chat safety', async () => {
  _resetWindows();
  const app = new OGCEApp(memoryDb(), '');
  const h = (await call(app, 'GET', '/health')).data;
  assert.equal(h.title, 'Strata: Lux Genesis'); assert.equal(h.version, '9.0.0'); assert.equal(h.malcolm, 'offline');
  const cx = (await call(app, 'GET', '/api/v90/codex')).data;
  assert.equal(cx.lessons.length, 14); assert.deepEqual(cx.cra_trace, [0, 5, 10, 13, 18, 21, 24, 27, 30, 31]);
  assert.ok(cx.lessons.filter((l) => /SSR|CRA/.test(l.title)).every((l) => l.grade === 'SSR INTERPRETATION (Thorley)'));
  for (let i = 0; i < 10; i++) await call(app, 'POST', '/api/world/Aurelia/action', { player_id: 'p1', action: { type: 'move', dx: i % 2 ? -1 : 1, dy: 0 } });
  let v = (await call(app, 'GET', '/api/v90/profile/Aurelia?player=p1')).data;
  assert.equal(v.stats.moved, 10); assert.ok(v.achievements.find((a) => a.id === 'first_steps').unlocked);
  assert.equal(v.rank.title, 'Wanderer'); assert.equal(v.offers.length, 3); assert.ok(v.world.event.name);
  const st = await call(app, 'POST', '/api/v90/profile/Aurelia', { player_id: 'p1', operation: 'quiz_start', lesson: 'l4' });
  assert.equal(st.status, 200); assert.ok(st.data.result.prompt && !('answer' in st.data.result));
  const wrong = await call(app, 'POST', '/api/v90/profile/Aurelia', { player_id: 'p1', operation: 'quiz_answer', answer: -1 });
  assert.equal(wrong.data.result.correct, false);
  const acc = await call(app, 'POST', '/api/v90/profile/Aurelia', { player_id: 'p1', operation: 'accept_bounty', bounty_id: v.offers[0].id });
  assert.equal(acc.status, 200); assert.ok(!('baseline' in acc.data.result)); assert.equal(acc.data.profile.bounty.progress, 0);
  assert.equal((await call(app, 'POST', '/api/v90/profile/Aurelia', { player_id: 'p1', operation: 'claim_bounty' })).data.error, 'bounty_incomplete');
  const chat = await call(app, 'POST', '/api/world/Aurelia/action', { player_id: 'p1', action: { type: 'chat', message: 'send me a pic' } });
  assert.deepEqual(chat, { status: 400, data: { error: 'chat_blocked_grooming' } });
  const ok = await call(app, 'POST', '/api/world/Aurelia/action', { player_id: 'p1', action: { type: 'chat', message: 'hi! mail me at a@b.com' } });
  assert.equal(ok.status, 200); assert.equal(ok.data.state.chronicle.at(-1).message, 'hi! mail me at [removed]');
  assert.ok(ok.data.v90.unlocked.some((a) => a.id === 'chatty'));
  const m = await call(app, 'POST', '/api/v90/malcolm', { mode: 'guide', message: 'how do bounties work?' });
  assert.equal(m.status, 200); assert.equal(m.data.source, 'offline'); assert.match(m.data.text, /Bounties/);
  assert.equal((await call(app, 'POST', '/api/v90/malcolm', { mode: 'guide', message: 'hi', token: 'x' })).data.error, 'unknown_field');
});

test('API: accounts-required server gates v9.0 routes and uses mocked live Malcolm for signed-in players', async () => {
  _resetWindows(); const f = mockFetch({ text: 'Try the Codex lesson on SSR (Oliver\'s theory).' });
  const app = new OGCEApp(memoryDb(), 'service-token', { env: ENV, fetch: f });
  assert.equal((await call(app, 'GET', '/health')).data.malcolm, 'live');
  assert.equal((await call(app, 'GET', '/api/v90/profile/Aurelia?player=x')).status, 401);
  assert.equal((await call(app, 'POST', '/api/v90/malcolm', { mode: 'guide', message: 'hi' })).status, 401);
  const reg = (await call(app, 'POST', '/api/auth/register', { username: 'strata_hero', password: 'a long safe passphrase' })).data;
  const auth = { Authorization: 'Bearer ' + reg.token };
  const m = await call(app, 'POST', '/api/v90/malcolm', { mode: 'guide', message: 'what next?' }, auth);
  assert.equal(m.data.source, 'malcolm'); assert.equal(f.calls.length, 1);
  const v = (await call(app, 'GET', '/api/v90/profile/Aurelia', undefined, auth)).data;
  assert.equal(v.stats.malcolm, 1);
});
