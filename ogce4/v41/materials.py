"""Validated glTF-style metallic/roughness PBR material data."""
from dataclasses import dataclass, asdict
@dataclass(frozen=True)
class PBRMaterial:
    name: str = "Default"
    base_color: tuple = (0.8,0.8,0.8,1.0)
    metallic: float = 0.0
    roughness: float = 0.7
    emissive: tuple = (0.0,0.0,0.0)
    alpha_mode: str = "OPAQUE"
    double_sided: bool = False
    def __post_init__(self):
        if len(self.base_color)!=4 or len(self.emissive)!=3: raise ValueError("Invalid color vector")
        if any(not isinstance(v,(int,float)) or not 0<=v<=1 for v in self.base_color): raise ValueError("base_color must be in [0,1]")
        if any(not isinstance(v,(int,float)) or v<0 for v in self.emissive): raise ValueError("emissive must be nonnegative")
        if not 0<=self.metallic<=1 or not 0<=self.roughness<=1: raise ValueError("metallic/roughness must be in [0,1]")
        if self.alpha_mode not in {"OPAQUE","MASK","BLEND"}: raise ValueError("Invalid alpha mode")
    def to_dict(self): return asdict(self)
