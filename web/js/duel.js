// Strata v9.0 real-time duels + Combat Skills panel.
// The fight runs here at 20 Hz on the shared deterministic engine (web/js/combat.js) for instant feel;
// only the input log goes to the server, which replays it to verify the outcome. Teen-safe: sparks and light, no gore.
import { CB, newFight, step } from './combat.js';

const EVT_TEXT = { parry: '✨ PARRY!', perfect_dodge: '💨 Perfect dodge!', guard_break: '🛡️ Guard broken!', guard_broken: 'Your guard broke!', tired: 'Too tired: let stamina refill',
  no_focus: 'Not enough focus for that move', no_special: 'No special move in that slot', e_feint: 'Feint!', e_delay: 'Delayed strike…', e_sidestep: 'It sidestepped!', armour: 'It shrugged that off' };
const ADAPT_TEXT = { light: 'expects quick attacks (guards more)', heavy: 'watches for heavy swings (sidesteps and punishes)', block: 'knows you block (uses heavies and feints)', dodge: 'knows you dodge (delays its strikes)', parry: 'fears your parries (feints and delays)' };

export function initDuel({ $, api, toast, renderer, world, playerId, session, sfx, onWorld, getPrinciples }) {
  let prins = [], fight = null, S = null, log = [], timer = null, pending = [], cfg = null, catalog = null, view = null, held = { block: false };
  const hud = $('duel'), panel = $('combatpanel');
  const body = (o) => ({ ...o, ...(session() ? {} : { player_id: playerId() }) });
  const pathW = () => `/api/v90/combat/${world}`;
  const bar = (id, v, max) => { const el = $(id); if (el) el.style.width = `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`; };
  const flash = (cls) => { const f = $('fx-flash'); if (!f) return; f.className = ''; void f.offsetWidth; f.className = cls; };
  const say = (t) => { const el = $('duel-msg'); el.textContent = t; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); };

  async function start(target = 'practice', meta = {}) {
    if (fight) return;
    try {
      // v9.0 trials (weekly challenge, arena): same verified engine, but the fight comes from (and returns to) the trial endpoint
      const d = meta.trial ? await api('POST', meta.trial.path, { op: 'start' }) : await api('POST', pathW(), body({ operation: 'start', target }));
      cfg = meta.trial ? d.fight : d.result.fight; S = newFight(JSON.parse(JSON.stringify(cfg))); log = []; pending = []; held.block = false;
      fight = { target, name: cfg.enemy.name, enemyId: target === 'practice' || meta.trial ? null : target, trial: meta.trial || null };
      renderer?.setDuel({ S, enemyId: fight.enemyId, weapon: cfg.weapon, name: cfg.enemy.name, face: meta.face });
      document.body.classList.add('in-duel'); hud.classList.remove('hidden');
      $('duel-name').textContent = `${cfg.enemy.name} · level ${cfg.enemy.level}`;
      $('duel-s1').textContent = cfg.loadout[0] ? `✨1 ${cfg.loadout[0].name}` : '✨1 —'; $('duel-s2').textContent = cfg.loadout[1] ? `✨2 ${cfg.loadout[1].name}` : '✨2 —';
      const habit = Object.entries(cfg.adapt).filter(([k]) => k !== 'fights').sort((a, b) => b[1] - a[1])[0];
      $('duel-adapt').textContent = cfg.adapt.fights && habit && habit[1] ? `This ${cfg.enemy.name.toLowerCase()} remembers you: it ${ADAPT_TEXT[habit[0]]}.` : 'A new foe: it will learn your habits as you fight.';
      say('Fight! Watch for the glow: orange means a heavy strike.');
      timer = setInterval(tick, 1000 / CB.tick_hz);
    } catch (e) { toast(e.message === 'target_out_of_reach' ? 'Get closer first (within 2 squares).' : `Can't start a duel: ${e.message}`); }
  }
  function input(a) {
    if (!S || S.over) return false;
    if (a === 'block') { if (!held.block) { held.block = true; pending.push('block_on'); setTimeout(() => { if (held.block && held.voice) { held.block = false; held.voice = false; pending.push('block_off'); } }, 700); } return true; }
    if (a === 'unblock') { if (held.block) { held.block = false; pending.push('block_off'); } return true; }
    if (['light', 'heavy', 'dodge', 'special1', 'special2', 'flee'].includes(a)) { if (pending.filter((x) => x === a).length === 0) pending.push(a); return true; }
    return false;
  }
  function tick() {
    if (!S) return;
    const acts = pending.splice(0, CB.max_per_tick); const t = S.t, before = S.events.length;
    for (const a of acts) log.push([t, a]);
    step(S, acts);
    for (const [, code, v] of S.events.slice(before)) react(code, v);
    // HUD
    bar('duel-hp', S.P.hp, S.P.hpmax); bar('duel-st', S.P.st, S.P.stmax); bar('duel-focus', S.P.focus, CB.player.focus_max); bar('duel-ehp', S.E.hp, S.E.hpmax);
    $('duel-hpv').textContent = S.P.hp; $('duel-ehpv').textContent = `${S.E.hp}/${S.E.hpmax}`;
    $('duel-combo').textContent = S.stats.streak > 1 ? `${S.stats.streak} hit combo` : '';
    const tele = S.E.phase === 'windup' || S.E.phase === 'feint' ? (S.E.move?.kind === 'heavy' ? 'heavy' : 'light') : '';
    hud.dataset.tele = tele; hud.dataset.block = S.P.blocking ? '1' : '';
    for (const [id, i] of [['duel-s1', 0], ['duel-s2', 1]]) $(id).classList.toggle('ready', !!cfg.loadout[i] && S.P.focus >= cfg.loadout[i].focus);
    if (S.over) finish();
  }
  function react(code, v) {
    const W = CB.weapons[cfg.weapon], E = renderer?.duel?.enemyPos;
    if (code === 'light' || code === 'heavy' || code === 'finisher') { renderer?.combatFx('swing', { colour: W.trail, heavy: code !== 'light' }); sfx?.('swing'); if (code === 'finisher') say('💥 Breaker!'); }
    else if (code.startsWith('special:')) { const d = cfg.loadout.find((m) => 'special:' + m.id === code); renderer?.combatFx('swing', { colour: d?.fx?.colour || W.trail, heavy: true }); say(`✨ ${d?.name || 'Special'}!`); flash(renderer?.firstPerson ? 'special fp' : 'special'); }
    else if (code === 'hit') { const last = S.P.move; const big = last && last.kind !== 'light'; renderer?.combatFx('hit', { at: E, colour: last?.kind === 'special' ? (cfg.loadout.find((m) => m.id === last.id)?.fx?.colour || W.trail) : W.trail, big }); sfx?.('hit');
      if (last?.kind === 'special') { const d = cfg.loadout.find((m) => m.id === last.id); renderer?.combatFx('special', { at: E, colour: d?.fx?.colour, fx: d?.fx }); if (d?.fx?.flash) flash(renderer?.firstPerson ? 'bright fp' : 'bright'); } }
    else if (code === 'e_blocked') renderer?.combatFx('blocked', { at: E });
    else if (code === 'parry') { renderer?.combatFx('parry', { at: E }); flash('parry'); say(EVT_TEXT.parry); sfx?.('parry'); }
    else if (code === 'perfect_dodge') { renderer?.combatFx('perfect'); flash('dodge'); say(EVT_TEXT.perfect_dodge); }
    else if (code === 'hurt') { renderer?.combatFx('hurt'); flash('hurt'); }
    else if (code === 'blocked') renderer?.combatFx('blocked');
    else if (code === 'guard_break') { renderer?.combatFx('guard_break', { at: E }); say(EVT_TEXT.guard_break); }
    else if (code === 'e_heavy') say('⚠️ Heavy strike coming: dodge (Space) or parry (Shift just before it lands)');
    else if (EVT_TEXT[code]) say(EVT_TEXT[code]);
  }
  async function finish() {
    clearInterval(timer); timer = null;
    const outcome = S.over; const stats = { ...S.stats };
    if (outcome === 'win') { renderer?.combatFx('win', { at: renderer?.duel?.enemyPos }); say('🏆 Victory!'); }
    else say(outcome === 'fled' ? 'You slipped away.' : outcome === 'timeout' ? 'The foe lost interest.' : 'Knocked down! The foe drives you off.');
    if (fight?.trial) {
      try {
        const d = await api('POST', fight.trial.path, { op: 'finish', inputs: log });
        const r = d.match?.result;
        $('duel-result').innerHTML = `<b>${fight.trial.label}</b> · ✅ server-verified replay<br>Score <b>${d.score}</b>${d.board?.you ? ` · weekly rank #${d.board.you.rank}` : ''}${r ? ` · ${r.draw ? 'Draw' : r.you_won ? '🏆 Your side won the match!' : 'The other side won this time.'}` : d.match ? ' · waiting for the other side to finish' : ''}`;
        $('duel-result').classList.remove('hidden'); fight.trial.done?.(d);
      } catch (e) { toast(`Couldn't save the trial: ${e.message}`); }
      setTimeout(end, 3200); return;
    }
    try {
      const d = await api('POST', pathW(), body({ operation: 'finish', inputs: log, claimed: outcome }));
      view = d.combat;
      const a = d.result.award, verified = d.result.verified;
      $('duel-result').innerHTML = `<b>${outcome === 'win' ? 'Victory' : outcome === 'fled' ? 'Escaped' : outcome === 'timeout' ? 'Stand-off' : 'Defeated'}</b> · ${verified ? '✅ server-verified replay' : '⚠️ server replay differed (its result counts)'}<br>
        +${a.xp} combat XP · skill level ${a.level}${a.levelled ? ' 🎉 level up!' : ''} · best combo ${stats.max_combo} · parries ${stats.parries} · perfect dodges ${stats.perfect}
        ${a.unlocked.length ? `<br>New special moves to learn: ${a.unlocked.map((s) => CB.specials[s].name).join(', ')} (open ⚔️ Combat skills)` : ''}`;
      $('duel-result').classList.remove('hidden');
      if (d.world) onWorld?.(d.world);
    } catch (e) { toast(`Couldn't save the duel: ${e.message}`); }
    setTimeout(end, 2600);
  }
  function end() { fight = null; S = null; renderer?.setDuel(null); hud.classList.add('hidden'); $('duel-result').classList.add('hidden'); document.body.classList.remove('in-duel'); }
  function onKey(e, down) {
    if (!fight || !S) return false;
    const k = e.key.toLowerCase();
    if (down && e.repeat) return ['f', 'r', ' ', 'shift', '1', '2'].includes(k);
    if (k === 'shift') return input(down ? 'block' : 'unblock');
    if (!down) return false;
    const map = { f: 'light', j: 'light', r: 'heavy', k: 'heavy', ' ': 'dodge', '1': 'special1', '2': 'special2', escape: 'flee' };
    return map[k] ? input(map[k]) : false;
  }
  function onPointer(e, down) {
    if (!fight || !S) return false;
    if (down && e.button === 0) return input('light');
    if (down && e.button === 2) return input('heavy');
    return false;
  }
  // touch buttons
  for (const [id, a] of [['dt-light', 'light'], ['dt-heavy', 'heavy'], ['dt-dodge', 'dodge'], ['duel-s1', 'special1'], ['duel-s2', 'special2'], ['dt-flee', 'flee']]) $(id)?.addEventListener('pointerdown', (e) => { e.preventDefault(); input(a); });
  $('dt-block')?.addEventListener('pointerdown', (e) => { e.preventDefault(); input('block'); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('dt-block')?.addEventListener(ev, () => input('unblock'));
  // gamepad (polled by app): X light, Y heavy, A dodge, RB block, LB special 1, RT special 2, B flee
  function pad(gp, prev) {
    if (!fight) return;
    const b = (i) => gp.buttons[i]?.pressed, was = (i) => prev?.[i];
    if (b(2) && !was(2)) input('light'); if (b(3) && !was(3)) input('heavy'); if (b(0) && !was(0)) input('dodge');
    if (b(4) && !was(4)) input('special1'); if (b(7) && !was(7)) input('special2'); if (b(1) && !was(1)) input('flee');
    if (b(5) && !was(5)) input('block'); if (!b(5) && was(5)) input('unblock');
  }
  function voice(op) {
    if (op === 'practice') { start('practice'); return 'Practice duel! F light, R heavy, hold Shift to block, Space to dodge, 1/2 specials.'; }
    if (!fight) return 'Start a fight first: say “practice” or “attack”.';
    if (op === 'block') { held.voice = true; input('block'); return ''; }
    input(op); return '';
  }

  // ---------- Combat skills panel ----------
  async function openPanel() {
    panel.classList.remove('hidden');
    try {
      const qs = session() ? '' : `?player=${encodeURIComponent(playerId())}`;
      prins = await Promise.resolve(getPrinciples ? getPrinciples() : []).catch(() => []);
      [catalog, view] = await Promise.all([catalog ? Promise.resolve(catalog) : api('GET', '/api/v90/combat/catalogue'), api('GET', `${pathW()}${qs}`).then((d) => d.combat)]);
      render();
    } catch (e) { $('cp-body').textContent = `Couldn't load combat skills: ${e.message}`; }
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function render() {
    const v = view, lv = v.level;
    const adapt = Object.entries(v.adapt).map(([sp, a]) => `<li>${esc(catalog.enemies[sp]?.name || sp)}: ${a.fights} fights${a.habit ? `, it ${ADAPT_TEXT[a.habit]}` : ''}</li>`).join('') || '<li>No foe has learned your habits yet.</li>';
    const byWeapon = {};
    for (const [id, d] of Object.entries(catalog.specials)) (byWeapon[d.weapon] ||= []).push([id, d]);
    for (const [id, d] of Object.entries(v.specials)) if (d.invented) (byWeapon[d.weapon] ||= []).push([id, d]);
    const rows = Object.entries(byWeapon).map(([w, list]) => `<h4>${esc(catalog.weapons[w].name)}</h4>` + list.map(([id, d]) => {
      const known = v.specials[id], lo = (v.loadout[w] || []).includes(id);
      const btn = known ? `${known.rank < 3 ? `<button data-up="${id}">Upgrade to rank ${known.rank + 1} (${Object.entries(catalog.ranks.cost[String(known.rank + 1)]).map(([k, n]) => `${n} ${k.replace('_', ' ')}`).join(' + ')})</button>` : '<span class="tag">max rank</span>'}
        <button data-eq="${id}" data-w="${w}">${lo ? '✓ equipped' : 'Equip'}</button>` : (d.level <= lv ? `<button class="primary" data-learn="${id}">Learn</button>` : `<span class="tag">skill level ${d.level}</span>`);
      return `<div class="move${known ? ' known' : ''}"><b>${esc(d.name)}</b>${d.invented ? ' <span class="tag">your invention</span>' : ''} ${known ? `· rank ${known.rank}` : ''} · ${d.hits}× hit · ${known ? known.focus : d.focus} focus · effect: ${esc(d.effect)}<br><span class="small">${esc(d.desc)}</span><div class="row">${btn}</div></div>`;
    }).join('')).join('');
    $('cp-body').innerHTML = `
      <p class="small muted">${esc(catalog.label)}</p>
      <div class="statgrid"><div><b>${lv}</b>skill level</div><div><b>${v.xp}${v.next ? '/' + v.next : ''}</b>XP</div><div><b>${v.wins}/${v.fights}</b>wins</div><div><b>${v.best_combo}</b>best combo</div><div><b>${v.parries}</b>parries</div><div><b>${v.perfect}</b>perfect dodges</div><div><b>${v.parry_window}</b>parry window (ticks)</div><div><b>${v.stamina}</b>stamina</div></div>
      <div class="row"><button id="cp-practice" class="primary">🗿 Practice duel</button></div>
      <details open><summary>How to fight</summary><p class="small">F or left-click: light attack (chain three for a combo) · R or right-click: heavy · light, light, heavy: Breaker finisher (skill 3) · hold Shift: block, and tap it just before a hit lands to <b>parry</b> · Space: dodge-roll (perfectly timed dodges build focus) · 1 / 2: special moves (cost focus) · Esc: flee. Touch: on-screen buttons. Gamepad: X/Y/A/RB/LB/RT. Voice: “light attack”, “block”, “dodge”, “special move”.</p></details>
      <h3>Special moves</h3>${rows}
      <h3>Invent a move <span class="small muted">budget ${v.invent_budget} power</span></h3>
      <p class="small">Combine a shape with one or two principles you have discovered. The canon validator checks conservation (power within budget), the 72/144 harmonic and a 144-trial fair test.</p>
      <div class="row"><select id="cp-w">${Object.entries(catalog.weapons).map(([k, w]) => `<option value="${k}">${esc(w.name)}</option>`).join('')}</select>
      <select id="cp-shape">${Object.entries(catalog.shapes).map(([k, s]) => `<option value="${k}">${esc(s.name)} (${s.hits} hit)</option>`).join('')}</select>
      <select id="cp-p1">${prins.map((p) => `<option>${p}</option>`).join('') || '<option value="">discover principles in the Expedition first</option>'}</select>
      <select id="cp-p2"><option value="">(no second principle)</option>${prins.map((p) => `<option>${p}</option>`).join('')}</select>
      <button id="cp-invent">🧪 Test my move</button></div><div id="cp-inv-out" class="small"></div>
      <h3>What your foes have learned</h3><ul class="small">${adapt}</ul>`;
    $('cp-practice').onclick = () => { panel.classList.add('hidden'); start('practice'); };
    panel.querySelectorAll('[data-learn]').forEach((b) => (b.onclick = () => op({ operation: 'learn', special: b.dataset.learn })));
    panel.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => op({ operation: 'upgrade', special: b.dataset.up })));
    panel.querySelectorAll('[data-eq]').forEach((b) => (b.onclick = () => { const w = b.dataset.w, cur = [...(view.loadout[w] || [])]; const i = cur.indexOf(b.dataset.eq); if (i >= 0) cur.splice(i, 1); else { cur.push(b.dataset.eq); if (cur.length > 2) cur.shift(); } op({ operation: 'equip', weapon: w, loadout: cur }); }));
    $('cp-invent').onclick = async () => {
      const pr = [$('cp-p1').value, $('cp-p2').value].filter(Boolean); if (!pr.length) return toast('Discover a principle first (Expedition → Workshop).');
      try { const d = await api('POST', pathW(), body({ operation: 'invent', weapon: $('cp-w').value, shape: $('cp-shape').value, principles: [...new Set(pr)] })); view = d.combat; const r = d.result;
        render(); $('cp-inv-out').innerHTML = (r.ok ? `🎉 <b>${esc(r.move.name)}</b> works! ${r.move.card.map((c) => `<br><span class="tag">${c.label}</span> ${esc(c.text)}`).join('')}` : `❌ It didn't hold up. ${esc(r.hint)}`) + `<br>${r.laws.map((l) => `${l.ok ? '✅' : '❌'} ${l.law}: ${esc(l.detail)}`).join('<br>')}`;
      } catch (e) { $('cp-inv-out').textContent = `Can't invent that: ${e.message.replace(/_/g, ' ')}`; }
    };
  }
  async function op(o) { try { const d = await api('POST', pathW(), body(o)); view = d.combat; render(); } catch (e) { toast(e.message.replace(/_/g, ' ')); } }
  return { start, input, onKey, onPointer, pad, voice, openPanel, get active() { return !!fight; }, end };
}
