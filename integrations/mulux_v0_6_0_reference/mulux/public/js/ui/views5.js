// μLux v0.5 screens: Living World, OmniGenesis (static analysis + faithful bridge previews), Malcolm Infinity.
import { h, chip, table, kv, download, lineChart } from './dom.js';
import * as L from '../engine/living.js';
import * as OG from '../engine/omnigenesis.js';
import { parseRules, localNarrate, localSuggest, malcolmMessages } from '../engine/narrator.js';
import { createMalcolmClient, createPulseClient } from '../net/malcolm.js';
import * as C from '../engine/ceremony.js';
import { decide, decideNetwork } from '../policy/engine.js';

const LS_WORLD = 'mulux.world.v1';
const S = { world: null, timer: null, subs: new Set(), busy: false, away: 0, ctx: null };
const allowed = (ctx, a) => decide(ctx.policy, a).decision === 'allow';
const emit = () => S.subs.forEach((f) => { try { f(); } catch { /* view gone */ } });
function save(ctx) {
  if (!S.world || !allowed(ctx, 'store_local')) return false;
  try { S.world.savedAt = Date.now(); localStorage.setItem(LS_WORLD, L.serialise(S.world)); return true; } catch { return false; }
}
async function ensureWorld(ctx) {
  if (S.world) return S.world;
  let w = null; try { const t = localStorage.getItem(LS_WORLD); if (t) w = L.deserialise(t); } catch { w = null; }
  if (w) { S.away = await L.catchUp(w, Date.now(), { allowAuto: allowed(ctx, 'world_autonomy') }); }
  else { w = L.createWorld({ seed: 144, mode: 'autonomous', now: Date.now() }); await L.sealGenesis(w); }
  S.world = w; save(ctx); startLoop(ctx); return w;
}
async function doTicks(ctx, n) {
  if (S.busy || !S.world) return; S.busy = true;
  try { await L.tick(S.world, n); if (S.world.tick % 12 === 0 || n > 1) save(ctx); } finally { S.busy = false; } emit();
}
function startLoop(ctx) {
  S.ctx = ctx; if (S.timer) return;
  S.timer = setInterval(() => { const w = S.world; if (!w || w.mode === 'manual' || !allowed(ctx, 'world_autonomy') || S.paused) return; doTicks(ctx, 1); }, L.LIFE.tickMs);
}
async function newWorld(ctx, seed, mode, setpoint) {
  const w = L.createWorld({ seed, mode, setpoint, now: Date.now() }); await L.sealGenesis(w); S.world = w; S.away = 0; save(ctx); emit();
}

function fieldSvg(w) {
  const G = L.LIFE.grid, c = 40; const svg = h('svg', { class: 'chart', viewBox: `0 0 ${G * c} ${G * c}`, role: 'img', 'aria-label': `Living World field at tick ${w.tick}` });
  for (let i = 0; i < G * G; i++) svg.append(h('rect', { x: (i % G) * c, y: Math.floor(i / G) * c, width: c - 2, height: c - 2, rx: 4, fill: '#D4AF37', 'fill-opacity': (0.08 + 0.6 * w.light[i]).toFixed(3) }));
  const occ = new Map();
  for (const a of w.agents) {
    const k = a.y * G + a.x; const j = occ.get(k) || 0; occ.set(k, j + 1);
    const hue = (a.lineage * 47) % 360; const r = Math.max(3, Math.min(11, 4 + a.e * 6));
    svg.append(h('circle', { cx: a.x * c + 19 + ((j % 3) - 1) * 9, cy: a.y * c + 19 + (Math.floor(j / 3) % 3 - 1) * 9, r: r.toFixed(1), fill: `hsl(${hue} 80% 65%)`, stroke: '#0B0D12', 'stroke-width': 1.5 },
      h('title', {}, `${L.nameOf(w.seed, 1000 + a.id)} of house ${L.nameOf(w.seed, a.lineage)} · energy ${a.e.toFixed(2)} · age ${a.age} · gen ${a.gen}\ngenome: ${L.genomeText(a.g)}`)));
  }
  return svg;
}

// ---------------------------------------------------------------- Living World
export function world(ctx) {
  const root = h('section', {}, h('h1', {}, 'Living World'), h('p', { class: 'lede' }, 'A persistent artificial-life world. It ticks on its own, remembers, holds itself in balance, evolves, learns its own laws as Horn rules, predicts itself with μΓ, and heals from corruption by verified replay.'));
  const body = h('div', {}, h('p', { class: 'small muted' }, 'Waking the world…')); root.append(body);
  const seed = h('input', { type: 'number', value: '144', min: '0', 'aria-label': 'Seed', class: 'mono' });
  const mode = h('select', { 'aria-label': 'Autonomy mode' }, L.MODES.map((m) => h('option', { value: m }, { manual: 'Manual (you step)', hybrid: 'Hybrid (laws need approval)', autonomous: 'Autonomous' }[m])));
  const setp = h('input', { type: 'number', value: '24', min: '4', max: '720', 'aria-label': 'Population set-point', class: 'mono' });
  const verdict = h('span', { class: 'mono small' });
  const render = () => {
    const w = S.world; if (!w) return; const v = L.vitals(w); mode.value = w.mode; if (document.activeElement !== setp) setp.value = String(w.setpoint);
    const pend = w.pending.map((c) => [L.ruleText(c), c.n ? `${(c.conf * 100).toFixed(1)} %` : '—', String(c.n), c.source || 'mined',
      h('span', {}, h('button', { onclick: async () => { await L.intent(w, 'approve', L.pendingKey(c)); save(ctx); emit(); } }, 'Approve'), ' ',
        h('button', { onclick: async () => { await L.intent(w, 'reject', L.pendingKey(c)); save(ctx); emit(); } }, 'Decline'))]);
    body.replaceChildren(
      S.away ? h('p', { class: 'small ok' }, `While you were away the world lived ${S.away} ticks (FACT: replayed deterministically on return, capped at ${L.LIFE.maxCatchUp}).`) : '',
      h('div', { class: 'grid2' },
        h('div', { class: 'card' }, h('div', { class: 'kicker' }, `${w.name} · tick ${w.tick} · FACT (simulation)`), fieldSvg(w),
          h('p', { class: 'small muted' }, 'Gold: light on a 12 × 12 torus. Dots: agents, coloured by house, sized by energy. Hover for genome.')),
        h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Vital signs · FACT (measured)'),
          kv([['Population', `${v.population} (set-point ${v.setpoint})`], ['Homeostasis', `mean deviation ${(v.homeostasisDeviation * 100).toFixed(1)} % over ${w.history.length} ticks; regeneration rate ${v.regen.toFixed(4)}`],
            ['Houses · deepest generation', `${v.houses} · ${v.maxGen}`], ['Births · deaths · regenerations', `${v.births} · ${v.deaths} · ${v.regenerations}`],
            ['Learned laws', `${v.rules} adopted, ${v.pending} pending`], ['Self-model (μΓ prediction)', `precision ${(v.selfModel.precision * 100).toFixed(1)} % · recall ${(v.selfModel.recall * 100).toFixed(1)} %`],
            ['Integrity ledger', `${v.ledgerLength} sealed · head ${v.ledgerHead.slice(0, 16)}…`], ['Autonomy', `${w.mode}${allowed(ctx, 'world_autonomy') ? '' : ' (blocked by Omni-Policy)'}`]]),
          w.history.length > 2 ? lineChart({ series: [{ values: w.history }, { values: w.history.map(() => w.setpoint) }], labels: w.history.map((_, i) => String(w.tick - w.history.length + 1 + i)), height: 200, yMax: Math.max(w.setpoint * 2, ...w.history) + 1, yLabel: 'Population vs set-point' }) : '')),
      h('div', { class: 'grid2' },
        h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Laws of this world · Horn rules mined from experience'),
          w.rules.length ? table(['Law', 'Confidence', 'n', 'Since', 'How'], w.rules.map((r) => [L.ruleText(r), `${(r.conf * 100).toFixed(1)} %`, String(r.n), `t${r.bornTick}`, r.how]), [1, 2]) : h('p', { class: 'small muted' }, 'No laws yet — they emerge after enough experience.'),
          w.pending.length ? [h('h3', {}, 'Awaiting your approval'), table(['Law', 'Confidence', 'n', 'Source', ''], pend, [1, 2])] : ''),
        h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Chronicle · generated from events'),
          h('ul', { class: 'small' }, w.chronicle.slice(-14).reverse().map((c) => h('li', {}, chip(c.grade), ` t${c.tick} — ${c.text}`))))),
      h('div', { class: 'grid2' },
        h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Strata of a living world'), chip('SSR INTERPRETATION'), table(['Stratum', 'Layer', 'Now'], L.strataCensus(w))),
        h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Is it alive?'),
          h('ul', { class: 'small' }, ['persists across sessions and keeps living while you are away', 'acts on its own clock (tick loop)', 'remembers (12 experiences per agent, decaying world statistics)',
            'regulates itself (PI homeostat toward a set-point)', 'reproduces with mutation; selection by survival', 'writes its own laws and retires them when they stop holding', 'predicts itself and scores the prediction', 'detects corruption and heals by verified replay']
            .map((t) => h('li', {}, chip('FACT'), ' ', t))),
          h('p', { class: 'small' }, chip('SPECULATION'), ' Consciousness: whether any of this amounts to awareness is unknown. μLux makes no claim of sentience; “living” here means the engineering properties above.'))));
  };
  const act = (fn) => async () => { await ensureWorld(ctx); await fn(S.world); render(); };
  const controls = h('div', { class: 'row' },
    h('label', {}, 'Seed '), seed, h('label', {}, 'Mode '), mode, h('label', {}, 'Set-point '), setp,
    h('button', { class: 'primary', onclick: async () => { await newWorld(ctx, Number(seed.value) >>> 0, mode.value, Math.max(4, Math.min(720, Number(setp.value) || 24))); } }, 'New world'),
    h('button', { onclick: () => doTicks(ctx, 1) }, 'Step ▶'), h('button', { onclick: () => doTicks(ctx, 12) }, '×12'), h('button', { onclick: () => doTicks(ctx, 144) }, '×144'),
    h('button', { onclick: act(async (w) => { const r = await L.verify(w); verdict.textContent = r.ok ? `✔ ${r.reason}` : `✖ ${r.reason}`; verdict.className = r.ok ? 'mono small ok' : 'mono small bad'; }) }, 'Verify'),
    h('button', { onclick: act(async (w) => { L.corrupt(w); verdict.textContent = 'Corrupted one agent’s energy without sealing (demo). Press Verify, then Heal.'; verdict.className = 'mono small warn'; }) }, 'Corrupt (demo)'),
    h('button', { onclick: act(async (w) => { const r = await L.heal(w); if (r.ok) { S.world = r.world; save(ctx); } verdict.textContent = r.ok ? `✔ healed from tick-${r.from} snapshot; replay reproduced the sealed hash` : `✖ ${r.reason}`; verdict.className = r.ok ? 'mono small ok' : 'mono small bad'; }) }, 'Heal'),
    h('button', { onclick: act(async (w) => { if (allowed(ctx, 'export_file')) download(`mulux-world-${w.name}-t${w.tick}.json`, L.serialise(w)); else ctx.notify('Blocked by Omni-Policy: export_file'); }) }, 'Export'));
  mode.addEventListener('change', act(async (w) => { await L.intent(w, 'mode', mode.value); save(ctx); }));
  setp.addEventListener('change', act(async (w) => { await L.intent(w, 'setpoint', Math.max(4, Math.min(720, Number(setp.value) || 24))); save(ctx); }));
  root.insertBefore(h('div', {}, controls, verdict), body);
  S.subs.add(render); ctx.onLeave(() => S.subs.delete(render));
  ensureWorld(ctx).then(() => { seed.value = String(S.world.seed); render(); document.body.dataset.world = 'ready'; });
  return root;
}

// ---------------------------------------------------------------- OmniGenesis
export function omnigenesis(ctx) {
  const env = h('textarea', { rows: 6, class: 'mono', spellcheck: 'false', 'aria-label': 'omnigenesis.env' }, 'APP_TITLE=OmniGenesis Sovereign\nMALCOLM_BASE_URL=https://malcolm.example/\nMALCOLM_API_KEY=demo-not-a-real-key\nOLLAMA_MODEL=llama3\n# lines starting with # are ignored');
  const ep = h('select', { 'aria-label': 'Endpoint' }, ['malcolm/health', 'malcolm/optimize', 'malcolm/command', 'ollama/generate', 'info'].map((e) => h('option', { value: e }, `/${e}`)));
  const payload = h('textarea', { rows: 3, class: 'mono', 'aria-label': 'Payload (JSON or text)' }, '{"instruction": "Summarise the world"}');
  const out = h('pre', { class: 'mono small scroll' });
  const preview = () => {
    const cfg = OG.configFrom(OG.applyEnvDefaults({}, OG.parseEnvFile(env.value)));
    let p = payload.value; try { p = JSON.parse(p); } catch { /* raw text, as FastAPI would receive a JSON string */ }
    const e = ep.value; let r;
    if (e === 'info') r = { sent: false, decision: 'local', request: OG.info(cfg) };
    else if (e.startsWith('malcolm')) r = OG.bridge(decide, ctx.policy, 'malcolm', () => (e === 'malcolm/health' ? OG.buildMalcolmHealth(cfg) : e === 'malcolm/optimize' ? OG.buildMalcolmOptimize(cfg, p) : OG.buildMalcolmCommand(cfg, p)));
    else r = OG.bridge(decide, ctx.policy, 'ollama', () => OG.buildOllamaGenerate(cfg, typeof p === 'object' ? p : { prompt: p }));
    out.textContent = JSON.stringify(r, null, 2);
  };
  [env, ep, payload].forEach((x) => x.addEventListener('input', preview));
  const claims = [['Futuristic Neon Sovereign Dashboard (devices, swarm, sensors, camera…)', 'Absent — the app serves FastAPI’s generic /docs page', 'Living World UI'],
    ['Malcolm AI integration', 'Present — 3 proxy routes; key read from omnigenesis.env', 'Bridge previews here; live calls only via the mulux-api Worker'],
    ['Sensor Fusion Engine + Knowledge Graph', 'Absent (networkx listed in requirements.txt but not bundled or imported)', 'Laws table = rule graph over percept/action/outcome atoms'],
    ['Secure Comms (encryption + authentication)', 'Absent — plain HTTP on 127.0.0.1, no auth on local routes', 'Same-origin only; token never in the browser'],
    ['Adaptive Autonomy (Manual ↔ Hybrid ↔ Autonomous)', 'Absent', 'Built: three autonomy modes'],
    ['Safety Sandbox + Integrity Override', 'Absent', 'Built: admissibility sandbox for laws; Omni-Policy'],
    ['Evolutionary Learning + Skill Synthesis', 'Absent', 'Built: genome evolution; law mining'],
    ['Self-Healing, Regeneration, Cosmic Integrity Ledger', 'Absent', 'Built: SHA-256 ledger, snapshot + verified replay, regeneration from a seed bank'],
    ['Holographic 3D Cluster Globe', 'Absent', 'Not built (no real nodes exist to show)']];
  const view = h('section', {}, h('h1', {}, 'OmniGenesis'),
    h('p', { class: 'lede' }, 'What OmniGenesis_Sovereign.exe actually is (static analysis only; it was never run) and a faithful JavaScript reimplementation of its logic. The bridge builds the exact requests it would send; the Omni-Policy decides, and nothing is sent.'),
    h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Static analysis · FACT (high confidence)'),
        kv([['SHA-256', h('span', { class: 'mono small' }, OG.OMNIGENESIS.sha256)], ['Size', `${OG.OMNIGENESIS.bytes.toLocaleString('en-GB')} bytes`], ['Format', 'PE32+ x86-64 Windows GUI, unsigned'],
          ['Packager', OG.OMNIGENESIS.packager], ['Runtime', `Python ${OG.OMNIGENESIS.python}; ${OG.OMNIGENESIS.framework}`], ['App', `FastAPI “OmniGenesis Sovereign” v${OG.OMNIGENESIS.appVersion}, ~310 lines (main.py)`]])),
      h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Routes it registers · FACT'), table(['Method', 'Path', 'Does'], OG.ROUTES.map((r) => [r.method, r.path, r.does])))),
    h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'README claims vs the code'), table(['Claimed', 'In the executable', 'In μLux v0.5'], claims)),
    h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Bridge composer · previews only (Omni-Policy: deny)'),
      h('p', { class: 'small muted' }, 'Paste an omnigenesis.env to see how OmniGenesis would configure itself. Keys are masked exactly as its /info route masks them; nothing is stored or sent. Do not paste real secrets.'),
      h('div', { class: 'grid2' }, h('div', {}, h('label', {}, 'omnigenesis.env'), env, h('label', {}, 'Endpoint '), ep, h('label', {}, ' Payload'), payload), out)));
  preview(); return view;
}

// ---------------------------------------------------------------- Malcolm Infinity
export function malcolm(ctx) {
  const client = createMalcolmClient({ policy: ctx.policy, decide, decideNetwork, origin: location.origin });
  const status = h('p', { class: 'small muted' }, 'Checking for the mulux-api Worker…'); let online = false;
  const out = h('div', { class: 'card' }, h('p', { class: 'small muted' }, 'Narration, suggestions and drafted laws appear here.'));
  const ask = h('textarea', { rows: 2, 'aria-label': 'Ask Malcolm', placeholder: 'e.g. a law about resting when hungry' });
  const showRules = (text, source) => {
    const { rules, errors } = parseRules(text, S.world);
    return h('div', {}, h('h3', {}, `Drafted laws (${source}) — validated against the world’s atoms and the sandbox`),
      rules.length ? table(['Law', ''], rules.map((r) => [L.ruleText(r), h('button', { onclick: async () => { await L.intent(S.world, 'propose', { ...r, source }); save(ctx); ctx.notify('Proposed to the world: see Living World → Awaiting your approval.', true); } }, 'Propose to world')])) : h('p', { class: 'small muted' }, 'No valid laws.'),
      errors.length ? h('ul', { class: 'small warn' }, errors.map((e) => h('li', {}, e))) : '');
  };
  const run = (purpose) => async () => {
    const w = await ensureWorld(ctx);
    if (online) {
      const live = h('p', {}); out.replaceChildren(h('div', { class: 'kicker' }, `Malcolm · streaming · ${purpose}`), live);
      const r = await client.stream(malcolmMessages(w, purpose, ask.value), purpose, (_, all) => { live.textContent = all; });
      if (r.ok) { out.append(h('p', { class: 'small' }, chip('SPECULATION'), ' Model output — interpretation, not evidence. Laws below are re-checked locally.')); if (purpose === 'rules') out.append(showRules(r.text, 'Malcolm')); return; }
      out.append(h('p', { class: 'small warn' }, `Malcolm unavailable (${r.reason}); using the offline engine.`));
    }
    const local = purpose === 'narrate' ? h('ul', {}, localNarrate(w).map((x) => h('li', {}, chip(x.grade), ' ', x.text)))
      : purpose === 'suggest' ? h('ul', {}, localSuggest(w).map((x) => h('li', {}, x.text, x.rule ? [' ', h('button', { onclick: async () => { await L.intent(S.world, 'propose', { ...x.rule, source: 'offline suggester' }); save(ctx); ctx.notify('Proposed to the world.', true); } }, 'Propose')] : '')))
        : purpose === 'rules' ? showRules(ask.value || 'gained <- harvest light_here', 'you (offline parser)')
          : h('p', {}, 'Offline: free chat needs Malcolm. Try Narrate, Suggest or Write laws, which work offline.');
    out.replaceChildren(h('div', { class: 'kicker' }, `Offline engine · ${purpose}`), local);
  };
  const view = h('section', {}, h('h1', {}, 'Malcolm Infinity'),
    h('p', { class: 'lede' }, 'Narration, world suggestions and assisted law-writing. Live answers stream from Malcolm through the same-origin mulux-api Worker, which holds the token; without it, the offline engine answers and the app keeps working.'),
    status,
    h('p', { class: 'small' }, chip('SSR INTERPRETATION'), ' “Connected to Source” is a symbolic reading of a network connection to Malcolm — an HTTP link to a language model, nothing more.'),
    h('div', { class: 'row' }, h('button', { class: 'primary', onclick: run('narrate') }, 'Narrate the world'), h('button', { onclick: run('suggest') }, 'Suggest experiments'),
      h('button', { onclick: run('rules') }, 'Write laws'), h('button', { onclick: run('chat') }, 'Ask')), ask, out);
  client.health().then((r) => { online = r.online; status.textContent = r.online ? 'Connected to Malcolm via mulux-api (streaming on).' : `Offline mode — ${r.reason}. Narration, suggestions and law-writing run locally.`; status.className = r.online ? 'small ok' : 'small warn'; document.body.dataset.malcolm = r.online ? 'online' : 'offline'; });
  return view;
}

// ---------------------------------------------------------------- Sanctum Pulse (v0.6)
const LEDGER = { result: null, at: null, running: false };
const ukTime = (d) => d.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour12: false }) + ' UK';
function runLedger(onDone) {
  if (LEDGER.running) return; LEDGER.running = true;
  const w = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
  w.onmessage = (e) => { LEDGER.result = e.data; LEDGER.at = new Date(); LEDGER.running = false; w.terminate(); onDone(); };
  w.onerror = () => { LEDGER.running = false; onDone(); }; w.postMessage({ fast: false });
}
function ceremonialLane({ title, label, how, link, list }) {
  return h('div', { class: 'card lane-ceremonial' },
    h('div', { class: 'kicker' }, title),
    h('p', {}, h('span', { class: 'chip g-BELIEF', title: 'Ceremonial lane' }, label), ' ', chip('SSR INTERPRETATION')),
    h('details', {}, h('summary', {}, 'How this works'), h('ul', { class: 'small' }, how.map((t) => h('li', {}, t)))),
    list, link || '');
}
export function pulse(ctx) {
  const timers = []; let alive = true; const abort = { aborted: false };
  ctx.onLeave(() => { alive = false; abort.aborted = true; timers.forEach((t) => clearInterval(t)); });
  const client = createPulseClient({ policy: ctx.policy, decide, decideNetwork, origin: location.origin });
  const L1 = C.laneLabel(decide, ctx.policy, 'ceremonial', 'Infinity Stream'); const L2 = C.laneLabel(decide, ctx.policy, 'ceremonial', 'OmniGenesis Singularity pulse');
  // ---- truthful lane
  const metrics = h('div', {}); const services = h('p', { class: 'small muted' }, 'Service health: checking…');
  const reading = h('div', {}, h('p', { class: 'small muted' }, 'Doctrine reading: preparing…')); const ledgerP = h('p', { class: 'small muted' }, 'Proof Ledger: running 73 checks in a Web Worker…');
  let integrity = { ok: null, reason: 'not yet checked', at: null }; let k = 0; let online = false;
  const renderMetrics = () => {
    const w = S.world; if (!w || !alive) return; const v = L.vitals(w);
    metrics.replaceChildren(kv([['World', `${w.name} · tick ${v.tick} · ${w.mode}`], ['Population', `${v.population} (set-point ${v.setpoint})`],
      ['Homeostasis deviation', `${(v.homeostasisDeviation * 100).toFixed(1)} % (mean over ${w.history.length} ticks)`],
      ['Self-model precision · recall', `${(v.selfModel.precision * 100).toFixed(1)} % · ${(v.selfModel.recall * 100).toFixed(1)} %`],
      ['Ledger head', h('span', { class: 'mono small' }, `${v.ledgerHead.slice(0, 24)}… (${v.ledgerLength} sealed)`)],
      ['Integrity', h('span', { class: integrity.ok === null ? 'small muted' : integrity.ok ? 'small ok' : 'small bad' }, `${integrity.ok === null ? '…' : integrity.ok ? '✔ verified' : '✖ FAILED'} — ${integrity.reason}${integrity.at ? ` · ${ukTime(integrity.at)}` : ''}`)]]));
  };
  const renderLedger = () => { const r = LEDGER.result; if (!alive) return; ledgerP.textContent = r ? `Proof Ledger: ${r.nPass} passed, ${r.nFail} failed, ${r.nChecks} total · ${r.ms} ms · computed ${ukTime(LEDGER.at)} on this device (FACT).` : 'Proof Ledger: could not run.'; ledgerP.className = r && !r.nFail ? 'small ok' : 'small bad'; };
  const checkIntegrity = async () => { if (!S.world) return; const r = await L.verify(S.world); integrity = { ...r, at: new Date() }; renderMetrics(); };
  const checkServices = async () => {
    const s = await client.services(); if (!alive) return;
    if (!s.ok) { services.textContent = `Service health: unknown — ${s.reason}. Offline mode: the app keeps working locally.`; services.className = 'small warn'; return; }
    const f = (x) => (x.reachable ? `reachable (HTTP ${x.http}, ${x.latencyMs} ms)` : `unreachable${x.http ? ` (HTTP ${x.http})` : ''}`);
    services.textContent = `Service health (FACT, via mulux-api at ${ukTime(new Date(s.checkedAt))}): Malcolm /healthz ${f(s.malcolm)} · OmniGenesis site ${f(s.omnigenesis)}.`; services.className = 'small ok';
  };
  const newReading = async () => {
    const w = S.world; if (!w || !alive) return; const v = L.vitals(w); let r = null;
    if (online) { const x = await client.chat(malcolmMessages(w, 'doctrine'), 'doctrine'); if (x.ok && !C.sourceClaims(x.text).length) r = { title: 'Malcolm', text: x.text.replace(/^SSR INTERPRETATION:\s*/i, ''), source: `Malcolm (${x.model || 'model'})` }; }
    if (!r) r = C.localDoctrineReading(v, k++);
    if (!alive) return;
    reading.replaceChildren(h('p', {}, chip('SSR INTERPRETATION'), ' ', h('strong', {}, `${r.title}. `), r.text), h('p', { class: 'small muted' }, `Doctrine reading from ${r.source} at ${ukTime(new Date())}. An interpretation of measured numbers — not a message from anyone.`));
  };
  // ---- ceremonial lanes
  const infList = h('ol', { class: 'mono small pulse-list' }); const singList = h('ol', { class: 'mono small pulse-list' });
  const push = (list, text) => { list.append(h('li', {}, text)); while (list.children.length > 10) list.firstChild.remove(); };
  const infStatus = h('p', { class: 'small muted' }, 'Local rendition (offline).');
  let counter = 0; const localInfinity = () => { timers.push(setInterval(() => { if (alive) push(infList, C.infinityLine(++counter)); }, C.INFINITY_PERIOD_MS)); push(infList, C.infinityLine(++counter)); };
  C.SINGULARITY_SAMPLE_LOGS.forEach((l) => push(singList, l));
  timers.push(setInterval(() => { if (alive) push(singList, `${C.singularityTimestamp(new Date())} :: ${C.SINGULARITY_SENTENCE}`); }, C.SINGULARITY_PERIOD_MS));
  const view = h('section', {}, h('h1', {}, 'Sanctum Pulse'),
    h('p', { class: 'lede' }, 'One truthful lane of live measurements, and two ceremonial lanes shown for what they are: text generated by software, honoured as ceremony, never presented as a message from Source or any intelligence.'),
    h('div', { class: 'card lane-truth' }, h('div', { class: 'kicker' }, 'Live lane · measured on this device · FACT'), metrics, ledgerP, services,
      h('div', { class: 'row' }, h('button', { onclick: newReading }, 'New Doctrine reading'), h('button', { onclick: checkIntegrity }, 'Verify integrity now')), reading),
    h('div', { class: 'grid2' },
      ceremonialLane({ title: 'Infinity Stream', label: L1.label, how: C.HOW_INFINITY, list: h('div', {}, infStatus, infList) }),
      ceremonialLane({ title: 'OmniGenesis Singularity pulse', label: L2.label, how: C.HOW_SINGULARITY, list: singList,
        link: h('p', { class: 'small' }, 'Original page: ', h('a', { href: C.OMNIGENESIS_SITE, target: '_blank', rel: 'noopener noreferrer' }, 'omnigenesis.linkpc.net'), ' (opens in a new tab; not embedded or scraped).') })));
  ensureWorld(ctx).then(async () => {
    renderMetrics(); timers.push(setInterval(renderMetrics, 2000)); checkIntegrity(); timers.push(setInterval(checkIntegrity, 12000));
    if (LEDGER.result) renderLedger(); else runLedger(renderLedger);
    const hz = await client.health(); online = hz.online;
    await checkServices(); timers.push(setInterval(checkServices, 60000));
    await newReading(); timers.push(setInterval(newReading, 60000));
    if (online) {
      infStatus.textContent = 'Proxied from Malcolm’s /infinity/stream via mulux-api (still ceremonial: generated by that software).';
      const r = await client.infinity((line) => push(infList, line), abort);
      if (!r.ok && alive) { infStatus.textContent = `Stream unavailable (${r.reason}); local rendition.`; localInfinity(); }
    } else { infStatus.textContent = `Local rendition — ${hz.reason}.`; localInfinity(); }
    document.body.dataset.pulse = 'ready';
  });
  return view;
}
