// v9.0 global social layer (lives in the main Durable Object): privacy, friends, blocks/mutes, reports, friend-only DMs,
// Houses (charter, banner, shared base and stash), the public Hall of Discoveries with voting, world-wide community
// events, weekly seeded challenge worlds with leaderboards, and opt-in PvP arenas / team trials with skill-based matchmaking.
// Every player-written public string goes through moderation.js (deterministic first, then Malcolm, fail-closed).
import * as CMB from './combat.js';
import { h3, seedOf } from './omniverse.js';
import { moderate, logEntry } from './moderation.js';
import { sanitizePrivacy, BANNER } from '../../web/js/mpdata.js';

export class SocialError extends Error { constructor(code) { super(code); this.code = code; } }
const S = (v, n = 80) => [...String(v ?? '')].slice(0, n).join('');
const now = () => Math.floor(Date.now() / 1000);
const pair = (a, b) => (a < b ? [a, b] : [b, a]);
const A32 = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function code(prefix, n = 6) { let s = ''; for (const b of crypto.getRandomValues(new Uint8Array(n))) s += A32[b % A32.length]; return `${prefix}${s}`; }

export const ARENA = Object.freeze({ k: 32, kNew: 40, newGames: 10, start: 1000, band: 100, widen: 50, widenEvery: 10, maxBand: 600, teamSize: 2, levelCap: 10, timeout: 600, rankCap: 1 });
export const WEEKLY = Object.freeze({ attemptsPerDay: 5, species: ['moss_wolf', 'silverhart', 'lux_golem'] });
export const EVENTS = Object.freeze({
  strata_eclipse: { name: 'Strata Eclipse', icon: '🌘', goal: 300, unit: 'discoveries', blurb: 'The strata line up and the light dims. Together, make 300 new discoveries before the eclipse passes.', reward: 'title_eclipse_witness', reward_name: 'Eclipse Witness' },
  timeline_fracture: { name: 'Timeline Fracture', icon: '💥', goal: 500, unit: 'duel wins', blurb: 'Cracks run through the timeline. Every verified duel win mends a shard: 500 together seals the fracture.', reward: 'title_fracture_mender', reward_name: 'Fracture Mender' },
});
export const HOUSE_LIMITS = Object.freeze({ members: 24, inviteDays: 7 });

// ISO week (UTC) e.g. "2026W46".
export function isoWeek(ms = Date.now()) {
  const d = new Date(ms); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); const wk = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return { id: `${t.getUTCFullYear()}W${String(wk).padStart(2, '0')}`, n: wk, year: t.getUTCFullYear() };
}
/** Community event calendar: deterministic from the ISO week. Week%3==0 Strata Eclipse, ==1 Timeline Fracture, ==2 calm (next is shown). */
export function eventFor(ms = Date.now()) {
  const w = isoWeek(ms); const k = w.n % 3;
  const kind = k === 0 ? 'strata_eclipse' : k === 1 ? 'timeline_fracture' : null;
  const nextKind = k === 2 ? 'strata_eclipse' : null;
  return { week: w.id, active: kind ? { id: `${kind}:${w.id}`, kind, ...EVENTS[kind] } : null, next: nextKind ? { kind: nextKind, ...EVENTS[nextKind], starts: 'next week' } : null };
}
export function weeklyChallenge(ms = Date.now()) {
  const w = isoWeek(ms), seed = seedOf('weekly:' + w.id) >>> 0;
  const species = WEEKLY.species[seed % WEEKLY.species.length], level = 3 + (h3(seed, 1, 2) % 4);
  return { week: w.id, seed, world: `wk_${w.id}`, species, level, name: `Week ${w.n} trial: ${CMB.CB.enemies[species].name} · level ${level}` };
}
/** Fair trial profile: special ranks are equalised and skill is capped so upgrades and grinding can't decide a match. */
export function trialProfile(prof) {
  const p = CMB.normProfile(JSON.parse(JSON.stringify(prof)));
  for (const k of Object.keys(p.specials)) p.specials[k] = ARENA.rankCap;
  const capXp = CMB.CB.skill.xp[ARENA.levelCap - 1]; if (p.xp > capXp) p.xp = capXp;
  p.adapt = {}; // every contestant faces the same fresh (un-adapted) opponent
  return p;
}
export function trialScore(res) {
  if (res.outcome === 'win') return 100000 + res.player.hp * 100 + Math.max(0, 4000 - res.ticks) + 10 * Math.min(res.stats.max_combo, 20);
  return Math.max(0, (res.enemy.hpmax - res.enemy.hp) * 10) + 5 * res.stats.parries;
}
export function elo(ra, rb, scoreA, games = 99) {
  const e = 1 / (1 + 10 ** ((rb - ra) / 400)), k = games < ARENA.newGames ? ARENA.kNew : ARENA.k;
  return Math.round(ra + k * (scoreA - e));
}
/** Skill-based matchmaking. queue: [{pid, mmr, since, mode}] -> { matches:[{mode, players, teams}], rest } (deterministic order). */
export function matchmake(queue, nowS) {
  const band = (q) => Math.min(ARENA.maxBand, ARENA.band + ARENA.widen * Math.floor((nowS - q.since) / ARENA.widenEvery));
  const out = [], used = new Set();
  const sorted = [...queue].sort((a, b) => a.since - b.since || (a.pid < b.pid ? -1 : 1));
  for (const q of sorted) {
    if (used.has(q.pid)) continue;
    if (q.mode === 'duel') {
      const cand = sorted.filter((o) => o.mode === 'duel' && !used.has(o.pid) && o.pid !== q.pid && Math.abs(o.mmr - q.mmr) <= Math.max(band(q), band(o)))
        .sort((a, b) => Math.abs(a.mmr - q.mmr) - Math.abs(b.mmr - q.mmr) || a.since - b.since)[0];
      if (cand) { used.add(q.pid); used.add(cand.pid); out.push({ mode: 'duel', players: [q.pid, cand.pid], teams: [[q.pid], [cand.pid]] }); }
    } else if (q.mode === 'team') {
      const need = ARENA.teamSize * 2;
      const pool = sorted.filter((o) => o.mode === 'team' && !used.has(o.pid) && Math.abs(o.mmr - q.mmr) <= Math.max(band(q), band(o)));
      if (pool.length >= need) {
        const pick = [q, ...pool.filter((o) => o.pid !== q.pid).sort((a, b) => Math.abs(a.mmr - q.mmr) - Math.abs(b.mmr - q.mmr)).slice(0, need - 1)];
        pick.sort((a, b) => b.mmr - a.mmr || (a.pid < b.pid ? -1 : 1));
        const A = [], B = []; pick.forEach((p, i) => ((i % 4 === 0 || i % 4 === 3) ? A : B).push(p.pid)); // snake draft keeps team averages close
        for (const p of pick) used.add(p.pid);
        out.push({ mode: 'team', players: pick.map((p) => p.pid), teams: [A, B] });
      }
    }
  }
  return { matches: out, rest: queue.filter((q) => !used.has(q.pid)) };
}

export class Social {
  constructor(db, { env = {}, fetchImpl, secret = '' } = {}) {
    this.db = db; this.env = env; this.fetchImpl = fetchImpl; this.secret = secret || 'dev-only-salt';
    const T = (sql) => db.run(sql);
    T('CREATE TABLE IF NOT EXISTS privacy_v90(player TEXT PRIMARY KEY, record TEXT NOT NULL)');
    T('CREATE TABLE IF NOT EXISTS friendcodes_v90(code TEXT PRIMARY KEY, player TEXT NOT NULL UNIQUE)');
    T('CREATE TABLE IF NOT EXISTS friends_v90(a TEXT NOT NULL, b TEXT NOT NULL, status TEXT NOT NULL, requester TEXT NOT NULL, since INTEGER NOT NULL, PRIMARY KEY(a,b))');
    T('CREATE TABLE IF NOT EXISTS blocks_v90(player TEXT NOT NULL, target TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY(player,target,kind))');
    T('CREATE TABLE IF NOT EXISTS dms_v90(id INTEGER PRIMARY KEY AUTOINCREMENT, a TEXT NOT NULL, b TEXT NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL, ts INTEGER NOT NULL)');
    T('CREATE TABLE IF NOT EXISTS houses_v90(id TEXT PRIMARY KEY, record TEXT NOT NULL)');
    T('CREATE TABLE IF NOT EXISTS house_members_v90(player TEXT PRIMARY KEY, house TEXT NOT NULL, role TEXT NOT NULL, since INTEGER NOT NULL)');
    T('CREATE TABLE IF NOT EXISTS hall_v90(id TEXT PRIMARY KEY, record TEXT NOT NULL, status TEXT NOT NULL, votes INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)');
    T('CREATE TABLE IF NOT EXISTS hall_votes_v90(entry TEXT NOT NULL, voter TEXT NOT NULL, PRIMARY KEY(entry,voter))');
    T('CREATE TABLE IF NOT EXISTS events_v90(id TEXT PRIMARY KEY, progress INTEGER NOT NULL, contributors TEXT NOT NULL)');
    T('CREATE TABLE IF NOT EXISTS event_players_v90(event TEXT NOT NULL, player TEXT NOT NULL, n INTEGER NOT NULL, claimed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(event,player))');
    T('CREATE TABLE IF NOT EXISTS weekly_v90(week TEXT NOT NULL, player TEXT NOT NULL, best INTEGER NOT NULL, outcome TEXT NOT NULL, attempts INTEGER NOT NULL, day TEXT NOT NULL, day_attempts INTEGER NOT NULL, pending TEXT, PRIMARY KEY(week,player))');
    T('CREATE TABLE IF NOT EXISTS ratings_v90(player TEXT PRIMARY KEY, mmr INTEGER NOT NULL, games INTEGER NOT NULL, wins INTEGER NOT NULL)');
    T('CREATE TABLE IF NOT EXISTS arena_queue_v90(player TEXT PRIMARY KEY, mode TEXT NOT NULL, mmr INTEGER NOT NULL, since INTEGER NOT NULL)');
    T('CREATE TABLE IF NOT EXISTS names_v90(player TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL, pending TEXT)');
    T('CREATE TABLE IF NOT EXISTS arena_v90(id TEXT PRIMARY KEY, record TEXT NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL)');
  }
  mod(kind, text, author, context, ref) { return moderate({ db: this.db, env: this.env, fetchImpl: this.fetchImpl, kind, text, author, context, ref }); }
  /** Public name: a moderated display name (only if the player chose to show it), otherwise an anonymous "Explorer ####". Usernames are never shown. */
  display(pid) {
    const n = this.db.all("SELECT name FROM names_v90 WHERE player=? AND status='approved'", pid)[0]?.name;
    return sanitizePrivacy(this.privacy(pid)).hall_credit === 'name' && n ? n : `Explorer ${(seedOf('anon:' + this.secret.slice(0, 8) + pid) % 9000) + 1000}`;
  }
  async setDisplayName(pid, name) {
    const nm = S(name, 20).trim(); if (nm.length < 3 || !/^[A-Za-z0-9 _'-]+$/.test(nm)) throw new SocialError('bad_display_name');
    if (this.db.all("SELECT 1 FROM names_v90 WHERE lower(name)=lower(?) AND player<>? AND status='approved'", nm, pid).length) throw new SocialError('display_name_taken');
    const m = await this.mod('display_name', nm, pid, 'display_name', { apply: 'display_name', player: pid, value: nm });
    if (m.status === 'blocked') throw new SocialError('display_name_not_allowed');
    const cur = this.db.all('SELECT name, status FROM names_v90 WHERE player=?', pid)[0];
    if (m.status === 'allow') this.db.run("INSERT INTO names_v90(player,name,status,pending) VALUES(?,?,'approved',NULL) ON CONFLICT(player) DO UPDATE SET name=excluded.name, status='approved', pending=NULL", pid, m.text);
    else this.db.run("INSERT INTO names_v90(player,name,status,pending) VALUES(?,?,?,?) ON CONFLICT(player) DO UPDATE SET pending=excluded.pending", pid, cur?.name ?? '', cur?.status === 'approved' ? 'approved' : 'pending', nm);
    return { status: m.status === 'allow' ? 'approved' : 'held', name: this.display(pid) };
  }
  nameStatus(pid) { const r = this.db.all('SELECT name, status, pending FROM names_v90 WHERE player=?', pid)[0]; return r ? { name: r.status === 'approved' ? r.name : null, pending: r.pending } : { name: null, pending: null }; }
  // ---------------------------------------------------------------- privacy, friends, blocks
  privacy(pid) { const r = this.db.all('SELECT record FROM privacy_v90 WHERE player=?', pid)[0]; return sanitizePrivacy(r ? JSON.parse(r.record) : null); }
  setPrivacy(pid, patch) {
    const next = sanitizePrivacy({ ...this.privacy(pid), ...(patch && typeof patch === 'object' ? patch : {}) });
    this.db.run('INSERT INTO privacy_v90(player,record) VALUES(?,?) ON CONFLICT(player) DO UPDATE SET record=excluded.record', pid, JSON.stringify(next));
    if (!next.pvp) this.db.run('DELETE FROM arena_queue_v90 WHERE player=?', pid);
    return next;
  }
  friendCode(pid, rotate = false) {
    const r = this.db.all('SELECT code FROM friendcodes_v90 WHERE player=?', pid)[0];
    if (r && !rotate) return r.code;
    this.db.run('DELETE FROM friendcodes_v90 WHERE player=?', pid);
    let c; do c = code('F-', 7); while (this.db.all('SELECT 1 FROM friendcodes_v90 WHERE code=?', c).length);
    this.db.run('INSERT INTO friendcodes_v90(code,player) VALUES(?,?)', c, pid); return c;
  }
  blocked(a, b) { return this.db.all("SELECT 1 FROM blocks_v90 WHERE kind='block' AND ((player=? AND target=?) OR (player=? AND target=?))", a, b, b, a).length > 0; }
  muted(pid) { return this.db.all("SELECT target FROM blocks_v90 WHERE player=? AND kind='mute'", pid).map((r) => r.target); }
  blockList(pid) { return this.db.all("SELECT target FROM blocks_v90 WHERE player=? AND kind='block'", pid).map((r) => r.target); }
  isFriend(a, b) { const [x, y] = pair(a, b); return this.db.all("SELECT 1 FROM friends_v90 WHERE a=? AND b=? AND status='accepted'", x, y).length > 0; }
  friendRequest(from, { code: fc, to, via } = {}) {
    let target = to;
    if (fc) target = this.db.all('SELECT player FROM friendcodes_v90 WHERE code=?', S(fc, 12).toUpperCase())[0]?.player;
    else if (via !== 'party') throw new SocialError('friend_code_required'); // never from strangers: a code you were given, or someone in your party
    if (!target || target === from) throw new SocialError('friend_not_found');
    if (this.privacy(target).friend_requests === 'off' || this.blocked(from, target)) throw new SocialError('friend_not_found'); // same answer: no information leak
    const [a, b] = pair(from, target), cur = this.db.all('SELECT status, requester FROM friends_v90 WHERE a=? AND b=?', a, b)[0];
    if (cur?.status === 'accepted') return { status: 'already_friends' };
    if (cur && cur.requester !== from) { this.db.run("UPDATE friends_v90 SET status='accepted', since=? WHERE a=? AND b=?", now(), a, b); return { status: 'accepted' }; }
    this.db.run('INSERT INTO friends_v90(a,b,status,requester,since) VALUES(?,?,?,?,?) ON CONFLICT(a,b) DO NOTHING', a, b, 'pending', from, now());
    return { status: 'pending' };
  }
  friendRespond(pid, other, accept) {
    const [a, b] = pair(pid, other), cur = this.db.all('SELECT status, requester FROM friends_v90 WHERE a=? AND b=?', a, b)[0];
    if (!cur || cur.status !== 'pending' || cur.requester === pid) throw new SocialError('no_request');
    if (accept) this.db.run("UPDATE friends_v90 SET status='accepted', since=? WHERE a=? AND b=?", now(), a, b);
    else this.db.run('DELETE FROM friends_v90 WHERE a=? AND b=?', a, b);
    return { status: accept ? 'accepted' : 'declined' };
  }
  unfriend(pid, other) { const [a, b] = pair(pid, other); this.db.run('DELETE FROM friends_v90 WHERE a=? AND b=?', a, b); return { status: 'removed' }; }
  friends(pid) {
    const rows = this.db.all('SELECT a, b, status, requester FROM friends_v90 WHERE a=? OR b=?', pid, pid);
    const o = (r) => (r.a === pid ? r.b : r.a);
    return { friends: rows.filter((r) => r.status === 'accepted').map(o).sort(), incoming: rows.filter((r) => r.status === 'pending' && r.requester !== pid).map(o).sort(),
      outgoing: rows.filter((r) => r.status === 'pending' && r.requester === pid).map(o).sort() };
  }
  block(pid, target, kind = 'block', on = true) {
    if (!['block', 'mute'].includes(kind) || !target || target === pid) throw new SocialError('bad_target');
    if (on) { this.db.run('INSERT INTO blocks_v90(player,target,kind) VALUES(?,?,?) ON CONFLICT DO NOTHING', pid, S(target), kind); if (kind === 'block') this.unfriend(pid, target); }
    else this.db.run('DELETE FROM blocks_v90 WHERE player=? AND target=? AND kind=?', pid, S(target), kind);
    return { [kind]: on, target };
  }
  report(pid, { target, reason, context, text }) {
    const REASONS = ['bullying', 'inappropriate', 'personal_info', 'cheating', 'spam', 'worried', 'other'];
    const r = REASONS.includes(reason) ? reason : 'other';
    const id = logEntry(this.db, { kind: 'report', author: pid, context: S(context, 120), text: `[${r}] against ${S(target)}: ${S(text, 240)}`, verdict: 'report', layer: 'player', reasons: [r], status: 'open', ref: { apply: 'report', target: S(target), reason: r } });
    return { report: id, message: r === 'worried' ? 'Thank you for telling us. If you feel unsafe, talk to a trusted adult or Childline (0800 1111).' : 'Thanks, a moderator will look at this. You can also block them.' };
  }
  /** Relationship snapshot used by rooms (chat delivery, voice permission). */
  relations(pid) { return { privacy: this.privacy(pid), friends: this.friends(pid).friends, house: this.houseOf(pid)?.id ?? null, blocked: this.blockList(pid), muted: this.muted(pid), display: this.display(pid) }; }
  // ---------------------------------------------------------------- friend-only DMs
  async dm(from, to, text) {
    if (!this.isFriend(from, to) || this.blocked(from, to)) throw new SocialError('dm_not_allowed');
    if (this.privacy(from).dms !== 'friends' || this.privacy(to).dms !== 'friends') throw new SocialError('dm_off');
    const m = await this.mod('dm', text, from, `dm:${pair(from, to).join('|')}`);
    if (!m.ok) return { sent: false, status: m.status, reasons: m.reasons };
    const [a, b] = pair(from, to), t = now();
    this.db.run('INSERT INTO dms_v90(a,b,sender,text,ts) VALUES(?,?,?,?,?)', a, b, from, m.text, t);
    this.db.run('DELETE FROM dms_v90 WHERE (a=? AND b=? AND id NOT IN (SELECT id FROM dms_v90 WHERE a=? AND b=? ORDER BY id DESC LIMIT 50)) OR ts<?', a, b, a, b, t - 30 * 86400);
    return { sent: true, text: m.text };
  }
  dms(pid, other) { const [a, b] = pair(pid, other); if (!this.isFriend(pid, other)) return []; return this.db.all('SELECT sender, text, ts FROM dms_v90 WHERE a=? AND b=? ORDER BY id', a, b); }
  // ---------------------------------------------------------------- Houses
  house(id) { const r = this.db.all('SELECT record FROM houses_v90 WHERE id=?', id)[0]; return r ? JSON.parse(r.record) : null; }
  saveHouse(h) { this.db.run('INSERT INTO houses_v90(id,record) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record', h.id, JSON.stringify(h)); }
  houseOf(pid) { const r = this.db.all('SELECT house FROM house_members_v90 WHERE player=?', pid)[0]; return r ? this.house(r.house) : null; }
  role(pid, h) { return this.db.all('SELECT role FROM house_members_v90 WHERE player=? AND house=?', pid, h.id)[0]?.role ?? null; }
  houseView(h, pid) {
    if (!h) return null;
    const members = this.db.all('SELECT player, role FROM house_members_v90 WHERE house=? ORDER BY since', h.id).map((r) => ({ name: this.display(r.player), role: r.role, you: r.player === pid }));
    const mine = this.role(pid, h);
    return { id: h.id, name: h.name_status === 'approved' ? h.name : 'House (name in review)', name_status: h.name_status, pending_name: mine ? h.pending_name : undefined,
      charter: h.charter_status === 'approved' ? h.charter : '', charter_status: h.charter_status, banner: { ...h.banner, motto: h.banner.motto_status === 'approved' ? h.banner.motto : '' },
      base: { room: h.base_room }, stash: h.stash, members, role: mine, invites: mine === 'founder' || mine === 'officer' ? h.invites.filter((i) => i.expires > now()) : undefined };
  }
  sanitizeBanner(b) {
    const field = BANNER.fields.includes(b?.field) ? b.field : 'azure', charge = BANNER.charges.includes(b?.charge) ? b.charge : 'star';
    const tincture = BANNER.fields.includes(b?.tincture) && b.tincture !== field ? b.tincture : (field === 'or' ? 'azure' : 'or');
    return { field, charge, tincture };
  }
  async houseCreate(pid, { name, charter = '', banner = {} }) {
    if (this.houseOf(pid)) throw new SocialError('already_in_house');
    const nm = S(name, 32).trim(); if (nm.length < 3) throw new SocialError('house_name_too_short');
    if (this.db.all("SELECT record FROM houses_v90").some((r) => { const h = JSON.parse(r.record); return [h.name, h.pending_name].some((x) => x && x.toLowerCase() === nm.toLowerCase()); })) throw new SocialError('house_name_taken');
    const id = code('h', 7).toLowerCase(), b = this.sanitizeBanner(banner);
    const h = { id, name: '', pending_name: nm, name_status: 'pending', charter: '', charter_status: 'none', banner: { ...b, motto: '', motto_status: 'none' },
      founder: pid, base_room: `HB${id.slice(1).toUpperCase()}`, stash: {}, invites: [], created: now() };
    const m = await this.mod('house_name', nm, pid, `house:${id}`, { apply: 'house_name', house: id, value: nm });
    if (m.status === 'blocked') throw new SocialError('house_name_not_allowed');
    if (m.status === 'allow') { h.name = m.text; h.name_status = 'approved'; h.pending_name = null; }
    this.saveHouse(h); this.db.run('INSERT INTO house_members_v90(player,house,role,since) VALUES(?,?,?,?)', pid, id, 'founder', now());
    if (charter) await this.houseText(pid, 'charter', charter);
    if (banner?.motto) await this.houseText(pid, 'motto', banner.motto);
    return { house: this.houseView(this.house(id), pid), moderation: m.status };
  }
  async houseText(pid, which, text) {
    const h = this.houseOf(pid); if (!h) throw new SocialError('not_in_house');
    if (!['founder', 'officer'].includes(this.role(pid, h))) throw new SocialError('officers_only');
    const kind = which === 'charter' ? 'house_charter' : 'banner_motto';
    const m = await this.mod(kind, text, pid, `house:${h.id}`, { apply: kind, house: h.id, value: S(text, which === 'charter' ? 400 : 48) });
    const fresh = this.house(h.id);
    // a held change never hides the current approved text; it waits beside it until a moderator decides
    if (which === 'charter') { if (m.status === 'allow') Object.assign(fresh, { charter: m.text, charter_status: 'approved' }); else if (m.status === 'held' && fresh.charter_status !== 'approved') fresh.charter_status = 'pending'; }
    else { if (m.status === 'allow') Object.assign(fresh.banner, { motto: m.text, motto_status: 'approved' }); else if (m.status === 'held' && fresh.banner.motto_status !== 'approved') fresh.banner.motto_status = 'pending'; }
    this.saveHouse(fresh);
    return { status: m.status, house: this.houseView(fresh, pid) };
  }
  houseBanner(pid, banner) {
    const h = this.houseOf(pid); if (!h || !['founder', 'officer'].includes(this.role(pid, h))) throw new SocialError('officers_only');
    Object.assign(h.banner, this.sanitizeBanner(banner)); this.saveHouse(h); return { house: this.houseView(h, pid) };
  }
  houseInvite(pid) {
    const h = this.houseOf(pid); if (!h || !['founder', 'officer'].includes(this.role(pid, h))) throw new SocialError('officers_only');
    const c = code('H-', 6); h.invites = [...h.invites.filter((i) => i.expires > now()), { code: c, expires: now() + HOUSE_LIMITS.inviteDays * 86400 }].slice(-10);
    this.saveHouse(h); return { code: c, expires_days: HOUSE_LIMITS.inviteDays };
  }
  houseJoin(pid, inviteCode) {
    if (this.houseOf(pid)) throw new SocialError('already_in_house');
    const c = S(inviteCode, 10).toUpperCase();
    const h = this.db.all('SELECT record FROM houses_v90').map((r) => JSON.parse(r.record)).find((x) => x.invites.some((i) => i.code === c && i.expires > now()));
    if (!h) throw new SocialError('invite_not_found');
    if (this.db.all('SELECT COUNT(*) AS n FROM house_members_v90 WHERE house=?', h.id)[0].n >= HOUSE_LIMITS.members) throw new SocialError('house_full');
    this.db.run('INSERT INTO house_members_v90(player,house,role,since) VALUES(?,?,?,?)', pid, h.id, 'member', now());
    return { house: this.houseView(h, pid) };
  }
  houseLeave(pid) {
    const h = this.houseOf(pid); if (!h) throw new SocialError('not_in_house');
    this.db.run('DELETE FROM house_members_v90 WHERE player=?', pid);
    const left = this.db.all('SELECT player, role FROM house_members_v90 WHERE house=? ORDER BY since', h.id);
    if (!left.length) this.db.run('DELETE FROM houses_v90 WHERE id=?', h.id);
    else if (this.role(pid, h) === null && !left.some((r) => r.role === 'founder')) this.db.run("UPDATE house_members_v90 SET role='founder' WHERE player=?", left[0].player);
    return { left: true };
  }
  houseRole(pid, targetName, action) {
    const h = this.houseOf(pid); if (!h || this.role(pid, h) !== 'founder') throw new SocialError('founder_only');
    const t = this.db.all('SELECT player FROM house_members_v90 WHERE house=?', h.id).map((r) => r.player).find((p) => this.display(p) === targetName || p === targetName);
    if (!t || t === pid) throw new SocialError('member_not_found');
    if (action === 'kick') this.db.run('DELETE FROM house_members_v90 WHERE player=?', t);
    else this.db.run('UPDATE house_members_v90 SET role=? WHERE player=?', action === 'promote' ? 'officer' : 'member', t);
    return { house: this.houseView(this.house(h.id), pid) };
  }
  houseDeposit(pid, bag, item, n) {
    const h = this.houseOf(pid); if (!h) throw new SocialError('not_in_house');
    const k = S(item, 32), c = Math.trunc(Number(n)); if (!(c > 0 && c <= 50) || (bag[k] ?? 0) < c) throw new SocialError('not_enough');
    bag[k] -= c; if (!bag[k]) delete bag[k]; h.stash[k] = (h.stash[k] ?? 0) + c; this.saveHouse(h); return { stash: h.stash };
  }
  houseWithdraw(pid, bag, item, n) {
    const h = this.houseOf(pid); if (!h || !['founder', 'officer'].includes(this.role(pid, h))) throw new SocialError('officers_only');
    const k = S(item, 32), c = Math.trunc(Number(n)); if (!(c > 0 && c <= 50) || (h.stash[k] ?? 0) < c) throw new SocialError('not_enough');
    h.stash[k] -= c; if (!h.stash[k]) delete h.stash[k]; bag[k] = (bag[k] ?? 0) + c; this.saveHouse(h); return { stash: h.stash };
  }
  // ---------------------------------------------------------------- Hall of Discoveries
  async hallSubmit({ card, credits, by, source }) {
    const text = [card.title, card.definition, card.summary].filter(Boolean).join(' — ');
    const id = 'd' + (seedOf(`${source}\u0000${card.title}`) >>> 0).toString(36);
    if (this.db.all('SELECT 1 FROM hall_v90 WHERE id=?', id).length) return { id, status: 'duplicate' };
    const m = await this.mod('hall', text, by, `hall:${id}`, { apply: 'hall', entry: id });
    if (m.status === 'blocked') return { id, status: 'blocked', reasons: m.reasons };
    const rec = { id, card, credits: credits.map((p) => ({ player: p, name: this.display(p) })), source };
    this.db.run('INSERT INTO hall_v90(id,record,status,votes,created) VALUES(?,?,?,0,?)', id, JSON.stringify(rec), m.status === 'allow' ? 'published' : 'pending', now());
    return { id, status: m.status === 'allow' ? 'published' : 'held' };
  }
  hallVote(pid, id, on = true) {
    const r = this.db.all("SELECT record FROM hall_v90 WHERE id=? AND status='published'", id)[0]; if (!r) throw new SocialError('entry_not_found');
    if (JSON.parse(r.record).credits.some((c) => c.player === pid)) throw new SocialError('cannot_vote_own');
    if (on) this.db.run('INSERT INTO hall_votes_v90(entry,voter) VALUES(?,?) ON CONFLICT DO NOTHING', id, pid); else this.db.run('DELETE FROM hall_votes_v90 WHERE entry=? AND voter=?', id, pid);
    const n = this.db.all('SELECT COUNT(*) AS n FROM hall_votes_v90 WHERE entry=?', id)[0].n; this.db.run('UPDATE hall_v90 SET votes=? WHERE id=?', n, id);
    return { id, votes: n, voted: on };
  }
  hall(pid, sort = 'top', limit = 30) {
    const rows = this.db.all(`SELECT record, votes, created FROM hall_v90 WHERE status='published' ORDER BY ${sort === 'new' ? 'created DESC' : 'votes DESC, created DESC'} LIMIT ?`, Math.min(100, limit));
    const mine = new Set(this.db.all('SELECT entry FROM hall_votes_v90 WHERE voter=?', pid).map((r) => r.entry));
    return rows.map((r) => { const e = JSON.parse(r.record); return { id: e.id, card: e.card, credits: e.credits.map((c) => c.name), votes: r.votes, voted: mine.has(e.id), yours: e.credits.some((c) => c.player === pid), created: r.created }; });
  }
  applyApproved(entry) { // called by the admin review endpoint when a held item is approved/rejected
    const ref = entry.ref || {}, ok = entry.status === 'approved';
    if (ref.apply === 'display_name') { if (ok) this.db.run("INSERT INTO names_v90(player,name,status,pending) VALUES(?,?,'approved',NULL) ON CONFLICT(player) DO UPDATE SET name=excluded.name, status='approved', pending=NULL", ref.player, ref.value); else this.db.run('UPDATE names_v90 SET pending=NULL WHERE player=?', ref.player); return; }
    if (ref.apply === 'lb_flag') { if (['dismissed', 'approved'].includes(entry.status)) this.db.run('DELETE FROM lb_flags_v90 WHERE player=? AND category=?', ref.player, ref.category); return; }
    if (ref.apply === 'hall') this.db.run('UPDATE hall_v90 SET status=? WHERE id=?', ok ? 'published' : 'rejected', ref.entry);
    else if (['house_name', 'house_charter', 'banner_motto'].includes(ref.apply)) {
      const h = this.house(ref.house); if (!h) return;
      if (ref.apply === 'house_name') { if (ok) Object.assign(h, { name: ref.value, name_status: 'approved', pending_name: null }); else Object.assign(h, { name_status: h.name ? 'approved' : 'rejected', pending_name: null }); }
      if (ref.apply === 'house_charter') Object.assign(h, ok ? { charter: ref.value, charter_status: 'approved' } : { charter_status: h.charter ? 'approved' : 'rejected' });
      if (ref.apply === 'banner_motto') Object.assign(h.banner, ok ? { motto: ref.value, motto_status: 'approved' } : { motto_status: h.banner.motto ? 'approved' : 'rejected' });
      this.saveHouse(h);
    }
  }
  // ---------------------------------------------------------------- community events
  contribute(pid, unit, n = 1, ms = Date.now()) {
    const ev = eventFor(ms).active; if (!ev || ev.unit !== unit || n <= 0) return null;
    const row = this.db.all('SELECT progress FROM events_v90 WHERE id=?', ev.id)[0];
    this.db.run('INSERT INTO events_v90(id,progress,contributors) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET progress=progress+?', ev.id, n, '[]', n);
    this.db.run('INSERT INTO event_players_v90(event,player,n) VALUES(?,?,?) ON CONFLICT(event,player) DO UPDATE SET n=n+?', ev.id, pid, n, n);
    return { event: ev.id, progress: (row?.progress ?? 0) + n, goal: ev.goal };
  }
  events(pid, ms = Date.now()) {
    const cal = eventFor(ms), ev = cal.active;
    if (!ev) return { ...cal, weekly: weeklyChallenge(ms) };
    const progress = this.db.all('SELECT progress FROM events_v90 WHERE id=?', ev.id)[0]?.progress ?? 0;
    const me = this.db.all('SELECT n, claimed FROM event_players_v90 WHERE event=? AND player=?', ev.id, pid)[0];
    const players = this.db.all('SELECT COUNT(*) AS n FROM event_players_v90 WHERE event=?', ev.id)[0].n;
    return { ...cal, active: { ...ev, progress, players, done: progress >= ev.goal, you: me?.n ?? 0, claimed: !!me?.claimed, can_claim: progress >= ev.goal && (me?.n ?? 0) > 0 && !me?.claimed }, weekly: weeklyChallenge(ms) };
  }
  claimEvent(pid, ms = Date.now()) {
    const v = this.events(pid, ms).active; if (!v?.can_claim) throw new SocialError('nothing_to_claim');
    this.db.run('UPDATE event_players_v90 SET claimed=1 WHERE event=? AND player=?', v.id, pid);
    return { reward: v.reward, reward_name: v.reward_name };
  }
  eventTitles(pid) { return this.db.all('SELECT event FROM event_players_v90 WHERE player=? AND claimed=1', pid).map((r) => EVENTS[r.event.split(':')[0]]?.reward).filter(Boolean); }
  // ---------------------------------------------------------------- weekly seeded challenge
  weeklyStart(pid, prof, weapon, ms = Date.now()) {
    const W = weeklyChallenge(ms), day = new Date(ms).toISOString().slice(0, 10);
    const row = this.db.all('SELECT * FROM weekly_v90 WHERE week=? AND player=?', W.week, pid)[0];
    const dayAttempts = row && row.day === day ? row.day_attempts : 0;
    if (dayAttempts >= WEEKLY.attemptsPerDay) throw new SocialError('weekly_attempts_used');
    const cfg = CMB.fightConfig(trialProfile(prof), h3(W.seed, (row?.attempts ?? 0) + 1, 9), weapon, 100, W.species, W.level, 'weekly');
    this.db.run(`INSERT INTO weekly_v90(week,player,best,outcome,attempts,day,day_attempts,pending) VALUES(?,?,0,'',1,?,1,?)
      ON CONFLICT(week,player) DO UPDATE SET attempts=attempts+1, day=excluded.day, day_attempts=?, pending=excluded.pending`, W.week, pid, day, JSON.stringify(cfg), dayAttempts + 1);
    return { challenge: W, fight: cfg, attempts_left: WEEKLY.attemptsPerDay - dayAttempts - 1 };
  }
  weeklyFinish(pid, inputs, ms = Date.now()) {
    const W = weeklyChallenge(ms), row = this.db.all('SELECT * FROM weekly_v90 WHERE week=? AND player=?', W.week, pid)[0];
    if (!row?.pending) throw new SocialError('no_fight');
    const res = CMB.runFight(JSON.parse(row.pending), inputs), score = trialScore(res);
    this.db.run('UPDATE weekly_v90 SET pending=NULL, best=MAX(best,?), outcome=CASE WHEN ?>best THEN ? ELSE outcome END WHERE week=? AND player=?', score, score, res.outcome, W.week, pid);
    if (res.outcome === 'win') this.contribute(pid, 'duel wins', 1, ms);
    return { score, outcome: res.outcome, ticks: res.ticks, best: Math.max(row.best, score), board: this.leaderboard(pid, ms) };
  }
  leaderboard(pid, ms = Date.now(), limit = 20) {
    const W = weeklyChallenge(ms);
    const rows = this.db.all('SELECT player, best, outcome FROM weekly_v90 WHERE week=? AND best>0 ORDER BY best DESC, player LIMIT ?', W.week, limit);
    const mine = this.db.all('SELECT best FROM weekly_v90 WHERE week=? AND player=?', W.week, pid)[0];
    const rank = mine && mine.best > 0 ? this.db.all('SELECT COUNT(*) AS n FROM weekly_v90 WHERE week=? AND best>?', W.week, mine.best)[0].n + 1 : null;
    return { week: W.week, top: rows.map((r, i) => ({ rank: i + 1, name: this.display(r.player), score: r.best, outcome: r.outcome, you: r.player === pid })), you: rank ? { rank, score: mine.best } : null };
  }
  // ---------------------------------------------------------------- arenas & team trials (opt-in PvP)
  rating(pid) { return this.db.all('SELECT mmr, games, wins FROM ratings_v90 WHERE player=?', pid)[0] ?? { mmr: ARENA.start, games: 0, wins: 0 }; }
  arenaQueue(pid, mode, nowS = now()) {
    if (!this.privacy(pid).pvp) throw new SocialError('pvp_opt_in_required');
    if (!['duel', 'team'].includes(mode)) throw new SocialError('bad_mode');
    if (this.arenaActive(pid)) throw new SocialError('already_in_match');
    const r = this.rating(pid);
    this.db.run('INSERT INTO arena_queue_v90(player,mode,mmr,since) VALUES(?,?,?,?) ON CONFLICT(player) DO UPDATE SET mode=excluded.mode, mmr=excluded.mmr', pid, mode, r.mmr, nowS);
    return this.arenaTick(pid, nowS);
  }
  arenaLeave(pid) { this.db.run('DELETE FROM arena_queue_v90 WHERE player=?', pid); return { queued: false }; }
  arenaActive(pid) { return this.db.all("SELECT record FROM arena_v90 WHERE status='open'").map((r) => JSON.parse(r.record)).find((m) => m.players.includes(pid)) ?? null; }
  arenaTick(pid, nowS = now()) {
    const q = this.db.all('SELECT player AS pid, mode, mmr, since FROM arena_queue_v90');
    const { matches } = matchmake(q, nowS);
    for (const m of matches) {
      const id = code('m', 8).toLowerCase(), seed = seedOf(id) >>> 0;
      const lv = Math.max(1, Math.min(8, Math.round(m.players.reduce((a, p) => a + this.rating(p).mmr, 0) / m.players.length / 250)));
      const rec = { id, mode: m.mode, teams: m.teams, players: m.players, seed, species: WEEKLY.species[seed % 3], level: lv, runs: {}, created: nowS };
      this.db.run("INSERT INTO arena_v90(id,record,status,created) VALUES(?,?,'open',?)", id, JSON.stringify(rec), nowS);
      for (const p of m.players) this.db.run('DELETE FROM arena_queue_v90 WHERE player=?', p);
    }
    this.arenaExpire(nowS);
    const mine = this.arenaActive(pid), queued = this.db.all('SELECT mode, since FROM arena_queue_v90 WHERE player=?', pid)[0];
    return { queued: !!queued, mode: queued?.mode, waiting: queued ? nowS - queued.since : 0, match: mine ? this.matchView(mine, pid) : null, rating: this.rating(pid) };
  }
  matchView(m, pid) {
    const side = m.teams[0].includes(pid) ? 0 : 1;
    return { id: m.id, mode: m.mode, foe: `${CMB.CB.enemies[m.species].name} · level ${m.level}`, you_submitted: !!m.runs[pid]?.score || m.runs[pid]?.score === 0,
      allies: m.teams[side].filter((p) => p !== pid).map((p) => this.display(p)), rivals: m.teams[1 - side].map((p) => this.display(p)),
      result: m.result ? { ...m.result, you_won: m.result.winner === side, draw: m.result.winner === 'draw', your_score: m.runs[pid]?.score ?? 0 } : null };
  }
  arenaStart(pid, prof, weapon) {
    const m = this.arenaActive(pid); if (!m) throw new SocialError('no_match');
    if (m.runs[pid]?.score !== undefined) throw new SocialError('already_submitted');
    const cfg = CMB.fightConfig(trialProfile(prof), m.seed, weapon, 100, m.species, m.level, 'arena'); // identical foe and seed for every contestant
    m.runs[pid] = { cfg }; this.db.run('UPDATE arena_v90 SET record=? WHERE id=?', JSON.stringify(m), m.id);
    return { match: this.matchView(m, pid), fight: cfg };
  }
  arenaFinish(pid, inputs, nowS = now()) {
    const m = this.arenaActive(pid); if (!m || !m.runs[pid]?.cfg) throw new SocialError('no_fight');
    if (m.runs[pid].score !== undefined) throw new SocialError('already_submitted');
    const res = CMB.runFight(m.runs[pid].cfg, inputs); m.runs[pid] = { score: trialScore(res), outcome: res.outcome };
    this.db.run('UPDATE arena_v90 SET record=? WHERE id=?', JSON.stringify(m), m.id);
    if (m.players.every((p) => m.runs[p]?.score !== undefined)) this.settle(m, nowS);
    return { score: m.runs[pid].score, outcome: res.outcome, match: this.matchView(this.db.all('SELECT record FROM arena_v90 WHERE id=?', m.id).map((r) => JSON.parse(r.record))[0], pid) };
  }
  settle(m, nowS) {
    const total = (t) => t.reduce((a, p) => a + (m.runs[p]?.score ?? 0), 0), avg = (t) => t.reduce((a, p) => a + this.rating(p).mmr, 0) / t.length;
    const [sa, sb] = [total(m.teams[0]), total(m.teams[1])], ra = avg(m.teams[0]), rb = avg(m.teams[1]);
    const res = sa === sb ? 0.5 : sa > sb ? 1 : 0;
    m.teams.forEach((team, side) => team.forEach((p) => {
      const r = this.rating(p), s = side === 0 ? res : 1 - res, nm = r.mmr + (elo(side === 0 ? ra : rb, side === 0 ? rb : ra, s, r.games) - Math.round(side === 0 ? ra : rb));
      this.db.run('INSERT INTO ratings_v90(player,mmr,games,wins) VALUES(?,?,?,?) ON CONFLICT(player) DO UPDATE SET mmr=excluded.mmr, games=excluded.games, wins=excluded.wins', p, nm, r.games + 1, r.wins + (s === 1 ? 1 : 0));
    }));
    m.result = { scores: [sa, sb], winner: res === 0.5 ? 'draw' : res === 1 ? 0 : 1, settled: nowS };
    this.db.run("UPDATE arena_v90 SET record=?, status='done' WHERE id=?", JSON.stringify(m), m.id);
  }
  arenaExpire(nowS) {
    for (const r of this.db.all("SELECT record FROM arena_v90 WHERE status='open' AND created<?", nowS - ARENA.timeout)) {
      const m = JSON.parse(r.record); for (const p of m.players) if (m.runs[p]?.score === undefined) m.runs[p] = { score: 0, outcome: 'forfeit' };
      this.settle(m, nowS);
    }
  }
  arenaHistory(pid) { return this.db.all("SELECT record FROM arena_v90 WHERE status='done' ORDER BY created DESC LIMIT 40").map((r) => JSON.parse(r.record)).filter((m) => m.players.includes(pid)).slice(0, 8).map((m) => this.matchView(m, pid)); }
}
