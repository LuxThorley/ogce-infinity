// μLux — Living World engine (v0.5). "Aliveness" as engineering, not metaphysics:
// a persistent, autonomous, self-regulating, self-evolving artificial-life world whose knowledge is a least fixed point.
//   • tick loop            — every tick each agent perceives, chooses by its genome, acts, metabolises (FACT: simulation)
//   • memory               — each agent keeps its last 12 experiences; the world keeps decaying statistics of all experience
//   • homeostasis          — a negative-feedback controller steers light regeneration toward a population set-point
//   • evolution            — reproduction copies genomes with mutation; selection is by survival alone
//   • emergent rules       — Horn rules  outcome ← percept/action  are mined from experience (skill synthesis)
//   • self-model           — agents' outcomes are predicted by μΓ of the learned rules (thesis closure) and scored
//   • integrity + healing  — SHA-256 hash-chained ledger, snapshots, deterministic replay that must reproduce the ledger
// Consciousness is NOT claimed: any reading of these mechanisms as awareness is SPECULATION / symbolic counsel.
import { makeUniverse, closure } from './lattice.js';
import { canonical, sha256Hex } from './receipt.js';

export const LIFE = Object.freeze({ grid: 12, founders: 12, maxAgents: 1440, maxRules: 144, maxPending: 12, maxCatchUp: 1440, memory: 12,
  snapshotEvery: 12, mineEvery: 12, keepSnapshots: 3, chronicleMax: 144, historyMax: 144, tickMs: 833, minSupport: 20, adoptConf: 0.9, retireConf: 0.75 });
export const PERCEPTS = ['hungry', 'sated', 'light_here', 'light_near', 'crowded', 'alone'];
export const ACTIONS = ['harvest', 'seek_light', 'wander', 'rest', 'split'];
export const OUTCOMES = ['gained', 'lost', 'split_ok', 'died'];
export const FORBID = [['gained', 'lost'], ['died', 'split_ok']];
export const MODES = ['manual', 'hybrid', 'autonomous'];
const ATOMS = [...PERCEPTS, ...ACTIONS, ...OUTCOMES];
const G = LIFE.grid;

// ---- deterministic randomness on serialisable state (mulberry32, identical to rng.js)
function next(w) {
  w.rng = (w.rng + 0x6D2B79F5) >>> 0; let t = w.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (w, arr) => arr[Math.floor(next(w) * arr.length)];

// ---- generative names (pure function of seed and index; no world randomness consumed)
const SYL = ['lu', 'mi', 'ra', 'el', 'on', 'sa', 'vi', 'ta', 'no', 'ae', 'ka', 'ri', 'so', 'li', 'ma', 'thi', 'ur', 'ze', 'an', 'il'];
export function nameOf(seed, n) {
  let a = (Math.imul(seed >>> 0, 31) + Math.imul(n + 1, 2654435761)) >>> 0; const w = { rng: a };
  const k = 2 + Math.floor(next(w) * 2); let s = ''; for (let i = 0; i < k; i++) s += pick(w, SYL);
  return s[0].toUpperCase() + s.slice(1);
}

// ---- genomes: ordered condition → action genes; first match fires
function randomGene(w) {
  const k = 1 + Math.floor(next(w) * 2); const conds = [];
  while (conds.length < k) { const p = pick(w, PERCEPTS); if (!conds.includes(p)) conds.push(p); }
  return { if: conds.sort(), then: pick(w, ACTIONS) };
}
const randomGenome = (w) => Array.from({ length: 2 + Math.floor(next(w) * 3) }, () => randomGene(w));
function mutate(w, g) {
  const c = g.map((x) => ({ if: [...x.if], then: x.then })); const r = next(w);
  if (r < 0.3 && c.length < 6) c.splice(Math.floor(next(w) * (c.length + 1)), 0, randomGene(w));
  else if (r < 0.45 && c.length > 1) c.splice(Math.floor(next(w) * c.length), 1);
  else if (r < 0.75) { c[Math.floor(next(w) * c.length)].then = pick(w, ACTIONS); }
  else if (r < 0.9) { c[Math.floor(next(w) * c.length)] = randomGene(w); }
  return c;
}
// Genes override instinct; instinct (no gene matched): split when sated, harvest when lit, otherwise seek light.
export function choose(genome, P) {
  for (const g of genome) if (g.if.every((p) => P.has(p))) return g.then;
  return P.has('sated') ? 'split' : P.has('light_here') ? 'harvest' : 'seek_light';
}
export const genomeText = (g) => g.map((x) => `${x.if.join('∧')}→${x.then}`).join('; ');

function spawn(w, { x, y, e, genome, lineage, gen = 0 }) {
  const id = w.nextId++;
  const a = { id, lineage: lineage ?? id, gen, x, y, e, age: 0, g: genome, mem: [] };
  w.agents.push(a); w.lineages[a.lineage] = (w.lineages[a.lineage] || 0) + 1; return a;
}
const note = (w, text, grade = 'FACT') => { w.chronicle.push({ tick: w.tick, text, grade }); if (w.chronicle.length > LIFE.chronicleMax) w.chronicle.shift(); };
const houseName = (w, lineage) => nameOf(w.seed, lineage);

export function createWorld({ seed = 144, setpoint = 24, mode = 'hybrid', homeostat = true, now = 0 } = {}) {
  if (!MODES.includes(mode)) throw new Error(`unknown mode ${mode}`);
  const w = { v: 1, app: 'μLux', seed: seed >>> 0, rng: seed >>> 0, tick: 0, mode, setpoint, homeostat, regen: 0.05, ctrl: { r0: 0.03, kp: 1, ki: 0.0005, I: 0 }, light: [], agents: [], nextId: 1, lineages: {},
    rules: [], pending: [], rejected: {}, stats: {}, history: [], chronicle: [], archive: [], selfModel: { recent: [] }, balance: { run: 0, found: false },
    births: 0, deaths: 0, regenerations: 0, savedAt: now, intents: [], snapshots: [], ledger: { head: '0'.repeat(64), length: 0, stateHash: null, recent: [] } };
  for (let i = 0; i < G * G; i++) w.light.push(0.3 + 0.7 * next(w));
  for (let i = 0; i < LIFE.founders; i++) spawn(w, { x: Math.floor(next(w) * G), y: Math.floor(next(w) * G), e: 0.6, genome: randomGenome(w) });
  w.name = nameOf(w.seed, 0);
  note(w, `World ${w.name} kindled from seed ${w.seed} with ${LIFE.founders} founders: houses ${w.agents.map((a) => houseName(w, a.lineage)).join(', ')}.`);
  return w;
}

// ---- perception on a 12 × 12 torus
const nbrs = (x, y) => [[(x + 1) % G, y], [(x + G - 1) % G, y], [x, (y + 1) % G], [x, (y + G - 1) % G]];
export function perceive(w, a, occ) {
  const c = a.y * G + a.x; const L = w.light; const P = new Set();
  if (a.e < 0.35) P.add('hungry'); if (a.e > 0.75) P.add('sated');
  if (L[c] > 0.5) P.add('light_here');
  if (Math.max(...nbrs(a.x, a.y).map(([x, y]) => L[y * G + x])) > L[c] + 0.1) P.add('light_near');
  const here = occ.get(c) || 0; if (here >= 3) P.add('crowded');
  if (here <= 1 && nbrs(a.x, a.y).every(([x, y]) => !occ.get(y * G + x))) P.add('alone');
  return P;
}

// ---- the world's learned model: Horn rules over ATOMS, closed with the thesis operator (semi-naive μΓ)
export function knowledgeUniverse(rules, context) {
  return makeUniverse({ name: 'world-model', atoms: ATOMS, axioms: [...context], rules: rules.map((r) => ({ head: r.head, body: r.body })) });
}
export function predict(rules, context) { const mu = closure(knowledgeUniverse(rules, context)); return OUTCOMES.filter((o) => mu.has(o)); }
const bodyKey = (b) => b.join('|');
function record(w, ctx, outs) {
  const c = [...ctx].sort(); const bodies = c.map((x) => [x]);
  for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) bodies.push([c[i], c[j]]);
  for (const b of bodies) { const k = bodyKey(b); const s = w.stats[k] || (w.stats[k] = { n: 0, h: {} }); s.n++; for (const o of outs) s.h[o] = (s.h[o] || 0) + 1; }
}
// Sandbox / admissibility (thesis Adm): a rule may not let any consistent context derive a forbidden pair.
export function admissible(rules, cand) {
  const all = [...rules, cand];
  for (const r of rules) {
    const ctx = new Set([...r.body, ...cand.body]);
    if (ACTIONS.filter((a) => ctx.has(a)).length > 1 || (ctx.has('hungry') && ctx.has('sated'))) continue; // impossible context
    const out = new Set(predict(all, ctx));
    if (FORBID.some(([p, q]) => out.has(p) && out.has(q))) return false;
  }
  return true;
}
export function mine(w) {
  const cands = [];
  for (const [k, s] of Object.entries(w.stats)) {
    if (s.n < LIFE.minSupport) continue; const body = k.split('|');
    for (const head of OUTCOMES) {
      const conf = (s.h[head] || 0) / s.n;
      if (conf >= LIFE.adoptConf) cands.push({ head, body, conf: +conf.toFixed(4), n: Math.round(s.n) });
    }
  }
  cands.sort((p, q) => q.conf - p.conf || q.n - p.n || bodyKey(p.body).localeCompare(bodyKey(q.body)) || p.head.localeCompare(q.head));
  return cands.filter((c) => !cands.some((d) => d !== c && d.head === c.head && d.body.length < c.body.length && d.body.every((b) => c.body.includes(b))));
}
const ruleKey = (r) => `${r.head}<-${bodyKey(r.body)}`;
export const ruleText = (r) => `${r.head} ← ${r.body.join(' ∧ ')}`;
function adopt(w, c, how) {
  if (w.rules.length >= LIFE.maxRules) return false;
  if (!admissible(w.rules, c)) { w.rejected[ruleKey(c)] = w.tick; note(w, `Sandbox refused the law ${ruleText(c)}: it would let a context derive a forbidden pair.`); return false; }
  w.rules.push({ head: c.head, body: c.body, conf: c.conf, n: c.n, bornTick: w.tick, how });
  note(w, `The world learned a law (${how}): ${ruleText(c)} — confidence ${(c.conf * 100).toFixed(1)} %, n = ${c.n}.`); return true;
}
function learn(w) {
  for (const s of Object.values(w.stats)) { s.n *= 0.9; for (const o of Object.keys(s.h)) s.h[o] *= 0.9; } // forgetting
  for (const r of [...w.rules]) {
    const s = w.stats[bodyKey(r.body)]; if (!s || s.n < LIFE.minSupport) continue;
    r.conf = +((s.h[r.head] || 0) / s.n).toFixed(4); r.n = Math.round(s.n);
    if (r.conf < LIFE.retireConf) { w.rules.splice(w.rules.indexOf(r), 1); note(w, `The world retired the law ${ruleText(r)}: confidence fell to ${(r.conf * 100).toFixed(1)} %.`); }
  }
  const known = new Set([...w.rules, ...w.pending].map(ruleKey));
  for (const c of mine(w)) {
    const k = ruleKey(c); if (known.has(k) || (w.rejected[k] && w.tick - w.rejected[k] < 144)) continue;
    if (w.mode === 'autonomous') { if (adopt(w, c, 'autonomous')) known.add(k); }
    else if (w.pending.length < LIFE.maxPending) { w.pending.push(c); known.add(k); note(w, `A law awaits your approval: ${ruleText(c)}.`); }
  }
}

// ---- one tick of life
function stepWorld(w) {
  w.tick++;
  const occ = new Map(); for (const a of w.agents) { const c = a.y * G + a.x; occ.set(c, (occ.get(c) || 0) + 1); }
  const L = w.light; let tp = 0, fp = 0, fn = 0; const births = [];
  for (const a of w.agents) {
    const P = perceive(w, a, occ); const act = choose(a.g, P); const ctx = new Set([...P, act]);
    const predicted = w.rules.length ? predict(w.rules, ctx) : [];
    const e0 = a.e; const c = a.y * G + a.x; const outs = [];
    if (act === 'harvest') { const g = Math.min(L[c], 0.25); L[c] -= g; a.e += g; }
    else if (act === 'seek_light') { let best = null; for (const [x, y] of nbrs(a.x, a.y)) if (!best || L[y * G + x] > L[best[1] * G + best[0]]) best = [x, y]; [a.x, a.y] = best; a.e -= 0.03; }
    else if (act === 'wander') { [a.x, a.y] = pick(w, nbrs(a.x, a.y)); a.e -= 0.02; }
    else if (act === 'split') {
      if (a.e > 0.8 && w.agents.length + births.length < LIFE.maxAgents) {
        a.e /= 2; births.push({ x: a.x, y: a.y, e: a.e, genome: mutate(w, a.g), lineage: a.lineage, gen: a.gen + 1 }); outs.push('split_ok');
      } else a.e -= 0.01;
    }
    a.e = Math.min(a.e - 0.02, 1.5); a.age++;
    if (a.e > e0) outs.push('gained'); else if (a.e < e0) outs.push('lost');
    if (a.e <= 0) outs.push('died');
    for (const o of OUTCOMES) { const p = predicted.includes(o), r = outs.includes(o); if (p && r) tp++; else if (p) fp++; else if (r) fn++; }
    record(w, ctx, outs);
    a.mem.push([...ctx, ...outs]); if (a.mem.length > LIFE.memory) a.mem.shift();
  }
  // deaths, archive (seed bank of the longest lives), births
  const dead = w.agents.filter((a) => a.e <= 0);
  for (const a of dead) {
    w.deaths++; w.lineages[a.lineage]--;
    w.archive.push({ age: a.age, g: a.g, lineage: a.lineage }); w.archive.sort((p, q) => q.age - p.age); w.archive.length = Math.min(w.archive.length, 12);
    if (a.age >= 144) note(w, `Elder ${nameOf(w.seed, 1000 + a.id)} of house ${houseName(w, a.lineage)} returned to the light after ${a.age} ticks.`);
  }
  w.agents = w.agents.filter((a) => a.e > 0);
  for (const b of births) { spawn(w, b); w.births++; if (w.lineages[b.lineage] === 10) note(w, `The house of ${houseName(w, b.lineage)} numbers ten.`); }
  // homeostasis: negative feedback on regeneration toward the population set-point
  const P = w.agents.length;
  // PI controller: proportional term reacts now, integral term removes steady-state error.
  if (w.homeostat) { const err = (w.setpoint - P) / w.setpoint; const c = w.ctrl; c.I = Math.min(0.1, Math.max(-0.1, c.I + c.ki * err)); w.regen = Math.min(0.25, Math.max(0.002, c.r0 * (1 + c.kp * err) + c.I)); }
  for (let i = 0; i < L.length; i++) L[i] += w.regen * (1 - L[i]);
  if (P === 0) { // regeneration from the seed bank
    w.regenerations++;
    const bank = w.archive.length ? w.archive : [{ g: randomGenome(w), lineage: null }];
    for (let i = 0; i < 6; i++) { const s = bank[i % bank.length]; spawn(w, { x: Math.floor(next(w) * G), y: Math.floor(next(w) * G), e: 0.6, genome: mutate(w, s.g), lineage: s.lineage ?? undefined }); }
    note(w, `Extinction at tick ${w.tick}. The world regenerated 6 lives from its seed bank of ${w.archive.length} remembered genomes.`);
  }
  w.history.push(w.agents.length); if (w.history.length > LIFE.historyMax) w.history.shift();
  w.selfModel.recent.push([tp, fp, fn]); if (w.selfModel.recent.length > LIFE.historyMax) w.selfModel.recent.shift();
  const inBand = Math.abs(w.agents.length - w.setpoint) / w.setpoint <= 0.25; w.balance.run = inBand ? w.balance.run + 1 : 0;
  if (w.balance.run === 48 && !w.balance.found) { w.balance.found = true; note(w, `The world found its balance: population within 25 % of the set-point (${w.setpoint}) for 48 ticks.`); }
  if (w.tick % LIFE.mineEvery === 0) learn(w);
  if (w.tick % 144 === 0) {
    const sm = selfModelScore(w);
    note(w, `Cycle ${w.tick / 144} closes: ${w.agents.length} alive, ${w.rules.length} laws known, self-model precision ${(sm.precision * 100).toFixed(1)} %.`);
    note(w, 'The 144-tick cycle is a symbolic cadence chosen from the Doctrine’s integers — not a mechanism.', 'BELIEF');
  }
}

// ---- integrity: hash-chained ledger over the canonical core state
export function coreState(w) { const { ledger, snapshots, intents, savedAt, ...core } = w; return core; }
export const stateHash = (w) => sha256Hex(canonical(coreState(w)));
async function seal(w, kind) {
  const sh = await stateHash(w); const hash = await sha256Hex(`${w.ledger.head}|${kind}|${w.tick}|${sh}`);
  const e = { seq: w.ledger.length + 1, tick: w.tick, kind, stateHash: sh, prev: w.ledger.head, hash };
  w.ledger.recent.push(e); if (w.ledger.recent.length > 24) w.ledger.recent.shift();
  w.ledger.head = hash; w.ledger.length++; w.ledger.stateHash = sh;
}
function snapshot(w) {
  w.snapshots.push({ tick: w.tick, stateHash: w.ledger.stateHash, state: JSON.stringify(coreState(w)), ledgerHead: w.ledger.head, ledgerLength: w.ledger.length });
  if (w.snapshots.length > LIFE.keepSnapshots) w.snapshots.shift();
  const oldest = w.snapshots[0].tick; w.intents = w.intents.filter((i) => i.tick >= oldest);
}
export async function tick(w, n = 1) {
  for (let i = 0; i < n; i++) {
    stepWorld(w); await seal(w, 'tick');
    if (w.tick % LIFE.snapshotEvery === 0 || w.snapshots.length === 0) snapshot(w);
  }
  return w;
}
export async function sealGenesis(w) { await seal(w, 'genesis'); snapshot(w); return w; }

// ---- owner intents (logged so replay can reproduce them)
function applyIntent(w, it) {
  if (it.type === 'mode') w.mode = it.arg;
  else if (it.type === 'setpoint') w.setpoint = it.arg;
  else if (it.type === 'approve') { const i = w.pending.findIndex((c) => ruleKey(c) === it.arg); if (i >= 0) { const [c] = w.pending.splice(i, 1); adopt(w, c, 'approved by owner'); } }
  else if (it.type === 'propose') { // an owner- or Malcolm-written rule enters the pending queue, scored against the world's own experience
    const c = it.arg; const st = w.stats[bodyKey(c.body)]; const k = ruleKey(c);
    if (![...w.rules, ...w.pending].some((r) => ruleKey(r) === k) && w.pending.length < LIFE.maxPending) {
      w.pending.push({ head: c.head, body: c.body, conf: st && st.n ? +((st.h[c.head] || 0) / st.n).toFixed(4) : 0, n: st ? Math.round(st.n) : 0, source: c.source || 'owner' });
      note(w, `A proposed law (${c.source || 'owner'}) awaits approval: ${ruleText(c)}.`);
    }
  }
  else if (it.type === 'reject') { const i = w.pending.findIndex((c) => ruleKey(c) === it.arg); if (i >= 0) { const [c] = w.pending.splice(i, 1); w.rejected[it.arg] = w.tick; note(w, `You declined the law ${ruleText(c)}.`); } }
}
export async function intent(w, type, arg) {
  if (type === 'mode' && !MODES.includes(arg)) throw new Error('bad mode');
  const it = { tick: w.tick, type, arg }; w.intents.push(it); applyIntent(w, it); await seal(w, `intent:${type}`); return w;
}
export const pendingKey = ruleKey;

export async function verify(w) {
  const sh = await stateHash(w);
  if (sh !== w.ledger.stateHash) return { ok: false, reason: 'state does not match the sealed ledger head (corruption or unsealed edit)' };
  for (const e of w.ledger.recent) if ((await sha256Hex(`${e.prev}|${e.kind}|${e.tick}|${e.stateHash}`)) !== e.hash) return { ok: false, reason: `ledger entry ${e.seq} does not hash correctly` };
  for (let i = 1; i < w.ledger.recent.length; i++) if (w.ledger.recent[i].prev !== w.ledger.recent[i - 1].hash) return { ok: false, reason: 'ledger chain broken' };
  return { ok: true, reason: `state matches ledger head after ${w.ledger.length} sealed entries` };
}
// Self-healing: restore the newest snapshot whose own hash checks out, replay ticks and logged intents deterministically,
// and certify only if the replayed state reproduces the sealed ledger state hash exactly.
export async function heal(w) {
  const target = w.ledger.stateHash; const targetTick = w.ledger.recent.length ? w.ledger.recent[w.ledger.recent.length - 1].tick : w.tick;
  for (const snap of [...w.snapshots].reverse()) {
    const core = JSON.parse(snap.state);
    if ((await sha256Hex(canonical(core))) !== snap.stateHash) continue;
    const r = { ...core, savedAt: w.savedAt, intents: [], snapshots: w.snapshots.filter((s) => s.tick <= snap.tick), ledger: { ...w.ledger, recent: [...w.ledger.recent] } };
    const its = w.intents.filter((i) => i.tick >= snap.tick);
    const apply = (t) => its.filter((i) => i.tick === t).forEach((i) => { r.intents.push(i); applyIntent(r, i); });
    // intents logged at the snapshot tick but after the snapshot was taken
    apply(snap.tick);
    while (r.tick < targetTick) { stepWorld(r); apply(r.tick); }
    const sh = await stateHash(r);
    if (sh === target) { r.ledger.stateHash = sh; r.chronicle = r.chronicle; note(r, `Self-healing: state restored from the tick-${snap.tick} snapshot and replayed to tick ${targetTick}; replay reproduced the sealed hash.`); await seal(r, 'heal'); return { ok: true, world: r, from: snap.tick }; }
  }
  return { ok: false, world: w, reason: 'no snapshot replays to the sealed state' };
}
export function corrupt(w) { if (w.agents[0]) w.agents[0].e += 0.5; else w.regen += 0.1; return w; }

// ---- persistence and "while you were away"
export const serialise = (w) => JSON.stringify(w);
export const deserialise = (s) => { const w = JSON.parse(s); if (!w || w.app !== 'μLux' || w.v !== 1) throw new Error('not a μLux world'); return w; };
export async function catchUp(w, now, { allowAuto }) {
  if (w.mode === 'manual' || !allowAuto) return 0;
  const n = Math.max(0, Math.min(LIFE.maxCatchUp, Math.floor((now - w.savedAt) / LIFE.tickMs)));
  if (n) { await tick(w, n); note(w, `While you were away the world lived ${n} ticks${n === LIFE.maxCatchUp ? ' (Growth Governor cap)' : ''}.`); await seal(w, 'away'); }
  w.savedAt = now; return n;
}

// ---- vital signs
export function selfModelScore(w, last = LIFE.historyMax) {
  let tp = 0, fp = 0, fn = 0; for (const [a, b, c] of w.selfModel.recent.slice(-last)) { tp += a; fp += b; fn += c; }
  return { tp, fp, fn, precision: tp + fp ? tp / (tp + fp) : 0, recall: tp + fn ? tp / (tp + fn) : 0 };
}
export function vitals(w) {
  const P = w.agents.length; const meanE = P ? w.agents.reduce((s, a) => s + a.e, 0) / P : 0;
  const hist = w.history; const dev = hist.length ? hist.reduce((s, p) => s + Math.abs(p - w.setpoint), 0) / hist.length / w.setpoint : 0;
  const houses = Object.entries(w.lineages).filter(([, n]) => n > 0).length;
  return { tick: w.tick, population: P, setpoint: w.setpoint, regen: w.regen, meanEnergy: meanE, homeostasisDeviation: dev, houses, births: w.births, deaths: w.deaths,
    regenerations: w.regenerations, rules: w.rules.length, pending: w.pending.length, maxGen: P ? Math.max(...w.agents.map((a) => a.gen)) : 0, selfModel: selfModelScore(w), ledgerHead: w.ledger.head, ledgerLength: w.ledger.length };
}
// Strata census of the living world (SSR INTERPRETATION of the nine strata as layers of a world).
export function strataCensus(w) {
  const v = vitals(w);
  return [['M0', 'light field', `${G * G} cells`], ['M1', 'energy', `mean ${v.meanEnergy.toFixed(3)}`], ['M2', 'perception', `${PERCEPTS.length} percepts`],
    ['M3', 'action', `${ACTIONS.length} actions`], ['M4', 'memory', `${w.agents.reduce((s, a) => s + a.mem.length, 0)} remembered experiences`],
    ['M5', 'learned laws', `${v.rules} adopted, ${v.pending} pending`], ['M6', 'self-model', `precision ${(v.selfModel.precision * 100).toFixed(1)} %`],
    ['M7+', 'chronicle', `${w.chronicle.length} entries`], ['M∞', 'the whole world', `ledger ${v.ledgerLength} sealed entries`]];
}
