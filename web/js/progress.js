// Strata v9.0 Progress / Codex screen: premise, main objective and the five success measures
// (Lux, Strata Reached, Codex, Mastery, Legacy), the seven core-law puzzles, endings, rewards and New Genesis.
export function initProgress({ $, api, toast, world, playerId, session, confirmAction, onUnlocked }) {
  const el = $('progress'); let g = null;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const body = (o) => ({ ...o, ...(session() ? {} : { player_id: playerId() }) });
  const path = () => `/api/v90/genesis/${world}`;
  const NEED = { discoveries: 'creature discoveries', principles: 'principles known', inventions: 'inventions', allies: 'NPC allies', quiz: 'correct Codex answers', explored: 'chunks explored', secrets: 'NPC secrets learned', combat_level: 'combat skill level', clues: 'clues', lux: 'Lux', stratum: 'stratum', laws: 'laws', ending: 'ending chosen', ending_id: 'ending' };
  const needText = (n) => Object.entries(n || {}).map(([k, v]) => `${typeof v === 'number' ? v + ' ' : ''}${NEED[k] || k}`).join(', ') || 'open to all';
  async function open() { el.classList.remove('hidden'); await refresh(); }
  async function refresh() {
    try { const qs = session() ? '' : `?player=${encodeURIComponent(playerId())}`; g = (await api('GET', path() + qs)).genesis; render(); onUnlocked?.(g); }
    catch (e) { $('pg-body').textContent = `Couldn't load your progress: ${e.message}`; }
  }
  function render() {
    const s = g.stratum, L = g.lux, m = g.measures, next = s.next;
    const pct = next ? Math.min(100, Math.round(((L.total - (g.strata[s.index]?.lux || 0)) / Math.max(1, next.lux - (g.strata[s.index]?.lux || 0))) * 100)) : 100;
    const bands = g.strata.map((st, i) => `<li class="${i <= s.index ? 'on' : ''}${i === s.index ? ' here' : ''}" title="${esc(st.name)}: ${st.lux} Lux + ${st.laws} laws">${esc(st.name.split('·').pop().trim())}</li>`).reverse().join('');
    const parts = Object.entries(L.parts).filter(([, v]) => v).map(([k, v]) => `<span class="chip">${esc(k)} +${v}</span>`).join(' ') || '<span class="small muted">Make a discovery, answer a Codex question or befriend someone to earn your first Lux.</span>';
    const laws = g.laws.map((l) => `<div class="law ${l.claimed ? 'claimed' : l.unlocked ? 'open' : 'locked'}">
      <div class="lawhead"><b class="const">${esc(l.value)}</b> ${esc(l.name)} <span class="small muted">· ${esc(l.realm)}</span></div>
      ${l.claimed ? `<p class="small"><span class="tag fact">FACT</span> ${esc(l.fact)}<br><span class="tag theory">SSR/CRA THEORY</span> ${esc(l.theory)}</p>`
        : l.unlocked ? `<p class="small">${esc(l.q)}</p><div class="opts">${l.options.map((o, i) => `<button data-law="${l.id}" data-a="${i}">${esc(o)}</button>`).join('')}</div>${l.attempts ? `<p class="small muted">${l.attempts} attempt(s): think it through, there's no penalty.</p>` : ''}`
        : `<p class="small muted">🔒 Needs ${esc(needText(l.need))}.</p>`}</div>`).join('');
    const endings = g.endings.map((e) => `<div class="ending ${e.chosen ? 'chosen' : e.available ? 'open' : ''}"><b>${esc(e.name)}</b>
      ${e.chosen ? `<p class="small">${esc(e.text)}</p>` : e.hidden ? `<p class="small muted">${esc(e.hint || 'A hidden path…')}</p>` : `<p class="small muted">Needs the Source Stratum${Object.keys(e.need).length ? ' + ' + esc(needText(e.need)) : ''}.</p>`}
      ${e.available && !g.ending ? `<button class="primary" data-end="${e.id}">Restore this reality</button>` : ''}</div>`).join('');
    const rewards = g.rewards.map((r) => `<li class="${r.claimed ? 'done' : r.ready ? 'ready' : ''}"><span class="tag">${esc(r.kind)}</span> ${esc(r.name)} ${r.claimed ? (r.kind === 'title' ? (g.title === r.id ? '· <b>current title</b>' : `<button data-title="${r.id}">Use title</button>`) : '✓') : r.ready ? `<button data-claim="${r.id}">Claim</button>` : `<span class="small muted">(${esc(needText(r.need))})</span>`}</li>`).join('');
    $('pg-body').innerHTML = `
      <div class="premise"><p><b>Your story.</b> ${esc(g.premise)}</p><p><b>Main objective.</b> ${esc(g.objective)}</p><p class="small muted">${esc(g.label)}</p></div>
      ${g.cycle ? `<p class="genesis-cycle">🌌 New Genesis cycle ${g.cycle}: deeper strata, tougher foes, your Codex carried over.</p>` : ''}
      <div class="measures">
        <div class="measure lux"><b>${m.lux}</b><span>✨ Lux</span><small>${L.understanding_pct}% from understanding</small></div>
        <div class="measure"><b>${m.strata_reached}<small>/${s.of - 1}</small></b><span>🪜 Strata reached</span><small>${esc(s.name)}</small></div>
        <div class="measure"><b>${m.codex}</b><span>📘 Codex</span><small>discoveries & inventions</small></div>
        <div class="measure"><b>${m.mastery}</b><span>⚔️ Mastery</span><small>combat, moves, crafting</small></div>
        <div class="measure"><b>${m.legacy}</b><span>🌱 Legacy</span><small>lasting world & NPC change</small></div>
      </div>
      <div class="climb"><ol class="strata-ladder">${bands}</ol><div>
        <h3>${esc(s.name)}${s.source ? ' 🌟' : ''}</h3>
        ${next ? `<div class="meter"><i style="width:${pct}%"></i></div><p class="small">Next: <b>${esc(next.name)}</b> needs ${next.lux} Lux and ${next.laws} core laws (you have ${L.total} Lux, ${g.laws_claimed} laws).</p>` : '<p>You stand at the deepest stratum of this cycle.</p>'}
        <p class="small muted">${esc(g.lux_note)}</p><div>${parts}</div></div></div>
      <h3>The seven core laws <span class="small muted">${g.laws_claimed}/7</span></h3><div class="laws">${laws}</div>
      <h3>Endings: choose what reality to restore</h3><div class="endings">${endings}</div>
      <h3>Rewards</h3><ul class="rewards">${rewards}</ul>
      <h3>After the story</h3><p class="small">${esc(g.after)}</p>
      <button id="pg-genesis" ${g.ending ? '' : 'disabled'}>🌌 Begin New Genesis${g.ending ? '' : ' (choose an ending first)'}</button>
      ${g.archive.length ? `<h3>Codex archive</h3><ul class="small">${g.archive.map((a) => `<li>Cycle ${a.cycle}: ${esc(a.ending)} ending · ${a.laws.length} laws · ${a.inventions.length} inventions</li>`).join('')}</ul>` : ''}`;
    el.querySelectorAll('[data-law]').forEach((b) => (b.onclick = () => op({ operation: 'claim_law', law: b.dataset.law, answer: +b.dataset.a })));
    el.querySelectorAll('[data-claim]').forEach((b) => (b.onclick = () => op({ operation: 'claim_reward', reward: b.dataset.claim })));
    el.querySelectorAll('[data-title]').forEach((b) => (b.onclick = () => op({ operation: 'set_title', title: b.dataset.title })));
    el.querySelectorAll('[data-end]').forEach((b) => (b.onclick = () => confirmAction(`Restore the “${b.textContent}” reality? This choice ends your story for this cycle.`, () => op({ operation: 'choose_ending', ending: b.dataset.end }))));
    $('pg-genesis').onclick = () => newGenesis();
  }
  function newGenesis() {
    confirmAction('Begin New Genesis? Your inventions (Codex), titles and cosmetics carry over; your realm progress, bag and laws start again on a new, deeper seed.', () => op({ operation: 'new_genesis', confirm: true }));
  }
  async function op(o) {
    try {
      const d = await api('POST', path(), body(o)); g = d.genesis; render(); onUnlocked?.(g);
      const r = d.result;
      if (o.operation === 'claim_law') toast(r.correct ? `✨ ${r.name} (${r.value}) restored! +${r.lux} Lux` : r.hint);
      if (o.operation === 'choose_ending') toast(`🌟 ${r.name}: ${r.text}`);
      if (o.operation === 'new_genesis') toast(`🌌 New Genesis cycle ${r.cycle}: ${r.deeper} strata to climb.`);
    } catch (e) { toast(e.message.replace(/_/g, ' ')); }
  }
  async function confirmed() { el.classList.remove('hidden'); await op({ operation: 'new_genesis', confirm: true }); }
  return { open, refresh, newGenesis, confirmed, get view() { return g; } };
}
