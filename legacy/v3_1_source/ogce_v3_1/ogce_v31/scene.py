from __future__ import annotations
from dataclasses import dataclass, field
from uuid import uuid4

def _id() -> str:
    return uuid4().hex

@dataclass(slots=True)
class SceneNode:
    name: str
    node_id: str = field(default_factory=_id)
    tags: list[str] = field(default_factory=list)
    components: dict[str, dict] = field(default_factory=dict)

@dataclass(slots=True)
class Scene:
    name: str
    root_nodes: list[SceneNode] = field(default_factory=list)
