from __future__ import annotations
from dataclasses import dataclass

@dataclass(slots=True)
class FrameResult:
    frame_index: int
    scene_name: str
    draw_calls: int
    backend: str

class Renderer:
    def __init__(self, backend: str = "mock") -> None:
        self.backend = backend
        self.initialized = False
        self.frame_index = 0

    def initialize(self) -> None:
        self.initialized = True

    def frame(self, scene_name: str, draw_calls: int) -> FrameResult:
        if not self.initialized:
            raise RuntimeError("Renderer not initialized")
        self.frame_index += 1
        return FrameResult(frame_index=self.frame_index, scene_name=scene_name, draw_calls=draw_calls, backend=self.backend)
