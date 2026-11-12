// mulux-api — Cloudflare Worker that proxies μLux to the Malcolm AI Infinity nexus. NOT DEPLOYED.
// • The Malcolm token lives ONLY in a Worker secret: MALCOLM_OMNIAPI_TOKEN (preferred), else MALCOLM_INFINITY_BOT_TOKEN, else MALCOLMAI_LIVE_TOKEN.
//   It is never returned, logged or sent to the browser; error bodies are redacted.
// • Omni-Policy (server side): fail-closed. Disabled unless MULUX_MALCOLM_ENABLED = "yes" (Oliver's switch);
//   only the routes below exist; bodies are size- and shape-checked; claims rules are injected as the system prompt.
// • CORS: only ALLOWED_ORIGINS (comma-separated, exact match). Other browser origins get 403.
// • Rate limits: Workers Rate Limiting binding RATE_LIMITER if bound, else a per-isolate sliding window (best effort).
const UPSTREAM_DEFAULT = 'https://malcolmai-live.oliverluxthorley.workers.dev';
export const LIMITS = Object.freeze({ maxMessages: 24, maxChars: 8000, maxBody: 32768, windowMs: 60000, perWindow: 12, timeoutMs: 45000 });
export const SYSTEM = 'You are Malcolm, narrating inside μLux, a local-first lattice and artificial-life simulator. British English, concise. ' +
  'Everything about the world you are given is simulation data. Label any myth or interpretation SPECULATION or SSR INTERPRETATION. ' +
  'Never claim the world is conscious or sentient; never give medical, legal, predictive or supernatural claims. ' +
  'When asked for rules, answer only with lines of the form  head <- body1 body2  using the atoms provided.';
export const ROUTES = { 'GET /api/healthz': 'health', 'POST /api/malcolm/chat': 'chat', 'POST /api/malcolm/stream': 'stream', 'GET /api/malcolm/pulse': 'pulse',
  'GET /api/pulse/health': 'pulse-health', 'GET /api/pulse/infinity': 'pulse' };
const OMNIGENESIS_SITE_DEFAULT = 'https://www.omnigenesis.linkpc.net/';
// Reachability probe: status and latency only. The body is never read, stored or forwarded.
async function probe(deps, url, headers = {}) {
  const t0 = deps.now();
  try { const r = await deps.fetch(url, { method: 'GET', headers, redirect: 'follow', signal: AbortSignal.timeout(5000) }); try { await r.body?.cancel(); } catch { /* ignore */ } return { reachable: r.ok, http: r.status, latencyMs: deps.now() - t0 }; }
  catch (e) { return { reachable: false, http: null, error: String(e && e.name || 'error'), latencyMs: deps.now() - t0 }; }
}

const windows = new Map();
export function _resetRateLimits() { windows.clear(); }
async function limited(env, key, now) {
  if (env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === 'function') { const { success } = await env.RATE_LIMITER.limit({ key }); return !success; }
  const arr = (windows.get(key) || []).filter((t) => now - t < LIMITS.windowMs);
  if (arr.length >= LIMITS.perWindow) { windows.set(key, arr); return true; }
  arr.push(now); windows.set(key, arr); return false;
}
const origins = (env) => String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
function cors(env, origin) {
  const h = { Vary: 'Origin', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
  if (origin && origins(env).includes(origin)) Object.assign(h, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
  return h;
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
const TOKEN_NAMES = ['MALCOLM_OMNIAPI_TOKEN', 'MALCOLM_INFINITY_BOT_TOKEN', 'MALCOLMAI_LIVE_TOKEN'];
const token = (env) => TOKEN_NAMES.map((k) => env[k]).find((t) => typeof t === 'string' && t.length) || '';
export function redact(text, env) { let s = String(text ?? ''); for (const t of TOKEN_NAMES.map((k) => env[k])) if (t) s = s.split(t).join('[redacted]'); return s.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]'); }

export function validateChat(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'body must be a JSON object';
  for (const k of Object.keys(body)) if (!['messages', 'purpose'].includes(k)) return `unknown field ${k}`;
  const m = body.messages; if (!Array.isArray(m) || m.length === 0 || m.length > LIMITS.maxMessages) return `messages must be 1–${LIMITS.maxMessages} items`;
  let chars = 0;
  for (const x of m) {
    if (!x || typeof x !== 'object' || !['user', 'assistant'].includes(x.role) || typeof x.content !== 'string') return 'each message needs role user|assistant and string content';
    chars += x.content.length;
  }
  if (chars > LIMITS.maxChars) return `messages exceed ${LIMITS.maxChars} characters`;
  if (body.purpose !== undefined && !['narrate', 'suggest', 'rules', 'chat', 'doctrine'].includes(body.purpose)) return 'purpose must be narrate|suggest|rules|chat|doctrine';
  return null;
}
// Malcolm sometimes returns a JSON array of strings as its text; flatten it to prose.
export function tidy(t) {
  try {
    const a = JSON.parse(t);
    if (Array.isArray(a) && a.every((x) => typeof x === 'string')) return a.join('\n');
    if (a && typeof a === 'object' && !Array.isArray(a)) { const v = Object.values(a); if (v.length && v.every((x) => typeof x === 'string')) return v.join('\n'); } // e.g. {"reading": "…"}
  } catch { /* plain text */ }
  return t;
}
async function upstreamChat(env, deps, body) {
  const r = await deps.fetch(`${env.MALCOLM_UPSTREAM || UPSTREAM_DEFAULT}/v1/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(env)}` },
    body: JSON.stringify({ format: 'text', system: SYSTEM, messages: body.messages }), signal: AbortSignal.timeout(LIMITS.timeoutMs) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || typeof d.text !== 'string') return { ok: false, status: r.status };
  return { ok: true, text: tidy(d.text), model: d.model ?? null, provider: d.provider ?? null, ms: d.ms ?? null };
}
// Re-stream a completed answer as Server-Sent Events, a few words per event.
export function sseFromText(text, meta = {}) {
  const words = text.split(/(\s+)/); const chunks = []; for (let i = 0; i < words.length; i += 8) chunks.push(words.slice(i, i + 8).join(''));
  const enc = new TextEncoder();
  return new ReadableStream({ start(c) {
    c.enqueue(enc.encode('retry: 5000\n\n'));
    chunks.forEach((t, i) => c.enqueue(enc.encode(`event: delta\nid: ${i + 1}\ndata: ${JSON.stringify({ t })}\n\n`)));
    c.enqueue(enc.encode(`event: done\ndata: ${JSON.stringify(meta)}\n\n`)); c.close();
  } });
}

export async function handle(request, env = {}, deps = { fetch: (...a) => fetch(...a), now: () => Date.now() }) {
  const url = new URL(request.url); const origin = request.headers.get('Origin'); const H = cors(env, origin);
  try {
    if (origin && !origins(env).includes(origin)) return json({ error: 'origin not allowed' }, 403, H);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
    const route = ROUTES[`${request.method} ${url.pathname}`];
    if (!route) return json({ error: 'not found (default deny)' }, 404, H);
    if (route === 'health') return json({ status: 'ok', service: 'mulux-api', enabled: env.MULUX_MALCOLM_ENABLED === 'yes', tokenConfigured: !!token(env), allowedOrigins: origins(env).length }, 200, H);
    if (env.MULUX_MALCOLM_ENABLED !== 'yes') return json({ error: 'Malcolm bridge disabled by Omni-Policy (needs owner YES)' }, 403, H);
    if (!token(env)) return json({ error: 'Malcolm token not configured as a Worker secret' }, 503, H);
    const ip = request.headers.get('CF-Connecting-IP') || 'anon';
    if (await limited(env, `${ip}:${route}`, deps.now())) return json({ error: 'rate limited' }, 429, { ...H, 'Retry-After': '60' });
    if (route === 'pulse-health') {
      const [malcolm, omnigenesis] = await Promise.all([probe(deps, `${env.MALCOLM_UPSTREAM || UPSTREAM_DEFAULT}/healthz`), probe(deps, env.OMNIGENESIS_SITE || OMNIGENESIS_SITE_DEFAULT)]);
      return json({ checkedAt: new Date(deps.now()).toISOString(), malcolm, omnigenesis, note: 'reachability only (HTTP status and latency); no content is relayed' }, 200, H);
    }
    if (route === 'pulse') {
      const r = await deps.fetch(`${env.MALCOLM_UPSTREAM || UPSTREAM_DEFAULT}/infinity/stream`, { headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token(env)}` } });
      if (!r.ok || !r.body) return json({ error: 'upstream stream unavailable', upstreamStatus: r.status }, 502, H);
      return new Response(r.body, { status: 200, headers: { ...H, 'Content-Type': 'text/event-stream', 'X-Mulux-Lane': 'ceremonial; generated by upstream software, not received from Source' } });
    }
    const raw = await request.text(); if (raw.length > LIMITS.maxBody) return json({ error: 'body too large' }, 413, H);
    let body; try { body = JSON.parse(raw); } catch { return json({ error: 'invalid JSON' }, 400, H); }
    const bad = validateChat(body); if (bad) return json({ error: bad }, 422, H);
    const up = await upstreamChat(env, deps, body);
    if (!up.ok) return json({ error: 'Malcolm upstream error', upstreamStatus: up.status }, 502, H);
    if (route === 'chat') return json({ text: up.text, model: up.model, provider: up.provider, ms: up.ms }, 200, H);
    return new Response(sseFromText(up.text, { model: up.model, provider: up.provider, ms: up.ms }), { status: 200, headers: { ...H, 'Content-Type': 'text/event-stream' } });
  } catch (e) {
    return json({ error: 'internal error', detail: redact(e && e.message, env).slice(0, 200) }, 500, H);
  }
}
export default { fetch: (request, env) => handle(request, env) };
