"""Deterministic world-event scheduler and persistent chronicle."""
import random
EVENTS = (
    ("migration", "A group of families arrives from a distant region"),
    ("drought", "A prolonged dry spell strains local water reserves"),
    ("festival", "A seasonal gathering strengthens community ties"),
    ("discovery", "Explorers uncover an old route beyond the settlement"),
    ("storm", "A severe storm disrupts travel and trade"),
)
def generate_event(seed, tick, region="the frontier"):
    rng = random.Random(f"{seed}:{tick}:{region}")
    kind, summary = rng.choice(EVENTS)
    return {"id": f"event-{seed}-{tick}", "tick": int(tick), "region": region, "kind": kind, "summary": summary}

def append_chronicle(chronicle, event, max_events=1000):
    if max_events < 1 or len(chronicle) > max_events: raise ValueError("invalid chronicle bound")
    if any(e.get("id") == event.get("id") for e in chronicle): return list(chronicle)
    result = list(chronicle) + [dict(event)]
    return result[-max_events:]
