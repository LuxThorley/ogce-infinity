// Strata voice control: a deterministic local grammar (same words → same actions) and a strict action whitelist.
// Shared by the browser, the Worker (to validate Malcolm's structured replies) and the tests. Only text is handled:
// no audio is ever recorded, stored or sent.
const NUM = { one: 1, a: 1, an: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const DIRS = { north: 'north', up: 'north', forward: 'forward', forwards: 'forward', ahead: 'forward', south: 'south', down: 'south', back: 'back', backward: 'back', backwards: 'back',
  east: 'east', right: 'right', west: 'west', left: 'left' };
export const PANELS = ['journal', 'codex', 'malcolm', 'expedition', 'help', 'settings', 'map', 'quests', 'bag', 'workshop', 'wildlife', 'people', 'character', 'progress', 'combat'];
export const MODES = ['adventure', 'academy', 'lifelab'];
export const RECIPES = ['healing_potion', 'stone_edge', 'crystal_sabre', 'rope', 'torch', 'axe', 'pickaxe', 'field_net', 'sling', 'lux_staff', 'herbal_tea'];
export const BUILDS = ['campfire', 'shelter', 'sapling', 'cairn', 'lantern'];
export const SETTINGS = { quality: ['auto', 'low', 'medium', 'high', 'ultra'], sound: ['on', 'off'], labels: ['on', 'off'], tips: ['on', 'off'], voice_replies: ['on', 'off'], wake_word: ['on', 'off'], joystick: ['on', 'off'] };
export const CAMERA = ['reset', 'zoom_in', 'zoom_out', 'left', 'right', 'up', 'down', 'from_above', 'ground', 'overview', 'shoulder', 'recenter', 'first', 'third', 'toggle', 'swap_shoulder'];
export const COMBAT = ['light', 'heavy', 'block', 'dodge', 'special1', 'special2', 'flee', 'practice'];
export const NPCS = ['ariel', 'beatrice', 'bram', 'caliban', 'cleopatra', 'falstaff', 'ghost', 'hal', 'hamlet', 'iago', 'ilsa', 'ladymacbeth', 'lear', 'oberon', 'oru', 'poet', 'prospero', 'puck', 'rook', 'shylock', 'titania', 'viola', 'weird_sisters'];
export const REALMS = ['aurelia', 'verdant', 'ember', 'frostveil', 'luxfall'];
export const DESTRUCTIVE = new Set(['abandon_bounty', 'sign_out', 'reset_settings', 'new_genesis']);
export const ACTION_TYPES = ['move', 'gather', 'attack', 'rest', 'wait', 'drink', 'craft', 'build', 'open', 'close', 'mode', 'camera', 'setting', 'help', 'say', 'ask',
  'accept_bounty', 'claim_bounty', 'abandon_bounty', 'travel', 'talk', 'customise', 'invent', 'sign_out', 'reset_settings', 'repeat', 'stop', 'combat', 'new_genesis'];
const MAX_ACTIONS = 5;

const clean = (t) => String(t ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const num = (w) => (w == null ? null : /^\d+$/.test(w) ? Math.min(10, Math.max(1, +w)) : NUM[w] ?? null);
const snake = (s) => s.trim().replace(/\s+/g, '_');
const ALIAS = {
  recipe: { potion: 'healing_potion', 'healing potion': 'healing_potion', 'health potion': 'healing_potion', 'stone edge': 'stone_edge', 'stone sword': 'stone_edge', 'stone blade': 'stone_edge',
    'crystal sabre': 'crystal_sabre', 'crystal saber': 'crystal_sabre', 'crystal sword': 'crystal_sabre', 'field net': 'field_net', net: 'field_net', 'lux staff': 'lux_staff', staff: 'lux_staff', tea: 'herbal_tea', 'herbal tea': 'herbal_tea', 'pick axe': 'pickaxe' },
  panel: { genesis: 'progress', strata: 'progress', objectives: 'progress', goals: 'progress', 'my progress': 'progress', skills: 'combat', moves: 'combat', 'special moves': 'combat', 'combat skills': 'combat', fighting: 'combat', inventory: 'bag', backpack: 'bag', items: 'bag', controls: 'help', options: 'settings', menu: 'settings', lessons: 'codex', science: 'codex', story: 'journal', achievements: 'journal', bounties: 'journal',
    guide: 'malcolm', chat: 'malcolm', world: 'expedition', explore: 'expedition', omniverse: 'expedition', minimap: 'map', inventions: 'workshop', invent: 'workshop', animals: 'wildlife', creatures: 'wildlife', ecology: 'wildlife', npcs: 'people', factions: 'people', appearance: 'character', me: 'character', quest: 'quests' },
  mode: { adventure: 'adventure', explore: 'adventure', academy: 'academy', science: 'academy', magic: 'academy', 'magic and science': 'academy', lab: 'lifelab', 'life lab': 'lifelab', lifelab: 'lifelab', 'tiny life lab': 'lifelab' },
  quality: { automatic: 'auto', auto: 'auto', low: 'low', fast: 'low', medium: 'medium', high: 'high', ultra: 'ultra', best: 'ultra', maximum: 'ultra', max: 'ultra' },
  realm: { aurelia: 'aurelia', home: 'aurelia', verdant: 'verdant', 'verdant deep': 'verdant', ember: 'ember', 'ember reach': 'ember', frostveil: 'frostveil', frost: 'frostveil', luxfall: 'luxfall', 'lux fall': 'luxfall' },
  npc: { 'prospero': 'prospero', 'oberon': 'oberon', 'titania': 'titania', 'weird sisters': 'weird_sisters', 'the weird sisters': 'weird_sisters', 'witches': 'weird_sisters', 'ghost': 'ghost', 'the ghost': 'ghost', "hamlet's ghost": 'ghost', 'old hamlet': 'ghost', 'ariel': 'ariel', 'autolycus': 'rook', 'beatrice': 'beatrice', 'bottom': 'bram', 'bram': 'bram', 'bram the builder': 'bram', 'caliban': 'caliban', 'cleopatra': 'cleopatra', 'elder oru': 'oru', 'elsa': 'ilsa', 'falstaff': 'falstaff', 'goodfellow': 'puck', 'hal': 'hal', 'hamlet': 'hamlet', 'henry': 'hal', 'iago': 'iago', 'ilsa': 'ilsa', 'jack': 'falstaff', 'king lear': 'lear', 'lady mac': 'ladymacbeth', 'lady macbeth': 'ladymacbeth', 'ladymacbeth': 'ladymacbeth', 'lear': 'lear', 'macbeth': 'ladymacbeth', 'old king lear': 'lear', 'oru': 'oru', 'poet': 'poet', 'prince hal': 'hal', 'prince hamlet': 'hamlet', 'puck': 'puck', 'queen cleopatra': 'cleopatra', 'rook': 'rook', 'rook the drifter': 'rook', 'rook the rover': 'rook', 'rosalind': 'ilsa', 'sage oru': 'oru', 'shylock': 'shylock', 'sir john': 'falstaff', 'sir john falstaff': 'falstaff', 'sonneteer': 'poet', 'sonnets': 'poet', 'the poet': 'poet', 'the sonneteer': 'poet', 'tinker bram': 'bram', 'viola': 'viola', 'warden ilsa': 'ilsa' },
};
const strip = (s) => s.replace(/^(the|a|an|some|my|me|us)\s+/, '').replace(/\s+(please|now|thanks|thank you)$/, '').trim();
const lookup = (table, s) => { s = strip(s); return table[s] ?? (table[s.replace(/s$/, '')] ?? null); };

/** Parse one utterance into a list of whitelisted actions, or null if the local grammar does not understand it. */
export function parseCommand(text) {
  let t = clean(text).replace(/^(hey |ok |okay )?(malcolm|strata)\b\s*/, '').replace(/^(please |can you |could you |i want to |lets |let us )+/, '').trim();
  if (!t) return null;
  const parts = t.split(/\s+(?:and then|then|and)\s+/).slice(0, MAX_ACTIONS);
  const out = [];
  for (const p of parts) { const a = parseOne(strip(p)); if (!a) return out.length && parts.length > 1 ? null : null; out.push(a); }
  return out.length ? out : null;
}
function parseOne(t) {
  let m;
  if (/^(stop|cancel|never mind|nevermind)$/.test(t)) return { type: 'stop' };
  if (/^(repeat|say that again|again)$/.test(t)) return { type: 'repeat' };
  if (/^(help|what can i say|commands|voice help|what are the commands)$/.test(t)) return { type: 'help' };
  if ((m = t.match(/^(?:go|walk|move|run|step|head)(?: (\w+))? (north|south|east|west|up|down|left|right|forwards?|ahead|backwards?|back)(?: (\w+))?(?: (?:steps?|squares?|times?|tiles?))?$/))) {
    return { type: 'move', dir: DIRS[m[2]], steps: num(m[3]) ?? num(m[1]) ?? 1 };
  }
  if ((m = t.match(/^(north|south|east|west|forwards?|backwards?|left|right)(?: (\w+))?$/))) return { type: 'move', dir: DIRS[m[1]], steps: num(m[2]) ?? 1 };
  if (/^(gather|collect|pick up|pick|harvest|mine|chop|grab|take)( (the |some |that |this )?(it|this|that|resources?|wood|stone|rock|crystals?|berries|tree|flowers?))?$/.test(t)) return { type: 'gather' };
  if (/^(attack|fight|hit|defend|strike)( (it|them|that|the wolf|wolf|enemy|the enemy))?$/.test(t)) return { type: 'attack' };
  if (/^(rest|sleep|heal|sit by the fire|rest by the fire)$/.test(t)) return { type: 'rest' };
  if (/^(wait|pass time|let time pass|skip time|next day)$/.test(t)) return { type: 'wait' };
  if (/^(drink|use|quaff)( (a|the|my))? potion$/.test(t)) return { type: 'drink' };
  if ((m = t.match(/^(?:craft|make|brew|create|forge) (.+)$/))) { const r = lookup(ALIAS.recipe, m[1]) ?? (RECIPES.includes(snake(strip(m[1]))) ? snake(strip(m[1])) : null); if (r) return { type: 'craft', recipe: r }; }
  if ((m = t.match(/^(?:build|place|put down|set up|light) (.+)$/))) { const b = strip(m[1]).replace(/^(fire|camp fire)$/, 'campfire').replace(/^tent$/, 'shelter'); if (BUILDS.includes(b)) return { type: 'build', recipe: b }; }
  if ((m = t.match(/^(?:open|show|show me|go to|view|display) (.+?)(?: panel| tab| page| screen| menu)?$/))) { const s = strip(m[1]); const p = PANELS.includes(s) ? s : lookup(ALIAS.panel, s); if (p) return { type: 'open', panel: p }; }
  if (/^(close|close it|close this|close all|hide|back|exit|go back|close (the )?(panel|menu|window|map))$/.test(t)) return { type: 'close' };
  if ((m = t.match(/^(?:switch to |change to |go to |open |enter )?(.+?) mode$/)) || (m = t.match(/^(?:switch|change) to (.+)$/))) { const md = lookup(ALIAS.mode, m[1]); if (md) return { type: 'mode', mode: md }; }
  if (/^(reset|centre|center) (the )?camera$|^(camera|view) reset$/.test(t)) return { type: 'camera', op: 'reset' };
  if (/^(recentre|recenter|re centre|re center)( (the )?camera)?$|^(camera|look) behind( me)?$|^(put the )?camera behind me$/.test(t)) return { type: 'camera', op: 'recenter' };
  if (/^(look|view|camera|see) from above$|^(top down|bird s eye|birds eye|aerial)( view)?$|^look down from above$/.test(t)) return { type: 'camera', op: 'from_above' };
  if (/^(ground level|low angle|look from the ground|worm s eye|worms eye)( view)?$/.test(t)) return { type: 'camera', op: 'ground' };
  if (/^(overview|wide view|zoom (all the way|right) out|show (me )?everything)$/.test(t)) return { type: 'camera', op: 'overview' };
  if (/^(over the shoulder|shoulder view|close up|close view)$/.test(t)) return { type: 'camera', op: 'shoulder' };
  if (/^(swap|switch|change|other) shoulder$/.test(t)) return { type: 'camera', op: 'swap_shoulder' };
  if (/^(first person|first person view|first person mode|fps|my eyes|through my eyes)$/.test(t)) return { type: 'camera', op: 'first' };
  if (/^(third person|third person view|third person mode|behind view)$/.test(t)) return { type: 'camera', op: 'third' };
  if (/^(switch|toggle|change) (the )?(view|camera|perspective)$/.test(t)) return { type: 'camera', op: 'toggle' };
  if (/^(light attack|quick attack|slash|jab)$/.test(t)) return { type: 'combat', op: 'light' };
  if (/^(heavy attack|power attack|strong attack|smash)$/.test(t)) return { type: 'combat', op: 'heavy' };
  if (/^(block|guard|shield|parry)$/.test(t)) return { type: 'combat', op: 'block' };
  if (/^(dodge|roll|evade|dodge roll)$/.test(t)) return { type: 'combat', op: 'dodge' };
  if (/^(special|special move|special one|special 1|first special)$/.test(t)) return { type: 'combat', op: 'special1' };
  if (/^(special two|special 2|second special)$/.test(t)) return { type: 'combat', op: 'special2' };
  if (/^(flee|run away|retreat|escape|leave the fight)$/.test(t)) return { type: 'combat', op: 'flee' };
  if (/^(practice|practise|spar|sparring|training|train)( (fight|duel|match))?$/.test(t)) return { type: 'combat', op: 'practice' };
  if (/^(new genesis|start (a )?new genesis|begin (a )?new genesis)$/.test(t)) return { type: 'new_genesis' };
  if ((m = t.match(/^zoom (in|out)$/))) return { type: 'camera', op: m[1] === 'in' ? 'zoom_in' : 'zoom_out' };
  if ((m = t.match(/^(?:turn|rotate|look|pan) (?:the )?(?:camera |view )?(left|right|up|down)$/))) return { type: 'camera', op: m[1] };
  if ((m = t.match(/^(?:set |change |turn )?(?:graphics|quality|graphics quality)(?: to)? (\w+)$/)) || (m = t.match(/^(\w+) (?:graphics|quality)$/))) { const q = ALIAS.quality[m[1]]; if (q) return { type: 'setting', name: 'quality', value: q }; }
  if ((m = t.match(/^(?:turn |switch )?(?:the )?(sound|music|audio|labels|name labels|tips|hints|voice replies|spoken replies|speech|wake word|joystick)(?: to)? (on|off)$/)) || (m = t.match(/^(?:turn |switch )(on|off) (?:the )?(sound|music|audio|labels|name labels|tips|hints|voice replies|spoken replies|speech|wake word|joystick)$/))) {
    const [a, b] = m[1] === 'on' || m[1] === 'off' ? [m[2], m[1]] : [m[1], m[2]];
    const name = { sound: 'sound', music: 'sound', audio: 'sound', labels: 'labels', 'name labels': 'labels', tips: 'tips', hints: 'tips', 'voice replies': 'voice_replies', 'spoken replies': 'voice_replies', speech: 'voice_replies', 'wake word': 'wake_word', joystick: 'joystick' }[a];
    return { type: 'setting', name, value: b };
  }
  if (/^(mute|be quiet|silence)$/.test(t)) return { type: 'setting', name: 'sound', value: 'off' };
  if (/^(unmute)$/.test(t)) return { type: 'setting', name: 'sound', value: 'on' };
  if ((m = t.match(/^(accept|take|claim|abandon|drop|cancel) (?:the |a |my )?bounty$/))) return { type: { accept: 'accept_bounty', take: 'accept_bounty', claim: 'claim_bounty', abandon: 'abandon_bounty', drop: 'abandon_bounty', cancel: 'abandon_bounty' }[m[1]] };
  if ((m = t.match(/^(?:travel|go|teleport|journey) to (.+)$/))) { const r = lookup(ALIAS.realm, m[1]); if (r) return { type: 'travel', realm: r }; }
  if ((m = t.match(/^(?:talk|speak|chat) (?:to|with) (.+)$/))) { const n = lookup(ALIAS.npc, m[1]); if (n) return { type: 'talk', npc: n }; }
  if ((m = t.match(/^(?:say|shout|tell everyone) (.{1,200})$/))) return { type: 'say', message: m[1] };
  if (/^(sign out|log out|logout|signout)$/.test(t)) return { type: 'sign_out' };
  if (/^reset (all )?settings$/.test(t)) return { type: 'reset_settings' };
  return null;
}

const isStr = (v, max) => typeof v === 'string' && v.trim().length > 0 && [...v].length <= max;
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const only = (a, keys) => Object.keys(a).every((k) => k === 'type' || keys.includes(k));
/** Validate an action list (from the grammar or from Malcolm). Returns { ok, actions, rejected } — unknown or malformed actions are dropped. */
export function validateActions(list) {
  const actions = [], rejected = [];
  if (!Array.isArray(list)) return { ok: false, actions, rejected: ['not_a_list'] };
  for (const a of list.slice(0, MAX_ACTIONS)) {
    const why = checkAction(a);
    if (why) rejected.push(why); else actions.push({ ...a, ...(DESTRUCTIVE.has(a.type) ? { confirm: true } : {}) });
  }
  if (list.length > MAX_ACTIONS) rejected.push('too_many_actions');
  return { ok: rejected.length === 0 && actions.length > 0, actions, rejected };
}
function checkAction(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a) || !ACTION_TYPES.includes(a.type)) return 'unknown_action';
  const ok = (cond, keys = []) => (cond && only(a, [...keys, 'confirm']) ? null : `bad_${a.type}`);
  switch (a.type) {
    case 'move': return ok(['north', 'south', 'east', 'west', 'forward', 'back', 'left', 'right'].includes(a.dir) && isInt(a.steps, 1, 10), ['dir', 'steps']);
    case 'craft': return ok(RECIPES.includes(a.recipe), ['recipe']);
    case 'build': return ok(BUILDS.includes(a.recipe), ['recipe']);
    case 'open': return ok(PANELS.includes(a.panel), ['panel']);
    case 'mode': return ok(MODES.includes(a.mode), ['mode']);
    case 'camera': return ok(CAMERA.includes(a.op), ['op']);
    case 'combat': return ok(COMBAT.includes(a.op), ['op']);
    case 'setting': return ok(Object.hasOwn(SETTINGS, a.name) && SETTINGS[a.name]?.includes(a.value), ['name', 'value']);
    case 'say': return ok(isStr(a.message, 200), ['message']);
    case 'ask': return ok(['guide', 'explain', 'lore'].includes(a.mode) && isStr(a.message, 400), ['mode', 'message']);
    case 'travel': return ok(REALMS.includes(a.realm) || /^c\d{1,6}$/.test(a.realm ?? ''), ['realm']);
    case 'talk': return ok(NPCS.includes(a.npc) && (a.message === undefined || isStr(a.message, 300)), ['npc', 'message']);
    case 'customise': {
      const ap = a.appearance, lim = { skin: 6, hair: 8, outfit: 8, hat: 5, cape: 4 };
      return ok(ap && typeof ap === 'object' && !Array.isArray(ap) && Object.keys(ap).length > 0 && Object.entries(ap).every(([k, v]) => Object.hasOwn(lim, k) && isInt(v, 0, lim[k] - 1)), ['appearance']);
    }
    case 'invent': {
      const pr = a.principles, mt = a.materials;
      return ok(['scientific', 'technological', 'mystical'].includes(a.category) && ['tool', 'ability', 'structure', 'effect', 'ritual'].includes(a.form)
        && Array.isArray(pr) && pr.length >= 1 && pr.length <= 2 && pr.every((p) => typeof p === 'string' && /^[a-z_]{2,24}$/.test(p))
        && mt && typeof mt === 'object' && !Array.isArray(mt) && Object.keys(mt).length >= 1 && Object.keys(mt).length <= 3 && Object.entries(mt).every(([k, v]) => /^[a-z_]{2,16}$/.test(k) && isInt(v, 1, 5))
        && (a.observation === undefined || a.observation === null || ['mossback', 'duskwolf', 'glowmoth'].includes(a.observation)), ['category', 'form', 'principles', 'materials', 'observation']);
    }
    default: return ok(true);
  }
}
export const VOICE_HELP = [
  ['Move', '“go north 3”, “walk forward”, “left two”'], ['Act', '“collect”, “attack”, “rest”, “wait”, “drink potion”'], ['Craft & build', '“craft healing potion”, “make an axe”, “build campfire”, “build a shelter”'],
  ['Panels', '“open journal / codex / map / expedition / settings / bag”, “close”'], ['Modes', '“adventure mode”, “academy mode”, “life lab mode”'], ['Camera', '“zoom out”, “look from above”, “ground level”, “over the shoulder”, “recenter”, “first person”, “third person”, “reset camera”'], ['Combat', '“practice”, “light attack”, “heavy attack”, “block”, “dodge”, “special move”, “flee”'], ['Progress', '“open progress”, “open combat skills”, “new genesis”'],
  ['Settings', '“graphics ultra”, “sound off”, “voice replies on”, “wake word on”'], ['People & worlds', '“talk to Iago”, “speak with Lady Macbeth”, “travel to Frostveil”, “accept bounty”'],
  ['Anything else', '“make me a scientific tool from the lever and two wood”, “give me a wizard hat”: Malcolm turns it into safe game actions.'],
];
