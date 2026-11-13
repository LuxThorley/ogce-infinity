// Strata: Lux Genesis v9.0 mysticism layer: exact port of ogce4/v90/mystic.py (parity-tested).
// Shared by the browser (sky view, spirits) and the Worker (authoritative blessings, charts, enchantments, duel modifiers).
// Everything mystical is MYSTICAL/IN-GAME: part of the story, never established science.
import MY from './mysticdata.js';
import { h3 } from './combat.js';
export { MY };
export const SIGNS = MY.signs, PLANETS = MY.planets, CAPS = MY.caps;
export const SITES = Object.fromEntries(MY.sites.map((s) => [s.id, s]));
export const SPIRITS = Object.fromEntries(MY.spirits.map((s) => [s.id, s]));
export const RUNES = Object.fromEntries(MY.runes.map((r) => [r.id, r]));
const FULL = 360000, fd = (a, b) => Math.floor(a / b), mod = (a, b) => ((a % b) + b) % b;
export class MysticError extends Error { constructor(code) { super(code); this.code = code; } }

export function dayHour(tick) { const t = Math.max(0, Math.trunc(+tick || 0)); return [fd(t, MY.day_ticks), t % MY.day_ticks]; }
export const isNight = (hour) => MY.night_hours[0] <= hour && hour <= MY.night_hours[1];
export function sep(a, b) { const d = Math.abs(a - b) % FULL; return Math.min(d, FULL - d); }
export function merge(...effs) {
  const out = Object.fromEntries(Object.keys(CAPS).map((k) => [k, 0]));
  for (const e of effs) for (const [k, v] of Object.entries(e || {})) if (k in out) out[k] += Math.trunc(v);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.max(0, Math.min(CAPS[k], v))]));
}
export function sky(tick, seed) {
  const [day, hour] = dayHour(tick), u = seed >>> 0, s = u % FULL;
  const sun = fd(day * 36000000, MY.year_centidays) % FULL;
  const age = (day * 100 + u % MY.month_centidays) % MY.month_centidays;
  const phase = fd(age * 8 + fd(MY.month_centidays, 2), MY.month_centidays) % 8;
  const planets = PLANETS.map((p, i) => { const lon = (p.base + s * (2 * i + 1) + fd(day * FULL, p.game_days)) % FULL; return { id: p.id, lon, sign: SIGNS[fd(lon, 30000)].id }; });
  const lon = Object.fromEntries(planets.map((p) => [p.id, p.lon]));
  const active = [], effs = [];
  for (const a of MY.alignments) if (sep(lon[a.pair[0]], lon[a.pair[1]]) <= MY.orb) { active.push(a.id); effs.push(a.effect); }
  const grand = planets.some((p) => planets.filter((q) => mod(q.lon - p.lon, FULL) <= MY.grand_window).length >= 3);
  if (grand) { active.push(MY.grand.id); effs.push(MY.grand.effect); }
  const mfx = MY.moon_fx[String(phase)];
  if (mfx) { active.push(mfx.id); effs.push(mfx.effect); }
  const sign = SIGNS[fd(sun, 30000)];
  return { day, hour, night: isNight(hour), sun: { lon: sun, sign: sign.id }, moon: { age, phase, name: MY.moon[phase] }, planets, active, grand,
    element: sign.element, school: MY.elements[sign.element].school, effects: merge(...effs) };
}
export function grandYear(cycle) {
  const c = Math.max(0, Math.trunc(+cycle || 0)), start = SIGNS.findIndex((s) => s.id === MY.grand_year.start_age);
  const i = mod(start - c, 12), nxt = mod(i - 1, 12);
  return { age: SIGNS[i].id, name: 'Age of ' + SIGNS[i].name, glyph: SIGNS[i].glyph, grand_years: fd(c, 12), ages_into: c % 12, next: SIGNS[nxt].id, years: MY.grand_year.years };
}
export function normState(s) {
  s = s || {}; const ch = s.charts || {};
  return { blessing: s.blessing ?? null, charts: { day: Math.trunc(ch.day ?? -1), solved: [...(ch.solved || [])], n: Math.trunc(ch.n ?? 0) },
    spirits: [...(s.spirits || [])], runes: { ...(s.runes || {}) }, visits: { ...(s.visits || {}) } };
}
const near = (ex, site) => ex.realm === site.realm && Math.abs(Math.trunc(ex.x ?? 0) - site.x) + Math.abs(Math.trunc(ex.y ?? 0) - site.y) <= MY.visit_range;
const siteOpen = (site, sk) => site.when === 'any' || (site.when === 'night' && sk.night) || (site.when === 'moon' && (sk.moon.phase === 0 || sk.moon.phase === 4));
export const spiritVisible = (sp, sk) => sp.when === 'any' || (sp.when === 'night' && sk.night) || (sp.when === 'full' && sk.moon.phase === 4);
export const nearSite = near;

export function bless(state, ex, siteId, tick, seed) {
  const site = SITES[siteId]; if (!site) throw new MysticError('unknown_site');
  if (!near(ex, site)) throw new MysticError('too_far');
  const sk = sky(tick, seed);
  if (!siteOpen(site, sk)) throw new MysticError('site_sleeping');
  if (state.visits[siteId] === sk.day) throw new MysticError('already_blessed_today');
  state.visits[siteId] = sk.day;
  state.blessing = { site: siteId, effect: { ...site.effect }, day: sk.day };
  return { site: siteId, name: site.name, effect: { ...site.effect }, text: site.text };
}
export function commune(state, ex, spiritId, tick, seed) {
  const sp = SPIRITS[spiritId]; if (!sp) throw new MysticError('unknown_spirit');
  if (!near(ex, SITES[sp.site])) throw new MysticError('too_far');
  if (!spiritVisible(sp, sky(tick, seed))) throw new MysticError('spirit_hidden');
  const isNew = !state.spirits.includes(spiritId);
  if (isNew) state.spirits.push(spiritId);
  return { spirit: spiritId, name: sp.name, kind: sp.kind, lore: sp.lore, new: isNew, count: state.spirits.length };
}
const rot = (l, r) => [...l.slice(r), ...l.slice(0, r)];
export function puzzles(tick, seed) {
  const sk = sky(tick, seed), d = sk.day;
  const si = SIGNS.findIndex((s) => s.id === sk.sun.sign);
  const sunOpts = [0, 3, 6, 9].map((k) => SIGNS[(si + k) % 12].name);
  const ph = sk.moon.phase, moonOpts = [0, 2, 4, 6].map((k) => MY.moon[(ph + k) % 8]);
  const P = sk.planets, pairs = [];
  for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) pairs.push([P[a], P[b]]);
  const order = pairs.map((_, i) => i).sort((i, j) => (sep(pairs[i][0].lon, pairs[i][1].lon) - sep(pairs[j][0].lon, pairs[j][1].lon)) || (i - j));
  const pick = [order[0], order[3], order[6], order[9]];
  const pname = Object.fromEntries(PLANETS.map((p) => [p.id, p.name]));
  const pairOpts = pick.map((i) => pname[pairs[i][0].id] + ' & ' + pname[pairs[i][1].id]);
  return [['sun', 'Star chart: in which zodiac sign is the Sun today?', sunOpts], ['moon', "Star chart: what is the Moon's phase tonight?", moonOpts],
    ['pair', 'Star chart: which two planets are closest together in the sky today?', pairOpts]].map(([kind, q, opts], n) => {
    const ch = rot(opts, h3(seed, d, n + 1) % 4);
    return { id: kind + ':' + d, kind, q, choices: ch, answer: ch.indexOf(opts[0]) };
  });
}
export function solve(state, ex, puzzleId, choice, tick, seed) {
  const sk = sky(tick, seed), pz = puzzles(tick, seed).find((p) => p.id === puzzleId);
  if (!pz) throw new MysticError('unknown_puzzle');
  const ch = state.charts;
  if (ch.day !== sk.day) { ch.day = sk.day; ch.solved = []; }
  if (ch.solved.includes(puzzleId)) throw new MysticError('already_solved');
  if (ch.solved.length >= MY.chart_daily_max) throw new MysticError('charts_done_today');
  ch.solved.push(puzzleId);
  if (!Number.isInteger(choice) || choice !== pz.answer) return { correct: false, answer: pz.answer, gain: 0, n: ch.n };
  const gain = sk.night && near(ex, SITES.star_dais) ? 2 : 1;
  ch.n += gain;
  return { correct: true, answer: pz.answer, gain, n: ch.n };
}
export function enchant(state, ex, weapon, runeId, weapons) {
  const rune = RUNES[runeId]; if (!rune) throw new MysticError('unknown_rune');
  if (!weapons.includes(weapon) || weapon === 'fists') throw new MysticError('unknown_weapon');
  if (!rune.sites.some((s) => near(ex, SITES[s]))) throw new MysticError('too_far');
  const bag = ex.bag || (ex.bag = {});
  if (Object.entries(rune.cost).some(([k, v]) => (bag[k] || 0) < v)) throw new MysticError('missing_items');
  for (const [k, v] of Object.entries(rune.cost)) bag[k] -= v;
  state.runes[weapon] = runeId;
  return { weapon, rune: runeId, name: rune.name, effect: { ...rune.effect } };
}
export function duelMods(state, tick, seed, weapon, consume = true) {
  const sk = sky(tick, seed), b = state.blessing || null, r = RUNES[state.runes[weapon] ?? ''] || null;
  const mods = merge(sk.effects, b?.effect, r?.effect);
  const sources = [...sk.active, ...(b ? ['blessing:' + b.site] : []), ...(r ? ['rune:' + r.id] : [])];
  if (consume) state.blessing = null;
  return { effects: mods, school: sk.school, sources };
}
export function apply(cfg, m) {
  const e = m.effects;
  const out = { ...cfg, hp: Math.min(999, cfg.hp + e.hp), stamina: cfg.stamina + e.stamina };
  out.loadout = cfg.loadout.map((d) => {
    const bonus = e.special_mult + (d.magic ? e.magic_mult : 0) + (d.magic && d.school === m.school ? 10 : 0);
    return { ...d, mult: fd(d.mult * (100 + bonus), 100), focus: Math.max(10, d.focus - e.focus) };
  });
  out.mystic = { effects: { ...e }, school: m.school, sources: [...m.sources] };
  return out;
}
export const publicPuzzles = (tick, seed) => puzzles(tick, seed).map(({ answer, ...p }) => p);
export function view(state, tick, seed, cycle) {
  const sk = sky(tick, seed), ch = state.charts;
  return { label: MY.label, sky: sk, grand_year: grandYear(cycle), puzzles: publicPuzzles(tick, seed), solved_today: ch.day === sk.day ? [...ch.solved] : [],
    charts: ch.n, blessing: state.blessing, spirits: [...state.spirits], runes: { ...state.runes }, visible: MY.spirits.filter((s) => spiritVisible(s, sk)).map((s) => s.id) };
}
export function card(sk, gy) {
  const sign = SIGNS.find((s) => s.id === sk.sun.sign), act = MY.alignments.filter((a) => sk.active.includes(a.id));
  const st = [{ label: 'FACT', text: 'The Moon goes through its phases about every 29.5 days; today\'s in-game Moon is a ' + sk.moon.name + '.' },
    { label: 'FACT', text: 'Real orbital periods: ' + PLANETS.map((p) => `${p.name} ${p.real_days} days`).join(', ') + ". Strata's sky runs faster (IN-GAME)." },
    { label: 'FACT', text: MY.grand_year.fact.replace('FACT: ', '') },
    { label: 'SSR/CRA THEORY', text: MY.grand_year.theory.replace('SSR/CRA THEORY: ', '') },
    { label: 'MYSTICAL/IN-GAME', text: `The Sun stands in ${sign.name} (${sign.element}); ${MY.elements[sign.element].gift}` },
    { label: 'MYSTICAL/IN-GAME', text: `Strata turns in the ${gy.name}. ` + MY.grand_year.game.replace('MYSTICAL/IN-GAME: ', '') }];
  for (const a of act) st.push({ label: 'MYSTICAL/IN-GAME', text: a.name + ': ' + a.text });
  st.push({ label: 'MYSTICAL/IN-GAME', text: MY.science_note });
  return { title: `Star chart: day ${sk.day}, Sun in ${sign.name}`, statements: st, label: MY.label };
}
