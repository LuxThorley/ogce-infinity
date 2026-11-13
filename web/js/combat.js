// Strata: Lux Genesis v9.0 duel engine: exact port of ogce4/v90/combat.py (parity-tested).
// Shared by the browser (real-time play) and the Worker (replay verification). Integer-only, 20 Hz ticks.
// Teen-safe: hits are sparks and light, never injuries.
import CB from './combatdata.js';
export { CB };
export const ACTIONS = ['light', 'heavy', 'dodge', 'block_on', 'block_off', 'special1', 'special2', 'flee'];
export const ADAPT_KEYS = ['light', 'heavy', 'block', 'dodge', 'parry'];
export class CombatError extends Error { constructor(code) { super(code); this.code = code; } }

function mix32(a) { a >>>= 0; a ^= a >>> 16; a = Math.imul(a, 0x7feb352d) >>> 0; a ^= a >>> 15; a = Math.imul(a, 0x846ca68b) >>> 0; a ^= a >>> 16; return a >>> 0; }
export function h3(seed, x, y) { return mix32(((seed >>> 0) ^ mix32((Math.imul(x, 73856093) >>> 0) ^ mix32((Math.imul(y, 19349663) + 83492791) >>> 0))) >>> 0); }
const fd = (a, b) => Math.floor(a / b);
const cap = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clone = (o) => JSON.parse(JSON.stringify(o));
const num = (v) => (typeof v === 'number' ? v : 0);

// ---------------------------------------------------------------- progression
export function levelOf(xp) { let lv = 1; CB.skill.xp.forEach((need, i) => { if (xp >= need) lv = i + 1; }); return Math.min(lv, CB.skill.max_level); }
export function parryWindow(level) { return CB.parry.window + CB.parry.levels.filter((l) => level >= l).length; }
export function newProfile() { return { xp: 0, mastery: {}, specials: {}, loadout: {}, invented: [], adapt: {}, fights: 0, wins: 0, best_combo: 0, parries: 0, perfect: 0, counter: 0, fight: null, history: [] }; }
const kindOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'list' : typeof v === 'object' ? 'dict' : Number.isInteger(v) ? 'int' : typeof v);
export function normProfile(p) {
  const base = newProfile();
  if (p && typeof p === 'object' && !Array.isArray(p)) for (const [k, v] of Object.entries(p)) {
    if (k in base && (kindOf(v) === kindOf(base[k]) || (k === 'fight' && (v === null || kindOf(v) === 'dict')))) base[k] = v;
  }
  return base;
}
export function specialDef(prof, sid) {
  let d = Object.prototype.hasOwnProperty.call(CB.specials, sid) ? CB.specials[sid] : null;
  if (!d) d = prof.invented.find((m) => m.id === sid) || null;
  if (!d) return null;
  const rank = cap(Math.trunc(num(prof.specials[sid] ?? 1)), 1, CB.ranks.max);
  const out = { ...clone(d), id: sid, rank };
  out.mult = fd(d.mult * (100 + CB.ranks.mult_per_rank * (rank - 1)), 100);
  out.focus = Math.max(10, d.focus - CB.ranks.focus_per_rank * (rank - 1));
  return out;
}
export function learnable(prof) { const lv = levelOf(prof.xp); return Object.keys(CB.specials).sort().filter((s) => CB.specials[s].level <= lv && !(s in prof.specials)); }
export function learn(prof, sid) {
  const d = Object.prototype.hasOwnProperty.call(CB.specials, sid) ? CB.specials[sid] : null;
  if (!d) throw new CombatError('unknown_special');
  if (sid in prof.specials) throw new CombatError('already_known');
  if (levelOf(prof.xp) < d.level) throw new CombatError('level_too_low');
  prof.specials[sid] = 1;
  if (d.weapon !== 'any') { const lo = (prof.loadout[d.weapon] ||= []); if (lo.length < CB.loadout) lo.push(sid); } // spells: equip on any weapon
  return { learned: sid, name: d.name, rank: 1 };
}
export function upgrade(prof, explorer, sid) {
  if (!(sid in prof.specials)) throw new CombatError('not_known');
  const rank = Math.trunc(num(prof.specials[sid]));
  if (rank >= CB.ranks.max) throw new CombatError('max_rank');
  const cost = CB.ranks.cost[String(rank + 1)], bag = explorer.bag;
  for (const item of Object.keys(cost).sort()) if (num(bag[item]) < cost[item]) throw new CombatError('missing_' + item);
  for (const item of Object.keys(cost).sort()) { bag[item] = num(bag[item]) - cost[item]; if (bag[item] <= 0) delete bag[item]; }
  prof.specials[sid] = rank + 1;
  return { upgraded: sid, rank: rank + 1, cost };
}
export function equip(prof, weapon, ids) {
  if (!Object.prototype.hasOwnProperty.call(CB.weapons, weapon)) throw new CombatError('unknown_weapon');
  if (!Array.isArray(ids) || ids.length > CB.loadout) throw new CombatError('bad_loadout');
  const out = [];
  for (const sid of ids) {
    if (typeof sid !== 'string' || !(sid in prof.specials) || out.includes(sid)) throw new CombatError('not_known');
    { const w = specialDef(prof, sid).weapon; if (w !== weapon && w !== 'any') throw new CombatError('wrong_weapon'); }
    out.push(sid);
  }
  prof.loadout[weapon] = out;
  return { weapon, loadout: out };
}
export function inventBudget(prof) { const I = CB.invent; return Math.min(I.budget_max, I.budget_base + I.budget_per_level * levelOf(prof.xp)); }

// ---------------------------------------------------------------- fight config
export function fightConfig(prof, seed, weapon, hp, species, enemyLevel, target) {
  if (!Object.prototype.hasOwnProperty.call(CB.enemies, species)) throw new CombatError('unknown_enemy');
  if (!Object.prototype.hasOwnProperty.call(CB.weapons, weapon)) weapon = 'fists';
  const lv = levelOf(prof.xp), E = CB.enemies[species], elv = cap(Math.trunc(enemyLevel), 1, 20);
  const loadout = (prof.loadout[weapon] || []).filter((s) => s in prof.specials).map((s) => specialDef(prof, s)).filter(Boolean);
  const mem = prof.adapt[species] || {};
  const adapt = {}; for (const k of ADAPT_KEYS) adapt[k] = Math.trunc(num(mem[k])); adapt.fights = Math.trunc(num(mem.fights));
  return { seed: seed >>> 0, weapon, level: lv, hp: cap(Math.trunc(hp), 1, 999), stamina: CB.player.stamina + CB.player.stamina_per_level * (lv - 1),
    parry: parryWindow(lv), loadout,
    enemy: { species, name: E.name, level: elv, hp: E.hp + E.hp_level * (elv - 1), power: E.power + E.power_level * (elv - 1), target },
    adapt };
}

// ---------------------------------------------------------------- simulation
const fighter = (hp) => ({ hp, hpmax: hp, phase: 'idle', pt: 0, dur: 0, move: null, hk: 0 });
export function newFight(cfg) {
  const P = Object.assign(fighter(cfg.hp), { st: cfg.stamina, stmax: cfg.stamina, focus: 0, blocking: false, block_t: -999, combo: 0,
    last_kind: '', last_end: -999, buf: null, wait: 0, riposte: false, focus_until: -1, start_t: -1 });
  const E = Object.assign(fighter(cfg.enemy.hp), { poise: -1, dazzle: -1, root: -1, burn: -1, burn_next: 0, side_for: -2 });
  const counts = { special: 0 }; for (const k of ADAPT_KEYS) counts[k] = 0;
  return { cfg, t: 0, dist: CB.range.start, P, E, over: null, counts,
    stats: { hits: 0, dealt: 0, taken: 0, parries: 0, perfect: 0, blocked: 0, guard_breaks: 0, streak: 0, max_combo: 0, specials: 0, evaded: 0, enemy_hits: 0, finishers: 0 },
    events: [] };
}
const ev = (S, code, v = 0) => { S.events.push([S.t, code, v]); };
const start = (F, phase, dur) => { F.phase = phase; F.pt = 0; F.dur = dur; };
function shares(S) {
  const cfg = S.cfg, c = S.counts;
  let totCur = 0, tot = 0; const comb = {};
  for (const k of ADAPT_KEYS) { totCur += c[k]; comb[k] = cfg.adapt[k] + c[k]; tot += comb[k]; }
  tot = Math.max(1, tot);
  const k = Math.min(100, cfg.adapt.fights * CB.adapt.per_fight + totCur * 2);
  const sh = {}; for (const x of ADAPT_KEYS) sh[x] = fd(comb[x] * 100, tot);
  return [sh, k];
}
function playerMove(S, a) {
  const P = S.P, cfg = S.cfg, M = CB.moves, t = S.t, lv = cfg.level;
  const chained = P.last_kind === 'light' && (P.phase === 'recovery' || t - P.last_end <= CB.combo.window);
  if (a === 'light') {
    let idx = chained ? P.combo : 0;
    if (idx >= CB.combo.chain.length || lv < CB.combo.chain_level[idx]) idx = 0;
    return { ...M.light, kind: 'light', hits: 1, mult: CB.combo.chain[idx], cost: M.light.stamina, chain: idx + 1 };
  }
  if (a === 'heavy') {
    const F = CB.combo.finisher;
    const mv = { ...M.heavy, kind: 'heavy', hits: 1, cost: M.heavy.stamina, chain: 0 };
    if (chained && P.combo >= F.after && lv >= F.level) Object.assign(mv, { kind: 'finisher', mult: F.mult, kb: F.kb, stun: F.stun });
    return mv;
  }
  const i = a === 'special1' ? 0 : 1;
  if (i >= cfg.loadout.length) return null;
  const d = cfg.loadout[i];
  return { kind: 'special', id: d.id, windup: d.windup, active: d.active, recovery: d.recovery, hits: d.hits, mult: d.mult, kb: d.kb, stun: d.stun,
    effect: d.effect, epower: Math.trunc(num(d.power)), unblockable: !!d.unblockable, close: !!d.close, focus: d.focus, cost: 0, chain: 0 };
}
function tryAct(S) {
  const P = S.P;
  if (P.buf === null) return;
  const [a, bt] = P.buf, t = S.t;
  if (t - bt > CB.player.buffer) { P.buf = null; return; }
  const cancel = P.phase === 'recovery' && P.move !== null && P.move.kind === 'light' && P.pt >= CB.combo.cancel_after && (a === 'light' || a === 'heavy');
  if (P.phase !== 'idle' && !cancel) return;
  P.buf = null;
  if (a === 'dodge') {
    const cost = CB.moves.dodge.stamina;
    if (P.st < cost) { ev(S, 'tired'); return; }
    P.st -= cost; P.wait = CB.player.regen_delay; P.combo = 0; P.move = { kind: 'dodge' };
    start(P, 'dodge', CB.moves.dodge.dur);
    S.dist = Math.min(CB.range.max, S.dist + CB.moves.dodge.shift);
    S.counts.dodge += 1; ev(S, 'dodge');
    return;
  }
  const mv = playerMove(S, a);
  if (mv === null) { ev(S, 'no_special'); return; }
  if (mv.kind === 'special') {
    if (P.focus < mv.focus) { ev(S, 'no_focus'); return; }
    P.focus -= mv.focus; S.counts.special += 1; S.stats.specials += 1; P.combo = 0;
  } else {
    if (P.st < mv.cost) { ev(S, 'tired'); return; }
    P.st -= mv.cost;
    S.counts[mv.kind === 'light' ? 'light' : 'heavy'] += 1;
    if (mv.kind === 'light') P.combo = mv.chain;
    else { if (mv.kind === 'finisher') S.stats.finishers += 1; P.combo = 0; }
  }
  P.wait = CB.player.regen_delay; P.last_kind = mv.kind;
  const reach = CB.weapons[S.cfg.weapon].reach;
  if (mv.close) S.dist = Math.max(CB.range.min, Math.min(S.dist, reach - 2));
  else if (S.dist > reach) S.dist -= Math.min(S.dist - reach, CB.range.lunge);
  P.move = mv; P.start_t = t;
  start(P, 'windup', mv.windup);
  ev(S, mv.kind !== 'special' ? mv.kind : 'special:' + mv.id);
}
function effect(S, mv) {
  const E = S.E, P = S.P, t = S.t, ef = mv.effect || 'none', X = CB.effects[ef] || {}, bonus = fd(mv.epower || 0, 4);
  if (ef === 'push') S.dist = Math.min(CB.range.max, S.dist + X.kb + bonus);
  else if (ef === 'root') E.root = t + X.ticks + bonus;
  else if (ef === 'dazzle') E.dazzle = t + X.ticks + bonus;
  else if (ef === 'burn') { E.burn = t + X.ticks; E.burn_next = t + X.every; }
  else if (ef === 'stagger') start(E, 'stun', mv.stun + X.stun);
  else if (ef === 'renew') P.st = Math.min(P.stmax, P.st + X.stamina + bonus);
  else if (ef === 'focus') P.focus_until = t + X.ticks;
  if (ef !== 'none') ev(S, 'effect:' + ef);
}
function playerHit(S, k) {
  const P = S.P, E = S.E, cfg = S.cfg, mv = P.move, W = CB.weapons[cfg.weapon];
  if (S.dist > W.reach + (mv.kind === 'special' ? 4 : 0)) { ev(S, 'miss'); return; }
  if (E.phase === 'sidestep' && E.pt >= 1 && E.pt <= 4) { S.stats.evaded += 1; ev(S, 'evade'); return; }
  let raw = fd(W.power * mv.mult, 100);
  raw = fd(raw * (100 + CB.skill.dmg_per_level * (cfg.level - 1)), 100);
  if (P.riposte) { raw = fd(raw * CB.parry.riposte, 100); P.riposte = false; }
  let dmg = Math.max(1, raw - CB.enemies[cfg.enemy.species].armour);
  const heavyish = mv.kind === 'heavy' || mv.kind === 'finisher';
  if (E.phase === 'guard' && !mv.unblockable) {
    dmg = Math.max(1, fd(dmg * (heavyish ? CB.block.heavy_chip : CB.block.chip), 100));
    E.hp = Math.max(0, E.hp - dmg); S.stats.dealt += dmg; ev(S, 'e_blocked', dmg);
    if (heavyish) { start(E, 'stun', CB.block.break_stun); ev(S, 'guard_break'); }
    return;
  }
  E.hp = Math.max(0, E.hp - dmg);
  const st = S.stats;
  st.hits += 1; st.dealt += dmg; st.streak += 1; st.max_combo = Math.max(st.max_combo, st.streak);
  P.focus = Math.min(CB.player.focus_max, P.focus + CB.player.hit_focus);
  ev(S, 'hit', dmg);
  const armoured = E.phase === 'windup' && E.move !== null && E.move.kind === 'heavy' && mv.kind === 'light';
  const poised = mv.kind === 'light' && S.t < E.poise;
  if (armoured || poised) ev(S, 'armour');
  else {
    start(E, 'stun', mv.stun); E.poise = S.t + mv.stun + CB.poise; E.move = null;
    S.dist = Math.min(CB.range.max, S.dist + mv.kb);
  }
  if (k === mv.hits - 1 && mv.kind === 'special') effect(S, mv);
}
function playerUpdate(S) {
  const P = S.P;
  tryAct(S);
  const ph = P.phase;
  if (ph === 'idle') return;
  if (ph === 'active') {
    const mv = P.move, n = mv.hits, A = mv.active;
    for (let k = 0; k < n; k++) if (fd(k * A, n) === P.pt && S.E.hp > 0) playerHit(S, k);
  }
  P.pt += 1;
  if (P.pt >= P.dur) {
    if (ph === 'windup') start(P, 'active', P.move.active);
    else if (ph === 'active') start(P, 'recovery', P.move.recovery);
    else { if (ph === 'recovery') P.last_end = S.t; start(P, 'idle', 0); }
  }
}
function enemyStartAttack(S, kind) {
  const E = S.E, t = S.t, A = CB.adapt, spec = CB.enemies[S.cfg.enemy.species];
  const [sh, k] = shares(S);
  const mv = { ...(kind === 'light' ? spec.light : spec.heavyMove), kind };
  const feint = (sh.block >= A.block_share ? fd(A.feint_up * k, 100) : 0) + (sh.parry >= A.parry_share ? fd(A.parry_feint * k, 100) : 0);
  const delay = (sh.dodge >= A.dodge_share ? fd(A.delay_up * k, 100) : 0) + (sh.parry >= A.parry_share ? fd(A.parry_delay * k, 100) : 0);
  if (h3(S.cfg.seed, t, 13) % 100 < delay) { mv.windup += A.delay_min + h3(S.cfg.seed, t, 17) % A.delay_span; ev(S, 'e_delay'); }
  E.move = mv;
  if (h3(S.cfg.seed, t, 11) % 100 < feint) { start(E, 'feint', A.feint_ticks); ev(S, 'e_feint'); return; }
  start(E, 'windup', mv.windup); ev(S, 'e_' + kind);
}
function enemyDecide(S) {
  const E = S.E, P = S.P, t = S.t, A = CB.adapt, cfg = S.cfg, spec = CB.enemies[cfg.enemy.species], seed = cfg.seed;
  if (t < E.dazzle || S.dist > spec.reach) return;
  const [sh, k] = shares(S), pm = P.move;
  if (P.phase === 'windup' && pm !== null && ['heavy', 'finisher', 'special'].includes(pm.kind) && E.side_for !== P.start_t && t >= E.root) {
    E.side_for = P.start_t;
    const chance = spec.dodge + (sh.heavy >= A.heavy_share ? fd(A.sidestep_up * k, 100) : 0);
    if (h3(seed, t, 3) % 100 < chance) { start(E, 'sidestep', 6); S.dist = Math.min(CB.range.max, S.dist + 6); ev(S, 'e_sidestep'); return; }
    const punish = A.punish + (sh.heavy >= A.heavy_share ? fd(A.punish_up * k, 100) : 0);
    if (P.dur - P.pt > spec.light.windup && h3(seed, t, 9) % 100 < punish) { enemyStartAttack(S, 'light'); ev(S, 'e_punish'); return; }
  }
  if (P.phase === 'windup' && pm !== null && pm.kind === 'light' && sh.light >= A.light_share) {
    if (h3(seed, t, 5) % 100 < fd(A.guard_up * k, 100) + fd(spec.guard, 2)) { start(E, 'guard', A.guard_ticks); ev(S, 'e_guard'); return; }
  }
  const heavyP = spec.heavy + (sh.block >= A.block_share ? fd(A.heavy_up * k, 100) : 0);
  const guardP = spec.guard + (sh.light >= A.light_share ? fd(A.guard_up * k, 100) : 0);
  const r = h3(seed, t, 7) % 100;
  if (r < heavyP) enemyStartAttack(S, 'heavy');
  else if (r < heavyP + spec.aggr) enemyStartAttack(S, 'light');
  else if (r < heavyP + spec.aggr + guardP) { start(E, 'guard', A.guard_ticks); ev(S, 'e_guard'); }
  else start(E, 'wait', A.wait_ticks);
}
function enemyHit(S) {
  const E = S.E, P = S.P, cfg = S.cfg, t = S.t, spec = CB.enemies[cfg.enemy.species], mv = E.move;
  if (S.dist > spec.reach) { ev(S, 'e_miss'); return; }
  const D = CB.moves.dodge;
  if (P.phase === 'dodge' && P.pt >= D.i_from && P.pt <= D.i_to) {
    S.stats.perfect += 1; P.focus = Math.min(CB.player.focus_max, P.focus + CB.player.dodge_focus); ev(S, 'perfect_dodge'); return;
  }
  const raw = fd(cfg.enemy.power * mv.mult, 100), heavy = mv.kind === 'heavy';
  if (P.phase === 'idle' && P.blocking) {
    const win = cfg.parry + (t <= P.focus_until ? CB.effects.focus.parry : 0);
    if (t - P.block_t <= win) {
      start(E, 'stun', CB.parry.stun); E.move = null;
      P.focus = Math.min(CB.player.focus_max, P.focus + CB.player.parry_focus); P.riposte = true;
      S.stats.parries += 1; S.counts.parry += 1; ev(S, 'parry'); return;
    }
    const dmg = fd(raw * (heavy ? CB.block.heavy_chip : CB.block.chip), 100);
    const drain = heavy ? CB.block.heavy_drain : Math.max(1, fd(raw * CB.block.drain, 100));
    P.hp = Math.max(0, P.hp - dmg); P.st = Math.max(0, P.st - drain);
    S.stats.taken += dmg; S.stats.blocked += 1; ev(S, 'blocked', dmg);
    if (P.st === 0) { P.blocking = false; start(P, 'stun', CB.block.break_stun); S.stats.guard_breaks += 1; ev(S, 'guard_broken'); }
    return;
  }
  P.hp = Math.max(0, P.hp - raw);
  S.stats.taken += raw; S.stats.enemy_hits += 1; S.stats.streak = 0;
  P.combo = 0; P.buf = null; P.move = { kind: 'stun' };
  start(P, 'stun', mv.stun);
  S.dist = Math.min(CB.range.max, S.dist + mv.kb);
  ev(S, 'hurt', raw);
}
function enemyUpdate(S) {
  const E = S.E;
  if (E.hp <= 0) return;
  const ph = E.phase;
  if (ph === 'idle') { enemyDecide(S); return; }
  if (ph === 'active' && E.pt === 0) { enemyHit(S); if (E.phase !== 'active') return; }
  E.pt += 1;
  if (E.pt >= E.dur) {
    if (ph === 'feint') { const mv = { ...E.move, ...CB.enemies[S.cfg.enemy.species].light, kind: 'light', windup: 2 }; E.move = mv; start(E, 'windup', 2); }
    else if (ph === 'windup') start(E, 'active', E.move.active);
    else if (ph === 'active') start(E, 'recovery', E.move.recovery);
    else start(E, 'idle', 0);
  }
}
export function step(S, actions) {
  if (S.over) return S;
  const P = S.P, E = S.E, t = S.t;
  for (const a of actions) {
    if (a === 'block_on') { if (!P.blocking) { P.blocking = true; P.block_t = t; S.counts.block += 1; } }
    else if (a === 'block_off') P.blocking = false;
    else if (a === 'flee') S.over = 'fled';
    else P.buf = [a, t];
  }
  if (S.over) { S.t = t + 1; return S; }
  playerUpdate(S);
  enemyUpdate(S);
  if (P.wait > 0) P.wait -= 1;
  else if (P.phase === 'idle') P.st = Math.min(P.stmax, P.st + (P.blocking ? CB.player.regen_block : CB.player.regen));
  if (t < E.burn && t >= E.burn_next && E.hp > 0) {
    const X = CB.effects.burn; E.hp = Math.max(0, E.hp - X.dmg); E.burn_next = t + X.every; S.stats.dealt += X.dmg; ev(S, 'burn', X.dmg);
  }
  const spec = CB.enemies[S.cfg.enemy.species];
  if ((E.phase === 'idle' || E.phase === 'wait') && S.dist > spec.reach && t >= E.root && t >= E.dazzle) S.dist = Math.max(spec.reach - 1, S.dist - spec.speed);
  S.dist = cap(S.dist, CB.range.min, CB.range.max);
  if (E.hp <= 0) { S.over = 'win'; ev(S, 'win'); }
  else if (P.hp <= 0) { S.over = 'lose'; ev(S, 'lose'); }
  S.t = t + 1;
  if (!S.over && S.t >= CB.max_ticks) S.over = 'timeout';
  return S;
}
export function validateInputs(inputs) {
  if (!Array.isArray(inputs) || inputs.length > CB.max_inputs) throw new CombatError('bad_inputs');
  let last = -1, per = 0; const out = [];
  for (const it of inputs) {
    if (!Array.isArray(it) || it.length !== 2 || !Number.isInteger(it[0]) || typeof it[1] !== 'string') throw new CombatError('bad_inputs');
    const [t, a] = it;
    if (!ACTIONS.includes(a) || t < 0 || t >= CB.max_ticks || t < last) throw new CombatError('bad_inputs');
    per = t === last ? per + 1 : 1;
    if (per > CB.max_per_tick) throw new CombatError('bad_inputs');
    last = t; out.push([t, a]);
  }
  return out;
}
export function summary(S) {
  return { outcome: S.over, ticks: S.t, player: { hp: S.P.hp, st: S.P.st, focus: S.P.focus }, enemy: { hp: S.E.hp, hpmax: S.E.hpmax },
    stats: { ...S.stats }, counts: { ...S.counts }, events: S.events };
}
export function runFight(cfg, inputs) {
  const ins = validateInputs(inputs), S = newFight(cfg);
  let i = 0;
  while (!S.over) { const acts = []; while (i < ins.length && ins[i][0] === S.t) { acts.push(ins[i][1]); i++; } step(S, acts); }
  return summary(S);
}
export function applyResult(prof, cfg, res) {
  const Sk = CB.skill, st = res.stats, win = res.outcome === 'win';
  let xp = win ? Sk.xp_win + Sk.xp_win_level * cfg.enemy.level : (res.outcome === 'lose' || res.outcome === 'timeout' ? Sk.xp_loss : 0);
  xp += 2 * st.parries + st.perfect + 2 * Math.min(st.max_combo, 10) + 2 * st.specials + 3 * st.finishers;
  if (res.outcome === 'fled') xp = Math.min(xp, 4);
  xp = Math.min(Sk.xp_cap, xp);
  const before = levelOf(prof.xp); prof.xp += xp; const after = levelOf(prof.xp);
  const w = cfg.weapon;
  prof.mastery[w] = Math.trunc(num(prof.mastery[w])) + st.hits;
  prof.fights += 1; prof.wins += win ? 1 : 0;
  prof.best_combo = Math.max(prof.best_combo, st.max_combo); prof.parries += st.parries; prof.perfect += st.perfect;
  const sp = cfg.enemy.species, mem = prof.adapt[sp] || {}, nm = {};
  for (const k of ADAPT_KEYS) nm[k] = fd(Math.trunc(num(mem[k])), 2) + res.counts[k];
  nm.fights = Math.min(99, Math.trunc(num(mem.fights)) + 1);
  prof.adapt[sp] = nm;
  prof.history = [...prof.history, [sp, res.outcome, res.ticks, xp]].slice(-8);
  prof.fight = null;
  return { xp, level: after, levelled: after > before, unlocked: Object.keys(CB.specials).sort().filter((s) => before < CB.specials[s].level && CB.specials[s].level <= after) };
}
export function adaptSummary(prof) {
  const out = {};
  for (const sp of Object.keys(prof.adapt).sort()) {
    const mem = prof.adapt[sp]; let tot = 0; for (const k of ADAPT_KEYS) tot += Math.trunc(num(mem[k])); tot = Math.max(1, tot);
    let top = null;
    for (const k of ADAPT_KEYS) { const v = Math.trunc(num(mem[k])); if (top === null || v > Math.trunc(num(mem[top])) || (v === Math.trunc(num(mem[top])) && k > top)) top = k; }
    const shares = {}; for (const k of ADAPT_KEYS) shares[k] = fd(Math.trunc(num(mem[k])) * 100, tot);
    out[sp] = { fights: Math.trunc(num(mem.fights)), habit: Math.trunc(num(mem[top])) ? top : null, shares };
  }
  return out;
}
export function combatView(prof) {
  const lv = levelOf(prof.xp), nxt = lv < CB.skill.xp.length ? CB.skill.xp[lv] : null;
  const specials = {}; for (const sid of Object.keys(prof.specials).sort()) specials[sid] = specialDef(prof, sid);
  return { label: CB.label, level: lv, xp: prof.xp, next: nxt, parry_window: parryWindow(lv), stamina: CB.player.stamina + CB.player.stamina_per_level * (lv - 1),
    specials, learnable: learnable(prof), loadout: prof.loadout, mastery: prof.mastery, fights: prof.fights, wins: prof.wins,
    best_combo: prof.best_combo, parries: prof.parries, perfect: prof.perfect, adapt: adaptSummary(prof), invent_budget: inventBudget(prof), history: prof.history };
}
