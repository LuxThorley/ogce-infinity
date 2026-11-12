"""Serializable editor docking layout schema with validation."""
from dataclasses import dataclass,asdict
@dataclass
class DockPanel:
    panel_id: str
    area: str
    visible: bool=True
    ratio: float=0.25
    def __post_init__(self):
        if self.area not in {"left","right","top","bottom","center","floating"}: raise ValueError("Invalid dock area")
        if not 0.05<=self.ratio<=0.95: raise ValueError("Dock ratio outside safe range")
def layout_to_dict(panels): return {"schema":1,"panels":[asdict(p) for p in panels]}
