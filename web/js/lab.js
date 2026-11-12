// Magic & Science Academy (v8.2 characters, spells, star stories, experiments, inventions)
// and the Tiny Life Lab (μLux), with plain-English cards instead of raw JSON.
import { friendlyError, SPELL, PATH, SIGNS, SCIENCE, SKILL, TECH, TOWN, RESEARCH_STATUS, GRADE, GRADE_FLAG } from './text.js';

const $ = (id) => document.getElementById(id);
const V82_WORLD = 'AURELIA', LIFE_WORLD = 'Aurelia';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fill = (sel, pairs) => { sel.textContent = ''; for (const [v, t] of pairs) { const o = el('option', null, t); o.value = v; sel.append(o); } };

export function initLab({ getSession, playerId, toast, onUnauthorized }) {
  let world = null;
  const headers = () => ({ 'Content-Type': 'application/json', ...(getSession() ? { Authorization: 'Bearer ' + getSession().token } : {}) });
  const cid = () => playerId();
  const say = (id, text, err = false) => { const e = $(id); e.textContent = text; e.classList.toggle('err', err); };

  async function v82(operation, extra = {}) {
    const r = await fetch(`/api/v82/world/${V82_WORLD}`, { method: 'POST', headers: headers(), body: JSON.stringify({ operation, character_id: cid(), ...extra }) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) onUnauthorized();
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    if (d.world) render(d.world);
    return d.result;
  }
  const run = (out, fn) => async () => { try { const msg = await fn(); if (msg) say(out, msg); } catch (e) { say(out, friendlyError(e.message), true); } };

  // static choices
  fill($('v82-birth'), SIGNS.map((s, i) => [i, `${s} (month ${i + 1})`])); $('v82-birth').value = '2';
  fill($('v82-discipline'), Object.entries(SCIENCE));
  fill($('v82-train-discipline'), ['engineering', 'materials', 'energy', 'computing', 'automation', 'transport', 'physics', 'chemistry', 'biology', 'astronomy', 'ecology', 'archaeology'].map((k) => [k, SKILL[k]]));
  fill($('v82-learn-spell'), Object.entries(SPELL).map(([k, s]) => [k, `${s.name} — ${s.what}`]));

  function mine() { return world?.characters?.find((c) => c.id === cid()); }
  function render(w) {
    world = w;
    $('v82-tick').textContent = w.tick; $('v82-ledger').textContent = w.ledger?.valid ? 'checked ✔' : 'problem ✖';
    const civ = $('v82-civilization'); civ.textContent = '';
    for (const [k, v] of Object.entries(w.civilization || {})) { const s = el('span', null, `${TOWN[k] || k} `); s.append(el('b', null, String(v))); civ.append(s); }
    const all = $('v82-characters'); all.textContent = '';
    for (const c of w.characters || []) all.append(el('div', 'item', `${c.name} — ${PATH[c.path]?.name || c.path}, level ${c.level}, ${c.discoveries?.length || 0} discoveries, ${c.known_techs?.length || 0} inventions`));
    if (!all.children.length) all.append(el('div', 'small muted', 'Nobody yet — be the first!'));
    const c = mine();
    $('v82-createbox').classList.toggle('hidden', !!c);
    const card = $('v82-mychar'); card.textContent = '';
    if (!c) card.append(el('span', 'muted', getSession() || !document.body.dataset.guestBlocked ? 'No character yet. Pick a name and type below.' : 'Sign in to make a character.'));
    else {
      card.append(el('b', null, c.name), el('span', 'muted', ` · ${PATH[c.path]?.name || c.path} · level ${c.level}`));
      const bars = el('div', 'bars');
      for (const [icon, label, v, max] of [['❤️', 'Health', c.health, 100], ['🔮', 'Magic energy (mana)', c.mana, 100], ['⭐', 'XP', c.xp, Math.max(100, c.xp)]]) {
        bars.append(el('span', null, icon + ' ' + label)); const tr = el('div', 'track'); const f = el('div', 'fill ' + (icon === '❤️' ? 'hp' : 'xp')); f.style.width = Math.min(100, (100 * v) / max) + '%'; tr.append(f); bars.append(tr, el('b', null, String(v)));
      }
      card.append(bars);
      const practised = Object.entries(c.skills || {}).filter(([, v]) => v > 0).map(([k, v]) => `${(SKILL[k] || k).split(' —')[0]} ${v}`);
      card.append(el('div', 'small', `Star sign: ${SIGNS[c.birth_cycle]} (make-believe) · Practice: ${practised.join(', ') || 'none yet'}`));
      if (c.discoveries?.length) card.append(el('div', 'small', '🔬 Discoveries: ' + c.discoveries.join('; ')));
    }
    // spells
    const sp = $('v82-spells'); sp.textContent = '';
    if (c && c.spells?.length) for (const s of c.spells) {
      const info = SPELL[s] || { name: s, what: '', cost: 0 };
      const row = el('div', 'item'); row.append(el('b', null, '✨ ' + info.name), el('span', 'small muted', ` — ${info.what} Costs ${info.cost} mana.`));
      const b = el('button', null, 'Cast'); b.dataset.spell = s; b.onclick = run('v82-celestial', async () => { const r = await v82('cast', { spell: s, target: 'self' }); return `✨ You cast ${info.name}! (make-believe) ${r.outcome.omen ? 'The stars whisper: “' + r.outcome.omen + '”.' : ''} Mana left: ${r.character.mana}.`; });
      row.append(el('div', 'row')); row.lastChild.append(b); sp.append(row);
    } else sp.append(el('span', 'small muted', c ? (c.path === 'scientific' ? 'Scientists don’t use spells — try the science lab!' : 'No spells yet.') : 'Create a Wizard or Wizard-Scientist to use spells.'));
    // research
    const mineR = (w.research || []).filter((r) => r.character === cid());
    const sel = $('v82-research-id'), keep = sel.value;
    fill(sel, mineR.slice().reverse().map((r) => [r.id, `${r.title} (${(SCIENCE[r.discipline] || r.discipline).split(' —')[0]})`]));
    if (mineR.some((r) => r.id === keep)) sel.value = keep;
    const list = $('v82-research-list'); list.textContent = '';
    for (const r of mineR.slice().reverse()) {
      const it = el('div', 'item' + (r.status === 'supported_in_simulation' ? ' good' : ''));
      it.append(el('b', null, r.title), el('div', 'small', `Guess: ${r.hypothesis}`), el('div', 'small', `Results: ${r.observations.length ? r.observations.map((o, i) => `${i + 1}) ${o}`).join('  ') : 'none yet'}`), el('div', 'small', RESEARCH_STATUS[r.status] || r.status));
      list.append(it);
    }
    if (!mineR.length) list.append(el('div', 'small muted', 'No projects yet. Write down a guess to start.'));
    // techs
    const tl = $('v82-techs'); tl.textContent = '';
    const known = new Set(c?.known_techs || []);
    const TECHREQ = { automata: ['windmill', 'crystal_lens'], aether_dynamo: ['crystal_lens', 'star_charting'], living_architecture: ['field_medicine'], celestial_engine: ['aether_dynamo', 'automata'] };
    const COST = { windmill: ['engineering', 12], crystal_lens: ['materials', 18], star_charting: ['astronomy', 16], field_medicine: ['biology', 20], automata: ['automation', 32], aether_dynamo: ['energy', 40], living_architecture: ['ecology', 36], celestial_engine: ['astronomy', 55] };
    for (const [id, t] of Object.entries(TECH)) {
      const [skill, cost] = COST[id], req = TECHREQ[id] || [];
      const pts = c ? c.xp + 3 * (c.skills?.[skill] || 0) : 0, ready = c && req.every((x) => known.has(x)) && pts >= cost;
      const it = el('div', 'item' + (known.has(id) ? ' good' : ready ? '' : ' locked'));
      it.append(el('b', null, (known.has(id) ? '✔ ' : '⚙️ ') + t.name), el('span', 'small muted', ' — ' + t.what));
      it.append(el('div', 'small', known.has(id) ? 'Invented!' : `Needs ${cost} points (you have ${pts}; practise ${SKILL[skill].split(' —')[0]})` + (req.length ? ` · First invent: ${req.map((r) => TECH[r].name).join(' + ')}` : '')));
      if (!known.has(id)) { const b = el('button', ready ? 'primary' : null, 'Invent'); b.dataset.tech = id; b.onclick = run('v82-status', async () => { const r = await v82('invent', { technology: id }); return r.status === 'invented' ? `🎉 You invented the ${t.name}! Your town got better.` : 'You already invented that.'; }); it.append(el('div', 'row')); it.lastChild.append(b); }
      tl.append(it);
    }
  }

  $('v82-create').onclick = run('v82-status', async () => { const r = await v82('character', { name: $('v82-name').value, path: $('v82-path').value, birth_cycle: +$('v82-birth').value }); return `Welcome, ${r.name} the ${PATH[r.path].name}! ${PATH[r.path].what}`; });
  $('v82-learn').onclick = run('v82-celestial', async () => { const s = $('v82-learn-spell').value; await v82('learn_spell', { spell: s }); return `You learned ${SPELL[s].name}! (make-believe)`; });
  $('v82-reading').onclick = run('v82-celestial', async () => { const r = await v82('reading'); const bonus = Object.entries(r.gameplay_affinity).filter(([, v]) => v > 0).map(([k]) => ({ arcana: 'magic', science: 'science', craft: 'crafting' }[k])); return `🌟 Your star story (make-believe, just for fun): Sign of ${r.sign}, under the ${r.alignment}. “${r.reading}”${bonus.length ? ` Game bonus today: ${bonus.join(', ')}.` : ''}`; });
  $('v82-hypothesis').onclick = run('v82-status', async () => { const r = await v82('hypothesis', { title: $('v82-title').value, discipline: $('v82-discipline').value, hypothesis: $('v82-hypothesis-text').value }); $('v82-research-id').value = r.id; return `📝 Guess written down: “${r.hypothesis}”. Now test it and record what you see.`; });
  const experiment = (repeat) => run('v82-status', async () => {
    const id = $('v82-research-id').value; if (!id) throw new Error('unknown research');
    const r = await v82('experiment', { research_id: id, observation: $('v82-observation').value, repeat });
    if (!repeat) return `📋 Result recorded (${r.observations.length} so far). Now press “Repeat the test to check”.`;
    if (r.observations.length < 2) return 'You need at least one result before you can repeat the test.';
    return r.reproducible ? '✅ Same result twice — your idea is supported! Real scientists always check like this.' : '🤔 The two results were different, so we can’t be sure yet. Change your guess or test again.';
  });
  $('v82-experiment').onclick = experiment(false); $('v82-repeat-btn').onclick = experiment(true);
  $('v82-train').onclick = run('v82-status', async () => { const d = $('v82-train-discipline').value; await v82('train', { discipline: d, amount: 5 }); return `💪 You practised ${SKILL[d].split(' —')[0]} (+5) and earned 10 XP.`; });
  $('v82-tick-button').onclick = run('v82-status', async () => { await v82('tick', { count: 1 }); return '⏳ Time passes in your town. Every 5 days, magic energy recharges a little.'; });

  async function refreshV82() {
    if (!getSession()) { say('v82-status', 'Sign in (Adventure tab) to save your character. On a home server without accounts the buttons work straight away.'); return; }
    try { const r = await fetch(`/api/v82/world/${V82_WORLD}`, { headers: headers() }); if (r.ok) render(await r.json()); else if (r.status === 401) { say('v82-status', 'Sign in to use the Academy.'); } } catch { /* offline */ }
  }

  // ---------- Tiny Life Lab ----------
  const lifePost = async (body) => { const r = await fetch(`/api/mulux/world/${LIFE_WORLD}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status); return d; };
  function showLife(snap, integ) {
    $('life-population').textContent = snap.population; $('life-tick').textContent = snap.tick; $('life-integrity').textContent = integ.valid ? 'OK ✔' : 'problem ✖';
    say('life-report', `There are ${snap.population} tiny creatures after ${snap.tick} steps. The diary has ${integ.events ?? '?'} pages and ${integ.valid ? 'nobody has changed them' : 'something looks wrong'}.`);
  }
  async function refreshLife() { try { const r = await fetch(`/api/mulux/world/${LIFE_WORLD}`, { headers: headers() }); const d = await r.json(); if (!r.ok) throw new Error(d.error); showLife(d.snapshot, d.integrity); } catch (e) { say('life-report', friendlyError(e.message), true); } }
  $('life-refresh').onclick = refreshLife;
  $('life-tick-button').onclick = async () => { try { const d = await lifePost({ operation: 'tick', count: 12 }); showLife(d.snapshot, d.integrity); } catch (e) { say('life-report', friendlyError(e.message), true); } };
  $('life-receipt').onclick = async () => { try { const d = await lifePost({ operation: 'receipt' }); say('life-report', `🔏 Proof stamp made: ${d.receipt.sha256.slice(0, 12)}… This code is like a fingerprint of the tiny world right now — if anything changed, the code would be totally different.`); } catch (e) { say('life-report', friendlyError(e.message), true); } };
  $('grade-claim').onclick = async () => {
    try {
      const kind = $('claim-evidence').value;
      const d = await lifePost({ operation: 'grade', claim: $('claim-text').value, grade: 'FACT', evidence: kind ? [{ kind }] : [] });
      const flags = d.flags.map((f) => GRADE_FLAG[f] || f);
      say('grade-result', `Verdict: ${GRADE[d.grade] || d.grade}.` + (d.grade !== 'FACT' ? ' To call something proven you need evidence like measuring, counting or a trusted source.' : ' Nice — you have good evidence.') + (flags.length ? ` ⚠️ Careful: it ${flags.join(' and ')}.` : ''));
    } catch (e) { say('grade-result', friendlyError(e.message), true); }
  };
  $('run-genesis').onclick = async () => {
    try {
      const rules = $('genesis-rules').value.split(/\n/).map((x) => x.trim()).filter(Boolean).map((x) => {
        const m = x.match(/^(\w+)\s*(?::|if)\s*(.*)$/i); if (!m) throw new Error('invalid_rule_atom');
        return { then: m[1], if: m[2].split(/,|\band\b/i).map((y) => y.trim()).filter(Boolean) };
      });
      const atoms = [...new Set(['a', ...rules.flatMap((r) => [r.then, ...r.if])])];
      const d = await lifePost({ operation: 'genesis', atoms, axioms: ['a'], rules });
      say('genesis-result', `Starting from “a”, you can work out: ${d.closure.join(', ')} — found in ${d.steps} round${d.steps === 1 ? '' : 's'}.` + (atoms.length > d.closure.length ? ` You can’t work out: ${atoms.filter((x) => !d.closure.includes(x)).join(', ')}.` : ''));
    } catch (e) { say('genesis-result', friendlyError(e.message), true); }
  };

  refreshV82(); refreshLife();
  return { refresh() { refreshV82(); }, render };
}
