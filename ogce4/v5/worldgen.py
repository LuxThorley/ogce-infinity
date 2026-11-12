"""Seeded finite world generator: procedural regions, biomes and points of interest."""
import random
from ogce4.v41.terrain import generate_heightfield
BIOMES=("verdant","arid","glacial","volcanic","oceanic","crystalline")
def generate_world(name="Genesis World",seed=144,width=32,height=32,poi_count=12):
    if poi_count<0 or poi_count>10000: raise ValueError("poi_count out of range")
    rng=random.Random(seed)
    terrain=generate_heightfield(width,height,seed=seed,amplitude=18.0,frequency=.11)
    biomes=[]
    for z,row in enumerate(terrain):
        biomes.append([BIOMES[min(len(BIOMES)-1,max(0,int((v+18)/36*len(BIOMES))))] for v in row])
    pois=[]
    for i in range(poi_count):
        x=rng.randrange(width); z=rng.randrange(height)
        pois.append({"id":f"poi-{i+1:04d}","x":x,"z":z,"elevation":terrain[z][x],
                     "kind":rng.choice(["settlement","ruin","shrine","cavern","resource","portal"]),
                     "seed":rng.randrange(2**31)})
    return {"schema":"ogce.world.v1","name":name,"seed":seed,"dimensions":[width,height],
            "terrain":terrain,"biomes":biomes,"points_of_interest":pois,
            "generation":{"algorithm":"seeded-sine-heightfield-v1","reproducible":True}}
