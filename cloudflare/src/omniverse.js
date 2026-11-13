// Strata: Lux Genesis omniverse: exact JS port of ogce4/v90/omniverse.py (integer-only, parity-tested).
// Simulated life: creatures, plants and characters follow simple seeded rules; they are not alive or aware.
import OMNI from '../../ogce4/v90/omni.json' with { type: 'json' };
import { V90Error } from './v90.js';

export { OMNI };
export class OmniError extends V90Error {}
export const CH = OMNI.chunk, HAB = OMNI.habitat, MAX_STEPS = 24, MAX_CUSTOM_REALMS = 8;
export const REALMS = Object.fromEntries(OMNI.realms.map((r) => [r.id, r]));
export const SPECIES = ['duskwolf', 'glowmoth', 'mossback'];
const fdiv = (a, b) => Math.floor(a / b);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function mix32(a) {
  a >>>= 0; a ^= a >>> 16; a = Math.imul(a, 0x7feb352d) >>> 0; a ^= a >>> 15; a = Math.imul(a, 0x846ca68b) >>> 0; a ^= a >>> 16; return a >>> 0;
}
export function h3(seed, x, y) {
  return mix32(((seed >>> 0) ^ mix32((Math.imul(x, 73856093) >>> 0) ^ mix32((Math.imul(y, 19349663) + 83492791) >>> 0))) >>> 0);
}
export function seedOf(text) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(text)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h >>> 0;
}
export function noise(seed, x, y, scale) {
  const gx = fdiv(x, scale), gy = fdiv(y, scale), fx = x - gx * scale, fy = y - gy * scale;
  const v00 = h3(seed, gx, gy) & 1023, v10 = h3(seed, gx + 1, gy) & 1023, v01 = h3(seed, gx, gy + 1) & 1023, v11 = h3(seed, gx + 1, gy + 1) & 1023;
  const top = v00 * (scale - fx) + v10 * fx, bot = v01 * (scale - fx) + v11 * fx;
  return fdiv(top * (scale - fy) + bot * fy, scale * scale);
}
export function realmOf(id, custom) {
  if (has(REALMS, id)) return REALMS[id];
  if (custom && has(custom, id)) return custom[id];
  throw new OmniError('unknown_realm');
}
export function sample(realm, x, y) {
  const s = realm.seed;
  let h = fdiv(2 * noise(s, x, y, 32) + noise(s + 1, x, y, 12) + noise(s + 2, x, y, 5), 4) + realm.hbias;
  if (x * x + y * y < 400) h = Math.max(h, 470 + (20 - fdiv(Math.abs(x) + Math.abs(y), 2)));
  let m = noise(s + 7, x, y, 40) + realm.mbias, t = noise(s + 13, x, y, 64) + realm.tbias;
  if (x * x + y * y < 400) { t = Math.max(t, 420 + fdiv(realm.tbias, 2)); m = Math.max(m, 380); }
  if (h < 380) return ['O', h];
  if (h < 420) return ['B', h];
  if (h > 800) return [t < 520 ? 'T' : 'P', h];
  if (realm.special === 'lux' && noise(s + 21, x, y, 18) > 640) return ['L', h];
  if (noise(s + 21, x, y, 20) > 760) return ['C', h];
  if (t < 230) return ['T', h];
  if (m < 330 && t > 520) return ['D', h];
  if (m > 560) return ['F', h];
  return ['M', h];
}
export function naturalFeature(realm, biome, x, y) {
  const r = h3(realm.seed + 99, x, y) % 1000;
  for (const [kind, limit] of OMNI.features[biome]) if (r < limit) return kind;
  return null;
}
export function featureAt(realm, deltas, x, y, tick) {
  const biome = sample(realm, x, y)[0];
  const d = deltas[`${x},${y}`];
  if (d) {
    const [kind, at] = d;
    if (kind === '-') { if (tick - at < OMNI.regrow) return null; }
    else { const grow = OMNI.grows[kind]; if (grow && tick - at >= grow[1]) return grow[0]; return kind; }
  }
  return naturalFeature(realm, biome, x, y);
}
const LANTERNS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh'];
export function chunk(realm, cx, cy, lod = 0, deltas = null, tick = 0, difficulty = 1, density = 1) {
  deltas = deltas || {};
  const out = { realm: realm.id, cx, cy, lod }, x0 = cx * CH, y0 = cy * CH;
  if (lod >= 2) {
    const counts = {};
    for (let j = 0; j < CH; j += 4) for (let i = 0; i < CH; i += 4) { const b = sample(realm, x0 + i + 2, y0 + j + 2)[0]; counts[b] = (counts[b] || 0) + 1; }
    out.biome = Object.entries(counts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0][0];
    return out;
  }
  const step = lod === 0 ? 1 : 4, tiles = [], heights = [];
  for (let j = 0; j < CH; j += step) for (let i = 0; i < CH; i += step) { const [b, h] = sample(realm, x0 + i + fdiv(step, 2), y0 + j + fdiv(step, 2)); tiles.push(b); heights.push(h >> 4); }
  out.tiles = tiles.join(''); out.heights = heights;
  if (lod === 0) {
    const feats = [];
    for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) { const f = featureAt(realm, deltas, x0 + i, y0 + j, tick); if (f) feats.push([x0 + i, y0 + j, f]); }
    out.features = feats;
    let poi = null;
    if (h3(realm.seed + 555, cx, cy) % 13 === 0) {
      const px = x0 + 4 + h3(realm.seed + 556, cx, cy) % 8, py = y0 + 4 + h3(realm.seed + 557, cx, cy) % 8;
      if (sample(realm, px, py)[0] !== 'O') poi = { x: px, y: py, kind: 'ruin', name: `Ruin of the ${LANTERNS[h3(realm.seed, cx, cy) % 7]} Lantern` };
    }
    out.poi = poi;
    const spawns = [], n = Math.min(4, h3(realm.seed + 31, cx, cy) % 3 + density + fdiv(difficulty, 3) - 1);
    for (let k = 0; k < Math.max(0, n); k++) {
      const sx = x0 + h3(realm.seed + 40 + k, cx, cy) % CH, sy = y0 + h3(realm.seed + 60 + k, cx, cy) % CH;
      if (sample(realm, sx, sy)[0] === 'O') continue;
      spawns.push({ id: `w${cx}_${cy}_${k}`, species: SPECIES[h3(realm.seed + 80 + k, cx, cy) % 3], x: sx, y: sy, hue: h3(realm.seed + 90 + k, cx, cy) % 360 });
    }
    out.spawns = spawns;
  }
  return out;
}

// ---------------------------------------------------------------- ecology
export function newEcology(realm) {
  const s = realm.seed, plants = {};
  for (let k = 0; k < 140; k++) { const x = h3(s + 200, k, 1) % HAB, y = h3(s + 201, k, 2) % HAB; plants[`${x},${y}`] = h3(s + 202, k, 3) % 4; }
  const creatures = []; let nid = 1;
  for (const [sp, count] of [['mossback', 18], ['duskwolf', 4], ['glowmoth', 8]]) {
    const base = OMNI.species[sp].base;
    for (let k = 0; k < count; k++) {
      const r = h3(s + 300, nid, 0);
      creatures.push({ id: nid, sp, x: r % HAB, y: (r >>> 8) % HAB, e: 60 + r % 30, age: (r >>> 16) % 20, gen: 0, t: [base[0], base[1], base[2], (r >>> 4) % 360], mem: [-1, -1], cd: 0 });
      nid++;
    }
  }
  return { realm: realm.id, tick: 0, next: nid, plants, creatures, log: [], policy: { predator_cap: 12 }, births: 0, deaths: 0, caught: 0 };
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a, x, y) => Math.abs(a.x - x) + Math.abs(a.y - y);
const sgn = (a, b) => (a > b) - (a < b);
function toward(c, tx, ty, steps, away = false) {
  for (let k = 0; k < steps; k++) {
    let dx = sgn(tx, c.x), dy = sgn(ty, c.y);
    if (away) { dx = -dx || 1; dy = -dy || 1; }
    if ((k + c.id) % 2 === 0 && dx) c.x = clamp(c.x + dx, 0, HAB - 1);
    else if (dy) c.y = clamp(c.y + dy, 0, HAB - 1);
    else if (dx) c.x = clamp(c.x + dx, 0, HAB - 1);
  }
}
function log(eco, text) { eco.log.push([eco.tick, text]); eco.log = eco.log.slice(-30); }
const byNear = (c) => (a, b) => (dist(c, a.x, a.y) - dist(c, b.x, b.y)) || (a.id - b.id);
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function ecoStep(eco, seed) {
  eco.tick += 1;
  const t = eco.tick, plants = eco.plants, alive = [...eco.creatures].sort((a, b) => a.id - b.id), gone = new Set(), born = [];
  const counts = Object.fromEntries(SPECIES.map((sp) => [sp, 0]));
  for (const c of alive) counts[c.sp] += 1;
  const caps = Object.fromEntries(SPECIES.map((sp) => [sp, OMNI.species[sp].cap]));
  caps.duskwolf = eco.policy.predator_cap ?? caps.duskwolf;
  const sx = (seed ^ t) >>> 0;
  for (const c of alive) {
    if (gone.has(c.id)) continue;
    const rng = h3(sx, c.id, 7), [speed, size, sense] = c.t;
    c.age += 1; c.cd = Math.max(0, c.cd - 1);
    c.e -= 1 + fdiv(size, 2) + fdiv(speed, 3);
    const near = alive.filter((o) => o.id !== c.id && !gone.has(o.id) && dist(c, o.x, o.y) <= sense);
    let threat = null, food = null, mate = null;
    if (c.sp === 'mossback') { const w = near.filter((o) => o.sp === 'duskwolf').sort(byNear(c)); threat = w[0] || null; }
    if (c.sp === 'duskwolf') { const p = near.filter((o) => o.sp === 'mossback').sort(byNear(c)); food = p.length ? [p[0].x, p[0].y, p[0]] : null; }
    else {
      const need = c.sp === 'glowmoth' ? 3 : 1; let best = null;
      for (let dy = -sense; dy <= sense; dy++) {
        const rem = sense - Math.abs(dy);
        for (let dx = -rem; dx <= rem; dx++) {
          const x = c.x + dx, y = c.y + dy, st = plants[`${x},${y}`];
          if (st !== undefined && st >= need) {
            const key = [Math.abs(dx) + Math.abs(dy), y, x];
            if (!best || key[0] < best[0][0] || (key[0] === best[0][0] && (key[1] < best[0][1] || (key[1] === best[0][1] && key[2] < best[0][2])))) best = [key, x, y];
          }
        }
      }
      food = best ? [best[1], best[2], null] : null;
    }
    if (c.e >= 60 && c.age >= 12 && c.cd === 0 && counts[c.sp] < caps[c.sp]) {
      const ms = near.filter((o) => o.sp === c.sp && o.e >= 60 && o.age >= 12 && o.cd === 0).sort(byNear(c)); mate = ms[0] || null;
    }
    const hunger = 100 - c.e;
    const scores = [['flee', threat ? 400 : 0], ['eat', food ? hunger * 3 : (c.mem[0] >= 0 ? 60 + hunger : 0)], ['mate', mate ? 200 : 0],
      ['rest', c.e < 20 && !food ? 50 : 0], ['wander', 30 + rng % 20]];
    let act = scores[0]; for (const s of scores) if (s[1] > act[1]) act = s;
    act = act[0];
    if (act === 'flee') toward(c, threat.x, threat.y, speed, true);
    else if (act === 'eat') {
      const [tx, ty] = food ? [food[0], food[1]] : [c.mem[0], c.mem[1]];
      toward(c, tx, ty, speed);
      if (food && dist(c, tx, ty) <= 1) {
        if (c.sp === 'duskwolf') {
          const prey = food[2];
          if (speed + rng % 3 - (eco.policy.calm ?? 0) >= prey.t[0] + (rng >>> 4) % 3) {
            gone.add(prey.id); counts.mossback -= 1; c.e = Math.min(100, c.e + 70); eco.caught += 1;
            if (eco.caught % 5 === 1) log(eco, 'A Duskwolf caught a Mossback.');
          }
        } else {
          const key = `${tx},${ty}`, st = plants[key];
          if (c.sp === 'glowmoth') {
            c.e = Math.min(100, c.e + 12);
            const nx = clamp(tx + rng % 3 - 1, 0, HAB - 1), ny = clamp(ty + (rng >>> 3) % 3 - 1, 0, HAB - 1);
            if (!has(plants, `${nx},${ny}`) && Object.keys(plants).length < 500) plants[`${nx},${ny}`] = 0;
          } else { c.e = Math.min(100, c.e + 10 * st + 5); plants[key] = 0; }
          c.mem = [tx, ty];
        }
      } else if (!food && dist(c, tx, ty) === 0) c.mem = [-1, -1];
    } else if (act === 'mate') {
      toward(c, mate.x, mate.y, speed);
      if (dist(c, mate.x, mate.y) <= 1) {
        const kt = [];
        for (let i = 0; i < 3; i++) { const mut = h3(sx, c.id * 31 + mate.id, i) % 3 - 1; kt.push(clamp(fdiv(c.t[i] + mate.t[i], 2) + mut, 1, i === 2 ? 8 : 5)); }
        kt.push(fdiv(c.t[3] + mate.t[3], 2) % 360);
        born.push({ id: eco.next, sp: c.sp, x: c.x, y: c.y, e: 50, age: 0, gen: Math.max(c.gen, mate.gen) + 1, t: kt, mem: [-1, -1], cd: 8 });
        eco.next += 1; counts[c.sp] += 1; c.e -= 30; mate.e -= 30; c.cd = mate.cd = 10; eco.births += 1;
        if (eco.births % 4 === 1) log(eco, `A young ${OMNI.species[c.sp].name} hatched (generation ${born[born.length - 1].gen}).`);
      }
    } else if (act === 'wander') toward(c, rng % HAB, (rng >>> 8) % HAB, 1);
    if (c.e <= 0 || c.age > 120 + size * 10) { gone.add(c.id); counts[c.sp] -= 1; eco.deaths += 1; }
  }
  eco.creatures = alive.filter((c) => !gone.has(c.id)).concat(born);
  for (const key of Object.keys(plants).sort(cmpStr)) {
    const st = plants[key], [x, y] = key.split(',').map(Number), r = h3(sx, x, y + 5000);
    if (st < 3) { if (r % 100 < 30 + (eco.policy.growth_bonus ?? 0)) plants[key] = st + 1; }
    else if (r % 100 < 6 + (eco.policy.spread_bonus ?? 0) && Object.keys(plants).length < 500) {
      const nx = clamp(x + (r >>> 8) % 3 - 1, 0, HAB - 1), ny = clamp(y + (r >>> 12) % 3 - 1, 0, HAB - 1);
      if (!has(plants, `${nx},${ny}`)) plants[`${nx},${ny}`] = 0;
    }
  }
  for (const sp of SPECIES) {
    if (eco.creatures.filter((c) => c.sp === sp).length < 2 && t % 20 === 0) {
      const base = OMNI.species[sp].base;
      for (let k = 0; k < 2; k++) { eco.creatures.push({ id: eco.next, sp, x: k * (HAB - 1), y: fdiv(HAB, 2), e: 70, age: 12, gen: 0, t: [base[0], base[1], base[2], 30 + k * 40], mem: [-1, -1], cd: 0 }); eco.next += 1; }
      log(eco, `${OMNI.species[sp].name}s wandered in from the next stratum.`);
    }
  }
  return eco;
}
export function evolve(eco, realm, toTick) { let n = 0; while (eco.tick < toTick && n < MAX_STEPS) { ecoStep(eco, realm.seed); n++; } return n; }
export function census(eco) {
  const out = {};
  for (const sp of SPECIES) {
    const cs = eco.creatures.filter((c) => c.sp === sp), n = cs.length, avg = (i) => (n ? fdiv(cs.reduce((a, c) => a + c.t[i], 0) * 10, n) : 0);
    out[sp] = { count: n, speed: avg(0), size: avg(1), sense: avg(2), max_gen: cs.reduce((a, c) => Math.max(a, c.gen), 0) };
  }
  out.plants = Object.keys(eco.plants).length;
  out.flowering = Object.values(eco.plants).filter((v) => v === 3).length;
  return out;
}
export function ecoView(eco) {
  return { realm: eco.realm, tick: eco.tick, habitat: HAB, census: census(eco), log: eco.log.slice(-10), policy: eco.policy,
    creatures: [...eco.creatures].sort((a, b) => a.id - b.id).map((c) => [c.id, c.sp, c.x, c.y, c.e, c.gen, c.t[3]]),
    plants: Object.keys(eco.plants).sort(cmpStr).map((k) => { const [x, y] = k.split(',').map(Number); return [x, y, eco.plants[k]]; }),
    births: eco.births, deaths: eco.deaths, caught: eco.caught, label: OMNI.label };
}

// ---------------------------------------------------------------- explorer, NPCs, factions, endings
export function newExplorer() {
  return { realm: 'aurelia', x: 0, y: 0, bag: {}, tools: [], rep: Object.fromEntries(Object.keys(OMNI.factions).map((f) => [f, 0])), npc: {}, flags: [], quests: [],
    bestiary: [], explored: [], appearance: { skin: 1, hair: 1, outfit: 0, hat: 0, cape: 0 }, ending: null, custom_realms: {}, inventions: [], perks: {}, attempts: 0 };
}
const kindOf = (v) => (v === null ? 'none' : Array.isArray(v) ? 'list' : typeof v === 'number' ? (Number.isInteger(v) ? 'int' : 'float') : typeof v === 'boolean' ? 'bool' : typeof v === 'object' ? 'dict' : typeof v);
export function normExplorer(p) {
  const base = newExplorer();
  if (p && kindOf(p) === 'dict') for (const [k, v] of Object.entries(p)) if ((has(base, k) && kindOf(v) === kindOf(base[k])) || (k === 'ending' && (v === null || typeof v === 'string'))) base[k] = v;
  return base;
}
const relTier = (rel) => (rel < 15 ? 0 : rel < 40 ? 1 : 2);
const TIPS = ['The Wildwood changes every day; check the census.', 'Creatures pass their traits to their young. Watch the averages shift.',
  'Every stratum is seeded: same seed, same land.', 'Gifts I like make me trust you more.'];
export function npcLine(npcId, rel, times, seed) {
  const npc = OMNI.npcs[npcId];
  return `${npc.greet[relTier(rel)]} ${TIPS[h3(seed, times, npcId.length) % TIPS.length]}`;
}
const hasAll = (bag, needs) => Object.entries(needs).every(([k, v]) => (bag[k] || 0) >= v);
function pay(bag, needs) { for (const [k, v] of Object.entries(needs)) { bag[k] -= v; if (bag[k] <= 0) delete bag[k]; } }
function visit(p, realmId, x, y) { const key = `${realmId}:${fdiv(x, CH)},${fdiv(y, CH)}`; if (!p.explored.includes(key) && p.explored.length < 5000) p.explored.push(key); }
export function endingFor(p) {
  if (Object.values(p.rep).every((v) => v >= 10)) return 'accord';
  return Object.entries(p.rep).sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0]))[0][0];
}
const choiceList = (p, n) => n.choices.map((c, i) => ({ i, label: c.label, locked: !(c.require || []).every((f) => p.flags.includes(f)) }));
export function talk(p, npcId, node = 'start', choice = null, seed = 0) {
  if (!has(OMNI.npcs, npcId)) throw new OmniError('unknown_npc');
  const npc = OMNI.npcs[npcId];
  if (Math.abs(p.x - npc.x) + Math.abs(p.y - npc.y) > 3 || p.realm !== 'aurelia') throw new OmniError('too_far');
  if (!has(p.npc, npcId)) p.npc[npcId] = { rel: 0, times: 0, last: null, gifts: 0 };
  const mem = p.npc[npcId], flag = `met_${npcId}`;
  if (!p.flags.includes(flag)) p.flags.push(flag);
  if (!has(npc.nodes, node)) throw new OmniError('unknown_node');
  const out = { npc: npcId, name: npc.name, faction: npc.faction };
  const n = npc.nodes[node];
  if (choice === null || choice === undefined) {
    mem.times += 1;
    if (p.inventions.length) out.remark = npcRemark(npcId, p.inventions[p.inventions.length - 1]);
    Object.assign(out, { node, line: npcLine(npcId, mem.rel, mem.times, seed), text: n.text, choices: choiceList(p, n) });
    return out;
  }
  if (!Number.isInteger(choice) || choice < 0 || choice >= n.choices.length) throw new OmniError('bad_choice');
  const c = n.choices[choice];
  if (!(c.require || []).every((f) => p.flags.includes(f))) throw new OmniError('choice_locked');
  for (const [f, d] of Object.entries(c.rep || {})) p.rep[f] = clamp(p.rep[f] + d, -100, 100);
  if (((c.rep || {})[npc.faction] || 0) > 0) mem.rel = clamp(mem.rel + c.rep[npc.faction], -100, 100);
  if (c.flag && !p.flags.includes(c.flag)) p.flags.push(c.flag);
  if (c.quest && !p.quests.includes(c.quest)) p.quests.push(c.quest);
  mem.last = `${node}:${choice}`;
  out.policy = c.policy ?? null;
  if (c.flag === 'council') { p.ending = endingFor(p); out.ending = { id: p.ending, ...OMNI.endings[p.ending] }; }
  if (c.next !== 'end') { const nn = npc.nodes[c.next]; Object.assign(out, { node: c.next, text: nn.text, choices: choiceList(p, nn) }); }
  else Object.assign(out, { node: 'end', text: '', choices: [] });
  out.rep = { ...p.rep };
  return out;
}
export function gift(p, npcId, item) {
  if (!has(OMNI.npcs, npcId)) throw new OmniError('unknown_npc');
  if ((p.bag[item] || 0) < 1) throw new OmniError('missing_item');
  const npc = OMNI.npcs[npcId]; pay(p.bag, { [item]: 1 });
  if (!has(p.npc, npcId)) p.npc[npcId] = { rel: 0, times: 0, last: null, gifts: 0 };
  const mem = p.npc[npcId], liked = npc.likes.includes(item), gain = liked ? 8 : 2;
  mem.rel = clamp(mem.rel + gain, -100, 100); mem.gifts += 1;
  p.rep[npc.faction] = clamp(p.rep[npc.faction] + fdiv(gain, 2), -100, 100);
  return { npc: npcId, liked, rel: mem.rel };
}
const isInt = (v) => Number.isInteger(v);
export function explorerAct(p, op, body, realm, deltas, tick, eco, seed = 0) {
  if (op === 'move') {
    const { x, y } = body;
    if (!isInt(x) || !isInt(y)) throw new OmniError('bad_position');
    if (Math.abs(x - p.x) + Math.abs(y - p.y) > 12 + (p.perks.stride || 0)) throw new OmniError('too_far');
    if (Math.abs(x) > 1000000 || Math.abs(y) > 1000000) throw new OmniError('edge_of_strata');
    if (sample(realm, x, y)[0] === 'O' && !p.flags.includes('boat')) throw new OmniError('water');
    p.x = x; p.y = y; visit(p, realm.id, x, y);
    return { x, y, biome: sample(realm, x, y)[0] };
  }
  if (op === 'travel') {
    if (!has(REALMS, realm.id) && !has(p.custom_realms, realm.id)) throw new OmniError('unknown_realm');
    p.realm = realm.id; p.x = 0; p.y = 0; visit(p, realm.id, 0, 0);
    return { realm: realm.id, name: realm.name };
  }
  if (op === 'harvest') {
    const { x, y } = body;
    if (!isInt(x) || !isInt(y) || Math.abs(x - p.x) + Math.abs(y - p.y) > 2 + (p.perks.reach || 0)) throw new OmniError('too_far');
    const f = featureAt(realm, deltas, x, y, tick), item = OMNI.harvest[f || ''];
    if (!item) throw new OmniError('nothing_to_harvest');
    let n = (item === 'wood' && p.tools.includes('axe')) || ((item === 'stone' || item === 'crystal') && p.tools.includes('pickaxe')) ? 2 : 1;
    n += p.perks['yield:' + item] || 0;
    if ((p.perks.boost || 0) > 0) { n *= 2; p.perks.boost -= 1; }
    p.bag[item] = (p.bag[item] || 0) + n; deltas[`${x},${y}`] = ['-', tick];
    return { item, count: n, regrows_in: OMNI.regrow };
  }
  if (op === 'place') {
    const { kind, x, y } = body;
    if (typeof kind === 'string' && kind.startsWith('inv:')) return placeInvention(p, kind, x, y, realm, deltas, tick, eco);
    const cost = has(OMNI.place, typeof kind === 'string' ? kind : '') ? OMNI.place[kind] : null;
    if (cost == null) throw new OmniError('unknown_build');
    if (!isInt(x) || !isInt(y) || Math.abs(x - p.x) + Math.abs(y - p.y) > 2) throw new OmniError('too_far');
    if (featureAt(realm, deltas, x, y, tick) || sample(realm, x, y)[0] === 'O') throw new OmniError('occupied');
    if (!hasAll(p.bag, cost)) throw new OmniError('missing_resources');
    pay(p.bag, cost); deltas[`${x},${y}`] = [kind, tick];
    return { placed: kind, x, y };
  }
  if (op === 'craft') {
    const name = typeof body.recipe === 'string' ? body.recipe : '', r = has(OMNI.recipes, name) ? OMNI.recipes[name] : null;
    if (!r) throw new OmniError('unknown_recipe');
    if (!hasAll(p.bag, r.needs)) throw new OmniError('missing_resources');
    pay(p.bag, r.needs);
    if (r.kind === 'tool' || r.kind === 'weapon') { if (!p.tools.includes(name)) p.tools.push(name); } else p.bag[name] = (p.bag[name] || 0) + 1;
    return { crafted: name, kind: r.kind };
  }
  if (op === 'observe') {
    if (!eco) throw new OmniError('no_habitat');
    const c = eco.creatures.find((q) => q.id === body.creature);
    if (!c) throw new OmniError('unknown_creature');
    const tagged = p.tools.includes('field_net'), entry = tagged ? `${c.sp}:g${c.gen}` : c.sp;
    if (!p.bestiary.includes(entry) && p.bestiary.length < 400) p.bestiary.push(entry);
    const out = { species: c.sp, gen: c.gen, traits: { speed: c.t[0], size: c.t[1], sense: c.t[2] }, energy: c.e, tagged };
    if (p.perks.insight) out.hidden = { age: c.age, memory: [...c.mem], hue: c.t[3] };
    return out;
  }
  if (op === 'customise') {
    const a = body.appearance;
    if (kindOf(a) !== 'dict') throw new OmniError('bad_appearance');
    for (const [k, v] of Object.entries(a)) if (!has(OMNI.appearance, k) || !isInt(v) || v < 0 || v >= OMNI.appearance[k].length) throw new OmniError('bad_appearance');
    Object.assign(p.appearance, a);
    return { appearance: { ...p.appearance } };
  }
  if (op === 'invent') return invent(p, body, seed, tick, eco);
  if (op === 'use') return useInvention(p, body.item);
  if (op === 'create_realm') {
    const name = String(body.name ?? '').slice(0, 40).trim();
    if (!name || Object.keys(p.custom_realms).length >= MAX_CUSTOM_REALMS) throw new OmniError('bad_realm');
    const [warmth, wet, height] = ['warmth', 'wetness', 'height'].map((k) => clamp(isInt(body[k] ?? 0) ? (body[k] ?? 0) : 0, -3, 3));
    const rid = `c${seedOf(name + String(body.seed ?? '')) % 1000000}`;
    p.custom_realms[rid] = { id: rid, name, seed: seedOf(String(body.seed ?? name)), hbias: height * 40, mbias: wet * 90, tbias: warmth * 110,
      special: body.lux === true ? 'lux' : 'crystal', blurb: 'A stratum you seeded yourself.' };
    return { realm: p.custom_realms[rid] };
  }
  throw new OmniError('unknown_omni_operation');
}
export function explorerView(p) {
  return { realm: p.realm, x: p.x, y: p.y, bag: { ...p.bag }, tools: [...p.tools], rep: { ...p.rep },
    npc: Object.fromEntries(Object.entries(p.npc).map(([k, v]) => [k, { ...v }])), flags: [...p.flags], quests: [...p.quests],
    bestiary: [...p.bestiary], explored: p.explored.length, appearance: { ...p.appearance },
    ending: p.ending ? { id: p.ending, ...OMNI.endings[p.ending] } : null, custom_realms: Object.values(p.custom_realms),
    inventions: p.inventions.map((i) => ({ ...i })), perks: { ...p.perks }, attempts: p.attempts, principles: knownPrinciples(p), budget: inventionBudget(p) };
}

// ---------------------------------------------------------------- discoveries, inventions and innovations
export const DISC = OMNI.discovery;
export const CATEGORIES = ['scientific', 'technological', 'mystical'];
const DOMAIN_ITEM = { light: 'crystal', motion: 'wood', sense: 'shell', heat: 'stone', growth: 'petal', life: 'berries', calm: 'fibre' };
const partition = (str, sep) => { const i = str.indexOf(sep); return i < 0 ? [str, ''] : [str.slice(0, i), str.slice(i + 1)]; };
function met(p, req) {
  const [kind, arg] = partition(req, ':');
  if (kind === 'obs') return p.bestiary.some((b) => b.split(':')[0] === arg);
  if (kind === 'item') return (p.bag[arg] || 0) > 0 || p.tools.includes(arg);
  if (kind === 'inv') return p.inventions.some((i) => i.domain === arg);
  if (kind === 'inv_count') return p.inventions.length >= Number(arg);
  if (kind === 'rep') { const [f, n] = partition(arg, ':'); return (p.rep[f] || 0) >= Number(n); }
  return false;
}
export function knownPrinciples(p) { return Object.keys(DISC.principles).sort(cmpStr).filter((k) => DISC.principles[k].requires.every((r) => met(p, r))); }
export function inventionBudget(p) { return Math.min(40, 8 + 4 * p.inventions.length); }
export function npcRemark(npcId, inv) {
  const fac = OMNI.npcs[npcId].faction;
  return DISC.affinity[fac].includes(inv.domain) ? `I heard about your ${inv.name}. That's exactly the kind of thing we need!` : `Your ${inv.name}… interesting, if not quite our way.`;
}
const signature = (cat, form, prs, mats, obs) => [cat, form, [...prs].sort(cmpStr).join(','), Object.keys(mats).sort(cmpStr).map((k) => `${k}${mats[k]}`).join(','), obs || '-'].join('|');
export function explainInvention(inv) {
  const how = inv.principles.map((k) => DISC.principles[k].gcse).join('; and ');
  const mats = Object.keys(inv.materials).sort(cmpStr).map((k) => `${inv.materials[k]} ${k}`).join(', ');
  let text = `${inv.name} is a ${inv.category} ${inv.form}. How it works: ${how}. Made from ${mats}` + (inv.observation ? `, inspired by watching the ${inv.observation}` : '') + `. In the game: ${inv.effect}.`;
  if (inv.category === 'mystical') text += ' ' + DISC.label_mystical;
  return text;
}
function effectText(form, domain, m, item) {
  let e = DISC.effects[form];
  if (e && typeof e === 'object') e = e[domain] ?? 'a small, steady benefit';
  return e.split('{m}').join(String(m)).split('{item}').join(item);
}
export function invent(p, body, seed, tick, eco) {
  const { category: cat, form, principles: prs, materials: mats } = body, obs = body.observation ?? null;
  if (!CATEGORIES.includes(cat)) throw new OmniError('bad_category');
  if (typeof form !== 'string' || !has(DISC.forms, form)) throw new OmniError('bad_form');
  if (form === 'ritual' && cat !== 'mystical') throw new OmniError('rituals_are_mystical');
  if (!Array.isArray(prs) || prs.length < 1 || prs.length > 2 || new Set(prs).size !== prs.length || !prs.every((k) => typeof k === 'string' && has(DISC.principles, k))) throw new OmniError('bad_principles');
  const cats = prs.map((k) => DISC.principles[k].cat);
  if ((cat === 'mystical' && cats.some((c) => c !== 'mystical')) || (cat !== 'mystical' && (cats.includes('mystical') || !cats.includes(cat)))) throw new OmniError('category_mismatch');
  const known = knownPrinciples(p);
  if (prs.some((k) => !known.includes(k))) throw new OmniError('principle_locked');
  if (kindOf(mats) !== 'dict' || Object.keys(mats).length < 1 || Object.keys(mats).length > 3) throw new OmniError('bad_materials');
  for (const [k, v] of Object.entries(mats)) if (!has(DISC.materials, k) || !isInt(v) || v < 1 || v > 5) throw new OmniError('bad_materials');
  if (Object.values(mats).reduce((a, b) => a + b, 0) > 8) throw new OmniError('bad_materials');
  if (!hasAll(p.bag, mats)) throw new OmniError('missing_resources');
  if (obs !== null && (typeof obs !== 'string' || !p.bestiary.some((b) => b.split(':')[0] === obs))) throw new OmniError('not_observed');
  const sig = signature(cat, form, prs, mats, obs);
  if (p.inventions.some((i) => i.sig === sig)) throw new OmniError('already_discovered');
  const top = [...prs].sort((a, b) => DISC.principles[b].tier - DISC.principles[a].tier || cmpStr(a, b))[0], domain = DISC.principles[top].domain;
  const power = prs.reduce((a, k) => a + DISC.principles[k].tier * 2, 0) + Object.entries(mats).reduce((a, [k, v]) => a + v * DISC.materials[k][1], 0) + (obs ? 2 : 0);
  if (power > inventionBudget(p)) throw new OmniError('too_ambitious');
  if (p.inventions.length >= DISC.max_inventions) throw new OmniError('carrier_full');
  const K = CANON.constants, stratum = Math.min(K.strata - 1, fdiv(power, 6));
  if (stratum > p.inventions.reduce((a, i) => Math.max(a, i.stratum ?? 0), 0) + 1) throw new OmniError('stratum_too_high');
  p.attempts += 1;
  const fits = DISC.forms[form], compat = fits[0] === domain ? 40 : fits.includes(domain) ? 30 : 0;
  const matFit = Object.keys(mats).some((k) => DISC.materials[k][0] === domain) ? 20 : 0, obsFit = obs ? 15 : 0;
  const harmonic = (K.involution_shift * power) % K.carrier_small === 0;
  const score = compat + matFit + obsFit + (harmonic ? 10 : 0), trials = fairTest(seed, sig, score);
  if (trials.successes <= K.trial_threshold) {
    const hints = [];
    if (!compat) hints.push(`a ${domain} idea doesn't suit a ${form}; try a ${fits.join(' / ')} idea`);
    if (!matFit) hints.push(`add a material linked to ${domain}`);
    if (!obs) hints.push('an observation from the Wildwood would help');
    return { ok: false, score, trials, needed: K.trial_threshold + 1, harmonic, hint: hints.join('; ') || 'close! change one ingredient and try again' };
  }
  const before = new Set(known);
  pay(p.bag, mats);
  const m = clamp(1 + fdiv(power, 10), 1, 3), item = DOMAIN_ITEM[domain], names = DISC.names;
  let name = `${names.domain[domain][h3(seed, seedOf(sig), 5) % 3]} ${names.form[form][h3(seed, seedOf(sig), 6) % 3]}`;
  if (p.inventions.some((i) => i.name === name)) name += ` Mk ${p.inventions.length + 1}`;
  const inv = { id: `i${p.inventions.length + 1}`, sig, name, category: cat, form, domain, principles: [...prs], materials: { ...mats }, observation: obs, m, power, score, tick, effect: effectText(form, domain, m, item),
    stratum, harmonic, trials, half_life_days: CANON_HALF_CENTI * (stratum + 1) / 100 };
  inv.explain = explainInvention(inv);
  p.inventions.push(inv);
  const pk = p.perks, applied = {};
  if (form === 'tool') pk['yield:' + item] = applied['yield:' + item] = Math.min(2, (pk['yield:' + item] || 0) + m);
  else if (form === 'ability') {
    const [key, cap, add] = ({ sense: ['reach', 4, m], motion: ['stride', 8, 2 * m], life: ['insight', 1, 1], calm: ['calm', 3, m] })[domain] ?? ['insight', 1, 1];
    pk[key] = applied[key] = Math.min(cap, (pk[key] || 0) + add);
  } else if (form === 'structure' || form === 'effect') {
    const k = 'inv:' + inv.id; p.bag[k] = (p.bag[k] || 0) + (form === 'structure' ? 1 : m); applied[k] = p.bag[k];
  } else if (form === 'ritual') {
    pk.blessing = applied.blessing = Math.min(3, (pk.blessing || 0) + m);
    if (eco) { eco.policy.spread_bonus = Math.min(6, (eco.policy.spread_bonus ?? 0) + 2 * m); applied.spread_bonus = eco.policy.spread_bonus; }
  }
  const rep = {};
  for (const f of Object.keys(DISC.affinity).sort(cmpStr)) if (DISC.affinity[f].includes(domain)) { const d = form === 'ritual' ? 3 * m : 2; p.rep[f] = clamp(p.rep[f] + d, -100, 100); rep[f] = d; }
  const unlocked = knownPrinciples(p).filter((k) => !before.has(k));
  const { sig: _s, ...pub } = inv;
  return { ok: true, invention: pub, applied, rep, unlocked };
}
export function placeInvention(p, kind, x, y, realm, deltas, tick, eco) {
  const inv = p.inventions.find((i) => 'inv:' + i.id === kind && i.form === 'structure');
  if (!inv || (p.bag[kind] || 0) < 1) throw new OmniError('unknown_build');
  if (!isInt(x) || !isInt(y) || Math.abs(x - p.x) + Math.abs(y - p.y) > 2 + (p.perks.reach || 0)) throw new OmniError('too_far');
  if (featureAt(realm, deltas, x, y, tick) || sample(realm, x, y)[0] === 'O') throw new OmniError('occupied');
  pay(p.bag, { [kind]: 1 }); deltas[`${x},${y}`] = [kind, tick];
  const policy = {};
  if (eco) {
    const pol = eco.policy, m = inv.m;
    if (inv.domain === 'growth' || inv.domain === 'heat') pol.growth_bonus = policy.growth_bonus = Math.min(25, (pol.growth_bonus ?? 0) + (inv.domain === 'growth' ? 5 : 3) * m);
    else pol.calm = policy.calm = Math.min(3, (pol.calm ?? 0) + m);
  }
  return { placed: kind, name: inv.name, x, y, policy };
}
export function useInvention(p, item) {
  if (typeof item !== 'string' || (p.bag[item] || 0) < 1) throw new OmniError('missing_item');
  const inv = p.inventions.find((i) => 'inv:' + i.id === item && i.form === 'effect');
  if (!inv) throw new OmniError('not_usable');
  pay(p.bag, { [item]: 1 }); p.perks.boost = Math.min(9, (p.perks.boost || 0) + 3);
  return { used: inv.name, boost: p.perks.boost };
}

// ---------------------------------------------------------------- canon validation engine and discovery cards
export const CANON = OMNI.canon;
const CANON_HALF_CENTI = 1232;
export function fairTest(seed, sig, score) {
  const n = CANON.constants.trials, p = clamp(score * 10, 0, 1000), sh = seedOf(sig);
  let k = 0; for (let i = 0; i < n; i++) if (h3(seed, sh, 100 + i) % 1000 < p) k++;
  return { n, p_permille: p, successes: k };
}
const hundredths = (num, den) => { const v = fdiv(num * 100 * 2 + den, 2 * den); return `${fdiv(v, 100)}.${String(v % 100).padStart(2, '0')}`; };
const f2 = (x) => { const v = Math.floor(x * 100 + 0.5); return `${fdiv(v, 100)}.${String(v % 100).padStart(2, '0')}`; };
const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
export function buildCard(inv, aiLines = null) {
  const C = CANON.constants, L = CANON.laws, F = CANON.formulas, prs = DISC.principles;
  const st = [{ label: 'IN-GAME', text: `${inv.name} is an in-game ${inv.category} ${inv.form} on stratum M${inv.stratum}.` },
    { label: 'IN-GAME', text: `Effect in the game: ${inv.effect}.` },
    { label: 'IN-GAME', text: 'Made from ' + Object.keys(inv.materials).sort(cmpStr).map((k) => `${inv.materials[k]} ${k}`).join(', ') + (inv.observation ? `, inspired by observing the ${inv.observation}` : '') + '.' }];
  for (const k of inv.principles) {
    const pr = prs[k], lab = pr.cat !== 'mystical' ? 'FACT' : k === 'strata_resonance' ? 'SSR/CRA THEORY' : 'MYSTICAL/IN-GAME';
    st.push({ label: lab, text: `${cap1(k.replace(/_/g, ' '))}: ${pr.gcse}.` });
  }
  st.push({ label: 'FACT', text: L.conservation.fact }, { label: 'IN-GAME', text: L.conservation.game }, { label: 'FACT', text: L.fair_test.fact },
    { label: 'IN-GAME', text: `Fair test: ${inv.trials.successes} of ${inv.trials.n} seeded trials worked (more than ${C.trial_threshold} needed).` },
    { label: 'SSR/CRA THEORY', text: L.stratum.theory }, { label: 'IN-GAME', text: L.stratum.game },
    { label: 'FACT', text: L.harmonic.fact }, { label: 'SSR/CRA THEORY', text: L.harmonic.theory },
    { label: 'IN-GAME', text: inv.harmonic ? 'Harmonic: yes, +10 stability (power is even, so 72 × power is a whole number of 144-cycles).' : 'Harmonic: no (power is odd, so 72 × power leaves 72 over on ℤ144).' },
    { label: 'FACT', text: L.half_life.fact }, { label: 'IN-GAME', text: L.half_life.game });
  if (inv.category === 'mystical') st.push({ label: 'FACT', text: L.year_clock.fact }, { label: 'SSR/CRA THEORY', text: L.year_clock.theory }, { label: 'MYSTICAL/IN-GAME', text: DISC.label_mystical });
  const maths = [], seen = new Set();
  for (const k of inv.principles) { const fid = CANON.principle_formula[k]; if (!seen.has(fid)) { seen.add(fid); maths.push({ id: fid, label: 'FACT', plain: F[fid].plain, mathml: F[fid].mathml, worked: '' }); } }
  const pm = inv.trials.p_permille, n = inv.trials.n, sd = Math.sqrt(n * pm * (1000 - pm)) / 1000;
  maths.push({ id: 'binomial', label: 'FACT', plain: F.binomial.plain, mathml: F.binomial.mathml, worked: `n = ${n}, p = ${hundredths(pm, 1000)}: mean = ${hundredths(n * pm, 1000)}, σ = ${f2(sd)}; observed ${inv.trials.successes}.` });
  const half = CANON_HALF_CENTI * (inv.stratum + 1), left = Math.floor(100 * 2 ** (-3000 / half) + 0.5);
  maths.push({ id: 'half_life', label: 'FACT', plain: F.half_life.plain, mathml: F.half_life.mathml, worked: `In-game T½ = 12.32 × ${inv.stratum + 1} = ${hundredths(half, 100)} days; after 30 days about ${left}% of the glow remains.` });
  maths.push({ id: 'involution', label: 'FACT', plain: F.involution.plain, mathml: F.involution.mathml, worked: `power = ${inv.power}: 72 × ${inv.power} mod 144 = ${(72 * inv.power) % 144}.` });
  if (inv.category === 'mystical') maths.push({ id: 'year_ratio', label: 'FACT', plain: F.year_ratio.plain, mathml: F.year_ratio.mathml, worked: `28125 ÷ 77 = ${hundredths(C.year_ratio_num * 100, C.year_ratio_den * 100)}… days (rounding of 4500 d ÷ 365.25 = 12.3203 yr).` });
  const ai = [];
  for (const line of aiLines || []) if (line && typeof line === 'object' && CANON.labels.includes(line.label) && typeof line.text === 'string' && line.text.trim()) ai.push({ label: line.label, text: line.text.trim().slice(0, 300) });
  return { title: inv.name, category: inv.category, form: inv.form, domain: inv.domain, stratum: `M${inv.stratum}`,
    definition: `${inv.name}: an in-game ${inv.category} ${inv.form} (${inv.domain}) on stratum M${inv.stratum}.`,
    summary: inv.effect, statements: st, maths, ai: ai.slice(0, 8), labels: [...CANON.labels], no_proof: CANON.no_proof, source: CANON.source, game: 'Strata: Lux Genesis 9.0' };
}
export const PROOF_WORDS = ['proves', 'proven', 'proof that', 'scientifically confirmed', 'confirms that ssr', 'real magic'];
export function parseAiLines(text) {
  const out = [];
  for (const raw of String(text ?? '').split(/\r\n|\r|\n/)) {
    let line = raw.trim().replace(/^[-• ]+/, '').trim();
    for (const lab of CANON.labels) {
      const tag = `[${lab}]`;
      if (line.toUpperCase().startsWith(tag)) {
        const body = line.slice(tag.length).replace(/^[ :—-]+|[ :—-]+$/g, '');
        if (body && !PROOF_WORDS.some((w) => body.toLowerCase().includes(w)) && !CANON.labels.some((l2) => body.toUpperCase().includes(`[${l2}]`))) out.push({ label: lab, text: body.slice(0, 300) });
        break;
      }
    }
  }
  return out.slice(0, 8);
}
