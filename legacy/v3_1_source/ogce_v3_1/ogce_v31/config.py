from __future__ import annotations
from pathlib import Path
from pydantic import BaseModel, Field

class Config(BaseModel):
    project_dir: Path = Path("./sample_project")
    runtime_dir: Path = Path("./runtime_data")
    save_dir: Path = Path("./saves")
    database_path: Path = Path("./runtime_data/ogce_v31.db")
    tick_rate: int = Field(default=30, ge=1, le=240)
    render_backend: str = "mock"
    viewport_backend: str = "mock"
    enable_biofeedback: bool = True
    enable_metaphysics: bool = True
    enable_coordination: bool = True
