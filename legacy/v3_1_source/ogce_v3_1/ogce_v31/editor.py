from __future__ import annotations
from dataclasses import dataclass, field

@dataclass(slots=True)
class EditorShell:
    panels: list[str] = field(default_factory=lambda: [
        "hierarchy","inspector","content_browser","viewport","console","profiler","reports"
    ])
    selected_panel: str = "viewport"

    def status(self) -> dict:
        return {"panels": self.panels, "selected_panel": self.selected_panel}
