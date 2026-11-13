// v9.0 Omniversal Leaderboard (main Durable Object, SQLite storage, £0). Server-authoritative: every score is computed
// from server state (Genesis record, verified duels, Hall votes, arena ratings, weekly trials, event contributions);
// the client never submits a number. Anti-cheat: per-category plausibility (max gain per hour, monotonic checks,
// speedrun minimums), refresh rate limits, and flags that hide a player from public boards until a moderator reviews.
// Seasons are 8 ISO weeks; closing a season archives the boards, writes the permanent Hall of Legends and grants
// in-game-only rewards (grand titles, auras, banners, name colours). No real money, nothing purchasable, no pay-to-win.
import { isoWeek } from './social.js';
import { logEntry } from './moderation.js';

export const CATEGORIES = {
  lux: { name: 'Lux', unit: '✨', mode: 'gain', maxPerHour: 400, title: 'title_luminary', title_name: 'Luminary of the Strata' },
  strata: { name: 'Strata depth', unit: 'strata', mode: 'gain', maxPerHour: 3, title: 'title_strata_diver', title_name: 'Diver of the Deep Strata' },
  codex: { name: 'Codex', unit: 'entries', mode: 'gain', maxPerHour: 25, title: 'title_keeper_144', title_name: 'Keeper of the 144' },
  hall_votes: { name: 'Hall of Discoveries votes', unit: 'votes', mode: 'gain', maxPerHour: 300, title: 'title_voice_hall', title_name: 'Voice of the Hall' },
  rating: { name: 'Arena rating', unit: 'rating', mode: 'level', maxPerHour: 400, title: 'title_arena_paragon', title_name: 'Paragon of the Arena' },
  house: { name: 'House standings', unit: 'Lux', mode: 'derived', title: 'banner_sovereign', title_name: 'Sovereign House banner' },
  weekly: { name: 'Weekly challenge', unit: 'points', mode: 'best', maxPerHour: 2000000, title: 'title_trial_sovereign', title_name: 'Sovereign of Trials' },
  event: { name: 'Community events', unit: 'contributions', mode: 'gain', maxPerHour: 120, title: 'title_eclipse_steward', title_name: 'Steward of the Eclipse' },
  speedrun: { name: 'Realignment speedrun', unit: 'minutes', mode: 'fastest', minSeconds: 1800, title: 'title_prime_realigner', title_name: 'Prime Realigner' },
};
export const SCOPES = ['all', 'season', 'weekly'];
export const FILTERS = ['global', 'friends', 'house'];
export const LB = Object.freeze({ seasonWeeks: 8, refreshEvery: 10, legends: 3, colours: [[1, 'gold'], [3, 'silver'], [10, 'bronze']] });

export function seasonOf(ms = Date.now()) { const w = isoWeek(ms); const n = Math.floor((w.n - 1) / LB.seasonWeeks) + 1; return { id: `${w.year}S${n}`, week: w.id, n, year: w.year }; }
export const glickoRd = (games) => Math.max(50, Math.round(350 / Math.sqrt(1 + games))); // Glicko-style confidence shown beside the Elo rating
export function colourFor(rank) { for (const [n, c] of LB.colours) if (rank <= n) return c; return null; }

export class Leaderboard {
  constructor(db, social) {
    this.db = db; this.social = social; const T = (q) => db.run(q);
    T('CREATE TABLE IF NOT EXISTS lb_raw_v90(category TEXT NOT NULL, player TEXT NOT NULL, value INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY(category,player))');
    T('CREATE TABLE IF NOT EXISTS lb_base_v90(period TEXT NOT NULL, category TEXT NOT NULL, player TEXT NOT NULL, base INTEGER NOT NULL, PRIMARY KEY(period,category,player))');
    T('CREATE TABLE IF NOT EXISTS lb_scores_v90(period TEXT NOT NULL, category TEXT NOT NULL, player TEXT NOT NULL, score INTEGER NOT NULL, extra INTEGER NOT NULL DEFAULT 0, ts INTEGER NOT NULL, PRIMARY KEY(period,category,player))');
    T('CREATE TABLE IF NOT EXISTS lb_flags_v90(player TEXT NOT NULL, category TEXT NOT NULL, reason TEXT NOT NULL, ts INTEGER NOT NULL, log_id INTEGER NOT NULL, PRIMARY KEY(player,category))');
    T('CREATE TABLE IF NOT EXISTS lb_seasons_v90(id TEXT PRIMARY KEY, status TEXT NOT NULL, archive TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0)');
    T('CREATE TABLE IF NOT EXISTS lb_legends_v90(season TEXT NOT NULL, category TEXT NOT NULL, rank INTEGER NOT NULL, player TEXT NOT NULL, name TEXT NOT NULL, score INTEGER NOT NULL, title TEXT NOT NULL, PRIMARY KEY(season,category,rank))');
    T('CREATE TABLE IF NOT EXISTS lb_rewards_v90(player TEXT NOT NULL, reward TEXT NOT NULL, season TEXT NOT NULL, PRIMARY KEY(player,reward,season))');
    T('CREATE TABLE IF NOT EXISTS lb_runs_v90(player TEXT NOT NULL, cycle INTEGER NOT NULL, started INTEGER NOT NULL, PRIMARY KEY(player,cycle))');
    T('CREATE TABLE IF NOT EXISTS lb_touch_v90(player TEXT PRIMARY KEY, ts INTEGER NOT NULL)');
  }
  flagged(pid, cat = null) { return cat ? this.db.all('SELECT 1 FROM lb_flags_v90 WHERE player=? AND category=?', pid, cat).length > 0 : this.db.all('SELECT category FROM lb_flags_v90 WHERE player=?', pid).map((r) => r.category); }
  flag(pid, cat, reason, nowS) {
    if (this.flagged(pid, cat)) return;
    const id = logEntry(this.db, { kind: 'report', author: 'anticheat', context: `leaderboard:${cat}`, text: `Implausible ${cat} for ${pid}: ${reason}`, verdict: 'flag', layer: 'anticheat', reasons: [reason], status: 'open', ref: { apply: 'lb_flag', player: pid, category: cat }, nowMs: nowS * 1000 });
    this.db.run('INSERT INTO lb_flags_v90(player,category,reason,ts,log_id) VALUES(?,?,?,?,?)', pid, cat, reason, nowS, id);
  }
  clearFlag(pid, cat) { this.db.run('DELETE FROM lb_flags_v90 WHERE player=? AND category=?', pid, cat); }
  /** Server-side observation of a raw cumulative value. Returns false (and flags) when implausible. */
  observe(pid, cat, value, nowMs = Date.now()) {
    const C = CATEGORIES[cat]; if (!C || C.mode === 'derived' || !Number.isFinite(value)) return false;
    const nowS = Math.floor(nowMs / 1000), S = seasonOf(nowMs);
    this.rollSeason(nowMs);
    const prev = this.db.all('SELECT value, ts FROM lb_raw_v90 WHERE category=? AND player=?', cat, pid)[0];
    const v = C.mode === 'gain' ? Math.max(Math.trunc(value), prev?.value ?? 0) : Math.trunc(value); // cumulative measures never go backwards
    if (prev && C.maxPerHour && C.mode !== 'level') {
      const hours = Math.max(1 / 60, (nowS - prev.ts) / 3600), gain = v - prev.value;
      if (gain > C.maxPerHour * Math.max(1, hours)) { this.flag(pid, cat, `gain ${gain} in ${Math.round(hours * 60)} min`, nowS); return false; }
    }
    if (C.mode === 'level' && prev && Math.abs(v - prev.value) > C.maxPerHour) { this.flag(pid, cat, `rating jump ${v - prev.value}`, nowS); return false; }
    if (v < 0 || v > 100000000) { this.flag(pid, cat, 'out_of_range', nowS); return false; }
    this.db.run('INSERT INTO lb_raw_v90(category,player,value,ts) VALUES(?,?,?,?) ON CONFLICT(category,player) DO UPDATE SET value=excluded.value, ts=excluded.ts', cat, pid, v, nowS);
    for (const period of ['all', S.id, S.week]) {
      let score = v;
      if (C.mode === 'gain' && period !== 'all') {
        const b = this.db.all('SELECT base FROM lb_base_v90 WHERE period=? AND category=? AND player=?', period, cat, pid)[0];
        const base = b ? b.base : (prev ? Math.min(prev.value, v) : v); // gain since first seen in this period
        if (!b) this.db.run('INSERT INTO lb_base_v90(period,category,player,base) VALUES(?,?,?,?)', period, cat, pid, base);
        score = Math.max(0, v - base);
      }
      const cur = this.db.all('SELECT score FROM lb_scores_v90 WHERE period=? AND category=? AND player=?', period, cat, pid)[0];
      if (C.mode === 'best' && cur && cur.score >= score) continue;
      const extra = cat === 'rating' ? glickoRd(this.social.rating(pid).games) : 0;
      this.db.run('INSERT INTO lb_scores_v90(period,category,player,score,extra,ts) VALUES(?,?,?,?,?,?) ON CONFLICT(period,category,player) DO UPDATE SET score=excluded.score, extra=excluded.extra, ts=excluded.ts', period, cat, pid, score, extra, nowS);
    }
    return true;
  }
  startRun(pid, cycle, nowMs = Date.now()) { this.db.run('INSERT INTO lb_runs_v90(player,cycle,started) VALUES(?,?,?) ON CONFLICT DO NOTHING', pid, cycle, Math.floor(nowMs / 1000)); }
  /** Realignment completed (ending chosen): fastest time from the cycle's first server-seen moment. */
  finishRun(pid, cycle, nowMs = Date.now()) {
    const r = this.db.all('SELECT started FROM lb_runs_v90 WHERE player=? AND cycle=?', pid, cycle)[0]; if (!r) return null;
    const secs = Math.floor(nowMs / 1000) - r.started, S = seasonOf(nowMs);
    if (secs < CATEGORIES.speedrun.minSeconds) { this.flag(pid, 'speedrun', `realignment in ${secs}s`, Math.floor(nowMs / 1000)); return { seconds: secs, flagged: true }; }
    for (const period of ['all', S.id, S.week]) {
      const cur = this.db.all("SELECT score FROM lb_scores_v90 WHERE period=? AND category='speedrun' AND player=?", period, pid)[0];
      if (!cur || secs < cur.score) this.db.run("INSERT INTO lb_scores_v90(period,category,player,score,extra,ts) VALUES(?,'speedrun',?,?,0,?) ON CONFLICT(period,category,player) DO UPDATE SET score=excluded.score, ts=excluded.ts", period, pid, secs, Math.floor(nowMs / 1000));
    }
    return { seconds: secs };
  }
  canRefresh(pid, nowMs = Date.now()) {
    const nowS = Math.floor(nowMs / 1000), r = this.db.all('SELECT ts FROM lb_touch_v90 WHERE player=?', pid)[0];
    if (r && nowS - r.ts < LB.refreshEvery) return false;
    this.db.run('INSERT INTO lb_touch_v90(player,ts) VALUES(?,?) ON CONFLICT(player) DO UPDATE SET ts=excluded.ts', pid, nowS); return true;
  }
  periodOf(scope, nowMs) { const S = seasonOf(nowMs); return scope === 'season' ? S.id : scope === 'weekly' ? S.week : scope && /^\d{4}S\d+$/.test(scope) ? scope : 'all'; }
  scopeSet(pid, filter) {
    if (filter === 'friends') return new Set([pid, ...this.social.friends(pid).friends]);
    if (filter === 'house') { const h = this.social.houseOf(pid); if (!h) return new Set([pid]); return new Set(this.db.all('SELECT player FROM house_members_v90 WHERE house=?', h.id).map((r) => r.player)); }
    return null;
  }
  board({ pid, category = 'lux', scope = 'all', filter = 'global', limit = 50, nowMs = Date.now() }) {
    const C = CATEGORIES[category]; if (!C) throw new Error('unknown_category');
    const period = this.periodOf(scope, nowMs), only = this.scopeSet(pid, filter);
    let rows;
    if (category === 'house') {
      const lux = this.db.all("SELECT player, score FROM lb_scores_v90 WHERE period=? AND category='lux'", period === 'all' ? 'all' : period);
      const flagged = new Set(this.db.all("SELECT player FROM lb_flags_v90 WHERE category='lux'").map((r) => r.player));
      const agg = new Map();
      for (const r of lux) { if (flagged.has(r.player)) continue; const h = this.social.houseOf(r.player); if (!h || h.name_status !== 'approved') continue; const a = agg.get(h.id) || { house: h, score: 0, members: 0 }; a.score += r.score; a.members += 1; agg.set(h.id, a); }
      const mine = this.social.houseOf(pid)?.id;
      rows = [...agg.values()].sort((a, b) => b.score - a.score || (a.house.id < b.house.id ? -1 : 1)).map((a, i) => ({ rank: i + 1, name: a.house.name, banner: a.house.banner, score: a.score, members: a.members, you: a.house.id === mine }));
      return { category, name: C.name, scope, period, filter, season: seasonOf(nowMs).id, rows: rows.slice(0, limit), you: rows.find((r) => r.you) || null };
    }
    const asc = C.mode === 'fastest';
    const all = this.db.all(`SELECT player, score, extra FROM lb_scores_v90 WHERE period=? AND category=? AND player NOT IN (SELECT player FROM lb_flags_v90 WHERE category=?) ORDER BY score ${asc ? 'ASC' : 'DESC'}, ts ASC, player ASC`, period, category, category)
      .filter((r) => (C.mode === 'fastest' || r.score > 0) && (!only || only.has(r.player)));
    rows = all.map((r, i) => ({ rank: i + 1, name: this.social.display(r.player), score: r.score, rating: category === 'rating' ? { elo: r.score, rd: r.extra } : undefined, colour: colourFor(i + 1), you: r.player === pid,
      title: this.bestTitle(r.player) }));
    const youRow = rows.find((r) => r.you) || null;
    return { category, name: C.name, unit: C.unit, scope, period, filter, season: seasonOf(nowMs).id, rows: rows.slice(0, limit), you: youRow, flagged: this.flagged(pid, category) || undefined };
  }
  bestTitle(pid) { const r = this.db.all("SELECT reward FROM lb_rewards_v90 WHERE player=? AND reward LIKE 'title_%' ORDER BY season DESC LIMIT 1", pid)[0]; return r ? Object.values(CATEGORIES).find((c) => c.title === r.reward)?.title_name ?? null : null; }
  /** Close every season older than the current one (idempotent): archive, Hall of Legends, rewards. */
  rollSeason(nowMs = Date.now()) {
    const cur = seasonOf(nowMs).id;
    const open = this.db.all("SELECT DISTINCT period FROM lb_scores_v90 WHERE period GLOB '[0-9][0-9][0-9][0-9]S*'").map((r) => r.period).filter((p) => p !== cur);
    for (const s of open) if (!this.db.all("SELECT 1 FROM lb_seasons_v90 WHERE id=? AND status='closed'", s).length) this.closeSeason(s, nowMs);
    this.db.run("INSERT INTO lb_seasons_v90(id,status,archive) VALUES(?,'open','{}') ON CONFLICT(id) DO NOTHING", cur);
  }
  closeSeason(id, nowMs = Date.now()) {
    const archive = {};
    for (const [cat, C] of Object.entries(CATEGORIES)) {
      const b = this.board({ pid: '', category: cat, scope: id, filter: 'global', limit: 10, nowMs });
      const raw = cat === 'house' ? [] : this.db.all(`SELECT player, score FROM lb_scores_v90 WHERE period=? AND category=? AND player NOT IN (SELECT player FROM lb_flags_v90 WHERE category=?) ORDER BY score ${C.mode === 'fastest' ? 'ASC' : 'DESC'}, ts ASC, player ASC LIMIT 10`, id, cat, cat).filter((r) => C.mode === 'fastest' || r.score > 0);
      archive[cat] = b.rows.map((r) => ({ rank: r.rank, name: r.name, score: r.score }));
      raw.forEach((r, i) => {
        const rank = i + 1, give = (rw) => this.db.run('INSERT INTO lb_rewards_v90(player,reward,season) VALUES(?,?,?) ON CONFLICT DO NOTHING', r.player, rw, id);
        if (rank === 1) give(C.title);
        give(`aura_season_${id}`); const col = colourFor(rank); if (col) give(`name_${col}`);
        if (rank <= 3) give(`banner_laurel_${id}`);
        if (rank <= LB.legends) this.db.run('INSERT INTO lb_legends_v90(season,category,rank,player,name,score,title) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING', id, cat, rank, r.player, this.social.display(r.player), r.score, rank === 1 ? C.title_name : '');
      });
      if (cat === 'house' && b.rows[0]) {
        const h = this.db.all('SELECT record FROM houses_v90').map((x) => JSON.parse(x.record)).find((x) => x.name === b.rows[0].name);
        if (h) { h.honours = [...new Set([...(h.honours || []), `Sovereign House · ${id}`])]; this.social.saveHouse(h); this.db.run('INSERT INTO lb_legends_v90(season,category,rank,player,name,score,title) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING', id, 'house', 1, h.id, h.name, b.rows[0].score, C.title_name); }
      }
    }
    this.db.run("INSERT INTO lb_seasons_v90(id,status,archive,closed) VALUES(?,'closed',?,?) ON CONFLICT(id) DO UPDATE SET status='closed', archive=excluded.archive, closed=excluded.closed", id, JSON.stringify(archive), Math.floor(nowMs / 1000));
    return archive;
  }
  seasons() { return this.db.all('SELECT id, status, archive, closed FROM lb_seasons_v90 ORDER BY id DESC').map((r) => ({ id: r.id, status: r.status, closed: r.closed || null, archive: JSON.parse(r.archive) })); }
  legends() { return this.db.all('SELECT season, category, rank, name, score, title FROM lb_legends_v90 ORDER BY season DESC, category, rank').map((r) => ({ ...r, category_name: CATEGORIES[r.category]?.name ?? r.category })); }
  rewards(pid) { return this.db.all('SELECT reward, season FROM lb_rewards_v90 WHERE player=? ORDER BY season DESC', pid); }
}
