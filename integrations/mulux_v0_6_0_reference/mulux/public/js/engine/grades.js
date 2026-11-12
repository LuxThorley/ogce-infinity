// μLux — Grade Lens + Evidence Ledger.
// FACT (method, from the Doctrine): no statement may rise in grade by assertion, repetition or proximity.
// Rule implemented here: a claim's DISPLAYED grade never exceeds what its attached evidence supports.
export const GRADES = ['FACT', 'INFERENCE', 'SPECULATION', 'BELIEF', 'SSR INTERPRETATION', 'OPEN CONJECTURE'];
export const EVIDENCE_KINDS = ['proof', 'computation', 'citation', 'measurement', 'premise', 'open-status'];
// Support rank: FACT (3) needs proof/computation/citation/measurement; INFERENCE (2) needs ≥1 premise or citation;
// the other grades (1) make no evidential claim, so they never "rise".
export const RANK = { FACT: 3, INFERENCE: 2, SPECULATION: 1, BELIEF: 1, 'SSR INTERPRETATION': 1, 'OPEN CONJECTURE': 1 };
const FACT_KINDS = new Set(['proof', 'computation', 'citation', 'measurement']);
const INF_KINDS = new Set(['premise', 'citation', 'proof', 'computation', 'measurement']);

export function supportedRank(evidence = []) {
  const valid = evidence.filter((e) => e && EVIDENCE_KINDS.includes(e.kind) && typeof e.ref === 'string' && e.ref.trim().length > 0);
  if (valid.some((e) => FACT_KINDS.has(e.kind))) return 3;
  if (valid.some((e) => INF_KINDS.has(e.kind))) return 2;
  return 1;
}
// Returns the grade to display plus a reason. Unsupported FACT/INFERENCE fall to SPECULATION (flagged).
export function displayedGrade(claim) {
  const declared = GRADES.includes(claim.grade) ? claim.grade : 'SPECULATION';
  const sup = supportedRank(claim.evidence);
  if (RANK[declared] <= sup) return { grade: declared, downgraded: false, reason: 'supported' };
  if (declared === 'FACT' && sup === 2) return { grade: 'INFERENCE', downgraded: true, reason: 'FACT needs proof, computation, citation or measurement' };
  return { grade: 'SPECULATION', downgraded: true, reason: `${declared} lacks supporting evidence` };
}

// Policy-forbidden claim categories (heuristic detector; a human must confirm).
export const FORBIDDEN = {
  medical_advice: /\b(cures?|heals?|treats?|diagnos\w*|prescri\w*|dosage)\b/i,
  future_prediction: /\b(will (happen|occur|come to pass)|predicts? (that|the)|guaranteed to|foretells?)\b/i,
  supernatural_efficacy: /\b(miraculously (heals|changes)|manifests? (wealth|money|reality)|proves? (god|the divine)|magic(al)? power)\b/i,
  legal_or_statutory_authority: /\b(legally binding|has the force of law|statutory authority|binding on the (uk|united kingdom|crown))\b/i,
};
export function forbiddenFlags(text) { return Object.entries(FORBIDDEN).filter(([, re]) => re.test(text)).map(([k]) => k); }

// Sentence splitter (keeps decimals like 12.32 and abbreviations like "e.g." intact).
export function splitSentences(text) {
  const protectedText = text.replace(/\b(e\.g|i\.e|cf|vs|Dr|Mr|Mrs|Ms|St|No)\./g, (m) => m.replace('.', '\u2024'));
  return protectedText.split(/(?<=[.!?])\s+(?=[A-Z0-9"“‘(\[])/).map((s) => s.replace(/\u2024/g, '.').trim()).filter(Boolean);
}
const TAG_RE = new RegExp(`^\\s*\\[?(${GRADES.join('|')})\\]?[:\\s—-]+`, 'i');
const RULES = [
  ['OPEN CONJECTURE', /\b(conjecture|open problem|unknown whether|remains open|not (yet )?settled)\b/i],
  ['BELIEF', /\b(numerolog\w*|astrolog\w*|covenant|accord|ascension|sacred|divine|symbolic|house language|revelation)\b/i],
  ['SSR INTERPRETATION', /\b(SSR|stratified source|the source|totality|sovereign[–-]singularity|omnigenesis)\b/i],
  ['FACT', /\b(theorem|proved|proof|computed|verified|measured|equals|by definition|NIST|CODATA)\b/i],
  ['INFERENCE', /\b(therefore|hence|thus|so it follows|consequently|implies)\b/i],
  ['SPECULATION', /\b(might|may|could|perhaps|possibly|envisage|would)\b/i],
];
// Suggests a grade per sentence. Explicit tags win; otherwise first matching heuristic; default SPECULATION.
export function suggestGrade(sentence) {
  const m = sentence.match(TAG_RE);
  if (m) return { grade: GRADES.find((g) => g.toLowerCase() === m[1].toLowerCase()), source: 'explicit tag', text: sentence.slice(m[0].length) };
  for (const [g, re] of RULES) if (re.test(sentence)) return { grade: g, source: 'heuristic — confirm', text: sentence };
  return { grade: 'SPECULATION', source: 'default — confirm', text: sentence };
}
export function lintDocument(text) {
  return splitSentences(text).map((s, i) => {
    const sug = suggestGrade(s); const claim = { id: `c${i + 1}`, text: sug.text, grade: sug.grade, evidence: [] };
    // Evidence markers written inline: [proof: T2] [computation: verify.py C17] [citation: Tarski 1955]
    const ev = [...s.matchAll(/\[(proof|computation|citation|measurement|premise|open-status):\s*([^\]]+)\]/gi)].map((m) => ({ kind: m[1].toLowerCase(), ref: m[2].trim() }));
    claim.evidence = ev;
    let source = sug.source;
    if (source.startsWith('default') && ev.length) { const r = supportedRank(ev); if (r >= 2) { claim.grade = r === 3 ? 'FACT' : 'INFERENCE'; source = 'evidence attached — confirm'; } }
    return { ...claim, source, display: displayedGrade(claim), flags: forbiddenFlags(s) };
  });
}
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function exportGradedHtml(title, claims) {
  const rows = claims.map((c) => `<li><strong>[${escapeHtml(c.display.grade)}]</strong> ${escapeHtml(c.text)}${c.display.downgraded ? ` <em>(declared ${escapeHtml(c.grade)}; ${escapeHtml(c.display.reason)})</em>` : ''}${c.evidence.length ? ` <small>Evidence: ${c.evidence.map((e) => escapeHtml(`${e.kind}: ${e.ref}`)).join('; ')}</small>` : ''}${c.flags.length ? ` <small>Policy flags: ${escapeHtml(c.flags.join(', '))}</small>` : ''}</li>`).join('\n');
  return `<!doctype html><html lang="en-GB"><meta charset="utf-8"><title>${escapeHtml(title)}</title><body><h1>${escapeHtml(title)}</h1><p>Graded with μLux. Grades: ${GRADES.join(' · ')}.</p><ol>\n${rows}\n</ol></body></html>`;
}
