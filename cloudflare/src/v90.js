// Strata: Lux Genesis (OGCE engine v9.0): progression, bounties, story arcs, GCSE Codex, world events,
// adaptive difficulty, teen-safety and the offline Malcolm companion.
// JS port of ogce4/v90/{chronicle,safety,companion}.py, parity-tested against Python fixtures.
import DATA from '../../ogce4/v90/data.json' with { type: 'json' };
export { DATA };
export const LESSONS = Object.fromEntries(DATA.lessons.map((l) => [l.id, l]));
export const STATS = ['moved', 'gathered', 'gathered.wood', 'gathered.stone', 'gathered.crystal', 'defeated', 'crafted',
  'built', 'rested', 'chats', 'faints', 'faints_recent', 'malcolm', 'lab', 'answers', 'correct'];
export const EVENT_TICKS = 12, SEASON_TICKS = 48, PASS_CORRECT = 2;
export class V90Error extends Error {}
const err = (m) => new V90Error(m);

export function fnv(text) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(String(text))) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export const pick = (seed, key, lo, hi) => lo + (fnv(`${seed}:${key}`) % (hi - lo + 1));
const pyRound = (x, n) => Number(x.toFixed(n));

export function newProfile() {
  return { v: 1, stats: Object.fromEntries(STATS.map((k) => [k, 0])), lessons: {}, achievements: {}, renown: 0, insight: 0,
    bounty: null, bounties_done: 0, events_seen: [], quiz: null };
}
export function normalise(profile) {
  const p = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : newProfile();
  for (const [k, v] of Object.entries(newProfile())) if (!(k in p)) p[k] = v;
  for (const k of STATS) if (!(k in p.stats)) p.stats[k] = 0;
  return p;
}
const bump = (p, k, n = 1) => { p.stats[k] = (p.stats[k] ?? 0) + n; };

export function observe(profile, kind, before, after, message = '') {
  const p = normalise(profile); before = before || {}; after = after || {};
  if (kind === 'move' && (before.x !== after.x || before.y !== after.y)) bump(p, 'moved');
  else if (kind === 'gather') {
    for (const r of ['wood', 'stone', 'crystal']) {
      const d = ((after.inventory || {})[r] ?? 0) - ((before.inventory || {})[r] ?? 0);
      if (d > 0) { bump(p, 'gathered', d); bump(p, 'gathered.' + r, d); }
    }
  } else if (kind === 'attack' && String(message).includes('defeated')) bump(p, 'defeated');
  else if (kind === 'craft') bump(p, 'crafted');
  else if (kind === 'build') bump(p, 'built');
  else if (kind === 'rest') bump(p, 'rested');
  else if (kind === 'chat') bump(p, 'chats');
  if (after.x === 2 && after.y === 2 && after.health === 50 && (before.health ?? 100) !== 50 && !(before.x === 2 && before.y === 2)) { bump(p, 'faints'); bump(p, 'faints_recent'); }
  return p;
}
export const lessonsPassed = (p) => Object.keys(p.lessons).filter((k) => p.lessons[k].passed).sort();

export function difficulty(p, level = 1) {
  const s = p.stats; let d = 2 + (level >= 4 ? 1 : 0) + (level >= 8 ? 1 : 0);
  if (s.answers >= 4) { const acc = s.correct / s.answers; d += acc >= 0.8 ? 1 : acc < 0.4 ? -1 : 0; }
  if (s.faints_recent >= 2) d -= 1;
  return Math.max(1, Math.min(5, d));
}
export const DIFFICULTY_NAMES = ['', 'Gentle', 'Steady', 'Bold', 'Daring', 'Heroic'];

export function worldEvent(tick) {
  const cycle = Math.floor(tick / EVENT_TICKS), E = DATA.events;
  const ev = cycle === 0 ? E[0] : E[fnv(`event:${cycle}`) % E.length];
  return { cycle, event: ev, ticks_left: EVENT_TICKS - (tick % EVENT_TICKS), season: DATA.seasons[Math.floor(tick / SEASON_TICKS) % 4] };
}
export function noteEvent(p, tick) { const id = worldEvent(tick).event.id; if (!p.events_seen.includes(id)) p.events_seen.push(id); return p; }

const KINDS = ['gather', 'defeat', 'walk', 'craft', 'rest', 'study', 'lab'];
export function bountyOffers(playerId, tick, diff) {
  const day = Math.floor(tick / EVENT_TICKS), boost = worldEvent(tick).event.boost, offers = [], used = new Set();
  for (let i = 0; i < 3; i++) {
    const seed = `${playerId}:${day}:${i}`;
    let k = KINDS[fnv(seed) % KINDS.length];
    if (used.has(k)) k = KINDS[(KINDS.indexOf(k) + 1 + i) % KINDS.length];
    used.add(k);
    let n, stat, title, bkind;
    if (k === 'gather') { const res = ['wood', 'stone', 'crystal'][pick(seed, 'res', 0, 2)]; n = 3 * (1 + diff); stat = 'gathered.' + res; title = `Collect ${n} ${res}`; bkind = res === 'crystal' ? 'crystal' : 'gather'; }
    else if (k === 'defeat') { n = 1 + Math.floor(diff / 2); stat = 'defeated'; title = `Defeat ${n} creature(s)`; bkind = 'defeat'; }
    else if (k === 'walk') { n = 15 * diff; stat = 'moved'; title = `Explore ${n} squares`; bkind = 'walk'; }
    else if (k === 'craft') { n = 1 + Math.floor(diff / 3); stat = 'crafted'; title = `Craft ${n} item(s)`; bkind = 'craft'; }
    else if (k === 'rest') { n = 1 + Math.floor(diff / 3); stat = 'rested'; title = `Rest by a fire ${n} time(s)`; bkind = 'rest'; }
    else if (k === 'study') { n = 1 + Math.floor(diff / 2); stat = 'correct'; title = `Answer ${n} Codex question(s) correctly`; bkind = 'study'; }
    else { n = 2 + diff; stat = 'lab'; title = `Run ${n} experiments or lab steps`; bkind = 'lab'; }
    const reward = 10 + 6 * diff + 2 * n, doubled = bkind === boost;
    offers.push({ id: `b${day}-${i}`, kind: k, stat, target: n, title, renown: reward * (doubled ? 2 : 1), boosted: doubled });
  }
  return offers;
}
export function acceptBounty(p, playerId, tick, bountyId, diff) {
  const o = bountyOffers(playerId, tick, diff).find((x) => x.id === bountyId);
  if (!o) throw err('bounty_not_offered');
  if (p.bounty && p.bounty.id === bountyId) throw err('bounty_already_active');
  p.bounty = { ...o, baseline: p.stats[o.stat] ?? 0 };
  return p.bounty;
}
export function bountyProgress(p) { const b = p.bounty; if (!b) return 0; return Math.max(0, Math.min(b.target, (p.stats[b.stat] ?? 0) - b.baseline)); }
export function claimBounty(p) {
  const b = p.bounty; if (!b) throw err('no_active_bounty');
  if (bountyProgress(p) < b.target) throw err('bounty_incomplete');
  p.renown += b.renown; p.bounties_done += 1; p.stats.faints_recent = 0; p.bounty = null; return b.renown;
}
export function abandonBounty(p) { if (!p.bounty) throw err('no_active_bounty'); p.bounty = null; }

export function makeQuestion(lessonId, seed, diff) {
  if (!Object.hasOwn(LESSONS, lessonId)) throw err('lesson_not_found');
  const kind = LESSONS[lessonId].quiz, r = (k, lo, hi) => pick(seed, k, lo, hi), trace = DATA.cra_trace;
  let q, a, tol, unit;
  if (kind === 'ke') { const m = r('m', 1, 2 + diff), v = r('v', 2, 3 + 2 * diff); q = `A ${m} kg stone moves at ${v} m/s. What is its kinetic energy?`; a = 0.5 * m * v * v; tol = 0.05; unit = 'J'; }
  else if (kind === 'efficiency') { const total = 100 * r('t', 5, 20), pct = 5 * r('p', 2, 18); q = `A campfire releases ${total} J. ${Math.floor(total * pct / 100)} J heats the stew. What is the efficiency?`; a = pct; tol = 0.5; unit = '%'; }
  else if (kind === 'speed') { const v = r('v', 1, 3 + diff), t = r('t', 2, 10); q = `You walk ${v * t} m in ${t} s. What is your speed?`; a = v; tol = 0.01; unit = 'm/s'; }
  else if (kind === 'expected') { const p = r('p', 1, 5), n = 10 * r('n', 1, 5); q = `Each search finds a crystal with probability 0.${p}. How many crystals do you expect in ${n} searches?`; a = n * p / 10; tol = 0.01; unit = 'crystals'; }
  else if (kind === 'mean') { const k = diff < 3 ? 3 : 5; const vals = Array.from({ length: k }, (_, i) => r(`x${i}`, 2, 20)); q = `Readings: ${vals.join(', ')}. What is the mean? (2 d.p.)`; a = vals.reduce((s, x) => s + x, 0) / k; tol = 0.006; unit = ''; }
  else if (kind === 'uncertainty') { const vals = [0, 1, 2].map((i) => r(`x${i}`, 10, 30)); q = `Readings: ${vals.join(', ')}. What is the uncertainty (half the range)?`; a = (Math.max(...vals) - Math.min(...vals)) / 2; tol = 0.01; unit = ''; }
  else if (kind === 'gibbs') { const t = r('T', 250, 320); q = `Using ΔG = 6.01 − T × 0.0220, find ΔG for melting ice at T = ${t} K (2 d.p.).`; a = pyRound(6.01 - t * 0.022, 4); tol = 0.006; unit = 'kJ/mol'; }
  else if (kind === 'light') { const d = r('d', 2, 18); q = `Light travels at 3.00 × 10⁸ m/s. How long does it take to cross ${d / 2} × 10⁸ m? (2 d.p.)`; a = d / 6; tol = 0.006; unit = 's'; }
  else if (kind === 'zscore') { const s = [10, 20, 30, 50, 100][r('s', 0, 4)]; const delta = r('d', 0, 4 * s) - 2 * s; const n = s * s, k = Math.floor(s * s / 2) + delta; q = `n = ${n} coin flips gave K = ${k} heads. Find z = (2K − n) ÷ √n (2 d.p.).`; a = 2 * delta / s; tol = 0.006; unit = ''; }
  else if (kind === 'growth') { const n0 = r('n', 2, 10), t = r('t', 1, 3 + diff); q = `${n0} creatures double every generation. How many after ${t} generations?`; a = n0 * 2 ** t; tol = 0; unit = 'creatures'; }
  else if (kind === 'hash') { const prev = r('p', 0, 96), x = r('x', 1, 20); q = `Toy diary code: previous code ${prev}, page value ${x}. Work out (${prev} × 31 + ${x}) mod 97.`; a = (prev * 31 + x) % 97; tol = 0; unit = ''; }
  else if (kind === 'chain') { const L = r('L', 2, 5 + diff), names = 'abcdefghijk'; const rules = Array.from({ length: L }, (_, i) => `${names[i + 1]}: ${names[i]}`).join(', '); q = `You know a. Rules: ${rules}. How many facts do you know at the least fixed point?`; a = L + 1; tol = 0; unit = 'facts'; }
  else if (kind === 'trace') { const k = r('k', 1, 9); q = `Read the graph: how many atoms has the CRA model generated after Kleene step ${k}?`; a = trace[k]; tol = 0; unit = 'atoms'; }
  else { const k = r('k', 1, 9); q = `After step ${k} the CRA has ${trace[k]} of its 33 atoms. What percentage is that? (1 d.p.)`; a = pyRound(trace[k] / 33 * 100, 1); tol = 0.06; unit = '%'; }
  return { lesson: lessonId, prompt: q, answer: a, tolerance: tol, unit };
}
export function startQuiz(p, playerId, lessonId, diff) {
  if (!Object.hasOwn(LESSONS, lessonId)) throw err('lesson_not_found');
  const lp = (p.lessons[lessonId] ??= { attempts: 0, correct: 0, passed: false });
  const seed = `${playerId}:${lessonId}:${lp.attempts}`;
  p.quiz = { lesson: lessonId, seed, diff };
  const q = makeQuestion(lessonId, seed, diff);
  return { lesson: lessonId, prompt: q.prompt, unit: q.unit };
}
export function answerQuiz(p, value) {
  const qz = p.quiz; if (!qz) throw err('no_question_open');
  const v = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);
  if (!Number.isFinite(v)) throw err('answer_must_be_a_number');
  const q = makeQuestion(qz.lesson, qz.seed, qz.diff);
  const lp = (p.lessons[qz.lesson] ??= { attempts: 0, correct: 0, passed: false });
  const ok = Math.abs(v - q.answer) <= q.tolerance + 1e-9;
  lp.attempts += 1; bump(p, 'answers'); let newly = false;
  if (ok) { lp.correct += 1; bump(p, 'correct'); p.insight += 10; if (!lp.passed && lp.correct >= PASS_CORRECT) { lp.passed = true; newly = true; p.renown += 15; } }
  p.quiz = null;
  return { correct: ok, answer: q.answer, unit: q.unit, passed: lp.passed, newly_passed: newly, correct_count: lp.correct, needed: PASS_CORRECT };
}

function requirement(p, req, n) {
  const s = p.stats, passed = new Set(lessonsPassed(p));
  if (req.startsWith('lesson:')) return req.slice(7).split('+').every((x) => passed.has(x));
  if (req === 'built+a2') return s.built >= 1 && passed.has('a2');
  return (s[req] ?? 0) >= n;
}
export function arcs(p) {
  return DATA.arcs.map((arc) => {
    let done = 0;
    for (const [, , req, n] of arc.chapters) { if (!requirement(p, req, n)) break; done++; }
    return { id: arc.id, mode: arc.mode, title: arc.title, done, chapters: arc.chapters.map((c, i) => ({ title: c[0], goal: c[1], done: i < done, current: i === done })) };
  });
}
export function metric(p, key, level) {
  if (key === 'level') return level;
  if (key === 'lessons') return lessonsPassed(p).length;
  if (key === 'bounties') return p.bounties_done;
  if (key === 'chapters') return arcs(p).reduce((s, a) => s + a.done, 0);
  if (key === 'events_seen') return p.events_seen.length;
  return p.stats[key] ?? 0;
}
export function unlockAchievements(p, level, tick) {
  const out = [];
  for (const [id, name, , key, n] of DATA.achievements) {
    if (!Object.hasOwn(p.achievements, id) && metric(p, key, level) >= n) { p.achievements[id] = tick; p.renown += 10; out.push({ id, name }); }
  }
  return out;
}
export function rank(renown) {
  let name = DATA.ranks[0][1], next = null;
  DATA.ranks.forEach(([need, title], i) => { if (renown >= need) { name = title; next = i + 1 < DATA.ranks.length ? DATA.ranks[i + 1][0] : null; } });
  return { title: name, next_at: next };
}
export function view(profile, playerId, level, tick) {
  const p = normalise(profile), diff = difficulty(p, level), b = p.bounty;
  return {
    rank: rank(p.renown), renown: p.renown, insight: p.insight, difficulty: { level: diff, name: DIFFICULTY_NAMES[diff] },
    world: worldEvent(tick), offers: bountyOffers(playerId, tick, diff),
    bounty: b ? { id: b.id, title: b.title, target: b.target, renown: b.renown, kind: b.kind, progress: bountyProgress(p) } : null,
    bounties_done: p.bounties_done, arcs: arcs(p),
    achievements: DATA.achievements.map((a) => ({ id: a[0], name: a[1], desc: a[2], unlocked: Object.hasOwn(p.achievements, a[0]), progress: Math.min(a[4], metric(p, a[3], level)), need: a[4] })),
    lessons: { ...p.lessons }, stats: { ...p.stats }, events_seen: [...p.events_seen],
  };
}

// ---------- safety (port of ogce4/v90/safety.py) ----------
export const PATTERNS = [
  ['self_harm', String.raw`\b(suicid\w*|kill(ing)? myself|end(ing)? my life|self[- ]?harm\w*|hurt(ing)? myself|cut(ting)? myself|want to die|don'?t want to (live|be alive))\b`],
  ['sexual', String.raw`\b(sex|sexy|sexual|porn\w*|nudes?|naked|nsfw|horny|onlyfans|hentai|strip(ping|per))\b`],
  ['violence', String.raw`\b(make|build|making|building) (a |an )?(bomb|explosive|weapon|gun)s?\b|\bhow (to|do i|can i) (kill|hurt|stab|shoot|poison) (a |my )?(person|people|someone|somebody|him|her|them|teacher|parent|mum|dad|brother|sister|friend|classmate)\b|\b(school shooting|terroris\w+|mass shooting)\b`],
  ['drugs', String.raw`\b(cocaine|heroin|meth|mdma|ecstasy|lsd|ketamine|weed|cannabis|marijuana|get(ting)? high|vap(e|ing)|buy drugs|alcohol|get drunk)\b`],
  ['hate', String.raw`\b(nazi\w*|heil hitler|white power|kill all \w+|(hate|gas) (the )?(jews|muslims|blacks|gays|trans people|immigrants))\b`],
  ['grooming', String.raw`\b(where do you live|what school do you go|send (me )?(a )?(photo|pic|picture|selfie)s?|meet (up|me) (irl|in real life|in person)|keep (this|it) (a )?secret|your address|home address)\b`],
  ['injection', String.raw`\b(ignore (all |any )?(previous|prior|above|your) (instructions|rules|prompt)|system prompt|developer mode|jailbreak|pretend (you are|to be) (not|un)\w*|reveal (your )?(token|secret|key)s?)\b`],
];
const COMPILED = PATTERNS.map(([n, p]) => [n, new RegExp(p, 'i')]);
const PII = [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, /(\+44\s?7\d{3}|\b07\d{3})\s?\d{3}\s?\d{3}\b/g, /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi, /\b\d(?:[ -]?\d){9,}\b/g];
const SUPPORT = "It sounds like things might be really hard right now, and I'm glad you said something. " +
  "I'm a game companion, so please talk to someone who can properly help: a trusted adult, " +
  'Childline on 0800 1111 (free, any time, childline.org.uk) or Samaritans on 116 123. ' +
  'If you are in danger right now, call 999.';
export const REPLIES = {
  self_harm: SUPPORT,
  sexual: "That's not something I can talk about here. Let's keep Aurelia friendly for everyone. Want a tip for your next quest instead?",
  violence: "I can't help with anything that could hurt real people. In the game I'm happy to help you beat a moss wolf, though!",
  drugs: "I can't help with that topic. If you have worries about drugs or alcohol, Talk to FRANK (0300 123 6600) or a trusted adult can help. Back to the adventure?",
  hate: "Aurelia is for everyone, so I won't join in with that. Let's get back to exploring.",
  grooming: "Never share where you live, your school, photos or other personal details with anyone online, and that includes me. If someone online asks, tell a trusted adult.",
  injection: "Nice try! My rules stay the same. Ask me about the game, the science or Oliver's SSR and CRA ideas instead.",
  pii: "I removed some personal details from your message to keep you safe. Please don't share emails, phone numbers or addresses here.",
  unsafe_output: "Hmm, I can't put that answer into words safely. Try asking me in a different way?",
};
export function classify(text) { const t = String(text ?? ''); for (const [n, rx] of COMPILED) if (rx.test(t)) return n; return null; }
export function redactPii(text) {
  let t = String(text ?? ''), found = false;
  for (const rx of PII) t = t.replace(rx, () => { found = true; return '[removed]'; });
  return [t, found];
}
export const safeReply = (c) => REPLIES[c] ?? REPLIES.unsafe_output;
export function checkChat(message) {
  const cat = classify(message);
  if (cat && cat !== 'injection') return { ok: false, category: cat, message: null };
  const [text, found] = redactPii(message);
  return { ok: true, category: found ? 'pii' : null, message: text };
}

// ---------- offline companion (port of ogce4/v90/companion.py) ----------
const TOPICS = [
  [['ssr', 'stratified', 'source realism', 'strata', 'stratum'], 'l4'],
  [['cra', 'chronological', 'realignment', '33 atoms', 'atom'], 'l5'],
  [['fixed point', 'kleene', 'if-then', 'rule', 'lattice'], 'l3'],
  [['hash', 'diary', 'ledger', 'tamper'], 'l2'],
  [['population', 'doubling', 'exponential', 'creature', 'grow'], 'l1'],
  [['coin', '144,000', '144000', 'intention', 'z-score', 'zscore', 'significan', 'probability of heads'], 's5'],
  [['light', 'metre', 'meter', '299'], 's4'],
  [['gibbs', 'melt', 'ice', 'entropy'], 's3'],
  [['uncertain', 'error bar', 'half the range'], 's2'],
  [['mean', 'average', 'range', 'fair test', 'variable'], 's1'],
  [['probabilit', 'chance', 'expected', 'loot'], 'a4'],
  [['speed', 'distance', 'fast'], 'a3'],
  [['efficien', 'campfire', 'fire'], 'a2'],
  [['kinetic', 'energy', 'joule'], 'a1'],
];
export const HELP = [
  [['move', 'walk', 'control', 'keys'], 'Walk with W A S D or the arrow keys, or tap the ground. Drag to turn the camera and scroll or pinch to zoom.'],
  [['health', 'hurt', 'heal', 'potion', 'faint'], 'Low on health? Rest by a campfire (R) or drink a potion (Q). Make potions from 2 crystals (P).'],
  [['craft', 'sword', 'sabre', 'weapon'], 'Better weapons hit harder: Stone Sword (5 stone + 2 wood) deals 18 and Crystal Sabre (5 crystal + 3 stone + 2 wood) deals 27.'],
  [['bount', 'renown', 'rank'], "Bounties on the Journal's board change every in-game day. Finish them for renown and climb the strata from Wanderer to Genesis Archon."],
  [['quest', 'story', 'chapter', 'arc'], "Open the Journal (J) to see your three story arcs, one stratum for each mode. Each chapter tells you exactly what to do next."],
  [['codex', 'lesson', 'quiz', 'learn'], 'Open the Codex (K). Each lesson has an equation, a worked example and a graph. Answer two questions correctly to pass.'],
  [['spell', 'magic', 'wizard'], 'Spells in the Magic & Science tab are make-believe, part of the story. The science lab uses the real method: guess, test, repeat.'],
];
const NAMES = ['Ærwyn', 'Tamsin', 'Corvid', 'Ilse', 'Bram', 'Nell', 'Oriel', 'Pip'];
const PLACES = ['the Whispering Ford', 'Crystal Hollow', 'the Old Lantern Road', 'Mossback Ridge', 'the Glass Marsh', 'Ember Camp'];
const HOOKS = ['lost a lantern that still glows', 'found strange tracks in the moss', 'needs help testing an idea twice',
  'heard the crystals hum at night', 'is mapping how far the wolves roam', 'is counting creatures in the Life Lab'];
const lessonText = (id) => { const l = LESSONS[id]; return `[${l.grade}] ${l.title}: ${l.body[0]} Equation: ${l.equation} (${l.units}). Example: ${l.example}`; };
export function offlineReply(mode, message, context = {}) {
  context = context || {};
  const [text] = redactPii(message); const cat = classify(text);
  if (cat) return { text: safeReply(cat), source: 'offline', safety: cat };
  const low = text.toLowerCase(); const tick = parseInt(context.tick ?? 0, 10) || 0;
  if (mode === 'lore') {
    const seed = fnv(`${context.player ?? ''}:${context.tick ?? 0}:${low}`); const ev = worldEvent(tick).event;
    const who = NAMES[seed % NAMES.length], where = PLACES[(seed >>> 3) % PLACES.length], hook = HOOKS[(seed >>> 6) % HOOKS.length];
    return { text: `${ev.icon} During the ${ev.name}, ${who} at ${where} ${hook}. "Help me, traveller, and Aurelia will remember your name." (Story text: make-believe.)`, source: 'offline', safety: null };
  }
  for (const [keys, id] of TOPICS) if (keys.some((k) => low.includes(k))) return { text: lessonText(id) + (id === 'l4' || id === 'l5' ? " Remember: SSR and CRA are Oliver's theory, not established science." : ''), source: 'offline', safety: null, lesson: id };
  for (const [keys, tip] of HELP) if (keys.some((k) => low.includes(k))) return { text: tip, source: 'offline', safety: null };
  const hp = context.health, mh = context.max_health;
  if (Number.isInteger(hp) && Number.isInteger(mh) && mh && hp * 3 < mh) return { text: 'Your health is low. Head to a campfire and rest (R), or drink a potion (Q) before your next fight.', source: 'offline', safety: null };
  const ev = worldEvent(tick).event;
  return { text: `I'm Malcolm, your guide through the Strata (offline right now). ${ev.icon} ${ev.text} Ask me about controls, bounties, the Codex, or Oliver's SSR and CRA ideas.`, source: 'offline', safety: null };
}
