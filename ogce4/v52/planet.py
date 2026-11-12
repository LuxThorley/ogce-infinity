"""Seeded spherical planetary generation with latitudinal climate bands and biomes."""
import math, random
BIOMES=("ice","tundra","forest","grassland","desert","jungle","ocean","volcanic")
def generate_planet(name="Genesis",seed=52,rings=48,sectors=96,radius=100.0,water_level=0.0):
    if rings<4 or sectors<8 or rings*sectors>1_000_000: raise ValueError("planet resolution outside safe bounds")
    if radius<=0: raise ValueError("radius must be positive")
    rng=random.Random(seed); phases=[rng.random()*math.tau for _ in range(5)]
    vertices=[]; biomes=[]; climate=[]
    for i in range(rings+1):
        lat=-math.pi/2+math.pi*i/rings; row=[]; brow=[]; crow=[]
        for j in range(sectors):
            lon=math.tau*j/sectors
            noise=(math.sin(3*lon+phases[0])*math.cos(4*lat+phases[1])+
                   .45*math.sin(9*lon+7*lat+phases[2])+.2*math.cos(17*lon-11*lat+phases[3]))/1.65
            elev=noise*radius*.035
            temp=max(0.0,1-abs(lat)/(math.pi/2))*.85 + .12*math.sin(lon*2+phases[4]) - max(0,elev/radius)*.4
            moisture=max(0,min(1,.5+.35*math.sin(lon*3+phases[1])*math.cos(lat*5+phases[2])))
            if elev<water_level: biome="ocean"
            elif temp<.15: biome="ice"
            elif temp<.28: biome="tundra"
            elif temp>.72 and moisture>.55: biome="jungle"
            elif temp>.65 and moisture<.3: biome="desert"
            elif moisture>.58: biome="forest"
            elif elev/radius>.025: biome="volcanic"
            else: biome="grassland"
            row.append(round(elev,5)); brow.append(biome); crow.append({"temperature":round(temp,4),"moisture":round(moisture,4)})
        vertices.append(row); biomes.append(brow); climate.append(crow)
    return {"schema":"ogce.planet.v1","name":name,"seed":seed,"radius":radius,"rings":rings,"sectors":sectors,
            "elevation":vertices,"biomes":biomes,"climate":climate,
            "generation":{"algorithm":"seeded-spherical-harmonics-v1","reproducible":True}}
