"""Strata: Lux Genesis core backbone (canonical; cloudflare/src/genesis.js is the exact port).

Premise, main objective, success measures (Lux, Strata Reached, Codex, Mastery, Legacy), the seven core-law puzzles,
choice-driven endings and New Genesis cycles. Progress is derived from what the player has actually done (facts),
so Lux can't be farmed separately from understanding.
"""
from __future__ import annotations

import json
from pathlib import Path

GEN = json.loads((Path(__file__).with_name("genesis.json")).read_text(encoding="utf-8"))
LAWS = {l["id"]: l for l in GEN["laws"]}
FACT_KEYS = ("discoveries", "inventions", "principles", "explored", "allies", "secrets", "quests", "quiz", "choices",
             "invented_moves", "specials", "crafts", "wins", "legacy", "combat_level", "clues", "codex", "realms")


class GenesisError(ValueError):
    pass


def new_record() -> dict:
    return {"cycle": 0, "laws": [], "attempts": {}, "ending": None, "endings": [], "claimed": [], "unlocked": [], "title": "title_newcomer", "archive": []}


def norm_record(r) -> dict:
    base = new_record()
    if isinstance(r, dict):
        for k, v in r.items():
            if k in base and (type(v) is type(base[k]) or (k == "ending" and (v is None or isinstance(v, str)))):
                base[k] = v
    return base


def norm_facts(f) -> dict:
    f = f if isinstance(f, dict) else {}
    return {k: max(0, int(f.get(k, 0))) if type(f.get(k, 0)) is int else 0 for k in FACT_KEYS}


def lux(rec: dict, facts: dict) -> dict:
    W, f = GEN["lux"], facts
    parts = {
        "discoveries": f["discoveries"] * W["discovery"], "inventions": f["inventions"] * W["invention"], "principles": f["principles"] * W["principle"],
        "exploring": min(W["explored_cap"], f["explored"] * W["explored"]), "allies": f["allies"] * W["ally"], "secrets": f["secrets"] * W["secret"],
        "quests": f["quests"] * W["quest"], "puzzles": f["quiz"] * W["quiz"] + len(rec["laws"]) * W["law"], "choices": min(W["choice_cap"], f["choices"] * W["choice"]),
        "moves": f["invented_moves"] * W["invented_move"] + f["specials"] * W["special"], "crafting": min(W["craft_cap"], f["crafts"] * W["craft"]),
        "fights": min(W["win_cap"], f["wins"] * W["win"]), "legacy": min(W["legacy_cap"], f["legacy"] * W["legacy"]),
    }
    total = sum(parts.values())
    combat = parts["fights"]
    return {"total": total, "parts": parts, "understanding_pct": (total - combat) * 100 // max(1, total)}


def strata_list(cycle: int) -> list:
    D = GEN["deep"]
    scale = 100 + D["scale"] * cycle
    out = [{"id": s["id"], "name": s["name"], "lux": s["lux"] * scale // 100, "laws": s["laws"]} for s in GEN["strata"]]
    top = out[-1]["lux"]
    for i in range(D["per_cycle"] * cycle):
        out.append({"id": "deep%d" % (i + 1), "name": "%s %d" % (D["name"], i + 1), "lux": top + D["lux_step"] * (i + 1) * scale // 100, "laws": 7})
    return out


def stratum_index(rec: dict, total: int) -> int:
    idx = 0
    for i, s in enumerate(strata_list(rec["cycle"])):
        if total >= s["lux"] and len(rec["laws"]) >= s["laws"]:
            idx = i
        else:
            break
    return idx


def _met(need: dict, facts: dict, extra: dict) -> bool:
    for k in sorted(need):
        v = need[k]
        if k == "ending_id":
            if v not in extra["endings"]:
                return False
        elif k in extra:
            if extra[k] < v:
                return False
        elif facts.get(k, 0) < v:
            return False
    return True


def _extra(rec: dict, facts: dict) -> dict:
    total = lux(rec, facts)["total"]
    return {"lux": total, "stratum": stratum_index(rec, total), "laws": len(rec["laws"]), "ending": 1 if rec["ending"] else 0, "endings": list(rec["endings"])}


def claim_law(rec: dict, facts: dict, law_id: str, answer) -> dict:
    L = LAWS.get(law_id)
    if L is None:
        raise GenesisError("unknown_law")
    if law_id in rec["laws"]:
        raise GenesisError("already_claimed")
    if not _met(L["need"], facts, {}):
        raise GenesisError("law_locked")
    if type(answer) is not int or not 0 <= answer < len(L["options"]):
        raise GenesisError("bad_answer")
    n = int(rec["attempts"].get(law_id, 0)) + 1
    rec["attempts"][law_id] = n
    if answer != L["answer"]:
        return {"correct": False, "law": law_id, "attempts": n, "hint": "Not quite. Look again at the FACT clue and try another answer."}
    rec["laws"].append(law_id)
    return {"correct": True, "law": law_id, "value": L["value"], "name": L["name"], "fact": L["fact"], "theory": L["theory"], "lux": GEN["lux"]["law"]}


def endings_view(rec: dict, facts: dict) -> list:
    ex = _extra(rec, facts)
    at_source = ex["stratum"] >= 7
    out = []
    for eid in ("harmony", "power", "sacrifice", "stranger"):
        E = GEN["endings"][eid]
        visible = not E["hidden"] or facts["clues"] > 0 or eid in rec["endings"]
        out.append({"id": eid, "name": E["name"] if visible else "???", "hidden": not visible, "need": E["need"] if visible else {},
                    "available": at_source and _met(E["need"], facts, ex), "chosen": eid in rec["endings"],
                    "text": E["text"] if eid in rec["endings"] else None, "hint": GEN["clue_hint"] if eid == "stranger" and not visible else None})
    return out


def choose_ending(rec: dict, facts: dict, eid: str) -> dict:
    if eid not in GEN["endings"]:
        raise GenesisError("unknown_ending")
    if rec["ending"]:
        raise GenesisError("ending_already_chosen")
    ex = _extra(rec, facts)
    if ex["stratum"] < 7:
        raise GenesisError("reach_the_source_first")
    if not _met(GEN["endings"][eid]["need"], facts, ex):
        raise GenesisError("ending_locked")
    rec["ending"] = eid
    rec["endings"].append(eid)
    return {"ending": eid, "name": GEN["endings"][eid]["name"], "text": GEN["endings"][eid]["text"], "cycle": rec["cycle"]}


def rewards_view(rec: dict, facts: dict) -> list:
    ex = _extra(rec, facts)
    return [{"id": r["id"], "kind": r["kind"], "name": r["name"], "need": r["need"], "ready": _met(r["need"], facts, ex),
             "claimed": r["id"] in rec["claimed"] or r["id"] in rec["unlocked"]} for r in GEN["rewards"]]


def claim_reward(rec: dict, facts: dict, explorer: dict, rid: str) -> dict:
    R = next((r for r in GEN["rewards"] if r["id"] == rid), None)
    if R is None:
        raise GenesisError("unknown_reward")
    if rid in rec["claimed"]:
        raise GenesisError("already_claimed")
    if not _met(R["need"], facts, _extra(rec, facts)):
        raise GenesisError("reward_locked")
    rec["claimed"].append(rid)
    if R["kind"] == "material":
        for item in sorted(R["grant"]):
            explorer["bag"][item] = int(explorer["bag"].get(item, 0)) + R["grant"][item]
    elif rid not in rec["unlocked"]:
        rec["unlocked"].append(rid)
    if R["kind"] == "title":
        rec["title"] = rid
    return {"reward": rid, "kind": R["kind"], "name": R["name"], "grant": R.get("grant", {})}


def set_title(rec: dict, rid: str) -> dict:
    if rid not in rec["unlocked"] or not rid.startswith("title_"):
        raise GenesisError("title_locked")
    rec["title"] = rid
    return {"title": rid}


def new_genesis(rec: dict, facts: dict, explorer: dict, confirm) -> dict:
    """Start a new cycle: fresh seed, deeper strata, harder foes; Codex (inventions + laws) carries over."""
    if confirm is not True:
        raise GenesisError("confirm_required")
    if not rec["ending"]:
        raise GenesisError("finish_the_story_first")
    rec["archive"] = (rec["archive"] + [{"cycle": rec["cycle"], "ending": rec["ending"], "laws": list(rec["laws"]),
                                         "inventions": [i.get("name", i.get("id", "")) for i in explorer.get("inventions", []) if isinstance(i, dict)][:24]}])[-12:]
    keep = {"inventions": explorer.get("inventions", []), "appearance": explorer.get("appearance", {})}
    rec["cycle"] += 1
    rec["laws"] = []
    rec["attempts"] = {}
    rec["ending"] = None
    rec["claimed"] = [c for c in rec["claimed"] if not c.startswith("mat_")]
    return {"cycle": rec["cycle"], "keep": keep, "deeper": len(strata_list(rec["cycle"])), "foe_bonus": rec["cycle"]}


def genesis_view(rec: dict, facts: dict) -> dict:
    L = lux(rec, facts)
    sl = strata_list(rec["cycle"])
    si = stratum_index(rec, L["total"])
    nxt = sl[si + 1] if si + 1 < len(sl) else None
    laws = []
    for l in GEN["laws"]:
        claimed = l["id"] in rec["laws"]
        laws.append({"id": l["id"], "value": l["value"], "name": l["name"], "realm": l["realm"], "need": l["need"],
                     "unlocked": _met(l["need"], facts, {}), "claimed": claimed, "q": l["q"], "options": l["options"],
                     "attempts": int(rec["attempts"].get(l["id"], 0)), "fact": l["fact"] if claimed else None, "theory": l["theory"] if claimed else None})
    return {"label": GEN["label"], "premise": GEN["premise"], "objective": GEN["objective"], "after": GEN["after"], "lux_note": GEN["lux_note"],
            "cycle": rec["cycle"], "lux": L, "stratum": {"index": si, "name": sl[si]["name"], "of": len(sl), "next": nxt, "source": si >= 7},
            "strata": sl, "laws": laws, "laws_claimed": len(rec["laws"]), "endings": endings_view(rec, facts), "ending": rec["ending"],
            "rewards": rewards_view(rec, facts), "title": rec["title"], "unlocked": rec["unlocked"], "archive": rec["archive"],
            "measures": {"lux": L["total"], "strata_reached": si, "codex": facts["codex"], "mastery": facts["combat_level"] + facts["specials"] + facts["crafts"] // 5,
                         "legacy": facts["legacy"]},
            "facts": facts}


def facts_from(explorer: dict, prof90: dict, combat: dict, legacy: int) -> dict:
    """Derive progress facts from the existing records (omniverse explorer, chronicle profile, combat profile, world deltas)."""
    from .omniverse import known_principles
    from .combat import level_of
    npc = explorer.get("npc", {}) if isinstance(explorer.get("npc"), dict) else {}
    mems = [m for _, m in sorted(npc.items()) if isinstance(m, dict)]
    stats = prof90.get("stats", {}) if isinstance(prof90, dict) and isinstance(prof90.get("stats"), dict) else {}
    st = lambda k: stats.get(k, 0) if type(stats.get(k, 0)) is int else 0
    invs = [i for i in explorer.get("inventions", []) if isinstance(i, dict)]
    invented = [m for m in combat.get("invented", []) if isinstance(m, dict)]
    poet = npc.get("poet") if isinstance(npc.get("poet"), dict) else {}
    clues = (1 if poet.get("secret") is True else 0) + (1 if any(i.get("category") == "mystical" for i in invs) or any(m.get("symbolic") is True for m in invented) else 0) \
        + (1 if explorer.get("ending") else 0) + (1 if explorer.get("custom_realms") else 0)
    realms = sorted({str(e).split(":")[0] for e in explorer.get("explored", [])})
    principles = len(known_principles(explorer))
    return norm_facts({
        "discoveries": len(explorer.get("bestiary", [])), "inventions": len(invs), "principles": principles,
        "explored": len(explorer.get("explored", [])), "allies": sum(1 for m in mems if m.get("ally") is True),
        "secrets": sum(1 for m in mems if m.get("secret") is True),
        "quests": len(explorer.get("quests", [])) + sum(len(m["done"]) for m in mems if isinstance(m.get("done"), list)),
        "quiz": st("correct"), "choices": len(explorer.get("flags", [])), "invented_moves": len(invented),
        "specials": max(0, len(combat.get("specials", {})) - len(invented)), "crafts": st("crafted") + st("built"),
        "wins": int(combat.get("wins", 0)) + st("defeated"), "legacy": max(0, int(legacy)) + sum(1 for m in mems if m.get("rel", 0) != 0),
        "combat_level": level_of(int(combat.get("xp", 0))), "clues": clues, "codex": len(invs) + len(invented) + principles, "realms": len(realms)})
