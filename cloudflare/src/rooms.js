// v9.0 shared worlds. Each invite room (code) is served by its OWN Durable Object ("room:<CODE>") in production, holding the
// authoritative v7.4 world `sw_<CODE>` plus everything that belongs to the party: membership (2–8), co-op Realignment quests,
// multi-player Resonance Lock puzzles, the shared Codex and co-inventions, and NPC group memory / faction splits.
// RoomHub is the transport-free WebSocket protocol: presence for interpolation, quick chat, emotes, opt-in text chat
// (moderated), and WebRTC voice SIGNALLING ONLY (offer/answer/ICE relayed between permitted peers; audio never touches the server).
import { h3, seedOf } from './omniverse.js';
import { GEN } from './genesis.js';
import { QUICK_IDS, EMOTE_IDS, ROOM_LIMITS, sanitizePrivacy } from '../../web/js/mpdata.js';

export class RoomError extends Error { constructor(code) { super(code); this.code = code; } }
export const ROOM_CODE = /^(?:[A-HJ-NP-Z2-9]{6}|HB[A-Z0-9]{7})$/;
export const roomWorld = (code) => `sw_${code}`;
export const codeOfWorld = (wid) => { const m = /^sw_([A-Z0-9]{6,9})$/.exec(String(wid)); return m && ROOM_CODE.test(m[1]) ? m[1] : null; };
const ADJ = ['Amber', 'Silver', 'Hidden', 'Singing', 'Quiet', 'Golden', 'Mirrored', 'Wandering', 'Crystal', 'Twilight', 'Verdant', 'Starlit'];
const NOUN = ['Stratum', 'Meadow', 'Archive', 'Harbour', 'Observatory', 'Grove', 'Lattice', 'Hollow', 'Spire', 'Garden', 'Causeway', 'Atelier'];
export function nameChoices(code) { const s = seedOf('room:' + code); return [0, 1, 2, 3].map((i) => `The ${ADJ[h3(s, i, 1) % ADJ.length]} ${NOUN[h3(s, i, 2) % NOUN.length]}`); }
export const QUEST_POOL = [
  { id: 'gather', unit: 'gather', label: 'Gather {n} resources together', n: 30 },
  { id: 'explore', unit: 'move', label: 'Walk {n} steps between you', n: 240 },
  { id: 'craft', unit: 'craft', label: 'Craft {n} items as a party', n: 6 },
  { id: 'build', unit: 'build', label: 'Build {n} things for the camp', n: 3 },
  { id: 'duels', unit: 'duel_win', label: 'Win {n} verified duels as a party', n: 5 },
  { id: 'discover', unit: 'discovery', label: 'Make {n} discoveries together', n: 6 },
  { id: 'talk', unit: 'npc', label: 'Talk with the Bards {n} times', n: 6 },
];
export const COOP = Object.freeze({ questCredit: 2, puzzleCredit: 3, coinventCredit: 2, puzzleWindow: 180, splitHi: 20, splitLo: -20, maxDrafts: 4, maxCodex: 60 });

function newQuests(code, tier = 0) {
  const s = seedOf('quests:' + code + ':' + tier), pool = [...QUEST_POOL], out = [];
  for (let i = 0; i < 3; i++) { const q = pool.splice(h3(s, i, 7) % pool.length, 1)[0]; const n = Math.round(q.n * (1 + 0.5 * tier)); out.push({ id: `${q.id}${tier}`, unit: q.unit, label: q.label.replace('{n}', n), n, progress: 0, by: {}, done: false }); }
  return out;
}
export function newRoom(code, owner, { name, max = 4, kind = 'party', house = null } = {}) {
  const names = nameChoices(code);
  return { code, kind, house, name: names.includes(name) ? name : names[0], owner, max: Math.max(ROOM_LIMITS.min, Math.min(ROOM_LIMITS.max, Math.trunc(Number(max)) || 4)),
    members: { [owner]: { joined: Date.now(), role: 'owner' } }, banned: [], settings: { pvp: false, text_chat: true, locked: false, party_voice: false },
    tier: 0, quests: newQuests(code, 0), credits: {}, puzzles: {}, codex: [], drafts: [], npc_log: [], created: Date.now() };
}

export class RoomStore {
  constructor(db) { this.db = db; db.run('CREATE TABLE IF NOT EXISTS rooms_v90(code TEXT PRIMARY KEY, record TEXT NOT NULL)'); }
  get(code) { const r = this.db.all('SELECT record FROM rooms_v90 WHERE code=?', code)[0]; return r ? JSON.parse(r.record) : null; }
  save(room) { this.db.run('INSERT INTO rooms_v90(code,record) VALUES(?,?) ON CONFLICT(code) DO UPDATE SET record=excluded.record', room.code, JSON.stringify(room)); return room; }
  need(code) { const r = this.get(code); if (!r) throw new RoomError('room_not_found'); return r; }
  isMember(code, pid) { const r = this.get(code); return !!r && Object.prototype.hasOwnProperty.call(r.members, pid); }
  create(code, owner, opts, rel) {
    if (!ROOM_CODE.test(code)) throw new RoomError('bad_room_code');
    if (this.get(code)) throw new RoomError('room_exists');
    if (opts.kind === 'house' && (!rel?.house || `HB${rel.house.slice(1).toUpperCase()}` !== code)) throw new RoomError('house_members_only');
    return this.save(newRoom(code, owner, { ...opts, house: opts.kind === 'house' ? rel.house : null }));
  }
  join(code, pid, rel) {
    const r = this.need(code);
    if (r.members[pid]) return r;
    if (r.banned.includes(pid)) throw new RoomError('room_not_found'); // no information to removed players
    if (r.kind === 'house' && rel?.house !== r.house) throw new RoomError('house_members_only');
    if (r.settings.locked) throw new RoomError('room_locked');
    if (Object.keys(r.members).length >= r.max) throw new RoomError('room_full');
    r.members[pid] = { joined: Date.now(), role: 'member' }; return this.save(r);
  }
  leave(code, pid) {
    const r = this.need(code); delete r.members[pid];
    if (r.owner === pid) { const next = Object.entries(r.members).sort((a, b) => a[1].joined - b[1].joined)[0]; if (next) { r.owner = next[0]; next[1].role = 'owner'; } }
    return this.save(r);
  }
  kick(code, pid, target) {
    const r = this.need(code); if (r.owner !== pid) throw new RoomError('owner_only'); if (target === pid || !r.members[target]) throw new RoomError('member_not_found');
    delete r.members[target]; r.banned = [...new Set([...r.banned, target])].slice(-50); return this.save(r);
  }
  configure(code, pid, patch = {}) {
    const r = this.need(code); if (r.owner !== pid) throw new RoomError('owner_only');
    if (patch.max !== undefined) { const m = Math.trunc(Number(patch.max)); if (!(m >= ROOM_LIMITS.min && m <= ROOM_LIMITS.max) || m < Object.keys(r.members).length) throw new RoomError('bad_max'); r.max = m; }
    for (const k of ['pvp', 'text_chat', 'locked', 'party_voice']) if (typeof patch[k] === 'boolean') r.settings[k] = patch[k];
    if (typeof patch.name === 'string' && nameChoices(r.code).includes(patch.name)) r.name = patch.name;
    return this.save(r);
  }
  // ---------------------------------------------------------------- co-op Realignment (shared quests, individual credit)
  track(code, pid, unit, n = 1) {
    const r = this.get(code); if (!r || !r.members[pid] || n <= 0) return null;
    const done = [];
    for (const q of r.quests) if (!q.done && q.unit === unit) {
      q.progress = Math.min(q.n, q.progress + n); q.by[pid] = (q.by[pid] ?? 0) + n;
      if (q.progress >= q.n) { q.done = true; done.push(q.id); for (const p of Object.keys(q.by)) r.credits[p] = (r.credits[p] ?? 0) + COOP.questCredit; }
    }
    if (r.quests.every((q) => q.done)) { r.tier += 1; r.quests = newQuests(code, r.tier); }
    this.save(r); return done.length ? done : null;
  }
  credit(code, pid) { return this.get(code)?.credits?.[pid] ?? 0; }
  // ---------------------------------------------------------------- Resonance Locks: multi-player law puzzles
  puzzleView(r, pid) {
    const order = Object.entries(r.members).sort((a, b) => a[1].joined - b[1].joined).map((e) => e[0]), idx = Math.max(0, order.indexOf(pid));
    const need = Math.max(2, Math.min(3, order.length));
    return GEN.laws.map((l, li) => {
      const st = r.puzzles[l.id] || { solved_by: [], subs: {} };
      const frag = (idx + li) % 3; // each member holds a different piece; talk (or use quick chat) to combine them
      const piece = frag === 0 ? { kind: 'question', text: l.q } : frag === 1 ? { kind: 'choices', text: l.options.map((o, i) => `${i + 1}. ${o}`).join('  ') } : { kind: 'fact', text: l.fact, label: 'FACT' };
      return { law: l.id, name: l.name, value: l.value, need, piece, options: l.options.length, solved: st.solved_by.length > 0, solvers: st.solved_by.length, waiting: Object.keys(st.subs).length };
    });
  }
  puzzleSubmit(code, pid, lawId, answer, nowS = Date.now() / 1000) {
    const r = this.need(code); if (!r.members[pid]) throw new RoomError('not_a_member');
    const law = GEN.laws.find((l) => l.id === lawId); if (!law) throw new RoomError('unknown_law');
    const st = r.puzzles[lawId] || (r.puzzles[lawId] = { solved_by: [], subs: {} });
    if (st.solved_by.length) return { solved: true, already: true };
    if (answer !== law.answer) { delete st.subs[pid]; this.save(r); return { solved: false, correct: false }; }
    for (const [p, t] of Object.entries(st.subs)) if (t < nowS - COOP.puzzleWindow) delete st.subs[p];
    st.subs[pid] = nowS;
    const need = Math.max(2, Math.min(3, Object.keys(r.members).length)), subs = Object.keys(st.subs).filter((p) => r.members[p]);
    if (subs.length >= need) { st.solved_by = subs.sort(); st.subs = {}; for (const p of subs) r.credits[p] = (r.credits[p] ?? 0) + COOP.puzzleCredit; }
    this.save(r); return { solved: st.solved_by.length > 0, correct: true, waiting_for: Math.max(0, need - subs.length), law: law.id };
  }
  // ---------------------------------------------------------------- shared Codex & co-invention drafts
  codexAdd(code, pid, entry) {
    const r = this.need(code); if (!r.members[pid]) throw new RoomError('not_a_member');
    if (r.codex.some((c) => c.sig === entry.sig)) return r.codex.find((c) => c.sig === entry.sig);
    const e = { id: `c${r.codex.length + 1}`, ...entry, added: Date.now() }; r.codex = [...r.codex, e].slice(-COOP.maxCodex); this.save(r); return e;
  }
  draftCreate(code, pid, spec) {
    const r = this.need(code); if (!r.members[pid]) throw new RoomError('not_a_member');
    if (r.drafts.length >= COOP.maxDrafts) throw new RoomError('too_many_drafts');
    const d = { id: `d${h3(seedOf(code), r.drafts.length + r.codex.length, Date.now() % 100000).toString(36)}`, by: pid, spec, principles: [], created: Date.now() };
    r.drafts.push(d); this.save(r); return d;
  }
  draftAdd(code, pid, draftId, principle, known) {
    const r = this.need(code); if (!r.members[pid]) throw new RoomError('not_a_member');
    const d = r.drafts.find((x) => x.id === draftId); if (!d) throw new RoomError('draft_not_found');
    if (!known.includes(principle)) throw new RoomError('principle_locked');
    if (d.principles.some((p) => p.id === principle)) throw new RoomError('already_added');
    if (d.principles.length >= 2) throw new RoomError('draft_full');
    d.principles.push({ id: principle, by: pid }); this.save(r); return d;
  }
  draftTake(code, pid, draftId) {
    const r = this.need(code), d = r.drafts.find((x) => x.id === draftId); if (!d) throw new RoomError('draft_not_found');
    if (d.by !== pid) throw new RoomError('proposer_only');
    const credits = [...new Set([d.by, ...d.principles.map((p) => p.by)])];
    if (credits.length < 2) throw new RoomError('needs_two_inventors');
    return { d, credits };
  }
  draftDone(code, draftId, inv, credits, card) {
    const r = this.need(code); r.drafts = r.drafts.filter((x) => x.id !== draftId);
    for (const p of credits) r.credits[p] = (r.credits[p] ?? 0) + COOP.coinventCredit;
    this.save(r); return this.codexAdd(code, credits[0], { kind: 'co_invention', sig: inv.sig, title: inv.name, credits, card });
  }
  // ---------------------------------------------------------------- NPC group memory & faction splits
  /** explorers: {pid: explorer} for current members; npcs: {id: {name}}. Deterministic. */
  npcGroup(r, explorers, npcs, nameOf = (p) => p) {
    const ids = new Set(); for (const ex of Object.values(explorers)) for (const k of Object.keys(ex?.npc || {})) ids.add(k);
    const out = [];
    for (const id of [...ids].sort()) {
      const rels = Object.entries(explorers).map(([p, ex]) => [p, ex?.npc?.[id]?.rel ?? 0, ex?.npc?.[id]?.times ?? 0]).filter((x) => x[2] > 0);
      if (!rels.length) continue;
      const mean = Math.round(rels.reduce((a, x) => a + x[1], 0) / rels.length);
      const pro = rels.filter((x) => x[1] >= COOP.splitHi).map((x) => nameOf(x[0])), anti = rels.filter((x) => x[1] <= COOP.splitLo).map((x) => nameOf(x[0]));
      const nm = npcs[id]?.name || id;
      const split = pro.length > 0 && anti.length > 0;
      const mood = mean >= COOP.splitHi ? 'trusts your party' : mean <= COOP.splitLo ? 'is wary of your party' : 'is still making up their mind about your party';
      out.push({ npc: id, name: nm, mean, talked: rels.reduce((a, x) => a + x[2], 0), mood, split,
        faction_split: split ? { with: pro, against: anti, text: `${nm}'s circle has split: ${pro.join(', ')} ${pro.length > 1 ? 'have' : 'has'} their trust, while ${anti.join(', ')} ${anti.length > 1 ? 'are' : 'is'} watched with suspicion.` } : null,
        memory: r.npc_log.filter((e) => e.npc === id).slice(-4).map((e) => e.text) });
    }
    return out;
  }
  remember(code, npc, text) { const r = this.get(code); if (!r) return; r.npc_log = [...r.npc_log, { npc, text: String(text).slice(0, 140), t: Date.now() }].slice(-60); this.save(r); }
  view(r, pid, nameOf = (p) => p) {
    const member = !!r.members[pid];
    const base = { code: r.code, name: r.name, kind: r.kind, members: Object.keys(r.members).length, max: r.max, full: Object.keys(r.members).length >= r.max, locked: r.settings.locked };
    if (!member) return { ...base, member: false };
    return { ...base, member: true, world: roomWorld(r.code), owner: r.owner === pid, settings: r.settings, names: r.owner === pid ? nameChoices(r.code) : undefined,
      roster: Object.entries(r.members).sort((a, b) => a[1].joined - b[1].joined).map(([p, m]) => ({ id: p, name: nameOf(p), role: m.role, you: p === pid })),
      tier: r.tier, quests: r.quests.map((q) => ({ id: q.id, label: q.label, n: q.n, progress: q.progress, done: q.done, yours: q.by[pid] ?? 0 })),
      your_credit: r.credits[pid] ?? 0, puzzles: this.puzzleView(r, pid),
      codex: r.codex.map((c) => ({ id: c.id, kind: c.kind, title: c.title, credits: (c.credits || []).map(nameOf), card: c.card })),
      drafts: r.drafts.map((d) => ({ id: d.id, by: nameOf(d.by), yours: d.by === pid, spec: d.spec, principles: d.principles.map((p) => ({ id: p.id, by: nameOf(p.by) })) })) };
  }
}

/** Who may hear whom: never strangers. Friends, the same House, or a party room whose owner turned on party voice and vouches for both (owner or owner's friends). */
export function voiceAllowed(a, b, room, rel, live) {
  if (!a || !b || a === b || !room?.members?.[a] || !room?.members?.[b]) return false;
  const ra = rel(a), rb = rel(b); if (!ra || !rb) return false;
  if (!sanitizePrivacy(ra.privacy).voice || !sanitizePrivacy(rb.privacy).voice) return false;
  if (!live?.voice?.[a] || !live?.voice?.[b]) return false;
  if (ra.blocked.includes(b) || rb.blocked.includes(a)) return false;
  if (ra.friends.includes(b)) return true;
  if (ra.house && ra.house === rb.house) return true;
  if (room.kind === 'party' && room.settings.party_voice) {
    const vouched = (p, r) => p === room.owner || r.friends.includes(room.owner);
    return vouched(a, ra) && vouched(b, rb);
  }
  return false;
}
export function textAllowed(from, to, room, rel) {
  if (from === to || !room?.members?.[to]) return false;
  const rf = rel(from), rt = rel(to); if (!rf || !rt) return false;
  if (!room.settings.text_chat || !rf.privacy.text_chat || !rt.privacy.text_chat) return false;
  return !rf.blocked.includes(to) && !rt.blocked.includes(from) && !rt.muted.includes(from);
}
const hidden = (from, to, rel) => { const rt = rel(to), rf = rel(from); return !rt || !rf || rt.blocked.includes(from) || rf.blocked.includes(to) || rt.muted.includes(from); };
const fin = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);

/**
 * Transport-free room protocol. handle() returns [{to, msg}] deliveries. `ctx` = { room, rel(pid)->relations|null, moderate(text, pid)->Promise<{ok,text,status}> }.
 * live state (presence, voice flags) is kept in memory only; nothing about audio is ever received or stored.
 */
export class RoomHub {
  constructor() { this.live = { pos: {}, voice: {}, speaking: {} }; this.buckets = new Map(); this.chatT = new Map(); }
  allow(pid, nowMs) {
    const b = this.buckets.get(pid) || { t: nowMs, tokens: ROOM_LIMITS.msgPerSec * 2 };
    b.tokens = Math.min(ROOM_LIMITS.msgPerSec * 2, b.tokens + ((nowMs - b.t) / 1000) * ROOM_LIMITS.msgPerSec); b.t = nowMs;
    if (b.tokens < 1) { this.buckets.set(pid, b); return false; } b.tokens -= 1; this.buckets.set(pid, b); return true;
  }
  windowOk(key, n, nowMs) { const q = (this.chatT.get(key) || []).filter((t) => t > nowMs - 10000); if (q.length >= n) { this.chatT.set(key, q); return false; } q.push(nowMs); this.chatT.set(key, q); return true; }
  others(room, pid) { return Object.keys(room.members).filter((p) => p !== pid); }
  roster(room, rel) {
    return { type: 'roster', members: Object.keys(room.members).map((p) => ({ id: p, name: rel(p)?.display ?? 'Explorer', voice: !!this.live.voice[p], speaking: !!this.live.speaking[p], pos: this.live.pos[p] ?? null })) };
  }
  leave(pid) { delete this.live.pos[pid]; delete this.live.voice[pid]; delete this.live.speaking[pid]; }
  async handle(pid, msg, ctx, nowMs = Date.now()) {
    const { room, rel } = ctx, out = [], send = (to, m) => out.push({ to, msg: m }), err = (e) => [{ to: pid, msg: { type: 'error', error: e } }];
    if (!room?.members?.[pid]) return err('not_a_member');
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return err('bad_message');
    if (!this.allow(pid, nowMs)) return err('slow_down');
    switch (msg.type) {
      case 'hello': send(pid, this.roster(room, rel)); for (const p of this.others(room, pid)) send(p, { type: 'joined', id: pid, name: rel(pid)?.display ?? 'Explorer' }); break;
      case 'pos': {
        const x = fin(msg.x, -1, 200), z = fin(msg.z, -1, 200), face = fin(msg.face, -10, 10), seq = Math.trunc(Number(msg.seq)) || 0;
        if (x === null || z === null) return err('bad_position');
        const prev = this.live.pos[pid]; let cx = x, cz = z;
        if (prev) { const dt = Math.max(0.05, (nowMs - prev.t) / 1000), d = Math.hypot(x - prev.x, z - prev.z), maxD = 9 * dt + 0.5; if (d > maxD) { cx = prev.x + ((x - prev.x) * maxD) / d; cz = prev.z + ((z - prev.z) * maxD) / d; } }
        const p = { x: cx, z: cz, face: face ?? 0, anim: ['idle', 'walk', 'run', 'attack', 'emote'].includes(msg.anim) ? msg.anim : 'idle', t: nowMs, seq };
        this.live.pos[pid] = p; send(pid, { type: 'ack', seq, x: cx, z: cz, corrected: cx !== x || cz !== z });
        for (const o of this.others(room, pid)) send(o, { type: 'pos', id: pid, ...p }); break;
      }
      case 'quick': case 'emote': {
        const ok = msg.type === 'quick' ? QUICK_IDS.has(msg.id) : EMOTE_IDS.has(msg.id); if (!ok) return err('unknown_' + msg.type);
        if (!this.windowOk('q:' + pid, ROOM_LIMITS.quickPer10s, nowMs)) return err('slow_down');
        send(pid, { type: msg.type, from: pid, id: msg.id, you: true });
        for (const o of this.others(room, pid)) if (!hidden(pid, o, rel)) send(o, { type: msg.type, from: pid, name: rel(pid)?.display, id: msg.id }); break;
      }
      case 'chat': {
        const me = rel(pid); if (!room.settings.text_chat) return err('text_chat_off_in_room'); if (!me?.privacy?.text_chat) return err('text_chat_off');
        if (!this.windowOk('c:' + pid, ROOM_LIMITS.chatPer10s, nowMs)) return err('slow_down');
        const m = await ctx.moderate(String(msg.text ?? ''), pid);
        if (!m.ok) return [{ to: pid, msg: { type: 'chat_blocked', status: m.status, reasons: m.reasons } }];
        send(pid, { type: 'chat', from: pid, text: m.text, you: true });
        for (const o of this.others(room, pid)) if (textAllowed(pid, o, room, rel)) send(o, { type: 'chat', from: pid, name: me.display, text: m.text }); break;
      }
      case 'voice': {
        const on = msg.on === true;
        if (on && !rel(pid)?.privacy?.voice) return err('voice_off_in_privacy');
        if (on) this.live.voice[pid] = true; else { delete this.live.voice[pid]; delete this.live.speaking[pid]; }
        // tell each member which peers THEY may connect to (never reveals strangers' voice state)
        for (const p of Object.keys(room.members)) {
          const peers = Object.keys(room.members).filter((q) => voiceAllowed(p, q, room, rel, this.live));
          send(p, { type: 'voice_peers', peers, you_on: !!this.live.voice[p], changed: pid });
        }
        break;
      }
      case 'rtc': {
        const to = String(msg.to ?? ''), kind = msg.kind;
        if (!['offer', 'answer', 'ice', 'bye'].includes(kind)) return err('bad_signal');
        const size = new TextEncoder().encode(JSON.stringify(msg.data ?? null)).length; if (size > ROOM_LIMITS.signalBytes) return err('signal_too_large');
        if (kind !== 'bye' && !voiceAllowed(pid, to, room, rel, this.live)) return err('voice_not_allowed');
        if (kind === 'bye' && !room.members[to]) return err('bad_peer');
        send(to, { type: 'rtc', from: pid, kind, data: msg.data ?? null }); break;
      }
      case 'speaking': {
        if (!this.live.voice[pid]) return err('voice_not_on');
        const on = msg.on === true; if (on) this.live.speaking[pid] = true; else delete this.live.speaking[pid];
        for (const o of this.others(room, pid)) if (voiceAllowed(pid, o, room, rel, this.live)) send(o, { type: 'speaking', id: pid, on }); break;
      }
      default: return err('unknown_message');
    }
    return out;
  }
}
