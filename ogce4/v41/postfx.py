"""Declarative post-processing chain; actual GPU passes are renderer-backend dependent."""
from dataclasses import dataclass
@dataclass(frozen=True)
class PostFX:
    enabled: tuple=("tone_mapping","gamma_correction")
    exposure: float=1.0
    gamma: float=2.2
    bloom_threshold: float=1.0
    def __post_init__(self):
        allowed={"tone_mapping","gamma_correction","bloom","vignette","color_grading","ssao"}
        if set(self.enabled)-allowed: raise ValueError("Unsupported post-processing effect")
        if self.exposure<0 or self.gamma<=0 or self.bloom_threshold<0: raise ValueError("Invalid post-processing parameters")
