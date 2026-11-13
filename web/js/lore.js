// v9.0 lore Easter eggs (shared by the browser and the Worker): decodable crop-circle glyphs, the Sallow stream,
// the 365.26-day cycle and the collectible pages of the Lux Prime Canon. Pages are original in-game writing; any line
// about Oliver's SSR/CRA ideas is labelled as his theory, and real facts are labelled FACT.
export const LORE_LABEL = 'IN-GAME lore: an Easter-egg trail through Oliver\'s Lux Prime Canon. Story, not science, except where a line is marked FACT.';
export const YEAR_CENTIDAYS = 36526; // 365.26 in-game days per year (FACT: Earth's sidereal year is about 365.256 days)
export const DAY_TICKS = 24;
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** A crop-circle glyph: one spoke per letter, 5 rings per spoke; ring k (inner = 16 … outer = 1) is lit when that bit of the letter's number (A=1 … Z=26) is set. */
export function encodeGlyph(word) { return [...String(word).toUpperCase()].filter((c) => A.includes(c)).map((c) => { const n = A.indexOf(c) + 1; return [16, 8, 4, 2, 1].map((b) => (n & b ? 1 : 0)); }); }
export function decodeGlyph(spokes) { return spokes.map((s) => A[s.reduce((n, bit, i) => n + (bit ? [16, 8, 4, 2, 1][i] : 0), 0) - 1] || '?').join(''); }
export const GLYPHS = [
  { id: 'g_sallow', site: 'sallow', word: 'HEAL', where: 'pressed into the reeds beside the Sallow stream' },
  { id: 'g_stones', site: 'lattice_stones', word: 'LATTICE', where: 'mown into the barley around the Standing Stones' },
  { id: 'g_moon', site: 'moonwell', word: 'MOON', where: 'traced in dew around Titania\'s Moonwell' },
  { id: 'g_ember', site: 'ember_altar', word: 'SPARK', where: 'scorched lightly into the grass by the Ember Altar' },
  { id: 'g_frost', site: 'battlements', word: 'REMEMBER', where: 'drawn in frost below the Battlements' },
  { id: 'g_star', site: 'star_dais', word: 'LUX', where: 'set in pale stones on the Star Dais' },
];
export const PAGES = [
  { id: 'p01', title: 'Page I: The Fracture', how: 'Decode the Sallow glyph', label: 'IN-GAME', text: 'Before the strata, there was one clear light. It cracked, and every shard became a layer of the world, each remembering a different colour of the first light.' },
  { id: 'p02', title: 'Page II: The Lattice', how: 'Decode the Standing Stones glyph', label: 'SSR/CRA THEORY', text: 'In Oliver\'s SSR/CRA theory the world is read as a lattice of 144 layers. In Strata the Standing Stones keep that count, twelve marks on twelve stones. (His framework, not established science.)' },
  { id: 'p03', title: 'Page III: The Moonwell', how: 'Decode the Moonwell glyph', label: 'IN-GAME', text: 'Titania says the Moonwell keeps one drop of the first light, and that it only wakes when the Moon is new or full.' },
  { id: 'p04', title: 'Page IV: The Spark', how: 'Decode the Ember glyph', label: 'IN-GAME', text: 'A rune is a small promise carved in light. The Ember Sprite teaches that the kindest runes are the smallest ones.' },
  { id: 'p05', title: 'Page V: Remembering', how: 'Decode the Frostveil glyph', label: 'IN-GAME', text: 'The Ghost on the battlements asks only to be remembered kindly. Memory, the Canon says, is how the light stays whole.' },
  { id: 'p06', title: 'Page VI: Lux', how: 'Decode the Star Dais glyph', label: 'IN-GAME', text: 'Lux is not owned. It is gathered, shared and given back. That is the first rule of a realigner.' },
  { id: 'p07', title: 'Page VII: The Healing Stream', how: 'Receive the Sallow stream\'s blessing and meet its wisp', label: 'IN-GAME', text: 'The Sallow stream hums a single low note. Those who rest beside it leave a little lighter, and the wisp remembers their footsteps.' },
  { id: 'p08', title: 'Page VIII: The Solar Return', how: 'Watch the sky on the day a 365.26-day year turns', label: 'FACT', text: 'Earth takes about 365.256 days to circle the Sun once measured against the stars (the sidereal year). Strata keeps a 365.26-day in-game year in its honour.' },
  { id: 'p09', title: 'Page IX: The Great Year', how: 'Begin a New Genesis', label: 'SSR/CRA THEORY', text: 'Oliver\'s CRA links a Grand Year of about 26,000 years to the turning of the ages. (FACT: precession takes about 25,772 years. The link to the strata is his theory.)' },
  { id: 'p10', title: 'Page X: Voices of the Air', how: 'Commune with three spirits', label: 'IN-GAME', text: 'Spirits in Strata are gentle: wisps, sprites and calm apparitions who share a memory and fade like mist.' },
  { id: 'p11', title: 'Page XI: The Pilgrim', how: 'Receive blessings at all six sacred sites', label: 'IN-GAME', text: 'A pilgrim is not someone who arrives. A pilgrim is someone who keeps noticing.' },
  { id: 'p12', title: 'Page XII: The Star Reader', how: 'Solve five star charts', label: 'IN-GAME', text: 'The Weird Sisters admit it: they do not see the future. They watch the sky, listen well and guess kindly.' },
];
const GLYPH_PAGE = { g_sallow: 'p01', g_stones: 'p02', g_moon: 'p03', g_ember: 'p04', g_frost: 'p05', g_star: 'p06' };
export class LoreError extends Error { constructor(code) { super(code); this.code = code; } }
export const normLore = (s) => ({ glyphs: Array.isArray(s?.glyphs) ? s.glyphs.filter((g) => GLYPH_PAGE[g]) : [], solar: Array.isArray(s?.solar) ? s.solar.filter(Number.isInteger).slice(-50) : [] });
export const yearOf = (day) => Math.floor((day * 100) / YEAR_CENTIDAYS);
/** True on the in-game day a 365.26-day year turns (the Solar Return). */
export function isSolarReturn(day) { return day > 0 && yearOf(day) !== yearOf(day - 1); }
export function nextSolarReturn(day) { let d = day + 1; while (!isSolarReturn(d)) d++; return d; }
/** A glyph is visible once you have stood at its sacred site (any blessing visit) — the Sallow glyph is always visible. */
export function visibleGlyphs(mystic) { return GLYPHS.filter((g) => g.site === 'sallow' || Object.prototype.hasOwnProperty.call(mystic.visits || {}, g.site)).map((g) => ({ id: g.id, site: g.site, where: g.where, spokes: encodeGlyph(g.word), length: g.word.length })); }
export function decode(lore, mystic, glyphId, answer) {
  const g = GLYPHS.find((x) => x.id === glyphId); if (!g) throw new LoreError('unknown_glyph');
  if (!visibleGlyphs(mystic).some((x) => x.id === glyphId)) throw new LoreError('glyph_not_found_yet');
  if (lore.glyphs.includes(glyphId)) return { correct: true, already: true, page: GLYPH_PAGE[glyphId] };
  const ok = String(answer ?? '').toUpperCase().replace(/[^A-Z]/g, '') === g.word;
  if (ok) lore.glyphs.push(glyphId);
  return { correct: ok, already: false, page: ok ? GLYPH_PAGE[glyphId] : null };
}
export function claimSolar(lore, day) { if (!isSolarReturn(day)) throw new LoreError('not_solar_return'); const y = yearOf(day); if (!lore.solar.includes(y)) lore.solar.push(y); return { year: y }; }
/** Pages are derived from what the player has actually done (server state), so they cannot be claimed from the browser. */
export function pagesOwned(lore, mystic, cycle) {
  const own = new Set(lore.glyphs.map((g) => GLYPH_PAGE[g]));
  if ((mystic.visits || {}).sallow !== undefined && (mystic.spirits || []).includes('wisp')) own.add('p07');
  if (lore.solar.length) own.add('p08');
  if (cycle >= 1) own.add('p09');
  if ((mystic.spirits || []).length >= 3) own.add('p10');
  if (Object.keys(mystic.visits || {}).length >= 6) own.add('p11');
  if ((mystic.charts?.n ?? 0) >= 5) own.add('p12');
  return PAGES.filter((p) => own.has(p.id)).map((p) => p.id);
}
export function loreView(lore, mystic, cycle, day) {
  const owned = new Set(pagesOwned(lore, mystic, cycle));
  return { label: LORE_LABEL, glyphs: visibleGlyphs(mystic).map((g) => ({ ...g, decoded: lore.glyphs.includes(g.id) ? GLYPHS.find((x) => x.id === g.id).word : null })), total_glyphs: GLYPHS.length,
    pages: PAGES.map((p) => (owned.has(p.id) ? { ...p, owned: true } : { id: p.id, title: p.title, how: p.how, owned: false })), owned: owned.size,
    year: yearOf(day), solar_return: isSolarReturn(day), next_solar_return: nextSolarReturn(day), solar_claimed: lore.solar };
}
