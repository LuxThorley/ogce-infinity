// Strata discovery cards: one renderer for copy-to-clipboard text, Markdown and printable HTML (used by the client and the Worker).
// Every statement carries exactly one label: FACT, SSR/CRA THEORY, MYSTICAL/IN-GAME or IN-GAME. Nothing on a card claims real-world proof.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SAFE_MATH = /^<math[^>]*>(?:(?!<\/?(?:script|style|iframe|a|img|svg|object|embed|foreignObject|annotation-xml)\b)[\s\S])*<\/math>$/i;
const safeMath = (m) => (typeof m === 'string' && SAFE_MATH.test(m) && !/\son\w+\s*=|href|src\s*=|javascript:/i.test(m) ? m : '');
const LEGEND = 'FACT = established science or maths · SSR/CRA THEORY = Oliver Lux Prime Thorley\'s framework, not established science · MYSTICAL/IN-GAME = magic, spirits or astrology in the game\'s story, never established science · IN-GAME = a fiction mechanic of the game';

export function cardText(c, shareUrl = '') {
  const L = [`${c.title} — ${c.game}`, c.definition, `Summary (IN-GAME): ${c.summary}`, '', 'Statements:'];
  for (const s of c.statements) L.push(`[${s.label}] ${s.text}`);
  if (c.ai?.length) { L.push('', 'Explanation drafted with Malcolm (AI), each line labelled and checked:'); for (const s of c.ai) L.push(`[${s.label}] ${s.text}`); }
  L.push('', 'Maths and science:');
  for (const m of c.maths) L.push(`[${m.label}] ${m.plain}${m.worked ? `  →  ${m.worked}` : ''}`);
  L.push('', `Labels: ${LEGEND}`, c.no_proof, `Source: ${c.source}`);
  if (shareUrl) L.push(`Link: ${shareUrl}`);
  return L.join('\n');
}
export function cardMarkdown(c, shareUrl = '') {
  const L = [`# ${c.title}`, `*${c.game} · ${c.category} ${c.form} · ${c.domain} · stratum ${c.stratum}*`, '', `**Definition (IN-GAME).** ${c.definition}`, '', `**Summary (IN-GAME).** ${c.summary}`, '', '## Statements', '', '| Label | Statement |', '|---|---|'];
  for (const s of c.statements) L.push(`| **${s.label}** | ${s.text.replace(/\|/g, '\\|')} |`);
  if (c.ai?.length) { L.push('', '## Explanation drafted with Malcolm (AI)', '', '| Label | Statement |', '|---|---|'); for (const s of c.ai) L.push(`| **${s.label}** | ${s.text.replace(/\|/g, '\\|')} |`); }
  L.push('', '## Maths and science', '');
  for (const m of c.maths) L.push(`- **${m.label}** \`${m.plain}\`${m.worked ? `  \n  ${m.worked}` : ''}`);
  L.push('', '---', `*Labels: ${LEGEND}.*`, '', `> ${c.no_proof}`, '', `Source: ${c.source}`);
  if (shareUrl) L.push('', `Shared card: ${shareUrl}`);
  return L.join('\n');
}
const badge = (l) => `<span class="lab ${l === 'FACT' ? 'fact' : l === 'IN-GAME' ? 'game' : l === 'MYSTICAL/IN-GAME' ? 'mystic' : 'theory'}">${esc(l)}</span>`;
export function cardHTML(c, shareUrl = '') {
  const rows = (arr) => arr.map((s) => `<tr><td>${badge(s.label)}</td><td>${esc(s.text)}</td></tr>`).join('');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.title)} · Strata discovery card</title><meta name="robots" content="noindex">
<style>body{font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:820px;margin:2em auto;padding:0 1em;color:#16212a;background:#fbfaf6}
h1{margin:.2em 0;font-size:1.9em}h2{border-bottom:2px solid #e2c56b;padding-bottom:.2em;margin-top:1.6em}.sub{color:#5a6670}
table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #e6e2d6;padding:.45em .4em;vertical-align:top}td:first-child{width:9.5em}
.lab{display:inline-block;font:700 .72em/1.6 ui-monospace,monospace;padding:.05em .5em;border-radius:6px;white-space:nowrap}.fact{background:#d8f5e1;color:#14532d}.mystic{background:#fde7f6;color:#86198f}.theory{background:#ece3ff;color:#4b2a8a}.game{background:#fff1c9;color:#6b4a00}
.math{background:#fff;border:1px solid #e6e2d6;border-radius:10px;padding:.6em .9em;margin:.6em 0}.math math{font-size:1.25em}.plain{font-family:ui-monospace,monospace;color:#33414c}.worked{color:#33414c;font-size:.95em}
.note{background:#f3efe2;border-left:4px solid #e2c56b;padding:.6em .9em;border-radius:6px}.brand{letter-spacing:.06em;color:#8a6a10;font-weight:700}
@media print{body{margin:0;background:#fff}.noprint{display:none}h2{break-after:avoid}tr,.math{break-inside:avoid}}</style></head><body>
<div class="brand">STRATA · LUX GENESIS · DISCOVERY CARD</div><h1>${esc(c.title)}</h1><div class="sub">${esc(c.category)} ${esc(c.form)} · ${esc(c.domain)} · stratum ${esc(c.stratum)}</div>
<p>${badge('IN-GAME')} <b>Definition.</b> ${esc(c.definition)}</p><p>${badge('IN-GAME')} <b>Summary.</b> ${esc(c.summary)}</p>
<h2>Statements</h2><table>${rows(c.statements)}</table>
${c.ai?.length ? `<h2>Explanation drafted with Malcolm (AI)</h2><p class="sub">Each line was labelled by Malcolm and checked by the game; lines without a valid label or that claimed proof were removed.</p><table>${rows(c.ai)}</table>` : ''}
<h2>Maths and science</h2>${c.maths.map((m) => `<div class="math">${badge(m.label)} ${safeMath(m.mathml)}<div class="plain">${esc(m.plain)}</div>${m.worked ? `<div class="worked">${esc(m.worked)}</div>` : ''}</div>`).join('')}
<h2>About the labels</h2><p class="sub">${esc(LEGEND)}.</p><p class="note">${esc(c.no_proof)}</p><p class="sub">Source: ${esc(c.source)}${shareUrl ? ` · Link: ${esc(shareUrl)}` : ''}</p>
<p class="noprint sub">To save as PDF, use your browser's Print and choose "Save as PDF".</p></body></html>`;
}
