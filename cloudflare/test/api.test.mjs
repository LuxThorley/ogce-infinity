// End-to-end HTTP API tests of the Worker app (same contract as ogce4/v70/server.py).
import test from 'node:test';
import assert from 'node:assert/strict';
import { OGCEApp } from '../src/app.js';
import { memoryDb } from './helpers.mjs';

const B = 'https://ogce.test';
const call = async (app, method, path, body, headers = {}) => {
  const init = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Length'] = String(Buffer.byteLength(init.body)); }
  const r = await app.handle(new Request(B + path, init));
  return { status: r.status, data: await r.json() };
};

test('guest mode (no service token): health, world, actions, v8.2 character, μLux', async () => {
  const app = new OGCEApp(memoryDb(), '');
  assert.equal((await call(app, 'GET', '/health')).data.version, '9.0.0');
  const w = await call(app, 'GET', '/api/world/Aurelia');
  assert.equal(w.status, 200); assert.equal(w.data.state.seed, 707);
  const mv = await call(app, 'POST', '/api/world/Aurelia/action', { player_id: 'p1', action: { type: 'move', dx: 1, dy: 0 } });
  assert.equal(mv.status, 200); assert.equal(mv.data.state.players.p1.x, 3);
  const bad = await call(app, 'POST', '/api/world/Aurelia/action', { player_id: 'p1', action: { type: 'move', dx: 2, dy: 0 } });
  assert.deepEqual(bad, { status: 400, data: { error: 'movement_must_be_one_cardinal_tile' } });
  const ch = await call(app, 'POST', '/api/v82/world/AURELIA', { operation: 'character', character_id: 'hero', name: 'Hero' });
  assert.equal(ch.status, 200, JSON.stringify(ch.data)); assert.equal(ch.data.result.owner, 'guest');
  const cast = await call(app, 'POST', '/api/v82/world/AURELIA', { operation: 'cast', character_id: 'hero', spell: 'verdant_mend' });
  assert.equal(cast.data.result.character.mana, 50);
  assert.equal((await call(app, 'POST', '/api/v82/world/AURELIA', { operation: 'nope', character_id: 'hero' })).data.error, 'unknown_v82_operation');
  const g = await call(app, 'GET', '/api/v82/world/AURELIA'); assert.equal(g.data.ledger.valid, true);
  const m = await call(app, 'GET', '/api/mulux/world/Aurelia'); assert.equal(m.data.integrity.valid, true);
  const t = await call(app, 'POST', '/api/mulux/world/Aurelia', { operation: 'tick', count: 12 }); assert.equal(t.data.snapshot.tick, 12);
  const rc = await call(app, 'POST', '/api/mulux/world/Aurelia', { operation: 'receipt' }); assert.match(rc.data.receipt.sha256, /^[0-9a-f]{64}$/);
  const gen = await call(app, 'POST', '/api/mulux/world/Aurelia', { operation: 'genesis', atoms: ['a', 'b'], axioms: ['a'], rules: [{ then: 'b', if: ['a'] }] });
  assert.deepEqual(gen.data.closure, ['a', 'b']);
  assert.equal((await call(app, 'POST', '/api/mulux/world/Aurelia', { operation: 'policy', action: 'spend' })).data.decision, 'deny');
  assert.equal((await call(app, 'GET', '/nope')).status, 404);
});

test('service token set: guests are refused, accounts can play and own characters', async () => {
  const app = new OGCEApp(memoryDb(), 'x'.repeat(40));
  assert.equal((await call(app, 'POST', '/api/world/Aurelia/action', { player_id: 'p1', action: { type: 'advance' } })).status, 401);
  assert.equal((await call(app, 'GET', '/api/v82/world/AURELIA')).status, 401);
  assert.equal((await call(app, 'POST', '/api/auth/register', { username: 'ab', password: 'x' })).data.error, 'username_must_be_3_to_24_letters_numbers_or_underscore');
  const reg = await call(app, 'POST', '/api/auth/register', { username: 'Hero_1', password: 'correct horse battery' });
  assert.equal(reg.status, 200); assert.equal(reg.data.username, 'hero_1');
  assert.equal((await call(app, 'POST', '/api/auth/register', { username: 'hero_1', password: 'correct horse battery' })).data.error, 'account_already_exists');
  assert.equal((await call(app, 'POST', '/api/auth/login', { username: 'hero_1', password: 'wrong password!!' })).data.error, 'invalid_credentials');
  const login = await call(app, 'POST', '/api/auth/login', { username: 'hero_1', password: 'correct horse battery' });
  const H = { Authorization: 'Bearer ' + login.data.token };
  const act = await call(app, 'POST', '/api/world/Aurelia/action', { action: { type: 'move', dx: 0, dy: 1 } }, H);
  assert.equal(act.status, 200); assert.ok(act.data.state.players.hero_1);
  assert.equal((await call(app, 'POST', '/api/world/Aurelia/action', { player_id: 'other', action: { type: 'advance' } }, H)).status, 403);
  const ch = await call(app, 'POST', '/api/v82/world/AURELIA', { operation: 'character', character_id: 'h1', name: 'H' }, H);
  assert.equal(ch.data.result.owner, 'hero_1');
  const svc = await call(app, 'POST', '/api/world/Aurelia/action', { player_id: 'bot', action: { type: 'advance' } }, { Authorization: 'Bearer ' + 'x'.repeat(40) });
  assert.equal(svc.status, 200);
});

test('persistence survives a fresh app instance over the same database', async () => {
  const db = memoryDb();
  const a = new OGCEApp(db, '');
  await call(a, 'POST', '/api/v82/world/R', { operation: 'character', character_id: 'z', name: 'Z' });
  await call(a, 'POST', '/api/mulux/world/R', { operation: 'tick', count: 5 });
  await call(a, 'POST', '/api/world/R/action', { player_id: 'p', action: { type: 'advance' } });
  const b = new OGCEApp(db, '');
  assert.equal((await call(b, 'GET', '/api/v82/world/R')).data.characters[0].id, 'z');
  assert.equal((await call(b, 'GET', '/api/mulux/world/R')).data.snapshot.tick, 5);
  assert.equal((await call(b, 'GET', '/api/world/R')).data.state.tick, 1);
});

test('v8.3 (v7.7 hardening): /ready, ws tickets are one-time, auth rate limit, strict world ids', async () => {
  const { RateLimiter, validWorldId } = await import('../src/app.js');
  const app = new OGCEApp(memoryDb(), '');
  assert.equal((await call(app, 'GET', '/health')).data.version, '9.0.0');
  assert.deepEqual((await call(app, 'GET', '/ready')).data, { status: 'ready' });
  assert.equal((await call(app, 'GET', '/health')).data.accounts_required, false);
  assert.equal((await call(new OGCEApp(memoryDb(), 'svc-token'), 'GET', '/health')).data.accounts_required, true);
  assert.equal((await call(app, 'POST', '/api/auth/ws-ticket', {})).status, 401);
  const reg = await call(app, 'POST', '/api/auth/register', { username: 'onlinehero', password: 'a-long-password-123' });
  const t = await call(app, 'POST', '/api/auth/ws-ticket', {}, { Authorization: 'Bearer ' + reg.data.token });
  assert.equal(t.data.expires_in, 60);
  assert.equal(await app.auth.consumeWsTicket(t.data.ticket), 'onlinehero');
  assert.equal(await app.auth.consumeWsTicket(t.data.ticket), null);
  assert.equal((await call(app, 'GET', '/api/world/bad%20id')).status, 400);
  assert.ok(validWorldId('AURELIA_2-x') && !validWorldId('../x') && !validWorldId('wörld') && !validWorldId('a'.repeat(65)));
  const lim = new RateLimiter(2, 60); assert.ok(lim.allow('c', 1) && lim.allow('c', 2) && !lim.allow('c', 3) && lim.allow('c', 62));
  const codes = [];
  for (let i = 0; i < 13; i++) codes.push((await call(app, 'POST', '/api/auth/login', { username: 'nobody', password: 'x'.repeat(12) })).status);
  assert.deepEqual(codes.slice(10), [400, 429, 429]); // 1 register + 11 logins allowed in the 12/min window
});
