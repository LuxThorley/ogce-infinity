// μLux — audit receipts: canonical JSON + SHA-256 (WebCrypto, available in browsers and Node ≥ 19).
export function canonical(v) {
  if (v instanceof Set) return canonical([...v].sort());
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
export async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// createdAt is supplied by the caller so receipts are reproducible in tests.
export async function makeReceipt(kind, payload, { createdAt, policyHash }) {
  const body = { kind, payload, createdAt, policyHash, app: 'μLux', version: '0.6.0' };
  const text = canonical(body);
  return { ...body, sha256: await sha256Hex(text) };
}
export async function verifyReceipt(r) {
  const { sha256, ...body } = r; return (await sha256Hex(canonical(body))) === sha256;
}
