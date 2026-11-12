// μLux — OmniGenesis Sovereign, reimplemented. A clean JavaScript port of the logic recovered by static analysis of
// OmniGenesis_Sovereign.exe (sha256 3c6da977…ae42; PyInstaller one-file, Python 3.10, embedded main.py = FastAPI app v1.1.0).
// The executable was never run. This module contains NO network code: it builds the exact requests OmniGenesis would send,
// and μLux's Omni-Policy decides (deny by default) — previews only, nothing is ever transmitted.

export const OMNIGENESIS = Object.freeze({
  sha256: '3c6da977d5e93ddadf2f4a981f25092ffea6b3c11a2c217792e9647a3fd3ae42', bytes: 11954563, appVersion: '1.1.0', userAgent: 'OmniGenesis/1.1',
  python: '3.10', packager: 'PyInstaller one-file (CArchive cookie MEI\\014\\013\\012\\013\\016)', framework: 'FastAPI 0.110.0 · Starlette 0.36.3 · Uvicorn 0.27.0 · Requests 2.31.0',
});
// Every route the embedded main.py registers (plus FastAPI's automatic /docs).
export const ROUTES = [
  { method: 'GET', path: '/', does: 'plain text "<APP_TITLE>: online"' },
  { method: 'GET', path: '/healthz', does: '{"status":"ok"}' },
  { method: 'GET', path: '/info', does: 'name, version, runtime_dir, env (API key masked), endpoint list' },
  { method: 'GET', path: '/docs', does: 'FastAPI Swagger UI (opened in the browser at start-up)' },
  { method: 'GET', path: '/malcolm/health', does: 'proxy → GET {MALCOLM_BASE_URL}/healthz' },
  { method: 'POST', path: '/malcolm/optimize', does: 'proxy → POST {MALCOLM_BASE_URL}/optimize (raw text or JSON)' },
  { method: 'POST', path: '/malcolm/command', does: 'proxy → POST {MALCOLM_BASE_URL}/omni/command (JSON)' },
  { method: 'POST', path: '/ollama/generate', does: 'proxy → POST {OLLAMA_BASE_URL}/api/generate (stream: false)' },
];
// Port of _read_env_file: skip blank and # lines and lines without "="; split on the FIRST "="; strip both sides.
export function parseEnvFile(text) {
  const cfg = {};
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('='); cfg[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return cfg;
}
// Port of load_env_defaults: os.environ.setdefault — existing values are never overwritten.
export function applyEnvDefaults(env, cfg) { const out = { ...env }; for (const [k, v] of Object.entries(cfg)) if (!(k in out)) out[k] = v; return out; }
// Port of _mask(value, keep=6).
export function mask(value, keep = 6) { if (!value) return ''; if (value.length <= keep) return '*'.repeat(value.length); return value.slice(0, keep) + '…' + '******'; }
const rstripSlash = (s) => s.replace(/\/+$/, '');
const pyFloat = (v, d) => { const x = v === undefined ? d : Number(String(v).trim()); if (!Number.isFinite(x)) throw new Error(`could not convert string to float: '${v}'`); return x; };
// Port of the module-level configuration block (note: OLLAMA_BASE_URL falls back to MALCOLM_BASE_URL).
export function configFrom(env) {
  const malcolm = rstripSlash((env.MALCOLM_BASE_URL || '').trim());
  return { APP_TITLE: env.APP_TITLE ?? 'OmniGenesis Sovereign', MALCOLM_BASE_URL: malcolm, MALCOLM_API_KEY: (env.MALCOLM_API_KEY || '').trim(), MALCOLM_TIMEOUT: pyFloat(env.MALCOLM_TIMEOUT, 30),
    OLLAMA_BASE_URL: rstripSlash((env.OLLAMA_BASE_URL || malcolm).trim()), OLLAMA_MODEL: (env.OLLAMA_MODEL || '').trim(), OLLAMA_TIMEOUT: pyFloat(env.OLLAMA_TIMEOUT, 60),
    HOST: env.HOST ?? '127.0.0.1', PORT: env.PORT ?? '8000' };
}
// Port of pick_host_port with the socket replaced by an injected canBind(host, port) → boolean.
export function pickHostPort(env, canBind, defaultHost = '127.0.0.1', defaultPort = 8000) {
  const host = (env.HOST || defaultHost).trim() || defaultHost; let want = defaultPort; const warnings = [];
  if (env.PORT) { const n = /^\s*[+-]?\d+\s*$/.test(env.PORT) ? parseInt(env.PORT, 10) : NaN; if (Number.isNaN(n)) warnings.push(`Invalid PORT='${env.PORT}', using default ${defaultPort}`); else want = n; }
  if (canBind(host, want)) return { host, port: want, warnings };
  warnings.push(`Port ${want} unavailable on ${host}; choosing a free port.`);
  return canBind(host, 0) ? { host, port: 'ephemeral', warnings } : { host, port: want, warnings };
}
export function info(cfg, runtimeDir = '<folder of the .exe>') {
  return { name: cfg.APP_TITLE, version: OMNIGENESIS.appVersion, runtime_dir: runtimeDir,
    env: { HOST: cfg.HOST, PORT: cfg.PORT, MALCOLM_BASE_URL: cfg.MALCOLM_BASE_URL, MALCOLM_API_KEY: mask(cfg.MALCOLM_API_KEY), OLLAMA_BASE_URL: cfg.OLLAMA_BASE_URL, OLLAMA_MODEL: cfg.OLLAMA_MODEL },
    endpoints: { docs: '/docs', malcolm: ['/malcolm/health', '/malcolm/optimize', '/malcolm/command'], ollama: ['/ollama/generate'] } };
}
class HttpError extends Error { constructor(status, detail) { super(detail); this.status = status; this.detail = detail; } }
export { HttpError };
// _malcolm_headers — the bearer token is masked in every preview μLux produces.
function malcolmHeaders(cfg) { const h = { Accept: 'application/json', 'User-Agent': OMNIGENESIS.userAgent }; if (cfg.MALCOLM_API_KEY) h.Authorization = `Bearer ${mask(cfg.MALCOLM_API_KEY)}`; return h; }
function requireMalcolm(cfg) { if (!cfg.MALCOLM_BASE_URL) throw new HttpError(400, 'MALCOLM_BASE_URL is not configured (set it in omnigenesis.env)'); }
export function buildMalcolmHealth(cfg) { requireMalcolm(cfg); return { method: 'GET', url: `${cfg.MALCOLM_BASE_URL}/healthz`, headers: malcolmHeaders(cfg), timeout: cfg.MALCOLM_TIMEOUT, body: null }; }
// Port of malcolm_optimize: dict with string instruction/text → raw body; bare string → raw body; anything else → JSON.
export function buildMalcolmOptimize(cfg, payload) {
  requireMalcolm(cfg); const url = `${cfg.MALCOLM_BASE_URL}/optimize`; const base = { method: 'POST', url, timeout: cfg.MALCOLM_TIMEOUT };
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (typeof payload.instruction === 'string') return { ...base, headers: malcolmHeaders(cfg), body: payload.instruction, encoding: 'raw' };
    if (typeof payload.text === 'string') return { ...base, headers: malcolmHeaders(cfg), body: payload.text, encoding: 'raw' };
  }
  if (typeof payload === 'string') return { ...base, headers: malcolmHeaders(cfg), body: payload, encoding: 'raw' };
  return { ...base, headers: { ...malcolmHeaders(cfg), 'Content-Type': 'application/json' }, body: JSON.stringify(payload), encoding: 'json' };
}
export function buildMalcolmCommand(cfg, payload) {
  requireMalcolm(cfg); const body = typeof payload === 'string' ? { command: payload } : payload;
  return { method: 'POST', url: `${cfg.MALCOLM_BASE_URL}/omni/command`, headers: { ...malcolmHeaders(cfg), 'Content-Type': 'application/json' }, body: JSON.stringify(body), encoding: 'json', timeout: cfg.MALCOLM_TIMEOUT };
}
export function buildOllamaGenerate(cfg, payload) {
  if (!cfg.OLLAMA_BASE_URL) throw new HttpError(400, 'OLLAMA_BASE_URL is not configured (set it in omnigenesis.env)');
  if (!cfg.OLLAMA_MODEL) throw new HttpError(400, 'OLLAMA_MODEL is not configured (set it in omnigenesis.env)');
  const p = payload && typeof payload === 'object' ? payload : {}; const prompt = p.prompt === undefined ? '' : String(p.prompt);
  if (!prompt) throw new HttpError(422, 'Missing required field: prompt');
  const req = { model: cfg.OLLAMA_MODEL, prompt, stream: false };
  for (const k of ['system', 'template', 'context', 'options', 'format']) if (k in p) req[k] = p[k];
  return { method: 'POST', url: `${cfg.OLLAMA_BASE_URL}/api/generate`, headers: { 'User-Agent': OMNIGENESIS.userAgent, 'Content-Type': 'application/json' }, body: JSON.stringify(req), encoding: 'json', timeout: cfg.OLLAMA_TIMEOUT };
}
// Port of the response shaping in ollama_generate.
export function normaliseOllama(model, data) { return data && typeof data === 'object' && !Array.isArray(data) && 'response' in data ? { model, result: data.response ?? '', raw: data } : { model, raw: data }; }

// μLux gate: the policy decides; previews are returned, and the request is never sent from the browser.
const ACTION = { malcolm: 'narrate_via_malcolm', ollama: 'bridge_ollama' };
export function bridge(decide, policy, target, build) {
  const d = decide(policy, ACTION[target] || 'unknown_bridge');
  try { const request = build(); return { sent: false, decision: d.decision, reason: d.reason, request }; }
  catch (e) { return { sent: false, decision: d.decision, reason: d.reason, error: { status: e.status || 500, detail: e.detail || String(e.message) } }; }
}
// World → prompt (generative narration via a local model, if Oliver ever enables it). Facts only; the reply would be SPECULATION.
export function worldPrompt(v, name, recent = []) {
  return [`You are the chronicler of a simulated artificial-life world named ${name}. Everything below is measured simulation data (FACT).`,
    `Tick ${v.tick}; ${v.population} alive in ${v.houses} houses; set-point ${v.setpoint}; ${v.rules} learned laws; self-model precision ${(v.selfModel.precision * 100).toFixed(1)} %.`,
    ...recent.map((c) => `- [${c.grade}] tick ${c.tick}: ${c.text}`),
    'Write a short myth of this world. Label it SPECULATION. Do not claim the world is conscious, predictive, medical, legal or supernatural.'].join('\n');
}
