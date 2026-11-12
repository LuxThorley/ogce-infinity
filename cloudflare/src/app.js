// HTTP API equivalent to ogce4/v70/server.py make_handler(), runnable inside a Durable Object
// (or Node for tests) over a synchronous SQL adapter { all(sql,...p), run(sql,...p), transaction(fn) }.
import { GameRuntime } from './runtime.js';
import { AuthStore } from './auth.js';
import { LivingWorld, leastFixedPoint, gradeClaim, decide, GRADES } from './mulux.js';
import { LivingWorld82, WorldError } from './living82.js';
import { canonical, dumps, pyInt, pyStr, pyBool, ValueError } from './pyjson.js';

export const VERSION = '8.3.0';
const WORLD_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const validWorldId = (wid) => WORLD_ID.test(wid);
// v7.7 sliding-window limiter for auth endpoints (per client IP, bounded memory).
export class RateLimiter {
  constructor(limit = 12, window = 60) { this.limit = limit; this.window = window; this.hits = new Map(); }
  allow(key, nowS = Date.now() / 1000) {
    if (!this.hits.has(key) && this.hits.size >= 10000) {
      for (const [k, q] of this.hits) if (!q.length || q[q.length - 1] <= nowS - this.window) this.hits.delete(k);
    }
    const q = (this.hits.get(key) || []).filter((t) => t > nowS - this.window);
    if (q.length >= this.limit) { this.hits.set(key, q); return false; }
    q.push(nowS); this.hits.set(key, q); return true;
  }
}
const sumOrd = (s) => [...s].reduce((n, c) => n + c.codePointAt(0), 0);
const json = (code, data) => new Response(JSON.stringify(data), { status: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
function safeEqual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
const cpLen = (s) => [...s].length;

export class OGCEApp {
  constructor(db, token = '') {
    this.db = db; this.token = token || '';
    this.runtime = new GameRuntime(db); this.auth = new AuthStore(db);
    db.run(`CREATE TABLE IF NOT EXISTS mulux_worlds(world_id TEXT PRIMARY KEY, seed INTEGER NOT NULL, tick INTEGER NOT NULL,
      state TEXT NOT NULL, ledger TEXT NOT NULL, updated REAL NOT NULL DEFAULT (unixepoch()))`);
    db.run(`CREATE TABLE IF NOT EXISTS mulux_receipts(id INTEGER PRIMARY KEY AUTOINCREMENT, world_id TEXT NOT NULL,
      receipt TEXT NOT NULL, created REAL NOT NULL DEFAULT (unixepoch()))`);
    db.run('CREATE TABLE IF NOT EXISTS worlds_v82(world_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, record TEXT NOT NULL)');
    this.v82Worlds = new Map(); this.muluxWorlds = new Map(); this.limiter = new RateLimiter();
  }
  async getV82(wid) {
    if (!this.v82Worlds.has(wid)) {
      const row = this.db.all('SELECT record FROM worlds_v82 WHERE world_id=?', wid)[0];
      this.v82Worlds.set(wid, row ? await LivingWorld82.fromRecord(JSON.parse(row.record)) : await LivingWorld82.create(sumOrd(wid) + 82));
    }
    return this.v82Worlds.get(wid);
  }
  saveV82(wid, world) {
    const payload = dumps(world.toRecord(), { sortKeys: true, ensureAscii: true });
    const row = this.db.all('SELECT revision FROM worlds_v82 WHERE world_id=?', wid)[0];
    if (row && row.revision > world.revision) throw new ValueError('stale_world_revision');
    this.db.run(`INSERT INTO worlds_v82(world_id,revision,record) VALUES(?,?,?)
      ON CONFLICT(world_id) DO UPDATE SET revision=excluded.revision,record=excluded.record`, wid, world.revision, payload);
  }
  async getMulux(wid) {
    if (!this.muluxWorlds.has(wid)) {
      const row = this.db.all('SELECT seed,tick,state,ledger FROM mulux_worlds WHERE world_id=?', wid)[0];
      this.muluxWorlds.set(wid, row ? LivingWorld.fromRecord({ seed: row.seed, tick: row.tick, state: JSON.parse(row.state), ledger: JSON.parse(row.ledger) }) : await LivingWorld.create(sumOrd(wid)));
    }
    return this.muluxWorlds.get(wid);
  }
  saveMulux(wid, w) {
    this.db.run(`INSERT INTO mulux_worlds(world_id,seed,tick,state,ledger,updated) VALUES(?,?,?,?,?,unixepoch())
      ON CONFLICT(world_id) DO UPDATE SET seed=excluded.seed,tick=excluded.tick,state=excluded.state,ledger=excluded.ledger,updated=unixepoch()`,
      wid, w.seed, w.tick_count, canonical(w.snapshot()), canonical(w.ledger));
  }
  async identity(request) {
    const h = request.headers.get('Authorization') || '';
    const credential = h.startsWith('Bearer ') ? h.slice(7) : '';
    const account = await this.auth.validate(credential);
    const serviceOk = Boolean(this.token) && safeEqual(h, 'Bearer ' + this.token);
    return { account, serviceOk, unauthorized: Boolean(this.token) && !account && !serviceOk };
  }
  async body(request, max) {
    const len = parseInt(request.headers.get('Content-Length') || '0', 10);
    const raw = await request.text();
    const size = Number.isFinite(len) && len > 0 ? len : new TextEncoder().encode(raw).length;
    if (size < 1 || size > max) throw new ValueError('invalid_body_size');
    try { return JSON.parse(raw); } catch (e) { throw new ValueError('invalid JSON body: ' + e.message); }
  }
  async handle(request) {
    const url = new URL(request.url); const path = url.pathname;
    const method = request.method.toUpperCase();
    try {
      if (method === 'GET' || method === 'HEAD') return await this.get(request, path);
      if (method === 'POST') return await this.post(request, path);
      return json(405, { error: 'method_not_allowed' });
    } catch (e) {
      if (e instanceof ValueError || e instanceof WorldError || e instanceof TypeError || e instanceof RangeError) return json(400, { error: e.message });
      console.error(e); return json(500, { error: 'internal_error' });
    }
  }
  wid(path, prefix, sep) { return decodeURIComponent(path.slice(prefix.length).split(sep)[0]); }
  async get(request, path) {
    if (path === '/health' || path === '/api/health') return json(200, { status: 'ok', engine: 'OGCE', version: VERSION, runtime: 'cloudflare-worker+durable-object', accounts_required: Boolean(this.token) });
    if (path === '/ready') {
      try { this.db.all('SELECT 1'); return json(200, { status: 'ready' }); } catch { return json(503, { status: 'not_ready' }); }
    }
    if (path.startsWith('/api/v82/world/')) {
      const id = await this.identity(request); if (id.unauthorized) return json(401, { error: 'unauthorized' });
      const wid = this.wid(path, '/api/v82/world/', '?');
      if (!wid || cpLen(wid) > 64) return json(400, { error: 'invalid_world' });
      return json(200, await (await this.getV82(wid)).snapshot());
    }
    if (path.startsWith('/api/mulux/world/')) {
      const wid = this.wid(path, '/api/mulux/world/', '?');
      if (!wid || cpLen(wid) > 64) return json(400, { error: 'invalid_world' });
      const w = await this.getMulux(wid);
      return json(200, { snapshot: w.snapshot(), integrity: await w.verifyLedger(), grades: GRADES });
    }
    if (path.startsWith('/api/world/')) {
      const wid = this.wid(path, '/api/world/', '?');
      if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
      return json(200, this.db.transaction(() => this.runtime.load(wid)));
    }
    return json(404, { error: 'not_found' });
  }
  async post(request, path) {
    if (path.startsWith('/api/v82/world/')) {
      const { account, unauthorized } = await this.identity(request);
      if (unauthorized) return json(401, { error: 'unauthorized' });
      const wid = this.wid(path, '/api/v82/world/', '/');
      if (!wid || cpLen(wid) > 64) return json(400, { error: 'invalid_world' });
      const body = await this.body(request, 16384); const world = await this.getV82(wid);
      const op = body.operation; const cid = pyStr(body.character_id ?? '');
      let result;
      if (op === 'character') {
        await world.createCharacter(cid, body.name ?? 'Wanderer', body.birth_cycle ?? 0, body.path ?? 'hybrid');
        world.characters[cid].owner = account || 'guest';
        result = world.character(cid);
      } else if (op !== 'tick') {
        const character = world.character(cid);
        if (account && character.owner !== account) return json(403, { error: 'character_not_owned_by_account' });
      }
      if (op === 'character') { /* created above */ }
      else if (op === 'cast') result = await world.cast(cid, pyStr(body.spell ?? ''), body.target);
      else if (op === 'learn_spell') result = await world.learnSpell(cid, pyStr(body.spell ?? ''));
      else if (op === 'reading') result = world.celestialReading(cid);
      else if (op === 'hypothesis') result = await world.submitHypothesis(cid, body.title ?? 'Untitled inquiry', body.discipline ?? 'physics', body.hypothesis ?? '', body.method ?? 'controlled comparison');
      else if (op === 'experiment') result = await world.experiment(cid, pyStr(body.research_id ?? ''), body.observation ?? '', pyBool(body.repeat ?? false));
      else if (op === 'invent') result = await world.invent(cid, pyStr(body.technology ?? ''));
      else if (op === 'train') result = await world.train(cid, pyStr(body.discipline ?? ''), body.amount ?? 1);
      else if (op === 'tick') result = await world.tick(body.count ?? 1);
      else return json(400, { error: 'unknown_v82_operation' });
      this.saveV82(wid, world);
      return json(200, { result, world: await world.snapshot() });
    }
    if (path.startsWith('/api/mulux/world/')) {
      const wid = this.wid(path, '/api/mulux/world/', '/');
      if (!wid || cpLen(wid) > 64) return json(400, { error: 'invalid_world' });
      const body = await this.body(request, 16384); const world = await this.getMulux(wid);
      const operation = body.operation;
      if (operation === 'tick') {
        const result = await world.tick(pyInt(body.count ?? 1)); this.saveMulux(wid, world);
        return json(200, { snapshot: result, integrity: await world.verifyLedger() });
      }
      if (operation === 'receipt') {
        const receipt = await world.exportReceipt();
        this.db.run('INSERT INTO mulux_receipts(world_id,receipt) VALUES(?,?)', wid, canonical(receipt));
        return json(200, { receipt });
      }
      if (operation === 'policy') return json(200, decide(pyStr(body.action ?? ''), true, pyBool(body.owner_yes ?? false)));
      if (operation === 'grade') return json(200, gradeClaim(pyStr(body.claim ?? ''), body.evidence ?? [], pyStr(body.grade ?? 'OPEN CONJECTURE')));
      if (operation === 'genesis') return json(200, leastFixedPoint(body.atoms ?? [], body.rules ?? [], body.axioms ?? []));
      return json(400, { error: 'unknown_mulux_operation' });
    }
    if (path === '/api/auth/ws-ticket') {
      const h = request.headers.get('Authorization') || '';
      const account = await this.auth.validate(h.startsWith('Bearer ') ? h.slice(7) : '');
      if (!account) return json(401, { error: 'valid_account_session_required' });
      return json(200, await this.auth.issueWsTicket(h.slice(7)));
    }
    if (path === '/api/auth/register' || path === '/api/auth/login') {
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      if (!this.limiter.allow('auth:' + ip)) return json(429, { error: 'rate_limited_try_again_later' });
      const body = await this.body(request, 4096);
      const result = path.endsWith('register') ? await this.auth.register(body.username, body.password) : await this.auth.login(body.username, body.password);
      return json(200, result);
    }
    if (!path.startsWith('/api/world/') || !path.endsWith('/action')) return json(404, { error: 'not_found' });
    const wid = decodeURIComponent(path.slice('/api/world/'.length, -'/action'.length).replace(/^\/+|\/+$/g, ''));
    const { account, serviceOk, unauthorized } = await this.identity(request);
    if (unauthorized) return json(401, { error: 'unauthorized' });
    const body = await this.body(request, 16384);
    const playerId = account || pyStr(body.player_id ?? '').slice(0, 80);
    if (account && ![undefined, null, '', account].includes(body.player_id)) return json(403, { error: 'player_identity_mismatch' });
    if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
    return json(200, this.db.transaction(() => this.runtime.act(wid, playerId, body.action)));
  }
}
