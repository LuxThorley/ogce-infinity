// v9.0 multiplayer constants shared by the client and the Worker (quick-chat wheel, emotes, privacy defaults, limits).
// Quick chat and emotes are fixed, pre-written and safe, so they are ON by default; free text chat is opt-in only.
export const QUICK = [
  ['hello', '👋 Hello!'], ['thanks', '🙏 Thank you!'], ['follow', '➡️ Follow me'], ['wait', '✋ Wait for me'],
  ['help', '🆘 Help!'], ['found', '🔎 I found something'], ['gather', '🪵 Let’s gather here'], ['puzzle', '🧩 Puzzle over here'],
  ['nice', '⭐ Nice one!'], ['ready', '✅ Ready'], ['notready', '⏳ Not ready yet'], ['regroup', '🏕️ Regroup at camp'],
  ['danger', '⚠️ Careful, danger'], ['law', '📜 I know this law'], ['gg', '🤝 Good game'], ['bye', '👋 Bye for now'],
];
export const EMOTES = [['wave', '👋'], ['cheer', '🎉'], ['bow', '🙇'], ['dance', '💃'], ['think', '🤔'], ['laugh', '😄'], ['clap', '👏'], ['point', '👉'], ['sit', '🪑'], ['salute', '🫡']];
export const QUICK_IDS = new Set(QUICK.map((q) => q[0]));
export const EMOTE_IDS = new Set(EMOTES.map((e) => e[0]));
// Children's Code: high-privacy defaults. Everything social that is not pre-written starts OFF.
export const PRIVACY_DEFAULTS = Object.freeze({
  text_chat: false,        // free text chat (opt-in; filtered + moderated)
  voice: false,            // voice chat (opt-in; friends, party or House only; push-to-talk)
  dms: 'off',              // 'off' | 'friends'  (never strangers)
  friend_requests: 'code', // 'code' (only with your friend code or from a party you are in) | 'off'
  hall_credit: 'anonymous',// 'anonymous' | 'name'  (how your name shows in the public Hall of Discoveries and leaderboards)
  pvp: false,              // arenas are opt-in; co-op worlds never have PvP unless the owner turns it on AND you opt in
  show_online: 'friends',  // 'friends' | 'nobody'
});
export const PRIVACY_CHOICES = { dms: ['off', 'friends'], friend_requests: ['code', 'off'], hall_credit: ['anonymous', 'name'], show_online: ['friends', 'nobody'] };
export const ROOM_LIMITS = Object.freeze({ min: 2, max: 8, msgPerSec: 12, chatPer10s: 5, quickPer10s: 8, signalBytes: 8192 });
export const BANNER = Object.freeze({
  fields: ['azure', 'gules', 'vert', 'or', 'argent', 'purpure', 'sable', 'tenne'],
  charges: ['star', 'sun', 'moon', 'tree', 'crystal', 'wolf', 'stag', 'owl', 'spiral', 'crown', 'book', 'flame'],
  colours: { azure: '#2f6fd0', gules: '#c8343a', vert: '#2f9a55', or: '#e8b931', argent: '#e8ecf2', purpure: '#7b4bb3', sable: '#22252c', tenne: '#c7742c' },
});
export function sanitizePrivacy(p) {
  const out = { ...PRIVACY_DEFAULTS };
  if (p && typeof p === 'object') {
    for (const k of ['text_chat', 'voice', 'pvp']) if (typeof p[k] === 'boolean') out[k] = p[k];
    for (const [k, opts] of Object.entries(PRIVACY_CHOICES)) if (opts.includes(p[k])) out[k] = p[k];
  }
  return out;
}
