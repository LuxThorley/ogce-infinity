// Draw a Codex lesson graph as inline SVG: real axes, units and data, for GCSE-style "read the graph" questions.
const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}, text) => { const e = document.createElementNS(NS, n); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
const FN = {
  ke: (x) => 0.5 * 2 * x * x, dt: (x) => 2 * x, gibbs: (x) => 6.01 - x * 0.022, light: (x) => x / 3, growth: (x) => 5 * 2 ** x,
  normal: (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI),
};
export function graphSVG(g) {
  const W = 420, H = 230, L = 52, R = 14, T = 14, B = 40, svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cxgraph', role: 'img', 'aria-label': `${g.y} against ${g.x}` });
  let pts = [], bars = null, xmin = g.xmin ?? 0, xmax = g.xmax ?? 10;
  if (g.kind === 'curve' || g.kind === 'line') { for (let i = 0; i <= 60; i++) { const x = xmin + (xmax - xmin) * i / 60; pts.push([x, FN[g.fn](x)]); } }
  else if (g.kind === 'steps') { pts = g.points.map((y, i) => [i, y]); xmin = 0; xmax = g.points.length - 1; }
  else if (g.kind === 'bar' || g.kind === 'errorbar') bars = g.bars || g.points;
  else if (g.kind === 'chain') { bars = [['p1', 10], ['p2', 24], ['p3', 50], ['p4', 19]]; }
  const ys = bars ? bars.map((b) => b[1] + (b[2] || 0)) : pts.map((p) => p[1]);
  let ymin = Math.min(0, ...ys), ymax = Math.max(...ys) * 1.1 || 1;
  const sx = (x) => L + (x - xmin) / (xmax - xmin || 1) * (W - L - R), sy = (y) => H - B - (y - ymin) / (ymax - ymin || 1) * (H - T - B);
  svg.append(el('rect', { x: L, y: T, width: W - L - R, height: H - T - B, class: 'gbg' }));
  for (let i = 0; i <= 4; i++) { const y = ymin + (ymax - ymin) * i / 4, yy = sy(y); svg.append(el('line', { x1: L, x2: W - R, y1: yy, y2: yy, class: 'ggrid' }), el('text', { x: L - 6, y: yy + 4, class: 'gtick', 'text-anchor': 'end' }, +y.toPrecision(3))); }
  if (bars) {
    const bw = (W - L - R) / bars.length;
    bars.forEach(([lab, v, err], i) => {
      const x = L + i * bw + bw * 0.2, w = bw * 0.6;
      if (g.kind === 'errorbar') { svg.append(el('circle', { cx: x + w / 2, cy: sy(v), r: 5, class: 'gpt' }), el('line', { x1: x + w / 2, x2: x + w / 2, y1: sy(v - err), y2: sy(v + err), class: 'gerr' })); }
      else svg.append(el('rect', { x, y: sy(v), width: w, height: Math.max(1, sy(ymin) - sy(v)), class: 'gbar', rx: 3 }));
      svg.append(el('text', { x: x + w / 2, y: H - B + 16, class: 'gtick', 'text-anchor': 'middle' }, lab));
    });
  } else {
    for (let i = 0; i <= 5; i++) { const x = xmin + (xmax - xmin) * i / 5; svg.append(el('text', { x: sx(x), y: H - B + 16, class: 'gtick', 'text-anchor': 'middle' }, +x.toPrecision(3))); }
    const d = g.kind === 'steps' ? pts.map((p, i) => (i ? `H${sx(p[0])}V${sy(p[1])}` : `M${sx(p[0])},${sy(p[1])}`)).join('') : pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('');
    svg.append(el('path', { d, class: 'gline' }));
    if (g.kind === 'steps') pts.forEach((p) => svg.append(el('circle', { cx: sx(p[0]), cy: sy(p[1]), r: 3.5, class: 'gpt' })));
  }
  svg.append(el('text', { x: (L + W - R) / 2, y: H - 6, class: 'glabel', 'text-anchor': 'middle' }, g.x));
  svg.append(el('text', { x: 12, y: (T + H - B) / 2, class: 'glabel', 'text-anchor': 'middle', transform: `rotate(-90 12 ${(T + H - B) / 2})` }, g.y));
  return svg;
}
