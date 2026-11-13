// Strata: Lux Genesis core backbone: exact port of ogce4/v90/genesis.py (parity-tested).
import GEN from '../../ogce4/v90/genesis.json' with { type: 'json' };
export { GEN };
export const LAWS = Object.fromEntries(GEN.laws.map((l) => [l.id, l]));
export const FACT_KEYS = ['discoveries', 'inventions', 'principles', 'explored', 'allies', 'secrets', 'quests', 'quiz', 'choices',
  'invented_moves', 'specials', 'crafts', 'wins', 'legacy', 'combat_level', 'clues', 'codex', 'realms'];
export class GenesisError extends Error { constructor(code) { super(code); this.code = code; } }
const fd = (a, b) => Math.floor(a / b);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const kindOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'list' : typeof v === 'object' ? 'dict' : Number.isInteger(v) ? 'int' : typeof v);

export function newRecord() { return { cycle: 0, laws: [], attempts: {}, ending: null, endings: [], claimed: [], unlocked: [], title: 'title_newcomer', archive: [] }; }
export function normRecord(r) {
  const base = newRecord();
  if (r && typeof r === 'object' && !Array.isArray(r)) for (const [k, v] of Object.entries(r)) {
    if (has(base, k) && (kindOf(v) === kindOf(base[k]) || (k === 'ending' && (v === null || typeof v === 'string')))) base[k] = v;
  }
  return base;
}
export function normFacts(f) {
  f = f && typeof f === 'object' ? f : {};
  const o = {}; for (const k of FACT_KEYS) { const v = f[k] ?? 0; o[k] = Number.isInteger(v) && typeof v !== 'boolean' ? Math.max(0, v) : 0; }
  return o;
}
export function lux(rec, f) {
  const W = GEN.lux;
  const parts = {
    discoveries: f.discoveries * W.discovery, inventions: f.inventions * W.invention, principles: f.principles * W.principle,
    exploring: Math.min(W.explored_cap, f.explored * W.explored), allies: f.allies * W.ally, secrets: f.secrets * W.secret,
    quests: f.quests * W.quest, puzzles: f.quiz * W.quiz + rec.laws.length * W.law, choices: Math.min(W.choice_cap, f.choices * W.choice),
    moves: f.invented_moves * W.invented_move + f.specials * W.special, crafting: Math.min(W.craft_cap, f.crafts * W.craft),
    fights: Math.min(W.win_cap, f.wins * W.win), legacy: Math.min(W.legacy_cap, f.legacy * W.legacy),
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { total, parts, understanding_pct: fd((total - parts.fights) * 100, Math.max(1, total)) };
}
export function strataList(cycle) {
  const D = GEN.deep, scale = 100 + D.scale * cycle;
  const out = GEN.strata.map((s) => ({ id: s.id, name: s.name, lux: fd(s.lux * scale, 100), laws: s.laws }));
  const top = out[out.length - 1].lux;
  for (let i = 0; i < D.per_cycle * cycle; i++) out.push({ id: 'deep' + (i + 1), name: `${D.name} ${i + 1}`, lux: top + fd(D.lux_step * (i + 1) * scale, 100), laws: 7 });
  return out;
}
export function stratumIndex(rec, total) {
  let idx = 0; const sl = strataList(rec.cycle);
  for (let i = 0; i < sl.length; i++) { if (total >= sl[i].lux && rec.laws.length >= sl[i].laws) idx = i; else break; }
  return idx;
}
function met(need, facts, extra) {
  for (const k of Object.keys(need).sort()) {
    const v = need[k];
    if (k === 'ending_id') { if (!extra.endings.includes(v)) return false; }
    else if (has(extra, k)) { if (extra[k] < v) return false; }
    else if ((facts[k] ?? 0) < v) return false;
  }
  return true;
}
function extraOf(rec, facts) {
  const total = lux(rec, facts).total;
  return { lux: total, stratum: stratumIndex(rec, total), laws: rec.laws.length, ending: rec.ending ? 1 : 0, endings: [...rec.endings] };
}
export function claimLaw(rec, facts, lawId, answer) {
  const L = has(LAWS, lawId) ? LAWS[lawId] : null;
  if (!L) throw new GenesisError('unknown_law');
  if (rec.laws.includes(lawId)) throw new GenesisError('already_claimed');
  if (!met(L.need, facts, {})) throw new GenesisError('law_locked');
  if (!Number.isInteger(answer) || typeof answer === 'boolean' || answer < 0 || answer >= L.options.length) throw new GenesisError('bad_answer');
  const n = Math.trunc(rec.attempts[lawId] ?? 0) + 1; rec.attempts[lawId] = n;
  if (answer !== L.answer) return { correct: false, law: lawId, attempts: n, hint: 'Not quite. Look again at the FACT clue and try another answer.' };
  rec.laws.push(lawId);
  return { correct: true, law: lawId, value: L.value, name: L.name, fact: L.fact, theory: L.theory, lux: GEN.lux.law };
}
export function endingsView(rec, facts) {
  const ex = extraOf(rec, facts), atSource = ex.stratum >= 7;
  return ['harmony', 'power', 'sacrifice', 'stranger'].map((eid) => {
    const E = GEN.endings[eid], visible = !E.hidden || facts.clues > 0 || rec.endings.includes(eid);
    return { id: eid, name: visible ? E.name : '???', hidden: !visible, need: visible ? E.need : {}, available: atSource && met(E.need, facts, ex),
      chosen: rec.endings.includes(eid), text: rec.endings.includes(eid) ? E.text : null, hint: eid === 'stranger' && !visible ? GEN.clue_hint : null };
  });
}
export function chooseEnding(rec, facts, eid) {
  if (typeof eid !== 'string' || !has(GEN.endings, eid)) throw new GenesisError('unknown_ending');
  if (rec.ending) throw new GenesisError('ending_already_chosen');
  const ex = extraOf(rec, facts);
  if (ex.stratum < 7) throw new GenesisError('reach_the_source_first');
  if (!met(GEN.endings[eid].need, facts, ex)) throw new GenesisError('ending_locked');
  rec.ending = eid; rec.endings.push(eid);
  return { ending: eid, name: GEN.endings[eid].name, text: GEN.endings[eid].text, cycle: rec.cycle };
}
export function rewardsView(rec, facts) {
  const ex = extraOf(rec, facts);
  return GEN.rewards.map((r) => ({ id: r.id, kind: r.kind, name: r.name, need: r.need, ready: met(r.need, facts, ex), claimed: rec.claimed.includes(r.id) || rec.unlocked.includes(r.id) }));
}
export function claimReward(rec, facts, explorer, rid) {
  const R = GEN.rewards.find((r) => r.id === rid);
  if (!R) throw new GenesisError('unknown_reward');
  if (rec.claimed.includes(rid)) throw new GenesisError('already_claimed');
  if (!met(R.need, facts, extraOf(rec, facts))) throw new GenesisError('reward_locked');
  rec.claimed.push(rid);
  if (R.kind === 'material') { for (const item of Object.keys(R.grant).sort()) explorer.bag[item] = Math.trunc(explorer.bag[item] ?? 0) + R.grant[item]; }
  else if (!rec.unlocked.includes(rid)) rec.unlocked.push(rid);
  if (R.kind === 'title') rec.title = rid;
  return { reward: rid, kind: R.kind, name: R.name, grant: R.grant ?? {} };
}
export function setTitle(rec, rid) {
  if (typeof rid !== 'string' || !rec.unlocked.includes(rid) || !rid.startsWith('title_')) throw new GenesisError('title_locked');
  rec.title = rid; return { title: rid };
}
export function newGenesis(rec, facts, explorer, confirm) {
  if (confirm !== true) throw new GenesisError('confirm_required');
  if (!rec.ending) throw new GenesisError('finish_the_story_first');
  const invs = (explorer.inventions || []).filter((i) => i && typeof i === 'object' && !Array.isArray(i)).map((i) => i.name ?? i.id ?? '').slice(0, 24);
  rec.archive = [...rec.archive, { cycle: rec.cycle, ending: rec.ending, laws: [...rec.laws], inventions: invs }].slice(-12);
  const keep = { inventions: explorer.inventions ?? [], appearance: explorer.appearance ?? {} };
  rec.cycle += 1; rec.laws = []; rec.attempts = {}; rec.ending = null;
  rec.claimed = rec.claimed.filter((c) => !c.startsWith('mat_'));
  return { cycle: rec.cycle, keep, deeper: strataList(rec.cycle).length, foe_bonus: rec.cycle };
}
export function genesisView(rec, facts) {
  const L = lux(rec, facts), sl = strataList(rec.cycle), si = stratumIndex(rec, L.total), nxt = si + 1 < sl.length ? sl[si + 1] : null;
  const laws = GEN.laws.map((l) => {
    const claimed = rec.laws.includes(l.id);
    return { id: l.id, value: l.value, name: l.name, realm: l.realm, need: l.need, unlocked: met(l.need, facts, {}), claimed, q: l.q, options: l.options,
      attempts: Math.trunc(rec.attempts[l.id] ?? 0), fact: claimed ? l.fact : null, theory: claimed ? l.theory : null };
  });
  return { label: GEN.label, premise: GEN.premise, objective: GEN.objective, after: GEN.after, lux_note: GEN.lux_note,
    cycle: rec.cycle, lux: L, stratum: { index: si, name: sl[si].name, of: sl.length, next: nxt, source: si >= 7 },
    strata: sl, laws, laws_claimed: rec.laws.length, endings: endingsView(rec, facts), ending: rec.ending,
    rewards: rewardsView(rec, facts), title: rec.title, unlocked: rec.unlocked, archive: rec.archive,
    measures: { lux: L.total, strata_reached: si, codex: facts.codex, mastery: facts.combat_level + facts.specials + fd(facts.crafts, 5), legacy: facts.legacy },
    facts };
}
import { knownPrinciples } from './omniverse.js';
import { levelOf } from '../../web/js/combat.js';
const isDict = (v) => v && typeof v === 'object' && !Array.isArray(v);
export function factsFrom(explorer, prof90, combat, legacy) {
  const npc = isDict(explorer.npc) ? explorer.npc : {};
  const mems = Object.keys(npc).sort().map((k) => npc[k]).filter(isDict);
  const stats = isDict(prof90) && isDict(prof90.stats) ? prof90.stats : {};
  const st = (k) => (Number.isInteger(stats[k] ?? 0) ? (stats[k] ?? 0) : 0);
  const invs = (explorer.inventions || []).filter(isDict), invented = (combat.invented || []).filter(isDict);
  const poet = isDict(npc.poet) ? npc.poet : {};
  const clues = (poet.secret === true ? 1 : 0) + (invs.some((i) => i.category === 'mystical') || invented.some((m) => m.symbolic === true) ? 1 : 0)
    + (explorer.ending ? 1 : 0) + (explorer.custom_realms && Object.keys(explorer.custom_realms).length ? 1 : 0);
  const realms = new Set((explorer.explored || []).map((e) => String(e).split(':')[0]));
  const principles = knownPrinciples(explorer).length;
  return normFacts({
    discoveries: (explorer.bestiary || []).length, inventions: invs.length, principles, explored: (explorer.explored || []).length,
    allies: mems.filter((m) => m.ally === true).length, secrets: mems.filter((m) => m.secret === true).length,
    quests: (explorer.quests || []).length + mems.reduce((a, m) => a + (Array.isArray(m.done) ? m.done.length : 0), 0),
    quiz: st('correct'), choices: (explorer.flags || []).length, invented_moves: invented.length,
    specials: Math.max(0, Object.keys(combat.specials || {}).length - invented.length), crafts: st('crafted') + st('built'),
    wins: Math.trunc(combat.wins ?? 0) + st('defeated'), legacy: Math.max(0, Math.trunc(legacy)) + mems.filter((m) => (m.rel ?? 0) !== 0).length,
    combat_level: levelOf(Math.trunc(combat.xp ?? 0)), clues, codex: invs.length + invented.length + principles, realms: realms.size });
}
