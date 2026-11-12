// JS port of ogce4/v82/living_world.py (Living Arcana & Discovery). Parity-tested against Python fixtures.
import { PyRandom } from './pyrandom.js';
import { dumps, sha256hex, clone, pyInt, pyStr, cpSlice } from './pyjson.js';

export class WorldError extends Error {}
export const DISCIPLINES = {
  arcana: ['elementalism', 'restoration', 'warding', 'enchantment', 'naturecraft', 'astralism'],
  science: ['physics', 'chemistry', 'biology', 'astronomy', 'ecology', 'archaeology'],
  technology: ['engineering', 'materials', 'energy', 'computing', 'automation', 'transport'],
};
export const SPELLS = {
  ember_bolt: { school: 'elementalism', cost: 8, power: 12, description: 'A simulated burst of ember-light.' },
  verdant_mend: { school: 'restoration', cost: 10, power: 18, description: 'Restores a little vitality through fictional nature magic.' },
  aegis_ward: { school: 'warding', cost: 12, power: 15, description: 'Raises a temporary protective ward.' },
  star_sight: { school: 'astralism', cost: 7, power: 0, description: 'Reveals a symbolic celestial omen.' },
  rune_spark: { school: 'enchantment', cost: 9, power: 10, description: 'Charges a crafted item with a short-lived arcane effect.' },
};
export const TECHS = {
  windmill: { discipline: 'engineering', cost: 12, effects: { energy: 3 }, requires: [] },
  crystal_lens: { discipline: 'materials', cost: 18, effects: { research: 3 }, requires: [] },
  star_charting: { discipline: 'astronomy', cost: 16, effects: { knowledge: 4 }, requires: [] },
  field_medicine: { discipline: 'biology', cost: 20, effects: { health: 5 }, requires: [] },
  automata: { discipline: 'automation', cost: 32, effects: { industry: 5 }, requires: ['windmill', 'crystal_lens'] },
  aether_dynamo: { discipline: 'energy', cost: 40, effects: { energy: 12 }, requires: ['crystal_lens', 'star_charting'] },
  living_architecture: { discipline: 'ecology', cost: 36, effects: { harmony: 8 }, requires: ['field_medicine'] },
  celestial_engine: { discipline: 'astronomy', cost: 55, effects: { energy: 8, knowledge: 8 }, requires: ['aether_dynamo', 'automata'] },
};
const ALIGN = ['Dawn Conjunction', 'Silver Crossing', 'The Wandering Crown', 'Quiet Apogee'];
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const pymod = (a, n) => ((a % n) + n) % n;
const fdiv = (a, b) => Math.floor(a / b);

function safeId(value) {
  const v = pyStr(value === null || value === undefined || value === '' || value === 0 || value === false ? '' : value).trim();
  if (!v || [...v].length > 48 || !/^[\p{L}\p{N}_-]+$/u.test(v)) throw new WorldError("identifier must be 1–48 letters, digits, '_' or '-'");
  return v;
}
const h82 = (body) => sha256hex(dumps(body, { sortKeys: true, ensureAscii: true }));

export class LivingWorld82 {
  constructor(seed = 8200) {
    this.seed = pyInt(seed); this.tick_count = 0; this.revision = 0;
    this.characters = {}; this.research = {}; this.inventions = {};
    this.events = []; this.celestial = { cycle: 0, alignment: 'Dawn Conjunction', omen: 'A season of patient discovery' };
    this.civilization = { energy: 0, research: 0, knowledge: 0, industry: 0, harmony: 50 };
    this.ledger = []; this._valid = true;
  }
  static async create(seed = 8200) { const w = new LivingWorld82(seed); await w._record('world_created', { seed: w.seed }); return w; }
  async _record(kind, payload) {
    const previous = this.ledger.length ? this.ledger[this.ledger.length - 1].hash : '0'.repeat(64);
    const body = { seq: this.ledger.length + 1, tick: this.tick_count, kind, payload, previous };
    this.ledger.push({ ...body, hash: await h82(body) });
  }
  async verifyLedger() {
    let previous = '0'.repeat(64);
    for (const row of this.ledger) {
      const body = { seq: row.seq, tick: row.tick, kind: row.kind, payload: row.payload, previous: row.previous };
      if (row.previous !== previous || row.hash !== (await h82(body))) return false;
      previous = row.hash;
    }
    return true;
  }
  async createCharacter(characterId, name, birthCycle = 0, path = 'hybrid') {
    const cid = safeId(characterId);
    if (has(this.characters, cid)) throw new WorldError('character already exists');
    if (!['arcane', 'scientific', 'hybrid'].includes(path)) throw new WorldError('invalid character path');
    const skills = {}; for (const g of Object.values(DISCIPLINES)) for (const d of g) skills[d] = 0;
    this.characters[cid] = { id: cid, name: cpSlice(pyStr(name), 64) || cid, path, birth_cycle: pymod(pyInt(birthCycle), 12),
      level: 1, xp: 0, health: 100, mana: 60,
      arcane_affinity: ['arcane', 'hybrid'].includes(path) ? 25 : 5,
      scientific_aptitude: ['scientific', 'hybrid'].includes(path) ? 25 : 5,
      skills, spells: path !== 'scientific' ? ['ember_bolt', 'verdant_mend'] : [],
      known_techs: [], discoveries: [], inventory: { aether_crystal: 2, herb: 3, ore: 2 } };
    await this._record('character_created', { id: cid, path });
    return this.character(cid);
  }
  character(cid) { const id = safeId(cid); if (!has(this.characters, id)) throw new WorldError('unknown character'); return clone(this.characters[id]); }
  _get(cid) { const id = safeId(cid); if (!has(this.characters, id)) throw new WorldError('unknown character'); return this.characters[id]; }
  async learnSpell(cid, spell) {
    const c = this._get(cid);
    if (!has(SPELLS, spell)) throw new WorldError('unknown spell');
    if (c.path === 'scientific') throw new WorldError('scientific path must unlock arcane study through hybrid progression');
    if (!c.spells.includes(spell)) { c.spells.push(spell); await this._record('spell_learned', { character: cid, spell }); }
    return this.character(cid);
  }
  async cast(cid, spell, target = null) {
    const c = this._get(cid);
    if (!c.spells.includes(spell) || !has(SPELLS, spell)) throw new WorldError('spell not learned');
    const spec = SPELLS[spell];
    if (c.mana < spec.cost) throw new WorldError('insufficient mana');
    c.mana -= spec.cost;
    const t = target === null || target === undefined || target === '' || target === 0 || target === false ? 'self' : pyStr(target);
    const outcome = { spell, target: cpSlice(t, 64), power: spec.power, effect: spec.description };
    if (spell === 'verdant_mend') c.health = Math.min(100, c.health + spec.power);
    if (spell === 'aegis_ward') c.health = Math.min(100, c.health + fdiv(spec.power, 2));
    if (spell === 'rune_spark') c.inventory.enchanted_shard = (c.inventory.enchanted_shard ?? 0) + 1;
    if (spell === 'star_sight') outcome.omen = this.celestial.omen;
    c.xp += 4; await this._record('spell_cast', { character: cid, ...outcome });
    return { character: this.character(cid), outcome };
  }
  celestialReading(cid) {
    const c = this._get(cid); const cycle = pymod(fdiv(this.tick_count, 5) + c.birth_cycle, 12);
    const signs = ['Dawn', 'Ember', 'Tide', 'Grove', 'Stone', 'Gale', 'Crown', 'Veil', 'Lantern', 'Comet', 'Hearth', 'Horizon'];
    const rng = new PyRandom(this.seed + cycle + fdiv(this.tick_count, 3));
    return { sign: signs[cycle], alignment: ALIGN[pymod(fdiv(this.tick_count, 4), 4)],
      reading: rng.choice(['A bold experiment may open a new path.', 'Tend alliances before seeking distant wonders.', 'A forgotten pattern connects two discoveries.', 'Patience turns scattered clues into knowledge.']),
      gameplay_affinity: { arcana: cycle % 3 === 0 ? 2 : 0, science: cycle % 3 === 1 ? 2 : 0, craft: cycle % 3 === 2 ? 2 : 0 },
      disclaimer: 'Fictional in-world astrology: symbolic narrative and game modifiers only.' };
  }
  async submitHypothesis(cid, title, discipline, hypothesis, method = 'controlled comparison') {
    this._get(cid);
    if (!DISCIPLINES.science.includes(discipline)) throw new WorldError('invalid scientific discipline');
    const rid = 'r' + String(Object.keys(this.research).length + 1).padStart(5, '0');
    this.research[rid] = { id: rid, character: cid, title: cpSlice(pyStr(title), 100), discipline, hypothesis: cpSlice(pyStr(hypothesis), 500),
      method: cpSlice(pyStr(method), 200), status: 'proposed', observations: [], result: null, reproducible: false, tick: this.tick_count };
    await this._record('hypothesis_submitted', { id: rid, discipline });
    return clone(this.research[rid]);
  }
  async experiment(cid, researchId, observation, repeat = false) {
    const c = this._get(cid); const key = pyStr(researchId);
    if (!has(this.research, key)) throw new WorldError('unknown research');
    const r = this.research[key];
    if (r.character !== cid) throw new WorldError('research belongs to another character');
    if (r.observations.length >= 12) throw new WorldError('observation limit reached');
    r.observations.push(cpSlice(pyStr(observation), 300)); r.status = 'observing';
    if (repeat && r.observations.length >= 2) {
      const o = r.observations; r.reproducible = o[o.length - 1] === o[o.length - 2];
      r.status = r.reproducible ? 'supported_in_simulation' : 'inconclusive';
      r.result = r.reproducible ? 'Repeated observation matched.' : 'Repeated observation differed; revise the hypothesis.';
      c.xp += r.reproducible ? 8 : 2;
      if (r.reproducible) { c.discoveries.push(r.title); this.civilization.knowledge += 2; }
    }
    await this._record('experiment_recorded', { research: researchId, repeat: Boolean(repeat), reproducible: r.reproducible });
    return clone(r);
  }
  async invent(cid, techId) {
    const c = this._get(cid);
    if (!has(TECHS, techId)) throw new WorldError('unknown technology');
    const spec = TECHS[techId];
    if (c.known_techs.includes(techId)) return { status: 'already_invented', technology: techId };
    const missing = spec.requires.filter((x) => !c.known_techs.includes(x));
    if (missing.length) throw new WorldError('prerequisites missing: ' + missing.join(', '));
    const skill = c.skills[spec.discipline] ?? 0;
    if (c.xp + skill * 3 < spec.cost) throw new WorldError(`need ${spec.cost} research aptitude points; gain XP or practice ${spec.discipline}`);
    c.known_techs.push(techId); c.xp = Math.max(0, c.xp - fdiv(spec.cost, 2));
    for (const [k, v] of Object.entries(spec.effects)) this.civilization[k] = (this.civilization[k] ?? 0) + v;
    this.inventions[techId] = { inventor: cid, tick: this.tick_count, effects: spec.effects };
    await this._record('technology_invented', { character: cid, technology: techId });
    return { status: 'invented', technology: techId, effects: spec.effects, civilization: { ...this.civilization } };
  }
  async train(cid, discipline, amount = 1) {
    const c = this._get(cid);
    if (!has(c.skills, discipline)) throw new WorldError('unknown discipline');
    amount = Math.max(1, Math.min(10, pyInt(amount))); c.skills[discipline] += amount;
    c.xp += amount * 2; await this._record('skill_trained', { character: cid, discipline, amount });
    return this.character(cid);
  }
  async tick(count = 1) {
    count = Math.max(1, Math.min(100, pyInt(count)));
    for (let i = 0; i < count; i++) {
      this.tick_count += 1; this.celestial.cycle = (this.celestial.cycle + 1) % 12;
      this.celestial.alignment = ALIGN[fdiv(this.tick_count, 4) % 4];
      if (this.tick_count % 5 === 0) {
        this.celestial.omen = this.tick_count % 10 === 0 ? 'The heavens favour careful observation' : 'A rare alignment inspires arcane study';
        for (const c of Object.values(this.characters)) c.mana = Math.min(100, c.mana + 3);
      }
      if (this.tick_count % 12 === 0) {
        this.events.push({ tick: this.tick_count, event: 'Seasonal turning', effect: 'A new cycle begins across the simulated realm.' });
        this.events = this.events.slice(-50);
      }
      await this._record('world_tick', { tick: this.tick_count });
    }
    this.revision += 1;
    return this.snapshot();
  }
  async snapshot() {
    return { version: '8.2.0', seed: this.seed, tick: this.tick_count, revision: this.revision,
      characters: Object.values(this.characters), research: Object.values(this.research),
      inventions: this.inventions, celestial: this.celestial, civilization: this.civilization,
      events: this.events.slice(-10), ledger: { entries: this.ledger.length, valid: await this.verifyLedger(),
        head: this.ledger.length ? this.ledger[this.ledger.length - 1].hash : null },
      fiction_notice: 'Arcana, astrology and supernatural effects are fictional simulations; scientific results describe this game world only.' };
  }
  toRecord() {
    return { seed: this.seed, tick_count: this.tick_count, revision: this.revision, characters: this.characters, research: this.research,
      inventions: this.inventions, events: this.events, celestial: this.celestial, civilization: this.civilization, ledger: this.ledger };
  }
  static async fromRecord(record) {
    const w = await LivingWorld82.create(record.seed ?? 8200);
    for (const k of ['tick_count', 'revision', 'characters', 'research', 'inventions', 'events', 'celestial', 'civilization', 'ledger']) if (has(record, k)) w[k] = record[k];
    if (!(await w.verifyLedger())) throw new WorldError('world ledger integrity failure');
    return w;
  }
}
