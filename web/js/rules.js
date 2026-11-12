// Client-side copy of the v7.4 game rules, used only to give instant, friendly feedback before a request.
// The server stays the authority: every action is still validated there.
const COSTS = {
  build: { campfire: { wood: 2, stone: 1 }, shelter: { wood: 4, stone: 2 } },
  craft: { healing_potion: { crystal: 2 }, stone_edge: { stone: 5, wood: 2 }, crystal_sabre: { crystal: 5, stone: 3, wood: 2 } },
};
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export function precheck(action, state, p) {
  if (!state || !p) return null;
  const inv = p.inventory || {}, ents = state.entities || [];
  const lacks = (cost) => Object.entries(cost || {}).some(([k, v]) => (inv[k] || 0) < v);
  switch (action.type) {
    case 'move': {
      const nx = Math.max(0, Math.min(63, p.x + action.dx)), ny = Math.max(0, Math.min(63, p.y + action.dy));
      return ents.some((e) => e.kind === 'structure' && e.structure === 'shelter' && e.x === nx && e.y === ny) ? 'movement_blocked' : null;
    }
    case 'gather': {
      const t = ents.find((e) => e.id === action.target);
      if (!t || t.kind !== 'resource') return 'resource_not_found';
      if (dist(p, t) > 1) return 'resource_out_of_reach';
      return t.quantity > 0 ? null : 'resource_depleted';
    }
    case 'build':
      if (!COSTS.build[action.recipe]) return 'unknown_recipe';
      if (lacks(COSTS.build[action.recipe])) return 'insufficient_materials';
      return ents.some((e) => e.kind === 'structure' && e.x === p.x && e.y === p.y) ? 'tile_occupied' : null;
    case 'craft':
      if (!COSTS.craft[action.recipe]) return 'unknown_recipe';
      return lacks(COSTS.craft[action.recipe]) ? 'insufficient_materials' : null;
    case 'attack': {
      const c = (state.creatures || []).find((x) => x.id === action.target && x.alive !== false);
      if (!c) return 'creature_not_found';
      return dist(p, c) > 2 ? 'target_out_of_reach' : null;
    }
    case 'drink_potion':
      if ((p.potions || 0) < 1) return 'no_healing_potions';
      return (p.health ?? 100) >= (p.max_health || 100) ? 'health_already_full' : null;
    case 'rest':
      return ents.some((e) => e.kind === 'structure' && (e.structure === 'campfire' || e.structure === 'shelter') && dist(p, e) <= 1) ? null : 'rest_requires_nearby_camp';
    case 'quest': {
      if (action.operation !== 'claim') return null;
      const q = p.quests?.[action.quest_id] || {}, need = action.quest_id === 'frontier_hunt' ? 2 : 6;
      if (q.claimed) return 'quest_already_claimed';
      return q.accepted && (q.progress || 0) >= need ? null : 'quest_objective_incomplete';
    }
    default: return null;
  }
}
