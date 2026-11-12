// μLux — tiny DOM helpers. Text is always set via textContent (no innerHTML with user data).
export function h(tag, attrs = {}, ...kids) {
  const svg = ['svg', 'g', 'circle', 'line', 'path', 'text', 'polyline', 'rect', 'title'].includes(tag);
  const el = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.setAttribute('class', v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
export const gradeClass = (g) => ({ 'SSR INTERPRETATION': 'g-SSR', 'OPEN CONJECTURE': 'g-OPEN' }[g] || `g-${g}`);
export const chip = (g) => h('span', { class: `chip ${gradeClass(g)}`, title: g }, g);
export function table(cols, rows, numeric = []) {
  return h('div', { class: 'scroll' }, h('table', {},
    h('thead', {}, h('tr', {}, cols.map((c, i) => h('th', { class: numeric.includes(i) ? 'num' : null, scope: 'col' }, c)))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => h('td', { class: numeric.includes(i) ? 'num' : null }, c)))))));
}
export function kv(pairs) { return h('dl', { class: 'kv' }, pairs.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])); }
export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function lineChart({ series, labels, width = 640, height = 260, yMax, yLabel = '' }) {
  const pad = { l: 44, r: 12, t: 12, b: 28 }; const W = width - pad.l - pad.r, H = height - pad.t - pad.b;
  const n = labels.length; const x = (i) => pad.l + (W * i) / (n - 1); const y = (v) => pad.t + H - (H * v) / yMax;
  const svg = h('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': yLabel });
  for (let k = 0; k <= 4; k++) { const v = (yMax * k) / 4; svg.append(h('line', { class: 'axis', x1: pad.l, x2: width - pad.r, y1: y(v), y2: y(v) }), h('text', { class: 'tick', x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, v.toFixed(v < 10 ? 1 : 0))); }
  labels.forEach((lb, i) => { if (i % Math.ceil(n / 7) === 0 || i === n - 1) svg.append(h('text', { class: 'tick', x: x(i), y: height - 8, 'text-anchor': 'middle' }, lb)); });
  series.forEach((s, si) => {
    svg.append(h('polyline', { class: si === 0 ? 'l1' : 'l2', points: s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ') }));
    if (si === 0) s.values.forEach((v, i) => svg.append(h('circle', { class: 'pt', cx: x(i), cy: y(v), r: 3 }, h('title', {}, `${labels[i]}: ${v.toFixed(4)}`))));
  });
  return svg;
}
