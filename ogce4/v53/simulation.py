"""Integrated, reproducible world tick coordinating NPCs, ecology and civ turns."""
from copy import deepcopy
from .npc import NPC
from .ecosystem import step_ecosystem
from .civilization import civilization_tick
from .events import generate_event, append_chronicle

def create_world(seed=53, name="Aurelia"):
    return {"seed": int(seed), "name": name, "tick": 0,
            "ecosystem": {"seed": int(seed), "tick": 0,
                "populations": {"flora": 400, "herbivore": 40, "predator": 5},
                "resources": {"water": 300, "nutrients": 800}, "history": []},
            "npcs": [{"npc_id": "npc-001", "name": "Mira", "role": "scout",
                      "traits": {"diligence": .7}, "needs": {"hunger": .3, "safety": .2, "belonging": .4, "curiosity": .8},
                      "goals": ["map the valley"], "relationships": {}, "memory": [], "location": [0,0], "alive": True}],
            "civilization": {"name": "Aurelia Compact", "culture": "river-valley", "settlements": [],
                "relations": {}, "treaties": [], "wars": [], "ledger": [], "turn": 0},
            "chronicle": []}

def world_tick(world, climate=1.0):
    w = deepcopy(world); next_tick = int(w["tick"]) + 1
    w["ecosystem"] = step_ecosystem(w["ecosystem"], climate=climate)
    for n in w["npcs"]:
        agent = NPC(n["npc_id"], n["name"], n.get("role", "wanderer"), n.get("traits", {}),
                    n.get("needs", {}), n.get("goals", []), n.get("relationships", {}),
                    n.get("memory", []), tuple(n.get("location", [0,0])), n.get("alive", True))
        agent.tick(next_tick)
        n.update({"needs": agent.needs, "relationships": agent.relationships, "memory": agent.memory})
    w["civilization"] = civilization_tick(w["civilization"])
    event = generate_event(w["seed"], next_tick, w["name"])
    w["chronicle"] = append_chronicle(w["chronicle"], event)
    w["tick"] = next_tick
    return w
