// μLux — Symmetry Finder (Theorem T5: an order-automorphism R with R∘Γ = Γ∘R leaves μΓ invariant).
import { eq, powerSet, kleene } from './sets.js';
function* permutations(arr) {
  if (arr.length <= 1) { yield arr.slice(); return; }
  for (let i = 0; i < arr.length; i++) { const rest = arr.slice(0, i).concat(arr.slice(i + 1)); for (const p of permutations(rest)) yield [arr[i], ...p]; }
}
// Exhaustive search over atom permutations (small universes only: ≤ 8 atoms).
export function commutingPermutations(gamma, atoms) {
  if (atoms.length > 8) throw new RangeError('Symmetry Finder: exhaustive search limited to 8 atoms');
  const P = powerSet(atoms); const out = [];
  for (const perm of permutations(atoms)) {
    const m = Object.fromEntries(atoms.map((a, i) => [a, perm[i]]));
    const R = (X) => new Set([...X].map((x) => m[x]));
    if (P.every((X) => eq(R(gamma(X)), gamma(R(X))))) out.push(perm.join(''));
  }
  return out;
}
// Cyclic carrier Z_n with Γ(X) = seeds ∪ (X + step); shift symmetries s with s∘Γ = Γ∘s on the Kleene chain.
export function cyclicUniverse(n = 144, seeds = [0, 72], step = 2) {
  const gamma = (X) => new Set([...seeds, ...[...X].map((k) => (k + step) % n)]);
  const shift = (s) => (X) => new Set([...X].map((k) => (k + s) % n));
  const path = kleene(gamma); const mu = path[path.length - 1];
  const shifts = []; for (let s = 1; s < n; s++) if (path.every((X) => eq(shift(s)(gamma(X)), gamma(shift(s)(X))))) shifts.push(s);
  return { gamma, shift, path, mu, steps: path.length - 1, shifts };
}
