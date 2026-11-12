"""Deterministic ocean, wind and weather fields derived from planetary climate."""
import math
def sample_environment(planet,ring,sector,tick=0):
    r=max(0,min(planet["rings"],ring)); s=sector%planet["sectors"]
    climate=planet["climate"][r][s]; biome=planet["biomes"][r][s]
    wave=.5+.5*math.sin((s*.17)+(tick*.035)+(planet["seed"]*.01))
    wind=(.25+.55*climate["moisture"])*math.cos(tick*.01+s*.07)
    precipitation=max(0,min(1,climate["moisture"]*(.5+.5*math.sin(tick*.013+r*.11))))
    return {"biome":biome,"temperature":climate["temperature"],"moisture":climate["moisture"],
            "ocean_wave":round(wave,4) if biome=="ocean" else 0.0,
            "wind":round(wind,4),"precipitation":round(precipitation,4),
            "weather":"storm" if precipitation>.82 and abs(wind)>.55 else ("rain" if precipitation>.58 else "clear")}
