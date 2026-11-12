// Top-down map, adapted from the v7.0 2D canvas renderer (same tile palette), used as a minimap
// and as a full-screen fallback when a device has no WebGL.
import { height, WATER_LEVEL, pathDistance } from './world3d.js';

export function drawMap(canvas, state, playerId, opts = {}) {
  const ctx = canvas.getContext('2d'); if (!ctx || !state) return;
  const W = canvas.width, H = canvas.height, span = opts.span ?? 26;
  const p = state.players?.[playerId] || { x: 2, y: 2 };
  const s = Math.min(W, H) / span, ox = p.x - span / 2 + 0.5, oy = p.y - span / 2 + 0.5;
  ctx.fillStyle = '#24483e'; ctx.fillRect(0, 0, W, H);
  for (let ty = Math.floor(oy); ty < oy + span + 1; ty++) for (let tx = Math.floor(ox); tx < ox + span + 1; tx++) {
    const inside = tx >= 0 && ty >= 0 && tx < 64 && ty < 64, h = height(tx, ty);
    ctx.fillStyle = h < WATER_LEVEL ? '#2b6d8f' : !inside ? (h > 3 ? '#6b6b62' : '#1c3a32') : pathDistance(tx, ty) < 0.7 ? '#7a6644' : ((tx * 7 + ty * 11) % 9 === 0 ? '#315b49' : '#294d42');
    ctx.fillRect((tx - ox) * s, (ty - oy) * s, s + 0.5, s + 0.5);
  }
  const dot = (x, y, col, r = 0.32, ring) => { const cx = (x - ox + 0.5) * s, cy = (y - oy + 0.5) * s; ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, s * r), 0, 7); ctx.fillStyle = col; ctx.fill(); if (ring) { ctx.lineWidth = 2; ctx.strokeStyle = ring; ctx.stroke(); } };
  for (const e of state.entities || []) {
    if (e.kind === 'resource') dot(e.x, e.y, e.quantity > 0 ? ({ crystal: '#5ee7ff', wood: '#c08a4a', stone: '#b9b9c0' }[e.resource] || '#fff') : '#556', 0.3);
    else if (e.kind === 'quest_board') dot(e.x, e.y, '#ffd25e', 0.34, '#7a5a1e');
    else if (e.kind === 'structure') dot(e.x, e.y, e.structure === 'campfire' ? '#ff8a3d' : '#d8c08a', 0.34);
  }
  for (const c of state.creatures || []) if (c.alive !== false) dot(c.x, c.y, c.hostile ? '#ff5e5e' : '#f1f1ff', 0.3);
  for (const [id, q] of Object.entries(state.players || {})) if (id !== playerId) dot(q.x, q.y, '#c69cff', 0.3);
  if (opts.hint) { dot(opts.hint.x, opts.hint.y, 'rgba(255,210,80,0.25)', 0.9); }
  if (opts.marker) dot(opts.marker.x, opts.marker.y, 'rgba(255,220,120,0.6)', 0.25);
  dot(p.x, p.y, '#2ee6c8', 0.42, '#fff');
  // camera direction wedge
  if (opts.yaw != null) {
    const cx = (p.x - ox + 0.5) * s, cy = (p.y - oy + 0.5) * s, fx = -Math.sin(opts.yaw), fz = -Math.cos(opts.yaw);
    ctx.beginPath(); ctx.moveTo(cx, cy); const a = Math.atan2(fz, fx);
    ctx.arc(cx, cy, s * 4, a - 0.5, a + 0.5); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
  }
}
