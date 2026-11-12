from __future__ import annotations
import json
from pathlib import Path
from ogce_v31.scene import Scene, SceneNode

def load_scene_file(path: Path) -> Scene:
    raw = json.loads(path.read_text(encoding="utf-8"))
    scene = Scene(name=raw["name"])
    for item in raw.get("root_nodes", []):
        scene.root_nodes.append(SceneNode(
            name=item["name"],
            node_id=item.get("node_id", ""),
            tags=item.get("tags", []),
            components=item.get("components", {}),
        ))
    return scene
