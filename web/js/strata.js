// Strata: Lux Genesis client layer: title screen, Journal (rank, bounties, arcs, achievements), Codex (GCSE lessons,
// graphs and server-checked quizzes), Malcolm guide drawer, player chat, world-event banner and the owner-YES rule card.
import { graphSVG } from './codexgraph.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SEASON_ICON = { Spring: '🌱', Summer: '☀️', Autumn: '🍂', Winter: '❄️' };

export function initStrata(ctx) {
  const { api, toast, audio, world } = ctx;
  const q = () => (ctx.isGuest() ? `?player=${encodeURIComponent(ctx.playerId())}` : '');
  let view = null, codex = null, lessonId = null, quiz = null, mmode = 'guide', history = [], lastEvent = null;

  // ---------- title screen ----------
  const title = $('titlescreen');
  if (ctx.skipTitle) title.classList.add('hidden');
  $('playbtn').onclick = () => { title.classList.add('hidden'); if (ctx.store.get('sound', false)) audio.set(true); ctx.onPlay?.(); };

  // ---------- profile / journal ----------
  async function refresh() {
    try { view = await api('GET', `/api/v90/profile/${world}${q()}`); } catch { return; }
    $('rankname').textContent = view.rank.title; $('renown').textContent = view.renown;
    const ev = view.world.event, season = view.world.season;
    $('eventicon').textContent = ev.icon; $('eventname').textContent = ev.name; $('season').textContent = `${SEASON_ICON[season] || ''} ${season}`;
    ctx.renderer?.setEnvironment?.({ event: ev.id, season });
    audio.setMood({ event: ev.id });
    if (lastEvent && lastEvent !== ev.id) banner(`${ev.icon} ${ev.name}: ${ev.text}`);
    lastEvent = ev.id;
    if (!$('journal').classList.contains('hidden')) renderJournal();
  }
  function banner(text) { const b = $('eventbanner'); b.textContent = text; b.classList.remove('hidden'); b.classList.add('show'); clearTimeout(banner.t); banner.t = setTimeout(() => b.classList.add('hidden'), 6000); }
  const codexRanks = () => (codex?.ranks || [['Wanderer', 0], ['Lightseeker', 60], ['Stratum Warden', 160], ['Lux Lorekeeper', 320], ['Genesis Archon', 560]]).map((x) => (typeof x[0] === 'number' ? [x[1], x[0]] : x));
  function renderJournal() {
    if (!view) return;
    const r = view.rank, ranks = codexRanks(), cur = ranks.find((x) => x[0] === r.title) || [r.title, 0], nx = r.next_at != null ? ranks.find((x) => x[1] === r.next_at) || ['the next rank', r.next_at] : null;
    $('j-rank').innerHTML = `<div class="rankrow"><b class="rankbig">🏅 ${esc(r.title)}</b><span>Renown <b>${view.renown}</b> · Insight <b>${view.insight}</b> · Challenge <b>${esc(view.difficulty.name)}</b> (${view.difficulty.level}/5)</span></div>` +
      (nx ? `<div class="track"><div class="fill xp" style="width:${Math.min(100, Math.round(100 * (view.renown - cur[1]) / Math.max(1, nx[1] - cur[1])))}%"></div></div><div class="small muted">${nx[1] - view.renown} renown to ${esc(nx[0])}</div>` : '<div class="small">Top rank reached. You are a Genesis Archon!</div>') +
      `<div class="small muted">World: ${esc(view.world.event.icon)} ${esc(view.world.event.name)} (${view.world.ticks_left} days left) · ${esc(view.world.season)}. The challenge level adapts to how you play.</div>`;
    $('j-day').textContent = `· ${view.bounties_done} completed`;
    const b = view.bounty;
    $('j-bounty').innerHTML = b ? `<div class="quest"><div><b>${esc(b.title)}</b><div class="prog"><i style="width:${Math.min(100, 100 * b.progress / b.target)}%"></i></div><span class="small">${b.progress}/${b.target} · +${b.renown} renown</span></div>
      <div class="row">${b.progress >= b.target ? '<button class="primary" data-op="claim_bounty">Claim</button>' : ''}<button data-op="abandon_bounty" class="small">Drop</button></div></div>` : '<p class="small muted">No bounty yet. Pick one below.</p>';
    $('j-offers').innerHTML = b ? '' : view.offers.map((o) => `<button class="offer" data-bounty="${esc(o.id)}"><b>${esc(o.title)}</b><span class="small">+${o.renown} renown</span></button>`).join('');
    $('j-arcs').innerHTML = view.arcs.map((a) => `<div class="arc ${a.done ? 'done' : ''}"><b>${esc(a.title)}</b>${a.chapters.map((c) => `<div class="chapter ${c.done ? 'done' : c.current ? 'current' : ''}">${c.done ? '✅' : c.current ? '➡️' : '🔒'} <b>${esc(c.title)}</b> <span class="small muted">${esc(c.goal)}</span></div>`).join('')}</div>`).join('');
    const got = view.achievements.filter((a) => a.unlocked).length;
    $('j-achcount').textContent = `${got}/${view.achievements.length}`;
    $('j-ach').innerHTML = view.achievements.map((a) => `<div class="ach ${a.unlocked ? 'got' : ''}" title="${esc(a.desc)}"><b>${a.unlocked ? '🏆' : '◻️'} ${esc(a.name)}</b><span class="small">${esc(a.desc)}</span><div class="prog"><i style="width:${Math.min(100, 100 * a.progress / a.need)}%"></i></div></div>`).join('');
  }
  $('journal').addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    try {
      if (t.dataset.bounty) await profOp({ operation: 'accept_bounty', bounty_id: t.dataset.bounty });
      else if (t.dataset.op) await profOp({ operation: t.dataset.op });
    } catch (err) { toast(ctx.friendly(err.message)); }
  });
  async function profOp(body) {
    const d = await api('POST', `/api/v90/profile/${world}`, { ...body, ...(ctx.isGuest() ? { player_id: ctx.playerId() } : {}) });
    view = d.profile; onUnlocked(d.unlocked); renderJournal(); refreshPills(); return d;
  }
  function refreshPills() { if (view) { $('rankname').textContent = view.rank.title; $('renown').textContent = view.renown; } }
  function onUnlocked(list) {
    for (const a of list || []) { toast(`🏆 Achievement: ${a.name}! +10 renown`); audio.play('achieve'); }
    if (list?.length) refresh();
  }

  // ---------- codex ----------
  async function openCodex() {
    show('codex');
    if (!codex) { try { codex = await api('GET', '/api/v90/codex'); } catch { toast('The Codex is offline right now.'); return; } }
    if (!view) await refresh();
    renderCodexList(); selectLesson(lessonId || codex.lessons[0].id);
  }
  function renderCodexList() {
    const groups = { adventure: '🗺️ Adventure', academy: '🔬 Academy', lifelab: '🧬 Life Lab' };
    $('cx-list').innerHTML = Object.entries(groups).map(([m, label]) => `<div class="cxgroup">${label}</div>` + codex.lessons.filter((l) => l.mode === m).map((l) => {
      const st = view?.lessons?.[l.id]; return `<button class="cxitem ${l.id === lessonId ? 'active' : ''}" data-lesson="${l.id}">${st?.passed ? '✅' : '📄'} ${esc(l.title)}</button>`;
    }).join('')).join('');
  }
  function selectLesson(id) {
    lessonId = id; quiz = null; const l = codex.lessons.find((x) => x.id === id); if (!l) return;
    const thorley = /Thorley/.test(l.grade);
    const art = $('cx-lesson'); art.innerHTML = '';
    art.insertAdjacentHTML('beforeend', `<h3>${esc(l.title)}</h3><span class="grade ${thorley ? 'thorley' : 'fact'}">${esc(l.grade)}</span>
      <p>${esc(l.body)}</p><div class="eq"><b>Equation:</b> <code>${esc(l.equation)}</code></div><div class="small muted">Units: ${esc(l.units)}</div>
      <div class="example"><b>Worked example:</b> ${esc(l.example)}</div>`);
    if (l.graph) art.append(graphSVG(l.graph));
    art.insertAdjacentHTML('beforeend', `<div class="quizbox" id="cx-quiz"><button class="primary" id="cx-start">Test yourself</button> <span class="small muted">Get 2 questions right to pass. Each question is new.</span></div>`);
    $('cx-start').onclick = () => startQuiz(l.id);
    renderCodexList();
  }
  async function startQuiz(id) {
    try { const d = await profOp({ operation: 'quiz_start', lesson: id }); quiz = { ...d.result, n: (quiz?.n || 0) + 1 }; renderQuiz(); } catch (e) { toast(ctx.friendly(e.message)); }
  }
  function renderQuiz(feedback = '') {
    $('cx-quiz').innerHTML = `${feedback ? `<div class="feedback">${feedback}</div>` : ''}<div><b>Question ${quiz.n}:</b> ${esc(quiz.prompt)}</div>
      <form id="cx-form" class="row"><input id="cx-ans" inputmode="decimal" placeholder="Answer${quiz.unit ? ' in ' + esc(quiz.unit) : ''}" autocomplete="off"><button class="primary">Check</button></form>`;
    $('cx-form').onsubmit = async (e) => {
      e.preventDefault(); const v = parseFloat($('cx-ans').value); if (!Number.isFinite(v)) return toast('Type a number.');
      try {
        const d = await profOp({ operation: 'quiz_answer', answer: v }), r = d.result;
        audio.play(r.correct ? 'correct' : 'wrong');
        const fb = r.correct ? `✅ Correct! ${esc(+r.answer.toFixed(3))} ${esc(r.unit)} · +10 insight` : `❌ Not quite. The answer was ${esc(+r.answer.toFixed(3))} ${esc(r.unit)}. Check the equation above and try another.`;
        $('cx-quiz').innerHTML = `<div class="feedback">${fb}</div><p><b>${r.newly_passed ? '🎉 Lesson passed! +15 renown' : r.passed ? '✅ Lesson already passed. Practice makes perfect.' : `Correct so far: ${r.correct_count}/${r.needed} needed to pass.`}</b></p><button class="primary" id="cx-again">Next question</button>`;
        $('cx-again').onclick = () => startQuiz(lessonId); renderCodexList();
      } catch (err) { toast(ctx.friendly(err.message)); }
    };
    $('cx-ans').focus();
  }
  $('cx-list').addEventListener('click', (e) => { const b = e.target.closest('[data-lesson]'); if (b) selectLesson(b.dataset.lesson); });

  // ---------- Malcolm ----------
  function addMsg(who, text, cls = '') { const d = document.createElement('div'); d.className = `msg ${who} ${cls}`; d.textContent = text; $('m-log').append(d); $('m-log').scrollTop = 1e9; }
  if (!$('m-log').children.length) addMsg('malcolm', "Hello! I'm Malcolm, your guide through the Strata. Ask me how to play, about the science, or for a story.");
  document.querySelectorAll('.mmode').forEach((b) => { b.onclick = () => { mmode = b.dataset.mode; document.querySelectorAll('.mmode').forEach((x) => x.classList.toggle('active', x === b)); $('m-input').placeholder = { guide: 'How do I…?', explain: 'Explain kinetic energy…', lore: 'A legend about… (or leave blank)' }[mmode]; }; });
  $('m-form').onsubmit = async (e) => {
    e.preventDefault(); const msg = $('m-input').value.trim(); if (!msg && mmode !== 'lore') return;
    addMsg('me', msg || '(new legend please)'); $('m-input').value = ''; $('m-status').textContent = 'thinking…';
    try {
      const d = await api('POST', `/api/v90/malcolm${q()}`, { mode: mmode, message: msg, history: history.slice(-8), world });
      addMsg('malcolm', d.text, d.source); if (d.notice) addMsg('malcolm', d.notice, 'notice');
      history.push({ role: 'user', content: msg }, { role: 'assistant', content: d.text });
      $('m-status').textContent = d.source === 'malcolm' ? 'live' : d.source === 'safety' ? 'safety' : 'offline guide';
      onUnlocked(d.unlocked); audio.play('message');
    } catch (err) { addMsg('malcolm', 'I can’t reach my thoughts right now. Try again in a moment.', 'offline'); $('m-status').textContent = 'offline'; }
  };

  // ---------- chat & owner-YES rule ----------
  $('chatbox').onsubmit = async (e) => {
    e.preventDefault(); const m = $('chatinput').value.trim(); if (!m) return;
    $('chatinput').value = ''; $('chatbox').classList.add('hidden');
    await ctx.act({ type: 'chat', message: m });
  };
  $('policy-check').onclick = async () => {
    try {
      const r = await api('POST', `/api/mulux/world/${world}`, { operation: 'policy', action: $('policy-action').value, owner_yes: $('policy-yes').checked });
      $('policy-result').textContent = r.decision === 'allow' ? `✅ Allowed (${r.reason}).` : r.decision === 'needs_owner_yes' ? '✋ Waiting: this needs the owner’s YES first.' : `⛔ Never allowed (${r.reason}).`;
    } catch (err) {
      const needs = $('policy-action').value !== 'compute_local';
      $('policy-result').textContent = needs && !$('policy-yes').checked ? '⛔ Not allowed: this action needs the owner’s YES first.' : '✅ Allowed under the rule.';
    }
  };

  // ---------- overlays & keys ----------
  const overlays = ['journal', 'codex', 'malcolm'];
  function show(id) { overlays.forEach((o) => $(o).classList.toggle('hidden', o !== id)); if (id === 'journal') { renderJournal(); refresh(); } if (id === 'malcolm') setTimeout(() => $('m-input').focus(), 50); }
  function closeAll() { let any = false; for (const o of overlays) if (!$(o).classList.contains('hidden')) { $(o).classList.add('hidden'); any = true; } if (!$('chatbox').classList.contains('hidden')) { $('chatbox').classList.add('hidden'); any = true; } return any; }
  document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => $(b.dataset.close).classList.add('hidden'); });
  for (const o of ['journal', 'codex']) $(o).addEventListener('click', (e) => { if (e.target.id === o) $(o).classList.add('hidden'); });
  $('journalbtn').onclick = () => ($('journal').classList.contains('hidden') ? show('journal') : closeAll());
  $('codexbtn').onclick = () => ($('codex').classList.contains('hidden') ? openCodex() : closeAll());
  $('malcolmbtn').onclick = () => ($('malcolm').classList.contains('hidden') ? show('malcolm') : closeAll());
  const chatOpen = () => { $('chatbox').classList.remove('hidden'); $('chatinput').focus(); };
  $('chatbtn').onclick = chatOpen;
  const sb = $('soundbtn'), os = $('opt-sound');
  const setSound = (v) => { audio.set(v); ctx.store.set('sound', v); sb.textContent = v ? '🔊' : '🔇'; if (os) os.checked = v; };
  sb.onclick = () => setSound(!audio.on); if (os) { os.checked = ctx.store.get('sound', false); os.onchange = () => setSound(os.checked); }
  sb.textContent = ctx.store.get('sound', false) ? '🔊' : '🔇';
  function onKey(k) {
    if (k === 'j') { $('journalbtn').click(); return true; }
    if (k === 'k') { $('codexbtn').click(); return true; }
    if (k === 'm') { $('malcolmbtn').click(); return true; }
    if (k === 'enter') { chatOpen(); return true; }
    return false;
  }
  const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  return { refresh, onUnlocked, onKey, closeAll, typing, banner, get view() { return view; }, openCodex, show };
}
