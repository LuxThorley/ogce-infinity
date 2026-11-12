"""Portable directional/environment lighting profile and render-feature switches."""
from dataclasses import dataclass
@dataclass(frozen=True)
class LightingProfile:
    ambient: tuple=(0.18,0.18,0.22)
    sun_direction: tuple=(-0.4,-0.7,-0.5)
    sun_color: tuple=(1.0,0.95,0.85)
    shadow_map_size: int=2048
    shadow_bias: float=0.001
    environment_intensity: float=1.0
    gi_mode: str="ambient_approximation"
    post_processing: tuple=("tone_mapping","gamma")
    def __post_init__(self):
        if self.shadow_map_size not in (512,1024,2048,4096,8192): raise ValueError("Unsupported shadow map size")
        if self.shadow_bias<0 or self.environment_intensity<0: raise ValueError("Negative lighting value")
        if self.gi_mode not in {"off","ambient_approximation","baked_probe","ray_traced"}: raise ValueError("Unknown GI mode")
