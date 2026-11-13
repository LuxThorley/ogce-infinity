// Plain-English wording for Strata: Lux Genesis (v9.0, OGCE engine). Written for curious players aged about 11 and up.
// Pure data + functions so it can be unit-tested in Node and used in the browser.

export const RESOURCE = { crystal: 'crystal', wood: 'wood', stone: 'stone' };
export const ITEM_ICON = { crystal: '💎', wood: '🪵', stone: '🪨', potion: '🧪' };
export const WEAPON = { traveller_blade: 'Traveller’s Blade', stone_edge: 'Stone Sword', crystal_sabre: 'Crystal Sabre' };
export const RECIPE = { healing_potion: 'healing potion', stone_edge: 'Stone Sword', crystal_sabre: 'Crystal Sabre', campfire: 'campfire', shelter: 'shelter' };
export const QUEST = {
  frontier_hunt: { title: 'Wolf Watch', goal: 'Defeat 2 Moss Wolves', reward: '+80 XP and 2 crystals' },
  gatherer_path: { title: 'The Collector', goal: 'Collect 6 things (wood, stone or crystal)', reward: '+50 XP and 3 wood' },
};

export const SPELL = {
  ember_bolt: { name: 'Ember Bolt', what: 'Shoots a spark of pretend fire.', cost: 8 },
  verdant_mend: { name: 'Leafy Heal', what: 'Pretend nature magic that gives back a little health.', cost: 10 },
  aegis_ward: { name: 'Shield Charm', what: 'A pretend magic shield that also heals a bit.', cost: 12 },
  star_sight: { name: 'Star Sight', what: 'Shows a make-believe message from the stars.', cost: 7 },
  rune_spark: { name: 'Rune Spark', what: 'Pretend magic that makes an enchanted shard for your bag.', cost: 9 },
};
export const PATH = {
  arcane: { name: 'Wizard', what: 'Starts with spells. Great at make-believe magic.' },
  scientific: { name: 'Scientist', what: 'Starts with no spells but is great at experiments.' },
  hybrid: { name: 'Wizard-Scientist', what: 'A bit of both — a good first choice.' },
};
export const SIGNS = ['Dawn', 'Ember', 'Tide', 'Grove', 'Stone', 'Gale', 'Crown', 'Veil', 'Lantern', 'Comet', 'Hearth', 'Horizon'];
export const SCIENCE = {
  physics: 'Physics — how things move, push and glow',
  chemistry: 'Chemistry — mixing things to see what changes',
  biology: 'Biology — plants, animals and living things',
  astronomy: 'Astronomy — stars, moons and planets',
  ecology: 'Ecology — how living things share a home',
  archaeology: 'Archaeology — digging up clues from the past',
};
export const SKILL = {
  engineering: 'Engineering — building machines', materials: 'Materials — what things are made of',
  energy: 'Energy — power and movement', computing: 'Computing — thinking machines',
  automation: 'Automation — machines that work by themselves', transport: 'Transport — carts, boats and roads',
  elementalism: 'Elements (make-believe)', restoration: 'Healing (make-believe)', warding: 'Shields (make-believe)',
  enchantment: 'Enchanting (make-believe)', naturecraft: 'Nature magic (make-believe)', astralism: 'Star magic (make-believe)',
  physics: 'Physics', chemistry: 'Chemistry', biology: 'Biology', astronomy: 'Astronomy', ecology: 'Ecology', archaeology: 'Archaeology',
};
export const TECH = {
  windmill: { name: 'Windmill', what: 'Turns wind into power for your town.' },
  crystal_lens: { name: 'Crystal Lens', what: 'Helps your scientists see tiny details.' },
  star_charting: { name: 'Star Maps', what: 'Maps of the night sky that teach your town.' },
  field_medicine: { name: 'First Aid Kit', what: 'Better ways to look after hurt explorers.' },
  automata: { name: 'Clockwork Helpers', what: 'Little machines that do jobs by themselves.' },
  aether_dynamo: { name: 'Crystal Power Plant', what: 'A big generator powered by crystals.' },
  living_architecture: { name: 'Living Houses', what: 'Homes grown from plants that keep everyone happy.' },
  celestial_engine: { name: 'Sky Engine', what: 'The greatest machine of all — needs lots of other inventions first.' },
};
export const TOWN = { energy: '⚡ Power', research: '🔬 Discoveries in progress', knowledge: '📚 Knowledge', industry: '🏭 Making things', harmony: '💚 Happiness', health: '❤️ Health' };
export const RESEARCH_STATUS = {
  proposed: 'Idea written down — now test it!',
  observing: 'Collecting results — repeat the test to check it.',
  supported_in_simulation: 'Supported! You got the same result twice ✔',
  inconclusive: 'The results didn’t match — change your idea and try again.',
};
export const GRADE = {
  FACT: 'Proven — there is strong evidence',
  INFERENCE: 'Worked out from other facts',
  SPECULATION: 'A guess',
  BELIEF: 'Something people believe',
  'SSR INTERPRETATION': 'One way of looking at it',
  'OPEN CONJECTURE': 'Not proven yet — still a mystery',
};
export const GRADE_FLAG = {
  medical_advice: 'sounds like medical advice (ask a real doctor!)',
  future_prediction: 'claims to know the future for certain',
  supernatural_efficacy: 'claims real magic works',
  source_communication_claim: 'claims a message from a higher power',
};

const ERRORS = {
  unauthorized: 'You need a free account to play. Make one in the “Your account” box — it only takes a moment.',
  valid_account_session_required: 'Please sign in first.',
  movement_must_be_one_cardinal_tile: 'You can only step one square at a time.',
  movement_blocked: 'Something is in the way — try another direction.',
  resource_not_found: 'There’s nothing to collect there.',
  resource_out_of_reach: 'Walk right next to it first, then collect.',
  resource_depleted: 'That one is all used up. Look for another glowing spot.',
  unknown_recipe: 'You can’t make that.',
  insufficient_materials: 'You don’t have enough materials yet. Check your backpack.',
  tile_occupied: 'There’s already something built here. Step to an empty square.',
  creature_not_found: 'That creature isn’t here any more.',
  target_out_of_reach: 'Get closer — you need to be within 2 squares to attack.',
  no_healing_potions: 'You have no healing potions. Make one from 2 crystals.',
  health_already_full: 'Your health is already full — save the potion for later!',
  quest_not_found: 'That quest doesn’t exist.',
  quest_objective_incomplete: 'Not finished yet — check what the quest still needs.',
  quest_already_claimed: 'You already collected that reward.',
  unknown_quest_operation: 'That quest action doesn’t exist.',
  rest_requires_nearby_camp: 'You can only rest next to a campfire or shelter. Build a campfire first (2 wood + 1 stone).',
  empty_message: 'Type a message first.',
  revision_conflict: 'The world changed at the same moment — please try again.',
  invalid_world: 'That world name isn’t allowed.',
  invalid_body_size: 'That message was too long.',
  player_identity_mismatch: 'You can only control your own explorer.',
  character_not_owned_by_account: 'That character belongs to another player.',
  username_must_be_3_to_24_letters_numbers_or_underscore: 'Usernames need 3–24 letters, numbers or _ (no spaces).',
  password_must_be_12_to_256_characters: 'Passwords need at least 12 characters. A short sentence works well!',
  account_already_exists: 'Someone already has that username. Try another one.',
  invalid_credentials: 'That username and password don’t match. Check for typos.',
  rate_limited_try_again_later: 'Too many tries — wait a minute and try again.',
  unknown_v82_operation: 'That action isn’t available.',
  'character already exists': 'You already made a character with that name tag.',
  'invalid character path': 'Pick Wizard, Scientist or Wizard-Scientist.',
  'unknown character': 'Make your character first (step 1).',
  'unknown spell': 'That spell doesn’t exist.',
  'scientific path must unlock arcane study through hybrid progression': 'Scientists can’t learn spells — pick Wizard or Wizard-Scientist for magic.',
  'spell not learned': 'Your character hasn’t learned that spell yet.',
  'insufficient mana': 'Not enough magic energy (mana). Let time pass to recharge it.',
  'invalid scientific discipline': 'Pick a science subject from the list.',
  'unknown research': 'Write down an idea first (step 1), then test it.',
  'research belongs to another character': 'That experiment belongs to someone else.',
  'observation limit reached': 'This experiment is full (12 results). Start a new idea!',
  'unknown technology': 'That invention doesn’t exist.',
  'unknown discipline': 'Pick a skill from the list.',
  'world ledger integrity failure': 'The world’s record book failed its safety check.',
  tick_count_out_of_bounds: 'Choose between 1 and 1440 steps.',
  invalid_rule_atom: 'Each rule must use the letters you started with, like “b: a”.',
  growth_governor_max_atoms: 'That puzzle is too big.',
  growth_governor_max_steps: 'That puzzle took too many rounds.',
};

export function friendlyError(code) {
  const c = String(code ?? '').trim();
  if (ERRORS[c]) return ERRORS[c];
  if (c.startsWith('identifier must be')) return 'Name tags can only use letters, numbers, _ or - (up to 48).';
  let m = c.match(/^prerequisites missing: (.+)$/);
  if (m) return 'You need to invent ' + m[1].split(', ').map((t) => TECH[t]?.name ?? t).join(' and ') + ' first.';
  m = c.match(/^need (\d+) research aptitude points; gain XP or practice (\w+)$/);
  if (m) return `You need ${m[1]} invention points. Points = your XP + 3 × your ${SKILL[m[2]]?.split(' —')[0] ?? m[2]} practice. Practise that skill or earn more XP.`;
  if (/^invalid literal|^int\(\)/.test(c)) return 'Please type a whole number.';
  if (/^HTTP 5|internal_error/.test(c)) return 'The game server hiccuped. Please try again.';
  return c ? 'Hmm, that didn’t work: ' + c.replace(/_/g, ' ') : 'Something went wrong. Please try again.';
}

export function friendlyChronicle(msg) {
  const s = String(msg ?? '');
  let m;
  if ((m = s.match(/^Crafted (\w+)$/))) return 'Made a ' + (RECIPE[m[1]] ?? m[1].replace(/_/g, ' '));
  if ((m = s.match(/^Built (\w+)$/))) return 'Built a ' + (RECIPE[m[1]] ?? m[1]);
  if ((m = s.match(/^Gathered (\d+) (\w+)$/))) return `Collected ${m[1]} ${m[2]} ${ITEM_ICON[m[2]] ?? ''}`.trim();
  if ((m = s.match(/^Quest accepted: (.+)$/))) return 'New quest: ' + questTitleFromServer(m[1]);
  if ((m = s.match(/^Quest completed: (.+)$/))) return 'Quest complete! ' + questTitleFromServer(m[1]) + ' 🏆';
  if (s === 'The world moves onward') return 'Time passes…';
  if (s === 'Rested by the camp') return 'You rested by the fire and feel better.';
  if (s === 'Healing potion restored health') return 'Glug! The potion healed you.';
  if (s === 'You awaken at the frontier camp') return 'You fainted and woke up back at camp. Be careful!';
  return s;
}
function questTitleFromServer(t) { return t === 'The Frontier Hunt' ? QUEST.frontier_hunt.title : t === "The Gatherer's Path" ? QUEST.gatherer_path.title : t; }

export const KEYS = [
  ['W A S D / arrows', 'Walk (relative to the camera)'],
  ['Click / tap ground', 'Walk there automatically'],
  ['Click a crystal or wolf', 'Walk over and collect / attack'],
  ['E', 'Collect the nearest thing'],
  ['F', 'Attack the nearest creature'],
  ['B', 'Build a campfire (2 wood + 1 stone)'],
  ['R', 'Rest by a campfire'],
  ['P', 'Make a healing potion (2 crystals)'],
  ['Q', 'Drink a healing potion'],
  ['T', 'Let time pass (creatures move, weather changes)'],
  ['Drag / two-finger drag', 'Turn the camera'],
  ['Mouse wheel / pinch', 'Zoom in and out'],
  ['C', 'Reset the camera'],
  ['H or ?', 'Show or hide this help'],
  ['J', 'Journal: your rank, bounties, story arcs and achievements'],
  ['K', 'Codex: GCSE lessons, graphs and quizzes'],
  ['M', 'Talk to Malcolm, your guide'],
  ['O', 'Expedition: endless worlds, wildlife, people and your workshop'],
  ['Enter', 'Chat with nearby players'],
  ['Hold V', 'Speak a command (push-to-talk)'],
  ['/', 'Type a command'],
  ['Esc', 'Close windows'],
];
