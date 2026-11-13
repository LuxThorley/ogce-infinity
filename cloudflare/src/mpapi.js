// v9.0 multiplayer HTTP + socket API, mixed into OGCEApp. Global social features live in the main Durable Object; each
// invite room runs in its own Durable Object and reaches the main one through a Directory (service-token authenticated,
// never exposed to the internet: the Worker refuses /api/internal/* from outside).
import { Social, SocialError, eventFor, weeklyChallenge } from './social.js';
import { RoomStore, RoomHub, RoomError, ROOM_CODE, codeOfWorld, roomWorld } from './rooms.js';
import { moderate, listLog, decide, FRIENDLY } from './moderation.js';
import * as OMNI from './omniverse.js';
import * as CMB from './combat.js';
import { pyStr, ValueError } from './pyjson.js';
import * as GENESIS from './genesis.js';
import { Leaderboard, CATEGORIES, SCOPES, FILTERS, seasonOf } from './leaderboard.js';

const json = (code, data) => new Response(JSON.stringify(data), { status: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export const MP_ERRORS = [SocialError, RoomError];
export const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

/** Same-process directory (main DO, and Node tests). */
export class LocalDirectory {
  constructor(app) { this.app = app; this.remote = false; }
  async whoami(credential) { return this.app.auth.validate(credential); }
  async consumeTicket(t) { return this.app.auth.consumeWsTicket(t); }
  async relations(pid) { return this.app.social.relations(pid); }
  async moderate(a) { return moderate({ db: this.app.db, env: this.app.env, fetchImpl: this.app.fetchImpl, ...a }); }
  async hallSubmit(a) { return this.app.social.hallSubmit(a); }
  async contribute(pid, unit, n) { return this.app.social.contribute(pid, unit, n); }
  async friendRequest(from, to) { return this.app.social.friendRequest(from, { to, via: 'party' }); }
  async report(pid, a) { return this.app.social.report(pid, a); }
}
/** Room DO -> main DO over the Durable Object binding, authenticated with the service token (a Worker secret). */
export class RemoteDirectory {
  constructor(stub, token) { this.stub = stub; this.token = token; this.remote = true; this.cache = new Map(); }
  async call(op, body) {
    const r = await this.stub.fetch(`https://main.internal/api/internal/${op}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new RoomError(d.error || 'directory_unavailable'); return d.result;
  }
  async whoami(credential) {
    if (!credential) return null; const c = this.cache.get('w:' + credential); if (c && c.t > Date.now() - 60000) return c.v;
    const v = await this.call('whoami', { credential }); this.cache.set('w:' + credential, { v, t: Date.now() }); if (this.cache.size > 2000) this.cache.clear(); return v;
  }
  consumeTicket(ticket) { return this.call('ticket', { ticket }); }
  relations(pid) { return this.call('relations', { pid }); }
  moderate(a) { return this.call('moderate', a); }
  hallSubmit(a) { return this.call('hall', a); }
  contribute(pid, unit, n) { return this.call('contribute', { pid, unit, n }); }
  friendRequest(from, to) { return this.call('friend', { from, to }); }
  report(pid, a) { return this.call('report', { pid, ...a }); }
}

export function installMultiplayer(app) {
  app.social = new Social(app.db, { env: app.env, fetchImpl: app.fetchImpl, secret: app.token });
  app.lb = new Leaderboard(app.db, app.social);
  app.rooms = new RoomStore(app.db); app.hub = new RoomHub(); app.directory = new LocalDirectory(app); app.relCache = new Map();
  Object.assign(app, MP);
}
const MP = {
  /** Server-authoritative leaderboard inputs, read from this DO's own state (home world). Never from the client. */
  refreshScores(pid, nowMs = Date.now()) {
    if (this.directory.remote) return;
    const wid = 'Aurelia', rec = this.genesis(wid, pid), facts = this.genesisFacts(wid, pid), L = GENESIS.lux(rec, facts), si = GENESIS.stratumIndex(rec, L.total);
    this.lb.startRun(pid, rec.cycle, nowMs);
    this.lb.observe(pid, 'lux', L.total + (rec.archive || []).reduce((a, x) => a + (x.lux || 0), 0), nowMs);
    this.lb.observe(pid, 'strata', rec.cycle * 8 + si, nowMs);
    this.lb.observe(pid, 'codex', facts.codex, nowMs);
    const votes = this.db.all("SELECT record, votes FROM hall_v90 WHERE status='published'").filter((r) => JSON.parse(r.record).credits.some((c) => c.player === pid)).reduce((a, r) => a + r.votes, 0);
    this.lb.observe(pid, 'hall_votes', votes, nowMs);
    const rt = this.social.rating(pid); if (rt.games > 0) this.lb.observe(pid, 'rating', rt.mmr, nowMs);
    this.lb.observe(pid, 'event', this.db.all('SELECT COALESCE(SUM(n),0) AS n FROM event_players_v90 WHERE player=?', pid)[0].n, nowMs);
    const wk = this.db.all('SELECT best FROM weekly_v90 WHERE week=? AND player=?', weeklyChallenge(nowMs).week, pid)[0]; if (wk?.best) this.lb.observe(pid, 'weekly', wk.best, nowMs);
  },
  useRemoteDirectory(env) { if (!this.directory.remote && env?.OGCE_WORLD) this.directory = new RemoteDirectory(env.OGCE_WORLD.get(env.OGCE_WORLD.idFromName('ogce-main')), this.token); },
  async rel(pid, fresh = false) {
    const c = this.relCache.get(pid); if (c && !fresh && c.t > Date.now() - 60000) return c.v;
    const v = await this.directory.relations(pid); this.relCache.set(pid, { v, t: Date.now() }); if (this.relCache.size > 500) this.relCache.clear(); return v;
  },
  async nameMap(room) { const m = {}; await Promise.all(Object.keys(room.members).map(async (p) => { m[p] = (await this.rel(p).catch(() => null))?.display ?? 'Explorer'; })); return (p) => m[p] ?? 'Explorer'; },
  async signedIn(request) {
    const id = await this.identity(request);
    if (id.unauthorized) return { error: json(401, { error: 'unauthorized' }) };
    if (!id.account) return { error: json(401, { error: 'sign_in_required', message: 'Multiplayer needs a free account so we can keep everyone safe.' }) };
    return { pid: id.account };
  },
  /** Room worlds (sw_<CODE>) are members-only, for every endpoint that touches them. */
  async roomGate(request, path) {
    const m = /\/(sw_[A-Z0-9]{6,9})(?:\/|$)/.exec(path) || (/[?&]world=(sw_[A-Z0-9]{6,9})/.exec(new URL(request.url).search));
    if (!m) return null; const code = codeOfWorld(m[1]); if (!code) return json(400, { error: 'invalid_world' });
    const id = await this.identity(request); if (!id.account && !id.serviceOk) return json(401, { error: 'sign_in_required' });
    if (id.account && !this.rooms.isMember(code, id.account)) return json(403, { error: 'not_a_member' });
    return null;
  },
  roomHooks(wid, pid, action) {
    const code = codeOfWorld(wid); if (!code || !action) return;
    const unit = { gather: 'gather', move: 'move', craft: 'craft', build: 'build' }[action.type]; if (unit) this.rooms.track(code, pid, unit, 1);
  },
  coopCredit(wid, pid) { const code = codeOfWorld(wid); return code ? this.rooms.credit(code, pid) : 0; },
  async mpGet(request, path) {
    const url = new URL(request.url);
    if (path === '/api/v90/rtc/config') return json(200, { iceServers: STUN, turn: false, note: 'Peer-to-peer only (free public STUN). If a direct connection fails we fall back to quick chat and text.' });
    if (path === '/api/v90/admin/moderation') {
      const id = await this.identity(request); if (!id.serviceOk || id.account) return json(401, { error: 'service_token_required' });
      return json(200, { entries: listLog(this.db, { status: url.searchParams.get('status') || 'pending', limit: Number(url.searchParams.get('limit') || 50) }) });
    }
    if (path.startsWith('/api/v90/leaderboard')) {
      const s = await this.signedIn(request); if (s.error) return s.error; const pid = s.pid, q = url.searchParams;
      if (path === '/api/v90/leaderboard/legends') return json(200, { legends: this.lb.legends() });
      if (path === '/api/v90/leaderboard/seasons') { this.lb.rollSeason(); return json(200, { current: seasonOf(), seasons: this.lb.seasons() }); }
      if (path === '/api/v90/leaderboard/me') { if (this.lb.canRefresh(pid)) this.refreshScores(pid); return json(200, { display: this.social.display(pid), name: this.social.nameStatus(pid), rewards: this.lb.rewards(pid), flags: this.lb.flagged(pid), season: seasonOf(), categories: CATEGORIES }); }
      if (path === '/api/v90/leaderboard') {
        if (this.lb.canRefresh(pid)) this.refreshScores(pid);
        const category = Object.prototype.hasOwnProperty.call(CATEGORIES, q.get('category')) ? q.get('category') : 'lux';
        const scope = SCOPES.includes(q.get('scope')) || /^\d{4}S\d+$/.test(q.get('scope') || '') ? q.get('scope') : 'all', filter = FILTERS.includes(q.get('filter')) ? q.get('filter') : 'global';
        return json(200, this.lb.board({ pid, category, scope, filter, limit: Math.min(100, Number(q.get('limit') || 50)) }));
      }
      return json(404, { error: 'not_found' });
    }
    const rm = /^\/api\/v90\/room\/([A-Z0-9]{6,9})$/.exec(path);
    if (rm) {
      const s = await this.signedIn(request); if (s.error) return s.error;
      const room = this.rooms.get(rm[1]); if (!room) return json(404, { error: 'room_not_found' });
      const nameOf = await this.nameMap(room), v = this.rooms.view(room, s.pid, nameOf);
      if (v.member) {
        const wid = roomWorld(room.code), explorers = {};
        for (const p of Object.keys(room.members)) { const row = this.db.all('SELECT record FROM omni_players_v90 WHERE world_id=? AND player_id=?', wid, p)[0]; if (row) explorers[p] = JSON.parse(row.record); }
        const npcs = Object.fromEntries(Object.entries(OMNI.OMNI.npcs || {}).map(([k, n]) => [k, { name: n.name }]));
        v.npc_group = this.rooms.npcGroup(room, explorers, npcs, nameOf);
        v.invite = { code: room.code, link: `${url.origin}/?room=${room.code}` };
      }
      return json(200, v);
    }
    if (!path.startsWith('/api/v90/social') && !['/api/v90/house', '/api/v90/hall', '/api/v90/events', '/api/v90/weekly', '/api/v90/arena'].includes(path) && !path.startsWith('/api/v90/social/dm/')) return null;
    if (path === '/api/v90/events') { const s = await this.signedIn(request); return s.error || json(200, this.social.events(s.pid)); }
    if (path === '/api/v90/hall') { const s = await this.signedIn(request); return s.error || json(200, { entries: this.social.hall(s.pid, url.searchParams.get('sort') === 'new' ? 'new' : 'top') }); }
    const s = await this.signedIn(request); if (s.error) return s.error; const pid = s.pid;
    if (path === '/api/v90/social/me') return json(200, { privacy: this.social.privacy(pid), friend_code: this.social.friendCode(pid), ...this.social.friends(pid), blocked: this.social.blockList(pid), muted: this.social.muted(pid), display: this.social.display(pid), house: this.social.houseView(this.social.houseOf(pid), pid), rating: this.social.rating(pid), titles: this.social.eventTitles(pid) });
    if (path.startsWith('/api/v90/social/dm/')) return json(200, { messages: this.social.dms(pid, decodeURIComponent(path.slice(19))) });
    if (path === '/api/v90/house') return json(200, { house: this.social.houseView(this.social.houseOf(pid), pid) });
    if (path === '/api/v90/weekly') return json(200, { challenge: weeklyChallenge(), board: this.social.leaderboard(pid) });
    if (path === '/api/v90/arena') return json(200, { ...this.social.arenaTick(pid), history: this.social.arenaHistory(pid), pvp: this.social.privacy(pid).pvp });
    return null;
  },
  trialSetup(pid, body) {
    const wid = typeof body.world === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.world) ? body.world : 'Aurelia';
    return { prof: this.combat(wid, pid), weapon: this.worldPlayer(wid, pid).player?.equipment?.weapon || 'traveller_blade' };
  },
  async mpPost(request, path) {
    if (path.startsWith('/api/internal/')) {
      const id = await this.identity(request); if (!id.serviceOk) return json(401, { error: 'service_token_required' });
      const b = await this.body(request, 16000), op = path.slice(14); let result;
      if (op === 'whoami') result = await this.auth.validate(pyStr(b.credential ?? ''));
      else if (op === 'ticket') result = await this.auth.consumeWsTicket(pyStr(b.ticket ?? ''));
      else if (op === 'relations') result = this.social.relations(pyStr(b.pid ?? ''));
      else if (op === 'moderate') result = await moderate({ db: this.db, env: this.env, fetchImpl: this.fetchImpl, kind: b.kind, text: b.text, author: pyStr(b.author ?? ''), context: pyStr(b.context ?? ''), ref: b.ref ?? null });
      else if (op === 'hall') result = await this.social.hallSubmit({ card: b.card, credits: (b.credits || []).map(String).slice(0, 8), by: pyStr(b.by ?? ''), source: pyStr(b.source ?? '') });
      else if (op === 'contribute') result = this.social.contribute(pyStr(b.pid ?? ''), pyStr(b.unit ?? ''), Math.max(0, Math.min(5, Math.trunc(Number(b.n) || 0))));
      else if (op === 'friend') result = this.social.friendRequest(pyStr(b.from ?? ''), { to: pyStr(b.to ?? ''), via: 'party' });
      else if (op === 'report') result = this.social.report(pyStr(b.pid ?? ''), b);
      else return json(404, { error: 'unknown_internal_op' });
      return json(200, { result });
    }
    const am = /^\/api\/v90\/admin\/moderation\/(\d+)$/.exec(path);
    if (am) {
      const id = await this.identity(request); if (!id.serviceOk || id.account) return json(401, { error: 'service_token_required' });
      const b = await this.body(request, 2048); let entry;
      try { entry = decide(this.db, Number(am[1]), pyStr(b.decision ?? ''), 'admin', pyStr(b.note ?? '')); } catch (e) { return json(400, { error: e.message }); }
      this.social.applyApproved(entry);
      return json(200, { entry });
    }
    if (path === '/api/v90/admin/season/close') {
      const id = await this.identity(request); if (!id.serviceOk || id.account) return json(401, { error: 'service_token_required' });
      const b = await this.body(request, 512); const sid = pyStr(b.season ?? ''); if (!/^\d{4}S\d+$/.test(sid) || sid === seasonOf().id) return json(400, { error: 'bad_season' });
      return json(200, { season: sid, archive: this.lb.closeSeason(sid) });
    }
    if (path === '/api/v90/leaderboard') {
      const s = await this.signedIn(request); if (s.error) return s.error; const b = await this.body(request, 1024);
      if (b.op === 'name') { const r = await this.social.setDisplayName(s.pid, b.name); return json(200, { ...r, message: r.status === 'held' ? FRIENDLY.held : undefined }); }
      if (b.op === 'refresh') { if (!this.lb.canRefresh(s.pid)) return json(429, { error: 'rate_limited', retry: 10 }); this.refreshScores(s.pid); return json(200, { ok: true }); }
      return json(400, { error: 'unknown_op' });
    }
    const rm = /^\/api\/v90\/room\/([A-Z0-9]{6,9})\/([a-z_]+)$/.exec(path);
    if (rm) return this.roomPost(request, rm[1], rm[2]);
    const routes = ['/api/v90/social/privacy', '/api/v90/social/friend', '/api/v90/social/block', '/api/v90/social/report', '/api/v90/social/dm', '/api/v90/house', '/api/v90/hall', '/api/v90/events', '/api/v90/weekly', '/api/v90/arena'];
    if (!routes.includes(path)) return null;
    const s = await this.signedIn(request); if (s.error) return s.error; const pid = s.pid, S = this.social;
    const b = await this.body(request, 8192), op = pyStr(b.op ?? '');
    if (path === '/api/v90/social/privacy') return json(200, { privacy: S.setPrivacy(pid, b.privacy) });
    if (path === '/api/v90/social/friend') {
      if (op === 'request') return json(200, S.friendRequest(pid, { code: pyStr(b.code ?? '') }));
      if (op === 'accept' || op === 'decline') return json(200, S.friendRespond(pid, pyStr(b.who ?? ''), op === 'accept'));
      if (op === 'remove') return json(200, S.unfriend(pid, pyStr(b.who ?? '')));
      if (op === 'rotate_code') return json(200, { friend_code: S.friendCode(pid, true) });
      return json(400, { error: 'unknown_op' });
    }
    if (path === '/api/v90/social/block') return json(200, S.block(pid, pyStr(b.target ?? ''), b.kind === 'mute' ? 'mute' : 'block', b.on !== false));
    if (path === '/api/v90/social/report') return json(200, S.report(pid, { target: pyStr(b.target ?? ''), reason: pyStr(b.reason ?? ''), context: pyStr(b.context ?? ''), text: pyStr(b.text ?? '') }));
    if (path === '/api/v90/social/dm') { const r = await S.dm(pid, pyStr(b.to ?? ''), pyStr(b.text ?? '')); return json(200, r.sent ? r : { ...r, message: FRIENDLY[r.status] || FRIENDLY.blocked }); }
    if (path === '/api/v90/house') {
      let r;
      if (op === 'create') r = await S.houseCreate(pid, { name: b.name, charter: pyStr(b.charter ?? ''), banner: b.banner || {} });
      else if (op === 'charter' || op === 'motto') r = await S.houseText(pid, op, pyStr(b.text ?? ''));
      else if (op === 'banner') r = S.houseBanner(pid, b.banner || {});
      else if (op === 'invite') r = S.houseInvite(pid);
      else if (op === 'join') r = S.houseJoin(pid, pyStr(b.code ?? ''));
      else if (op === 'leave') r = S.houseLeave(pid);
      else if (['kick', 'promote', 'demote'].includes(op)) r = S.houseRole(pid, pyStr(b.member ?? ''), op);
      else if (op === 'deposit' || op === 'withdraw') {
        r = this.db.transaction(() => { const ex = this.explorer('Aurelia', pid); const o = op === 'deposit' ? S.houseDeposit(pid, ex.bag, b.item, b.n) : S.houseWithdraw(pid, ex.bag, b.item, b.n); this.saveExplorer('Aurelia', pid, ex); return { ...o, bag: ex.bag }; });
      } else return json(400, { error: 'unknown_op' });
      return json(200, r);
    }
    if (path === '/api/v90/hall') {
      if (op === 'vote') return json(200, S.hallVote(pid, pyStr(b.id ?? ''), b.on !== false));
      if (op === 'submit') {
        const wid = typeof b.world === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(b.world) && !codeOfWorld(b.world) ? b.world : 'Aurelia';
        const inv = this.explorer(wid, pid).inventions.find((i) => i.id === b.invention); if (!inv) return json(404, { error: 'unknown_invention' });
        const card = OMNI.buildCard(inv, null), credits = [pid, ...(inv.co_inventors || []).filter((p) => p !== pid)];
        const r = await S.hallSubmit({ card: { ...card, credits: inv.co_names || undefined }, credits, by: pid, source: `${wid}:${pid}:${inv.sig}` });
        return json(200, { ...r, message: r.status === 'held' ? FRIENDLY.held : r.status === 'blocked' ? 'That entry can’t go in the Hall.' : undefined });
      }
      return json(400, { error: 'unknown_op' });
    }
    if (path === '/api/v90/events') return json(200, op === 'claim' ? S.claimEvent(pid) : S.events(pid));
    if (path === '/api/v90/weekly') {
      if (op === 'start') { const { prof, weapon } = this.trialSetup(pid, b); return json(200, S.weeklyStart(pid, prof, weapon)); }
      if (op === 'finish') { const r = S.weeklyFinish(pid, b.inputs); this.refreshScores(pid); return json(200, r); }
      return json(400, { error: 'unknown_op' });
    }
    if (path === '/api/v90/arena') {
      if (op === 'queue') return json(200, S.arenaQueue(pid, pyStr(b.mode ?? 'duel')));
      if (op === 'leave') return json(200, S.arenaLeave(pid));
      if (op === 'tick') return json(200, S.arenaTick(pid));
      if (op === 'start') { const { prof, weapon } = this.trialSetup(pid, b); return json(200, S.arenaStart(pid, prof, weapon)); }
      if (op === 'finish') { const r = S.arenaFinish(pid, b.inputs); if (r.match?.result) for (const p of this.social.arenaActive(pid)?.players || [pid]) this.refreshScores(p); else this.refreshScores(pid); return json(200, r); }
      return json(400, { error: 'unknown_op' });
    }
    return null;
  },
  async roomPost(request, code, op) {
    if (!ROOM_CODE.test(code)) return json(400, { error: 'bad_room_code' });
    const s = await this.signedIn(request); if (s.error) return s.error; const pid = s.pid, R = this.rooms;
    const b = await this.body(request, 8192).catch((e) => { if (/invalid_body_size/.test(e.message) && !Number(request.headers.get('Content-Length') || 0)) return {}; throw e; });
    const done = async (room, extra = {}) => json(200, { room: R.view(room, pid, await this.nameMap(room)), ...extra });
    if (op === 'create') { const rel = await this.rel(pid, true); return done(R.create(code, pid, { name: b.name, max: b.max, kind: b.kind === 'house' ? 'house' : 'party' }, rel)); }
    if (op === 'join') { const rel = await this.rel(pid, true); return done(R.join(code, pid, rel)); }
    const room = R.need(code); if (!room.members[pid]) return json(403, { error: 'not_a_member' });
    if (op === 'leave') { R.leave(code, pid); this.hub.leave(pid); return json(200, { left: true }); }
    if (op === 'kick') return done(R.kick(code, pid, pyStr(b.target ?? '')));
    if (op === 'settings') return done(R.configure(code, pid, b));
    if (op === 'puzzle') { const r = R.puzzleSubmit(code, pid, pyStr(b.law ?? ''), b.answer); return done(R.get(code), { puzzle: r }); }
    if (op === 'codex') {
      const ex = this.explorer(roomWorld(code), pid), inv = ex.inventions.find((i) => i.id === b.invention); if (!inv) return json(404, { error: 'unknown_invention' });
      const name = (await this.rel(pid))?.display ?? 'Explorer';
      return done(R.get(code), { entry: R.codexAdd(code, pid, { kind: 'invention', sig: inv.sig, title: inv.name, credits: [pid], card: { ...OMNI.buildCard(inv, null), credits: [name] } }) });
    }
    if (op === 'draft') {
      const sub = pyStr(b.step ?? '');
      if (sub === 'create') { const spec = { category: pyStr(b.category ?? ''), form: pyStr(b.form ?? ''), materials: b.materials && typeof b.materials === 'object' ? b.materials : {}, observation: b.observation ?? null }; return done(R.get(code), { draft: R.draftCreate(code, pid, spec) }); }
      if (sub === 'add') { const known = OMNI.knownPrinciples(this.explorer(roomWorld(code), pid)); return done(R.get(code), { draft: R.draftAdd(code, pid, pyStr(b.draft ?? ''), pyStr(b.principle ?? ''), known) }); }
      if (sub === 'finalize') return this.coInvent(code, pid, pyStr(b.draft ?? ''));
      return json(400, { error: 'unknown_step' });
    }
    if (op === 'hall') {
      const e = room.codex.find((c) => c.id === b.entry); if (!e) return json(404, { error: 'entry_not_found' });
      if (!(e.credits || []).includes(pid)) return json(403, { error: 'credited_inventors_only' });
      const r = await this.directory.hallSubmit({ card: e.card, credits: e.credits, by: pid, source: `${code}:${e.sig}` });
      return json(200, { ...r, message: r.status === 'held' ? FRIENDLY.held : undefined });
    }
    if (op === 'friend') { const t = pyStr(b.target ?? ''); if (!room.members[t]) return json(404, { error: 'member_not_found' }); return json(200, await this.directory.friendRequest(pid, t)); }
    if (op === 'report') { const t = pyStr(b.target ?? ''); return json(200, await this.directory.report(pid, { target: t, reason: pyStr(b.reason ?? ''), context: `room:${code}`, text: pyStr(b.text ?? '') })); }
    return json(400, { error: 'unknown_room_op' });
  },
  /** Co-invention: principles pooled from 2+ inventors, materials from the proposer, validated by the unchanged invention engine. Joint credit everywhere. */
  async coInvent(code, pid, draftId) {
    const R = this.rooms, wid = roomWorld(code), { d, credits } = R.draftTake(code, pid, draftId);
    const room = R.get(code), nameOf = await this.nameMap(room), names = credits.map(nameOf);
    const out = this.db.transaction(() => {
      const me = this.explorer(wid, pid), merged = JSON.parse(JSON.stringify(me));
      for (const p of credits.slice(1)) { const o = this.explorer(wid, p); merged.bestiary = [...new Set([...merged.bestiary, ...o.bestiary])]; merged.explored = [...new Set([...merged.explored, ...o.explored])]; merged.quests = [...new Set([...(merged.quests || []), ...(o.quests || [])])]; }
      const known = OMNI.knownPrinciples(merged);
      for (const p of d.principles) if (!OMNI.knownPrinciples(this.explorer(wid, p.by)).includes(p.id) || !known.includes(p.id)) throw new RoomError('principle_locked');
      const seed = OMNI.h3(OMNI.seedOf(wid + ':' + d.id), merged.attempts + 1, 31);
      const res = OMNI.invent(merged, { ...d.spec, principles: d.principles.map((p) => p.id) }, seed, 0, null);
      if (!res.ok && res.ok !== undefined) { me.attempts = merged.attempts; this.saveExplorer(wid, pid, me); return { ok: false, result: res }; }
      const inv = merged.inventions[merged.inventions.length - 1]; inv.co_inventors = credits; inv.co_names = names;
      me.bag = merged.bag; me.attempts = merged.attempts; me.inventions.push(inv); me.perks = merged.perks; this.saveExplorer(wid, pid, me);
      for (const p of credits.slice(1)) { const o = this.explorer(wid, p); if (!o.inventions.some((i) => i.sig === inv.sig)) { o.inventions.push({ ...inv, id: `i${o.inventions.length + 1}` }); this.saveExplorer(wid, p, o); } }
      const card = { ...OMNI.buildCard(inv, null), credits: names };
      return { ok: true, inv, entry: R.draftDone(code, d.id, inv, credits, card) };
    });
    return json(200, { ...out, room: R.view(R.get(code), pid, nameOf) });
  },
  /** One room WebSocket message -> deliveries [{to, msg}]. */
  async roomSocket(pid, code, msg) {
    const room = this.rooms.get(code); if (!room) return [{ to: pid, msg: { type: 'error', error: 'room_not_found' } }];
    if (msg?.type === 'hello' || msg?.type === 'voice') await Promise.all(Object.keys(room.members).map((p) => this.rel(p, msg.type === 'voice' && p === pid).catch(() => null)));
    const relSync = (p) => this.relCache.get(p)?.v ?? null;
    return this.hub.handle(pid, msg, { room, rel: relSync, moderate: (text, author) => this.directory.moderate({ kind: 'chat', text, author, context: `room:${code}` }) });
  },
};
export { eventFor, weeklyChallenge, ValueError, CMB };
