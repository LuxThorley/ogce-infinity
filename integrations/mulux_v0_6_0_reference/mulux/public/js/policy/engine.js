// μLux — Omni-Policy evaluator. FAIL-CLOSED: any missing, malformed, tampered or unknown input yields DENY.
const TOP = ['policy', 'version', 'default', 'on_error', 'integrity', 'network', 'actions', 'claims', 'intention_lab', 'secrets', 'governor'];
const DECISIONS = new Set(['allow', 'deny', 'needs_owner_yes']);
const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function validate(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'not an object';
  for (const k of Object.keys(p)) if (!TOP.includes(k)) return `unknown field ${k}`;
  for (const k of TOP) if (!(k in p)) return `missing field ${k}`;
  if (p.policy !== 'omni-policy/mulux') return 'wrong policy id';
  if (p.default !== 'deny') return 'default must be deny';
  if (p.on_error !== 'deny_all') return 'on_error must be deny_all';
  if (!p.integrity || p.integrity.sha256_pinned !== true) return 'integrity pin required';
  if (!p.actions || typeof p.actions !== 'object') return 'actions missing';
  for (const [a, d] of Object.entries(p.actions)) if (!DECISIONS.has(d)) return `bad decision for ${a}`;
  for (const a of ['post_social', 'send_message', 'spend', 'execute_binary']) if (p.actions[a] !== 'deny') return `${a} must be deny`;
  if (!p.network || !Array.isArray(p.network.allow_origins) || !Array.isArray(p.network.allow_routes)) return 'network lists missing';
  if (!p.claims || p.claims.rise_requires_evidence !== true || !Array.isArray(p.claims.forbid)) return 'claims block invalid';
  if (!p.secrets || p.secrets.client_bundle !== 'none') return 'secrets must be none in client';
  const g = p.governor; if (!g || ![g.max_atoms, g.max_steps, g.max_ms].every((x) => Number.isInteger(x) && x > 0)) return 'governor invalid';
  return null;
}
// Returns { policy, error }. policy is null whenever anything is wrong.
export async function loadPolicy(text, pinnedSha256) {
  try {
    if (typeof text !== 'string' || typeof pinnedSha256 !== 'string') return { policy: null, error: 'missing policy or pin' };
    const h = await sha256Hex(text);
    if (h !== pinnedSha256) return { policy: null, error: 'hash mismatch' };
    const p = JSON.parse(text); const err = validate(p);
    if (err) return { policy: null, error: err };
    return { policy: deepFreeze(p), error: null, sha256: h };
  } catch (e) { return { policy: null, error: `exception: ${e && e.message}` }; }
}
export function decide(policy, action) {
  try {
    if (!policy || !Object.isFrozen(policy)) return { decision: 'deny', reason: 'policy unavailable (fail-closed)' };
    if (typeof action !== 'string' || !Object.prototype.hasOwnProperty.call(policy.actions, action)) return { decision: 'deny', reason: `action "${action}" not listed (default deny)` };
    const d = policy.actions[action];
    return DECISIONS.has(d) ? { decision: d, reason: 'listed rule' } : { decision: 'deny', reason: 'invalid rule' };
  } catch { return { decision: 'deny', reason: 'exception (fail-closed)' }; }
}
export function decideNetwork(policy, url, selfOrigin) {
  try {
    if (!policy) return { decision: 'deny', reason: 'policy unavailable (fail-closed)' };
    const u = new URL(url, selfOrigin); const origins = policy.network.allow_origins.map((o) => (o === 'self' ? selfOrigin : o));
    return origins.includes(u.origin) ? { decision: 'allow', reason: 'allowlisted origin' } : { decision: 'deny', reason: `origin ${u.origin} not allowlisted` };
  } catch { return { decision: 'deny', reason: 'bad URL (fail-closed)' }; }
}
