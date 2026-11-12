// μLux — Malcolm Infinity client. The ONLY module allowed to make network requests, and only to the same-origin
// mulux-api Worker under /api/ (CSP connect-src 'self'). No token ever reaches the browser.
// Every call is gated twice by the Omni-Policy (action malcolm_via_worker + same-origin network check) and falls back
// to the local offline engine whenever the Worker is absent, disabled, rate-limited or failing.
export const API = '/api';
export function createMalcolmClient({ fetchImpl = (...a) => globalThis.fetch(...a), policy, decide, decideNetwork, origin }) {
  const gate = (path) => {
    const a = decide(policy, 'malcolm_via_worker'); if (a.decision !== 'allow') return `Omni-Policy: malcolm_via_worker → ${a.decision}`;
    const routes = (policy && policy.network && policy.network.allow_routes) || [];
    if (!path.startsWith(`${API}/`) || !routes.some((r) => path === r || (r.endsWith('/') && path.startsWith(r)))) return `route ${path} not in the policy allow-list`;
    const n = decideNetwork(policy, path, origin); return n.decision === 'allow' ? null : `Omni-Policy network: ${n.reason}`;
  };
  async function call(path, init) {
    const g = gate(path); if (g) return { ok: false, offline: true, reason: g };
    try { const r = await fetchImpl(path, { ...init, credentials: 'same-origin', cache: 'no-store' }); return { ok: r.ok, status: r.status, r }; }
    catch (e) { return { ok: false, offline: true, reason: `unreachable (${e && e.message ? e.message : 'network error'})` }; }
  }
  return {
    async health() {
      const x = await call(`${API}/healthz`, { method: 'GET' }); if (!x.r) return { online: false, reason: x.reason };
      const d = await x.r.json().catch(() => null);
      return d && d.service === 'mulux-api' ? { online: !!d.enabled && !!d.tokenConfigured, worker: d, reason: d.enabled ? (d.tokenConfigured ? 'connected' : 'token not configured') : 'bridge disabled (needs owner YES)' } : { online: false, reason: `no mulux-api Worker here (HTTP ${x.status})` };
    },
    async chat(messages, purpose = 'chat') {
      const x = await call(`${API}/malcolm/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, purpose }) });
      if (!x.ok) return { ok: false, reason: x.reason || `HTTP ${x.status}` };
      const d = await x.r.json().catch(() => null); return d && typeof d.text === 'string' ? { ok: true, ...d } : { ok: false, reason: 'malformed reply' };
    },
    async stream(messages, purpose, onDelta) {
      const x = await call(`${API}/malcolm/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ messages, purpose }) });
      if (!x.ok || !x.r.body) return { ok: false, reason: x.reason || `HTTP ${x.status}` };
      let text = '', meta = null;
      for await (const ev of parseSSE(x.r.body)) {
        if (ev.event === 'delta') { const t = JSON.parse(ev.data).t; text += t; onDelta && onDelta(t, text); }
        else if (ev.event === 'done') meta = JSON.parse(ev.data);
      }
      return { ok: true, text, meta };
    },
  };
}
// Minimal Server-Sent Events parser (WHATWG HTML §9.2) over a ReadableStream (spec: fields event/data/id, blank line dispatches).
export async function* parseSSE(stream) {
  const reader = stream.getReader(); const dec = new TextDecoder(); let buf = '';
  let ev = { event: 'message', data: [], id: null };
  const flush = function* () { if (ev.data.length) yield { event: ev.event, data: ev.data.join('\n'), id: ev.id }; ev = { event: 'message', data: [], id: null }; };
  for (;;) {
    const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.search(/\r?\n/)) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(buf[i] === '\r' ? i + 2 : i + 1);
      if (line === '') { yield* flush(); continue; } if (line.startsWith(':')) continue;
      const c = line.indexOf(':'); const f = c < 0 ? line : line.slice(0, c); let v = c < 0 ? '' : line.slice(c + 1); if (v.startsWith(' ')) v = v.slice(1);
      if (f === 'event') ev.event = v; else if (f === 'data') ev.data.push(v); else if (f === 'id') ev.id = v;
    }
  }
  // Spec: an event left incomplete at end of stream (no blank line) is discarded.
}
// v0.6 Sanctum Pulse endpoints (same gates: policy action, allow-listed same-origin route, offline fallback).
export function createPulseClient(opts) {
  const base = createMalcolmClient(opts); const { fetchImpl = (...a) => globalThis.fetch(...a), policy, decide, decideNetwork, origin } = opts;
  const allowedRoute = (path) => ((policy && policy.network && policy.network.allow_routes) || []).some((r) => path === r || (r.endsWith('/') && path.startsWith(r)));
  const gate = (path) => {
    const a = decide(policy, 'malcolm_via_worker'); if (a.decision !== 'allow') return `Omni-Policy: malcolm_via_worker → ${a.decision}`;
    if (!allowedRoute(path)) return `route ${path} not in the policy allow-list`;
    const n = decideNetwork(policy, path, origin); return n.decision === 'allow' ? null : `Omni-Policy network: ${n.reason}`;
  };
  async function get(path, accept) {
    const g = gate(path); if (g) return { ok: false, reason: g };
    try { const r = await fetchImpl(path, { method: 'GET', headers: { Accept: accept }, credentials: 'same-origin', cache: 'no-store' }); return r.ok ? { ok: true, r } : { ok: false, reason: `HTTP ${r.status}` }; }
    catch (e) { return { ok: false, reason: `unreachable (${e && e.message ? e.message : 'network error'})` }; }
  }
  return {
    ...base,
    async services() { const x = await get(`${API}/pulse/health`, 'application/json'); if (!x.ok) return { ok: false, reason: x.reason }; const d = await x.r.json().catch(() => null); return d && d.malcolm ? { ok: true, ...d } : { ok: false, reason: 'malformed reply' }; },
    async infinity(onLine, signal) {
      const x = await get(`${API}/pulse/infinity`, 'text/event-stream'); if (!x.ok || !x.r.body) return { ok: false, reason: x.reason || 'no body' };
      for await (const ev of parseSSE(x.r.body)) { if (signal && signal.aborted) break; onLine(ev.data); }
      return { ok: true };
    },
  };
}
