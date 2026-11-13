// v9.0 combat on the Worker: the shared engine (web/js/combat.js) plus move invention, which needs the canon/discovery data.
import { DISC, knownPrinciples, fairTest } from './omniverse.js';
import * as C from '../../web/js/combat.js';
export * from '../../web/js/combat.js';
const { CB, CombatError } = C;

export function inventMove(prof, explorer, req, seed) {
  const I = CB.invent;
  if (!req || typeof req !== 'object' || Array.isArray(req)) throw new CombatError('bad_request');
  const { weapon, shape, principles: prins } = req;
  if (typeof weapon !== 'string' || !Object.prototype.hasOwnProperty.call(CB.weapons, weapon)) throw new CombatError('unknown_weapon');
  if (typeof shape !== 'string' || !Object.prototype.hasOwnProperty.call(I.shapes, shape)) throw new CombatError('unknown_shape');
  if (!Array.isArray(prins) || prins.length < 1 || prins.length > 2 || new Set(prins.map(String)).size !== prins.length) throw new CombatError('bad_principles');
  if (prof.invented.length >= I.max) throw new CombatError('too_many_moves');
  const known = knownPrinciples(explorer);
  for (const pr of prins) {
    if (typeof pr !== 'string' || !Object.prototype.hasOwnProperty.call(DISC.principles, pr)) throw new CombatError('unknown_principle');
    if (!known.includes(pr)) throw new CombatError('principle_not_known');
  }
  const S = I.shapes[shape], P0 = DISC.principles[prins[0]], dom = P0.domain;
  const power = S.power + prins.reduce((a, p) => a + 4 * DISC.principles[p].tier, 0);
  const budget = C.inventBudget(prof);
  const sig = 'move:' + weapon + ':' + shape + ':' + prins.join('+');
  const laws = [];
  const ok = power <= budget;
  laws.push({ law: 'conservation', ok, detail: `power ${power} within budget ${budget}` });
  const harmonic = (72 * power) % 144 === 0;
  laws.push({ law: 'harmonic', ok: true, detail: harmonic ? 'even power resonates with 72/144 (+10% damage)' : 'odd power: no resonance bonus' });
  const score = 40 + 6 * prins.length + (I.affinity[shape].includes(dom) ? 20 : 0) + (prins.length === 2 && I.affinity[shape].includes(DISC.principles[prins[1]].domain) ? 8 : 0);
  const ft = fairTest(seed, sig, score);
  const works = ft.successes > Math.floor(ft.n / 2);
  laws.push({ law: 'fair_test', ok: works, detail: `${ft.successes} of ${ft.n} trials succeeded` });
  const mystical = prins.some((p) => DISC.principles[p].cat === 'mystical');
  if (!ok || !works) return { ok: false, laws, power, budget, fair_test: ft, hint: "Lower the power (fewer or lower-tier principles) or pick a shape that suits the principle's domain." };
  const D = I.domains[dom], mid = 'inv' + (prof.invented.length + 1);
  const move = { id: mid, weapon, name: D.adj + ' ' + S.name, level: 1, focus: 25 + power, windup: S.windup, active: S.active, recovery: S.recovery, hits: S.hits,
    mult: S.mult + power * 3 + (harmonic ? 10 : 0), kb: S.kb, stun: S.stun, effect: D.effect, power, close: !!S.close, invented: true, principles: [...prins], shape,
    fx: { colour: D.colour, particles: 60 + power * 3, shake: 4 + Math.floor(power / 4), flash: power >= 20 ? 1 : 0, ring: 1 + Math.floor(power / 12) },
    desc: `Your own ${S.name.toLowerCase()} move powered by ${prins.map((p) => p.replaceAll('_', ' ')).join(' and ')}.`,
    card: [{ label: 'FACT', text: S.fact },
      P0.cat !== 'mystical' ? { label: 'FACT', text: P0.gcse } : { label: 'MYSTICAL/IN-GAME', text: 'Symbolic principle: ' + P0.gcse },
      { label: 'SSR/CRA THEORY', text: I.theory },
      { label: 'IN-GAME', text: `Effect: ${D.effect}; power ${power}; ${S.hits} hit(s).` }],
    symbolic: mystical };
  prof.invented.push(move);
  prof.specials[mid] = 1;
  const lo = (prof.loadout[weapon] ||= []);
  if (lo.length < CB.loadout) lo.push(mid);
  return { ok: true, laws, power, budget, fair_test: ft, move };
}
