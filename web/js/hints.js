// Adaptive guide: picks the single most useful next tip from what the player has actually done.
import { friendlyError, QUEST } from './text.js';

const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export function nearest(list, from, pred = () => true) {
  let best = null, bd = Infinity;
  for (const e of list || []) if (pred(e)) { const d = dist(e, from); if (d < bd) { bd = d; best = e; } }
  return best;
}
const inv = (p, k) => (p.inventory && p.inventory[k]) || 0;

/**
 * ctx: { state, player, signedIn, guestBlocked, done:Set<string>, lastError?:{code,at}, now }
 * returns { id, text, target?:{x,y,label}, tone:'tip'|'warn'|'error'|'done' }
 */
export function nextHint(ctx) {
  const { state, player: p, signedIn, guestBlocked, done = new Set(), lastError, now = Date.now(), touch = false } = ctx;
  if (lastError && now - lastError.at < 6000) return { id: 'error:' + lastError.code, text: friendlyError(lastError.code), tone: 'error' };
  if (!signedIn && guestBlocked) return { id: 'signup', tone: 'warn', text: 'Make a free account in the “Your account” box to start playing. You only need a username and a password of 12+ characters (a short sentence is perfect).' };
  if (!state || !p) return { id: 'loading', tone: 'tip', text: 'Loading the world…' };
  const ents = state.entities || [], creatures = state.creatures || [];
  const camp = ents.find((e) => e.kind === 'structure' && (e.structure === 'campfire' || e.structure === 'shelter'));
  const quests = p.quests || {};
  const hp = p.health ?? 100, maxHp = p.max_health ?? 100;
  if (hp <= maxHp * 0.35) {
    if ((p.potions || 0) > 0) return { id: 'lowhp-potion', tone: 'warn', text: 'Your health is low! Press Q to drink a healing potion.' };
    if (camp) return { id: 'lowhp-rest', tone: 'warn', text: 'Your health is low! Walk next to your campfire and press R to rest.', target: { x: camp.x, y: camp.y, label: 'campfire' } };
    if (inv(p, 'crystal') >= 2) return { id: 'lowhp-make', tone: 'warn', text: 'Your health is low! Press P to make a healing potion from 2 crystals, then Q to drink it.' };
    return { id: 'lowhp-flee', tone: 'warn', text: 'Your health is low! Walk away from wolves and collect 2 crystals to make a potion.' };
  }
  if ((p.hunger || 0) >= 60) return camp
    ? { id: 'hungry-rest', tone: 'warn', text: 'You’re getting hungry and tired. Rest next to your campfire (R).', target: { x: camp.x, y: camp.y, label: 'campfire' } }
    : { id: 'hungry-build', tone: 'warn', text: 'You’re getting hungry and tired. Build a campfire (B) with 2 wood + 1 stone, then rest next to it (R).' };
  if (!done.has('moved')) return { id: 'move', tone: 'tip', text: touch
    ? 'Welcome, explorer! Push the joystick (bottom left) to walk, or tap the ground to walk there. Drag to turn the camera, pinch to zoom.'
    : 'Welcome, explorer! Walk with W A S D or the arrow keys — or just click the ground where you want to go. Drag to turn the camera, scroll to zoom. Press H for all the keys.' };
  const res = (k) => nearest(ents, p, (e) => e.kind === 'resource' && e.quantity > 0 && (!k || e.resource === k));
  if (!done.has('gathered')) {
    const r = res('crystal') || res();
    if (r) return { id: 'gather', tone: 'tip', text: touch ? `See the glowing ${r.resource}? Follow the gold arrows, then tap it to walk over and collect it.` : `See the glowing ${r.resource}? Follow the gold arrows, stand next to it and press E — or just click it.`, target: { x: r.x, y: r.y, label: r.resource } };
  }
  const g = quests.gatherer_path;
  if (!g || !g.accepted) return { id: 'quest-gather', tone: 'tip', text: `Open the Quests box and accept “${QUEST.gatherer_path.title}”: ${QUEST.gatherer_path.goal.toLowerCase()} for a reward.` };
  if ((p.potions || 0) === 0 && inv(p, 'crystal') >= 2 && !done.has('potion')) return { id: 'potion', tone: 'tip', text: 'You have 2 crystals — press P to make a healing potion. It’s handy when wolves bite!' };
  if (!camp) {
    if (inv(p, 'wood') >= 2 && inv(p, 'stone') >= 1) return { id: 'build', tone: 'tip', text: 'You have enough to build a campfire! Press B. You can rest next to it later.' };
    const need = inv(p, 'wood') < 2 ? 'wood' : 'stone';
    const r = res(need);
    if (r) return { id: 'build-gather', tone: 'tip', text: `A campfire needs 2 wood and 1 stone. Collect some ${need} next.`, target: { x: r.x, y: r.y, label: need } };
  }
  if (g.accepted && !g.claimed && (g.progress || 0) >= 6) return { id: 'claim-gather', tone: 'done', text: `“${QUEST.gatherer_path.title}” is finished — press Claim reward in the Quests box!` };
  const weapon = p.equipment?.weapon || 'traveller_blade';
  if (weapon === 'traveller_blade' && inv(p, 'stone') >= 5 && inv(p, 'wood') >= 2) return { id: 'sword', tone: 'tip', text: 'You can make a Stone Sword (5 stone + 2 wood). It hits harder — find it in the Crafting box.' };
  const h = quests.frontier_hunt;
  if (!h || !h.accepted) return { id: 'quest-hunt', tone: 'tip', text: `Feeling brave? Accept “${QUEST.frontier_hunt.title}” in the Quests box: ${QUEST.frontier_hunt.goal.toLowerCase()}.` };
  if (h.accepted && !h.claimed) {
    if ((h.progress || 0) >= 2) return { id: 'claim-hunt', tone: 'done', text: `“${QUEST.frontier_hunt.title}” is done — claim your reward in the Quests box!` };
    const w = nearest(creatures, p, (c) => c.alive !== false && c.hostile);
    if (w) return { id: 'hunt', tone: 'tip', text: `Find ${w.name} the Moss Wolf (red) and get within 2 squares, then press F (or click it) to attack. Wolves bite back, so watch your health! Pressing T lets time pass so they come to you.`, target: { x: w.x, y: w.y, label: w.name } };
    return { id: 'hunt-wait', tone: 'tip', text: 'The wolves are resting. Press T a few times to let time pass until they come back.' };
  }
  if (!done.has('academy')) return { id: 'academy', tone: 'tip', text: 'Great adventuring! Now open the Magic & Science tab: make a character, test an idea twice like a real scientist, and invent a windmill.' };
  if (!done.has('lifelab')) return { id: 'lifelab', tone: 'tip', text: 'Try the Tiny Life Lab tab: watch a little world of tiny creatures grow, and solve an if-then puzzle.' };
  return { id: 'free', tone: 'done', text: 'You know the basics! Explore, upgrade to the Crystal Sabre (5 crystal, 3 stone, 2 wood), and build your town’s inventions.' };
}
