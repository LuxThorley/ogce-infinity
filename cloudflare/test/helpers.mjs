import { DatabaseSync } from 'node:sqlite';
export function memoryDb() {
  const d = new DatabaseSync(':memory:');
  const norm = (p) => p.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v));
  return {
    all: (q, ...p) => d.prepare(q).all(...norm(p)).map((r) => ({ ...r })),
    run: (q, ...p) => { d.prepare(q).run(...norm(p)); },
    transaction: (fn) => { d.exec('BEGIN'); try { const r = fn(); d.exec('COMMIT'); return r; } catch (e) { d.exec('ROLLBACK'); throw e; } },
  };
}
// Strip wall-clock fields that legitimately differ between runs.
export function stripTime(v) {
  if (Array.isArray(v)) return v.map(stripTime);
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) if (k !== 'at' && k !== 'created_at') o[k] = stripTime(x); return o; }
  return v;
}
