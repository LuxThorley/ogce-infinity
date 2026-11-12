// μLux — Strata Lens: restriction r_n, actuality Act, projection q_n (Theorem T8: Act(r_n X) = q_n(Act X)).
import { STRATA } from './lattice.js';
const stratumOfDefault = (a) => { const p = a.split(':')[0]; return STRATA.includes(p) ? p : null; };
export function act(X, strataOf = stratumOfDefault) {
  const f = typeof strataOf === 'function' ? strataOf : (a) => strataOf[a] || null;
  // Thesis definition: a stratum is active if some atom of X starts with "<stratum>:"
  return new Set(STRATA.filter((s) => [...X].some((e) => f(e) === s)));
}
export function restrict(X, n, strataOf = stratumOfDefault) {
  const f = typeof strataOf === 'function' ? strataOf : (a) => strataOf[a] || null;
  const keep = new Set(STRATA.slice(0, n + 1));
  return new Set([...X].filter((e) => keep.has(f(e))));
}
export const qProject = (A, n) => new Set([...A].filter((s) => STRATA.slice(0, n + 1).includes(s)));
export function coherent(X, n, strataOf) {
  const a = act(restrict(X, n, strataOf), strataOf); const b = qProject(act(X, strataOf), n);
  return a.size === b.size && [...a].every((s) => b.has(s));
}
