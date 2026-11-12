// μLux — OmniGenesis Mirror: transfer verification (Theorems T1–T4).
// FACT (T2): if F(⊥)=⊥ and F(Γ(Xₙ)) = Λ(F(Xₙ)) on every state of the Γ Kleene chain (U1′), then F(μΓ) = μΛ (U2).
import { eq, subset, union, kleene, fmt, powerSet } from './sets.js';

// Build a join-preserving map from an atom map: F(X) = ⋃ map[x]. (Join-preserving and F(∅)=∅ by construction.)
export function mapFromAtoms(atomMap) {
  return (X) => { const Y = new Set(); for (const x of X) for (const y of atomMap[x] || []) Y.add(y); return Y; };
}

// Right adjoint of a union-preserving F: γ(Y) = { x ∈ U : F({x}) ⊆ Y }  (so F(X) ⊆ Y ⇔ X ⊆ γ(Y)).
export function rightAdjoint(F, sourceAtoms) {
  return (Y) => new Set(sourceAtoms.filter((x) => subset(F(new Set([x])), Y)));
}
export const bestAbstraction = (F, gamma, gammaAdj) => (Y) => F(gamma(gammaAdj(Y)));

// Per-step (U1′) audit, then (U2). Returns a structured report suitable for a receipt.
export function auditTransfer({ name = 'Ψ', gamma, F, Lam, path = null, order }) {
  const chain = path || kleene(gamma);
  const steps = chain.map((X, k) => {
    const lhs = F(gamma(X)); const rhs = Lam(F(X));
    return { k, nX: X.size, X: fmt(X, order), FGX: fmt(lhs, order), LFX: fmt(rhs, order), u1prime: eq(lhs, rhs) };
  });
  const mu = chain[chain.length - 1]; const lamPath = kleene(Lam); const muLam = lamPath[lamPath.length - 1];
  const Fmu = F(mu);
  return {
    name, steps: chain.length - 1, u1prime: steps.every((s) => s.u1prime), transfer: eq(Fmu, muLam),
    fixed: eq(gamma(mu), mu), bottomPreserved: F(new Set()).size === 0,
    nMu: mu.size, nFmu: Fmu.size, nMuLam: muLam.size, mu: fmt(mu, order), Fmu: fmt(Fmu, order), muLam: fmt(muLam, order), audit: steps,
    verdict: steps.every((s) => s.u1prime) && eq(Fmu, muLam) ? 'TRANSFER CERTIFIED (T2)' : 'NOT CERTIFIED',
  };
}

// Exhaustive global checks on small lattices: (U1) everywhere, lax (T3) and sound (T4) inclusions.
export function globalChecks({ gamma, F, Lam, sourceAtoms, order }) {
  const P = powerSet(sourceAtoms);
  const rows = P.map((X) => {
    const lhs = F(gamma(X)); const rhs = Lam(F(X));
    return { X: fmt(X, order), FX: fmt(F(X), order), FGX: fmt(lhs, order), LFX: fmt(rhs, order), eq: eq(lhs, rhs), lax: subset(rhs, lhs), sound: subset(lhs, rhs) };
  });
  const joinPreserving = P.every((X) => P.every((Y) => eq(F(union(X, Y)), union(F(X), F(Y))))) && F(new Set()).size === 0;
  return { rows, joinPreserving, u1Global: rows.every((r) => r.eq), laxAll: rows.every((r) => r.lax), soundAll: rows.every((r) => r.sound),
    failures: rows.filter((r) => !r.eq).map((r) => r.X) };
}
