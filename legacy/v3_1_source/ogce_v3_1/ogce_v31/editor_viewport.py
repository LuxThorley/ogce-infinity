from __future__ import annotations
from dataclasses import dataclass

@dataclass(slots=True)
class ViewportState:
    mode: str = "lit"
    show_grid: bool = True
    show_gizmos: bool = True
    render_backend: str = "mock"
    camera_speed: float = 4.0
    resolution: tuple[int, int] = (1920, 1080)

def describe_viewport(state: ViewportState) -> dict:
    return {
        "mode": state.mode,
        "show_grid": state.show_grid,
        "show_gizmos": state.show_gizmos,
        "render_backend": state.render_backend,
        "camera_speed": state.camera_speed,
        "resolution": list(state.resolution),
    }
