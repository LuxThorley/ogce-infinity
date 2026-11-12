"""Persistent settlement, trade, diplomacy and conflict primitives."""
from copy import deepcopy

def create_civilization(name, settlements=(), culture="frontier"):
    if not name or len(name) > 100: raise ValueError("invalid civilization name")
    return {"name": name, "culture": culture, "settlements": list(settlements),
            "relations": {}, "treaties": [], "wars": [], "ledger": [], "turn": 0}

def set_relation(civ, other, value):
    if other == civ["name"] or not -100 <= value <= 100: raise ValueError("invalid diplomatic relation")
    out = deepcopy(civ); out["relations"][other] = int(value); return out

def negotiate(civ, other, treaty, accepted=True):
    if len(treaty) > 80: raise ValueError("treaty label too long")
    out = deepcopy(civ)
    if accepted:
        item = {"with": other, "name": treaty, "turn": out["turn"]}
        if item not in out["treaties"]: out["treaties"].append(item)
        out["relations"][other] = min(100, out["relations"].get(other, 0) + 10)
    else:
        out["relations"][other] = max(-100, out["relations"].get(other, 0) - 3)
    out["ledger"].append({"turn": out["turn"], "event": "treaty_accepted" if accepted else "talks_failed", "with": other})
    return out

def declare_conflict(civ, other, cause="border dispute"):
    out = deepcopy(civ)
    if any(w["with"] == other and w["status"] == "active" for w in out["wars"]): return out
    out["wars"].append({"with": other, "cause": cause[:160], "status": "active", "started": out["turn"]})
    out["relations"][other] = -100
    out["ledger"].append({"turn": out["turn"], "event": "conflict_started", "with": other})
    return out

def civilization_tick(civ, settlement_states=()):
    out = deepcopy(civ); out["turn"] += 1
    out["settlements"] = list(settlement_states) if settlement_states else out["settlements"]
    out["ledger"].append({"turn": out["turn"], "event": "turn_advanced", "settlements": len(out["settlements"])})
    out["ledger"] = out["ledger"][-500:]
    return out

def trade(settlement_a, settlement_b, resource, amount):
    if amount <= 0 or amount > 1_000_000: raise ValueError("trade amount outside safe bounds")
    a, b = deepcopy(settlement_a), deepcopy(settlement_b)
    if a.get("stock", {}).get(resource, 0) < amount: raise ValueError("insufficient stock")
    a["stock"][resource] -= amount
    b.setdefault("stock", {})[resource] = b.get("stock", {}).get(resource, 0) + amount
    return a, b
