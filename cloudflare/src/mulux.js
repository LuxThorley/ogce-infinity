// JS port of ogce4/v80/mulux.py (μLux integration layer). Parity-tested against Python fixtures.
import { PyRandom } from './pyrandom.js';
import { canonical, sha256hex, ValueError } from './pyjson.js';

export const GRADES = ['FACT', 'INFERENCE', 'SPECULATION', 'BELIEF', 'SSR INTERPRETATION', 'OPEN CONJECTURE'];
const RANK = { FACT: 3, INFERENCE: 2, SPECULATION: 1, BELIEF: 1, 'SSR INTERPRETATION': 1, 'OPEN CONJECTURE': 1 };
const ALLOWED = new Set(['compute_local', 'export_file', 'store_local', 'world_autonomy']);
const OWNER = new Set(['publish_certificate', 'deploy']);
const DENIED = new Set(['post_social', 'send_message', 'spend', 'execute_binary', 'label_as_source_communication']);

export function decide(action, policyValid = true, ownerYes = false) {
  if (!policyValid) return { decision: 'deny', reason: 'policy unavailable (fail-closed)' };
  if (DENIED.has(action)) return { decision: 'deny', reason: 'explicitly denied' };
  if (ALLOWED.has(action)) return { decision: 'allow', reason: 'explicitly allowed' };
  if (OWNER.has(action)) return { decision: ownerYes ? 'allow' : 'needs_owner_yes', reason: 'explicit owner approval required' };
  return { decision: 'deny', reason: 'unknown action (default deny)' };
}

const sortStr = (arr) => [...arr].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
export function leastFixedPoint(atoms, rules, axioms = [], maxSteps = 144000, maxAtoms = 144000) {
  if (!Array.isArray(atoms) || !Array.isArray(rules) || !Array.isArray(axioms)) throw new TypeError('atoms, rules and axioms must be lists');
  const universe = new Set(atoms);
  if (universe.size > maxAtoms) throw new ValueError('growth_governor_max_atoms');
  const compiled = [];
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') throw new TypeError('rule must be an object');
    const head = rule.then; const body = rule.if === undefined ? [] : rule.if;
    if (!universe.has(head) || !Array.isArray(body) || body.some((x) => !universe.has(x))) throw new ValueError('invalid_rule_atom');
    compiled.push([head, body]);
  }
  let current = new Set(); const trace = [];
  for (let step = 0; step <= maxSteps; step++) {
    const nxt = new Set(current);
    if (step === 0) for (const x of axioms) if (universe.has(x)) nxt.add(x);
    for (const [head, body] of compiled) if (body.every((x) => current.has(x))) nxt.add(head);
    trace.push({ step, size: nxt.size, added: sortStr([...nxt].filter((x) => !current.has(x))) });
    if (nxt.size === current.size && [...nxt].every((x) => current.has(x))) return { closure: sortStr(current), steps: step, trace, converged: true };
    current = nxt;
    if (current.size > maxAtoms) throw new ValueError('growth_governor_max_atoms');
  }
  throw new ValueError('growth_governor_max_steps');
}

export function gradeClaim(text, evidence = [], requested = 'OPEN CONJECTURE') {
  evidence = Array.isArray(evidence) && evidence.length ? evidence : [];
  if (!GRADES.includes(requested)) requested = 'OPEN CONJECTURE';
  const kinds = new Set(evidence.map((e) => (e && typeof e === 'object' ? e.kind : undefined)));
  const support = ['proof', 'computation', 'citation', 'measurement'].some((k) => kinds.has(k)) ? 3 : (kinds.has('premise') ? 2 : 0);
  let displayed = requested;
  if (RANK[requested] > support) displayed = support === 0 ? 'OPEN CONJECTURE' : (support === 2 ? 'INFERENCE' : 'FACT');
  const checks = {
    medical_advice: /\b(cure|diagnose|treats? disease)\b/i,
    future_prediction: /\b(will definitely|guaranteed future|certainly happen)\b/i,
    supernatural_efficacy: /\b(proven supernatural|miracle cure)\b/i,
    source_communication_claim: /\b(received from source|validated source communication)\b/i,
  };
  const flags = Object.entries(checks).filter(([, re]) => re.test(text)).map(([n]) => n);
  return { text, requested_grade: requested, grade: displayed, evidence, evidence_rank: support, flags };
}

const agent = (id, x, y, energy = 1.0, age = 0, memory = null, genome = null, alive = true) => ({ id, x, y, energy, age, memory, genome, alive });

export class LivingWorld {
  // Use LivingWorld.create(seed) (async because SHA-256 is async in Workers).
  constructor(seed = 144, width = 12, height = 12, targetPopulation = 24, maxAgents = 1440) {
    this.seed = seed; this.rng = new PyRandom(seed);
    this.width = width; this.height = height; this.target_population = targetPopulation; this.max_agents = maxAgents;
    this.tick_count = 0;
    this.food = Array.from({ length: height }, () => Array.from({ length: width }, () => this.rng.random()));
    this.agents = [];
    for (let i = 0; i < Math.min(12, maxAgents); i++) {
      const x = this.rng.randrange(width), y = this.rng.randrange(height);
      this.agents.push(agent(i, x, y, 1.0, 0, [], [{ if: ['hungry'], then: 'harvest' }]));
    }
    this.learned_rules = []; this.ledger = [];
  }
  static async create(seed = 144) { const w = new LivingWorld(seed); await w._append('genesis', { seed, agents: w.agents.length }); return w; }
  async _append(kind, payload) {
    const previous = this.ledger.length ? this.ledger[this.ledger.length - 1].hash : '0'.repeat(64);
    const body = { seq: this.ledger.length, tick: this.tick_count, kind, payload, previous };
    body.hash = await sha256hex(canonical(body));
    this.ledger.push(body);
  }
  get population() { return this.agents.reduce((n, a) => n + (a.alive ? 1 : 0), 0); }
  async tick(count = 1) {
    if (!Number.isInteger(count) || count < 1 || count > 1440) throw new ValueError('tick_count_out_of_bounds');
    const moves = [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]];
    for (let t = 0; t < count; t++) {
      this.tick_count += 1;
      for (const row of this.food) for (let x = 0; x < this.width; x++) row[x] = Math.min(1.0, row[x] + 0.015);
      const births = [];
      for (const a of this.agents) {
        if (!a.alive) continue;
        a.age += 1;
        const hungry = a.energy < 0.55;
        a.memory = [...(a.memory || []).slice(-11), hungry ? 'hungry' : 'sated'];
        if (hungry && this.food[a.y][a.x] > 0.05) {
          const amount = Math.min(0.22, this.food[a.y][a.x]);
          this.food[a.y][a.x] -= amount;
          a.energy = Math.min(1.5, a.energy + amount * 1.8);
        } else {
          const [dx, dy] = this.rng.choice(moves);
          a.x = (((a.x + dx) % this.width) + this.width) % this.width;
          a.y = (((a.y + dy) % this.height) + this.height) % this.height;
          a.energy -= 0.025;
        }
        if (a.energy <= 0) a.alive = false;
        else if (a.energy > 1.15 && this.agents.length + births.length < this.max_agents && this.rng.random() < 0.035) {
          const maxId = Math.max(...this.agents.map((x) => x.id), 0);
          births.push(agent(maxId + births.length + 1, a.x, a.y, 0.65, 0, [], [...(a.genome || [])]));
          a.energy *= 0.58;
        }
      }
      this.agents.push(...births);
      if (this.tick_count % 12 === 0) {
        const active = this.population;
        this.learned_rules = active ? [{ if: ['hungry'], then: 'harvest' }] : [];
        await this._append('ecology_checkpoint', { active, births: births.length, learned_rules: this.learned_rules });
      }
    }
    await this._append('tick', { count, active: this.population });
    return this.snapshot();
  }
  snapshot() {
    return { seed: this.seed, tick: this.tick_count, population: this.population,
      agents: this.agents.map((a) => ({ id: a.id, x: a.x, y: a.y, energy: a.energy, age: a.age, memory: a.memory, genome: a.genome, alive: a.alive })),
      food: this.food, learned_rules: this.learned_rules,
      ledger_head: this.ledger.length ? this.ledger[this.ledger.length - 1].hash : null };
  }
  static fromRecord(record) {
    const snap = record.state; const w = new LivingWorld(parseInt(record.seed, 10));
    w.tick_count = parseInt(record.tick, 10);
    w.food = snap.food ?? w.food; w.learned_rules = snap.learned_rules ?? [];
    w.agents = (snap.agents ?? []).map((a) => agent(a.id, a.x, a.y, a.energy ?? 1.0, a.age ?? 0, a.memory ?? null, a.genome ?? null, a.alive ?? true));
    w.ledger = record.ledger ?? [];
    return w;
  }
  async verifyLedger() {
    let previous = '0'.repeat(64);
    for (let i = 0; i < this.ledger.length; i++) {
      const ev = this.ledger[i]; const body = {};
      for (const [k, v] of Object.entries(ev)) if (k !== 'hash') body[k] = v;
      if (ev.seq !== i || ev.previous !== previous || (await sha256hex(canonical(body))) !== ev.hash) return { valid: false, at: i };
      previous = ev.hash;
    }
    return { valid: true, events: this.ledger.length, head: previous };
  }
  async exportReceipt() {
    const payload = { seed: this.seed, tick: this.tick_count, population: this.population, ledger_head: this.ledger.length ? this.ledger[this.ledger.length - 1].hash : null };
    return { kind: 'ogce.mulux.world_snapshot', payload, sha256: await sha256hex(canonical(payload)), created_at: Math.floor(Date.now() / 1000) };
  }
}
