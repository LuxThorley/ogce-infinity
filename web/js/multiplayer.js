// v9.0 "Together": the multiplayer client. Invite-code rooms (2–8, one server-authoritative Durable Object per world),
// co-op quests + split-clue puzzles, shared Codex + co-invention, NPC group memory, friends + privacy (Children's Code
// defaults), Houses, the Hall of Discoveries, community events, weekly trials, opt-in arenas, quick chat + emotes (on),
// opt-in text chat (moderated server-side, fails closed) and opt-in push-to-talk voice (WebRTC mesh, STUN only, never
// recorded or stored). Also the Omniversal Leaderboard. Everything is authorised on the server; this file only draws it.
import { QUICK, EMOTES, PRIVACY_DEFAULTS, PRIVACY_CHOICES, BANNER } from './mpdata.js';
import { VoiceMesh } from './voicechat.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const ROOM_RE = /^[A-Z0-9]{6,9}$/;
export function roomFromUrl(search) { const c = new URLSearchParams(search || '').get('room'); return c && ROOM_RE.test(c.toUpperCase()) ? c.toUpperCase() : null; }
export const PRIVACY_LABEL = { text_chat: 'Free text chat (filtered; off = quick chat only)', voice: 'Voice chat (friends, House or a vouched party; push-to-talk)', dms: 'Private messages', friend_requests: 'Friend requests', hall_credit: 'Name in the Hall & leaderboards', pvp: 'Opt-in arenas (PvP trials)', show_online: 'Who sees you online' };
export const REPORT_REASONS = [['bullying', 'Bullying or unkind'], ['inappropriate', 'Inappropriate'], ['personal_info', 'Asking for / sharing personal info'], ['cheating', 'Cheating'], ['spam', 'Spam'], ['worried', 'I feel worried or unsafe'], ['other', 'Something else']];
const FRIENDLY = { room_not_found: 'No room with that code. Check the letters and try again.', room_full: 'That room is full (8 explorers max).', room_locked: 'That room is locked by its owner.', not_a_member: 'Join the room first.',
  unauthorized: 'Sign in (free) to play together.', text_chat_off: 'Free text chat is off in your privacy settings. Quick chat still works.', text_chat_off_in_room: 'The room owner has text chat off. Quick chat still works.',
  voice_off_in_privacy: 'Turn on voice in Together → Friends & privacy first.', slow_down: 'Slow down a little 🙂', bad_room_code: 'Room codes are 6–9 letters and numbers.' };

export function initMultiplayer({ $, api, toast, session, playerId, roomCode, startTrial, caption, onVoiceAudio, getLook, onLooks }) {
  const ov = $('together'), body = $('tg-body'), lbov = $('leaderboard'), lbBody = $('lb-body'), wheel = $('quickwheel');
  let tab = 'party', room = null, me = null, sock = null, voice = null, roster = [], speaking = new Set(), log = [];
  const say = (e) => toast(FRIENDLY[e?.message] || FRIENDLY[e] || (e?.message ? `Hmm: ${e.message.replace(/_/g, ' ')}` : String(e)));
  const signedIn = () => !!session();
  const call = async (m, p, b) => { try { return await api(m, p, b); } catch (e) { say(e); return null; } };

  // ------------------------------------------------------------------ socket (shared with the live world socket)
  let sentLook = '';
  const looks = {}; // room-mates' avatar looks (palette indices), drawn by the 3D renderer
  function attach(s) { sock = s; if (roomCode && s?.readyState === 1) { const look = getLook?.() || null; sentLook = JSON.stringify(look); s.send(JSON.stringify({ type: 'hello', look })); } }
  function syncLook() { if (!roomCode || sock?.readyState !== 1) return; const look = getLook?.(); const k = JSON.stringify(look || null); if (look && k !== sentLook) { sentLook = k; sock.send(JSON.stringify({ type: 'look', look })); } }
  const setLook = (id, l) => { if (id && l && typeof l === 'object') looks[id] = l; else if (id) delete looks[id]; onLooks?.(looks); };
  const send = (m) => { if (sock?.readyState === 1) { sock.send(JSON.stringify(m)); return true; } toast('Not connected to the room yet.'); return false; };
  function push(line) { log.push(line); log = log.slice(-40); const el = $('tg-log'); if (el) { el.innerHTML = log.map((l) => `<div>${l}</div>`).join(''); el.scrollTop = 1e6; } }
  const nameOf = (id) => roster.find((r) => r.id === id)?.name || 'Explorer';
  function handle(d) {
    switch (d.type) {
      case 'look': setLook(d.id, d.look); return true;
      case 'roster': roster = d.members || []; for (const m of roster) setLook(m.id, m.look); speaking = new Set(roster.filter((r) => r.speaking).map((r) => r.id)); if (tab === 'party') drawRoster(); return true;
      case 'joined': roster = roster.filter((r) => r.id !== d.id).concat([{ id: d.id, name: d.name }]); setLook(d.id, d.look); push(`👋 <b>${esc(d.name)}</b> joined`); caption?.(`${d.name} joined the room`); drawRoster(); return true;
      case 'left': roster = roster.filter((r) => r.id !== d.id); setLook(d.id, null); speaking.delete(d.id); voice?.hangup?.(d.id); push(`🚪 ${esc(nameOf(d.id))} left`); drawRoster(); return true;
      case 'quick': { const q = QUICK.find((x) => x[0] === d.id); const who = d.you ? 'You' : d.name || nameOf(d.from); push(`<b>${esc(who)}</b>: ${esc(q?.[1] || d.id)}`); if (!d.you) caption?.(`${who}: ${q?.[1] || ''}`); return true; }
      case 'emote': { const em = EMOTES.find((x) => x[0] === d.id); const who = d.you ? 'You' : d.name || nameOf(d.from); push(`${em?.[1] || '✨'} <b>${esc(who)}</b> ${esc(d.id)}s`); return true; }
      case 'chat': { const who = d.you ? 'You' : d.name || nameOf(d.from); push(`💬 <b>${esc(who)}</b>: ${esc(d.text)}`); if (!d.you) caption?.(`${who}: ${d.text}`); return true; }
      case 'chat_blocked': push(`🛡️ ${d.status === 'held' ? 'Your message is waiting for a moderator.' : 'That message wasn’t sent: please keep it friendly and don’t share personal details.'}`); return true;
      case 'voice_peers': voice?.setAllowed(d.peers); const vp = $('tg-voicepeers'); if (vp) vp.textContent = d.peers.length ? `Can talk with: ${d.peers.filter((p) => p !== playerId()).map(nameOf).join(', ') || 'nobody yet'}` : 'Nobody you can voice-chat with here yet (friends, House or a vouched party only).'; return true;
      case 'rtc': voice?.signal(d); return true;
      case 'speaking': if (d.on) speaking.add(d.id); else speaking.delete(d.id); drawRoster(); return true;
      case 'ack': case 'pos': return true;
      case 'error': if (['slow_down', 'text_chat_off', 'text_chat_off_in_room', 'voice_off_in_privacy', 'voice_not_allowed', 'not_a_member'].includes(d.error)) { say(d.error); return true; } return false;
      default: return false;
    }
  }
  // ------------------------------------------------------------------ voice (opt-in, push-to-talk)
  async function voiceToggle(on) {
    if (on) {
      if (!roomCode) return toast('Voice works inside a room. Create or join one first.');
      const cfg = await call('GET', '/api/v90/rtc/config'); if (!cfg) return;
      voice = new VoiceMesh({ me: playerId(), send, iceServers: cfg.iceServers, getMic: () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }),
        makePeer: (c) => new RTCPeerConnection(c), onSpeaking: (id, v) => { if (v) speaking.add(id); else speaking.delete(id); drawRoster(); },
        onFallback: (id, why) => push(why === 'mic_lost' ? '🎙️ Your microphone stopped and could not be restarted. Turn voice off and on again.' : `🔇 Couldn’t connect voice with ${esc(nameOf(id))}. Quick chat still works.`), onAudio: (id, stream) => onVoiceAudio?.(id, stream) });
      try { await voice.enable(); toast('🎙️ Voice on. Press and hold “Hold to talk” to speak; you are silent otherwise.'); } catch (e) { voice = null; toast('Microphone permission was not given, so voice stays off.'); }
    } else { voice?.disable(); voice = null; }
    draw();
  }
  const talk = (down) => voice?.talk(down);

  // ------------------------------------------------------------------ party / room
  async function createRoom() {
    if (!signedIn()) return say('unauthorized');
    const name = $('tg-rname')?.value?.trim() || 'Our world', max = +($('tg-rmax')?.value || 4);
    const d = await call('POST', '/api/v90/room/new', { name, max }); if (!d?.room) return;
    location.search = `?room=${d.room.code}`;
  }
  async function joinRoom(code) {
    if (!signedIn()) return say('unauthorized');
    code = String(code || '').trim().toUpperCase(); if (!ROOM_RE.test(code)) return say('bad_room_code');
    const d = await call('POST', `/api/v90/room/${code}/join`, {}); if (d?.room) location.search = `?room=${code}`;
  }
  async function loadRoom() { if (!roomCode || !signedIn()) return null; const [r, m] = await Promise.all([call('GET', `/api/v90/room/${roomCode}`), me ? Promise.resolve(me) : call('GET', '/api/v90/social/me')]); room = r; me = m; return room; }
  const rop = async (op, b = {}) => { const d = await call('POST', `/api/v90/room/${roomCode}/${op}`, b); if (d?.room) room = { ...room, ...d.room }; return d; };
  function drawRoster() {
    const el = $('tg-roster'); if (!el || !room?.roster) return;
    const live = new Set(roster.map((r) => r.id));
    el.innerHTML = room.roster.map((m) => `<div class="tg-row"><span class="dot ${live.has(m.id) ? 'on' : ''}" title="${live.has(m.id) ? 'here now' : 'away'}"></span>${speaking.has(m.id) ? '🔊 ' : ''}<b>${esc(m.name)}</b> <span class="small muted">${esc(m.role)}${m.you ? ' · you' : ''}</span>
      ${m.you ? '' : `<span class="tg-acts"><button data-f="${esc(m.id)}" title="Send a friend request">➕</button><button data-mute="${esc(m.id)}" title="Mute (hide their messages)">🔕</button><button data-block="${esc(m.id)}" title="Block">⛔</button><button data-rep="${esc(m.id)}" title="Report to a moderator">🚩</button>${room.owner ? `<button data-kick="${esc(m.id)}" title="Remove from room">🚪</button>` : ''}</span>`}</div>`).join('');
    el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = async () => { const r = await rop('friend', { target: b.dataset.f }); if (r) toast(r.status === 'sent' || r.sent ? 'Friend request sent.' : `Friend request: ${String(r.status || 'done').replace(/_/g, ' ')}`); }));
    el.querySelectorAll('[data-mute]').forEach((b) => (b.onclick = async () => { if (await call('POST', '/api/v90/social/block', { target: b.dataset.mute, kind: 'mute' })) { voice?.mute(b.dataset.mute, true); toast('Muted. You won’t see or hear them.'); } }));
    el.querySelectorAll('[data-block]').forEach((b) => (b.onclick = async () => { if (confirm('Block this explorer? They can’t message, friend or voice-chat you.') && await call('POST', '/api/v90/social/block', { target: b.dataset.block, kind: 'block' })) { voice?.hangup?.(b.dataset.block); toast('Blocked.'); } }));
    el.querySelectorAll('[data-rep]').forEach((b) => (b.onclick = () => reportForm(b.dataset.rep, `room:${roomCode}`)));
    el.querySelectorAll('[data-kick]').forEach((b) => (b.onclick = async () => { if (await rop('kick', { target: b.dataset.kick })) draw(); }));
  }
  function reportForm(target, context) {
    const f = $('tg-report'); f.classList.remove('hidden');
    f.innerHTML = `<b>🚩 Report</b><p class="small">What happened? A real moderator reads every report. If you feel unsafe, tell a trusted adult.</p><select id="tg-rr">${REPORT_REASONS.map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select><textarea id="tg-rt" maxlength="240" placeholder="Optional: what was said or done"></textarea><div><button id="tg-rs" class="primary">Send report</button> <button id="tg-rc">Cancel</button></div>`;
    $('tg-rc').onclick = () => f.classList.add('hidden');
    $('tg-rs').onclick = async () => { const r = await call('POST', roomCode && context?.startsWith('room:') ? `/api/v90/room/${roomCode}/report` : '/api/v90/social/report', { target, reason: $('tg-rr').value, text: $('tg-rt').value, context }); if (r) { toast((r.result || r).message || 'Report sent.'); f.classList.add('hidden'); } };
  }
  function partyHtml() {
    if (!signedIn()) return `<p>Playing together needs a free account (so we can keep everyone safe). Sign in from the side panel.</p>`;
    if (!roomCode) return `<h3>🌐 Play together</h3><p class="small">Make a private world and share its invite code with friends (2–8 explorers). Quick chat and emotes are on; free text chat and voice are opt-in.</p>
      <div class="tg-grid"><div class="card"><b>Create a room</b><input id="tg-rname" maxlength="40" placeholder="Room name (e.g. The Lattice Crew)"><label class="small">Explorers <select id="tg-rmax">${[2, 3, 4, 5, 6, 7, 8].map((n) => `<option ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select></label><button id="tg-create" class="primary">Create &amp; get invite code</button></div>
      <div class="card"><b>Join with a code</b><input id="tg-code" maxlength="9" placeholder="e.g. K7Q2ZP" style="text-transform:uppercase"><button id="tg-join" class="primary">Join</button></div></div>`;
    if (!room) return `<p>Loading room ${esc(roomCode)}…</p>`;
    if (!room.member) return `<p>You’re not in room <b>${esc(roomCode)}</b> yet.</p><button id="tg-joinme" class="primary">Join ${esc(room.name || roomCode)}</button> <a href="/">Back to Aurelia</a>`;
    const S = room.settings || {}, myText = !!me?.privacy?.text_chat, canText = S.text_chat && myText;
    return `<h3>🌐 ${esc(room.name)} <span class="small muted">· code <b class="mono">${esc(room.code)}</b> · ${room.members}/${room.max}</span></h3>
      <div class="tg-invite"><input readonly value="${esc(room.invite?.link || '')}" id="tg-link"><button id="tg-copy">Copy invite</button><a href="/" class="small">Leave to Aurelia</a> <button id="tg-leave" class="small">Leave room</button></div>
      ${room.owner ? `<div class="small tg-set">Owner settings: <label><input type="checkbox" id="tg-s-text" ${S.text_chat ? 'checked' : ''}> text chat</label> <label><input type="checkbox" id="tg-s-voice" ${S.party_voice ? 'checked' : ''}> party voice (for your friends)</label> <label><input type="checkbox" id="tg-s-lock" ${S.locked ? 'checked' : ''}> lock room</label> <label><input type="checkbox" id="tg-s-pvp" ${S.pvp ? 'checked' : ''}> friendly PvP</label></div>` : ''}
      <div class="tg-cols"><div><h4>Explorers</h4><div id="tg-roster"></div><div id="tg-report" class="card hidden"></div>
        <h4>Say something</h4><div class="tg-quick">${QUICK.map(([id, t]) => `<button data-q="${id}">${esc(t)}</button>`).join('')}</div>
        <div class="tg-emotes">${EMOTES.map(([id, e]) => `<button data-e="${id}" title="${id}">${e}</button>`).join('')}</div>
        <div class="tg-chat"><input id="tg-chatin" maxlength="160" placeholder="${canText ? 'Type a friendly message (filtered)…' : !S.text_chat ? 'Text chat is off in this room: use quick chat' : 'Free text chat is off (turn it on in Friends & privacy)'}" ${canText ? '' : 'disabled'}><button id="tg-chatgo" ${canText ? '' : 'disabled'}>Send</button></div>
        <div id="tg-log" class="tg-log"></div>
        <h4>🎙️ Voice <span class="small muted">(peer-to-peer, push-to-talk, never recorded)</span></h4>
        <div><label><input type="checkbox" id="tg-voice" ${voice ? 'checked' : ''}> Voice on</label> <button id="tg-ptt" ${voice ? '' : 'disabled'}>Hold to talk</button></div><div id="tg-voicepeers" class="small muted"></div></div>
      <div><h4>Co-op quests <span class="small muted">· room tier ${room.tier ?? 1} · your credit ${room.your_credit ?? 0}</span></h4>${(room.quests || []).map((q) => `<div class="tg-q ${q.done ? 'done' : ''}"><b>${esc(q.label)}</b><div class="bar"><i style="width:${Math.min(100, (q.progress / Math.max(1, q.n)) * 100)}%"></i></div><span class="small">${q.progress}/${q.n} · you ${q.yours}${q.done ? ' · ✅ done' : ''}</span></div>`).join('') || '<p class="small">No quests yet.</p>'}
        <h4>🧩 Law puzzles <span class="small muted">· everyone holds a different clue: share them!</span></h4>${(room.puzzles || []).map((p) => `<div class="tg-pz ${p.solved ? 'done' : ''}"><b>${esc(p.name)}</b> <span class="small muted">needs ${p.need} answers · ${p.waiting} waiting</span><div class="small"><span class="tag ${p.piece.label === 'FACT' ? 'fact' : ''}">${esc(p.piece.kind)}</span> ${esc(p.piece.text)}</div>${p.solved ? '<span class="small">✅ solved together</span>' : `<select data-pzs="${esc(p.law)}">${Array.from({ length: p.options }, (_, i) => `<option value="${i}">Answer ${i + 1}</option>`).join('')}</select><button data-pz="${esc(p.law)}">Submit</button>`}</div>`).join('')}
        <h4>📚 Shared Codex</h4>${(room.codex || []).map((c) => `<div class="tg-cx"><b>${esc(c.title)}</b> <span class="small muted">by ${esc((c.credits || []).join(' & '))}</span> <button data-hall="${esc(c.id)}" class="small">Send to the Hall</button></div>`).join('') || '<p class="small">Share an invention from the Expedition, or co-invent one below.</p>'}
        <h4>🛠️ Co-invention drafts</h4>${(room.drafts || []).map((d) => `<div class="tg-cx"><b>${esc(d.spec?.form || 'Draft')}</b> (${esc(d.spec?.category || '')}) by ${esc(d.by)} · principles: ${esc(d.principles.map((p) => `${p.id} (${p.by})`).join(', ') || 'none yet')} <input data-prin="${esc(d.id)}" placeholder="principle id" size="10"><button data-add="${esc(d.id)}">Add mine</button>${d.yours ? `<button data-fin="${esc(d.id)}" class="primary">Finalize</button>` : ''}</div>`).join('')}
        <div class="small"><input id="tg-dcat" placeholder="category (e.g. tool)" size="12"><input id="tg-dform" placeholder="form (e.g. lens)" size="10"><button id="tg-dnew">New draft</button></div>
        <h4>🗣️ What the people think of your group</h4>${(room.npc_group || []).map((n) => `<div class="small">• ${esc(n.line || n.name || JSON.stringify(n))}</div>`).join('') || '<p class="small">Talk to people together and they’ll remember your group.</p>'}</div></div>`;
  }
  function bindParty() {
    const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
    on('tg-create', createRoom); on('tg-join', () => joinRoom($('tg-code').value)); on('tg-joinme', () => joinRoom(roomCode));
    on('tg-copy', async () => { try { await navigator.clipboard.writeText($('tg-link').value); toast('Invite link copied. Only share it with people you know.'); } catch { $('tg-link').select(); } });
    on('tg-leave', async () => { if (confirm('Leave this room?') && await rop('leave')) location.search = ''; });
    for (const [id, key] of [['tg-s-text', 'text_chat'], ['tg-s-voice', 'party_voice'], ['tg-s-lock', 'locked'], ['tg-s-pvp', 'pvp']]) { const el = $(id); if (el) el.onchange = async () => { await rop('settings', { [key]: el.checked }); draw(); }; }
    body.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => send({ type: 'quick', id: b.dataset.q })));
    body.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => send({ type: 'emote', id: b.dataset.e })));
    const chatGo = () => { const v = $('tg-chatin').value.trim(); if (v && send({ type: 'chat', text: v })) $('tg-chatin').value = ''; };
    on('tg-chatgo', chatGo); const ci = $('tg-chatin'); if (ci) ci.onkeydown = (e) => { if (e.key === 'Enter') chatGo(); e.stopPropagation(); };
    const vt = $('tg-voice'); if (vt) vt.onchange = () => voiceToggle(vt.checked);
    const ptt = $('tg-ptt'); if (ptt) { ptt.onpointerdown = () => talk(true); ptt.onpointerup = ptt.onpointerleave = () => talk(false); }
    body.querySelectorAll('[data-pz]').forEach((b) => (b.onclick = async () => { const law = b.dataset.pz, ans = +body.querySelector(`[data-pzs="${law}"]`).value; const d = await rop('puzzle', { law, answer: ans }); if (d?.puzzle) toast(d.puzzle.solved ? '🧩 Solved together!' : d.puzzle.correct === false ? 'Not that one. Compare clues!' : 'Answer in: waiting for the others.'); draw(); }));
    body.querySelectorAll('[data-hall]').forEach((b) => (b.onclick = async () => { const d = await rop('hall', { entry: b.dataset.hall }); if (d) toast(d.message || (d.status === 'published' ? '🏛️ In the Hall of Discoveries!' : `Hall: ${d.status}`)); }));
    body.querySelectorAll('[data-add]').forEach((b) => (b.onclick = async () => { const pr = body.querySelector(`[data-prin="${b.dataset.add}"]`).value.trim(); if (await rop('draft', { step: 'add', draft: b.dataset.add, principle: pr })) draw(); }));
    body.querySelectorAll('[data-fin]').forEach((b) => (b.onclick = async () => { const d = await rop('draft', { step: 'finalize', draft: b.dataset.fin }); if (d) toast(d.ok ? `🛠️ Co-invented: ${d.inv?.name || 'a new invention'}!` : 'The canon validator said not yet: try other principles.'); draw(); }));
    on('tg-dnew', async () => { if (await rop('draft', { step: 'create', category: $('tg-dcat').value.trim(), form: $('tg-dform').value.trim(), materials: {} })) draw(); });
    drawRoster(); if (log.length) push('');
  }
  // ------------------------------------------------------------------ friends & privacy
  function friendsHtml(s) {
    if (!s) return '<p>Sign in to add friends.</p>';
    const P = { ...PRIVACY_DEFAULTS, ...(s.privacy || {}) };
    const priv = Object.keys(PRIVACY_DEFAULTS).map((k) => typeof P[k] === 'boolean' ? `<label class="tg-prow"><input type="checkbox" data-pv="${k}" ${P[k] ? 'checked' : ''}> ${esc(PRIVACY_LABEL[k])}</label>` : `<label class="tg-prow">${esc(PRIVACY_LABEL[k])} <select data-pvs="${k}">${PRIVACY_CHOICES[k].map((o) => `<option ${o === P[k] ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`).join('');
    return `<h3>🤝 Friends</h3><p>Your friend code: <b class="mono">${esc(s.friend_code)}</b> <button id="tg-rot" class="small">New code</button> <span class="small muted">Only give it to people you know in real life.</span></p>
      <div><input id="tg-fcode" placeholder="Friend’s code" maxlength="12"><button id="tg-fadd">Send request</button></div>
      ${(s.incoming || []).length ? `<h4>Requests</h4>${s.incoming.map((w) => `<div class="tg-row">${esc(w)} <button data-acc="${esc(w)}">Accept</button><button data-dec="${esc(w)}">Decline</button></div>`).join('')}` : ''}
      <h4>Friends (${(s.friends || []).length})</h4>${(s.friends || []).map((w) => `<div class="tg-row">${esc(w)} <button data-unf="${esc(w)}" class="small">Remove</button></div>`).join('') || '<p class="small">No friends yet.</p>'}
      ${(s.blocked || []).length ? `<h4>Blocked</h4>${s.blocked.map((w) => `<div class="tg-row">${esc(w)} <button data-unb="${esc(w)}" class="small">Unblock</button></div>`).join('')}` : ''}
      <h4>Display name <span class="small muted">(checked before anyone sees it)</span></h4><div><input id="tg-dname" maxlength="20" placeholder="${esc(s.display || 'Explorer')}"><button id="tg-dset">Set name</button></div>
      <h4>🔒 Privacy <span class="small muted">(safest settings are the default)</span></h4>${priv}`;
  }
  function bindFriends() {
    const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
    on('tg-rot', async () => { if (await call('POST', '/api/v90/social/friend', { op: 'rotate_code' })) draw(); });
    on('tg-fadd', async () => { const r = await call('POST', '/api/v90/social/friend', { op: 'request', code: $('tg-fcode').value.trim() }); if (r) toast(r.message || `Friend request ${String(r.status || 'sent').replace(/_/g, ' ')}.`); draw(); });
    on('tg-dset', async () => { const r = await call('POST', '/api/v90/leaderboard', { op: 'name', name: $('tg-dname').value.trim() }); if (r) toast(r.message || (r.status === 'approved' ? 'Name set.' : `Name ${r.status}.`)); });
    body.querySelectorAll('[data-acc]').forEach((b) => (b.onclick = async () => { await call('POST', '/api/v90/social/friend', { op: 'accept', who: b.dataset.acc }); draw(); }));
    body.querySelectorAll('[data-dec]').forEach((b) => (b.onclick = async () => { await call('POST', '/api/v90/social/friend', { op: 'decline', who: b.dataset.dec }); draw(); }));
    body.querySelectorAll('[data-unf]').forEach((b) => (b.onclick = async () => { await call('POST', '/api/v90/social/friend', { op: 'remove', who: b.dataset.unf }); draw(); }));
    body.querySelectorAll('[data-unb]').forEach((b) => (b.onclick = async () => { await call('POST', '/api/v90/social/block', { target: b.dataset.unb, kind: 'block', on: false }); draw(); }));
    const save = async () => { const p = {}; body.querySelectorAll('[data-pv]').forEach((c) => (p[c.dataset.pv] = c.checked)); body.querySelectorAll('[data-pvs]').forEach((c) => (p[c.dataset.pvs] = c.value)); const r = await call('POST', '/api/v90/social/privacy', { privacy: p }); if (r) { toast('Privacy saved.'); if (me) me.privacy = r.privacy; } };
    body.querySelectorAll('[data-pv],[data-pvs]').forEach((c) => (c.onchange = save));
  }
  // ------------------------------------------------------------------ House
  const bannerSvg = (b = {}) => { const C = BANNER.colours; return `<svg viewBox="0 0 40 50" width="40" height="50" aria-hidden="true"><path d="M2 2h36v30l-18 16-18-16z" fill="${C[b.field] || '#2f6fd0'}" stroke="#111" stroke-width="1.5"/><text x="20" y="27" font-size="16" text-anchor="middle">${{ star: '★', sun: '☀', moon: '☾', tree: '🌳', crystal: '💎', wolf: '🐺', stag: '🦌', owl: '🦉', spiral: '🌀', crown: '♛', book: '📖', flame: '🔥' }[b.charge] || '★'}</text></svg>`; };
  function houseHtml(h) {
    if (h === undefined) return '<p>Sign in to found or join a House.</p>';
    if (!h) return `<h3>🏰 Houses</h3><p class="small">A House is a long-term guild (up to 24) with a charter, banner, shared stash and its own leaderboard. Names and charters are checked by moderators.</p>
      <div class="tg-grid"><div class="card"><b>Found a House</b><input id="tg-hname" maxlength="32" placeholder="House name"><textarea id="tg-hchart" maxlength="400" placeholder="Charter: what does your House stand for?"></textarea>
      <label class="small">Field <select id="tg-hf">${BANNER.fields.map((f) => `<option>${f}</option>`).join('')}</select></label> <label class="small">Charge <select id="tg-hc">${BANNER.charges.map((f) => `<option>${f}</option>`).join('')}</select></label><button id="tg-hnew" class="primary">Found House</button></div>
      <div class="card"><b>Join with an invite code</b><input id="tg-hcode" maxlength="12"><button id="tg-hjoin" class="primary">Join</button></div></div>`;
    return `<h3>${bannerSvg(h.banner)} ${esc(h.name)} <span class="small muted">· ${esc(h.role || '')}</span></h3>${h.banner?.motto ? `<p><i>“${esc(h.banner.motto)}”</i></p>` : ''}<p class="small">${esc(h.charter || (h.charter_status === 'pending' ? 'Charter waiting for a moderator.' : 'No charter yet.'))}</p>
      <h4>Members (${h.members.length})</h4>${h.members.map((m) => `<div class="tg-row">${esc(m.name)} <span class="small muted">${esc(m.role)}${m.you ? ' · you' : ''}</span></div>`).join('')}
      <h4>Stash</h4><p class="small">${Object.entries(h.stash || {}).map(([k, v]) => `${esc(k)} ×${v}`).join(', ') || 'Empty'}</p><div class="small"><select id="tg-hitem"><option>wood</option><option>stone</option><option>crystal</option></select><button id="tg-hdep">Deposit 1</button><button id="tg-hwd">Withdraw 1</button></div>
      ${h.invites ? `<h4>Invites</h4><p class="small">${h.invites.map((i) => `<b class="mono">${esc(i.code)}</b>`).join(' ') || 'none'}</p><button id="tg-hinv">New invite code</button>` : ''}
      <div class="small"><input id="tg-hmotto" maxlength="60" placeholder="Motto"><button id="tg-hsetm">Set motto</button> <button id="tg-hleave">Leave House</button></div>`;
  }
  function bindHouse() {
    const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
    const hop = async (b, ok) => { const r = await call('POST', '/api/v90/house', b); if (r) { if (r.message) toast(r.message); else if (ok) toast(ok); draw(); } };
    on('tg-hnew', () => hop({ op: 'create', name: $('tg-hname').value.trim(), charter: $('tg-hchart').value.trim(), banner: { field: $('tg-hf').value, charge: $('tg-hc').value } }, '🏰 House founded! The name shows once a moderator approves it.'));
    on('tg-hjoin', () => hop({ op: 'join', code: $('tg-hcode').value.trim() }, 'Welcome to the House!'));
    on('tg-hdep', () => hop({ op: 'deposit', item: $('tg-hitem').value, n: 1 })); on('tg-hwd', () => hop({ op: 'withdraw', item: $('tg-hitem').value, n: 1 }));
    on('tg-hinv', () => hop({ op: 'invite' })); on('tg-hsetm', () => hop({ op: 'motto', text: $('tg-hmotto').value.trim() }, 'Motto sent for a quick check.'));
    on('tg-hleave', () => { if (confirm('Leave your House?')) hop({ op: 'leave' }); });
  }
  // ------------------------------------------------------------------ Hall, events, trials
  function hallHtml(entries, sort) {
    return `<h3>🏛️ Hall of Discoveries</h3><p class="small">Inventions and discoveries players chose to share. Credit shows as each inventor chose (anonymous by default).</p><div><button data-hs="top" ${sort === 'top' ? 'class="primary"' : ''}>Most liked</button> <button data-hs="new" ${sort === 'new' ? 'class="primary"' : ''}>Newest</button></div>
      <div class="tg-hall">${(entries || []).map((e) => `<div class="card"><b>${esc(e.card?.title || e.card?.name || 'Discovery')}</b><div class="small muted">by ${esc((e.credits || []).join(' & '))}</div><p class="small">${esc(e.card?.summary || e.card?.blurb || (e.card?.lines || []).map((l) => (Array.isArray(l) ? l[1] : l?.text || '')).join(' ').slice(0, 220))}</p><button data-vote="${esc(e.id)}" ${e.yours ? 'disabled' : ''}>${e.voted ? '💛' : '🤍'} ${e.votes}</button></div>`).join('') || '<p>Nothing here yet: be the first!</p>'}</div>`;
  }
  function eventsHtml(ev, wk, ar) {
    const a = ev?.active;
    return `<h3>🌘 Community events</h3>${a ? `<div class="card"><b>${a.icon} ${esc(a.name)}</b><p class="small">${esc(a.blurb)}</p><div class="bar"><i style="width:${Math.min(100, (a.progress / a.goal) * 100)}%"></i></div><span class="small">${a.progress}/${a.goal} ${esc(a.unit)} · ${a.players} explorers · you helped ${a.you}</span> ${a.can_claim ? '<button id="tg-claim" class="primary">Claim reward</button>' : a.claimed ? '✅ claimed' : ''}<div class="small muted">Reward: the title “${esc(a.reward_name)}” (cosmetic only).</div></div>` : `<p class="small">No event this week.${ev?.next ? ` Next: ${ev.next.icon} ${esc(ev.next.name)} (${esc(ev.next.starts)}).` : ''}</p>`}
      <h3>🗡️ Weekly trial</h3>${wk ? `<div class="card"><b>${esc(wk.challenge.name)}</b><p class="small">Everyone fights the same seeded opponent with equalised skills. The server replays your inputs to verify the score. One fair try at a time; no pay-to-win.</p><button id="tg-weekly" class="primary">Start the trial</button>
        <ol class="small">${(wk.board?.top || []).map((r) => `<li ${r.you ? 'class="you"' : ''}>${esc(r.name)}: ${r.score}</li>`).join('') || '<li>No scores yet this week.</li>'}</ol></div>` : ''}
      <h3>⚔️ Arena <span class="small muted">(opt-in PvP trials)</span></h3>${ar ? (ar.pvp ? `<div class="card"><p class="small">${ar.queued ? `In the queue (${esc(ar.queued.mode || '')})…` : ar.match ? `Match ready vs ${esc((ar.match.names || ar.match.players || []).join(', '))}` : 'Matched with players of similar skill. Both sides fight the same seeded trial; best verified score wins.'}</p>
        ${ar.match ? '<button id="tg-arena-go" class="primary">Fight</button>' : ar.queued ? '<button id="tg-arena-leave">Leave queue</button> <button id="tg-arena-tick">Check</button>' : '<button id="tg-arena-q" class="primary" data-m="duel">Queue 1v1</button> <button id="tg-arena-q2" data-m="team">Queue team trial</button>'}</div>` : '<p class="small">Arenas are off. Turn on “Opt-in arenas” in Friends &amp; privacy if you want to take part.</p>') : ''}`;
  }
  // ------------------------------------------------------------------ draw
  let hallSort = 'top';
  async function draw() {
    if (ov.classList.contains('hidden')) return;
    $('tg-tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'party') { if (roomCode && signedIn()) await loadRoom(); body.innerHTML = partyHtml(); bindParty(); return; }
    if (!signedIn()) { body.innerHTML = '<p>Sign in (free) to use this. Your privacy settings start at the safest options.</p>'; return; }
    if (tab === 'friends') { me = await call('GET', '/api/v90/social/me'); body.innerHTML = friendsHtml(me); bindFriends(); return; }
    if (tab === 'house') { const d = await call('GET', '/api/v90/house'); body.innerHTML = houseHtml(d ? d.house : undefined); bindHouse(); return; }
    if (tab === 'hall') { const d = await call('GET', `/api/v90/hall?sort=${hallSort}`); body.innerHTML = hallHtml(d?.entries, hallSort);
      body.querySelectorAll('[data-hs]').forEach((b) => (b.onclick = () => { hallSort = b.dataset.hs; draw(); }));
      body.querySelectorAll('[data-vote]').forEach((b) => (b.onclick = async () => { await call('POST', '/api/v90/hall', { op: 'vote', id: b.dataset.vote, on: !b.textContent.includes('💛') }); draw(); })); return; }
    if (tab === 'events') {
      const [ev, wk, ar] = await Promise.all([call('GET', '/api/v90/events'), call('GET', '/api/v90/weekly'), call('GET', '/api/v90/arena')]);
      body.innerHTML = eventsHtml(ev, wk, ar);
      const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
      on('tg-claim', async () => { const r = await call('POST', '/api/v90/events', { op: 'claim' }); if (r) toast(`🏅 ${r.reward_name}`); draw(); });
      on('tg-weekly', () => { close(); startTrial('/api/v90/weekly', wk.challenge.name); });
      for (const id of ['tg-arena-q', 'tg-arena-q2']) on(id, async () => { await call('POST', '/api/v90/arena', { op: 'queue', mode: $(id).dataset.m }); draw(); });
      on('tg-arena-leave', async () => { await call('POST', '/api/v90/arena', { op: 'leave' }); draw(); }); on('tg-arena-tick', draw);
      on('tg-arena-go', () => { close(); startTrial('/api/v90/arena', 'Arena trial'); });
    }
  }
  function open(t) { if (t) tab = t; ov.classList.remove('hidden'); draw(); }
  function close() { ov.classList.add('hidden'); }
  $('tg-tabs').querySelectorAll('button').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; draw(); }));

  // ------------------------------------------------------------------ leaderboard
  let lbState = { category: 'lux', scope: 'all', filter: 'global' }, lbMeta = null;
  async function drawLb() {
    if (!signedIn()) { lbBody.innerHTML = '<p>Sign in (free) to see the Omniversal Leaderboard. Names show anonymously unless you choose otherwise.</p>'; return; }
    if (!lbMeta) lbMeta = await call('GET', '/api/v90/leaderboard/me');
    const [b, legends] = await Promise.all([call('GET', `/api/v90/leaderboard?category=${lbState.category}&scope=${lbState.scope}&filter=${lbState.filter}`), call('GET', '/api/v90/leaderboard/legends')]);
    const cats = lbMeta?.categories || { lux: { name: 'Lux' } };
    const medal = (r) => (r <= 1 ? '🥇' : r <= 3 ? '🥈' : r <= 10 ? '🥉' : '');
    lbBody.innerHTML = `<div class="lb-controls"><select id="lb-cat">${Object.entries(cats).map(([k, c]) => `<option value="${k}" ${k === lbState.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <select id="lb-scope">${[['all', 'All time'], ['season', `Season ${esc(lbMeta?.season?.id || '')}`], ['weekly', 'This week']].map(([k, v]) => `<option value="${k}" ${k === lbState.scope ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select id="lb-filter">${[['global', 'Everyone'], ['friends', 'Friends'], ['house', 'My House']].map(([k, v]) => `<option value="${k}" ${k === lbState.filter ? 'selected' : ''}>${v}</option>`).join('')}</select> <button id="lb-refresh" title="Recount my scores">↻</button></div>
      <p class="small muted">Scores come from server-verified play only (duels are replayed, gains are rate-capped, odd jumps are held for review). Rewards are cosmetic titles and frames, never power.</p>
      <table class="lb"><thead><tr><th>#</th><th>Explorer</th><th>${esc(b?.name || '')}</th></tr></thead><tbody>${(b?.rows || []).map((r) => `<tr class="${r.you ? 'you' : ''}"><td>${medal(r.rank)} ${r.rank}</td><td>${r.banner ? bannerSvg(r.banner) : ''}${esc(r.name)}${r.members ? ` <span class="small muted">(${r.members})</span>` : ''}</td><td>${r.score}</td></tr>`).join('') || '<tr><td colspan="3">No scores yet: go explore!</td></tr>'}</tbody></table>
      ${b?.you && !(b.rows || []).some((r) => r.you) ? `<p>You: #${b.you.rank} · ${b.you.score}</p>` : ''}
      <h4>🌟 Legends of past seasons</h4><div class="small">${(legends?.legends || []).map((l) => `${esc(l.season || '')} ${esc(l.category || '')}: ${esc(l.name || '')}`).join(' · ') || 'The first season is still running.'}</div>
      <h4>🎖️ Your rewards</h4><div class="small">${(lbMeta?.rewards || []).map((r) => esc(r.name || r.title || r)).join(', ') || 'None yet.'}</div>`;
    for (const [id, key] of [['lb-cat', 'category'], ['lb-scope', 'scope'], ['lb-filter', 'filter']]) $(id).onchange = () => { lbState[key] = $(id).value; drawLb(); };
    $('lb-refresh').onclick = async () => { await call('POST', '/api/v90/leaderboard', { op: 'refresh' }); drawLb(); };
  }
  function openLb() { lbov.classList.remove('hidden'); drawLb(); }
  // ------------------------------------------------------------------ quick-chat wheel (U)
  function toggleWheel() {
    if (!roomCode) { toast('Quick chat works in a shared room. Open 👥 Together to make one.'); return; }
    if (!wheel.classList.contains('hidden')) { wheel.classList.add('hidden'); return; }
    wheel.innerHTML = QUICK.slice(0, 8).map(([id, t], i) => `<button data-q="${id}" style="--a:${i * 45}deg">${esc(t)}</button>`).join('') + EMOTES.slice(0, 4).map(([id, e], i) => `<button class="em" data-e="${id}" style="--a:${i * 90 + 22}deg">${e}</button>`).join('');
    wheel.classList.remove('hidden');
    wheel.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => { send({ type: 'quick', id: b.dataset.q }); wheel.classList.add('hidden'); }));
    wheel.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => { send({ type: 'emote', id: b.dataset.e }); wheel.classList.add('hidden'); }));
  }
  return { open, close, openLb, syncLook, looks, resumeVoice: () => voice?.resumePlayback?.() || 0, closeLb: () => lbov.classList.add('hidden'), attach, handle, toggleWheel, talk, get voiceOn() { return !!voice; }, get room() { return room; }, closeAll() { close(); lbov.classList.add('hidden'); wheel.classList.add('hidden'); } };
}
