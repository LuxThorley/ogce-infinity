"""Deterministic seeded procedural heightfield generator."""
import math, random
def generate_heightfield(width=64,height=64,seed=7,amplitude=12.0,frequency=0.08):
    if width<2 or height<2 or width*height>2_000_000: raise ValueError("Invalid terrain dimensions")
    if amplitude<0 or frequency<=0: raise ValueError("Invalid terrain parameters")
    rng=random.Random(seed); p=[rng.random()*math.tau for _ in range(4)]; out=[]
    for z in range(height):
        row=[]
        for x in range(width):
            n=(math.sin(x*frequency+p[0])+math.cos(z*frequency+p[1])+0.5*math.sin((x+z)*frequency*1.7+p[2])+0.25*math.cos((x-z)*frequency*2+p[3]))/2.75
            row.append(round(n*amplitude,4))
        out.append(row)
    return out
