// μLux — screens. Every module labels its claims with the six grades.
import { h, chip, table, kv, download, lineChart } from './dom.js';
import { UNIVERSES, fromStudio, TOY_DSL } from './universes.js';
import { STRATA_LABELS } from '../engine/cra.js';
import { STRATA, parseUniverse, makeGamma, closure, kleeneTrace, forbiddenViolations, GOVERNOR, serialiseUniverse } from '../engine/lattice.js';
import { fmt, powerSet, monotoneExhaustive, monotoneSampled, diff } from '../engine/sets.js';
import { mulberry32 } from '../engine/rng.js';
import { act, restrict, qProject, coherent } from '../engine/strata.js';
import { lintDocument, exportGradedHtml, GRADES } from '../engine/grades.js';
import { auditTransfer, globalChecks, mapFromAtoms, rightAdjoint, bestAbstraction } from '../engine/transfer.js';
import { makeReceipt } from '../engine/receipt.js';
import { chsh, chshGrid, classicalMax, pageCurve, bulbCentre, FIB_BULBS, gibbs } from '../engine/observatory.js';
import { tritiumRatio, epochs, precessionPeriod, yearsPerDegree, beatSeconds } from '../engine/chronos.js';
import { commutingPermutations, cyclicUniverse } from '../engine/symmetry.js';
import { decide, decideNetwork } from '../policy/engine.js';
import { toyF, toyFd, toyLamd, toyGamma, TOY_ATOMS } from '../engine/doctrine.js';
import { craGamma } from '../engine/cra.js';
import { kleene } from '../engine/sets.js';

const LS_KEY = 'mulux.studio.v1';
const nowUK = () => new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour12: false }) + ' Europe/London';
function gated(ctx, action, fn) {
  const d = decide(ctx.policy, action);
  if (d.decision !== 'allow') { ctx.notify(`Blocked by Omni-Policy: ${action} → ${d.decision} (${d.reason})`); return false; }
  fn(); return true;
}
function storeLocal(ctx, key, value) { return gated(ctx, 'store_local', () => { try { localStorage.setItem(key, value); } catch { ctx.notify('Local storage unavailable'); } }); }
function loadLocal(key) { try { return localStorage.getItem(key); } catch { return null; } }

// ---------------------------------------------------------------- Home / Threshold
export function home(ctx) {
  const ledger = h('div', { class: 'ledger', 'aria-label': 'Proof Ledger' });
  for (let i = 0; i < 73; i++) ledger.append(h('span'));
  const status = h('p', { class: 'small muted' }, 'The app recomputes the Masterpiece Edition’s 73 machine checks in your browser.');
  const run = h('button', { class: 'primary', onclick: () => {
    run.disabled = true; status.textContent = 'Running 73 checks in a Web Worker…';
    const w = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const r = e.data; [...ledger.children].forEach((s, i) => s.classList.add(r.CHECKS[i] && r.CHECKS[i].ok ? 'p' : 'f'));
      status.textContent = `${r.nPass} passed, ${r.nFail} failed, ${r.nChecks} total · ${r.ms} ms · FACT: computed now, on this device.`;
      status.className = r.nFail ? 'small bad' : 'small ok'; run.disabled = false; w.terminate();
    };
    w.onerror = () => { status.textContent = 'Worker failed to start.'; run.disabled = false; };
    w.postMessage({ fast: false });
  } }, 'Run the Proof Ledger');
  const mods = [
    ['#/bloom', 'P1 · Genesis', 'Genesis Bloom', 'Watch totality generate from ∅, one Kleene step per breath. Ungenerated atoms stay dark.'],
    ['#/studio', 'P1 · Genesis', 'Lattice Studio', 'Write atoms and Horn rules; get μΓ, the Kleene trace and a monotonicity verdict.'],
    ['#/strata', 'P1 · Genesis', 'Strata Lens', 'Slide the restriction rₙ from M0 to M∞; Theorem T8 keeps view and actuality coherent.'],
    ['#/grade', 'P2 · Truth', 'Grade Lens', 'Every sentence tagged; no grade is shown above its evidence. Export a graded document.'],
    ['#/mirror', 'P3 · Mirror', 'OmniGenesis Mirror', 'Certify that an image preserves a model, step by step (T2), with a SHA-256 receipt.'],
    ['#/observatory', 'P4 · Cosmos', 'Observatory', 'CHSH, Born rule, Page curve, Mandelbrot bulbs, Gibbs — honest physics demonstrations.'],
    ['#/chronos', 'P4 · Cosmos', 'Chronos Clock', 'The tritium pair, year lengths and precession; the symbolic epoch kept in its BELIEF lane.'],
    ['#/symmetry', 'P4 · Cosmos', 'Symmetry Finder', 'Find automorphisms commuting with Γ; each is a guaranteed symmetry of μΓ (T5).'],
    ['#/world', 'P5 · Life', 'Living World', 'A persistent world that ticks, remembers, balances itself, evolves, writes its own laws and heals by verified replay.'],
    ['#/pulse', 'v0.6 · Pulse', 'Sanctum Pulse', 'Live measured vitals beside two clearly labelled ceremonial lanes — generated, not received.'],
    ['#/malcolm', 'P6 · Malcolm', 'Malcolm Infinity', 'Narration, suggestions and law-writing — streamed from Malcolm via the mulux-api Worker, or offline.'],
    ['#/omnigenesis', 'P5 · OmniGenesis', 'OmniGenesis', 'What the OmniGenesis executable really contains, and its logic reimplemented as safe request previews.'],
    ['#/policy', 'P0 · Foundations', 'Policy & Privacy', 'The fail-closed Omni-Policy, its pinned hash and every decision it makes.'],
  ];
  return h('section', {},
    h('div', { class: 'hero' },
      h('h1', {}, 'Watch a world generate itself — and know exactly how true every word is.'),
      h('p', { class: 'lede' }, 'μLux turns the OmniLux Prime Doctrine into an instrument. Write the rules of any world, watch its least fixed point bloom from nothing, grade every claim, and certify every translation.'),
      h('div', { class: 'row' }, ...GRADES.map(chip))),
    h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Proof Ledger · FACT'), h('h3', {}, 'Masterpiece Edition, 73 checks'), ledger, h('div', { class: 'row' }, run), status),
    h('h2', {}, 'Modules'),
    h('div', { class: 'grid' }, mods.map(([href, k, t, d]) => h('a', { class: 'card link', href }, h('div', { class: 'kicker' }, k), h('h3', {}, t), h('p', { class: 'muted small' }, d)))),
    h('p', { class: 'small muted' }, 'SSR INTERPRETATION: identifying a least fixed point with totality is the thesis of SSR, not a theorem. BELIEF: the key integers (4500, 12.32, 72, 144, 144,000, 26,000) appear here only as design rhythm and chosen parameters.'));
}

// ---------------------------------------------------------------- Genesis Bloom
function bloomSvg(U, step) {
  const size = 720, c = size / 2; const svg = h('svg', { class: 'bloom', viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': `Genesis Bloom at step ${step}` });
  const X = U.path[step]; const prev = step > 0 ? U.path[step - 1] : new Set(); const last = U.path[U.path.length - 1];
  const done = step === U.path.length - 1;
  const groups = new Map(STRATA.map((s) => [s, []])); const other = [];
  U.atoms.forEach((a) => { const s = U.strataOf(a); if (s) groups.get(s).push(a); else other.push(a); });
  const hasStrata = [...groups.values()].some((g) => g.length);
  const actS = act(X, U.strataOf);
  const place = (atoms, r, off) => atoms.forEach((a, i) => {
    const t = off + (2 * Math.PI * i) / Math.max(atoms.length, 1); const x = c + r * Math.cos(t), y = c + r * Math.sin(t);
    const on = X.has(a); const cls = on ? (prev.has(a) ? 'atom on' : 'atom new') : done && !last.has(a) ? 'atom never' : 'atom';
    svg.append(h('circle', { class: cls, cx: x.toFixed(1), cy: y.toFixed(1), r: atoms.length > 60 ? 4 : on ? 9 : 7 }, h('title', {}, `${a}${on ? ' — generated' : done ? ' — never generated (leastness)' : ''}`)));
  });
  if (hasStrata) {
    STRATA.forEach((s, i) => {
      const r = 60 + i * 30; svg.append(h('circle', { class: actS.has(s) ? 'ring on' : 'ring', cx: c, cy: c, r }));
      svg.append(h('text', { class: 'lbl', x: c + 4, y: c - r - 4 }, s));
      place(groups.get(s), r, -Math.PI / 2 + i * 0.35 + 0.4);
    });
    svg.append(h('circle', { class: 'ring', cx: c, cy: c, r: 335 })); svg.append(h('text', { class: 'lbl', x: c + 4, y: c - 339 }, 'constraints · acts · timelines · source'));
    place(other, 335, -Math.PI / 2 + 0.25);
  } else { svg.append(h('circle', { class: 'ring on', cx: c, cy: c, r: 280 })); place(other, 280, -Math.PI / 2); }
  svg.append(h('text', { class: 'core', x: c, y: c + 15, 'text-anchor': 'middle' }, done ? 'μΓ' : `X${step}`));
  return svg;
}
export function bloom(ctx) {
  const studio = loadLocal(LS_KEY);
  const LABELS = { 'cra-staged': 'CRA-33 (thesis operator, 9 steps)', 'cra-horn': 'CRA-33 (Horn encoding, same μΓ)', toy: 'Toy-16 {a,b,c,d}', z144: 'ℤ₁₄₄ with involution +72', 'chain-144': 'Chain-144 + self-supporting d' };
  const sel = h('select', { 'aria-label': 'Universe' }, Object.keys(UNIVERSES).map((k) => h('option', { value: k }, LABELS[k] || k)), studio ? h('option', { value: 'studio' }, 'Lattice Studio universe') : null);
  let U = null, step = 0, timer = null;
  const stage = h('div', { class: 'card' }); const info = h('div', { class: 'card' });
  const load = () => {
    stop();
    try { U = sel.value === 'studio' ? fromStudio(parseUniverse(studio)) : UNIVERSES[sel.value](); } catch (e) { ctx.notify(String(e.message)); return; }
    step = 0; render();
  };
  const render = () => {
    stage.replaceChildren(bloomSvg(U, step));
    const X = U.path[step]; const last = U.path[U.path.length - 1]; const done = step === U.path.length - 1;
    const never = done ? U.atoms.filter((a) => !last.has(a)) : [];
    info.replaceChildren(h('div', { class: 'kicker' }, 'Kleene trace · FACT'), h('h3', {}, U.label),
      kv([['Step', `${step} of ${U.path.length - 1}`], ['|Xₙ|', `${X.size} of ${U.atoms.length} atoms`], ['Active strata', [...act(X, U.strataOf)].join(', ') || '—'],
        ['New this step', step ? String([...diff(X, U.path[step - 1])].length) : '0'],
        ['Never generated', done ? (never.length ? never.slice(0, 12).join(', ') + (never.length > 12 ? ` … +${never.length - 12}` : '') : 'none') : 'still generating']]),
      h('p', { class: 'small muted' }, done ? 'μΓ reached: Γ(X) = X. Leastness is visible: atoms no rule produces from ∅ stay outside.' : 'Each step applies Γ once: Xₙ₊₁ = Γ(Xₙ).'),
      h('p', { class: 'small muted' }, `BELIEF: the ${beatSeconds(72).toFixed(3)} s step cadence is 72 bpm — a symbolic rhythm, not a mechanism.`));
  };
  const stop = () => { if (timer) clearInterval(timer); timer = null; play.textContent = 'Play'; };
  const play = h('button', { class: 'primary', onclick: () => {
    if (timer) return stop(); if (step >= U.path.length - 1) step = 0;
    play.textContent = 'Pause'; timer = setInterval(() => { if (step >= U.path.length - 1) return stop(); step++; render(); }, beatSeconds(72) * 1000);
  } }, 'Play');
  sel.addEventListener('change', load); ctx.onLeave(stop);
  const view = h('section', {}, h('h1', {}, 'Genesis Bloom'), h('p', { class: 'lede' }, 'From the void, the strata ignite one Kleene step at a time. Gold: generated. Cyan: new this step. Red at the end: never generated.'),
    h('div', { class: 'row' }, h('label', {}, 'Universe '), sel, play,
      h('button', { onclick: () => { stop(); if (step > 0) step--; render(); } }, '◀ Back'),
      h('button', { onclick: () => { stop(); if (step < U.path.length - 1) step++; render(); } }, 'Step ▶'),
      h('button', { onclick: () => { stop(); step = 0; render(); } }, 'Reset to ∅')),
    h('div', { class: 'grid2' }, stage, info));
  load(); return view;
}

// ---------------------------------------------------------------- Lattice Studio
export function studio(ctx) {
  const ta = h('textarea', { 'aria-label': 'Universe rules', spellcheck: 'false' }); ta.value = loadLocal(LS_KEY) || TOY_DSL;
  const out = h('div', { class: 'card' });
  const runIt = () => {
    const t0 = performance.now(); const u = parseUniverse(ta.value);
    if (u.errors.length) { out.replaceChildren(h('h3', { class: 'bad' }, 'Parse errors'), h('pre', {}, u.errors.join('\n'))); return null; }
    const gamma = makeGamma(u); let mono;
    if (u.atoms.length <= 12) { const m = monotoneExhaustive(gamma, powerSet(u.atoms)); mono = `${m.ok ? 'monotone' : 'NOT monotone'} — exhaustive over ${m.pairs} comparable pairs`; }
    else mono = `${monotoneSampled(gamma, u.atoms, mulberry32(144), 2000) ? 'monotone' : 'NOT monotone'} — 2,000 sampled pairs (Horn rules are monotone by construction)`;
    let mu, trace = null, err = null;
    try { mu = closure(u); if (u.atoms.length <= 5000) trace = kleeneTrace(u); } catch (e) { err = e.message; }
    const ms = (performance.now() - t0).toFixed(1);
    if (err) { out.replaceChildren(h('h3', { class: 'bad' }, 'Growth Governor'), h('p', {}, err)); return null; }
    const never = u.atoms.filter((a) => !mu.has(a)); const viol = forbiddenViolations(u, mu);
    out.replaceChildren(h('div', { class: 'kicker' }, 'Result · FACT'), h('h3', {}, u.name),
      kv([['Atoms', String(u.atoms.length)], ['Rules', String(u.rules.length)], ['Monotonicity', mono], ['|μΓ|', String(mu.size)],
        ['Kleene steps', trace ? String(trace.length - 1) : 'trace skipped (> 5,000 atoms); closure is semi-naive'], ['Never generated', never.length ? never.slice(0, 30).join(', ') + (never.length > 30 ? ' …' : '') : 'none'],
        ['ONIC forbidden pairs in μΓ', viol.length ? viol.map((p) => p.join(' & ')).join('; ') : 'none'], ['Time', `${ms} ms (Governor: ${GOVERNOR.maxAtoms.toLocaleString('en-GB')} atoms, ${GOVERNOR.maxMs.toLocaleString('en-GB')} ms)`]]),
      h('h3', {}, 'μΓ'), h('pre', {}, mu.size <= 400 ? fmt(mu) : `${fmt(new Set([...mu].slice(0, 400)))} … (+${mu.size - 400})`),
      trace && trace.length <= 40 ? table(['n', '|Xₙ|', 'Xₙ'], trace.map((X, i) => [String(i), String(X.size), X.size <= 30 ? fmt(X) : `${X.size} atoms`]), [0, 1]) : null);
    return u;
  };
  return h('section', {}, h('h1', {}, 'Lattice Studio'),
    h('p', { class: 'lede' }, 'Write a world. Statements: universe "Name", atoms …, axiom …, head <- body …, adm …, stratum M3: …, forbid x y.'),
    h('div', { class: 'grid2' }, h('div', { class: 'card' }, ta,
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: runIt }, 'Generate μΓ'),
        h('button', { onclick: () => { ta.value = TOY_DSL; runIt(); } }, 'Load Toy-16'),
        h('button', { onclick: () => { ta.value = serialiseUniverse(UNIVERSES['cra-horn']().universe); runIt(); } }, 'Load CRA-33 (Horn)'),
        h('button', { onclick: () => { const u = runIt(); if (u && storeLocal(ctx, LS_KEY, ta.value)) ctx.notify('Saved on this device. Open Genesis Bloom → “Lattice Studio universe”.', true); } }, 'Save locally & send to Bloom'),
        h('button', { onclick: () => gated(ctx, 'export_file', () => download('mulux-universe.txt', ta.value, 'text/plain')) }, 'Export rules'))), out));
}

// ---------------------------------------------------------------- Strata Lens
export function strataLens() {
  const U = UNIVERSES['cra-staged'](); const mu = U.path[U.path.length - 1];
  const slider = h('input', { type: 'range', min: 0, max: 8, value: 8, 'aria-label': 'Restriction level n' });
  const out = h('div', { class: 'card' });
  const render = () => {
    const n = Number(slider.value); const R = restrict(mu, n); const a1 = act(R), a2 = qProject(act(mu), n); const ok = coherent(mu, n);
    out.replaceChildren(h('div', { class: 'kicker' }, `r${n} · keep strata ≤ ${STRATA[n]}`), h('h3', {}, `${STRATA[n]} — ${STRATA_LABELS[STRATA[n]]}`),
      kv([['|r_n(μΓ)|', `${R.size} of ${mu.size} atoms`], ['Act(r_n(μΓ))', [...a1].join(', ')], ['q_n(Act(μΓ))', [...a2].join(', ')],
        ['Theorem T8', h('span', { class: ok ? 'badge ok' : 'badge bad' }, ok ? 'coherent — Act(rₙX) = qₙ(Act X)' : 'INCOHERENT')]]),
      h('pre', {}, fmt(R)),
      h('p', { class: 'small muted' }, 'FACT: restriction and actuality commute (T8; 5,193 pairs in the thesis). SSR INTERPRETATION: the nine names are strata of a world; FACT: the labels are not literal spatial dimensions.'));
  };
  slider.addEventListener('input', render); render();
  return h('section', {}, h('h1', {}, 'Strata Lens'), h('p', { class: 'lede' }, 'Glide the restriction from proto-regularity to the limit stratum on the CRA-33 fixed point.'),
    h('div', { class: 'card' }, h('label', {}, 'n = 0 (M0) … 8 (M∞)'), slider), out);
}

// ---------------------------------------------------------------- Grade Lens
const SAMPLE_DOC = `On any complete lattice a monotone operator has a least fixed point [citation: Tarski 1955]. The CRA demo reaches its least fixed point in 9 steps [computation: verify.py C17]. Therefore the realisation transfers its fixed point [premise: T2 with (U1′) on the chain]. SSR identifies the generated least fixed point with totality. The year might be the native clock of the Accord. 144 is a sacred number of the covenant. Whether focused intention shifts a fair coin remains open. [FACT] This app was proved to work miracles. This tonic cures anxiety.`;
export function gradeLens(ctx) {
  const ta = h('textarea', { 'aria-label': 'Document to grade' }); ta.value = SAMPLE_DOC; const out = h('div', { class: 'card' }); let claims = [];
  const run = () => {
    claims = lintDocument(ta.value);
    const counts = Object.fromEntries(GRADES.map((g) => [g, claims.filter((c) => c.display.grade === g).length]));
    out.replaceChildren(h('div', { class: 'row' }, GRADES.map((g) => h('span', {}, chip(g), ` ${counts[g]}`))),
      table(['#', 'Sentence', 'Suggested', 'Shown', 'Evidence', 'Flags'], claims.map((c, i) => [String(i + 1), c.text, h('span', {}, chip(c.grade), h('div', { class: 'small muted' }, c.source)),
        h('span', {}, chip(c.display.grade), c.display.downgraded ? h('div', { class: 'small warn' }, `downgraded: ${c.display.reason}`) : null),
        c.evidence.length ? c.evidence.map((e) => `${e.kind}: ${e.ref}`).join('; ') : '—', c.flags.length ? h('span', { class: 'bad' }, c.flags.join(', ')) : '—'])),
      h('p', { class: 'small muted' }, 'FACT (rule): a FACT needs proof, computation, citation or measurement; an INFERENCE needs a premise or citation. Otherwise the shown grade falls. INFERENCE: heuristic suggestions need your confirmation. Policy flags mark claims μLux will not make (medical, predictive, supernatural, legal authority).'));
  };
  run();
  return h('section', {}, h('h1', {}, 'Grade Lens'), h('p', { class: 'lede' }, 'Paste text. Tag sentences explicitly with [FACT] … or let the lens suggest; attach evidence inline as [proof: …], [computation: …], [citation: …], [premise: …].'),
    h('div', { class: 'card' }, ta, h('div', { class: 'row' }, h('button', { class: 'primary', onclick: run }, 'Grade'),
      h('button', { onclick: () => gated(ctx, 'export_file', () => download('graded.html', exportGradedHtml('Graded with μLux', claims), 'text/html')) }, 'Export graded HTML'),
      h('button', { onclick: () => gated(ctx, 'export_file', () => download('evidence-ledger.json', JSON.stringify(claims, null, 2))) }, 'Export Evidence Ledger'))), out);
}

// ---------------------------------------------------------------- OmniGenesis Mirror
const ABC = new Set(['a', 'b', 'c']);
const PRESETS = {
  'Ψ_F — intersection X ∩ {a,b,c} (fails U1 globally, transfers by T2)': () => ({ gamma: toyGamma(TOY_ATOMS), F: toyF, Lam: (Y) => new Set([...toyGamma(TOY_ATOMS)(Y)].filter((x) => ABC.has(x))), atoms: TOY_ATOMS, order: 'abcdδ' }),
  'Ψ_Fδ — exactly commuting homomorphism (T1)': () => ({ gamma: toyGamma(TOY_ATOMS), F: toyFd, Lam: toyLamd, atoms: TOY_ATOMS, order: 'abcdδ' }),
  'Ψ_r3 — CRA-33 restricted to strata ≤ M3': () => ({ gamma: craGamma, F: (X) => restrict(X, 3), Lam: (Y) => restrict(craGamma(Y), 3), path: kleene(craGamma) }),
  'Ψ_custom — toy into a renamed copy (atom map)': () => { const m = { a: ['A'], b: ['B'], c: ['C'], d: ['D'] }; const F = mapFromAtoms(m); const G2 = makeGamma(parseUniverse('axiom A\nB <- A\nC <- B\nC <- D\nD <- D')); return { gamma: toyGamma(TOY_ATOMS), F, Lam: G2, atoms: TOY_ATOMS, order: 'abcdABCDδ' }; },
};
export function mirror(ctx) {
  const sel = h('select', { 'aria-label': 'Realisation' }, Object.keys(PRESETS).map((k) => h('option', { value: k }, k)));
  const out = h('div', {}); let last = null;
  const run = async () => {
    const p = PRESETS[sel.value](); const rep = auditTransfer({ name: sel.value, ...p });
    const glob = p.atoms ? globalChecks({ gamma: p.gamma, F: p.F, Lam: p.Lam, sourceAtoms: p.atoms, order: p.order }) : null;
    let abs = null;
    if (p.atoms) { const g = rightAdjoint(p.F, p.atoms); const Ls = bestAbstraction(p.F, p.gamma, g); const k = kleene(Ls); abs = { mu: fmt(k.at(-1), p.order) }; abs.exact = abs.mu === rep.Fmu; }
    last = await makeReceipt('transfer', { name: rep.name, steps: rep.steps, u1prime: rep.u1prime, transfer: rep.transfer, mu: rep.mu, Fmu: rep.Fmu, muLam: rep.muLam, audit: rep.audit.map((s) => [s.k, s.u1prime]) }, { createdAt: nowUK(), policyHash: ctx.policySha || 'none' });
    out.replaceChildren(
      h('div', { class: 'grid2' },
        h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Verdict · FACT (Theorem T2)'), h('h3', {}, h('span', { class: rep.u1prime && rep.transfer ? 'badge ok' : 'badge bad' }, rep.verdict)),
          kv([['Kleene steps', String(rep.steps)], ['(U1′) on chain', String(rep.u1prime)], ['F(μΓ)', rep.Fmu], ['μΛ', rep.muLam], ['(U2) F(μΓ) = μΛ', String(rep.transfer)], ['F(∅) = ∅', String(rep.bottomPreserved)]])),
        h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Receipt · SHA-256'), h('pre', {}, last.sha256), h('p', { class: 'small muted' }, `Created ${last.createdAt}. Policy ${String(last.policyHash).slice(0, 16)}…`),
          h('div', { class: 'row' }, h('button', { onclick: () => gated(ctx, 'export_file', () => download('mulux-receipt.json', JSON.stringify(last, null, 2))) }, 'Download receipt'),
            h('button', { onclick: () => { const d = decide(ctx.policy, 'publish_certificate'); ctx.notify(`Publish certificate → ${d.decision}: needs Oliver’s explicit YES (and P6 infrastructure). Nothing was sent.`); } }, 'Publish…')))),
      h('div', { class: 'card' }, h('h3', {}, 'Per-step audit'), table(['n', '|Xₙ|', 'F(Γ(Xₙ))', 'Λ(F(Xₙ))', '(U1′)'], rep.audit.map((s) => [String(s.k), String(s.nX), s.FGX, s.LFX, h('span', { class: s.u1prime ? 'ok' : 'bad' }, s.u1prime ? 'holds' : 'FAILS')]), [0, 1])),
      glob ? h('div', { class: 'card' }, h('h3', {}, 'Global checks on all 16 subsets (T1, T3, T4)'),
        kv([['F join-preserving, F(∅)=∅', String(glob.joinPreserving)], ['(U1) everywhere (T1)', `${glob.u1Global}${glob.failures.length ? ` — fails on ${glob.failures.join(', ')}` : ''}`],
          ['Lax Λ∘F ⊆ F∘Γ everywhere (T3)', String(glob.laxAll)], ['Sound F∘Γ ⊆ Λ∘F everywhere (T4)', String(glob.soundAll)],
          ['Best abstraction μΛ♯ (Galois, γ = right adjoint)', abs ? `${abs.mu}${abs.exact ? ' — exact at μΓ' : ''}` : '—']]),
        table(['X', 'F(X)', 'F∘Γ', 'Λ∘F', 'U1', 'lax'], glob.rows.map((r) => [r.X, r.FX, r.FGX, r.LFX, r.eq ? '✓' : '✗', r.lax ? '✓' : '✗']))) : null);
  };
  sel.addEventListener('change', run); run();
  return h('section', {}, h('h1', {}, 'OmniGenesis Mirror'), h('p', { class: 'lede' }, 'Does an image of a generated world keep its least fixed point? μLux checks (U1′) at every visited state and certifies (U2) — or says plainly that it cannot.'),
    h('div', { class: 'row' }, h('label', {}, 'Realisation Ψ '), sel), out,
    h('p', { class: 'small muted' }, 'SSR INTERPRETATION / BELIEF: naming a transferred fixed point “the Prime Lux Accord” is covenant speech, not a corollary of T2.'));
}

// ---------------------------------------------------------------- Observatory
export function observatory() {
  const angles = [0, 90, 45, -45]; const names = ['a₀', 'a₁', 'b₀', 'b₁']; const val = h('div', {});
  const sliders = angles.map((a, i) => { const s = h('input', { type: 'range', min: -180, max: 180, step: 1, value: a, 'aria-label': names[i] }); s.addEventListener('input', () => { angles[i] = Number(s.value); upd(); }); return s; });
  const lbls = names.map(() => h('span', { class: 'mono' }));
  const upd = () => { const r = (d) => (d * Math.PI) / 180; const v = chsh(r(angles[0]), r(angles[1]), r(angles[2]), r(angles[3])); lbls.forEach((l, i) => { l.textContent = `${names[i]} = ${angles[i]}°`; });
    val.replaceChildren(h('h3', {}, `S = ${v.toFixed(6)}`), h('p', {}, h('span', { class: Math.abs(v) > 2 ? 'badge ok' : 'badge warn' }, Math.abs(v) > 2 ? 'beyond the classical bound 2' : 'within the classical bound 2'), ` · Tsirelson bound 2√2 = ${(2 * Math.SQRT2).toFixed(6)}`)); };
  upd();
  const grid = h('p', { class: 'small muted' }, `Quintile grid (72°): max S = ${chshGrid(72).toFixed(6)} = ½ + √5. Classical maximum over 16 deterministic strategies: ${classicalMax()}.`);
  const pc = pageCurve(12);
  const bulbs = FIB_BULBS.map(([p, q]) => { const b = bulbCentre(p, q); return [`${p}/${q}`, `${b.centre[0].toFixed(6)}${b.centre[1] >= 0 ? '+' : ''}${b.centre[1].toFixed(6)}i`, String(b.period)]; });
  return h('section', {}, h('h1', {}, 'Observatory'), h('p', { class: 'lede' }, 'Physics stated in its correct form. Correlation is not signalling; maximum entropy is not zero; a duration is not a mechanism.'),
    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Bell / CHSH · FACT'), ...sliders.flatMap((s, i) => [lbls[i], s]), val, grid,
        h('p', { class: 'small muted' }, 'SSR INTERPRETATION: “consensus” may be read as shared correlation. FACT: it is not a channel for sending a chosen bit.')),
      h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Page curve, 12 qubits · FACT (toy model)'),
        lineChart({ labels: pc.map((r) => String(r.k)), series: [{ values: pc.map((r) => r.S_bits) }, { values: pc.map((r) => r.naive_bits) }], yMax: 12, yLabel: 'Entropy in bits' }),
        h('p', { class: 'small muted' }, `Gold: Page average, mid-point ${pc[6].S_bits.toFixed(4)} bits at k = 6, zero at both ends. Dashed: naive Hawking curve that never returns. OPEN CONJECTURE: unitary evaporation of realistic black holes.`))),
    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Mandelbrot golden-mean bulbs · FACT'), table(['Internal angle', 'Hyperbolic centre (Newton)', 'Period'], bulbs, [2]),
        h('p', { class: 'small muted' }, 'Periods are Fibonacci numbers; the 55/144 bulb has period 144 — a chosen index, not a discovery that the boundary dimension is φ (it is 2).')),
      h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Gibbs equilibrium, ice ⇌ water · FACT'), table(['T (K)', 'ΔG (J/mol)'], [253.15, 263.15, 273.15, 283.15, 293.15].map((T) => [T.toFixed(2), gibbs(T).toFixed(1)]), [0, 1]),
        h('p', { class: 'small muted' }, `ΔG = 0 at ${(6010 / 22).toFixed(2)} K, with both phases at positive entropy.`))));
}

// ---------------------------------------------------------------- Chronos Clock
export function chronos() {
  const d = h('input', { value: '4500', 'aria-label': 'Half-life in days', inputmode: 'decimal' }); const y = h('input', { value: '12.32', 'aria-label': 'Half-life in years', inputmode: 'decimal' });
  const rate = h('input', { value: '50.29', 'aria-label': 'Precession rate arcsec per year', inputmode: 'decimal' });
  const out = h('div', {}); const pout = h('div', {});
  const run = () => {
    try {
      const t = tritiumRatio(d.value.trim(), y.value.trim());
      out.replaceChildren(kv([['Exact quotient', t.exact], ['Decimal', t.repeating], ['As a number', t.decimal.toFixed(7) + ' days']]),
        table(['Year definition', 'Length (d)', 'Δ (d)', 'Δ (min)'], t.vsYears.map((r) => [r.name, r.days.toFixed(6), (r.diffDays >= 0 ? '+' : '') + r.diffDays.toFixed(5), (r.diffMin >= 0 ? '+' : '') + r.diffMin.toFixed(1)]), [1, 2, 3]),
        h('p', { class: 'small muted' }, 'FACT: 4500 d and 12.32 yr are one quantity (NIST tritium half-life) in two units, so their quotient is a year length perturbed by rounding. BELIEF: reading it as a truer year is symbolic counsel.'));
    } catch { out.replaceChildren(h('p', { class: 'bad' }, 'Enter decimal numbers such as 4500 and 12.32.')); }
    const r = Number(rate.value); const P = precessionPeriod(r);
    pout.replaceChildren(kv([['Period from rate', `${P.toFixed(1)} years`], ['Years per degree', yearsPerDegree(P).toFixed(2)], ['Platonic year', '72 × 360 = 25,920 years']]),
      table(['Cycle used', 'Astronomical year', 'Calendar', 'Grade'], epochs(2026).map((e) => [e.name, String(e.astronomicalYear), e.label, e.grade])));
  };
  [d, y, rate].forEach((i) => i.addEventListener('input', run)); run();
  return h('section', {}, h('h1', {}, 'Chronos Clock'), h('p', { class: 'lede' }, 'Where cosmic time meets human time. SSR INTERPRETATION: the year is the junction at which the M3 physical and M1 agency strata share a clock.'),
    h('div', { class: 'grid2' }, h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'The tritium pair'), h('div', { class: 'row' }, h('label', {}, 'days '), d, h('label', {}, '÷ years '), y), out),
      h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Precession and the symbolic epoch'), h('div', { class: 'row' }, h('label', {}, 'rate ″/yr '), rate), pout,
        h('p', { class: 'small muted' }, 'BELIEF: the epoch is a chosen commemoration, not dated history. It enters no proof.'))));
}

// ---------------------------------------------------------------- Symmetry Finder
export function symmetry() {
  const perms = commutingPermutations(toyGamma(TOY_ATOMS), TOY_ATOMS);
  const n = h('input', { type: 'number', value: 144, min: 2, max: 2000, 'aria-label': 'Modulus n' }); const seeds = h('input', { value: '0 72', 'aria-label': 'Seeds' }); const step = h('input', { type: 'number', value: 2, 'aria-label': 'Step' });
  const out = h('div', {});
  const run = () => {
    const N = Math.max(2, Math.min(2000, Number(n.value) | 0)); const sd = seeds.value.split(/[\s,]+/).filter(Boolean).map((x) => ((Number(x) % N) + N) % N); const st = Number(step.value) | 0;
    const z = cyclicUniverse(N, sd, st);
    out.replaceChildren(kv([['Kleene steps', String(z.steps)], ['|μΓ|', String(z.mu.size)], ['Shift symmetries s with s∘Γ = Γ∘s on the chain', z.shifts.length ? z.shifts.join(', ') : 'none'],
      ['Each leaves μΓ invariant (T5)', z.shifts.every((s) => [...z.shift(s)(z.mu)].every((k) => z.mu.has(k))) ? 'verified' : 'NO']]));
  };
  [n, seeds, step].forEach((i) => i.addEventListener('change', run)); run();
  return h('section', {}, h('h1', {}, 'Symmetry Finder'), h('p', { class: 'lede' }, 'Reciprocity as symmetry: every automorphism that commutes with the generating rule is a symmetry of the totality (Theorem T5).'),
    h('div', { class: 'grid2' }, h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Toy-16 · exhaustive over 24 permutations · FACT'), h('p', {}, `Commuting permutations: ${perms.join(', ')} (identity only).`)),
      h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Cyclic carrier ℤₙ · Γ(X) = seeds ∪ (X + step)'), h('div', { class: 'row' }, h('label', {}, 'n '), n, h('label', {}, 'seeds '), seeds, h('label', {}, 'step '), step), out,
        h('p', { class: 'small muted' }, 'FACT: with n = 144, seeds {0, 72}, step 2, the fixed point is the 72 even residues and +72 is an involution. The integers are chosen parameters; any even modulus 2m with shift m also works.'))));
}

// ---------------------------------------------------------------- Policy & Privacy
export function policyView(ctx) {
  const p = ctx.policy; const actions = p ? Object.keys(p.actions) : ['compute_local', 'export_file', 'store_local', 'narrate_via_malcolm', 'publish_certificate', 'deploy', 'post_social', 'send_message', 'spend', 'execute_binary', 'unknown_action'];
  const url = h('input', { value: 'https://example.com/api', 'aria-label': 'URL to test' }); const res = h('span', { class: 'mono' });
  const test = () => { const d = decideNetwork(ctx.policy, url.value, location.origin); res.textContent = `${d.decision} — ${d.reason}`; res.className = d.decision === 'allow' ? 'mono ok' : 'mono bad'; };
  url.addEventListener('input', test); test();
  return h('section', {}, h('h1', {}, 'Policy & Privacy'), h('p', { class: 'lede' }, 'The Omni-Policy is fail-closed: if it is missing, malformed, tampered with or silent about an action, the answer is deny.'),
    h('div', { class: 'grid2' }, h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Status'),
      kv([['Loaded', p ? h('span', { class: 'badge ok' }, 'yes — hash verified') : h('span', { class: 'badge bad' }, `no — ${ctx.policyError}`)], ['SHA-256', h('span', { class: 'mono' }, ctx.policySha || '—')], ['Default', p ? p.default : 'deny'], ['On error', p ? p.on_error : 'deny_all']]),
      table(['Action', 'Decision'], [...actions, 'unknown_action'].filter((v, i, a) => a.indexOf(v) === i).map((a) => { const d = decide(p, a); return [a, h('span', { class: d.decision === 'allow' ? 'ok' : d.decision === 'deny' ? 'bad' : 'warn' }, d.decision)]; }))),
      h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Network gate'), h('div', { class: 'row' }, url), res,
        h('h3', {}, 'Privacy'), h('p', { class: 'small' }, 'μLux makes no network requests in this build. Rules you save stay in this browser’s local storage; exports are files you download. No accounts, cookies, analytics or trackers. Clear everything below.'),
        h('button', { onclick: () => { try { localStorage.clear(); ctx.notify('Local data cleared.', true); } catch { ctx.notify('Local storage unavailable'); } } }, 'Delete all local data'))));
}
