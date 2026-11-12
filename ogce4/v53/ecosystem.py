"""Coupled resource/food-web ecology with bounded populations and deterministic updates."""
from copy import deepcopy

def create_ecosystem(seed=1, flora=400, herbivores=40, predators=5, water=300):
    if min(flora, herbivores, predators, water) < 0: raise ValueError("populations/resources cannot be negative")
    return {"seed": int(seed), "tick": 0,
            "populations": {"flora": int(flora), "herbivore": int(herbivores), "predator": int(predators)},
            "resources": {"water": int(water), "nutrients": int(flora * 2)},
            "history": []}

def step_ecosystem(state, climate=1.0, harvest=0):
    if not .1 <= climate <= 2 or harvest < 0: raise ValueError("unsafe climate or harvest")
    s = deepcopy(state); p, r = s["populations"], s["resources"]
    water_factor = min(1.25, r["water"] / max(1, p["flora"] * .15))
    growth = int(p["flora"] * .045 * climate * water_factor)
    consumed = min(p["flora"], int(p["herbivore"] * .55) + harvest)
    p["flora"] = min(1_000_000, max(0, p["flora"] + growth - consumed))
    births = int(p["herbivore"] * .08 * climate * min(1, p["flora"] / max(1, p["herbivore"] * 4)))
    predation = min(p["herbivore"], int(p["predator"] * .45))
    p["herbivore"] = min(1_000_000, max(0, p["herbivore"] + births - predation))
    predator_births = int(p["predator"] * .06 * min(1, p["herbivore"] / max(1, p["predator"] * 3)))
    starvation = int(p["predator"] * .04) if p["herbivore"] == 0 else 0
    p["predator"] = min(1_000_000, max(0, p["predator"] + predator_births - starvation))
    r["water"] = max(0, min(1_000_000, r["water"] - max(1, int(p["flora"] * .01)) + int(8 * climate)))
    r["nutrients"] = max(0, min(1_000_000, r["nutrients"] + consumed // 3 - growth // 2))
    s["tick"] += 1
    s["history"] = (s.get("history", []) + [{"tick": s["tick"], "flora": p["flora"], "herbivore": p["herbivore"], "predator": p["predator"]}])[-200:]
    return s
