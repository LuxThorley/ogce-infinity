// P0: repository hygiene — no secrets, no network calls, every shipped module is in the offline cache.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); if (['.git', 'node_modules', 'fixtures'].includes(f)) return []; return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(ROOT).filter((p) => /\.(js|mjs|json|html|css|md|yml|webmanifest|py|txt)$/.test(p));
const SECRET_PATTERNS = [/sk_(live|test)_[A-Za-z0-9]{10,}/, /rk_live_[A-Za-z0-9]{10,}/, /gh[pousr]_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{20,}/, /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /xox[abpr]-[A-Za-z0-9-]{10,}/, /(MALCOLMAI_LIVE_TOKEN|BUFFER_API_KEY|MALCOLM_SOCIAL_TOKEN)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{8,}/, /Bearer\s+[A-Za-z0-9._\-]{24,}/];
test('no secret-shaped strings in the repository (file and line reported, value never printed)', () => {
  const hits = [];
  for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (SECRET_PATTERNS.some((re) => re.test(line))) hits.push(`${relative(ROOT, f)}:${i + 1}`); });
  assert.deepEqual(hits, []);
});
test('client code makes no network calls (no fetch/XHR/WebSocket/EventSource/sendBeacon outside the same-origin service worker)', () => {
  const js = files.filter((f) => f.includes(join('public', 'js')));
  // v0.5: exactly one module (net/malcolm.js) may call fetch, and only through an injected fetchImpl to same-origin /api/ routes.
  for (const f of js.filter((f) => !f.endsWith(join('net', 'malcolm.js')))) assert.doesNotMatch(readFileSync(f, 'utf8'), /\bfetch\(|XMLHttpRequest|new WebSocket|new EventSource|sendBeacon/, relative(ROOT, f));
  const net = readFileSync(join(ROOT, 'public', 'js', 'net', 'malcolm.js'), 'utf8');
  assert.doesNotMatch(net, /https?:\/\/|XMLHttpRequest|WebSocket|EventSource|sendBeacon/); assert.match(net, /decideNetwork\(/); assert.match(net, /malcolm_via_worker/);
  const sw = readFileSync(join(ROOT, 'public', 'sw.js'), 'utf8'); assert.match(sw, /url\.origin !== self\.location\.origin/);
});
test('service worker caches every shipped JS module, CSS and icon', () => {
  const sw = readFileSync(join(ROOT, 'public', 'sw.js'), 'utf8');
  const shipped = walk(join(ROOT, 'public')).map((p) => './' + relative(join(ROOT, 'public'), p).split('\\').join('/')).filter((p) => /\.(js|css|png|svg|webmanifest|html)$/.test(p) && p !== './sw.js');
  for (const s of shipped) assert.ok(sw.includes(`'${s}'`), `missing from cache: ${s}`);
});
test('CSP forbids remote scripts and connections; no inline script', () => {
  const html = readFileSync(join(ROOT, 'public', 'index.html'), 'utf8');
  assert.match(html, /default-src 'self'/); assert.match(html, /connect-src 'self'/); assert.match(html, /object-src 'none'/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/); assert.doesNotMatch(html, /https?:\/\//);
});
test('required documents exist', () => { for (const f of ['README.md', 'LICENSE', 'PRIVACY.md', 'COSTS.md', 'CHANGELOG.md', '.github/workflows/ci.yml']) assert.ok(statSync(join(ROOT, f)).size > 100, f); });
