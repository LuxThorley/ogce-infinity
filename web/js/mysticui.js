// v9.0 "Sky & Spirits" panel: the in-game sky and zodiac, alignments and what they do to your powers, star-chart puzzles,
// the Grand Year, sacred sites and blessings, spirits, rune enchantments, and the lore trail (crop-circle glyphs and
// Lux Prime Canon pages). Everything mystical is labelled MYSTICAL/IN-GAME; real astronomy is labelled FACT.
import { sky as localSky, MY } from './mystic.js';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FX = { special_mult: (v) => `specials +${v}%`, magic_mult: (v) => `magic +${v}%`, hp: (v) => `health +${v}`, stamina: (v) => `stamina +${v}`, focus: (v) => `focus cost −${v}` };
export const fxText = (e) => Object.entries(e || {}).filter(([, v]) => v).map(([k, v]) => FX[k](v)).join(', ') || 'no change';
const badge = (l) => `<span class="lab ${l === 'FACT' ? 'fact' : l === 'MYSTICAL/IN-GAME' ? 'mystic' : l === 'IN-GAME' ? 'game' : 'theory'}">${esc(l)}</span>`;
export function drawGlyph(cv, spokes, opts = {}) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.46;
  g.fillStyle = opts.bg || '#3d5a2a'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(240,230,170,.35)'; g.lineWidth = 1.5; for (let k = 1; k <= 5; k++) { g.beginPath(); g.arc(cx, cy, R * (0.25 + k * 0.15), 0, 7); g.stroke(); }
  g.fillStyle = '#efe6b0'; g.beginPath(); g.arc(cx, cy, R * 0.16, 0, 7); g.fill();
  spokes.forEach((sp, i) => { const a = -Math.PI / 2 + (i / spokes.length) * Math.PI * 2;
    g.strokeStyle = 'rgba(240,230,170,.5)'; g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.18, cy + Math.sin(a) * R * 0.18); g.lineTo(cx + Math.cos(a) * R * 1.0, cy + Math.sin(a) * R * 1.0); g.stroke();
    sp.forEach((bit, k) => { const r = R * (0.4 + k * 0.15); g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, R * (bit ? 0.055 : 0.02), 0, 7); g.fillStyle = bit ? '#fff7cc' : 'rgba(240,230,170,.35)'; g.fill(); }); });
}
export function drawSkyWheel(cv, v) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.44;
  g.clearRect(0, 0, W, H); const night = v.sky.night;
  const bg = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.1); bg.addColorStop(0, night ? '#151a3a' : '#2a4a7a'); bg.addColorStop(1, night ? '#05060f' : '#10203a'); g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, R * 1.08, 0, 7); g.fill();
  const ELC = { fire: '#ff8a5c', earth: '#9ccf6b', air: '#bfe3ff', water: '#6fb7ff' };
  v.signs.forEach((s, i) => { const a0 = -Math.PI / 2 - (i * Math.PI) / 6, a1 = a0 - Math.PI / 6; g.beginPath(); g.arc(cx, cy, R, a1, a0); g.arc(cx, cy, R * 0.8, a0, a1, true); g.closePath();
    g.fillStyle = s.id === v.sky.sun.sign ? ELC[s.element] + 'aa' : ELC[s.element] + '22'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.25)'; g.stroke();
    const am = (a0 + a1) / 2; g.fillStyle = '#fff'; g.font = `${Math.round(R * 0.11)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.glyph, cx + Math.cos(am) * R * 0.9, cy + Math.sin(am) * R * 0.9); });
  const pos = (lon, r) => { const a = -Math.PI / 2 - (lon / 360000) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const [sx, sy] = pos(v.sky.sun.lon, R * 0.68); g.fillStyle = '#ffd34d'; g.shadowColor = '#ffd34d'; g.shadowBlur = 18; g.beginPath(); g.arc(sx, sy, R * 0.06, 0, 7); g.fill(); g.shadowBlur = 0;
  v.sky.planets.forEach((p, i) => { const P = v.planets.find((q) => q.id === p.id); const [x, y] = pos(p.lon, R * (0.6 - i * 0.07)); g.fillStyle = `rgb(${P.colour.map((c) => Math.round(c * 255)).join(',')})`; g.beginPath(); g.arc(x, y, R * 0.035, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = `${Math.round(R * 0.08)}px serif`; g.fillText(P.glyph, x, y - R * 0.07); });
  const ph = v.sky.moon.phase; g.fillStyle = '#e8e8f0'; g.beginPath(); g.arc(cx, cy, R * 0.12, 0, 7); g.fill(); g.fillStyle = night ? '#151a3a' : '#2a4a7a';
  const k = Math.cos((ph / 8) * Math.PI * 2); g.beginPath(); g.ellipse(cx + (ph < 4 ? -1 : 1) * R * 0.12 * (1 - Math.abs(k)) * 0, cy, R * 0.12 * Math.abs(k), R * 0.12, 0, 0, 7); if (ph !== 4) g.fill();
}
export function initMysticUI({ $, api, toast, world, playerId, session, renderer, audio, onSky, markDone }) {
  let v = null, lore = null, tab = 'sky';
  const qs = () => (session() ? '' : `?player=${encodeURIComponent(playerId())}`), body = (b) => ({ ...b, ...(session() ? {} : { player_id: playerId() }) });
  async function refresh() {
    try { v = await api('GET', `/api/v90/mystic/${world}${qs()}`); lore = await api('GET', `/api/v90/lore/${world}${qs()}`); }
    catch (e) { const s = localSky(Math.floor(Date.now() / 5000), 7); v = v || { offline: true, sky: s, label: MY.label, signs: MY.signs, planets: MY.planets, alignments: MY.alignments, moon_fx: MY.moon_fx, grand: MY.grand, elements: MY.elements, grand_year: { name: 'Age of Aquarius', glyph: '♒' }, grand_year_text: MY.grand_year, puzzles: [], sites: MY.sites, spirits_all: MY.spirits, runes_all: MY.runes, spirits: [], runes: {}, visible: [], charts: 0, solved_today: [], science_note: MY.science_note }; }
    renderer && (renderer.mystic = { planets: v.sky.planets.map((p) => ({ lon: p.lon, colour: v.planets.find((q) => q.id === p.id).colour })), night: v.sky.night, spirits: v.visible.length, full: v.sky.moon.phase === 4 });
    onSky?.(v);
    return v;
  }
  async function op(b) {
    try { const d = await api('POST', `/api/v90/mystic/${world}`, body(b)); v = { ...v, ...d.mystic }; await refresh(); render(); return d.result; }
    catch (e) { toast(friendly(e.message)); return null; }
  }
  const friendly = (c) => ({ too_far: 'Walk to that sacred site first (on the 🌍 Expedition map, within 2 squares).', site_sleeping: 'This site is asleep right now. Some wake only at night or at a new or full moon.', already_blessed_today: 'You have already been blessed here today. Come back tomorrow (in-game).', spirit_hidden: 'The spirit is not here right now. Try at night, or at a full moon.', already_solved: 'You already answered that chart today.', charts_done_today: 'That is all the star charts for today.', missing_items: 'You need more materials in your Expedition bag.', unknown_weapon: 'Pick a weapon to enchant (not fists).', glyph_not_found_yet: 'Find this glyph first by visiting its sacred site.', not_solar_return: 'Today is not a Solar Return.', unauthorized: 'Sign in to keep your progress.' }[c] || 'Something went wrong. Please try again.');
  async function open(t) { tab = t || tab; $('skypanel').classList.remove('hidden'); markDone?.('sky'); await refresh(); render(); }
  function close() { $('skypanel').classList.add('hidden'); }
  function render() {
    if (!v) return;
    const S = v.sky, sign = v.signs.find((s) => s.id === S.sun.sign), act = S.active.map((id) => v.alignments.find((a) => a.id === id) || Object.values(v.moon_fx).find((m) => m.id === id) || (id === v.grand.id ? v.grand : null)).filter(Boolean);
    const tabs = [['sky', '🌌 Sky'], ['charts', '🗺️ Star charts'], ['sites', '⛩️ Sites & spirits'], ['runes', '🔥 Runes & spells'], ['year', '♒ Grand Year'], ['lore', '📜 Lore']];
    let h = `<p class="small">${badge('MYSTICAL/IN-GAME')} ${esc(v.label)}</p><div class="row wrap tabs">${tabs.map(([k, l]) => `<button data-mt="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div>`;
    if (v.offline) h += '<p class="small warn">Offline: showing a local sky. Blessings, charts and runes need a connection.</p>';
    if (tab === 'sky') {
      h += `<div class="skygrid"><canvas id="skywheel" width="360" height="360" aria-label="Zodiac wheel with the Sun, Moon and planets"></canvas><div>
        <p><b>Day ${S.day}</b> · ${S.night ? '🌙 Night' : '☀️ Day'} · ${esc(S.moon.name)}</p>
        <p>${badge('MYSTICAL/IN-GAME')} Sun in <b>${sign.glyph} ${esc(sign.name)}</b> (${sign.element}): ${esc(v.elements[sign.element].gift)}</p>
        <h4>Tonight's influences</h4>${act.length ? `<ul>${act.map((a) => `<li><b>${esc(a.name)}</b>: ${esc(a.text)}</li>`).join('')}</ul>` : '<p class="small muted">No alignments right now. The planets move each in-game day.</p>'}
        <p>Next duel: <b>${fxText(S.effects)}</b>${v.blessing ? ` · plus blessing from ${esc(v.sites.find((s) => s.id === v.blessing.site)?.name)} (${fxText(v.blessing.effect)})` : ''}</p>
        <p class="small">${badge('FACT')} Real planets take ${v.planets.map((p) => `${p.name} ${p.real_days} days`).join(', ')} to orbit the Sun; Strata's sky runs faster.</p>
        <p class="small muted">${esc(v.science_note)}</p>
        <button id="sky-card">📤 Export star-chart card</button></div></div>`;
    } else if (tab === 'charts') {
      h += `<p>Star charts solved: <b>${v.charts}</b> (each counts toward your Codex quiz facts). Up to 3 a day; at the Star Dais at night they count double.</p>`;
      h += v.puzzles.map((p) => `<div class="card"><p><b>${esc(p.q)}</b></p><div class="row wrap">${p.choices.map((c, i) => `<button data-pz="${esc(p.id)}" data-ch="${i}" ${v.solved_today.includes(p.id) ? 'disabled' : ''}>${esc(c)}</button>`).join('')}</div>${v.solved_today.includes(p.id) ? '<p class="small muted">Answered today.</p>' : ''}</div>`).join('') || '<p class="muted">Charts appear when you are online.</p>';
      h += '<p class="small muted">Tip: the 🌌 Sky wheel shows everything you need.</p>';
    } else if (tab === 'sites') {
      h += '<p class="small">Sacred sites live on the 🌍 Expedition map. Stand within 2 squares to receive a blessing (it powers your next duel) or meet a spirit.</p>';
      h += v.sites.map((s) => { const sps = v.spirits_all.filter((x) => x.site === s.id); return `<div class="card"><b>${esc(s.name)}</b> <span class="small muted">${esc(s.realm)} (${s.x}, ${s.y}) · wakes: ${s.when === 'any' ? 'always' : s.when === 'night' ? 'at night' : 'new or full moon'}</span>
        <p class="small">${badge('MYSTICAL/IN-GAME')} ${esc(s.text)}</p><div class="row wrap"><button data-bless="${s.id}">🙏 Receive blessing (${fxText(s.effect)})</button>
        ${sps.map((sp) => `<button data-spirit="${sp.id}" ${v.spirits.includes(sp.id) ? 'class="done"' : ''}>${sp.kind === 'apparition' ? '👻' : '✨'} ${esc(sp.name)}${v.visible.includes(sp.id) ? ' (here now)' : ''}${v.spirits.includes(sp.id) ? ' ✔' : ''}</button>`).join('')}</div></div>`; }).join('');
    } else if (tab === 'runes') {
      h += `<p>${badge('MYSTICAL/IN-GAME')} Enchant a weapon at a sacred site. One rune per weapon; it stays until you replace it.</p><label>Weapon <select id="rune-weapon"><option value="traveller_blade">Traveller's Blade</option><option value="stone_edge">Stone Edge</option><option value="crystal_sabre">Crystal Sabre</option></select></label>`;
      h += v.runes_all.map((r) => `<div class="card"><b>${esc(r.name)}</b> · ${fxText(r.effect)} <span class="small muted">at ${r.sites.map((s) => esc(v.sites.find((x) => x.id === s)?.name)).join(' or ')} · costs ${Object.entries(r.cost).map(([k, n]) => `${n} ${k.replace('_', ' ')}`).join(', ')}${r.origin !== 'v9.0' ? ' · ' + esc(r.origin) : ''}</span><br><button data-rune="${r.id}">🔥 Enchant</button></div>`).join('');
      h += `<p class="small">Enchanted: ${Object.entries(v.runes).map(([w, r]) => `${esc(w.replace('_', ' '))} → ${esc(v.runes_all.find((x) => x.id === r)?.name)}`).join(' · ') || 'nothing yet'}</p>`;
      h += '<p class="small">Magical special moves (Ember Bolt, Verdant Mend, Star Sight, Aegis Ward) are learned in ⚔️ Combat skills and work with any weapon. Invent your own rituals in 🌍 Expedition → Workshop (category: mystical).</p>';
    } else if (tab === 'year') {
      const G = v.grand_year, T = v.grand_year_text;
      h += `<h3>${G.glyph} ${esc(G.name)}</h3><p>Grand Years completed: <b>${G.grand_years ?? 0}</b> · Ages into this Grand Year: <b>${G.ages_into ?? 0}</b> of 12 · next: ${esc(G.next || '')}</p>
        <p>${badge('FACT')} ${esc(T.fact.replace('FACT: ', ''))}</p><p>${badge('SSR/CRA THEORY')} ${esc(T.theory.replace('SSR/CRA THEORY: ', ''))}</p><p>${badge('MYSTICAL/IN-GAME')} ${esc(T.game.replace('MYSTICAL/IN-GAME: ', ''))}</p>`;
    } else if (tab === 'lore') {
      if (!lore) h += '<p class="muted">Lore needs a connection.</p>';
      else {
        h += `<p class="small">${badge('IN-GAME')} ${esc(lore.label)}</p><p>Canon pages: <b>${lore.owned}</b> / ${lore.pages.length} · Year ${lore.year} of Strata (365.26-day years) · ${lore.solar_return ? '<b>☀️ Today is a Solar Return!</b> <button id="lore-solar">Witness it</button>' : `next Solar Return on day ${lore.next_solar_return}`}</p>`;
        h += `<h4>Crop-circle glyphs (${lore.glyphs.length} found of ${lore.total_glyphs})</h4><p class="small muted">Each spoke is a letter. Its five dots, from the centre out, are worth 16, 8, 4, 2 and 1: add the bright ones to get the letter's number (A = 1, B = 2 … Z = 26).</p><div class="glyphs">`;
        h += lore.glyphs.map((g) => `<div class="card glyph"><canvas width="170" height="170" data-glyph="${g.id}"></canvas><div class="small">${esc(g.where)}</div>${g.decoded ? `<b>✔ ${esc(g.decoded)}</b>` : `<form data-decode="${g.id}" class="row"><input maxlength="12" placeholder="${g.length} letters" aria-label="Decoded word"><button>Decode</button></form>`}</div>`).join('') + '</div>';
        h += '<h4>The Lux Prime Canon</h4>' + lore.pages.map((p) => `<div class="card ${p.owned ? '' : 'locked'}"><b>${esc(p.title)}</b> ${p.owned ? badge(p.label) + `<p>${esc(p.text)}</p>` : `<span class="small muted">🔒 ${esc(p.how)}</span>`}</div>`).join('');
      }
    }
    $('sky-body').innerHTML = h;
    $('sky-body').querySelectorAll('[data-mt]').forEach((b) => (b.onclick = () => { tab = b.dataset.mt; render(); }));
    const wheel = $('skywheel'); if (wheel) drawSkyWheel(wheel, v);
    $('sky-body').querySelectorAll('canvas[data-glyph]').forEach((c) => { const g = lore.glyphs.find((x) => x.id === c.dataset.glyph); drawGlyph(c, g.spokes); });
    $('sky-body').querySelectorAll('[data-pz]').forEach((b) => (b.onclick = async () => { const r = await op({ operation: 'solve', puzzle: b.dataset.pz, choice: +b.dataset.ch }); if (r) { audio?.play(r.correct ? 'correct' : 'wrong'); toast(r.correct ? `⭐ Correct! +${r.gain} star chart${r.gain > 1 ? 's' : ''}.` : 'Not quite. Check the sky wheel and try another chart.'); } }));
    $('sky-body').querySelectorAll('[data-bless]').forEach((b) => (b.onclick = async () => { const r = await op({ operation: 'bless', site: b.dataset.bless }); if (r) { audio?.play('heal'); toast(`🙏 ${r.name}: ${fxText(r.effect)} in your next duel.`); } }));
    $('sky-body').querySelectorAll('[data-spirit]').forEach((b) => (b.onclick = async () => { const r = await op({ operation: 'commune', spirit: b.dataset.spirit }); if (r) { audio?.play('achieve'); toast(`${r.kind === 'apparition' ? '👻' : '✨'} ${r.name}: ${r.lore}`); } }));
    $('sky-body').querySelectorAll('[data-rune]').forEach((b) => (b.onclick = async () => { const r = await op({ operation: 'enchant', rune: b.dataset.rune, weapon: $('rune-weapon').value }); if (r) { audio?.play('build'); toast(`🔥 ${r.name} etched on your ${r.weapon.replace('_', ' ')}: ${fxText(r.effect)}.`); } }));
    $('sky-body').querySelectorAll('[data-decode]').forEach((f) => (f.onsubmit = async (e) => { e.preventDefault(); try { const d = await api('POST', `/api/v90/lore/${world}`, body({ operation: 'decode', glyph: f.dataset.decode, answer: f.querySelector('input').value })); lore = d.lore; toast(d.result.correct ? '📜 Decoded! A page of the Lux Prime Canon is yours.' : 'Not quite: add up the bright dots on each spoke.'); audio?.play(d.result.correct ? 'achieve' : 'wrong'); render(); } catch (er) { toast(friendly(er.message)); } }));
    const sol = $('lore-solar'); if (sol) sol.onclick = async () => { try { const d = await api('POST', `/api/v90/lore/${world}`, body({ operation: 'solar' })); lore = d.lore; toast('☀️ You witnessed a Solar Return. A Canon page glows.'); render(); } catch (er) { toast(friendly(er.message)); } };
    const cb = $('sky-card'); if (cb) cb.onclick = exportCard;
  }
  function exportCard() {
    const c = v.card; if (!c) return toast('Export needs a connection.');
    const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${esc(c.title)}</title><style>body{font:16px/1.5 system-ui;max-width:780px;margin:2em auto;padding:0 1em;background:#fbfaf6;color:#16212a}td{border-bottom:1px solid #e6e2d6;padding:.4em;vertical-align:top}.lab{font:700 .72em ui-monospace;padding:.05em .5em;border-radius:6px;white-space:nowrap}.fact{background:#d8f5e1;color:#14532d}.theory{background:#ece3ff;color:#4b2a8a}.mystic{background:#fde7f6;color:#86198f}.game{background:#fff1c9;color:#6b4a00}</style></head><body>
      <div style="letter-spacing:.06em;color:#8a6a10;font-weight:700">STRATA · LUX GENESIS · STAR-CHART CARD</div><h1>${esc(c.title)}</h1><table>${c.statements.map((s) => `<tr><td>${badge(s.label)}</td><td>${esc(s.text)}</td></tr>`).join('')}</table>
      <p style="color:#5a6670">${esc(c.label)} FACT = real, checkable science · SSR/CRA THEORY = Oliver's framework, not established science · MYSTICAL/IN-GAME = magic or astrology in the game's story, never established science.</p></body></html>`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = 'strata-star-chart.html'; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('📤 Star-chart card saved (open it and Print → Save as PDF if you like).');
  }
  return { open, close, refresh, get view() { return v; } };
}
