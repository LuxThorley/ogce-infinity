// Strata: Lux Genesis Expedition: streams the seeded, practically infinite strata in chunks with level of detail,
// shows the simulated Wildwood ecology, NPCs with memory and factions, the invention workshop and customisation.
// Simulated life is labelled honestly: rules, not real minds.
import { cardHTML, cardMarkdown, cardText } from './cardrender.js';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GLYPH = { tree: '🌳', pine: '🌲', rock: '🪨', crystal: '💎', berry: '🫐', flower: '🌸', luxbloom: '🌟', shell: '🐚', cactus: '🌵', sapling: '🌱', cairn: '🗿', lantern: '🏮', shelter: '⛺' };
const DOT = { tree: '#1f5a2a', pine: '#1d4a30', rock: '#77777f', crystal: '#7fe8ff', berry: '#5a4bd0', flower: '#ff8fc8', luxbloom: '#ffe27a', shell: '#f2e6d0', cactus: '#3d8a3d', sapling: '#7dd35a', cairn: '#9a9aa6', lantern: '#ffb84d', shelter: '#c08a50' };
const SP_COLOUR = { mossback: '#7bd36a', duskwolf: '#5b5f8a', glowmoth: '#ffe066' };
const ITEM_ICON = { wood: '🪵', stone: '🪨', crystal: '💎', berries: '🫐', petal: '🌸', lux_mote: '✨', shell: '🐚', fibre: '🧵', rope: '🪢', torch: '🔦', herbal_tea: '🍵' };

export function initExpedition(ctx) {
  const { api, toast, audio, world } = ctx;
  const cv = $('expcanvas'), g = cv.getContext('2d');
  let meta = null, me = null, eco = null, open = false, zoom = 18, cam = { x: 0, y: 0 }, build = null, dlg = null, raf = 0, ecoTimer = 0;
  const chunks = new Map(), inflight = new Set(), history = [];
  const guest = () => (ctx.isGuest() ? { player_id: ctx.playerId() } : {});
  const qs = (o = {}) => { const u = new URLSearchParams(o); if (ctx.isGuest()) u.set('player', ctx.playerId()); const s = u.toString(); return s ? '?' + s : ''; };
  const CH = () => meta?.chunk || 16;
  const lodFor = (z) => (z >= 9 ? 0 : z >= 3 ? 1 : 2);
  const realmName = (id) => (meta.realms.find((r) => r.id === id) || me?.custom_realms.find((r) => r.id === id) || { name: id }).name;

  async function post(body) {
    try {
      const d = await api('POST', `/api/v90/omni/${world}`, { ...body, ...guest() });
      me = d.explorer; return d.result;
    } catch (e) { toast(friendly(e.message)); return null; }
  }
  const FRIENDLY = { water: 'That’s water. You need a boat to cross it.', too_far: 'Too far away. Walk closer first.', nothing_to_harvest: 'Nothing to collect there right now. It will regrow.', missing_resources: 'You don’t have enough materials yet.',
    occupied: 'Something is already there.', principle_locked: 'You haven’t discovered that principle yet.', category_mismatch: 'Those ideas don’t match that category.', rituals_are_mystical: 'Rituals are mystical (symbolic) only.',
    too_ambitious: 'Too ambitious for now! Use fewer or simpler parts. Your invention budget grows with each invention.', already_discovered: 'You already invented exactly that. Try a new combination.', not_observed: 'Observe that creature in the Wildwood first.',
    bad_materials: 'Pick 1–3 kinds of material, at most 8 in total.', bad_principles: 'Pick one or two principles.', choice_locked: 'Speak to Ilsa, Bram and Rook first.', edge_of_strata: 'You’ve reached the edge of the strata!' };
  Object.assign(FRIENDLY, { too_far: 'Walk closer first (within 3 squares).', bard_rate_limited: 'Let’s pause the chat for a minute. Characters need a breather too!', unknown_npc: 'Nobody by that name lives here.', message_too_long: 'That’s a lot to say at once. Try something shorter.' });
  const friendly = (m) => FRIENDLY[m] || ctx.friendly(m);
  let cast = {}, bard = null, voice = null;
  const GENRE_ICON = { tragedy: '🎭', comedy: '😄', history: '👑', romance: '🌊', poems: '🪶' };
  const gicon = (c) => GENRE_ICON[c.model.genre.split(' ')[0]] || '🎭';

  // ---------- data ----------
  async function load() {
    if (!meta) meta = await api('GET', '/api/v90/omni/realms');
    if (!Object.keys(cast).length) { try { for (const c of (await api('GET', '/api/v90/bard/cast')).cast) cast[c.id] = c; } catch { /* offline */ } }
    me = (await api('GET', `/api/v90/omni/me/${world}${qs()}`)).explorer;
    cam = { x: me.x, y: me.y };
    renderRealmSelect(); renderAll(); refreshEco();
  }
  async function refreshEco() {
    try {
      eco = await api('GET', `/api/v90/omni/eco/${world}${qs()}`);
      const c = eco.census; history.push([eco.tick, c.mossback.count, c.duskwolf.count, c.glowmoth.count, c.plants]); if (history.length > 80) history.shift();
      renderWild();
    } catch { /* offline */ }
  }
  function want() {
    const lod = lodFor(zoom), ch = CH(), w = cv.width / devicePixelRatio, h = cv.height / devicePixelRatio;
    const x0 = Math.floor((cam.x - w / 2 / zoom) / ch), x1 = Math.floor((cam.x + w / 2 / zoom) / ch), y0 = Math.floor((cam.y - h / 2 / zoom) / ch), y1 = Math.floor((cam.y + h / 2 / zoom) / ch);
    const missing = [];
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (!chunks.has(`${me.realm}:${lod}:${cx},${cy}`)) missing.push([cx, cy]);
    if (!missing.length) return;
    const maxR = lod === 0 ? 3 : 8, mx = Math.floor((x0 + x1) / 2), my = Math.floor((y0 + y1) / 2);
    const r = Math.min(maxR, Math.max(Math.ceil((x1 - x0) / 2), Math.ceil((y1 - y0) / 2)));
    const centres = r >= Math.max(Math.ceil((x1 - x0) / 2), Math.ceil((y1 - y0) / 2)) ? [[mx, my]] : missing.filter((_, i) => i % (2 * maxR + 1) === 0).slice(0, 4);
    for (const [cx, cy] of centres) {
      const key = `${me.realm}:${lod}:${cx},${cy}:${r}`; if (inflight.has(key)) continue; inflight.add(key);
      api('GET', `/api/v90/omni/chunks/${world}${qs({ realm: me.realm, cx, cy, r, lod })}`).then((d) => { for (const c of d.chunks) chunks.set(`${d.realm}:${lod}:${c.cx},${c.cy}`, c); if (chunks.size > 3000) for (const k of [...chunks.keys()].slice(0, 800)) chunks.delete(k); })
        .catch(() => {}).finally(() => inflight.delete(key));
    }
  }
  const invalidateNear = (x, y) => { const ch = CH(); for (const k of [...chunks.keys()]) if (k.startsWith(`${me.realm}:0:${Math.floor(x / ch)},${Math.floor(y / ch)}`)) chunks.delete(k); };
  function tileInfo(x, y) {
    const ch = CH(), c = chunks.get(`${me.realm}:0:${Math.floor(x / ch)},${Math.floor(y / ch)}`); if (!c) return null;
    const i = (y - c.cy * ch) * ch + (x - c.cx * ch);
    return { biome: c.tiles[i], feature: (c.features.find((f) => f[0] === x && f[1] === y) || [])[2] || null, poi: c.poi && c.poi.x === x && c.poi.y === y ? c.poi : null, chunk: c };
  }

  // ---------- drawing ----------
  function resize() { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); cv.width = Math.max(1, r.width * d); cv.height = Math.max(1, r.height * d); }
  function shade(rgb, h) { const k = 0.7 + Math.min(0.5, Math.max(0, (h - 22) / 60)); return `rgb(${rgb.map((v) => Math.min(255, Math.round(v * k))).join(',')})`; }
  function draw() {
    if (!open) return; raf = requestAnimationFrame(draw);
    if (!meta || !me) return;
    const d = Math.min(2, devicePixelRatio || 1), w = cv.width / d, h = cv.height / d, ch = CH(), t = performance.now() / 1000;
    g.setTransform(d, 0, 0, d, 0, 0); g.fillStyle = '#123'; g.fillRect(0, 0, w, h);
    const sx = (x) => (x - cam.x) * zoom + w / 2, sy = (y) => (y - cam.y) * zoom + h / 2;
    const lod = lodFor(zoom), x0 = Math.floor((cam.x - w / 2 / zoom) / ch), x1 = Math.floor((cam.x + w / 2 / zoom) / ch), y0 = Math.floor((cam.y - h / 2 / zoom) / ch), y1 = Math.floor((cam.y + h / 2 / zoom) / ch);
    const B = meta.biomes;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      let c = chunks.get(`${me.realm}:${lod}:${cx},${cy}`), cl = lod;
      for (let l = 0; !c && l <= 2; l++) { c = chunks.get(`${me.realm}:${l}:${cx},${cy}`); cl = l; }
      const X = sx(cx * ch), Y = sy(cy * ch);
      if (!c) { g.fillStyle = '#1a2a33'; g.fillRect(X, Y, ch * zoom + 1, ch * zoom + 1); continue; }
      if (cl === 2) { g.fillStyle = `rgb(${B[c.biome].colour.join(',')})`; g.fillRect(X, Y, ch * zoom + 1, ch * zoom + 1); continue; }
      const step = cl === 0 ? 1 : 4, n = ch / step;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const b = c.tiles[j * n + i], hh = c.heights[j * n + i];
        let col = B[b].colour; if (b === 'O') { const wv = Math.sin(t * 1.5 + (cx * ch + i * step) * 0.6 + (cy * ch + j * step) * 0.4) * 8; col = col.map((v, k) => v + wv * (k === 2 ? 1 : 0.5)); }
        g.fillStyle = shade(col, hh); g.fillRect(X + i * step * zoom, Y + j * step * zoom, step * zoom + 0.6, step * zoom + 0.6);
      }
      if (cl === 0 && zoom >= 6) {
        for (const [fx, fy, k] of c.features) {
          if (zoom >= 14) { g.font = `${Math.round(zoom * 0.8)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(k.startsWith('inv:') ? '🔧' : GLYPH[k] || '•', sx(fx + 0.5), sy(fy + 0.55)); }
          else { g.fillStyle = k.startsWith('inv:') ? '#ffd25e' : DOT[k] || '#fff'; g.fillRect(sx(fx) + zoom * 0.25, sy(fy) + zoom * 0.25, zoom * 0.5, zoom * 0.5); }
        }
        if (c.poi) { g.font = `${Math.max(12, zoom)}px system-ui`; g.fillText('🏛️', sx(c.poi.x + 0.5), sy(c.poi.y + 0.5)); }
      }
    }
    // Wildwood habitat + ecology
    if (eco && eco.realm === me.realm && zoom >= 3) {
      const H = eco.habitat; g.strokeStyle = 'rgba(125,255,154,.7)'; g.setLineDash([6, 4]); g.lineWidth = 2; g.strokeRect(sx(0), sy(0), H * zoom, H * zoom); g.setLineDash([]);
      g.fillStyle = 'rgba(125,255,154,.9)'; g.font = '600 12px system-ui'; g.textAlign = 'left'; g.fillText('Wildwood (simulated ecology)', sx(0) + 4, sy(0) - 6);
      if (zoom >= 6) for (const [x, y, st] of eco.plants) { g.fillStyle = ['#3e6b2e', '#5f9a3a', '#86c447', '#ff9ad5'][st]; const r = zoom * (0.12 + st * 0.06); g.beginPath(); g.arc(sx(x + 0.5), sy(y + 0.5), r, 0, 6.283); g.fill(); }
      for (const [id, sp, x, y, e, gen, hue] of eco.creatures) {
        const bob = Math.sin(t * 3 + id) * zoom * 0.06, cx2 = sx(x + 0.5), cy2 = sy(y + 0.5) + bob;
        if (zoom >= 14) { g.font = `${Math.round(zoom * 0.85)}px system-ui`; g.textAlign = 'center'; g.fillText(meta.species[sp].icon, cx2, cy2); }
        else { g.fillStyle = SP_COLOUR[sp]; g.beginPath(); g.arc(cx2, cy2, Math.max(2, zoom * 0.35), 0, 6.283); g.fill(); g.strokeStyle = `hsl(${hue},70%,60%)`; g.lineWidth = 1.5; g.stroke(); }
      }
    }
    // NPCs: the Shakespeare-inspired cast of the current stratum
    for (const c of Object.values(cast)) {
      if (c.realm !== me.realm) continue;
      const X = sx(c.x + 0.5), Y = sy(c.y + 0.5), talking = bard?.npc === c.id;
      if (talking) { g.strokeStyle = '#ffd25e'; g.lineWidth = 3; g.beginPath(); g.arc(X, Y, Math.max(8, zoom * 0.7) + Math.sin(t * 4) * 2, 0, 6.283); g.stroke(); }
      g.fillStyle = meta.factions[c.faction].colour; g.beginPath(); g.arc(X, Y, Math.max(5, zoom * 0.45), 0, 6.283); g.fill();
      g.font = `${Math.max(10, zoom * 0.6)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(gicon(c), X, Y);
      if (zoom >= 5) { g.fillStyle = '#fff'; g.font = '600 12px system-ui'; g.fillText(c.name, X, Y - Math.max(10, zoom * 0.8)); }
    }
    // player
    const ap = meta.appearance, a = me.appearance, PX = sx(me.x + 0.5), PY = sy(me.y + 0.5), R = Math.max(6, zoom * 0.5);
    g.fillStyle = 'rgba(255,230,140,.25)'; g.beginPath(); g.arc(PX, PY, R * 2 + Math.sin(t * 3) * 2, 0, 6.283); g.fill();
    g.fillStyle = ap.outfit[a.outfit]; g.beginPath(); g.arc(PX, PY, R, 0, 6.283); g.fill(); g.fillStyle = ap.skin[a.skin]; g.beginPath(); g.arc(PX, PY - R * 0.3, R * 0.5, 0, 6.283); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(PX, PY, R, 0, 6.283); g.stroke();
    if (build) { g.strokeStyle = '#ffd25e'; g.setLineDash([3, 3]); g.strokeRect(sx(me.x - 2), sy(me.y - 2), 5 * zoom, 5 * zoom); g.setLineDash([]); }
  }

  // ---------- input ----------
  let down = null;
  cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => { if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.abs(dx) + Math.abs(dy) > 6) down.moved = true; if (down.moved) { cam.x = down.cx - dx / zoom; cam.y = down.cy - dy / zoom; want(); } });
  cv.addEventListener('pointerup', (e) => { const d = down; down = null; if (!d || d.moved) return; const r = cv.getBoundingClientRect(); tap(Math.floor(cam.x + (e.clientX - r.left - r.width / 2) / zoom), Math.floor(cam.y + (e.clientY - r.top - r.height / 2) / zoom)); });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)); }, { passive: false });
  function setZoom(z) { zoom = Math.max(1.5, Math.min(40, z)); want(); }
  $('exp-zin').onclick = () => setZoom(zoom * 1.4); $('exp-zout').onclick = () => setZoom(zoom / 1.4); $('exp-home').onclick = () => { cam = { x: me.x, y: me.y }; want(); };
  const dist = (x, y) => Math.abs(x - me.x) + Math.abs(y - me.y);
  async function tap(x, y) {
    if (build) {
      if (dist(x, y) > 2 + (me.perks.reach || 0)) return toast('Build next to you (within 2 squares).');
      const r = await post({ operation: 'place', kind: build, x, y }); if (r) { toast(`Built ${r.name || build}!`); audio.play('build'); if (r.policy && Object.keys(r.policy).length) toast(`🌿 The world changed: ${Object.entries(r.policy).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(', ')}`); build = null; invalidateNear(x, y); renderAll(); want(); refreshEco(); }
      return;
    }
    const cr = eco && eco.realm === me.realm ? eco.creatures.find((c) => c[2] === x && c[3] === y) : null;
    if (cr && dist(x, y) <= 6 + (me.perks.reach || 0)) {
      const r = await post({ operation: 'observe', creature: cr[0] });
      if (r) { toast(`${meta.species[r.species].icon} ${meta.species[r.species].name}, generation ${r.gen}: speed ${r.traits.speed}, size ${r.traits.size}, sense ${r.traits.sense}${r.hidden ? `, age ${r.hidden.age}` : ''}`); audio.play('message'); renderAll(); }
      return;
    }
    const who = Object.values(cast).find((c) => c.realm === me.realm && c.x === x && c.y === y);
    if (who) { if (dist(x, y) > 3) await walkTo(x, y + 1); if (dist(x, y) <= 3) { if (meta.npcs[who.id] && me.realm === 'aurelia') await talk(who.id); await openBard(who.id); } return; }
    const info = tileInfo(x, y);
    if (info?.feature && meta.harvest[info.feature] && dist(x, y) <= 2 + (me.perks.reach || 0)) return harvest(x, y);
    if (info?.poi) toast(`🏛️ ${info.poi.name}: an old waymarker of the strata.`);
    await walkTo(x, y);
  }
  async function harvest(x, y) {
    const r = await post({ operation: 'harvest', x, y });
    if (r) { toast(`+${r.count} ${ITEM_ICON[r.item] || ''} ${r.item}`); audio.play('gather'); invalidateNear(x, y); want(); renderAll(); }
  }
  async function step(dx, dy) { const r = await post({ operation: 'move', x: me.x + dx, y: me.y + dy }); if (r) { cam.x += (me.x - cam.x) * 0.5; cam.y += (me.y - cam.y) * 0.5; if (Math.abs(me.x - cam.x) > 8 / Math.max(1, zoom / 10) || Math.abs(me.y - cam.y) > 6) cam = { x: me.x, y: me.y }; want(); renderHere(); } }
  async function walkTo(x, y) {
    for (let k = 0; k < 8 && dist(x, y) > 0; k++) {
      const lim = 12 + (me.perks.stride || 0), dx = x - me.x, dy = y - me.y, tot = Math.abs(dx) + Math.abs(dy), f = Math.min(1, lim / tot);
      let tx = me.x + Math.trunc(dx * f), ty = me.y + Math.trunc(dy * f); if (tx === me.x && ty === me.y) { tx += Math.sign(dx); }
      const r = await post({ operation: 'move', x: tx, y: ty }); if (!r) break;
      cam = { x: me.x, y: me.y }; want();
    }
    renderHere();
  }

  // ---------- panels ----------
  function renderRealmSelect() {
    const all = [...meta.realms, ...(me.custom_realms || [])];
    $('exp-realm').innerHTML = all.map((r) => `<option value="${esc(r.id)}" ${r.id === me.realm ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
    const cur = all.find((r) => r.id === me.realm); $('exp-blurb').textContent = cur?.blurb || '';
  }
  $('exp-realm').onchange = async () => { const r = await post({ operation: 'travel', realm: $('exp-realm').value }); if (r) { toast(`✨ You travel to ${r.name}`); cam = { x: 0, y: 0 }; renderRealmSelect(); renderAll(); refreshEco(); want(); } };
  function renderHere() {
    const info = tileInfo(me.x, me.y);
    $('exp-where').textContent = `${realmName(me.realm)} · (${me.x}, ${me.y}) · explored ${me.explored} areas`;
    const near = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { if (Math.abs(dx) + Math.abs(dy) > 2) continue; const t = tileInfo(me.x + dx, me.y + dy); if (t?.feature && meta.harvest[t.feature]) near.push([me.x + dx, me.y + dy, t.feature]); }
    $('exp-here').innerHTML = `${info ? esc(meta.biomes[info.biome].name) : '…'}${near.length ? ' · nearby: ' + near.slice(0, 6).map((n) => GLYPH[n[2]] || n[2]).join(' ') : ''}`;
    $('exp-actions').innerHTML = near.slice(0, 6).map((n, i) => `<button data-h="${i}">Collect ${GLYPH[n[2]] || ''} ${esc(meta.harvest[n[2]])}</button>`).join('');
    $('exp-actions').querySelectorAll('[data-h]').forEach((b) => { b.onclick = () => harvest(near[+b.dataset.h][0], near[+b.dataset.h][1]); });
  }
  function renderAll() {
    if (!me) return;
    renderHere();
    $('exp-bag').innerHTML = Object.entries(me.bag).map(([k, v]) => `<span>${k.startsWith('inv:') ? '🔧 ' + esc((me.inventions.find((i) => 'inv:' + i.id === k) || {}).name || k) : (ITEM_ICON[k] || '') + ' ' + esc(k)} × ${v}</span>`).join('') + (me.tools.length ? `<span>🧰 ${me.tools.map(esc).join(', ')}</span>` : '') || '<span class="muted">Empty: collect things on the map.</span>';
    $('exp-recipes').innerHTML = Object.entries(meta.recipes).map(([k, r]) => `<button class="craft" data-r="${k}" ${Object.entries(r.needs).every(([i, n]) => (me.bag[i] || 0) >= n) ? '' : 'disabled'}>${esc(k.replace('_', ' '))} <span class="cost">${Object.entries(r.needs).map(([i, n]) => `${n} ${ITEM_ICON[i] || i}`).join(' + ')}</span></button><div class="small muted">${esc(r.text)}</div>`).join('');
    $('exp-recipes').querySelectorAll('[data-r]').forEach((b) => { b.onclick = async () => { const r = await post({ operation: 'craft', recipe: b.dataset.r }); if (r) { toast(`Crafted ${r.crafted}!`); audio.play('build'); renderAll(); } }; });
    const builds = Object.entries(meta.place).map(([k, c]) => [k, `${GLYPH[k] || ''} ${k} (${Object.entries(c).map(([i, n]) => `${n}${ITEM_ICON[i] || i}`).join(' ')})`])
      .concat(Object.keys(me.bag).filter((k) => k.startsWith('inv:') && me.inventions.find((i) => 'inv:' + i.id === k && i.form === 'structure')).map((k) => [k, `🔧 ${me.inventions.find((i) => 'inv:' + i.id === k).name}`]));
    $('exp-builds').innerHTML = builds.map(([k, l]) => `<button data-b="${esc(k)}" class="${build === k ? 'primary' : ''}">${esc(l)}</button>`).join('');
    $('exp-builds').querySelectorAll('[data-b]').forEach((b) => { b.onclick = () => { build = build === b.dataset.b ? null : b.dataset.b; renderAll(); if (build) toast('Tap a free square next to you to build.'); }; });
    $('exp-bestiary').innerHTML = me.bestiary.length ? me.bestiary.map((b) => `<span class="chip">${meta.species[b.split(':')[0]]?.icon || '❔'} ${esc(b)}</span>`).join(' ') : 'Nothing observed yet.';
    renderPeople(); renderWorkshop(); renderLook();
  }
  function renderWild() {
    if (!eco || !meta) return;
    const c = eco.census;
    $('eco-census').innerHTML = `<table class="census"><tr><th></th><th>Count</th><th>Avg speed</th><th>Avg size</th><th>Avg sense</th><th>Generations</th></tr>` +
      ['mossback', 'duskwolf', 'glowmoth'].map((s) => `<tr><td>${meta.species[s].icon} ${meta.species[s].name}</td><td>${c[s].count}</td><td>${(c[s].speed / 10).toFixed(1)}</td><td>${(c[s].size / 10).toFixed(1)}</td><td>${(c[s].sense / 10).toFixed(1)}</td><td>${c[s].max_gen}</td></tr>`).join('') +
      `</table><div class="small">🌸 Plants ${c.plants} (${c.flowering} flowering) · day ${eco.tick} · births ${eco.births} · caught ${eco.caught}${eco.policy.predator_cap !== 12 ? ` · wolf limit ${eco.policy.predator_cap} (your choice)` : ''}${eco.policy.growth_bonus ? ` · growth +${eco.policy.growth_bonus}%` : ''}${eco.policy.calm ? ` · calm ${eco.policy.calm}` : ''}${eco.policy.spread_bonus ? ` · blessing +${eco.policy.spread_bonus}` : ''}</div>`;
    $('eco-log').innerHTML = eco.log.slice().reverse().map(([t, s]) => `<li>Day ${t}: ${esc(s)}</li>`).join('');
    const ec = $('eco-chart'), cg = ec.getContext('2d'); cg.clearRect(0, 0, ec.width, ec.height); cg.fillStyle = 'rgba(0,0,0,.25)'; cg.fillRect(0, 0, ec.width, ec.height);
    if (history.length > 1) {
      const mx = Math.max(10, ...history.flatMap((r) => [r[1], r[2], r[3]]));
      [[1, SP_COLOUR.mossback], [2, '#8f95d0'], [3, SP_COLOUR.glowmoth]].forEach(([k, col]) => { cg.strokeStyle = col; cg.lineWidth = 2; cg.beginPath(); history.forEach((r, i) => { const X = 30 + i * (ec.width - 40) / (history.length - 1), Y = ec.height - 15 - r[k] / mx * (ec.height - 25); i ? cg.lineTo(X, Y) : cg.moveTo(X, Y); }); cg.stroke(); });
      cg.fillStyle = '#ccc'; cg.font = '10px system-ui'; cg.fillText(String(mx), 4, 14); cg.fillText('0', 4, ec.height - 12); cg.fillText('population over time (days)', 34, ec.height - 2);
    } else { cg.fillStyle = '#ccc'; cg.font = '12px system-ui'; cg.fillText('The chart fills in as days pass.', 20, 70); }
  }
  function renderPeople() {
    $('exp-factions').innerHTML = '<h3>Factions</h3>' + Object.entries(meta.factions).map(([k, f]) => { const v = me.rep[k] || 0; return `<div class="bar"><span style="color:${f.colour};min-width:9em">${esc(f.name)}</span><div class="track"><div class="fill" style="background:${f.colour};width:${Math.max(0, Math.min(100, 50 + v / 2))}%"></div></div><b>${v}</b></div>`; }).join('') + '<p class="small muted">Your choices change how each faction sees you, and how the story ends.</p>';
    renderCast();
    $('exp-ending').innerHTML = me.ending ? `<div class="card ending"><h3>🌅 Ending: ${esc(me.ending.name)}</h3><p>${esc(me.ending.text)}</p></div>` : '';
  }
  async function talk(npc, node = 'start', choice = null) {
    const r = await post({ operation: 'talk', npc, node, ...(choice == null ? {} : { choice }) }); if (!r) return;
    dlg = { npc, ...r }; showTab('people'); renderDialogue(); renderPeople();
    if (r.ending) { toast(`🌅 ${r.ending.name}`); audio.play('achieve'); }
    if (r.policy) toast('🌿 Your choice changed the Wildwood.');
  }
  function renderDialogue() {
    const box = $('exp-dialogue'); if (!dlg) { box.classList.add('hidden'); return; } box.classList.remove('hidden');
    const giftable = Object.keys(me.bag).filter((k) => !k.startsWith('inv:'));
    box.innerHTML = `<h3>💬 ${esc(dlg.name)} <span class="small muted">(simulated character)</span></h3>${dlg.line ? `<p><i>${esc(dlg.line)}</i></p>` : ''}${dlg.remark ? `<p>🔧 ${esc(dlg.remark)}</p>` : ''}<p>${esc(dlg.text || 'Safe travels!')}</p>` +
      `<div class="choices">${(dlg.choices || []).map((c) => `<button data-c="${c.i}" ${c.locked ? 'disabled title="Speak to everyone first"' : ''}>${c.locked ? '🔒 ' : ''}${esc(c.label)}</button>`).join('')}</div>` +
      `<div class="row"><button id="npc-free" class="primary">💬 Talk freely with ${esc(dlg.name)}</button></div>` +
      (giftable.length ? `<div class="row"><select id="gift-item">${giftable.map((k) => `<option value="${esc(k)}">${ITEM_ICON[k] || ''} ${esc(k)}</option>`).join('')}</select><button id="gift-go">Give gift</button></div>` : '');
    box.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => talk(dlg.npc, dlg.node, +b.dataset.c); });
    $('npc-free').onclick = () => openBard(dlg.npc);
    const gb = $('gift-go'); if (gb) gb.onclick = async () => { const r = await post({ operation: 'gift', npc: dlg.npc, item: $('gift-item').value }); if (r) { toast(r.liked ? `${dlg.name} loves it! Friendship ${r.rel}` : `${dlg.name} says thanks. Friendship ${r.rel}`); renderAll(); renderDialogue(); } };
  }

  // ---------- Bard: open conversation with Shakespeare-inspired characters (typed or spoken) ----------
  const REALM_ORDER = ['aurelia', 'verdant', 'ember', 'frostveil', 'luxfall'];
  function renderCast() {
    const groups = REALM_ORDER.map((r) => [r, Object.values(cast).filter((c) => c.realm === r)]).filter(([, l]) => l.length);
    $('exp-npcs').innerHTML = '<h3>People of the strata</h3><p class="small muted">🧪 Simulated characters inspired by Shakespeare. They remember you, have their own plans and secrets, and can surprise you. They are not real people.</p>' +
      groups.map(([r, l]) => `<div class="cxgroup">${esc(realmName(r))}</div>` + l.map((c) => { const m = me.npc[c.id] || {}; const rel = m.rel || 0; const d = me.realm === c.realm ? dist(c.x, c.y) : null;
        return `<div class="item castitem"><b>${gicon(c)} ${esc(c.name)}</b> <span class="small" style="color:${meta.factions[c.faction].colour}">${esc(meta.factions[c.faction].name)}</span><div class="small muted">${esc(c.title)} · inspired by ${esc(c.model.character)}, <i>${esc(c.model.play)}</i></div>` +
          `<div class="bar small"><span>Friendship</span><div class="track"><div class="fill" style="width:${Math.max(0, Math.min(100, 50 + rel / 2))}%"></div></div><b>${rel}</b></div>` +
          `<button data-bard="${c.id}" class="small">${d !== null && d <= 3 ? '💬 Talk' : me.realm === c.realm ? '🚶 Walk over & talk' : '✨ Travel & talk'}</button>${m.secret ? ' <span class="small">🔓 secret shared</span>' : ''}${m.ally ? ' <span class="small">🤝 ally</span>' : ''}</div>`; }).join('')).join('');
    $('exp-npcs').querySelectorAll('[data-bard]').forEach((b) => { b.onclick = () => openBard(b.dataset.bard); });
  }
  async function goTo(c) {
    if (me.realm !== c.realm) { const r = await post({ operation: 'travel', realm: c.realm }); if (!r) return false; toast(`✨ You travel to ${r.name}`); renderRealmSelect(); refreshEco(); }
    if (dist(c.x, c.y) > 3) await walkTo(c.x, c.y + 1);
    cam = { x: me.x, y: me.y }; want();
    return dist(c.x, c.y) <= 3 && me.realm === c.realm;
  }
  async function openBard(id) {
    const c = cast[id]; if (!c) return '';
    if (!open) await show();
    showTab('people');
    if (!(await goTo(c))) { toast(friendly('too_far')); return ''; }
    let view = null; try { view = await api('GET', `/api/v90/bard/${world}/${id}${qs()}`); } catch { view = { hist: [], rel: 0 }; }
    bard = { npc: id, view, log: view.hist.flatMap((h) => [['you', h.u], ['npc', h.a]]) };
    renderBard(); setTimeout(() => $('bard-msg')?.focus(), 50);
    return `Talking to ${c.name}.`;
  }
  function endBard() { bard = null; renderBard(); renderPeople(); }
  const ACT_TEXT = {
    give_quest: (a) => `📜 New task: ${a.title}`, complete_quest: (a) => `✅ Task done: ${a.title}`, ally: (a) => `🤝 Allies! (${meta.factions[a.faction].name} +10)`,
    reveal_secret: () => '🔓 A secret was shared with you', gift: (a) => `🎁 You received ${ITEM_ICON[a.item] || ''} ${a.item.replace('_', ' ')}`,
    trade: (a) => `🔁 Traded ${Object.entries(a.give).map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(', ')} for ${Object.entries(a.get).map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(', ')}`,
    betray: (a) => (a.kind === 'steal' ? `😈 Tricked! You lost 1 ${a.item.replace('_', ' ')}` : `😈 Tricked! A rumour hurt your standing with the ${meta.factions[a.faction].name}`),
  };
  async function sendBard(text) {
    if (!bard) return;
    text = String(text || '').trim(); if (!text) return;
    const c = cast[bard.npc];
    bard.log.push(['you', text]); bard.thinking = true; renderBard();
    try {
      const r = await api('POST', `/api/v90/bard/${world}`, { npc: bard.npc, message: text.slice(0, 400), ...guest() });
      me = r.explorer; bard.thinking = false; bard.last = r;
      bard.log.push(['npc', r.say, r.source]);
      for (const a of r.actions) { const t = ACT_TEXT[a.type]?.(a); if (t) { bard.log.push(['act', t]); toast(t); } audio.play(a.type === 'betray' ? 'attack' : a.type === 'reveal_secret' || a.type === 'ally' ? 'achieve' : 'message'); }
      if (bard.log.length > 40) bard.log.splice(0, bard.log.length - 40);
      voice?.speakAs(c.id, r.voice || c.voice, c.name, r.say);
      renderBard(); renderAll();
      if (r.intent === 'farewell') setTimeout(() => { if (bard && bard.npc === c.id) endBard(); }, 2500);
    } catch (e) { bard.thinking = false; bard.log.push(['sys', friendly(e.message)]); renderBard(); }
  }
  function renderBard() {
    const box = $('exp-bard'); if (!box) return;
    if (!bard) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    const c = cast[bard.npc], m = me.npc[c.id] || {}, q = bard.last?.quest ?? bard.view?.quest;
    box.classList.remove('hidden');
    box.innerHTML = `<div class="bardhead"><div><h3>${gicon(c)} ${esc(c.name)}</h3><div class="small muted">${esc(c.title)} · inspired by ${esc(c.model.character)} (<i>${esc(c.model.play)}</i>, ${esc(c.model.genre)})</div></div><button id="bard-close" class="iconbtn closer" aria-label="End conversation">×</button></div>` +
      `<p class="small"><i>“${esc(c.quotes[0].text)}”</i> <span class="muted">${esc(c.quotes[0].src)}</span></p>` +
      `<div class="bar small"><span>Friendship</span><div class="track"><div class="fill" style="width:${Math.max(0, Math.min(100, 50 + (m.rel || 0) / 2))}%"></div></div><b>${m.rel || 0}</b></div>` +
      (q ? `<div class="notice">📜 <b>${esc(q.title)}</b>: ${esc(q.ask)} ${q.ready ? '<b>(ready! tell them it’s done)</b>' : ''}</div>` : '') +
      `<div class="bardlog" id="bard-log" role="log">${bard.log.map(([who, t, src]) => who === 'you' ? `<div class="msg you">${esc(t)}</div>` : who === 'npc' ? `<div class="msg npc"><b>${esc(c.short)}:</b> ${esc(t)}${src === 'malcolm' ? '' : src === 'safety' ? ' <span class="small muted">(safety)</span>' : ''}</div>` : `<div class="msg sys">${esc(t)}</div>`).join('')}${bard.thinking ? `<div class="msg sys">${esc(c.short)} is thinking…</div>` : ''}</div>` +
      `<form id="bard-form" class="row"><input id="bard-msg" maxlength="400" placeholder="Say anything to ${esc(c.short)}… (try: a quest? a trade? your secret?)" autocomplete="off" aria-label="Your words to ${esc(c.name)}"><button id="bard-mic" type="button" class="iconbtn" aria-label="Speak to ${esc(c.name)} (push to talk)" title="Speak (hold V)">🎙️</button><button class="primary">Say</button></form>` +
      `<div class="chips">${['Hello!', 'Who are you?', 'Any tasks for me?', 'Shall we trade?', 'Tell me a famous line', 'What’s your secret?', 'Farewell'].map((t) => `<button type="button" class="chip" data-say="${esc(t)}">${esc(t)}</button>`).join('')}</div>` +
      `<p class="small muted">🧪 Simulated character. Replies come from Malcolm when available, otherwise from ${esc(c.short)}’s own scripted lines. Never share personal details.</p>`;
    const log = $('bard-log'); log.scrollTop = log.scrollHeight;
    $('bard-form').onsubmit = (e) => { e.preventDefault(); const t = $('bard-msg').value; $('bard-msg').value = ''; sendBard(t); };
    $('bard-close').onclick = endBard;
    $('bard-mic').onclick = () => voice?.listen();
    box.querySelectorAll('[data-say]').forEach((b) => { b.onclick = () => sendBard(b.dataset.say); });
  }

  // ---------- workshop ----------
  const pick = { principles: new Set(), materials: {} };
  function renderWorkshop() {
    const D = meta.discovery; if (!D) return;
    const cat = $('inv-cat').value, known = new Set(me.principles);
    $('inv-principles').innerHTML = Object.entries(D.principles).filter(([, p]) => p.cat === cat || (cat !== 'mystical' && false)).map(([k, p]) => `<button class="chip ${pick.principles.has(k) ? 'on' : ''}" data-p="${k}" ${known.has(k) ? '' : 'disabled'} title="${esc(known.has(k) ? p.gcse : 'Locked: ' + p.requires.join(', '))}">${known.has(k) ? '' : '🔒 '}${esc(k.replace(/_/g, ' '))} <span class="small muted">${esc(p.domain)}</span></button>`).join('');
    $('inv-materials').innerHTML = Object.keys(D.materials).map((k) => `<span class="chip mat"><button data-m="${k}" data-d="-1">−</button> ${ITEM_ICON[k] || ''} ${esc(k)} <b>${pick.materials[k] || 0}</b>/${me.bag[k] || 0} <button data-m="${k}" data-d="1">+</button></span>`).join('');
    const obs = [...new Set(me.bestiary.map((b) => b.split(':')[0]))];
    $('inv-obs').innerHTML = '<option value="">None</option>' + obs.map((o) => `<option value="${o}">${meta.species[o]?.icon || ''} ${esc(o)}</option>`).join('');
    $('inv-budget').textContent = `Budget ${me.budget} · attempts ${me.attempts} · ${me.inventions.length} inventions`;
    $('inv-principles').querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { const k = b.dataset.p; pick.principles.has(k) ? pick.principles.delete(k) : pick.principles.size < 2 && pick.principles.add(k); renderWorkshop(); }; });
    $('inv-materials').querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { const k = b.dataset.m, v = Math.max(0, Math.min(5, (pick.materials[k] || 0) + +b.dataset.d)); if (v) pick.materials[k] = v; else delete pick.materials[k]; renderWorkshop(); }; });
    $('inv-list').innerHTML = me.inventions.length ? me.inventions.slice().reverse().map((i) => `<div class="item good"><b>${{ scientific: '🔬', technological: '⚙️', mystical: '✨' }[i.category]} ${esc(i.name)}</b> <span class="small muted">${esc(i.form)} · ${esc(i.domain)} · power ${i.power}</span>
      <div class="small">${esc(i.effect)}</div><details><summary class="small">How it works</summary><p class="small">${esc(i.explain)}</p>${i.explain_ai ? `<p class="small">🤖 Malcolm: ${esc(i.explain_ai)}</p>` : ''}</details>
      <div class="row exportrow" aria-label="Copy, export or share"><button data-x="copy" data-id="${i.id}" class="small">📋 Copy</button><button data-x="md" data-id="${i.id}" class="small">⬇️ Markdown</button><button data-x="pdf" data-id="${i.id}" class="small">🖨️ Print / PDF</button><button data-x="share" data-id="${i.id}" class="small">🔗 Share link</button></div>
      <div class="row"><button data-ai="${i.id}" class="small">🤖 Ask Malcolm to name & explain</button>${i.form === 'effect' && me.bag['inv:' + i.id] ? `<button data-use="${i.id}" class="small">Use (${me.bag['inv:' + i.id]} left)</button>` : ''}${i.form === 'structure' && me.bag['inv:' + i.id] ? `<button data-place="${i.id}" class="small">Place it</button>` : ''}</div></div>`).join('') : '<p class="small muted">No inventions yet.</p>';
    $('inv-list').querySelectorAll('[data-ai]').forEach((b) => { b.onclick = async () => { b.disabled = true; b.textContent = '🤖 thinking…'; try { const d = await api('POST', `/api/v90/malcolm${qs()}`, { mode: 'invent', invention: b.dataset.ai, world }); toast(d.source === 'malcolm' ? 'Malcolm explained it!' : 'Offline explanation shown.'); me = (await api('GET', `/api/v90/omni/me/${world}${qs()}`)).explorer; if (d.source !== 'malcolm') { const inv = me.inventions.find((i) => i.id === b.dataset.ai); if (inv) inv.explain_ai = d.text; } renderWorkshop(); } catch (e) { toast(friendly(e.message)); b.disabled = false; } }; });
    $('inv-list').querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => exportCard(b.dataset.x, b.dataset.id); });
    $('inv-list').querySelectorAll('[data-use]').forEach((b) => { b.onclick = async () => { const r = await post({ operation: 'use', item: 'inv:' + b.dataset.use }); if (r) { toast(`${r.used}: next ${r.boost} harvests doubled!`); audio.play('heal'); renderAll(); } }; });
    $('inv-list').querySelectorAll('[data-place]').forEach((b) => { b.onclick = () => { build = 'inv:' + b.dataset.place; showTab('explore'); renderAll(); toast('Tap a free square next to you on the map.'); }; });
  }
  $('inv-cat').onchange = () => { pick.principles.clear(); if ($('inv-cat').value !== 'mystical' && $('inv-form').value === 'ritual') $('inv-form').value = 'tool'; renderWorkshop(); };
  $('inv-go').onclick = async () => {
    const body = { operation: 'invent', category: $('inv-cat').value, form: $('inv-form').value, principles: [...pick.principles], materials: { ...pick.materials } };
    if ($('inv-obs').value) body.observation = $('inv-obs').value;
    const r = await post(body); const out = $('inv-result');
    if (!r) return renderWorkshop();
    if (!r.ok) { out.textContent = `⚗️ It fizzled (stability ${r.score}/${r.needed}). Tip: ${r.hint}. Your materials are safe.`; audio.play('wrong'); }
    else {
      const i = r.invention; out.textContent = `💡 You invented the ${i.name}! ${i.effect}.${r.unlocked.length ? ' New principles discovered: ' + r.unlocked.join(', ') + '.' : ''}${Object.keys(r.rep).length ? ' Reputation: ' + Object.entries(r.rep).map(([f, d]) => `${f} +${d}`).join(', ') + '.' : ''}`;
      audio.play('level'); pick.principles.clear(); pick.materials = {}; refreshEco();
    }
    renderAll();
  };

  // ---------- discovery cards: copy / export / share ----------
  async function copyText(t) { try { await navigator.clipboard.writeText(t); return true; } catch { const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } }
  function download(name, mime, body) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: mime })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
  async function exportCard(kind, id) {
    try {
      const d = await api('GET', `/api/v90/card/${world}/${id}${qs()}`), slug = d.card.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (kind === 'copy') { toast((await copyText(cardText(d.card))) ? '📋 Card copied (labelled FACT / SSR/CRA THEORY / IN-GAME).' : 'Copy failed: try Markdown instead.'); return; }
      if (kind === 'md') { download(`strata-${slug}.md`, 'text/markdown', cardMarkdown(d.card)); toast('⬇️ Markdown card downloaded.'); return; }
      if (kind === 'pdf') { const html = cardHTML(d.card); download(`strata-${slug}.html`, 'text/html', html); const w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank'); toast(w ? '🖨️ Opened the printable card: use Print → Save as PDF.' : '⬇️ Printable card downloaded: open it and choose Print → Save as PDF.'); return; }
      if (kind === 'share') {
        const r = await api('POST', '/api/v90/share', { invention: id, world, ...guest() });
        if (navigator.share) { try { await navigator.share({ title: d.card.title, text: `${d.card.title}: a Strata discovery card`, url: r.url }); return; } catch { /* fall through to copy */ } }
        toast((await copyText(r.url)) ? `🔗 Link copied: ${r.url}` : r.url);
      }
    } catch (e) { toast(friendly(e.message === 'share_rate_limited' ? 'You’ve shared a lot this hour. Try again later.' : e.message)); }
  }

  // ---------- me: customisation & seeded realms ----------
  function renderLook() {
    const ap = meta.appearance, a = me.appearance;
    $('exp-look').innerHTML = ['skin', 'hair', 'outfit'].map((k) => `<div class="swatches"><span class="small">${k}</span>${ap[k].map((c, i) => `<button class="sw ${a[k] === i ? 'on' : ''}" data-k="${k}" data-v="${i}" style="background:${c}" aria-label="${k} ${i + 1}"></button>`).join('')}</div>`).join('') +
      ['hat', 'cape'].map((k) => `<label>${k}</label><select data-sel="${k}">${ap[k].map((c, i) => `<option value="${i}" ${a[k] === i ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`).join('');
    $('exp-look').querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => customise({ [b.dataset.k]: +b.dataset.v }); });
    $('exp-look').querySelectorAll('[data-sel]').forEach((s) => { s.onchange = () => customise({ [s.dataset.sel]: +s.value }); });
    const pc = $('look-preview').getContext('2d'); pc.clearRect(0, 0, 120, 150);
    pc.fillStyle = ap.outfit[a.outfit]; pc.fillRect(38, 60, 44, 50); pc.fillStyle = ap.skin[a.skin]; pc.beginPath(); pc.arc(60, 42, 18, 0, 6.283); pc.fill();
    pc.fillStyle = ap.hair[a.hair]; pc.fillRect(42, 22, 36, 10); pc.fillStyle = '#333'; pc.fillRect(42, 110, 14, 30); pc.fillRect(64, 110, 14, 30);
    if (a.cape) { pc.fillStyle = a.cape === 3 ? '#ffd25e' : '#7a2e3a'; pc.fillRect(32, 60, 6, a.cape === 1 ? 30 : 60); pc.fillRect(82, 60, 6, a.cape === 1 ? 30 : 60); }
    if (a.hat) { pc.fillStyle = ['', '#3a4a5a', '#3f9a3f', '#a07a40', '#4a3aa0'][a.hat]; if (a.hat === 4) { pc.beginPath(); pc.moveTo(40, 26); pc.lineTo(80, 26); pc.lineTo(60, -4); pc.fill(); } else pc.fillRect(38, 16, 44, 10); }
    ctx.renderer && (ctx.renderer.appearance = { skin: ap.skin[a.skin], hair: ap.hair[a.hair], outfit: ap.outfit[a.outfit], hat: a.hat, cape: a.cape });
    ctx.renderer && (ctx.renderer.lookPalette = ap, ctx.renderer.myLook = { skin: a.skin, hair: a.hair, outfit: a.outfit, hat: a.hat, cape: a.cape });
  }
  async function customise(a) { const r = await post({ operation: 'customise', appearance: a }); if (r) renderLook(); }
  for (const k of ['w', 'm', 'h']) $(`cr-${k}`).oninput = () => { $(`cr-${k}-v`).textContent = $(`cr-${k}`).value; };
  $('cr-go').onclick = async () => {
    const r = await post({ operation: 'create_realm', name: $('cr-name').value, seed: $('cr-seed').value || $('cr-name').value, warmth: +$('cr-w').value, wetness: +$('cr-m').value, height: +$('cr-h').value, lux: $('cr-lux').checked });
    if (r) { $('cr-result').textContent = `🌍 ${r.realm.name} is ready. Pick it in Explore to travel there.`; renderRealmSelect(); }
  };

  // ---------- tabs, open/close, keys ----------
  function showTab(t) { document.querySelectorAll('[data-etab]').forEach((b) => b.classList.toggle('active', b.dataset.etab === t)); document.querySelectorAll('.etab').forEach((s) => s.classList.toggle('active', s.id === 'etab-' + t)); if (t === 'wild') refreshEco(); }
  document.querySelectorAll('[data-etab]').forEach((b) => { b.onclick = () => showTab(b.dataset.etab); });
  async function show() {
    $('expedition').classList.remove('hidden'); open = true; resize();
    try { await load(); } catch (e) { toast('The Expedition map is offline right now.'); }
    want(); cancelAnimationFrame(raf); draw(); clearInterval(ecoTimer); ecoTimer = setInterval(() => { if (open) { refreshEco(); want(); } }, 4000);
  }
  function hide() { $('expedition').classList.add('hidden'); open = false; cancelAnimationFrame(raf); clearInterval(ecoTimer); }
  $('omnibtn').onclick = () => (open ? hide() : show());
  document.querySelector('[data-close="expedition"]').onclick = hide;
  window.addEventListener('resize', () => { if (open) { resize(); want(); } });
  const KEYS = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
  function onKey(k) {
    if (k === 'o') { open ? hide() : show(); return true; }
    if (!open) return false;
    if (k === 'escape') { if (build) { build = null; renderAll(); } else hide(); return true; }
    if (KEYS[k]) { step(...KEYS[k]); return true; }
    if (k === 'e') { const t = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [me.x + dx, me.y + dy]).find(([x, y]) => { const i = tileInfo(x, y); return i?.feature && meta.harvest[i.feature]; }); if (t) harvest(...t); return true; }
    if (k === '+' || k === '=') { setZoom(zoom * 1.4); return true; }
    if (k === '-') { setZoom(zoom / 1.4); return true; }
    return true; // swallow other keys while the map is open
  }
  async function run(a) {
    if (!meta || !me) await load();
    if (a.type === 'travel') { if (!open) await show(); const r = await post({ operation: 'travel', realm: a.realm }); if (r) { cam = { x: 0, y: 0 }; renderRealmSelect(); renderAll(); refreshEco(); want(); return `Travelled to ${r.name}.`; } return ''; }
    if (a.type === 'talk') { const said = await openBard(a.npc); if (said && a.message) await sendBard(a.message); return said; }
    if (a.type === 'talk_story') { if (!open) await show(); const n = meta.npcs[a.npc]; if (me.realm !== 'aurelia') { await post({ operation: 'travel', realm: 'aurelia' }); renderRealmSelect(); } if (dist(n.x, n.y) > 3) await walkTo(n.x, n.y + 1); await talk(a.npc); return `Talking to ${n.name}.`; }
    if (a.type === 'customise') { const r = await post({ operation: 'customise', appearance: a.appearance }); if (r) { renderLook(); return 'Your look is updated.'; } return ''; }
    if (a.type === 'invent') {
      if (!open) await show(); showTab('workshop');
      const r = await post({ operation: 'invent', category: a.category, form: a.form, principles: a.principles, materials: a.materials, ...(a.observation ? { observation: a.observation } : {}) });
      renderAll(); if (!r) return '';
      return r.ok ? `You invented the ${r.invention.name}! ${r.invention.effect}.` : `It fizzled: ${r.trials.successes} of 144 trials worked. ${r.hint}.`;
    }
    if (a.type === 'open') { if (!open) await show(); showTab({ wildlife: 'wild', people: 'people', workshop: 'workshop', character: 'me' }[a.panel] || 'explore'); return ''; }
    return '';
  }
  return { show, hide, onKey, run, openBard, attachVoice(v) { voice = v; }, inConversation: () => Boolean(bard) && open, converse: sendBard, endConversation: endBard, get open() { return open; }, get state() { return { me, eco, zoom, chunks: chunks.size }; } };
}
