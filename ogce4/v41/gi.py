"""Deterministic ambient-occlusion/irradiance probe data model (not a ray tracer)."""
from dataclasses import dataclass
@dataclass(frozen=True)
class IrradianceProbe:
    position: tuple
    irradiance: tuple
    radius: float=8.0
    def __post_init__(self):
        if len(self.position)!=3 or len(self.irradiance)!=3 or self.radius<=0: raise ValueError("Invalid irradiance probe")
        if any(v<0 for v in self.irradiance): raise ValueError("Irradiance must be nonnegative")
def interpolate_probes(position,probes):
    if not probes: return (0.0,0.0,0.0)
    weights=[]
    for p in probes:
        d=sum((a-b)**2 for a,b in zip(position,p.position))**0.5
        weights.append(1/max(d,0.001)**2 if d<=p.radius else 0.0)
    total=sum(weights)
    if total==0: return (0.0,0.0,0.0)
    return tuple(sum(w*p.irradiance[i] for w,p in zip(weights,probes))/total for i in range(3))
