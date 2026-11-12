// μLux — Genesis Engine: Horn universes, Γ_C, Kleene trace, semi-naive closure.
// FACT: a set of Horn rules defines a monotone operator Γ(X) = (axioms ∪ {h : body ⊆ X}) ∩ Adm;
// its least fixed point is reached by Kleene iteration from ∅ (Knaster–Tarski, Kleene).
import { eq } from './sets.js';

export const STRATA = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7+', 'M∞'];
export const GOVERNOR = Object.freeze({ maxAtoms: 144000, maxSteps: 144000, maxMs: 12320 });

/**
 * DSL (one statement per line, # comments):
 *   universe "Name"
 *   atoms a b c d          declare atoms (optional; rule atoms are auto-declared)
 *   axiom a                always generated
 *   b <- a                 Horn rule (body may be several atoms separated by spaces or commas)
 *   adm a b c              admissibility filter (optional; default = all atoms)
 *   stratum M0: a b        assign atoms to a stratum (atoms named "M3:x" are auto-assigned)
 *   forbid x y             ONIC pair: flagged if both appear in μΓ
 */
export function parseUniverse(text) {
  const u = { name: 'Untitled', atoms: [], axioms: [], rules: [], adm: null, forbid: [], strataOf: {}, errors: [] };
  const seen = new Set();
  const add = (a) => { if (!seen.has(a)) { seen.add(a); u.atoms.push(a); } };
  const atomRe = /^[^\s,<>#"]+$/;
  const check = (a, ln) => { if (!atomRe.test(a)) u.errors.push(`line ${ln}: invalid atom "${a}"`); return a; };
  text.split(/\r?\n/).forEach((raw, i) => {
    const ln = i + 1; const line = raw.replace(/#.*$/, '').trim();
    if (!line) return;
    let m;
    if ((m = line.match(/^universe\s+"([^"]*)"$/))) u.name = m[1];
    else if ((m = line.match(/^atoms\s+(.+)$/))) m[1].split(/[\s,]+/).forEach((a) => add(check(a, ln)));
    else if ((m = line.match(/^axiom\s+(.+)$/))) m[1].split(/[\s,]+/).forEach((a) => { add(check(a, ln)); u.axioms.push(a); });
    else if ((m = line.match(/^adm\s+(.+)$/))) { u.adm = new Set(m[1].split(/[\s,]+/)); }
    else if ((m = line.match(/^stratum\s+(\S+)\s*:\s*(.+)$/))) {
      if (!STRATA.includes(m[1])) u.errors.push(`line ${ln}: unknown stratum ${m[1]}`);
      m[2].split(/[\s,]+/).forEach((a) => { add(check(a, ln)); u.strataOf[a] = m[1]; });
    } else if ((m = line.match(/^forbid\s+(\S+)\s+(\S+)$/))) u.forbid.push([m[1], m[2]]);
    else if ((m = line.match(/^(\S+)\s*<-\s*(.+)$/))) {
      const head = check(m[1], ln); const body = m[2].split(/[\s,]+/).filter(Boolean).map((a) => check(a, ln));
      add(head); body.forEach(add); u.rules.push({ head, body });
    } else u.errors.push(`line ${ln}: cannot parse "${line}"`);
  });
  for (const a of u.atoms) if (!u.strataOf[a]) { const p = a.split(':')[0]; if (a.includes(':') && STRATA.includes(p)) u.strataOf[a] = p; }
  if (u.atoms.length > GOVERNOR.maxAtoms) u.errors.push(`Growth Governor: ${u.atoms.length} atoms exceeds ${GOVERNOR.maxAtoms}`);
  return u;
}

export function makeUniverse({ name = 'Untitled', atoms, axioms = [], rules = [], adm = null, strataOf = {}, forbid = [] }) {
  const all = new Set(atoms); axioms.forEach((a) => all.add(a)); rules.forEach((r) => { all.add(r.head); r.body.forEach((b) => all.add(b)); });
  return { name, atoms: [...all], axioms, rules, adm: adm ? new Set(adm) : null, strataOf, forbid, errors: [] };
}

export function makeGamma(u) {
  const adm = u.adm;
  return (X) => {
    const Y = new Set();
    for (const a of u.axioms) if (!adm || adm.has(a)) Y.add(a);
    for (const r of u.rules) if ((!adm || adm.has(r.head)) && r.body.every((b) => X.has(b))) Y.add(r.head);
    return Y;
  };
}

// Kleene trace with Growth Governor. Each step is one application of Γ.
export function kleeneTrace(u, { maxSteps = GOVERNOR.maxSteps } = {}) {
  const gamma = makeGamma(u); const path = [new Set()];
  for (let i = 0; i <= maxSteps; i++) {
    const nxt = gamma(path[path.length - 1]);
    if (eq(nxt, path[path.length - 1])) return path;
    path.push(nxt);
  }
  throw new RangeError(`Growth Governor: Kleene trace exceeded ${maxSteps} steps`);
}

// Semi-naive (counter-based) closure: O(atoms + total body size). Returns μΓ.
// Equals the Kleene limit because Γ's least fixed point is the least Adm-respecting set
// containing the axioms and closed under the rules.
export function closure(u, { maxMs = GOVERNOR.maxMs } = {}) {
  const t0 = Date.now();
  const idx = new Map(u.atoms.map((a, i) => [a, i])); const n = u.atoms.length;
  const ok = (a) => !u.adm || u.adm.has(a);
  const watch = Array.from({ length: n }, () => []);
  const missing = new Int32Array(u.rules.length);
  const inSet = new Uint8Array(n); const queue = [];
  const push = (i) => { if (!inSet[i]) { inSet[i] = 1; queue.push(i); } };
  u.rules.forEach((r, k) => {
    const uniq = [...new Set(r.body)]; missing[k] = uniq.length;
    uniq.forEach((b) => watch[idx.get(b)].push(k));
    if (uniq.length === 0 && ok(r.head)) push(idx.get(r.head));
  });
  for (const a of u.axioms) if (ok(a)) push(idx.get(a));
  for (let q = 0; q < queue.length; q++) {
    if ((q & 0xffff) === 0 && Date.now() - t0 > maxMs) throw new RangeError(`Growth Governor: closure exceeded ${maxMs} ms`);
    for (const k of watch[queue[q]]) if (--missing[k] === 0) { const h = u.rules[k].head; if (ok(h)) push(idx.get(h)); }
  }
  const out = new Set(); for (let i = 0; i < n; i++) if (inSet[i]) out.add(u.atoms[i]);
  return out;
}

export function forbiddenViolations(u, X) { return u.forbid.filter(([a, b]) => X.has(a) && X.has(b)); }

// Chain universe of length n with a self-supporting extra atom d (thesis C15 family).
export function chainUniverse(n) {
  const rules = []; for (let i = 1; i < n; i++) rules.push({ head: `x${i + 1}`, body: [`x${i}`] });
  rules.push({ head: 'd', body: ['d'] }); rules.push({ head: `x${n}`, body: ['d'] });
  const atoms = Array.from({ length: n }, (_, i) => `x${i + 1}`).concat('d');
  return makeUniverse({ name: `chain-${n}`, atoms, axioms: ['x1'], rules });
}

export function serialiseUniverse(u) {
  const lines = [`universe "${u.name}"`, `atoms ${u.atoms.join(' ')}`];
  u.axioms.forEach((a) => lines.push(`axiom ${a}`));
  u.rules.forEach((r) => lines.push(`${r.head} <- ${r.body.join(' ')}`));
  if (u.adm) lines.push(`adm ${[...u.adm].join(' ')}`);
  u.forbid.forEach(([a, b]) => lines.push(`forbid ${a} ${b}`));
  return lines.join('\n');
}
