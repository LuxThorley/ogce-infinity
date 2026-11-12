// μLux — bundled demo universes for the Genesis Bloom and Strata Lens.
import { craGamma, craHornUniverse, U_CRA } from '../engine/cra.js';
import { kleeneTrace, makeGamma, chainUniverse, parseUniverse, STRATA } from '../engine/lattice.js';
import { kleene } from '../engine/sets.js';
import { cyclicUniverse } from '../engine/symmetry.js';
const prefix = (a) => { const p = a.split(':')[0]; return STRATA.includes(p) ? p : null; };
export const TOY_DSL = `universe "Toy-16"
# Thesis Part IV: a always; b if a; c if b; c if d; d if d (self-supporting)
atoms a b c d
axiom a
b <- a
c <- b
c <- d
d <- d`;
export const UNIVERSES = {
  'cra-staged': () => ({ label: 'CRA-33 (thesis operator, 9 steps)', atoms: U_CRA, strataOf: prefix, path: kleene(craGamma), gamma: craGamma }),
  'cra-horn': () => { const u = craHornUniverse(); return { label: 'CRA-33 (Horn encoding, same μΓ)', atoms: u.atoms, strataOf: prefix, path: kleeneTrace(u), gamma: makeGamma(u), universe: u }; },
  toy: () => { const u = parseUniverse(TOY_DSL); return { label: 'Toy-16 {a,b,c,d}', atoms: u.atoms, strataOf: () => null, path: kleeneTrace(u), gamma: makeGamma(u), universe: u }; },
  'z144': () => { const z = cyclicUniverse(144, [0, 72], 2); return { label: 'ℤ₁₄₄ with involution +72', atoms: [...Array(144).keys()], strataOf: () => null, path: z.path, gamma: z.gamma }; },
  'chain-144': () => { const u = chainUniverse(144); return { label: 'Chain-144 + self-supporting d', atoms: u.atoms, strataOf: () => null, path: kleeneTrace(u), gamma: makeGamma(u), universe: u }; },
};
export function fromStudio(u) { return { label: `Studio: ${u.name}`, atoms: u.atoms, strataOf: (a) => u.strataOf[a] || null, path: kleeneTrace(u, { maxSteps: 2000 }), gamma: makeGamma(u), universe: u }; }
