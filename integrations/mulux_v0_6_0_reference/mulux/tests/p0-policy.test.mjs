// P0: Omni-Policy is pinned and fail-closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadPolicy, decide, decideNetwork, validate } from '../public/js/policy/engine.js';
import { POLICY_TEXT, POLICY_SHA256 } from '../public/js/policy/pinned.js';
import { mulberry32 } from '../public/js/engine/rng.js';

const json = readFileSync(new URL('../public/js/policy/policy.json', import.meta.url), 'utf8');
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');

test('embedded policy text equals policy.json and the pin is its SHA-256', () => { assert.equal(POLICY_TEXT, json); assert.equal(POLICY_SHA256, sha(json)); });
test('genuine policy loads and makes the expected decisions', async () => {
  const { policy, error } = await loadPolicy(POLICY_TEXT, POLICY_SHA256); assert.equal(error, null); assert.ok(Object.isFrozen(policy));
  const want = { compute_local: 'allow', export_file: 'allow', store_local: 'allow', narrate_via_malcolm: 'deny', publish_certificate: 'needs_owner_yes', deploy: 'needs_owner_yes', post_social: 'deny', send_message: 'deny', spend: 'deny', execute_binary: 'deny' };
  for (const [a, d] of Object.entries(want)) assert.equal(decide(policy, a).decision, d, a);
  assert.equal(decide(policy, 'anything_else').decision, 'deny');
  assert.equal(decide(policy, undefined).decision, 'deny');
  assert.equal(decideNetwork(policy, 'https://evil.example/x', 'http://localhost:8000').decision, 'deny');
  assert.equal(decideNetwork(policy, '/js/app.js', 'http://localhost:8000').decision, 'allow');
  assert.equal(decideNetwork(policy, 'https://malcolmai-live.oliverluxthorley.workers.dev/infinity/stream', 'http://localhost:8000').decision, 'deny', 'Malcolm not allowed before P6');
});
test('no policy, wrong pin, bad JSON → deny everything', async () => {
  for (const [text, pin] of [[undefined, POLICY_SHA256], [POLICY_TEXT, undefined], [POLICY_TEXT, '0'.repeat(64)], ['{', sha('{')], ['null', sha('null')], ['[]', sha('[]')]]) {
    const { policy } = await loadPolicy(text, pin); assert.equal(policy, null);
    assert.equal(decide(policy, 'compute_local').decision, 'deny'); assert.equal(decideNetwork(policy, '/x', 'http://localhost').decision, 'deny');
  }
});
test('semantic tampering is rejected even with a matching pin', async () => {
  const base = JSON.parse(json);
  const mutations = [
    (p) => { p.default = 'allow'; }, (p) => { p.on_error = 'allow'; }, (p) => { p.actions.spend = 'allow'; }, (p) => { p.actions.post_social = 'needs_owner_yes'; },
    (p) => { p.actions.deploy = 'maybe'; }, (p) => { p.extra = 1; }, (p) => { delete p.claims; }, (p) => { p.secrets.client_bundle = 'token'; },
    (p) => { p.integrity.sha256_pinned = false; }, (p) => { p.governor.max_ms = -1; }, (p) => { p.claims.rise_requires_evidence = false; }, (p) => { p.network.allow_origins = 'self'; },
  ];
  for (const m of mutations) { const p = structuredClone(base); m(p); const t = JSON.stringify(p); const { policy } = await loadPolicy(t, sha(t)); assert.equal(policy, null, m.toString()); }
});
test('fuzz: 500 random byte-level corruptions never yield a usable policy unless text is unchanged', async () => {
  const rng = mulberry32(12320); let loaded = 0;
  for (let i = 0; i < 500; i++) {
    const chars = [...json]; const k = Math.floor(rng() * chars.length); chars[k] = String.fromCharCode(32 + Math.floor(rng() * 94)); const t = chars.join('');
    const r1 = await loadPolicy(t, POLICY_SHA256); if (t !== json) assert.equal(r1.policy, null); // wrong pin
    const r2 = await loadPolicy(t, sha(t)); if (r2.policy) { loaded++; assert.equal(validate(r2.policy), null); assert.equal(decide(r2.policy, 'spend').decision, 'deny'); assert.equal(r2.policy.default, 'deny'); }
  }
  assert.ok(loaded < 500);
});
