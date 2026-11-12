// P2 exit tests: Grade Lens and Evidence Ledger. Property: no displayed grade exceeds its evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GRADES, RANK, EVIDENCE_KINDS, supportedRank, displayedGrade, lintDocument, splitSentences, suggestGrade, forbiddenFlags, exportGradedHtml, escapeHtml } from '../public/js/engine/grades.js';
import { mulberry32 } from '../public/js/engine/rng.js';

test('EXIT (property, 10,000 random claims): displayed rank ≤ supported rank; downgrades only when unsupported', () => {
  const rng = mulberry32(4500); const junk = [null, undefined, {}, { kind: 'proof' }, { kind: 'proof', ref: '   ' }, { kind: 'vibes', ref: 'x' }, { kind: 'citation', ref: 42 }];
  for (let i = 0; i < 10000; i++) {
    const grade = rng() < 0.05 ? 'MADE-UP' : GRADES[Math.floor(rng() * GRADES.length)];
    const evidence = Array.from({ length: Math.floor(rng() * 4) }, () => (rng() < 0.3 ? junk[Math.floor(rng() * junk.length)] : { kind: EVIDENCE_KINDS[Math.floor(rng() * EVIDENCE_KINDS.length)], ref: rng() < 0.85 ? `ref-${i}` : '' }));
    const d = displayedGrade({ grade, evidence });
    assert.ok(GRADES.includes(d.grade)); assert.ok(RANK[d.grade] <= supportedRank(evidence), JSON.stringify({ grade, evidence, d }));
    if (GRADES.includes(grade) && RANK[grade] <= supportedRank(evidence)) assert.equal(d.grade, grade);
  }
});
test('FACT needs proof/computation/citation/measurement; a premise only supports INFERENCE', () => {
  assert.equal(displayedGrade({ grade: 'FACT', evidence: [] }).grade, 'SPECULATION');
  assert.equal(displayedGrade({ grade: 'FACT', evidence: [{ kind: 'premise', ref: 'T2' }] }).grade, 'INFERENCE');
  assert.equal(displayedGrade({ grade: 'FACT', evidence: [{ kind: 'computation', ref: 'verify.py C17' }] }).grade, 'FACT');
  assert.equal(displayedGrade({ grade: 'INFERENCE', evidence: [] }).grade, 'SPECULATION');
  assert.equal(displayedGrade({ grade: 'BELIEF', evidence: [] }).grade, 'BELIEF');
});
test('sentence splitter keeps decimals and abbreviations', () => {
  assert.deepEqual(splitSentences('The half-life is 12.32 yr. It equals 4500 d, e.g. per NIST. Next one?'), ['The half-life is 12.32 yr.', 'It equals 4500 d, e.g. per NIST.', 'Next one?']);
});
test('explicit tags win; heuristics suggest; default is SPECULATION', () => {
  assert.equal(suggestGrade('[BELIEF] 144 resonates.').grade, 'BELIEF');
  assert.equal(suggestGrade('OPEN CONJECTURE: evaporation is unitary.').grade, 'OPEN CONJECTURE');
  assert.equal(suggestGrade('The theorem was proved by Tarski.').grade, 'FACT');
  assert.equal(suggestGrade('Numerology links 72 and 144.').grade, 'BELIEF');
  assert.equal(suggestGrade('SSR identifies totality with the fixed point.').grade, 'SSR INTERPRETATION');
  assert.equal(suggestGrade('Whether intention shifts a coin remains open.').grade, 'OPEN CONJECTURE');
  assert.equal(suggestGrade('Blue is nice.').grade, 'SPECULATION');
});
test('inline evidence is parsed and a sourced FACT stays FACT; an unsourced one falls', () => {
  const c = lintDocument('The CRA reaches μΓ in 9 steps [computation: verify.py C17]. [FACT] The moon is cheese.');
  assert.equal(c[0].display.grade, 'FACT'); assert.equal(c[1].grade, 'FACT'); assert.equal(c[1].display.grade, 'SPECULATION'); assert.ok(c[1].display.downgraded);
});
test('policy forbid list flags medical, predictive, supernatural and legal-authority claims', () => {
  assert.deepEqual(forbiddenFlags('This tonic cures anxiety.'), ['medical_advice']);
  assert.deepEqual(forbiddenFlags('The Accord is legally binding on the UK.'), ['legal_or_statutory_authority']);
  assert.deepEqual(forbiddenFlags('It is guaranteed to rise.'), ['future_prediction']);
  assert.deepEqual(forbiddenFlags('Chanting manifests wealth.'), ['supernatural_efficacy']);
  assert.deepEqual(forbiddenFlags('The least fixed point is {a, b, c}.'), []);
});
test('graded HTML export escapes user text (no script injection)', () => {
  const html = exportGradedHtml('<b>T</b>', lintDocument('[FACT] <script>alert(1)</script> is here [citation: "x" & <y>].'));
  assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;/); assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
});
