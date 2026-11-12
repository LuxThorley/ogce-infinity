from __future__ import annotations
from pathlib import Path
from pydantic import BaseModel, Field

class ProjectManifest(BaseModel):
    name: str = "Untitled OGCE Project"
    engine_version: str = "3.1.0"
    template: str = "open_world_rpg"
    company: str = "Unknown Studio"
    startup_scene: str = "scenes/main.scene.json"
    modules: list[str] = Field(default_factory=lambda: [
        "runtime","renderer","editor","viewport","scene","assets","matchmaking",
        "anti_cheat","platform","billing","updater","plugin_registry","reports",
        "biofeedback","metaphysics","integrations"
    ])

def load_project(project_dir: Path) -> ProjectManifest:
    return ProjectManifest.model_validate_json((project_dir / "project.ogce.json").read_text(encoding="utf-8"))

def save_project(project_dir: Path, manifest: ProjectManifest) -> Path:
    project_dir.mkdir(parents=True, exist_ok=True)
    path = project_dir / "project.ogce.json"
    path.write_text(manifest.model_dump_json(indent=2), encoding="utf-8")
    return path
