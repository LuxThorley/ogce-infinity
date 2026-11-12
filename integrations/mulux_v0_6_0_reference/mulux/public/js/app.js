// μLux — application shell: policy load (fail-closed), hash router, service worker.
import { loadPolicy } from './policy/engine.js';
import { POLICY_TEXT, POLICY_SHA256 } from './policy/pinned.js';
import * as V from './ui/views.js';
import * as V5 from './ui/views5.js';
import { h } from './ui/dom.js';

const ROUTES = { '': ['Home', V.home], bloom: ['Bloom', V.bloom], studio: ['Studio', V.studio], strata: ['Strata', V.strataLens], grade: ['Grade Lens', V.gradeLens],
  mirror: ['Mirror', V.mirror], observatory: ['Observatory', V.observatory], chronos: ['Chronos', V.chronos], symmetry: ['Symmetry', V.symmetry], world: ['World', V5.world], pulse: ['Pulse', V5.pulse], malcolm: ['Malcolm', V5.malcolm], omnigenesis: ['OmniGenesis', V5.omnigenesis], policy: ['Policy', V.policyView] };
const ctx = { policy: null, policyError: 'not loaded', policySha: null, leaveFns: [],
  onLeave(fn) { this.leaveFns.push(fn); },
  notify(msg, ok = false) { const b = document.getElementById('banner'); b.textContent = msg; b.className = ok ? 'ok' : ''; clearTimeout(this._t); this._t = setTimeout(() => { b.textContent = ''; }, 7000); } };

function nav(active) {
  document.getElementById('nav').replaceChildren(...Object.entries(ROUTES).filter(([k]) => k).map(([k, [label]]) => h('a', { href: `#/${k}`, 'aria-current': k === active ? 'page' : null }, label)));
}
function route() {
  ctx.leaveFns.forEach((f) => { try { f(); } catch { /* ignore */ } }); ctx.leaveFns = [];
  const key = location.hash.replace(/^#\/?/, '').split('?')[0]; const [, view] = ROUTES[key] || ROUTES[''];
  const main = document.getElementById('main'); nav(key);
  try { main.replaceChildren(view(ctx)); } catch (e) { main.replaceChildren(h('p', { class: 'bad' }, `This screen failed to render: ${e.message}`)); }
  main.focus({ preventScroll: true }); document.body.dataset.ready = key || 'home';
}
(async () => {
  const r = await loadPolicy(POLICY_TEXT, POLICY_SHA256);
  ctx.policy = r.policy; ctx.policyError = r.error; ctx.policySha = r.sha256 || null;
  if (!r.policy) ctx.notify(`Omni-Policy failed to load (${r.error}). Fail-closed: exports and storage are blocked.`);
  window.addEventListener('hashchange', route); route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
