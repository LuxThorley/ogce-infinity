import random
from dataclasses import dataclass,field
from uuid import uuid4
@dataclass
class Concept: id:str; name:str; layer:str; attributes:dict=field(default_factory=dict)
class SymbolicMetaphysics:
    MODES=("art_to_world","world_to_art","symbolic_resonance","layered_reality","causal_weave","dream_logic")
    def __init__(self):self.concepts={};self.rules=[];self.events=[]
    def add_concept(self,name,layer,attributes=None):
        c=Concept(uuid4().hex,name,layer,attributes or {});self.concepts[c.id]=c;return c
    def add_rule(self,source,target,operation,cost=1):self.rules.append({"source":source,"target":target,"operation":operation,"cost":cost})
    def synthesize(self,seed,mode,source):
        if mode not in self.MODES:raise ValueError("Unsupported mode")
        rng=random.Random(seed);e={"seed":seed,"mode":mode,"layer":source.get("layer","liminal"),
        "motif":source.get("motif","unknown"),"resonance":round(rng.random(),4),
        "geometry":rng.choice(["non_euclidean","folded","recursive","hyperbolic"])}
        self.events.append(e);return e
