"""μLux integration layer for OGCE v8.0.

Implements a bounded Horn-rule least-fixed-point engine, six-grade evidence
ledger, fail-closed action policy, deterministic artificial-life simulation,
and hash-chained event receipts. This is a Python-native compatible port,
not a claim of byte-for-byte JS parity or sentience.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
from typing import Any, Iterable
import hashlib, json, random, time

GRADES = ("FACT", "INFERENCE", "SPECULATION", "BELIEF", "SSR INTERPRETATION", "OPEN CONJECTURE")
RANK = {"FACT": 3, "INFERENCE": 2, "SPECULATION": 1, "BELIEF": 1, "SSR INTERPRETATION": 1, "OPEN CONJECTURE": 1}
ALLOWED_ACTIONS = {"compute_local", "export_file", "store_local", "world_autonomy"}
OWNER_APPROVAL_ACTIONS = {"publish_certificate", "deploy"}
DENIED_ACTIONS = {"post_social", "send_message", "spend", "execute_binary", "label_as_source_communication"}

def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

def sha256(value: str | bytes) -> str:
    raw = value.encode("utf-8") if isinstance(value, str) else value
    return hashlib.sha256(raw).hexdigest()

def decide(action: str, policy_valid: bool = True, owner_yes: bool = False) -> dict:
    """Fail-closed policy decision; unknown actions are denied."""
    if not policy_valid:
        return {"decision": "deny", "reason": "policy unavailable (fail-closed)"}
    if action in DENIED_ACTIONS:
        return {"decision": "deny", "reason": "explicitly denied"}
    if action in ALLOWED_ACTIONS:
        return {"decision": "allow", "reason": "explicitly allowed"}
    if action in OWNER_APPROVAL_ACTIONS:
        return {"decision": "allow" if owner_yes else "needs_owner_yes",
                "reason": "explicit owner approval required"}
    return {"decision": "deny", "reason": "unknown action (default deny)"}

def least_fixed_point(atoms: Iterable[str], rules: Iterable[dict], axioms: Iterable[str] = (),
                      max_steps: int = 144_000, max_atoms: int = 144_000) -> dict:
    """Compute μΓ from ∅ by bounded monotone Horn-rule iteration."""
    universe = set(atoms)
    if len(universe) > max_atoms:
        raise ValueError("growth_governor_max_atoms")
    compiled = []
    for rule in rules:
        head, body = rule.get("then"), rule.get("if", [])
        if head not in universe or not isinstance(body, list) or any(x not in universe for x in body):
            raise ValueError("invalid_rule_atom")
        compiled.append((head, tuple(body)))
    current = set()
    trace = []
    for step in range(max_steps + 1):
        nxt = set(current)
        if step == 0:
            nxt.update(x for x in axioms if x in universe)
        for head, body in compiled:
            if all(x in current for x in body):
                nxt.add(head)
        trace.append({"step": step, "size": len(nxt), "added": sorted(nxt-current)})
        if nxt == current:
            return {"closure": sorted(current), "steps": step, "trace": trace, "converged": True}
        current = nxt
        if len(current) > max_atoms:
            raise ValueError("growth_governor_max_atoms")
    raise ValueError("growth_governor_max_steps")

def grade_claim(text: str, evidence: list[dict] | None = None, requested: str = "OPEN CONJECTURE") -> dict:
    evidence = evidence or []
    if requested not in GRADES:
        requested = "OPEN CONJECTURE"
    kinds = {e.get("kind") for e in evidence}
    support = 3 if {"proof", "computation", "citation", "measurement"} & kinds else (2 if "premise" in kinds else 0)
    displayed = requested
    if RANK[requested] > support:
        displayed = "OPEN CONJECTURE" if support == 0 else ("INFERENCE" if support == 2 else "FACT")
    forbidden = []
    checks = {
        "medical_advice": r"\b(cure|diagnose|treats? disease)\b",
        "future_prediction": r"\b(will definitely|guaranteed future|certainly happen)\b",
        "supernatural_efficacy": r"\b(proven supernatural|miracle cure)\b",
        "source_communication_claim": r"\b(received from source|validated source communication)\b",
    }
    import re
    for name, pattern in checks.items():
        if re.search(pattern, text, re.I):
            forbidden.append(name)
    return {"text": text, "requested_grade": requested, "grade": displayed,
            "evidence": evidence, "evidence_rank": support, "flags": forbidden}

@dataclass
class LifeAgent:
    id: int
    x: int
    y: int
    energy: float = 1.0
    age: int = 0
    memory: list[str] | None = None
    genome: list[dict] | None = None
    alive: bool = True

class LivingWorld:
    """Seeded, bounded artificial-life sandbox with memory, adaptation and replay."""
    def __init__(self, seed: int = 144, width: int = 12, height: int = 12,
                 target_population: int = 24, max_agents: int = 1440):
        self.seed, self.rng = seed, random.Random(seed)
        self.width, self.height = width, height
        self.target_population, self.max_agents = target_population, max_agents
        self.tick_count = 0
        self.food = [[self.rng.random() for _ in range(width)] for _ in range(height)]
        self.agents = [LifeAgent(i, self.rng.randrange(width), self.rng.randrange(height),
                                 memory=[], genome=[{"if":["hungry"],"then":"harvest"}])
                       for i in range(min(12, max_agents))]
        self.learned_rules: list[dict] = []
        self.ledger: list[dict] = []
        self._append_event("genesis", {"seed": seed, "agents": len(self.agents)})

    def _append_event(self, kind: str, payload: dict):
        previous = self.ledger[-1]["hash"] if self.ledger else "0"*64
        body = {"seq": len(self.ledger), "tick": self.tick_count, "kind": kind,
                "payload": payload, "previous": previous}
        body["hash"] = sha256(canonical(body))
        self.ledger.append(body)

    def tick(self, count: int = 1) -> dict:
        if not isinstance(count, int) or count < 1 or count > 1440:
            raise ValueError("tick_count_out_of_bounds")
        for _ in range(count):
            self.tick_count += 1
            for row in self.food:
                for x in range(self.width):
                    row[x] = min(1.0, row[x] + 0.015)
            occupied = {(a.x, a.y) for a in self.agents if a.alive}
            births = []
            for a in self.agents:
                if not a.alive: continue
                a.age += 1
                hungry = a.energy < 0.55
                a.memory = (a.memory or [])[-11:] + [("hungry" if hungry else "sated")]
                # Genome policy: harvest when hungry, otherwise explore toward sparse cells.
                if hungry and self.food[a.y][a.x] > 0.05:
                    amount = min(0.22, self.food[a.y][a.x])
                    self.food[a.y][a.x] -= amount
                    a.energy = min(1.5, a.energy + amount * 1.8)
                else:
                    dx, dy = self.rng.choice(((1,0),(-1,0),(0,1),(0,-1),(0,0)))
                    a.x, a.y = (a.x+dx)%self.width, (a.y+dy)%self.height
                    a.energy -= 0.025
                if a.energy <= 0:
                    a.alive = False
                elif a.energy > 1.15 and len(self.agents)+len(births) < self.max_agents and self.rng.random() < 0.035:
                    births.append(LifeAgent(max([x.id for x in self.agents]+[0])+len(births)+1,
                        a.x, a.y, 0.65, 0, [], list(a.genome or [])))
                    a.energy *= 0.58
            self.agents.extend(births)
            # Bounded ecology: dead agents are retained in history but active population is counted.
            if self.tick_count % 12 == 0:
                active = sum(a.alive for a in self.agents)
                self.learned_rules = [{"if":["hungry"],"then":"harvest"}] if active else []
                self._append_event("ecology_checkpoint", {"active": active, "births": len(births),
                                                           "learned_rules": self.learned_rules})
        self._append_event("tick", {"count": count, "active": self.population})
        return self.snapshot()

    @property
    def population(self):
        return sum(a.alive for a in self.agents)

    def snapshot(self) -> dict:
        return {"seed": self.seed, "tick": self.tick_count, "population": self.population,
                "agents": [asdict(a) for a in self.agents],
                "food": self.food, "learned_rules": self.learned_rules,
                "ledger_head": self.ledger[-1]["hash"] if self.ledger else None}

    @classmethod
    def from_record(cls, record: dict) -> "LivingWorld":
        snap = record["state"]
        world = cls(seed=int(record["seed"]))
        world.tick_count = int(record["tick"])
        world.food = snap.get("food", world.food)
        world.learned_rules = snap.get("learned_rules", [])
        world.agents = [LifeAgent(**a) for a in snap.get("agents", [])]
        world.ledger = record.get("ledger", [])
        return world

    def verify_ledger(self) -> dict:
        previous = "0"*64
        for i, event in enumerate(self.ledger):
            body = {k:v for k,v in event.items() if k != "hash"}
            if event.get("seq") != i or event.get("previous") != previous or sha256(canonical(body)) != event.get("hash"):
                return {"valid": False, "at": i}
            previous = event["hash"]
        return {"valid": True, "events": len(self.ledger), "head": previous}

    def export_receipt(self) -> dict:
        payload = {"seed": self.seed, "tick": self.tick_count, "population": self.population,
                   "ledger_head": self.ledger[-1]["hash"] if self.ledger else None}
        return {"kind": "ogce.mulux.world_snapshot", "payload": payload,
                "sha256": sha256(canonical(payload)), "created_at": int(time.time())}
