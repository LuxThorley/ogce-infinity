// P6 (local only): mulux-api Worker + Malcolm client + offline engine, all against a MOCKED Malcolm. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, validateChat, sseFromText, _resetRateLimits, LIMITS, redact, tidy } from '../worker/src/index.js';
import { createMalcolmClient, parseSSE } from '../public/js/net/malcolm.js';
import { loadPolicy, decide, decideNetwork } from '../public/js/policy/engine.js';
import { POLICY_TEXT, POLICY_SHA256 } from '../public/js/policy/pinned.js';
import { parseRules, localNarrate, localSuggest, malcolmMessages } from '../public/js/engine/narrator.js';
import * as L from '../public/js/engine/living.js';

const FAKE = 'test-token-not-real-0123456789';
const ENV = { MULUX_MALCOLM_ENABLED: 'yes', MALCOLM_OMNIAPI_TOKEN: FAKE, ALLOWED_ORIGINS: 'https://mulux.example', MALCOLM_UPSTREAM: 'https://malcolm.mock' };
function mockMalcolm(reply = { text: '["Hello, μLux."]', model: 'mock-1', provider: 'mock', ms: 3 }, status = 200) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/infinity/stream')) return new Response('data: {"event":"pulse"}\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    return new Response(JSON.stringify(reply), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { f, calls };
}
const req = (path, { method = 'GET', body, origin = 'https://mulux.example', ip = '1.1.1.1' } = {}) =>
  new Request(`https://mulux.example${path}`, { method, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), 'CF-Connecting-IP': ip } });
const deps = (m) => ({ fetch: m.f, now: () => 1000 });
const MSG = { messages: [{ role: 'user', content: 'Narrate.' }], purpose: 'narrate' };

test('worker: chat proxies to /v1/chat with the secret as Bearer, injects the claims-safe system prompt, never echoes the token', async () => {
  _resetRateLimits(); const m = mockMalcolm(); const r = await handle(req('/api/malcolm/chat', { method: 'POST', body: MSG }), ENV, deps(m));
  assert.equal(r.status, 200); const d = await r.json(); assert.equal(d.text, 'Hello, μLux.'); assert.equal(d.model, 'mock-1');
  assert.equal(m.calls[0].url, 'https://malcolm.mock/v1/chat'); assert.equal(m.calls[0].init.headers.Authorization, `Bearer ${FAKE}`);
  const up = JSON.parse(m.calls[0].init.body); assert.deepEqual(up.messages, MSG.messages); assert.match(up.system, /Never claim the world is conscious/);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://mulux.example'); assert.ok(!JSON.stringify(d).includes(FAKE));
});
test('worker: SSE stream re-emits the answer as delta events and a done event', async () => {
  _resetRateLimits(); const r = await handle(req('/api/malcolm/stream', { method: 'POST', body: MSG }), ENV, deps(mockMalcolm({ text: 'one two three four five six seven eight nine ten' })));
  assert.equal(r.headers.get('Content-Type'), 'text/event-stream'); const evs = []; for await (const e of parseSSE(r.body)) evs.push(e);
  assert.equal(evs.filter((e) => e.event === 'delta').map((e) => JSON.parse(e.data).t).join(''), 'one two three four five six seven eight nine ten'); assert.equal(evs.at(-1).event, 'done');
});
test('worker: fail-closed — disabled switch, missing secret, foreign origin, unknown route, bad bodies', async () => {
  _resetRateLimits(); const m = mockMalcolm();
  assert.equal((await handle(req('/api/malcolm/chat', { method: 'POST', body: MSG }), { ...ENV, MULUX_MALCOLM_ENABLED: 'no' }, deps(m))).status, 403);
  assert.equal((await handle(req('/api/malcolm/chat', { method: 'POST', body: MSG }), { ...ENV, MALCOLM_OMNIAPI_TOKEN: '' }, deps(m))).status, 503);
  const foreign = await handle(req('/api/malcolm/chat', { method: 'POST', body: MSG, origin: 'https://evil.example' }), ENV, deps(m));
  assert.equal(foreign.status, 403); assert.equal(foreign.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await handle(req('/api/anything'), ENV, deps(m))).status, 404);
  assert.equal((await handle(req('/api/malcolm/chat', { method: 'POST', body: '{bad' }), ENV, deps(m))).status, 400);
  assert.equal((await handle(req('/api/malcolm/chat', { method: 'POST', body: { messages: [{ role: 'system', content: 'x' }] } }), ENV, deps(m))).status, 422);
  assert.equal((await handle(req('/api/malcolm/chat', { method: 'POST', body: 'x'.repeat(LIMITS.maxBody + 1) }), ENV, deps(m))).status, 413);
  assert.equal(m.calls.length, 0, 'nothing reached Malcolm');
  assert.equal(validateChat({ messages: [{ role: 'user', content: 'x'.repeat(LIMITS.maxChars + 1) }] }) !== null, true);
  const pre = await handle(req('/api/malcolm/chat', { method: 'OPTIONS' }), ENV, deps(m)); assert.equal(pre.status, 204);
});
test('worker: rate limit (12/min per IP and route) and upstream errors map to 429 / 502', async () => {
  _resetRateLimits(); const m = mockMalcolm(); const codes = [];
  for (let i = 0; i < 14; i++) codes.push((await handle(req('/api/malcolm/chat', { method: 'POST', body: MSG }), ENV, deps(m))).status);
  assert.deepEqual([codes.filter((c) => c === 200).length, codes.filter((c) => c === 429).length], [12, 2]);
  _resetRateLimits(); assert.equal((await handle(req('/api/malcolm/chat', { method: 'POST', body: MSG }), ENV, deps(mockMalcolm({ error: 'x' }, 401)))).status, 502);
  _resetRateLimits(); let bound = 0; const env = { ...ENV, RATE_LIMITER: { limit: async () => ({ success: ++bound < 2 }) } };
  assert.equal((await handle(req('/api/malcolm/chat', { method: 'POST', body: MSG }), env, deps(m))).status, 200); assert.equal((await handle(req('/api/malcolm/chat', { method: 'POST', body: MSG }), env, deps(m))).status, 429);
});
test('worker: health never reveals the token; errors are redacted; JSON-array answers are flattened', async () => {
  const r = await handle(req('/api/healthz'), ENV, deps(mockMalcolm())); const t = await r.text(); assert.ok(!t.includes(FAKE)); assert.equal(JSON.parse(t).tokenConfigured, true);
  assert.equal(redact(`boom ${FAKE} Bearer abc.def`, ENV), 'boom [redacted] Bearer [redacted]'); assert.equal(tidy('["a","b"]'), 'a\nb'); assert.equal(tidy('plain'), 'plain');
  const p = await handle(req('/api/malcolm/pulse'), ENV, deps(mockMalcolm())); assert.equal(p.headers.get('Content-Type'), 'text/event-stream');
});
test('client ↔ worker end-to-end through a mocked fetch: health, chat, streaming', async () => {
  _resetRateLimits(); const { policy } = await loadPolicy(POLICY_TEXT, POLICY_SHA256); const m = mockMalcolm({ text: 'The world breathes in light.' });
  const fetchImpl = (path, init) => handle(new Request(`https://mulux.example${path}`, { ...init, headers: { ...(init.headers || {}), 'CF-Connecting-IP': '2.2.2.2' } }), ENV, deps(m));
  const c = createMalcolmClient({ fetchImpl, policy, decide, decideNetwork, origin: 'https://mulux.example' });
  assert.equal((await c.health()).online, true); assert.equal((await c.chat(MSG.messages)).text, 'The world breathes in light.');
  const parts = []; const s = await c.stream(MSG.messages, 'narrate', (t) => parts.push(t)); assert.equal(s.text, 'The world breathes in light.'); assert.ok(parts.length >= 1);
});
test('client offline fallback: no Worker, no policy, or a thrown fetch → offline, never a crash', async () => {
  const { policy } = await loadPolicy(POLICY_TEXT, POLICY_SHA256);
  const notFound = createMalcolmClient({ fetchImpl: async () => new Response('nope', { status: 404 }), policy, decide, decideNetwork, origin: 'http://127.0.0.1:8000' });
  assert.equal((await notFound.health()).online, false); assert.equal((await notFound.chat(MSG.messages)).ok, false);
  const throws = createMalcolmClient({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); }, policy, decide, decideNetwork, origin: 'http://x' });
  assert.match((await throws.health()).reason, /unreachable/);
  let called = 0; const noPolicy = createMalcolmClient({ fetchImpl: async () => { called++; }, policy: null, decide, decideNetwork, origin: 'http://x' });
  assert.equal((await noPolicy.stream(MSG.messages, 'narrate')).ok, false); assert.equal(called, 0, 'fail-closed: no request without a policy');
});
test('offline engine: narration graded, suggestions, rule-writing parses DSL and English and rejects junk', async () => {
  const w = L.createWorld({ seed: 144, mode: 'hybrid' }); await L.sealGenesis(w); await L.tick(w, 60);
  const n = localNarrate(w); assert.ok(n.length >= 3 && n.some((x) => x.grade === 'SPECULATION') && n.filter((x) => x.grade === 'FACT').length >= 2);
  assert.ok(localSuggest(w).length >= 1);
  const { rules, errors } = parseRules('gained <- harvest light_here\n- When hungry and rests then lost\nlost <- teleport\nfly <- harvest\nhello', w);
  assert.deepEqual(rules, [{ head: 'gained', body: ['harvest', 'light_here'] }, { head: 'lost', body: ['hungry', 'rest'] }]); assert.equal(errors.length, 3);
  w.pending = []; await L.intent(w, 'propose', { ...rules[0], source: 'Malcolm' }); assert.ok(w.pending.some((p) => p.source === 'Malcolm'));
  const msg = malcolmMessages(w, 'rules', 'about resting'); assert.equal(msg.length, 1); assert.ok(msg[0].content.length <= 7900); assert.equal(validateChat({ messages: msg, purpose: 'rules' }), null);
});
test('SSE parser follows the spec: comments, multi-line data, CRLF, an unterminated final event is discarded', async () => {
  const s = new Response(': hi\r\nevent: a\r\ndata: 1\r\ndata: 2\r\n\r\ndata: tail').body; const out = []; for await (const e of parseSSE(s)) out.push(e);
  assert.deepEqual(out.map((e) => [e.event, e.data]), [['a', '1\n2']]);
  const t = []; for await (const e of parseSSE(sseFromText('x'))) t.push(e.event); assert.deepEqual(t, ['delta', 'done']);
});
