"""Grid-based world streaming and distance LOD selection."""
import math
class WorldStreamer:
    def __init__(self,chunk_size=64,load_radius=2,unload_radius=3):
        if chunk_size<=0 or load_radius<0 or unload_radius<load_radius: raise ValueError("invalid streaming radii")
        self.chunk_size=chunk_size; self.load_radius=load_radius; self.unload_radius=unload_radius; self.loaded=set()
    def chunk_at(self,x,z): return (math.floor(x/self.chunk_size),math.floor(z/self.chunk_size))
    def update(self,x,z):
        cx,cz=self.chunk_at(x,z); wanted={(cx+dx,cz+dz) for dx in range(-self.load_radius,self.load_radius+1) for dz in range(-self.load_radius,self.load_radius+1)}
        self.loaded |= wanted
        self.loaded={c for c in self.loaded if max(abs(c[0]-cx),abs(c[1]-cz))<=self.unload_radius}
        return {"load":sorted(wanted),"loaded":sorted(self.loaded),"unload_radius":self.unload_radius}
def select_lod(distance,thresholds=(100,300,800)):
    if distance<0: raise ValueError("distance cannot be negative")
    return sum(distance>=t for t in thresholds)
