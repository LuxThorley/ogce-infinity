// μLux — finite-set helpers. States are JS Sets of atom names.
export const S = (it) => new Set(it);
export const subset = (A, B) => { for (const x of A) if (!B.has(x)) return false; return true; };
export const eq = (A, B) => A.size === B.size && subset(A, B);
export const union = (A, B) => { const R = new Set(A); for (const x of B) R.add(x); return R; };
export const inter = (A, B) => { const R = new Set(); for (const x of A) if (B.has(x)) R.add(x); return R; };
export const diff = (A, B) => { const R = new Set(); for (const x of A) if (!B.has(x)) R.add(x); return R; };
export const key = (A) => [...A].sort().join('\u0001');
export function fmt(A, order) {
  if (!A.size) return '∅';
  const arr = [...A];
  if (order) arr.sort((x, y) => order.indexOf(x) - order.indexOf(y)); else arr.sort();
  return '{' + arr.join(', ') + '}';
}
// Python-style repr of a list of strings, e.g. ['a', 'b']
export const pyList = (arr) => '[' + arr.map((s) => `'${s}'`).join(', ') + ']';
export function powerSet(atoms) {
  const out = []; const n = atoms.length;
  if (n > 20) throw new RangeError('power set too large');
  // Python itertools order: by size, then lexicographic combinations
  const combos = (k, start, acc) => {
    if (acc.length === k) { out.push(new Set(acc)); return; }
    for (let i = start; i < n; i++) { acc.push(atoms[i]); combos(k, i + 1, acc); acc.pop(); }
  };
  for (let k = 0; k <= n; k++) combos(k, 0, []);
  return out;
}
export function kleene(gamma, bottom = new Set(), maxSteps = 1e6) {
  const path = [bottom];
  for (let i = 0; i < maxSteps; i++) {
    const nxt = gamma(path[path.length - 1]);
    if (eq(nxt, path[path.length - 1])) return path;
    path.push(nxt);
  }
  throw new RangeError(`Kleene iteration exceeded ${maxSteps} steps (Growth Governor)`);
}
export function monotoneExhaustive(gamma, P) {
  let pairs = 0;
  for (const X of P) for (const Y of P) if (subset(X, Y)) { pairs++; if (!subset(gamma(X), gamma(Y))) return { ok: false, pairs }; }
  return { ok: true, pairs };
}
export function monotoneSampled(gamma, atoms, rng, n = 2000, p = 0.5) {
  for (let i = 0; i < n; i++) {
    const Y = new Set(atoms.filter(() => rng() < p));
    const X = new Set([...Y].filter(() => rng() < 0.5));
    if (!subset(gamma(X), gamma(Y))) return false;
  }
  return true;
}
