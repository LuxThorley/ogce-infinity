from __future__ import annotations
from dataclasses import dataclass, field
from uuid import uuid4

SAFETY_NOTE = (
    "The metaphysics engine is a symbolic simulation system for conceptual, esoteric, and multidimensional game content. "
    "It does not create supernatural effects or alter reality."
)

@dataclass(slots=True)
class OntologyNode:
    node_id: str
    name: str
    domain: str
    properties: dict[str, str] = field(default_factory=dict)

@dataclass(slots=True)
class DimensionalRule:
    rule_id: str
    source_domain: str
    target_domain: str
    transform: str
    stability_cost: int

@dataclass(slots=True)
class SymbolicEvent:
    event_id: str
    title: str
    domain: str
    intensity: int
    tags: list[str] = field(default_factory=list)

class MetaphysicsEngine:
    def __init__(self) -> None:
        self.ontology: dict[str, OntologyNode] = {}
        self.rules: dict[str, DimensionalRule] = {}
        self.events: list[SymbolicEvent] = []

    def add_node(self, name: str, domain: str, properties: dict[str, str] | None = None) -> OntologyNode:
        node = OntologyNode(node_id=uuid4().hex, name=name, domain=domain, properties=properties or {})
        self.ontology[node.node_id] = node
        return node

    def add_rule(self, source_domain: str, target_domain: str, transform: str, stability_cost: int) -> DimensionalRule:
        rule = DimensionalRule(rule_id=uuid4().hex, source_domain=source_domain, target_domain=target_domain, transform=transform, stability_cost=stability_cost)
        self.rules[rule.rule_id] = rule
        return rule

    def manifest_event(self, title: str, domain: str, intensity: int, tags: list[str] | None = None) -> SymbolicEvent:
        evt = SymbolicEvent(event_id=uuid4().hex, title=title, domain=domain, intensity=max(0, min(100, intensity)), tags=tags or [])
        self.events.append(evt)
        return evt

    def summarize(self) -> dict:
        return {"ontology_nodes": len(self.ontology), "rules": len(self.rules), "events": len(self.events), "safety_note": SAFETY_NOTE}
