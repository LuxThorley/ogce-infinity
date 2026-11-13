// HTTP API equivalent to ogce4/v70/server.py make_handler(), runnable inside a Durable Object
// (or Node for tests) over a synchronous SQL adapter { all(sql,...p), run(sql,...p), transaction(fn) }.
import { GameRuntime } from './runtime.js';
import { AuthStore } from './auth.js';
import { LivingWorld, leastFixedPoint, gradeClaim, decide, GRADES } from './mulux.js';
import { LivingWorld82, WorldError } from './living82.js';
import { canonical, dumps, pyInt, pyStr, pyBool, ValueError } from './pyjson.js';
import * as V90 from './v90.js';
import * as OMNI from './omniverse.js';
import { companion, enabled as malcolmEnabled, ensureUsageTable, liveSlot, callUpstream, bumpUsage } from './malcolm.js';
import * as BARD from './bard.js';
import * as CMB from './combat.js';
import * as GENESIS from './genesis.js';
import { cardHTML, cardMarkdown, cardText } from '../../web/js/cardrender.js';
import { installMultiplayer, MP_ERRORS } from './mpapi.js';
import { codeOfWorld } from './rooms.js';
import * as MYS from '../../web/js/mystic.js';
import * as LORE from '../../web/js/lore.js';
import * as DIR from './director.js';

export const VERSION = '9.0.0';
export const TITLE = 'Strata: Lux Genesis';
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
export const SHARE_LIMITS = Object.freeze({ perHour: 10, globalDay: 1000 });
const combatWindows = new Map();
export function _resetCombatWindows() { combatWindows.clear(); }
function combatAllow(key, nowS) {
  if (!combatWindows.has(key) && combatWindows.size > 5000) combatWindows.clear();
  const q = (combatWindows.get(key) || []).filter((t) => t > nowS - 60);
  if (q.length >= 20) { combatWindows.set(key, q); return false; }
  q.push(nowS); combatWindows.set(key, q); return true;
}
const bardWindows = new Map();
export function _resetBardWindows() { bardWindows.clear(); }
function bardWindow(key, nowS) {
  if (!bardWindows.has(key) && bardWindows.size > 5000) bardWindows.clear();
  const q = (bardWindows.get(key) || []).filter((t) => t > nowS - 60);
  if (q.length >= BARD.BARD.limits.per_minute) { bardWindows.set(key, q); return false; }
  q.push(nowS); bardWindows.set(key, q); return true;
}
const html = (code, body) => new Response(body, { status: code, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
const json = (code, data) => new Response(JSON.stringify(data), { status: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
function safeEqual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
const cpLen = (s) => [...s].length;

export class OGCEApp {
  constructor(db, token = '', opts = {}) {
    this.db = db; this.token = token || ''; this.env = opts.env || {}; this.fetchImpl = opts.fetch || ((...a) => fetch(...a));
    this.runtime = new GameRuntime(db); this.auth = new AuthStore(db);
    db.run(`CREATE TABLE IF NOT EXISTS mulux_worlds(world_id TEXT PRIMARY KEY, seed INTEGER NOT NULL, tick INTEGER NOT NULL,
      state TEXT NOT NULL, ledger TEXT NOT NULL, updated REAL NOT NULL DEFAULT (unixepoch()))`);
    db.run(`CREATE TABLE IF NOT EXISTS mulux_receipts(id INTEGER PRIMARY KEY AUTOINCREMENT, world_id TEXT NOT NULL,
      receipt TEXT NOT NULL, created REAL NOT NULL DEFAULT (unixepoch()))`);
    db.run('CREATE TABLE IF NOT EXISTS worlds_v82(world_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, record TEXT NOT NULL)');
    // v9.0 (Strata): per-player progression lives beside the v7.4 world state, so existing worlds and players load unchanged.
    db.run('CREATE TABLE IF NOT EXISTS players_v90(world_id TEXT NOT NULL, player_id TEXT NOT NULL, record TEXT NOT NULL, updated REAL NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(world_id, player_id))');
    // v9.0 omniverse: per-realm ecology + persistent edits, and per-player explorer state (factions, NPC memory, appearance).
    db.run('CREATE TABLE IF NOT EXISTS omni_v90(world_id TEXT NOT NULL, realm TEXT NOT NULL, eco TEXT NOT NULL, deltas TEXT NOT NULL, PRIMARY KEY(world_id, realm))');
    db.run('CREATE TABLE IF NOT EXISTS shares_v90(id TEXT PRIMARY KEY, owner TEXT NOT NULL, sig TEXT NOT NULL, card TEXT NOT NULL, created INTEGER NOT NULL)');
    db.run('CREATE TABLE IF NOT EXISTS omni_players_v90(world_id TEXT NOT NULL, player_id TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(world_id, player_id))');
    // v9.0 combat: skill, specials, invented moves, enemy pattern memory and the one pending (server-issued) fight per player.
    // v9.0 Genesis backbone: laws claimed, endings, rewards, New Genesis cycles and the carried-over Codex archive.
    db.run('CREATE TABLE IF NOT EXISTS genesis_v90(world_id TEXT NOT NULL, player_id TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(world_id, player_id))');
    db.run('CREATE TABLE IF NOT EXISTS lore_v90(world_id TEXT NOT NULL, player_id TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(world_id, player_id))');
    db.run('CREATE TABLE IF NOT EXISTS mystic_v90(world_id TEXT NOT NULL, player_id TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(world_id, player_id))');
    db.run('CREATE TABLE IF NOT EXISTS combat_v90(world_id TEXT NOT NULL, player_id TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(world_id, player_id))');
    ensureUsageTable(db);
    this.v82Worlds = new Map(); this.muluxWorlds = new Map(); this.limiter = new RateLimiter();
    installMultiplayer(this); // v9.0 multiplayer: social layer, rooms, moderation, directory
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
  profile(wid, pid) {
    const row = this.db.all('SELECT record FROM players_v90 WHERE world_id=? AND player_id=?', wid, pid)[0];
    return V90.normalise(row ? JSON.parse(row.record) : null);
  }
  saveProfile(wid, pid, prof) {
    this.db.run(`INSERT INTO players_v90(world_id,player_id,record,updated) VALUES(?,?,?,unixepoch())
      ON CONFLICT(world_id,player_id) DO UPDATE SET record=excluded.record,updated=unixepoch()`, wid, pid, JSON.stringify(prof));
  }
  explorer(wid, pid) {
    const row = this.db.all('SELECT record FROM omni_players_v90 WHERE world_id=? AND player_id=?', wid, pid)[0];
    return OMNI.normExplorer(row ? JSON.parse(row.record) : null);
  }
  saveExplorer(wid, pid, p) {
    this.db.run('INSERT INTO omni_players_v90(world_id,player_id,record) VALUES(?,?,?) ON CONFLICT(world_id,player_id) DO UPDATE SET record=excluded.record', wid, pid, JSON.stringify(p));
  }
  combat(wid, pid) {
    const row = this.db.all('SELECT record FROM combat_v90 WHERE world_id=? AND player_id=?', wid, pid)[0];
    return CMB.normProfile(row ? JSON.parse(row.record) : null);
  }
  mystic(wid, pid) {
    const row = this.db.all('SELECT record FROM mystic_v90 WHERE world_id=? AND player_id=?', wid, pid)[0];
    return MYS.normState(row ? JSON.parse(row.record) : null);
  }
  saveMystic(wid, pid, st) {
    this.db.run('INSERT INTO mystic_v90(world_id,player_id,record) VALUES(?,?,?) ON CONFLICT(world_id,player_id) DO UPDATE SET record=excluded.record', wid, pid, JSON.stringify(st));
  }
  lore(wid, pid) { const r = this.db.all('SELECT record FROM lore_v90 WHERE world_id=? AND player_id=?', wid, pid)[0]; return LORE.normLore(r ? JSON.parse(r.record) : null); }
  saveLore(wid, pid, l) { this.db.run('INSERT INTO lore_v90(world_id,player_id,record) VALUES(?,?,?) ON CONFLICT(world_id,player_id) DO UPDATE SET record=excluded.record', wid, pid, JSON.stringify(l)); }
  loreState(wid, pid) { const { tick } = this.worldPlayer(wid, pid); return { lore: this.lore(wid, pid), mystic: this.mystic(wid, pid), cycle: this.genesis(wid, pid).cycle, day: Math.floor(Math.max(0, tick) / LORE.DAY_TICKS) }; }
  async lorePost(request, path) {
    const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
    const wid = this.wid(path, '/api/v90/lore/', '/'); if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
    const body = await this.body(request, 2048), pid = this.omniPid(request, account, body.player_id ?? ''); if (!pid) return json(400, { error: 'player_required' });
    const op = pyStr(body.operation ?? '');
    return json(200, this.db.transaction(() => {
      const S = this.loreState(wid, pid); let result;
      if (op === 'decode') result = LORE.decode(S.lore, S.mystic, pyStr(body.glyph ?? ''), pyStr(body.answer ?? '').slice(0, 40));
      else if (op === 'solar') result = LORE.claimSolar(S.lore, S.day);
      else throw new LORE.LoreError('unknown_lore_operation');
      this.saveLore(wid, pid, S.lore);
      return { result, lore: LORE.loreView(S.lore, S.mystic, S.cycle, S.day) };
    }));
  }
  async directorPost(request, path) {
    const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
    const wid = this.wid(path, '/api/v90/director/', '/'); if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
    const body = await this.body(request, 4096), pid = this.omniPid(request, account, body.player_id ?? ''); if (!pid) return json(400, { error: 'player_required' });
    if (!this.dirLimit) this.dirLimit = new Map();
    const k = wid + ':' + pid, nowS = Date.now() / 1000, q = (this.dirLimit.get(k) || []).filter((x) => x > nowS - 60);
    if (q.length >= 6) return json(429, { error: 'rate_limited', retry: 60 }); q.push(nowS); if (this.dirLimit.size > 5000) this.dirLimit.clear(); this.dirLimit.set(k, q);
    return json(200, { director: await DIR.direct({ db: this.db, env: this.env, fetchImpl: this.fetchImpl, wid, pid, body, account }) });
  }
  mysticSeed(wid) { return OMNI.seedOf('sky:' + wid); }
  // v9.0 mysticism (MYSTICAL/IN-GAME): server-authoritative sky, blessings, spirits, star charts and rune enchantments.
  async mysticPost(request, path) {
    const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
    const wid = this.wid(path, '/api/v90/mystic/', '/'); if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
    const body = await this.body(request, 4096), pid = this.omniPid(request, account, body.player_id ?? ''); if (!pid) return json(400, { error: 'player_required' });
    const op = pyStr(body.operation ?? '');
    return json(200, this.db.transaction(() => {
      const st = this.mystic(wid, pid), ex = this.explorer(wid, pid), { tick } = this.worldPlayer(wid, pid), seed = this.mysticSeed(wid); let result;
      if (op === 'bless') result = MYS.bless(st, ex, pyStr(body.site ?? ''), tick, seed);
      else if (op === 'commune') result = MYS.commune(st, ex, pyStr(body.spirit ?? ''), tick, seed);
      else if (op === 'solve') result = MYS.solve(st, ex, pyStr(body.puzzle ?? ''), body.choice, tick, seed);
      else if (op === 'enchant') { result = MYS.enchant(st, ex, pyStr(body.weapon ?? ''), pyStr(body.rune ?? ''), Object.keys(CMB.CB.weapons)); this.saveExplorer(wid, pid, ex); }
      else throw new MYS.MysticError('unknown_mystic_operation');
      this.saveMystic(wid, pid, st);
      return { result, mystic: MYS.view(st, tick, seed, this.genesis(wid, pid).cycle) };
    }));
  }
  mysticView(wid, pid) {
    const st = this.mystic(wid, pid), { tick } = this.worldPlayer(wid, pid), seed = this.mysticSeed(wid), cycle = this.genesis(wid, pid).cycle;
    const v = MYS.view(st, tick, seed, cycle);
    return { ...v, card: MYS.card(v.sky, v.grand_year), sites: MYS.MY.sites, spirits_all: MYS.MY.spirits, runes_all: MYS.MY.runes, signs: MYS.MY.signs, planets: MYS.MY.planets, alignments: MYS.MY.alignments, moon_fx: MYS.MY.moon_fx, grand: MYS.MY.grand, elements: MYS.MY.elements, grand_year_text: MYS.MY.grand_year, science_note: MYS.MY.science_note };
  }
  saveCombat(wid, pid, prof) {
    this.db.run('INSERT INTO combat_v90(world_id,player_id,record) VALUES(?,?,?) ON CONFLICT(world_id,player_id) DO UPDATE SET record=excluded.record', wid, pid, JSON.stringify(prof));
  }
  genesis(wid, pid) {
    const row = this.db.all('SELECT record FROM genesis_v90 WHERE world_id=? AND player_id=?', wid, pid)[0];
    return GENESIS.normRecord(row ? JSON.parse(row.record) : null);
  }
  saveGenesis(wid, pid, rec) {
    this.db.run('INSERT INTO genesis_v90(world_id,player_id,record) VALUES(?,?,?) ON CONFLICT(world_id,player_id) DO UPDATE SET record=excluded.record', wid, pid, JSON.stringify(rec));
  }
  legacyCount(wid) { // persistent world change: every edit players have left in any realm of this world
    let n = 0; for (const r of this.db.all('SELECT deltas FROM omni_v90 WHERE world_id=?', wid)) { try { n += Object.keys(JSON.parse(r.deltas) || {}).length; } catch { /* ignore */ } }
    return n;
  }
  genesisFacts(wid, pid) { const f = GENESIS.factsFrom(this.explorer(wid, pid), this.profile(wid, pid), this.combat(wid, pid), this.legacyCount(wid)); f.quests += this.coopCredit(wid, pid); { const m = this.mystic(wid, pid); f.quiz += m.charts.n; f.secrets += m.spirits.length; } return f; } // co-op credit = individual Lux
  async genesisPost(request, path) {
    const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
    const wid = this.wid(path, '/api/v90/genesis/', '/'); if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
    const body = await this.body(request, 4096), pid = this.omniPid(request, account, body.player_id ?? ''); if (!pid) return json(400, { error: 'player_required' });
    const op = pyStr(body.operation ?? '');
    return json(200, this.db.transaction(() => {
      const rec = this.genesis(wid, pid), facts = this.genesisFacts(wid, pid); let result;
      if (op === 'claim_law') result = GENESIS.claimLaw(rec, facts, pyStr(body.law ?? ''), body.answer);
      else if (op === 'choose_ending') { result = GENESIS.chooseEnding(rec, facts, pyStr(body.ending ?? '')); if (!codeOfWorld(wid) && !this.directory.remote && wid === 'Aurelia') result.speedrun = this.lb.finishRun(pid, rec.cycle); }
      else if (op === 'claim_reward') { const ex = this.explorer(wid, pid); result = GENESIS.claimReward(rec, facts, ex, pyStr(body.reward ?? '')); this.saveExplorer(wid, pid, ex); }
      else if (op === 'set_title') result = GENESIS.setTitle(rec, pyStr(body.title ?? ''));
      else if (op === 'new_genesis') {
        const ex = this.explorer(wid, pid); result = GENESIS.newGenesis(rec, facts, ex, body.confirm);
        const fresh = OMNI.normExplorer(null); fresh.inventions = result.keep.inventions; fresh.appearance = result.keep.appearance;
        this.saveExplorer(wid, pid, fresh); delete result.keep;
      } else throw new GENESIS.GenesisError('unknown_genesis_operation');
      this.saveGenesis(wid, pid, rec);
      return { result, genesis: GENESIS.genesisView(rec, this.genesisFacts(wid, pid)) };
    }));
  }
  combatCatalogue() {
    const sp = {}; for (const [id, d] of Object.entries(CMB.CB.specials)) sp[id] = { name: d.name, magic: !!d.magic, school: d.school || null, weapon: d.weapon, level: d.level, focus: d.focus, hits: d.hits, mult: d.mult, effect: d.effect, desc: d.desc, fx: d.fx };
    const shapes = {}; for (const [id, d] of Object.entries(CMB.CB.invent.shapes)) shapes[id] = { name: d.name, hits: d.hits, power: d.power, fact: d.fact };
    return { label: CMB.CB.label, specials: sp, shapes, weapons: CMB.CB.weapons, ranks: CMB.CB.ranks, enemies: Object.fromEntries(Object.entries(CMB.CB.enemies).map(([k, e]) => [k, { name: e.name }])), domains: CMB.CB.invent.domains, theory: CMB.CB.invent.theory };
  }
  // v9.0 combat: server issues the fight config (seeded), the browser plays it in real time, the server replays the input log to verify.
  async combatPost(request, path) {
    const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
    const wid = this.wid(path, '/api/v90/combat/', '/'); if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
    const body = await this.body(request, 48000), pid = this.omniPid(request, account, body.player_id ?? ''); if (!pid) return json(400, { error: 'player_required' });
    const op = pyStr(body.operation ?? '');
    if (op === 'start' && !combatAllow(wid + ':' + pid, Date.now() / 1000)) return json(429, { error: 'rate_limited', retry: 60 });
    let kill = null, won = false;
    const out = this.db.transaction(() => {
      const prof = this.combat(wid, pid); let result;
      if (op === 'start') {
        const { player, tick } = this.worldPlayer(wid, pid); const target = pyStr(body.target ?? 'practice');
        const weapon = player?.equipment?.weapon || 'traveller_blade', lv = CMB.levelOf(prof.xp);
        let species = 'lux_golem', elv = lv, hp = player?.max_health ?? 100;
        if (target !== 'practice') {
          const st = this.runtime.load(wid).state, c = (st.creatures || []).find((x) => x.id === target && x.alive !== false);
          if (!c) throw new CMB.CombatError('creature_not_found');
          if (!player) throw new CMB.CombatError('join_world_first');
          if (Math.abs(c.x - player.x) + Math.abs(c.y - player.y) > 2) throw new CMB.CombatError('target_out_of_reach');
          if (!Object.prototype.hasOwnProperty.call(CMB.CB.enemies, c.species)) throw new CMB.CombatError('unknown_enemy');
          species = c.species; elv = (c.level ?? 1) + Math.floor((lv - 1) / 2); hp = Math.max(1, player.health ?? 100);
        }
        { const dd = DIR.load(this.db, wid, pid); if (dd.enabled !== false) elv = Math.max(1, elv + (dd.offset | 0)); } // Malcolm director (shown to the player, can be switched off)
        { const g = this.genesis(wid, pid); elv += g.cycle + (body.hard === true && g.unlocked.includes('option_hard_duels') ? 2 : 0);
        }
        const seed = OMNI.h3(OMNI.seedOf(wid + ':' + pid), prof.counter, tick ?? 0);
        prof.counter += 1;
        let cfg = CMB.fightConfig(prof, seed, weapon, hp, species, elv, target);
        if (body.trial !== true) { const ms = this.mystic(wid, pid); cfg = MYS.apply(cfg, MYS.duelMods(ms, tick ?? 0, this.mysticSeed(wid), cfg.weapon)); this.saveMystic(wid, pid, ms); } // sky, blessing and rune (MYSTICAL/IN-GAME)
        prof.fight = { cfg, target };
        result = { fight: cfg };
      } else if (op === 'finish' || op === 'abandon') {
        if (!prof.fight) throw new CMB.CombatError('no_fight');
        const cfg = prof.fight.cfg;
        const res = CMB.runFight(cfg, op === 'abandon' ? [[0, 'flee']] : body.inputs);
        const award = CMB.applyResult(prof, cfg, res);
        const { events, ...rest } = res;
        const claimed = typeof body.claimed === 'string' ? body.claimed : null;
        result = { verified: claimed === null ? null : claimed === res.outcome, result: { ...rest, events: events.length }, award };
        if (res.outcome === 'win' && cfg.enemy.target !== 'practice') kill = cfg.enemy.target;
        if (res.outcome === 'win') { won = true; if (codeOfWorld(wid)) this.rooms.track(codeOfWorld(wid), pid, 'duel_win', 1); }
      } else if (op === 'learn') result = CMB.learn(prof, pyStr(body.special ?? ''));
      else if (op === 'equip') result = CMB.equip(prof, pyStr(body.weapon ?? ''), body.loadout);
      else if (op === 'upgrade' || op === 'invent') {
        const ex = this.explorer(wid, pid);
        if (op === 'upgrade') result = CMB.upgrade(prof, ex, pyStr(body.special ?? ''));
        else { ex.attempts += 1; result = CMB.inventMove(prof, ex, { weapon: body.weapon, shape: body.shape, principles: body.principles }, OMNI.h3(OMNI.seedOf(wid + ':' + pid), ex.attempts, 77)); }
        this.saveExplorer(wid, pid, ex);
      } else throw new CMB.CombatError('unknown_combat_operation');
      this.saveCombat(wid, pid, prof);
      return { result, combat: CMB.combatView(prof) };
    });
    if (won) await this.directory.contribute(pid, 'duel wins', 1).catch(() => null); // Timeline Fracture community goal
    if (kill) { // verified win: resolve through the unchanged v7.4 attack rules (XP, loot, quests, respawn) so nothing is duplicated
      let world = null;
      for (let i = 0; i < 24; i++) {
        try { world = this.actWithProgress(wid, pid, { type: 'attack', target: kill }); } catch { break; }
        const c = (world.state.creatures || []).find((x) => x.id === kill);
        if (!c || c.alive === false) break;
      }
      out.world = world ? { revision: world.revision, player: world.state.players[pid], unlocked: world.v90?.unlocked || [] } : null;
    }
    return json(200, out);
  }
  realmState(wid, realm) {
    const row = this.db.all('SELECT eco, deltas FROM omni_v90 WHERE world_id=? AND realm=?', wid, realm.id)[0];
    return row ? { eco: JSON.parse(row.eco), deltas: JSON.parse(row.deltas) } : { eco: OMNI.newEcology(realm), deltas: {} };
  }
  saveRealm(wid, realm, st) {
    const regrow = OMNI.OMNI.regrow, now = st.eco.tick;
    for (const [k, [kind, at]] of Object.entries(st.deltas)) if (kind === '-' && now - at >= regrow) delete st.deltas[k]; // regrown: forget the edit
    this.db.run('INSERT INTO omni_v90(world_id,realm,eco,deltas) VALUES(?,?,?,?) ON CONFLICT(world_id,realm) DO UPDATE SET eco=excluded.eco, deltas=excluded.deltas',
      wid, realm.id, JSON.stringify(st.eco), JSON.stringify(st.deltas));
  }
  omniPid(request, account, fromBody) { return account || pyStr(fromBody ?? new URL(request.url).searchParams.get('player') ?? '').slice(0, 80); }
  worldPlayer(wid, pid) {
    const row = this.db.all('SELECT state FROM worlds WHERE id=?', wid)[0];
    const st = row ? JSON.parse(row.state) : null;
    return { player: st?.players?.[pid] ?? null, tick: st?.tick ?? 0 };
  }
  // v7.4 action + v9.0 progression in ONE transaction (used by HTTP and WebSocket paths).
  actWithProgress(wid, pid, action) {
    return this.db.transaction(() => {
      if (action && typeof action === 'object' && action.type === 'chat') {
        const chk = V90.checkChat(pyStr(action.message ?? ''));
        if (!chk.ok) throw new ValueError('chat_blocked_' + chk.category);
        action = { ...action, message: chk.message };
      }
      const before = this.worldPlayer(wid, pid).player;
      const result = this.runtime.act(wid, pid, action);
      const after = result.state.players[pid];
      const tag = [...pid].slice(0, 12).join('');
      const last = [...(result.state.chronicle || [])].reverse().find((c) => c.player === tag && c.type === action.type);
      const prof = V90.observe(this.profile(wid, pid), action.type, before ? JSON.parse(JSON.stringify(before)) : {}, after, last?.message ?? '');
      V90.noteEvent(prof, result.state.tick ?? 0);
      const unlocked = V90.unlockAchievements(prof, after?.level ?? 1, result.state.tick ?? 0);
      this.saveProfile(wid, pid, prof);
      this.roomHooks(wid, pid, action);
      return { ...result, v90: { unlocked, renown: prof.renown } };
    });
  }
  bumpLab(account, n = 1) {
    if (!account) return;
    const prof = this.profile('Aurelia', account); prof.stats.lab += n;
    V90.unlockAchievements(prof, this.worldPlayer('Aurelia', account).player?.level ?? 1, 0); this.saveProfile('Aurelia', account, prof);
  }
  v90View(wid, pid) {
    const { player, tick } = this.worldPlayer(wid, pid);
    const prof = this.profile(wid, pid); V90.noteEvent(prof, tick);
    const unlocked = V90.unlockAchievements(prof, player?.level ?? 1, tick); this.saveProfile(wid, pid, prof);
    return { ...V90.view(prof, pid, player?.level ?? 1, tick), unlocked };
  }
  async identity(request) {
    const h = request.headers.get('Authorization') || '';
    const credential = h.startsWith('Bearer ') ? h.slice(7) : '';
    const account = this.directory?.remote ? await this.directory.whoami(credential).catch(() => null) : await this.auth.validate(credential);
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
      { const gate = await this.roomGate(request, path); if (gate) return gate; }
      if (method === 'GET' || method === 'HEAD') { const r = await this.mpGet(request, path); if (r) return r; }
      if (method === 'POST') { const r = await this.mpPost(request, path); if (r) return r; }
      if (method === 'GET' || method === 'HEAD') return await this.get(request, path);
      if (method === 'POST') return await this.post(request, path);
      return json(405, { error: 'method_not_allowed' });
    } catch (e) {
      if (e instanceof ValueError || e instanceof WorldError || e instanceof V90.V90Error || e instanceof OMNI.OmniError || e instanceof BARD.BardError || e instanceof CMB.CombatError || e instanceof MYS.MysticError || e instanceof LORE.LoreError || e instanceof GENESIS.GenesisError || MP_ERRORS.some((E) => e instanceof E) || e instanceof TypeError || e instanceof RangeError) return json(400, { error: e.message });
      console.error(e); return json(500, { error: 'internal_error' });
    }
  }
  async bard(request, path) {
    const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
    const wid = this.wid(path, '/api/v90/bard/', '/'); if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
    const body = await this.body(request, 4096);
    for (const k of Object.keys(body)) if (!['npc', 'message', 'player_id'].includes(k)) return json(400, { error: 'unknown_field' });
    const pid = this.omniPid(request, account, body.player_id ?? ''); if (!pid) return json(400, { error: 'player_required' });
    const npc = pyStr(body.npc ?? ''), message = typeof body.message === 'string' ? body.message : '';
    const nowMs = this.nowMs ? this.nowMs() : Date.now(), key = 'p' + OMNI.seedOf(`${wid}\u0000${pid}`);
    if (!bardWindow(key, nowMs / 1000) || bumpUsage(this.db, `bard:${new Date(nowMs).toISOString().slice(0, 10)}:${key}`) > BARD.BARD.limits.per_day) return json(429, { error: 'bard_rate_limited' });
    const seed = OMNI.seedOf(`${wid}:${pid}`);
    let p = this.explorer(wid, pid);
    BARD.checkLocation(p, npc);
    let live = null, reason = account ? (malcolmEnabled(this.env) ? null : 'malcolm_offline_mode') : 'sign_in_for_live_npcs';
    const [clean] = V90.redactPii(message);
    if (!reason && message.trim() && [...message].length <= BARD.BARD.limits.max_chars && !V90.classify(clean)) {
      reason = liveSlot(this.db, account, nowMs);
      if (!reason) {
        const ctx = BARD.turnContext(p, npc, clean, seed);
        const messages = [...ctx.hist.flatMap((h) => [{ role: 'user', content: h.u }, { role: 'assistant', content: h.a }]), { role: 'user', content: clean }];
        const text = await callUpstream({ env: this.env, fetchImpl: this.fetchImpl, system: BARD.bardPrompt(npc, ctx), messages });
        live = text === null ? null : BARD.parseBardReply(text);
        if (live === null) reason = 'malcolm_unavailable';
        p = this.explorer(wid, pid); // re-read after the await so concurrent turns can't be lost
      }
    }
    return json(200, this.db.transaction(() => {
      const r = BARD.converse(p, npc, message, seed, live);
      this.saveExplorer(wid, pid, p);
      return { ...r, ...(r.source === 'offline' && reason ? { reason } : {}), label: BARD.BARD.label, explorer: OMNI.explorerView(p) };
    }));
  }
  wid(path, prefix, sep) { return decodeURIComponent(path.slice(prefix.length).split(sep)[0]); }
  async get(request, path) {
    if (path === '/health' || path === '/api/health') return json(200, { status: 'ok', title: TITLE, engine: 'OGCE', version: VERSION, runtime: 'cloudflare-worker+durable-object', accounts_required: Boolean(this.token), malcolm: malcolmEnabled(this.env) ? 'live' : 'offline' });
    if (path === '/ready') {
      try { this.db.all('SELECT 1'); return json(200, { status: 'ready' }); } catch { return json(503, { status: 'not_ready' }); }
    }
    if (path.startsWith('/api/v90/share/') || path.startsWith('/s/')) {
      const id = decodeURIComponent(path.split('/').pop() || '');
      if (!/^[a-z2-9]{10}$/.test(id)) return path.startsWith('/s/') ? html(404, '<h1>Card not found</h1>') : json(404, { error: 'share_not_found' });
      const row = this.db.all('SELECT card, created FROM shares_v90 WHERE id=?', id)[0];
      if (!row) return path.startsWith('/s/') ? html(404, '<!doctype html><title>Not found</title><h1>This discovery card does not exist.</h1>') : json(404, { error: 'share_not_found' });
      const card = JSON.parse(row.card), url = new URL(request.url), link = `${url.origin}/s/${id}`;
      if (path.startsWith('/s/')) return html(200, cardHTML(card, link));
      return json(200, { id, url: link, card, text: cardText(card, link), markdown: cardMarkdown(card, link) });
    }
    if (path.startsWith('/api/v90/card/')) {
      const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
      const [, , , , w, invId] = path.split('/'), wid = decodeURIComponent(w || ''); if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
      const pid = this.omniPid(request, account); if (!pid) return json(400, { error: 'player_required' });
      const inv = this.explorer(wid, pid).inventions.find((i) => i.id === invId); if (!inv) return json(404, { error: 'unknown_invention' });
      const card = OMNI.buildCard(inv, inv.ai_lines);
      return json(200, { card, text: cardText(card), markdown: cardMarkdown(card), html: cardHTML(card) });
    }
    if (path.startsWith('/api/v90/genesis/')) {
      const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
      const wid = this.wid(path, '/api/v90/genesis/', '/'); if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
      const pid = this.omniPid(request, account, null); if (!pid) return json(400, { error: 'player_required' });
      return json(200, this.db.transaction(() => ({ genesis: GENESIS.genesisView(this.genesis(wid, pid), this.genesisFacts(wid, pid)) })));
    }
    if (path === '/api/v90/combat/catalogue') return json(200, this.combatCatalogue());
    if (path.startsWith('/api/v90/lore/')) {
      const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
      const wid = this.wid(path, '/api/v90/lore/', '/'); if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
      const pid = this.omniPid(request, account, null); if (!pid) return json(400, { error: 'player_required' });
      return json(200, this.db.transaction(() => { const S = this.loreState(wid, pid); return LORE.loreView(S.lore, S.mystic, S.cycle, S.day); }));
    }
    if (path.startsWith('/api/v90/director/')) {
      const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
      const wid = this.wid(path, '/api/v90/director/', '/'); if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
      const pid = this.omniPid(request, account, null); if (!pid) return json(400, { error: 'player_required' });
      return json(200, { director: DIR.load(this.db, wid, pid) });
    }
    if (path.startsWith('/api/v90/mystic/')) {
      const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
      const wid = this.wid(path, '/api/v90/mystic/', '/'); if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
      const pid = this.omniPid(request, account, null); if (!pid) return json(400, { error: 'player_required' });
      return json(200, this.db.transaction(() => this.mysticView(wid, pid)));
    }
    if (path.startsWith('/api/v90/combat/')) {
      const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
      const wid = this.wid(path, '/api/v90/combat/', '/'); if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
      const pid = this.omniPid(request, account, null); if (!pid) return json(400, { error: 'player_required' });
      const prof = this.combat(wid, pid);
      return json(200, { combat: CMB.combatView(prof), fight: prof.fight ? prof.fight.cfg : null });
    }
    if (path === '/api/v90/bard/cast') return json(200, { cast: BARD.publicCast(), label: BARD.BARD.label, about: BARD.BARD.about, limits: { per_minute: BARD.BARD.limits.per_minute, max_chars: BARD.BARD.limits.max_chars } });
    if (path.startsWith('/api/v90/bard/')) {
      const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
      const [wid, npc] = path.slice('/api/v90/bard/'.length).split('/').map(decodeURIComponent);
      if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
      if (!Object.prototype.hasOwnProperty.call(BARD.CAST, npc ?? '')) return json(404, { error: 'unknown_npc' });
      const pid = this.omniPid(request, account); if (!pid) return json(400, { error: 'player_required' });
      return json(200, BARD.bardView(this.explorer(wid, pid), npc));
    }
    if (path === '/api/v90/omni/realms') {
      const O = OMNI.OMNI;
      return json(200, { label: O.label, chunk: O.chunk, habitat: O.habitat, realms: O.realms, biomes: O.biomes, species: O.species, factions: O.factions,
        npcs: Object.fromEntries(Object.entries(O.npcs).map(([k, n]) => [k, { name: n.name, faction: n.faction, x: n.x, y: n.y, likes: n.likes }])),
        recipes: O.recipes, place: O.place, harvest: O.harvest, regrow: O.regrow, appearance: O.appearance, endings: Object.fromEntries(Object.entries(O.endings).map(([k, e]) => [k, e.name])) });
    }
    if (path.startsWith('/api/v90/omni/')) {
      const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
      const parts = path.split('/'), kind = parts[4], wid = decodeURIComponent(parts[5] || ''); if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
      const pid = this.omniPid(request, account); if (!pid) return json(400, { error: 'player_required' });
      const q = new URL(request.url).searchParams, int = (k, d, lo, hi) => { const v = Number.parseInt(q.get(k) ?? d, 10); return Number.isInteger(v) ? Math.max(lo, Math.min(hi, v)) : d; };
      return json(200, this.db.transaction(() => {
        const p = this.explorer(wid, pid), realm = OMNI.realmOf(q.get('realm') || p.realm, p.custom_realms);
        if (kind === 'me') return { explorer: OMNI.explorerView(p) };
        const st = this.realmState(wid, realm);
        if (kind === 'eco') {
          const { tick } = this.worldPlayer(wid, pid); OMNI.evolve(st.eco, realm, Math.max(st.eco.tick, tick)); this.saveRealm(wid, realm, st);
          return OMNI.ecoView(st.eco);
        }
        if (kind === 'chunks') {
          const lod = int('lod', 0, 0, 2), r = int('r', 1, 0, lod === 0 ? 3 : 8), cx = int('cx', 0, -70000, 70000), cy = int('cy', 0, -70000, 70000);
          const diff = V90.difficulty(this.profile(wid, pid), this.worldPlayer(wid, pid).player?.level ?? 1), chunks = [];
          for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) chunks.push(OMNI.chunk(realm, cx + i, cy + j, lod, st.deltas, st.eco.tick, diff, 1));
          return { realm: realm.id, tick: st.eco.tick, chunks };
        }
        throw new ValueError('unknown_omni_view');
      }));
    }
    if (path === '/api/v90/codex') return json(200, { title: TITLE, version: VERSION, lessons: V90.DATA.lessons, grades: V90.DATA.grades, cra_trace: V90.DATA.cra_trace, events: V90.DATA.events, ranks: V90.DATA.ranks });
    if (path.startsWith('/api/v90/profile/')) {
      const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
      const wid = this.wid(path, '/api/v90/profile/', '?'); if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
      const pid = account || pyStr(new URL(request.url).searchParams.get('player') || '').slice(0, 80);
      if (!pid) return json(400, { error: 'player_required' });
      return json(200, this.db.transaction(() => this.v90View(wid, pid)));
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
    if (path.startsWith('/api/v90/profile/')) {
      const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
      const wid = this.wid(path, '/api/v90/profile/', '/'); if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
      const body = await this.body(request, 4096);
      const pid = account || pyStr(body.player_id ?? '').slice(0, 80); if (!pid) return json(400, { error: 'player_required' });
      return json(200, this.db.transaction(() => {
        const { player, tick } = this.worldPlayer(wid, pid); const level = player?.level ?? 1;
        const prof = this.profile(wid, pid); const diff = V90.difficulty(prof, level); let result;
        const op = body.operation;
        if (op === 'accept_bounty') result = V90.acceptBounty(prof, pid, tick, pyStr(body.bounty_id ?? ''), diff);
        else if (op === 'claim_bounty') result = { renown: V90.claimBounty(prof) };
        else if (op === 'abandon_bounty') { V90.abandonBounty(prof); result = { abandoned: true }; }
        else if (op === 'quiz_start') result = V90.startQuiz(prof, pid, pyStr(body.lesson ?? ''), diff);
        else if (op === 'quiz_answer') result = V90.answerQuiz(prof, body.answer);
        else throw new ValueError('unknown_v90_operation');
        if (result && 'baseline' in result) { const { baseline, ...rest } = result; result = rest; }
        const unlocked = V90.unlockAchievements(prof, level, tick); this.saveProfile(wid, pid, prof);
        return { result, unlocked, profile: V90.view(prof, pid, level, tick) };
      }));
    }
    if (path.startsWith('/api/v90/bard/')) return this.bard(request, path);
    if (path.startsWith('/api/v90/combat/')) return this.combatPost(request, path);
    if (path.startsWith('/api/v90/genesis/')) return this.genesisPost(request, path);
    if (path.startsWith('/api/v90/mystic/')) return this.mysticPost(request, path);
    if (path.startsWith('/api/v90/lore/')) return this.lorePost(request, path);
    if (path.startsWith('/api/v90/director/')) return this.directorPost(request, path);
    if (path.startsWith('/api/v90/omni/')) {
      const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
      const wid = this.wid(path, '/api/v90/omni/', '/'); if (!validWorldId(wid)) return json(400, { error: 'invalid_world' });
      const body = await this.body(request, 8192), pid = this.omniPid(request, account, body.player_id ?? ''); if (!pid) return json(400, { error: 'player_required' });
      const op = pyStr(body.operation ?? '');
      let found = 0;
      const out = this.db.transaction(() => {
        const p = this.explorer(wid, pid); const seen = p.bestiary.length, npcBefore = JSON.stringify(p.npc ?? {});
        const realm = OMNI.realmOf(op === 'travel' ? pyStr(body.realm ?? '') : p.realm, p.custom_realms);
        const st = this.realmState(wid, realm); OMNI.evolve(st.eco, realm, st.eco.tick + 1); // the world evolves a tick as you act
        let result;
        if (op === 'talk') {
          const ch = body.choice === undefined || body.choice === null ? null : body.choice;
          result = OMNI.talk(p, pyStr(body.npc ?? ''), pyStr(body.node ?? 'start'), ch, OMNI.h3(OMNI.seedOf(wid), st.eco.tick, 0));
          if (result.policy) { const home = realm.id === 'aurelia' ? st : null; if (home) Object.assign(home.eco.policy, result.policy); }
        } else if (op === 'gift') result = OMNI.gift(p, pyStr(body.npc ?? ''), pyStr(body.item ?? ''));
        else {
          if (op === 'place' && Object.keys(st.deltas).length >= 20000) throw new ValueError('realm_full');
          result = OMNI.explorerAct(p, op, body, realm, st.deltas, st.eco.tick, st.eco, OMNI.seedOf(wid));
        }
        this.saveRealm(wid, realm, st); this.saveExplorer(wid, pid, p);
        found = Math.max(0, p.bestiary.length - seen);
        const code = codeOfWorld(wid);
        if (code) {
          if (found) this.rooms.track(code, pid, 'discovery', found);
          if (op === 'talk' || op === 'gift') {
            this.rooms.track(code, pid, 'npc', 1);
            const id = pyStr(body.npc ?? ''), was = JSON.parse(npcBefore)[id]?.rel ?? 0, now = p.npc?.[id]?.rel ?? 0, nm = OMNI.OMNI.npcs[id]?.name || id;
            if (Math.abs(now - was) >= 5) this.rooms.remember(code, id, `${nm} remembers that one of your party ${now > was ? (op === 'gift' ? 'brought a kind gift' : 'helped and listened') : 'went against their wishes'}.`);
          }
        }
        return { result, tick: st.eco.tick, explorer: OMNI.explorerView(p) };
      });
      if (found) await this.directory.contribute(pid, 'discoveries', found).catch(() => null); // Strata Eclipse community goal
      return json(200, out);
    }
    if (path === '/api/v90/share') {
      const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
      const body = await this.body(request, 2048), wid = validWorldId(pyStr(body.world ?? 'Aurelia')) ? pyStr(body.world ?? 'Aurelia') : 'Aurelia';
      const pid = this.omniPid(request, account, body.player_id ?? ''); if (!pid) return json(400, { error: 'player_required' });
      const inv = this.explorer(wid, pid).inventions.find((i) => i.id === body.invention); if (!inv) return json(404, { error: 'unknown_invention' });
      const owner = 'o' + OMNI.seedOf(`${wid}\u0000${pid}`), now = Math.floor(Date.now() / 1000), origin = new URL(request.url).origin;
      const prior = this.db.all('SELECT id FROM shares_v90 WHERE owner=? AND sig=?', owner, inv.sig)[0];
      if (prior) return json(200, { id: prior.id, url: `${origin}/s/${prior.id}`, reused: true });
      if (this.db.all('SELECT COUNT(*) AS n FROM shares_v90 WHERE owner=? AND created>?', owner, now - 3600)[0].n >= SHARE_LIMITS.perHour) return json(429, { error: 'share_rate_limited' });
      if (this.db.all('SELECT COUNT(*) AS n FROM shares_v90 WHERE created>?', now - 86400)[0].n >= SHARE_LIMITS.globalDay) return json(429, { error: 'share_rate_limited' });
      const card = OMNI.buildCard(inv, (inv.ai_lines || []).filter((l) => !V90.classify(l.text) && !V90.redactPii(l.text)[1]));
      const flagged = [card.title, card.definition, card.summary, ...card.statements.map((s) => s.text)].some((t) => V90.classify(t));
      if (flagged) return json(422, { error: 'moderation_blocked' });
      let id = '';
      const bytes = crypto.getRandomValues(new Uint8Array(10)), A = 'abcdefghjkmnpqrstuvwxyz23456789';
      for (const b of bytes) id += A[b % A.length];
      this.db.run('INSERT INTO shares_v90(id,owner,sig,card,created) VALUES(?,?,?,?,?)', id, owner, inv.sig, JSON.stringify(card), now);
      return json(200, { id, url: `${origin}/s/${id}` });
    }
    if (path === '/api/v90/malcolm') {
      const { account, unauthorized } = await this.identity(request); if (unauthorized) return json(401, { error: 'unauthorized' });
      const body = await this.body(request, 16384);
      const wid = validWorldId(pyStr(body.world ?? 'Aurelia')) ? pyStr(body.world ?? 'Aurelia') : 'Aurelia';
      const { player, tick } = account ? this.worldPlayer(wid, account) : { player: null, tick: 0 };
      let reply;
      const context = { level: player?.level ?? 1, health: player?.health, max_health: player?.max_health, tick };
      if (body.mode === 'npc') {
        const npc = OMNI.OMNI.npcs[pyStr(body.npc ?? '')]; if (!npc || !Object.hasOwn(OMNI.OMNI.npcs, body.npc)) return json(400, { error: 'invalid_npc' });
        const pid = account || pyStr(new URL(request.url).searchParams.get('player') ?? '').slice(0, 80), mem = pid ? (this.explorer(wid, pid).npc[body.npc] || {}) : {};
        Object.assign(context, { npc_name: npc.name, npc_persona: npc.persona, npc_faction: OMNI.OMNI.factions[npc.faction].name, npc_rel: mem.rel ?? 0,
          npc_line: OMNI.npcLine(body.npc, mem.rel ?? 0, (mem.times ?? 0) + 1, OMNI.seedOf(wid + body.npc)) });
      }
      let invOwner = null;
      if (body.mode === 'invent' && typeof body.invention === 'string' && /^i[0-9]{1,4}$/.test(body.invention)) {
        const pid = account || pyStr(new URL(request.url).searchParams.get('player') ?? '').slice(0, 80);
        const inv = pid ? this.explorer(wid, pid).inventions.find((i) => i.id === body.invention) : null;
        if (!inv) return json(400, { error: 'unknown_invention' });
        invOwner = pid;
        Object.assign(context, { inv_name: inv.name, inv_category: inv.category, inv_form: inv.form, inv_effect: inv.effect, inv_explain: inv.explain,
          inv_principles: inv.principles.join(', '), inv_materials: Object.entries(inv.materials).map(([k, v]) => `${v} ${k}`).join(', ') });
      }
      try { reply = await companion({ env: this.env, db: this.db, fetchImpl: this.fetchImpl, account, body, context }); }
      catch (e) { if (e.status === 400) return json(400, { error: e.message }); throw e; }
      if (invOwner && reply.source === 'malcolm') { // keep Malcolm's explanation with the invention (game effect stays the deterministic one)
        const p = this.explorer(wid, invOwner), inv = p.inventions.find((i) => i.id === body.invention);
        if (inv) { inv.explain_ai = [...reply.text].slice(0, 800).join(''); inv.ai_lines = OMNI.parseAiLines(inv.explain_ai).filter((l) => !V90.classify(l.text) && !l.text.includes('[removed]')); this.saveExplorer(wid, invOwner, p); reply.ai_lines = inv.ai_lines; }
      }
      if (account) { const prof = this.profile(wid, account); prof.stats.malcolm += 1; reply.unlocked = V90.unlockAchievements(prof, player?.level ?? 1, tick); this.saveProfile(wid, account, prof); }
      return json(200, reply);
    }
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
      if (['experiment', 'hypothesis', 'invent', 'train', 'cast'].includes(op)) this.bumpLab(account);
      return json(200, { result, world: await world.snapshot() });
    }
    if (path.startsWith('/api/mulux/world/')) {
      const wid = this.wid(path, '/api/mulux/world/', '/');
      if (!wid || cpLen(wid) > 64) return json(400, { error: 'invalid_world' });
      const body = await this.body(request, 16384); const world = await this.getMulux(wid);
      const operation = body.operation;
      if (operation === 'tick') {
        const result = await world.tick(pyInt(body.count ?? 1)); this.saveMulux(wid, world);
        this.bumpLab((await this.identity(request)).account);
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
    return json(200, this.actWithProgress(wid, playerId, body.action));
  }
}
