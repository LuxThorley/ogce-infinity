// v9.0 multiplayer smoothing. Remote players are drawn ~120 ms in the past and interpolated between server-stamped
// snapshots (no teleporting); the local player is predicted immediately and reconciled when the server acknowledges.
export const INTERP_DELAY_MS = 120;
export class Interpolator {
  constructor(delay = INTERP_DELAY_MS, keep = 20) { this.delay = delay; this.keep = keep; this.buf = new Map(); this.offset = null; }
  /** snapshot: {id, x, z, face, t (server ms), anim}; localNow = performance.now()-like ms */
  push(s, localNow) {
    const off = localNow - s.t; this.offset = this.offset === null ? off : Math.min(this.offset * 0.9 + off * 0.1, off + 50); // smoothed clock offset
    const q = this.buf.get(s.id) || []; if (q.length && s.t <= q[q.length - 1].t) return; q.push({ x: s.x, z: s.z, face: s.face ?? 0, t: s.t, anim: s.anim || 'idle' });
    while (q.length > this.keep) q.shift(); this.buf.set(s.id, q);
  }
  remove(id) { this.buf.delete(id); }
  sample(id, localNow) {
    const q = this.buf.get(id); if (!q?.length) return null;
    const rt = localNow - (this.offset ?? 0) - this.delay;
    if (rt <= q[0].t) return { ...q[0] };
    for (let i = 0; i < q.length - 1; i++) {
      const a = q[i], b = q[i + 1];
      if (rt >= a.t && rt <= b.t) { const k = (rt - a.t) / Math.max(1, b.t - a.t); let df = b.face - a.face; df = Math.atan2(Math.sin(df), Math.cos(df)); return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, face: a.face + df * k, t: rt, anim: b.anim }; }
    }
    const last = q[q.length - 1], prev = q[q.length - 2];
    if (prev && rt - last.t < 250) { const k = (rt - last.t) / Math.max(1, last.t - prev.t); return { x: last.x + (last.x - prev.x) * k, z: last.z + (last.z - prev.z) * k, face: last.face, t: rt, anim: last.anim, extrapolated: true }; }
    return { ...last };
  }
}
export class Predictor {
  constructor() { this.seq = 0; this.pending = []; this.pos = null; }
  /** apply a local move instantly; returns the message to send */
  input(dx, dz, face, anim = 'walk') {
    if (!this.pos) this.pos = { x: 0, z: 0 };
    this.pos = { x: this.pos.x + dx, z: this.pos.z + dz }; this.seq += 1;
    this.pending.push({ seq: this.seq, dx, dz });
    return { type: 'pos', seq: this.seq, x: this.pos.x, z: this.pos.z, face, anim };
  }
  set(x, z) { this.pos = { x, z }; this.pending = []; }
  /** server ack {seq, x, z}: rewind to the authoritative position and replay unacknowledged inputs */
  ack(a) {
    this.pending = this.pending.filter((p) => p.seq > a.seq);
    let x = a.x, z = a.z; for (const p of this.pending) { x += p.dx; z += p.dz; }
    const err = this.pos ? Math.hypot(this.pos.x - x, this.pos.z - z) : 0; this.pos = { x, z }; return { ...this.pos, error: err };
  }
}
