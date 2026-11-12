"""Deterministic utility-based NPC agents with bounded memory and social ties."""
from __future__ import annotations
from dataclasses import dataclass, field
import math

@dataclass
class Memory:
    tick: int
    kind: str
    detail: str
    importance: float = 0.5

@dataclass
class NPC:
    npc_id: str
    name: str
    role: str = "wanderer"
    traits: dict = field(default_factory=dict)
    needs: dict = field(default_factory=lambda: {"hunger": 0.2, "safety": 0.2, "belonging": 0.2, "curiosity": 0.5})
    goals: list = field(default_factory=lambda: ["explore"])
    relationships: dict = field(default_factory=dict)
    memory: list = field(default_factory=list)
    location: tuple = (0, 0)
    alive: bool = True

    def __post_init__(self):
        if not self.npc_id or len(self.npc_id) > 80: raise ValueError("invalid npc_id")
        if len(self.memory) > 100: self.memory = self.memory[-100:]
        for k, v in self.needs.items():
            if not 0 <= float(v) <= 1: raise ValueError(f"need {k} must be in [0,1]")

    def remember(self, tick: int, kind: str, detail: str, importance: float = .5):
        if len(detail) > 240 or not 0 <= importance <= 1: raise ValueError("invalid memory")
        self.memory.append({"tick": int(tick), "kind": str(kind)[:40], "detail": detail, "importance": importance})
        self.memory.sort(key=lambda m: (m["importance"], m["tick"]))
        self.memory = self.memory[-50:]

    def choose_action(self, available=("work", "eat", "rest", "socialize", "explore")):
        """Select highest-scoring action; stable tie-break makes replay deterministic."""
        scores = {
            "eat": self.needs.get("hunger", 0) * 1.5,
            "rest": self.needs.get("safety", 0) * 0.9,
            "socialize": self.needs.get("belonging", 0) * 1.2,
            "explore": self.needs.get("curiosity", 0) * 0.8,
            "work": .35 + float(self.traits.get("diligence", .5)) * .5,
            "trade": .2 + float(self.traits.get("sociability", .5)) * .3,
        }
        choices = [a for a in available if a in scores]
        if not choices: raise ValueError("no supported actions available")
        return max(choices, key=lambda a: (scores[a], a))

    def tick(self, tick: int, available=("work", "eat", "rest", "socialize", "explore")):
        if not self.alive: return {"npc_id": self.npc_id, "action": "inactive"}
        action = self.choose_action(available)
        drift = {"hunger": .07, "safety": .025, "belonging": .025, "curiosity": -.02}
        for key, delta in drift.items():
            self.needs[key] = min(1, max(0, self.needs.get(key, .2) + delta))
        effects = {"eat": ("hunger", -.65), "rest": ("safety", -.5),
                   "socialize": ("belonging", -.55), "explore": ("curiosity", -.4)}
        if action in effects:
            key, delta = effects[action]; self.needs[key] = max(0, self.needs[key] + delta)
        self.remember(tick, "action", action, .25)
        return {"npc_id": self.npc_id, "action": action, "needs": dict(self.needs)}

def relationship_update(npc: NPC, other_id: str, interaction: float):
    if not -1 <= interaction <= 1: raise ValueError("interaction must be in [-1,1]")
    value = npc.relationships.get(other_id, 0.0)
    npc.relationships[other_id] = round(max(-1, min(1, value * .9 + interaction * .1)), 4)
    return npc.relationships[other_id]
