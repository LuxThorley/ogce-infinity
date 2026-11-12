"""Seeded quest and chronicle generation with explicit authored-content boundaries."""
import random
def generate_quest(seed,region="the frontier"):
    r=random.Random(seed); goals=["recover an ancient seal","escort a wandering scholar","restore the river shrine","map a forgotten passage"]
    threats=["a fading blight","a rival guild","an awakened sentinel","a sudden storm"]
    rewards=["a crafted relic","settlement provisions","an old map","a reputation boon"]
    return {"id":f"quest-{seed}","title":r.choice(["Echoes","The Last Ember","Beyond the Veil","A New Accord"]),
            "region":region,"objective":r.choice(goals),"complication":r.choice(threats),"reward":r.choice(rewards),
            "state":"available","generation":"seeded-template-v1"}
def chronicle_event(tick,kind,summary,actors=()):
    if len(summary)>500: raise ValueError("chronicle summary too long")
    return {"tick":int(tick),"kind":kind,"summary":summary,"actors":list(actors)}
