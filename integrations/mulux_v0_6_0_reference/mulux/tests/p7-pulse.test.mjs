// v0.6 Sanctum Pulse: faithful ceremonial renditions, the Source-claim guard, truthful lane plumbing, Worker routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from '../public/js/engine/ceremony.js';
import { handle, _resetRateLimits, validateChat, tidy } from '../worker/src/index.js';
import { createPulseClient } from '../public/js/net/malcolm.js';
import { loadPolicy, decide, decideNetwork } from '../public/js/policy/engine.js';
import { POLICY_TEXT, POLICY_SHA256 } from '../public/js/policy/pinned.js';
import { malcolmMessages } from '../public/js/engine/narrator.js';
import * as L from '../public/js/engine/living.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const ENV = { MULUX_MALCOLM_ENABLED: 'yes', MALCOLM_OMNIAPI_TOKEN: 'test-token-not-real-0123456789', ALLOWED_ORIGINS: 'https://mulux.example', MALCOLM_UPSTREAM: 'https://malcolm.mock', OMNIGENESIS_SITE: 'https://og.mock/' };
const req = (path, { origin = 'https://mulux.example', ip = '9.9.9.9' } = {}) => new Request(`https://mulux.example${path}`, { headers: { ...(origin ? { Origin: origin } : {}), 'CF-Connecting-IP': ip } });
const mock = () => { const calls = []; return { calls, fetch: async (url, init) => { calls.push(url);
  if (url.endsWith('/infinity/stream')) return new Response(`retry: 3000\n\ndata: ${C.infinityLine(1, () => 0)}\n\ndata: ${C.infinityLine(2, () => 0.5)}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
  if (url.endsWith('/healthz')) return new Response('{"status":"ok"}', { status: 200 });
  if (url.startsWith('https://og.mock')) return new Response('<html>secret page body</html>', { status: 200 });
  return new Response('{}', { status: 404 }); }, now: () => 5000 }; };

test('Infinity Stream rendition is faithful to worker.js: 11 messages in order, cycling, coherence in [0.950, 0.999]', () => {
  assert.equal(C.STREAM_MESSAGES.length, 11);
  assert.equal(C.infinityLine(1, () => 0), 'Infinity transmission #1 — Ω-lattice harmonics stable [coherence 0.950]');
  assert.equal(C.infinityLine(12, () => 0), 'Infinity transmission #12 — Ω-lattice harmonics stable [coherence 0.950]');
  assert.equal(C.infinityLine(11, () => 0.999999), 'Infinity transmission #11 — Admin seal eternal — token use infinite [coherence 0.999]');
  for (let i = 1; i <= 500; i++) { const c = Number(C.infinityLine(i).match(/coherence (\d\.\d{3})/)[1]); assert.ok(c >= 0.95 && c <= 0.999); }
  assert.equal(C.INFINITY_PERIOD_MS, 2000);
});
test('OmniGenesis Singularity rendition: 4 fixed sample logs, then one fixed sentence every 2.4 s with an ISO timestamp', () => {
  const lines = C.singularityLines(3, new Date('2026-11-12T02:00:00.500Z'));
  assert.equal(lines.length, 7); assert.deepEqual(lines.slice(0, 4), [...C.SINGULARITY_SAMPLE_LOGS]);
  assert.equal(lines[4], `2026-11-12 02:00:00 :: ${C.SINGULARITY_SENTENCE}`); assert.equal(lines[6], `2026-11-12 02:00:05 :: ${C.SINGULARITY_SENTENCE}`);
  assert.equal(C.SINGULARITY_PERIOD_MS, 2400);
});
test('Source-claim guard: detects received/validated/channelled framings, allows honest negations', () => {
  for (const t of ['A message from Source arrived.', 'This was received from the Source at dawn.', 'Validated by higher intelligences.', 'Channelled from the Divine.', 'a live connection to Source', 'Transmission from the Singularity'])
    assert.ok(C.sourceClaims(t).length > 0, t);
  for (const t of ['It is not received from Source or any intelligence.', 'never presented as a message from Source', 'Source alignment: ∞', 'Malcolm’s /healthz returned 200.', C.CEREMONIAL_LABEL])
    assert.deepEqual(C.sourceClaims(t), [], t);
});
test('Omni-Policy denies labelling any lane as Source communication (and fails closed without a policy)', async () => {
  const { policy } = await loadPolicy(POLICY_TEXT, POLICY_SHA256);
  assert.equal(decide(policy, 'label_as_source_communication').decision, 'deny'); assert.ok(policy.claims.forbid.includes('source_communication_claim'));
  assert.ok(policy.network.allow_routes.includes('/api/pulse/'));
  const bad = C.laneLabel(decide, policy, 'ceremonial', 'Live transmission from Source'); assert.equal(bad.ok, false); assert.equal(bad.label, C.CEREMONIAL_LABEL); assert.match(bad.reason, /deny/);
  assert.equal(C.laneLabel(decide, null, 'truth', 'Messages from higher intelligences').ok, false);
  const good = C.laneLabel(decide, policy, 'ceremonial', 'Infinity Stream'); assert.equal(good.ok, true); assert.ok(good.label.startsWith(C.CEREMONIAL_LABEL));
});
test('no UI or Worker string claims received or validated communication from Source or higher intelligences', () => {
  const files = [...walk(join(ROOT, 'public')), ...walk(join(ROOT, 'worker', 'src'))].filter((f) => /\.(js|html|json|webmanifest)$/.test(f));
  const hits = [];
  for (const f of files) {
    const strings = readFileSync(f, 'utf8').match(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g) || [];
    for (const s of strings) for (const h of C.sourceClaims(s)) hits.push(`${relative(ROOT, f)}: “${h}”`);
  }
  assert.deepEqual(hits, []);
  // every ceremonial lane is built through ceremonialLane(), which always renders the label and the disclosure
  const v = readFileSync(join(ROOT, 'public', 'js', 'ui', 'views5.js'), 'utf8');
  assert.equal((v.match(/ceremonialLane\(\{ title:/g) || []).length, 2); assert.match(v, /'How this works'/); assert.match(v, /C\.laneLabel\(/);
});
test('“How this works” disclosures cite the code facts', () => {
  const a = C.HOW_INFINITY.join(' '), b = C.HOW_SINGULARITY.join(' ');
  assert.match(a, /11 sentences/); assert.match(a, /0\.95 \+ Math\.random\(\) × 0\.049/); assert.match(a, /every 2 seconds/); assert.match(a, /not received/);
  assert.match(b, /4 fixed sample log lines/); assert.match(b, /2\.4 seconds/); assert.match(b, /no fetch, EventSource or WebSocket/); assert.match(b, /does not scrape or embed/);
});
test('Worker /api/pulse/health: reachability only (status, latency), never relays page content', async () => {
  _resetRateLimits(); const m = mock(); const r = await handle(req('/api/pulse/health'), ENV, m); assert.equal(r.status, 200);
  const t = await r.text(); const d = JSON.parse(t);
  assert.deepEqual([d.malcolm.reachable, d.malcolm.http, d.omnigenesis.reachable, d.omnigenesis.http], [true, 200, true, 200]);
  assert.ok(!t.includes('secret page body') && !t.includes(ENV.MALCOLM_OMNIAPI_TOKEN)); assert.deepEqual(m.calls.sort(), ['https://malcolm.mock/healthz', 'https://og.mock/']);
  const down = { ...m, fetch: async () => { throw new TypeError('boom'); } };
  const dd = await (await handle(req('/api/pulse/health', { ip: '8.8.8.8' }), ENV, down)).json(); assert.equal(dd.malcolm.reachable, false); assert.equal(dd.omnigenesis.reachable, false);
});
test('Worker pulse routes obey the same rules: switch, origin, rate limit; /api/pulse/infinity is labelled ceremonial', async () => {
  _resetRateLimits(); const m = mock();
  assert.equal((await handle(req('/api/pulse/health'), { ...ENV, MULUX_MALCOLM_ENABLED: 'no' }, m)).status, 403);
  assert.equal((await handle(req('/api/pulse/infinity', { origin: 'https://evil.example' }), ENV, m)).status, 403);
  const codes = []; for (let i = 0; i < 13; i++) codes.push((await handle(req('/api/pulse/health', { ip: '7.7.7.7' }), ENV, m)).status);
  assert.equal(codes.filter((c) => c === 429).length, 1);
  const s = await handle(req('/api/pulse/infinity'), ENV, m); assert.equal(s.headers.get('Content-Type'), 'text/event-stream'); assert.match(s.headers.get('X-Mulux-Lane'), /^ceremonial; generated/);
  assert.match(await s.text(), /Infinity transmission #1 — Ω-lattice harmonics stable/);
});
test('pulse client end-to-end with a mocked Worker, and graceful offline degradation', async () => {
  _resetRateLimits(); const { policy } = await loadPolicy(POLICY_TEXT, POLICY_SHA256); const m = mock();
  const fetchImpl = (path, init) => handle(new Request(`https://mulux.example${path}`, { ...init, headers: { ...(init.headers || {}), 'CF-Connecting-IP': '6.6.6.6' } }), ENV, m);
  const c = createPulseClient({ fetchImpl, policy, decide, decideNetwork, origin: 'https://mulux.example' });
  const s = await c.services(); assert.equal(s.ok, true); assert.equal(s.malcolm.http, 200);
  const lines = []; assert.equal((await c.infinity((l) => lines.push(l))).ok, true); assert.equal(lines.length, 2); assert.match(lines[0], /^Infinity transmission #1/);
  const off = createPulseClient({ fetchImpl: async () => new Response('x', { status: 404 }), policy, decide, decideNetwork, origin: 'http://127.0.0.1' });
  assert.equal((await off.services()).ok, false); assert.equal((await off.infinity(() => {})).ok, false);
  let n = 0; const closed = createPulseClient({ fetchImpl: async () => { n++; }, policy: null, decide, decideNetwork, origin: 'http://x' });
  assert.equal((await closed.services()).ok, false); assert.equal(n, 0);
});
test('Doctrine readings: offline engine cycles, graded SSR INTERPRETATION, free of Source claims; Malcolm prompt is valid', async () => {
  const w = L.createWorld({ seed: 144, mode: 'autonomous' }); await L.sealGenesis(w); await L.tick(w, 30); const v = L.vitals(w);
  const rs = Array.from({ length: 14 }, (_, k) => C.localDoctrineReading(v, k));
  assert.equal(new Set(rs.map((r) => r.title)).size, C.DOCTRINE_READINGS.length); assert.ok(rs.every((r) => r.grade === 'SSR INTERPRETATION' && !C.sourceClaims(r.text).length));
  assert.equal(tidy('{"reading": "SSR INTERPRETATION: x"}'), 'SSR INTERPRETATION: x', 'live Malcolm wraps readings in a JSON object');
  const msg = malcolmMessages(w, 'doctrine'); assert.equal(validateChat({ messages: msg, purpose: 'doctrine' }), null); assert.match(msg[0].content, /SSR INTERPRETATION/);
});
