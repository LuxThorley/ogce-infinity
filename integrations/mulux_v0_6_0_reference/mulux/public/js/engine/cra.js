// μLux — CRA-33 reference universe, ported line-for-line from the thesis suite (verify.py, C17).
// FACT: |U| = 33, 9 Kleene steps, |μΓ_C| = 31. The CRA is an auditable algebra, not a time machine.
import { makeUniverse, STRATA } from './lattice.js';

export const FINITE_STRATA = STRATA.slice(0, 8);
export const LIMIT_STRATUM = 'M∞';
export const TOTALITY = 'M∞:totality';
export const STRATA_LABELS = {
  M0: 'Pre-geometric proto-regularity', M1: 'Biological / ecological', M2: 'Chemical / molecular',
  M3: 'Physical spacetime', M4: 'Quantum / information', M5: 'Quantum gravity / unified field',
  M6: 'Cosmological multiverse', 'M7+': 'Meta-mathematical / transcendent', 'M∞': 'Infinite / Absolute (limit)',
};
export const AXIOMS = ['source:Gamma_C', 'constraint:monotonicity', 'M0:primitive'];
export const UNGENERATED = ['timeline:aperiodic', 'act:non-indexical'];
const KINDS = ['primitive', 'relation', 'observable'];
export const FINITE_ATOMS = FINITE_STRATA.flatMap((s) => KINDS.map((k) => `${s}:${k}`));
export const U_CRA = [...FINITE_ATOMS, 'constraint:CLAAL', 'constraint:monotonicity', 'constraint:recoverability',
  'timeline:periodic', 'act:indexical', 'source:Gamma_C', TOTALITY, ...UNGENERATED];
const USET = new Set(U_CRA);
const full = (Z, s) => (s === LIMIT_STRATUM ? Z.has(TOTALITY) : KINDS.every((k) => Z.has(`${s}:${k}`)));

// Exact staged operator demo_gamma from the thesis.
export function craGamma(X) {
  const Z = new Set(X); AXIOMS.forEach((a) => Z.add(a));
  const adv = [];
  for (let i = 0; i < FINITE_STRATA.length - 1; i++) if (full(Z, FINITE_STRATA[i])) adv.push(`${FINITE_STRATA[i + 1]}:primitive`);
  if (FINITE_ATOMS.every((a) => Z.has(a))) adv.push(TOTALITY);
  adv.forEach((a) => Z.add(a));
  FINITE_STRATA.forEach((s, i) => {
    if (Z.has(`${s}:primitive`)) { Z.add(`${s}:relation`); Z.add(`${s}:observable`); if (i > 0) Z.add(`${STRATA[i - 1]}:relation`); }
  });
  const any = (p) => [...Z].some((e) => e.startsWith(p));
  if (any('M1:')) { Z.add('constraint:CLAAL'); Z.add('constraint:recoverability'); }
  if (any('M3:')) { Z.add('act:indexical'); Z.add('timeline:periodic'); }
  return new Set([...Z].filter((e) => USET.has(e)));
}

// Horn encoding of the same generation rules for the Lattice Studio (same least fixed point).
export function craHornUniverse() {
  const rules = [];
  for (let i = 0; i < 7; i++) rules.push({ head: `${FINITE_STRATA[i + 1]}:primitive`, body: KINDS.map((k) => `${FINITE_STRATA[i]}:${k}`) });
  rules.push({ head: TOTALITY, body: [...FINITE_ATOMS] });
  FINITE_STRATA.forEach((s, i) => {
    rules.push({ head: `${s}:relation`, body: [`${s}:primitive`] });
    rules.push({ head: `${s}:observable`, body: [`${s}:primitive`] });
    if (i > 0) rules.push({ head: `${STRATA[i - 1]}:relation`, body: [`${s}:primitive`] });
  });
  KINDS.forEach((k) => {
    rules.push({ head: 'constraint:CLAAL', body: [`M1:${k}`] }, { head: 'constraint:recoverability', body: [`M1:${k}`] });
    rules.push({ head: 'act:indexical', body: [`M3:${k}`] }, { head: 'timeline:periodic', body: [`M3:${k}`] });
  });
  const strataOf = {}; U_CRA.forEach((a) => { const p = a.split(':')[0]; if (STRATA.includes(p)) strataOf[a] = p; });
  return makeUniverse({ name: 'CRA-33', atoms: U_CRA, axioms: AXIOMS, rules, strataOf });
}

export function featureMap(X) {
  const v = FINITE_STRATA.map((s) => [...X].filter((e) => e.startsWith(s + ':')).length / 3);
  v.push(X.has(TOTALITY) ? 1 : 0, X.has('constraint:CLAAL') ? 1 : 0, X.has('source:Gamma_C') ? 1 : 0);
  return v;
}
export const euclid = (a, b) => Math.sqrt(a.reduce((t, x, i) => t + (x - b[i]) ** 2, 0));
