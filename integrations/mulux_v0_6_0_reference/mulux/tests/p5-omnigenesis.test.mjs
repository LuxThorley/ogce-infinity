// P5: OmniGenesis Sovereign logic, reimplemented. Expected values are derived by reading the recovered main.py
// (bytecode-identical to the bundled script); the executable and the extracted code are never run.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as OG from '../public/js/engine/omnigenesis.js';
import { loadPolicy, decide } from '../public/js/policy/engine.js';
import { POLICY_TEXT, POLICY_SHA256 } from '../public/js/policy/pinned.js';

test('_read_env_file: comments, blanks, no "=" skipped; split on first "="; both sides stripped', () => {
  assert.deepEqual(OG.parseEnvFile('# c\n\n  A = 1 \nB=x=y\nnoequals\r\nC=\n #D=2'), { A: '1', B: 'x=y', C: '' });
});
test('load_env_defaults is setdefault: existing values win', () => { assert.deepEqual(OG.applyEnvDefaults({ A: 'env' }, { A: 'file', B: 'file' }), { A: 'env', B: 'file' }); });
test('_mask keeps 6 characters then …******; short values fully starred; empty → ""', () => {
  assert.equal(OG.mask(''), ''); assert.equal(OG.mask('abc'), '***'); assert.equal(OG.mask('abcdef'), '******'); assert.equal(OG.mask('abcdefgh'), 'abcdef…******');
});
test('configuration block: trailing slashes stripped, Ollama falls back to Malcolm URL, float timeouts', () => {
  const c = OG.configFrom({ MALCOLM_BASE_URL: ' https://m.example/// ', MALCOLM_TIMEOUT: '12.5' });
  assert.equal(c.MALCOLM_BASE_URL, 'https://m.example'); assert.equal(c.OLLAMA_BASE_URL, 'https://m.example'); assert.equal(c.MALCOLM_TIMEOUT, 12.5); assert.equal(c.OLLAMA_TIMEOUT, 60);
  assert.equal(c.APP_TITLE, 'OmniGenesis Sovereign'); assert.throws(() => OG.configFrom({ OLLAMA_TIMEOUT: 'soon' }));
});
test('pick_host_port: default 127.0.0.1:8000; invalid PORT warns; busy port → ephemeral', () => {
  assert.deepEqual(OG.pickHostPort({}, () => true), { host: '127.0.0.1', port: 8000, warnings: [] });
  assert.equal(OG.pickHostPort({ PORT: 'x' }, () => true).warnings[0], "Invalid PORT='x', using default 8000");
  assert.equal(OG.pickHostPort({ PORT: '9000' }, (h, p) => p === 0).port, 'ephemeral');
});
test('/info masks the key and lists the endpoints; 8 routes recovered', () => {
  const i = OG.info(OG.configFrom({ MALCOLM_API_KEY: 'demo-not-a-real-key' }));
  assert.equal(i.env.MALCOLM_API_KEY, 'demo-n…******'); assert.equal(i.version, '1.1.0'); assert.deepEqual(i.endpoints.ollama, ['/ollama/generate']); assert.equal(OG.ROUTES.length, 8);
});
test('malcolm_optimize body rules: instruction/text strings raw, bare string raw, otherwise JSON', () => {
  const c = OG.configFrom({ MALCOLM_BASE_URL: 'https://m.example', MALCOLM_API_KEY: 'demo-not-a-real-key' });
  assert.deepEqual([OG.buildMalcolmOptimize(c, { instruction: 'go' }).body, OG.buildMalcolmOptimize(c, { text: 't' }).body, OG.buildMalcolmOptimize(c, 's').body], ['go', 't', 's']);
  const j = OG.buildMalcolmOptimize(c, { instruction: 5 }); assert.equal(j.encoding, 'json'); assert.equal(j.headers['Content-Type'], 'application/json');
  assert.equal(j.headers.Authorization, 'Bearer demo-n…******', 'previews never carry the real key'); assert.equal(j.url, 'https://m.example/optimize');
  assert.deepEqual(JSON.parse(OG.buildMalcolmCommand(c, 'heal').body), { command: 'heal' }); assert.equal(OG.buildMalcolmCommand(c, {}).url, 'https://m.example/omni/command');
  assert.throws(() => OG.buildMalcolmHealth(OG.configFrom({})), (e) => e.status === 400 && /MALCOLM_BASE_URL is not configured/.test(e.detail));
});
test('ollama_generate: 400 without URL/model, 422 without prompt, passthrough of 5 optional keys only, stream false', () => {
  assert.throws(() => OG.buildOllamaGenerate(OG.configFrom({}), { prompt: 'x' }), (e) => e.status === 400);
  const c = OG.configFrom({ OLLAMA_BASE_URL: 'http://o.example/', OLLAMA_MODEL: 'llama3' });
  assert.throws(() => OG.buildOllamaGenerate(c, {}), (e) => e.status === 422 && e.detail === 'Missing required field: prompt');
  const r = JSON.parse(OG.buildOllamaGenerate(c, { prompt: 'p', system: 's', options: { t: 1 }, evil: 1 }).body);
  assert.deepEqual(r, { model: 'llama3', prompt: 'p', stream: false, system: 's', options: { t: 1 } });
  assert.deepEqual(OG.normaliseOllama('m', { response: 'hi' }), { model: 'm', result: 'hi', raw: { response: 'hi' } }); assert.deepEqual(OG.normaliseOllama('m', [1]), { model: 'm', raw: [1] });
});
test('bridge is fail-closed: previews only, Omni-Policy denies both targets, nothing is sent', async () => {
  const { policy } = await loadPolicy(POLICY_TEXT, POLICY_SHA256); const c = OG.configFrom({ MALCOLM_BASE_URL: 'https://m.example', OLLAMA_MODEL: 'x' });
  for (const [t, b] of [['malcolm', () => OG.buildMalcolmHealth(c)], ['ollama', () => OG.buildOllamaGenerate(c, { prompt: 'p' })]]) {
    const r = OG.bridge(decide, policy, t, b); assert.equal(r.sent, false); assert.equal(r.decision, 'deny'); assert.ok(r.request);
  }
  assert.equal(OG.bridge(decide, null, 'malcolm', () => ({})).decision, 'deny');
});
