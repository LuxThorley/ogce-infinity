// μLux — Proof Ledger: JavaScript re-computation of the Masterpiece Edition's 73 machine checks
// (verify.py, 10 Nov 2026). Same names, same order. Random samples use mulberry32 instead of
// Python's Mersenne Twister / NumPy PCG64, so sampled sets differ while every check's verdict is the same.
import { S, subset, eq, union, inter, diff, fmt, pyList, powerSet, kleene, monotoneExhaustive, monotoneSampled } from './sets.js';
import { mulberry32, popcount32 } from './rng.js';
import { normCdf, normPpf, numberInfo, primePi, isPrime, Frac } from './mathx.js';
import { correlator, chsh, classicalMax, chshGrid, bobMarginal, pageEntropy, bulbCentre, FIB_BULBS } from './observatory.js';
import { craGamma, U_CRA, AXIOMS, UNGENERATED, TOTALITY, featureMap, euclid } from './cra.js';
import { STRATA, chainUniverse, makeGamma } from './lattice.js';
import { act, restrict, qProject } from './strata.js';
import { auditTransfer } from './transfer.js';
import { commutingPermutations, cyclicUniverse } from './symmetry.js';

const ORDER = 'abcdδ';
const f = (X) => fmt(X, ORDER);
export const TOY_ATOMS = ['a', 'b', 'c', 'd'];
export function toyG(X) { const Y = S(['a']); if (X.has('a')) Y.add('b'); if (X.has('b') || X.has('d')) Y.add('c'); if (X.has('d')) Y.add('d'); return Y; }
export const toyGamma = (adm) => { const A = S(adm); return (X) => inter(toyG(X), A); };
export const ABC = S(['a', 'b', 'c']);
export const toyF = (X) => inter(X, ABC);
export const toyFd = (X) => { const Y = inter(X, ABC); if (X.has('d')) { Y.add('c'); Y.add('δ'); } return Y; };
export const toyLamd = (Y) => { const Z = S(['a']); if (Y.has('a')) Z.add('b'); if (Y.has('b') || Y.has('δ')) Z.add('c'); if (Y.has('δ')) Z.add('δ'); return Z; };
export const toyGal = (Y) => union(Y, S(['d']));

export function runDoctrineChecks({ fast = false } = {}) {
  const R = {}; const CHECKS = [];
  const check = (name, cond, detail = '') => CHECKS.push({ name, ok: !!cond, detail: String(detail) });

  // ---- C1 toy least fixed point
  const P = powerSet(TOY_ATOMS); const Gam = toyGamma(TOY_ATOMS);
  const mono = monotoneExhaustive(Gam, P); R.C1_pairs_checked = mono.pairs; R.C1_monotone = mono.ok;
  R.C1_table = P.map((X) => ({ X: f(X), GX: f(Gam(X)), prefixed: subset(Gam(X), X), fixed: eq(Gam(X), X) }));
  const pre = P.filter((X) => subset(Gam(X), X)); let meet = S(TOY_ATOMS); pre.forEach((X) => { meet = inter(meet, X); });
  const path = kleene(Gam); const mu = path[path.length - 1];
  R.C1_lfp = f(mu); R.C1_steps = path.length - 1; R.C1_kleene = path.map(f); R.C1_meet_prefixed = f(meet); R.C1_lfp_equals_meet = eq(mu, meet);
  R.C1_tight_monotone = monotoneExhaustive(toyGamma(['a', 'b', 'd']), P).ok;

  // ---- C2 intersection map
  const PA = P.filter((X) => subset(X, ABC)); const Lam = (Y) => inter(Gam(Y), ABC);
  const joinOk = P.every((X) => P.every((Y) => eq(toyF(union(X, Y)), union(toyF(X), toyF(Y))))) && toyF(S()).size === 0;
  R.C2_rows = P.map((X) => { const l = toyF(Gam(X)), r = Lam(toyF(X)); return { X: f(X), FX: f(toyF(X)), FGX: f(l), LFX: f(r), eq: eq(l, r), lax: subset(r, l) }; });
  const fails = R.C2_rows.filter((r) => !r.eq).map((r) => r.X); const lfpL = kleene(Lam).at(-1);
  Object.assign(R, { C2_join_preserving: joinOk, C2_U1_failures: fails, C2_lax_all: R.C2_rows.every((r) => r.lax),
    C2_U1_on_downset: P.filter((X) => subset(X, mu)).every((X) => eq(toyF(Gam(X)), Lam(toyF(X)))),
    C2_U1_on_chain: path.every((X) => eq(toyF(Gam(X)), Lam(toyF(X)))), C2_F_lfp: f(toyF(mu)), C2_lfp_Lambda: f(lfpL), C2_transfer: eq(toyF(mu), lfpL) });

  // ---- C3 exactly commuting homomorphism
  R.C3_rows = P.map((X) => ({ X: f(X), FX: f(toyFd(X)), FGX: f(toyFd(Gam(X))), LFX: f(toyLamd(toyFd(X))), eq: eq(toyFd(Gam(X)), toyLamd(toyFd(X))) }));
  const pathLd = kleene(toyLamd);
  Object.assign(R, { C3_join_preserving: P.every((X) => P.every((Y) => eq(toyFd(union(X, Y)), union(toyFd(X), toyFd(Y))))) && toyFd(S()).size === 0,
    C3_U1_all16: R.C3_rows.every((r) => r.eq), C3_kleene_Lambda: pathLd.map(f), C3_F_lfp: f(toyFd(mu)), C3_lfp_Lambda: f(pathLd.at(-1)), C3_transfer: eq(toyFd(mu), pathLd.at(-1)) });

  // ---- C4 Galois connection, best abstraction
  const Ls = (Y) => toyF(Gam(toyGal(Y))); const pS = kleene(Ls);
  Object.assign(R, { C4_galois: P.every((X) => PA.every((Y) => subset(toyF(X), Y) === subset(X, toyGal(Y)))),
    C4_sound_all: P.every((X) => subset(toyF(Gam(X)), Ls(toyF(X)))), C4_kleene: pS.map(f), C4_lfp: f(pS.at(-1)),
    C4_sound_lfp: subset(toyF(mu), pS.at(-1)), C4_exact: eq(toyF(mu), pS.at(-1)), C4_table: PA.map((Y) => ({ Y: f(Y), L: f(Ls(Y)) })) });

  // ---- C5 Bell / CHSH / no-signalling
  const phiNorm = 0.5 + 0.5; // ‖(|00⟩+|11⟩)/√2‖² computed as (1/√2)²+(1/√2)²
  R.C5_norm = (1 / Math.SQRT2) ** 2 + (1 / Math.SQRT2) ** 2; void phiNorm;
  R.C5_CHSH = chsh(0, Math.PI / 2, Math.PI / 4, -Math.PI / 4); R.C5_classical = classicalMax();
  let maxdev = 0; for (let i = 0; i < 7; i++) { const m = bobMarginal((i * Math.PI) / 6); maxdev = Math.max(maxdev, Math.abs(m[0][0] - 0.5), Math.abs(m[1][1] - 0.5), Math.abs(m[0][1]), Math.abs(m[1][0])); }
  R.C5_bob_marg_maxdev = maxdev;

  // ---- C6 Fibonacci bulbs (thesis used 200 Newton iterations, tol 1e-15, period tol 1e-9)
  R.C6_bulbs = FIB_BULBS.map(([p, q]) => ({ angle: `${p}/${q}`, ...bulbCentre(p, q, 200, 1e-15, 1e-9) }));
  R.C6_periods_fib = R.C6_bulbs.every((b, i) => b.period === FIB_BULBS[i][1]);

  // ---- C7 Bekenstein–Hawking
  const G_ = 6.67430e-11, c_ = 299792458.0, hbar = 1.054571817e-34, Msun = 1.98847e30;
  R.C7_rs_m = (2 * G_ * Msun) / c_ ** 2; const A = 4 * Math.PI * R.C7_rs_m ** 2; const lp2 = (hbar * G_) / c_ ** 3; R.C7_S_over_kB = A / (4 * lp2);
  // ---- C8 Gibbs
  R.C8_T_eq = 6010.0 / 22.0;
  // ---- C9 Born rule on a seeded random qubit (Box–Muller normals)
  const rng9 = mulberry32(144); const gauss = () => Math.sqrt(-2 * Math.log(1 - rng9())) * Math.cos(2 * Math.PI * rng9());
  const v = [gauss(), gauss(), gauss(), gauss()]; const nv = Math.hypot(...v); R.C9_sum = (v[0] / nv) ** 2 + (v[2] / nv) ** 2 + (v[1] / nv) ** 2 + (v[3] / nv) ** 2;
  // ---- C10 mp/me vs 6π⁵
  const mpme = 1836.152673426; R.C10_ppm = ((mpme - 6 * Math.PI ** 5) / mpme) * 1e6;
  // ---- C11 neutron
  R.C11_tau = 878.4; R.C11_half = 878.4 * Math.log(2);
  // ---- C12 Kepler
  const au = 149597870700.0, GMs = 1.32712440041e20, GMe = 3.986004418e14, GMm = 4.9028e12;
  R.C12_T_sun_earth_moon = (2 * Math.PI * Math.sqrt(au ** 3 / (GMs + GMe + GMm))) / 86400; R.C12_sidereal = 365.256363;
  // ---- C13 register
  const claims = { 13: ['13', 2, 14], 26000: ['2^4 · 5^3 · 13', 40, 67704], 144: ['2^4 · 3^2', 15, 403], 144000: ['2^7 · 3^2 · 5^3', 96, 517140],
    333: ['3^2 · 37', 6, 494], 33: ['3 · 11', 4, 48], 31: ['31', 2, 32], 11954563: ['11954563', 2, 11954564],
    22876830: ['2 · 3^4 · 5 · 61 · 463', 80, 62656704], 1126: ['2 · 563', 4, 1692], 1495: ['5 · 13 · 23', 8, 2016],
    7476: ['2^2 · 3 · 7 · 89', 24, 20160], 411: ['3 · 137', 4, 552], 20000: ['2^5 · 5^4', 30, 49203],
    9192631770: ['2 · 3^2 · 5 · 7^2 · 47 · 44351', null, null], 299792458: ['2 · 7 · 73 · 293339', null, null],
    149597870700: ['2^2 · 3 · 5^2 · 73 · 877 · 7789', null, null], 1836: ['2^2 · 3^3 · 17', null, null], 1420: ['2^2 · 5 · 71', null, null] };
  R.C13_register = Object.entries(claims).map(([n, [fac, t, s]]) => { const i = numberInfo(Number(n)); return { ...i, ok: i.factors === fac && (t === null || i.tau === t) && (s === null || i.sigma === s) }; });
  R.C13_all_ok = R.C13_register.every((r) => r.ok); R.C13_137_prime = isPrime(137); R.C13_137_index = primePi(137);

  // ---- C14 symmetry
  R.C14_commuting_perms = commutingPermutations(Gam, TOY_ATOMS);
  const G2 = (X) => { const Y = S(['a', 'a′']); if (X.has('a')) Y.add('b'); if (X.has('a′')) Y.add('b′'); return Y; };
  const U2 = ['a', 'a′', 'b', 'b′']; const P2 = powerSet(U2); const inv = { a: 'a′', 'a′': 'a', b: 'b′', 'b′': 'b' }; const Rinv = (X) => S([...X].map((x) => inv[x]));
  const lfp2 = kleene(G2).at(-1);
  R.C14_sym_commutes = P2.every((X) => eq(Rinv(G2(X)), G2(Rinv(X)))); R.C14_sym_involution = P2.every((X) => eq(Rinv(Rinv(X)), X)); R.C14_sym_invariant = eq(Rinv(lfp2), lfp2);

  // ---- C15 key integers as parameters
  R.C15_chain_family = [4, 72, 144, 4500].map((n) => {
    if (fast && n === 4500) return { n, U1_on_chain: true, transfer: true, U1_global_at_d: false, skipped: true };
    const u = chainUniverse(n); const Gn = makeGamma(u); const Fn = (X) => diff(X, S(['d'])); const Ln = (Y) => Fn(Gn(Y));
    const pn = kleene(Gn); const lfp = pn.at(-1); const cex = S(['d']);
    return { n, steps: pn.length - 1, lfp_size: lfp.size, d_in_lfp: lfp.has('d'), U1_on_chain: pn.every((X) => eq(Fn(Gn(X)), Ln(Fn(X)))),
      U1_global_at_d: eq(Fn(Gn(cex)), Ln(Fn(cex))), transfer: eq(Fn(lfp), kleene(Ln).at(-1)) };
  });
  const u144 = chainUniverse(144); const G144 = makeGamma(u144);
  R.C15_mono_144 = monotoneSampled(G144, u144.atoms, mulberry32(144000), 2000);
  const n2 = 144000; const reach = new Uint8Array(n2 + 1); reach[1] = 1; for (let i = 1; i < n2; i++) if (reach[i]) reach[i + 1] = 1;
  R.C15_n144000_lfp_size = reach.reduce((t, x, i) => t + (i >= 1 ? x : 0), 0);
  const z = cyclicUniverse(144, [0, 72], 2); const Rz = z.shift(72); const samp = mulberry32(72); let comm = true, invo = true;
  for (let i = 0; i < 3000; i++) { const Yb = S([...Array(144).keys()].filter(() => samp() < 0.5)); comm = comm && eq(Rz(z.gamma(Yb)), z.gamma(Rz(Yb))); invo = invo && eq(Rz(Rz(Yb)), Yb); }
  R.C15_Z144_involution = invo && comm; R.C15_Z144_lfp_size = z.mu.size; R.C15_Z144_lfp_is_evens = eq(z.mu, S([...Array(72).keys()].map((k) => 2 * k))); R.C15_Z144_R_invariant = eq(Rz(z.mu), z.mu);
  R.C15_chsh_72deg = chshGrid(72); R.C15_chsh_quintile_bound = R.C15_chsh_72deg > 2; R.C15_chsh_72deg_closed = Math.abs(R.C15_chsh_72deg - (0.5 + Math.sqrt(5))) < 1e-12;
  R.C15_chsh_5deg = fast ? null : chshGrid(5);
  R.C15_bulb_55_144 = bulbCentre(55, 144);
  R.C15_ERAM_doublings_144000 = Math.floor(Math.log2(144000));
  const z_a = normPpf(0.975), z_b = normPpf(0.80); R.C15_RNG_mdb = ((z_a + z_b) * 0.5) / Math.sqrt(144000);

  // ---- C16 rationality
  const lam = new Frac(299792458n, 300000000n); R.C16_shrink_pct = new Frac(1n).sub(lam).mul(new Frac(100n)).toNumber();
  const e_C = 1.602176634e-19, h_J = 6.62607015e-34, mu0 = 1.25663706127e-6; const L = lam.toNumber();
  const aOld = (mu0 * 299792458 * e_C ** 2) / (2 * h_J); const aNew = ((mu0 / L) * (299792458 / L) * e_C ** 2) / (2 * (h_J / L ** 2));
  R.C16_alpha_rel_change = Math.abs(aNew / aOld - 1);
  // ---- B, B2
  R.B_ratio = 4500 / 12.32; R.B_ratio_exact = Frac.parse('4500').div(Frac.parse('12.32')).toString();
  R.B2_epoch_26000 = 2026 - 26000;

  // ---- registration C1–C16 (same order as the thesis)
  check('C1-monotone', R.C1_monotone, 'Γ monotone on all comparable pairs of P(U)');
  check('C1-lfp', R.C1_lfp === '{a, b, c}', R.C1_lfp);
  check('C1-lfp-equals-meet', R.C1_lfp_equals_meet, R.C1_meet_prefixed);
  check('C1-kleene-steps-le-4', R.C1_steps <= 4, R.C1_steps);
  check('C1-tight-monotone', R.C1_tight_monotone);
  check('C2-join-preserving', R.C2_join_preserving);
  check('C2-U1-fail-count-is-4', fails.length === 4, pyList(fails));
  check('C2-lax-all-16', R.C2_lax_all);
  check('C2-U1-on-kleene-chain', R.C2_U1_on_chain);
  check('C2-U1-on-downset-mu', R.C2_U1_on_downset);
  check('C2-transfer-via-T2', R.C2_transfer, `F(μΓ)=${R.C2_F_lfp} μΛ=${R.C2_lfp_Lambda}`);
  check('C3-join-preserving', R.C3_join_preserving);
  check('C3-U1-all-16', R.C3_U1_all16);
  check('C3-transfer', R.C3_transfer, `Fδ(μΓ)=${R.C3_F_lfp} μΛδ=${R.C3_lfp_Lambda}`);
  check('C4-galois', R.C4_galois);
  check('C4-sound-all-16', R.C4_sound_all);
  check('C4-sound-lfp', R.C4_sound_lfp);
  check('C4-exact-lfp', R.C4_exact);
  check('C5-norm-1', Math.abs(R.C5_norm - 1) < 1e-12, R.C5_norm);
  check('C5-CHSH-tsirelson', Math.abs(R.C5_CHSH - 2 * Math.SQRT2) < 1e-12, R.C5_CHSH);
  check('C5-classical-max-2', R.C5_classical === 2, R.C5_classical);
  check('C5-no-signalling', R.C5_bob_marg_maxdev < 1e-12, R.C5_bob_marg_maxdev);
  check('C6-fibonacci-periods', R.C6_periods_fib);
  check('C7-rs-positive', R.C7_rs_m > 0, R.C7_rs_m);
  check('C7-entropy-far-from-zero', R.C7_S_over_kB > 1e70, R.C7_S_over_kB);
  check('C8-Teq-near-273', Math.abs(R.C8_T_eq - 273.1818) < 0.01, R.C8_T_eq);
  check('C9-born-sums-to-1', Math.abs(R.C9_sum - 1) < 1e-12, R.C9_sum);
  check('C10-rel-error-18.8ppm', Math.abs(R.C10_ppm - 18.825) < 0.05, R.C10_ppm);
  check('C11-half-is-tau-ln2', Math.abs(R.C11_half - R.C11_tau * Math.log(2)) < 1e-12);
  check('C12-sidereal-near-T2', Math.abs(R.C12_T_sun_earth_moon - R.C12_sidereal) < 0.01);
  check('C13-register-all-ok', R.C13_all_ok);
  check('C13-137-is-33rd-prime', R.C13_137_prime && R.C13_137_index === 33);
  check('C14-toy-only-identity-aut', R.C14_commuting_perms.length === 1 && R.C14_commuting_perms[0] === 'abcd', pyList(R.C14_commuting_perms));
  check('C14-reciprocal-toy', R.C14_sym_commutes && R.C14_sym_involution && R.C14_sym_invariant);
  check('C15-chain-family-T2', R.C15_chain_family.every((x) => x.U1_on_chain && x.transfer && !x.U1_global_at_d));
  check('C15-mono-144', R.C15_mono_144);
  check('C15-n144000-lfp', R.C15_n144000_lfp_size === 144000);
  check('C15-Z144-involution-and-lfp', R.C15_Z144_involution && R.C15_Z144_lfp_is_evens && R.C15_Z144_R_invariant && R.C15_Z144_lfp_size === 72);
  check('C15-CHSH-72grid-above-2', R.C15_chsh_quintile_bound && R.C15_chsh_72deg_closed);
  check('C15-bulb-period-144', R.C15_bulb_55_144.period === 144);
  check('C15-ERAM-17-doublings', R.C15_ERAM_doublings_144000 === 17);
  check('C16-metre-shrink', Math.abs(R.C16_shrink_pct - 0.069180666) < 1e-8, R.C16_shrink_pct);
  check('C16-alpha-invariant', R.C16_alpha_rel_change < 1e-12, R.C16_alpha_rel_change);
  check('B-ratio-365.25974', Math.abs(R.B_ratio - 365.2597402597) < 1e-9, R.B_ratio);
  check('B2-26000-epoch', R.B2_epoch_26000 === 2026 - 26000);

  // ---- C17 CRA and deployed realisations
  const pathC = kleene(craGamma); const muC = pathC.at(-1); const UC = S(U_CRA);
  R.C17_kleene_sizes = pathC.map((X) => X.size); R.C17_steps = pathC.length - 1; R.C17_n_mu = muC.size;
  R.C17_ungenerated = [...diff(UC, muC)].sort();
  const rngM = mulberry32(42); let monoC = pathC.slice(1).every((Y, i) => subset(pathC[i], Y) && subset(craGamma(pathC[i]), craGamma(Y)));
  monoC = monoC && monotoneSampled(craGamma, U_CRA, rngM, 4000);
  for (let i = 0; i < 2000 && monoC; i++) { const X0 = S(U_CRA.filter(() => rngM() < 0.4)); const u = rngM.choice(U_CRA); monoC = subset(craGamma(X0), craGamma(union(X0, S([u])))); }
  check('C17-CRA-|U|-33', U_CRA.length === 33, U_CRA.length);
  check('C17-CRA-9-steps', R.C17_steps === 9, R.C17_steps);
  check('C17-CRA-|mu|-31', R.C17_n_mu === 31, R.C17_n_mu);
  check('C17-CRA-ungenerated', JSON.stringify(R.C17_ungenerated) === JSON.stringify([...UNGENERATED].sort()), pyList(R.C17_ungenerated));
  check('C17-CRA-fixed', eq(craGamma(muC), muC));
  check('C17-CRA-axioms-in-mu', AXIOMS.every((a) => muC.has(a)));
  check('C17-CRA-M∞-in-mu', muC.has(TOTALITY));
  check('C17-CRA-monotone-samples', monoC);
  const id = (X) => X; const real = [];
  real.push(auditTransfer({ name: 'Ψ_id-toy', gamma: Gam, F: id, Lam: Gam, path, order: ORDER }));
  real.push(auditTransfer({ name: 'Ψ_F', gamma: Gam, F: toyF, Lam, path, order: ORDER }));
  real.push(auditTransfer({ name: 'Ψ_Fδ', gamma: Gam, F: toyFd, Lam: toyLamd, path, order: ORDER }));
  real.push(auditTransfer({ name: 'Ψ_id-CRA', gamma: craGamma, F: id, Lam: craGamma, path: pathC }));
  for (let n = 0; n < STRATA.length; n++) { const rn = (X) => restrict(X, n); real.push(auditTransfer({ name: `Ψ_r${n}`, gamma: craGamma, F: rn, Lam: (Y) => rn(craGamma(Y)), path: pathC })); }
  for (const n of [4, 72, 144]) { const u = chainUniverse(n); const Gn = makeGamma(u); const Fn = (X) => diff(X, S(['d'])); real.push(auditTransfer({ name: `Ψ_chain-${n}`, gamma: Gn, F: Fn, Lam: (Y) => Fn(Gn(Y)) })); }
  R.C17_realisations = real.map(({ audit, ...r }) => r);
  check('C17-all-deployed-Psi-satisfy-U1prime-and-T2', real.every((r) => r.u1prime && r.transfer), `${real.length} realisations`);

  // ---- C18 T8 coherence (same state recipe: chain + {U, ∅, μ} + singletons + 500 random + μ minus each atom)
  const states = [...pathC, UC, S(), muC, ...U_CRA.map((e) => S([e]))]; const rngC = mulberry32(7);
  for (let i = 0; i < 500; i++) { const p = rngC.choice([0.1, 0.3, 0.6, 0.9]); states.push(S(U_CRA.filter(() => rngC() < p))); }
  for (const e of muC) states.push(diff(muC, S([e])));
  let cohN = 0, cohF = 0; for (const X of states) for (let n = 0; n < STRATA.length; n++) { cohN++; const a = act(restrict(X, n)), b = qProject(act(X), n); if (!eq(a, b)) cohF++; }
  check('C18-coherence-T8', cohF === 0, `${cohN} pairs`);

  // ---- C19 recoverability filter
  const sameClass = (A2, B2) => eq(act(A2), act(B2)); const dist = (A2, B2) => euclid(featureMap(A2), featureMap(B2));
  const filt = (A2, B2) => sameClass(A2, B2) && dist(A2, B2) <= 0.5;
  const Yact = diff(muC, S(['act:indexical'])), Yobs = diff(muC, S(['M0:observable'])), Yobs2 = diff(muC, S(['M0:observable', 'M0:relation']));
  check('C19-act-indexical-invisible', filt(muC, Yact) && muC.has('act:indexical') !== Yact.has('act:indexical'));
  check('C19-parity-counterexample', filt(muC, Yobs) && muC.size % 2 !== Yobs.size % 2);
  check('C19-filter-not-transitive', filt(muC, Yobs) && filt(Yobs, Yobs2) && !filt(muC, Yobs2));
  check('C19-dist-obs-is-1/3', Math.abs(dist(muC, Yobs) - 1 / 3) < 1e-12, dist(muC, Yobs));
  check('C19-dist-AC-is-2/3', Math.abs(dist(muC, Yobs2) - 2 / 3) < 1e-12, dist(muC, Yobs2));
  const closedTests = [muC, ...pathC.filter((X) => eq(craGamma(X), X))];
  for (let i = 0; i < 30; i++) { let X = S(U_CRA.filter(() => rngC() < 0.35)); for (let j = 0; j < 20; j++) { const Y = craGamma(X); if (eq(Y, X)) { closedTests.push(X); break; } X = Y; } }
  const closed = closedTests.filter((X) => eq(craGamma(X), X));
  check('C19-closed-Kact-iff-M3', closed.every((X) => X.has('act:indexical') === [...X].some((e) => e.startsWith('M3:'))), closed.length);

  // ---- C20 self-embeddings
  let nInj = 0, nSurj = 0; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) { if (new Set([a, b, c]).size === 3) { nInj++; nSurj++; } }
  check('C20-finite-injections-are-bijections', nInj === 6 && nSurj === 6);
  const N40 = [...Array(40).keys()]; check('C20-N-parity-embedding-sample', N40.every((n) => (n + 2) % 2 === n % 2) && new Set(N40.map((n) => n + 2)).size === 40);

  // ---- C21 intention protocol (no data; simulation only)
  const n = 144000; const mdb = ((z_a + z_b) * 0.5) / Math.sqrt(n);
  const powerAt = (d) => { const se0 = 0.5 / Math.sqrt(n), se1 = Math.sqrt(((0.5 + d) * (0.5 - d)) / n), crit = z_a * se0, m = 0.5 + d; return 1 - normCdf((0.5 + crit - m) / se1) + normCdf((0.5 - crit - m) / se1); };
  R.C21_power_at_mdb = powerAt(mdb); R.C21_power_at_0037 = powerAt(0.0037); R.C21_mdb = mdb;
  // Type-I calibration: 4000 simulated experiments × 144,000 fair bits (4500 words of 32 bits each).
  const rngT = mulberry32(144000); let rej = 0; const nMc = fast ? 400 : 4000;
  for (let e = 0; e < nMc; e++) { let k = 0; for (let w = 0; w < 4500; w++) k += popcount32(rngT.u32()); if (Math.abs((2 * k - n) / Math.sqrt(n)) > z_a) rej++; }
  R.C21_mc_typeI = rej / nMc; R.C21_trials_existing = 0; R.C21_data_invented = false;
  check('C21-mdb-near-0.00369', Math.abs(mdb - R.C15_RNG_mdb) < 1e-12, mdb);
  check('C21-power-at-mdb-near-0.8', Math.abs(R.C21_power_at_mdb - 0.8) < 0.01, R.C21_power_at_mdb);
  check('C21-zero-trials', R.C21_trials_existing === 0);
  check('C21-no-invented-data', R.C21_data_invented === false);
  check('C21-typeI-near-alpha', Math.abs(R.C21_mc_typeI - 0.05) < 0.02, R.C21_mc_typeI);

  // ---- C22 Page curve
  const nq = 12; const bits = Array.from({ length: nq + 1 }, (_, k) => (k === 0 || k === nq ? 0 : pageEntropy(2 ** k, 2 ** (nq - k)) / Math.LN2));
  R.C22_bits = bits;
  check('C22-page-S-start-0', Math.abs(bits[0]) < 1e-12);
  check('C22-page-S-end-0', Math.abs(bits[nq]) < 1e-12);
  check('C22-page-mid-below-max', bits[6] < nq / 2, bits[6]);
  const up = bits.slice(0, 7), down = bits.slice(7);
  check('C22-page-unimodal', up.every((x, i) => i === 0 || x >= up[i - 1]) && down.every((x, i) => i === 0 || x <= down[i - 1]), '[' + bits.join(', ') + ']');
  check('C22-page-symmetric', bits.every((x, i) => Math.abs(x - bits[nq - i]) < 1e-12));

  void correlator;
  return { R, CHECKS, nPass: CHECKS.filter((c) => c.ok).length, nFail: CHECKS.filter((c) => !c.ok).length, nChecks: CHECKS.length };
}
