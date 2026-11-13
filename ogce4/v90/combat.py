"""Strata: Lux Genesis v9.0 duel engine (canonical; web/js/combat.js is the exact port).

Deterministic, integer-only, fixed 20 Hz ticks. The browser runs this in real time for feel and
the Worker replays the same input log from the stored fight config to verify the outcome.
Teen-safe by design: hits are sparks and light, never injuries.
"""
from __future__ import annotations

import json
from pathlib import Path

from .omniverse import DISC, h3, known_principles, fair_test, seed_of

CB = json.loads((Path(__file__).with_name("combat.json")).read_text(encoding="utf-8"))
ACTIONS = ("light", "heavy", "dodge", "block_on", "block_off", "special1", "special2", "flee")
ADAPT_KEYS = ("light", "heavy", "block", "dodge", "parry")


class CombatError(ValueError):
    pass


def _cap(v: int, lo: int, hi: int) -> int:
    return lo if v < lo else hi if v > hi else v


# ---------------------------------------------------------------- progression
def level_of(xp: int) -> int:
    lv = 1
    for i, need in enumerate(CB["skill"]["xp"]):
        if xp >= need:
            lv = i + 1
    return min(lv, CB["skill"]["max_level"])


def parry_window(level: int) -> int:
    return CB["parry"]["window"] + sum(1 for l in CB["parry"]["levels"] if level >= l)


def new_profile() -> dict:
    return {"xp": 0, "mastery": {}, "specials": {}, "loadout": {}, "invented": [], "adapt": {},
            "fights": 0, "wins": 0, "best_combo": 0, "parries": 0, "perfect": 0, "counter": 0, "fight": None, "history": []}


def norm_profile(p) -> dict:
    base = new_profile()
    if isinstance(p, dict):
        for k, v in p.items():
            if k in base and (type(v) is type(base[k]) or (k == "fight" and (v is None or isinstance(v, dict)))):
                base[k] = v
    return base


def special_def(prof: dict, sid: str) -> dict | None:
    d = CB["specials"].get(sid)
    if d is None:
        d = next((m for m in prof["invented"] if m["id"] == sid), None)
    if d is None:
        return None
    rank = _cap(int(prof["specials"].get(sid, 1)), 1, CB["ranks"]["max"])
    out = dict(d)
    out["id"] = sid
    out["rank"] = rank
    out["mult"] = d["mult"] * (100 + CB["ranks"]["mult_per_rank"] * (rank - 1)) // 100
    out["focus"] = max(10, d["focus"] - CB["ranks"]["focus_per_rank"] * (rank - 1))
    return out


def learnable(prof: dict) -> list:
    lv = level_of(prof["xp"])
    return [sid for sid in sorted(CB["specials"]) if CB["specials"][sid]["level"] <= lv and sid not in prof["specials"]]


def learn(prof: dict, sid: str) -> dict:
    d = CB["specials"].get(sid)
    if d is None:
        raise CombatError("unknown_special")
    if sid in prof["specials"]:
        raise CombatError("already_known")
    if level_of(prof["xp"]) < d["level"]:
        raise CombatError("level_too_low")
    prof["specials"][sid] = 1
    if d["weapon"] != "any":  # spells (weapon "any") are equipped by the player on whichever weapon they like
        lo = prof["loadout"].setdefault(d["weapon"], [])
        if len(lo) < CB["loadout"]:
            lo.append(sid)
    return {"learned": sid, "name": d["name"], "rank": 1}


def upgrade(prof: dict, explorer: dict, sid: str) -> dict:
    if sid not in prof["specials"]:
        raise CombatError("not_known")
    rank = int(prof["specials"][sid])
    if rank >= CB["ranks"]["max"]:
        raise CombatError("max_rank")
    cost = CB["ranks"]["cost"][str(rank + 1)]
    bag = explorer["bag"]
    for item in sorted(cost):
        if int(bag.get(item, 0)) < cost[item]:
            raise CombatError("missing_" + item)
    for item in sorted(cost):
        bag[item] = int(bag[item]) - cost[item]
        if bag[item] <= 0:
            del bag[item]
    prof["specials"][sid] = rank + 1
    return {"upgraded": sid, "rank": rank + 1, "cost": cost}


def equip(prof: dict, weapon: str, ids) -> dict:
    if weapon not in CB["weapons"]:
        raise CombatError("unknown_weapon")
    if not isinstance(ids, list) or len(ids) > CB["loadout"]:
        raise CombatError("bad_loadout")
    out = []
    for sid in ids:
        if not isinstance(sid, str) or sid not in prof["specials"] or sid in out:
            raise CombatError("not_known")
        d = special_def(prof, sid)
        if d["weapon"] not in (weapon, "any"):
            raise CombatError("wrong_weapon")
        out.append(sid)
    prof["loadout"][weapon] = out
    return {"weapon": weapon, "loadout": out}


def invent_budget(prof: dict) -> int:
    I = CB["invent"]
    return min(I["budget_max"], I["budget_base"] + I["budget_per_level"] * level_of(prof["xp"]))


def invent_move(prof: dict, explorer: dict, req: dict, seed: int) -> dict:
    """Invent a special move from a shape + 1-2 known principles, validated against the canon laws."""
    I = CB["invent"]
    if not isinstance(req, dict):
        raise CombatError("bad_request")
    weapon, shape, prins = req.get("weapon"), req.get("shape"), req.get("principles")
    if weapon not in CB["weapons"]:
        raise CombatError("unknown_weapon")
    if shape not in I["shapes"]:
        raise CombatError("unknown_shape")
    if not isinstance(prins, list) or not 1 <= len(prins) <= 2 or len(set(map(str, prins))) != len(prins):
        raise CombatError("bad_principles")
    if len(prof["invented"]) >= I["max"]:
        raise CombatError("too_many_moves")
    known = known_principles(explorer)
    for pr in prins:
        if pr not in DISC["principles"]:
            raise CombatError("unknown_principle")
        if pr not in known:
            raise CombatError("principle_not_known")
    S = I["shapes"][shape]
    P0 = DISC["principles"][prins[0]]
    dom = P0["domain"]
    power = S["power"] + sum(4 * DISC["principles"][p]["tier"] for p in prins)
    budget = invent_budget(prof)
    sig = "move:" + weapon + ":" + shape + ":" + "+".join(prins)
    laws = []
    ok = power <= budget
    laws.append({"law": "conservation", "ok": ok, "detail": "power %d within budget %d" % (power, budget)})
    harmonic = (72 * power) % 144 == 0
    laws.append({"law": "harmonic", "ok": True, "detail": "even power resonates with 72/144 (+10% damage)" if harmonic else "odd power: no resonance bonus"})
    score = 40 + 6 * len(prins) + (20 if dom in I["affinity"][shape] else 0) + (8 if len(prins) == 2 and DISC["principles"][prins[1]]["domain"] in I["affinity"][shape] else 0)
    ft = fair_test(seed, sig, score)
    works = ft["successes"] > ft["n"] // 2
    laws.append({"law": "fair_test", "ok": works, "detail": "%d of %d trials succeeded" % (ft["successes"], ft["n"])})
    mystical = any(DISC["principles"][p]["cat"] == "mystical" for p in prins)
    if not ok or not works:
        return {"ok": False, "laws": laws, "power": power, "budget": budget, "fair_test": ft,
                "hint": "Lower the power (fewer or lower-tier principles) or pick a shape that suits the principle's domain."}
    D = I["domains"][dom]
    mid = "inv%d" % (len(prof["invented"]) + 1)
    move = {"id": mid, "weapon": weapon, "name": D["adj"] + " " + S["name"], "level": 1,
            "focus": 25 + power, "windup": S["windup"], "active": S["active"], "recovery": S["recovery"], "hits": S["hits"],
            "mult": S["mult"] + power * 3 + (10 if harmonic else 0), "kb": S["kb"], "stun": S["stun"],
            "effect": D["effect"], "power": power, "close": bool(S.get("close", False)), "invented": True, "principles": list(prins), "shape": shape,
            "fx": {"colour": D["colour"], "particles": 60 + power * 3, "shake": 4 + power // 4, "flash": 1 if power >= 20 else 0, "ring": 1 + power // 12},
            "desc": "Your own %s move powered by %s." % (S["name"].lower(), " and ".join(p.replace("_", " ") for p in prins)),
            "card": [{"label": "FACT", "text": S["fact"]},
                     {"label": "FACT", "text": P0["gcse"]} if P0["cat"] != "mystical" else {"label": "MYSTICAL/IN-GAME", "text": "Symbolic principle: " + P0["gcse"]},
                     {"label": "SSR/CRA THEORY", "text": I["theory"]},
                     {"label": "IN-GAME", "text": "Effect: %s; power %d; %d hit(s)." % (D["effect"], power, S["hits"])}],
            "symbolic": mystical}
    prof["invented"].append(move)
    prof["specials"][mid] = 1
    lo = prof["loadout"].setdefault(weapon, [])
    if len(lo) < CB["loadout"]:
        lo.append(mid)
    return {"ok": True, "laws": laws, "power": power, "budget": budget, "fair_test": ft, "move": move}


# ---------------------------------------------------------------- fight config
def fight_config(prof: dict, seed: int, weapon: str, hp: int, species: str, enemy_level: int, target: str) -> dict:
    if species not in CB["enemies"]:
        raise CombatError("unknown_enemy")
    if weapon not in CB["weapons"]:
        weapon = "fists"
    lv = level_of(prof["xp"])
    E = CB["enemies"][species]
    elv = _cap(int(enemy_level), 1, 20)
    loadout = [special_def(prof, s) for s in prof["loadout"].get(weapon, []) if s in prof["specials"]]
    mem = prof["adapt"].get(species, {})
    return {"seed": seed & 0xFFFFFFFF, "weapon": weapon, "level": lv, "hp": _cap(int(hp), 1, 999),
            "stamina": CB["player"]["stamina"] + CB["player"]["stamina_per_level"] * (lv - 1),
            "parry": parry_window(lv), "loadout": [d for d in loadout if d],
            "enemy": {"species": species, "name": E["name"], "level": elv, "hp": E["hp"] + E["hp_level"] * (elv - 1),
                      "power": E["power"] + E["power_level"] * (elv - 1), "target": target},
            "adapt": {k: int(mem.get(k, 0)) for k in ADAPT_KEYS} | {"fights": int(mem.get("fights", 0))}}


# ---------------------------------------------------------------- simulation
def _fighter(hp: int) -> dict:
    return {"hp": hp, "hpmax": hp, "phase": "idle", "pt": 0, "dur": 0, "move": None, "hk": 0}


def new_fight(cfg: dict) -> dict:
    P = _fighter(cfg["hp"])
    P.update({"st": cfg["stamina"], "stmax": cfg["stamina"], "focus": 0, "blocking": False, "block_t": -999, "combo": 0,
              "last_kind": "", "last_end": -999, "buf": None, "wait": 0, "riposte": False, "focus_until": -1, "start_t": -1})
    E = _fighter(cfg["enemy"]["hp"])
    E.update({"poise": -1, "dazzle": -1, "root": -1, "burn": -1, "burn_next": 0, "side_for": -2})
    return {"cfg": cfg, "t": 0, "dist": CB["range"]["start"], "P": P, "E": E, "over": None,
            "counts": {k: 0 for k in ADAPT_KEYS} | {"special": 0},
            "stats": {"hits": 0, "dealt": 0, "taken": 0, "parries": 0, "perfect": 0, "blocked": 0, "guard_breaks": 0,
                      "streak": 0, "max_combo": 0, "specials": 0, "evaded": 0, "enemy_hits": 0, "finishers": 0},
            "events": []}


def _ev(S: dict, code: str, v=0) -> None:
    S["events"].append([S["t"], code, v])


def _start(F: dict, phase: str, dur: int) -> None:
    F["phase"], F["pt"], F["dur"] = phase, 0, dur


def _shares(S: dict):
    cfg, c = S["cfg"], S["counts"]
    tot_cur = sum(c[k] for k in ADAPT_KEYS)
    comb = {k: cfg["adapt"][k] + c[k] for k in ADAPT_KEYS}
    tot = max(1, sum(comb.values()))
    k = min(100, cfg["adapt"]["fights"] * CB["adapt"]["per_fight"] + tot_cur * 2)
    return {x: comb[x] * 100 // tot for x in ADAPT_KEYS}, k


def _player_move(S: dict, a: str):
    P, cfg, M = S["P"], S["cfg"], CB["moves"]
    t, lv = S["t"], cfg["level"]
    chained = P["last_kind"] == "light" and (P["phase"] == "recovery" or t - P["last_end"] <= CB["combo"]["window"])
    if a == "light":
        idx = P["combo"] if chained else 0
        if idx >= len(CB["combo"]["chain"]) or lv < CB["combo"]["chain_level"][idx]:
            idx = 0
        mv = dict(M["light"])
        mv.update({"kind": "light", "hits": 1, "mult": CB["combo"]["chain"][idx], "cost": M["light"]["stamina"], "chain": idx + 1})
        return mv
    if a == "heavy":
        F = CB["combo"]["finisher"]
        mv = dict(M["heavy"])
        mv.update({"kind": "heavy", "hits": 1, "cost": M["heavy"]["stamina"], "chain": 0})
        if chained and P["combo"] >= F["after"] and lv >= F["level"]:
            mv.update({"kind": "finisher", "mult": F["mult"], "kb": F["kb"], "stun": F["stun"]})
        return mv
    i = 0 if a == "special1" else 1
    if i >= len(cfg["loadout"]):
        return None
    d = cfg["loadout"][i]
    mv = {"kind": "special", "id": d["id"], "windup": d["windup"], "active": d["active"], "recovery": d["recovery"], "hits": d["hits"],
          "mult": d["mult"], "kb": d["kb"], "stun": d["stun"], "effect": d["effect"], "epower": int(d.get("power", 0)),
          "unblockable": bool(d.get("unblockable", False)), "close": bool(d.get("close", False)), "focus": d["focus"], "cost": 0, "chain": 0}
    return mv


def _try_act(S: dict) -> None:
    P = S["P"]
    if P["buf"] is None:
        return
    a, bt = P["buf"]
    t = S["t"]
    if t - bt > CB["player"]["buffer"]:
        P["buf"] = None
        return
    cancel = P["phase"] == "recovery" and P["move"] is not None and P["move"]["kind"] == "light" and P["pt"] >= CB["combo"]["cancel_after"] and a in ("light", "heavy")
    if P["phase"] != "idle" and not cancel:
        return
    P["buf"] = None
    if a == "dodge":
        cost = CB["moves"]["dodge"]["stamina"]
        if P["st"] < cost:
            _ev(S, "tired")
            return
        P["st"] -= cost
        P["wait"] = CB["player"]["regen_delay"]
        P["combo"] = 0
        P["move"] = {"kind": "dodge"}
        _start(P, "dodge", CB["moves"]["dodge"]["dur"])
        S["dist"] = min(CB["range"]["max"], S["dist"] + CB["moves"]["dodge"]["shift"])
        S["counts"]["dodge"] += 1
        _ev(S, "dodge")
        return
    mv = _player_move(S, a)
    if mv is None:
        _ev(S, "no_special")
        return
    if mv["kind"] == "special":
        if P["focus"] < mv["focus"]:
            _ev(S, "no_focus")
            return
        P["focus"] -= mv["focus"]
        S["counts"]["special"] += 1
        S["stats"]["specials"] += 1
        P["combo"] = 0
    else:
        if P["st"] < mv["cost"]:
            _ev(S, "tired")
            return
        P["st"] -= mv["cost"]
        S["counts"]["light" if mv["kind"] == "light" else "heavy"] += 1
        if mv["kind"] == "light":
            P["combo"] = mv["chain"]
        else:
            if mv["kind"] == "finisher":
                S["stats"]["finishers"] += 1
            P["combo"] = 0
    P["wait"] = CB["player"]["regen_delay"]
    P["last_kind"] = mv["kind"]
    reach = CB["weapons"][S["cfg"]["weapon"]]["reach"]
    if mv.get("close"):
        S["dist"] = max(CB["range"]["min"], min(S["dist"], reach - 2))
    elif S["dist"] > reach:
        S["dist"] -= min(S["dist"] - reach, CB["range"]["lunge"])
    P["move"] = mv
    P["start_t"] = t
    _start(P, "windup", mv["windup"])
    _ev(S, mv["kind"] if mv["kind"] != "special" else "special:" + mv["id"])


def _effect(S: dict, mv: dict) -> None:
    E, P, t = S["E"], S["P"], S["t"]
    ef = mv.get("effect", "none")
    X = CB["effects"].get(ef, {})
    bonus = mv.get("epower", 0) // 4
    if ef == "push":
        S["dist"] = min(CB["range"]["max"], S["dist"] + X["kb"] + bonus)
    elif ef == "root":
        E["root"] = t + X["ticks"] + bonus
    elif ef == "dazzle":
        E["dazzle"] = t + X["ticks"] + bonus
    elif ef == "burn":
        E["burn"] = t + X["ticks"]
        E["burn_next"] = t + X["every"]
    elif ef == "stagger":
        _start(E, "stun", mv["stun"] + X["stun"])
    elif ef == "renew":
        P["st"] = min(P["stmax"], P["st"] + X["stamina"] + bonus)
    elif ef == "focus":
        P["focus_until"] = t + X["ticks"]
    if ef != "none":
        _ev(S, "effect:" + ef)


def _player_hit(S: dict, k: int) -> None:
    P, E, cfg, mv = S["P"], S["E"], S["cfg"], S["P"]["move"]
    W = CB["weapons"][cfg["weapon"]]
    if S["dist"] > W["reach"] + (4 if mv.get("kind") == "special" else 0):
        _ev(S, "miss")
        return
    if E["phase"] == "sidestep" and 1 <= E["pt"] <= 4:
        S["stats"]["evaded"] += 1
        _ev(S, "evade")
        return
    raw = W["power"] * mv["mult"] // 100
    raw = raw * (100 + CB["skill"]["dmg_per_level"] * (cfg["level"] - 1)) // 100
    if P["riposte"]:
        raw = raw * CB["parry"]["riposte"] // 100
        P["riposte"] = False
    dmg = max(1, raw - CB["enemies"][cfg["enemy"]["species"]]["armour"])
    heavyish = mv["kind"] in ("heavy", "finisher")
    if E["phase"] == "guard" and not mv.get("unblockable"):
        dmg = max(1, dmg * (CB["block"]["heavy_chip"] if heavyish else CB["block"]["chip"]) // 100)
        E["hp"] = max(0, E["hp"] - dmg)
        S["stats"]["dealt"] += dmg
        _ev(S, "e_blocked", dmg)
        if heavyish:
            _start(E, "stun", CB["block"]["break_stun"])
            _ev(S, "guard_break")
        return
    E["hp"] = max(0, E["hp"] - dmg)
    st = S["stats"]
    st["hits"] += 1
    st["dealt"] += dmg
    st["streak"] += 1
    st["max_combo"] = max(st["max_combo"], st["streak"])
    P["focus"] = min(CB["player"]["focus_max"], P["focus"] + CB["player"]["hit_focus"])
    _ev(S, "hit", dmg)
    armoured = E["phase"] == "windup" and E["move"] is not None and E["move"]["kind"] == "heavy" and mv["kind"] == "light"
    poised = mv["kind"] == "light" and S["t"] < E["poise"]
    if armoured or poised:
        _ev(S, "armour")
    else:
        _start(E, "stun", mv["stun"])
        E["poise"] = S["t"] + mv["stun"] + CB["poise"]
        E["move"] = None
        S["dist"] = min(CB["range"]["max"], S["dist"] + mv["kb"])
    if k == mv["hits"] - 1 and mv["kind"] == "special":
        _effect(S, mv)


def _player_update(S: dict) -> None:
    P = S["P"]
    _try_act(S)
    ph = P["phase"]
    if ph == "idle":
        return
    if ph == "active":
        mv = P["move"]
        n, A = mv["hits"], mv["active"]
        for k in range(n):
            if k * A // n == P["pt"] and S["E"]["hp"] > 0:
                _player_hit(S, k)
    P["pt"] += 1
    if P["pt"] >= P["dur"]:
        if ph == "windup":
            _start(P, "active", P["move"]["active"])
        elif ph == "active":
            _start(P, "recovery", P["move"]["recovery"])
        else:
            if ph == "recovery":
                P["last_end"] = S["t"]
            _start(P, "idle", 0)


def _enemy_start_attack(S: dict, kind: str) -> None:
    E, t, A = S["E"], S["t"], CB["adapt"]
    spec = CB["enemies"][S["cfg"]["enemy"]["species"]]
    sh, k = _shares(S)
    mv = dict(spec["light"] if kind == "light" else spec["heavyMove"])
    mv["kind"] = kind
    feint = (A["feint_up"] * k // 100 if sh["block"] >= A["block_share"] else 0) + (A["parry_feint"] * k // 100 if sh["parry"] >= A["parry_share"] else 0)
    delay = (A["delay_up"] * k // 100 if sh["dodge"] >= A["dodge_share"] else 0) + (A["parry_delay"] * k // 100 if sh["parry"] >= A["parry_share"] else 0)
    if h3(S["cfg"]["seed"], t, 13) % 100 < delay:
        mv["windup"] += A["delay_min"] + h3(S["cfg"]["seed"], t, 17) % A["delay_span"]
        _ev(S, "e_delay")
    E["move"] = mv
    if h3(S["cfg"]["seed"], t, 11) % 100 < feint:
        _start(E, "feint", A["feint_ticks"])
        _ev(S, "e_feint")
        return
    _start(E, "windup", mv["windup"])
    _ev(S, "e_" + kind)


def _enemy_decide(S: dict) -> None:
    E, P, t, A, cfg = S["E"], S["P"], S["t"], CB["adapt"], S["cfg"]
    spec = CB["enemies"][cfg["enemy"]["species"]]
    seed = cfg["seed"]
    if t < E["dazzle"] or S["dist"] > spec["reach"]:
        return
    sh, k = _shares(S)
    pm = P["move"]
    if P["phase"] == "windup" and pm is not None and pm["kind"] in ("heavy", "finisher", "special") and E["side_for"] != P["start_t"] and t >= E["root"]:
        E["side_for"] = P["start_t"]
        chance = spec["dodge"] + (A["sidestep_up"] * k // 100 if sh["heavy"] >= A["heavy_share"] else 0)
        if h3(seed, t, 3) % 100 < chance:
            _start(E, "sidestep", 6)
            S["dist"] = min(CB["range"]["max"], S["dist"] + 6)
            _ev(S, "e_sidestep")
            return
        punish = A["punish"] + (A["punish_up"] * k // 100 if sh["heavy"] >= A["heavy_share"] else 0)
        if P["dur"] - P["pt"] > spec["light"]["windup"] and h3(seed, t, 9) % 100 < punish:
            _enemy_start_attack(S, "light")
            _ev(S, "e_punish")
            return
    if P["phase"] == "windup" and pm is not None and pm["kind"] == "light" and sh["light"] >= A["light_share"]:
        if h3(seed, t, 5) % 100 < A["guard_up"] * k // 100 + spec["guard"] // 2:
            _start(E, "guard", A["guard_ticks"])
            _ev(S, "e_guard")
            return
    heavy_p = spec["heavy"] + (A["heavy_up"] * k // 100 if sh["block"] >= A["block_share"] else 0)
    guard_p = spec["guard"] + (A["guard_up"] * k // 100 if sh["light"] >= A["light_share"] else 0)
    r = h3(seed, t, 7) % 100
    if r < heavy_p:
        _enemy_start_attack(S, "heavy")
    elif r < heavy_p + spec["aggr"]:
        _enemy_start_attack(S, "light")
    elif r < heavy_p + spec["aggr"] + guard_p:
        _start(E, "guard", A["guard_ticks"])
        _ev(S, "e_guard")
    else:
        _start(E, "wait", A["wait_ticks"])


def _enemy_hit(S: dict) -> None:
    E, P, cfg, t = S["E"], S["P"], S["cfg"], S["t"]
    spec = CB["enemies"][cfg["enemy"]["species"]]
    mv = E["move"]
    if S["dist"] > spec["reach"]:
        _ev(S, "e_miss")
        return
    D = CB["moves"]["dodge"]
    if P["phase"] == "dodge" and D["i_from"] <= P["pt"] <= D["i_to"]:
        S["stats"]["perfect"] += 1
        P["focus"] = min(CB["player"]["focus_max"], P["focus"] + CB["player"]["dodge_focus"])
        _ev(S, "perfect_dodge")
        return
    raw = cfg["enemy"]["power"] * mv["mult"] // 100
    heavy = mv["kind"] == "heavy"
    if P["phase"] == "idle" and P["blocking"]:
        win = cfg["parry"] + (CB["effects"]["focus"]["parry"] if t <= P["focus_until"] else 0)
        if t - P["block_t"] <= win:
            _start(E, "stun", CB["parry"]["stun"])
            E["move"] = None
            P["focus"] = min(CB["player"]["focus_max"], P["focus"] + CB["player"]["parry_focus"])
            P["riposte"] = True
            S["stats"]["parries"] += 1
            S["counts"]["parry"] += 1
            _ev(S, "parry")
            return
        dmg = raw * (CB["block"]["heavy_chip"] if heavy else CB["block"]["chip"]) // 100
        drain = CB["block"]["heavy_drain"] if heavy else max(1, raw * CB["block"]["drain"] // 100)
        P["hp"] = max(0, P["hp"] - dmg)
        P["st"] = max(0, P["st"] - drain)
        S["stats"]["taken"] += dmg
        S["stats"]["blocked"] += 1
        _ev(S, "blocked", dmg)
        if P["st"] == 0:
            P["blocking"] = False
            _start(P, "stun", CB["block"]["break_stun"])
            S["stats"]["guard_breaks"] += 1
            _ev(S, "guard_broken")
        return
    P["hp"] = max(0, P["hp"] - raw)
    S["stats"]["taken"] += raw
    S["stats"]["enemy_hits"] += 1
    S["stats"]["streak"] = 0
    P["combo"] = 0
    P["buf"] = None
    P["move"] = {"kind": "stun"}
    _start(P, "stun", mv["stun"])
    S["dist"] = min(CB["range"]["max"], S["dist"] + mv["kb"])
    _ev(S, "hurt", raw)


def _enemy_update(S: dict) -> None:
    E = S["E"]
    if E["hp"] <= 0:
        return
    ph = E["phase"]
    if ph == "idle":
        _enemy_decide(S)
        return
    if ph == "active" and E["pt"] == 0:
        _enemy_hit(S)
        if E["phase"] != "active":
            return
    E["pt"] += 1
    if E["pt"] >= E["dur"]:
        if ph == "feint":
            mv = dict(E["move"])
            mv.update(CB["enemies"][S["cfg"]["enemy"]["species"]]["light"])
            mv["kind"] = "light"
            mv["windup"] = 2
            E["move"] = mv
            _start(E, "windup", 2)
        elif ph == "windup":
            _start(E, "active", E["move"]["active"])
        elif ph == "active":
            _start(E, "recovery", E["move"]["recovery"])
        else:
            _start(E, "idle", 0)


def step(S: dict, actions) -> dict:
    """Advance one tick with this tick's actions."""
    if S["over"]:
        return S
    P, E, t = S["P"], S["E"], S["t"]
    for a in actions:
        if a == "block_on":
            if not P["blocking"]:
                P["blocking"] = True
                P["block_t"] = t
                S["counts"]["block"] += 1
        elif a == "block_off":
            P["blocking"] = False
        elif a == "flee":
            S["over"] = "fled"
        else:
            P["buf"] = [a, t]
    if S["over"]:
        S["t"] = t + 1
        return S
    _player_update(S)
    _enemy_update(S)
    if P["wait"] > 0:
        P["wait"] -= 1
    elif P["phase"] == "idle":
        P["st"] = min(P["stmax"], P["st"] + (CB["player"]["regen_block"] if P["blocking"] else CB["player"]["regen"]))
    if t < E["burn"] and t >= E["burn_next"] and E["hp"] > 0:
        X = CB["effects"]["burn"]
        E["hp"] = max(0, E["hp"] - X["dmg"])
        E["burn_next"] = t + X["every"]
        S["stats"]["dealt"] += X["dmg"]
        _ev(S, "burn", X["dmg"])
    spec = CB["enemies"][S["cfg"]["enemy"]["species"]]
    if E["phase"] in ("idle", "wait") and S["dist"] > spec["reach"] and t >= E["root"] and t >= E["dazzle"]:
        S["dist"] = max(spec["reach"] - 1, S["dist"] - spec["speed"])
    S["dist"] = _cap(S["dist"], CB["range"]["min"], CB["range"]["max"])
    if E["hp"] <= 0:
        S["over"] = "win"
        _ev(S, "win")
    elif P["hp"] <= 0:
        S["over"] = "lose"
        _ev(S, "lose")
    S["t"] = t + 1
    if not S["over"] and S["t"] >= CB["max_ticks"]:
        S["over"] = "timeout"
    return S


def validate_inputs(inputs) -> list:
    if not isinstance(inputs, list) or len(inputs) > CB["max_inputs"]:
        raise CombatError("bad_inputs")
    last, per = -1, 0
    out = []
    for it in inputs:
        if not isinstance(it, list) or len(it) != 2 or type(it[0]) is not int or not isinstance(it[1], str):
            raise CombatError("bad_inputs")
        t, a = it
        if a not in ACTIONS or t < 0 or t >= CB["max_ticks"] or t < last:
            raise CombatError("bad_inputs")
        per = per + 1 if t == last else 1
        if per > CB["max_per_tick"]:
            raise CombatError("bad_inputs")
        last = t
        out.append([t, a])
    return out


def run_fight(cfg: dict, inputs) -> dict:
    ins = validate_inputs(inputs)
    S = new_fight(cfg)
    i = 0
    while not S["over"]:
        acts = []
        while i < len(ins) and ins[i][0] == S["t"]:
            acts.append(ins[i][1])
            i += 1
        step(S, acts)
    return summary(S)


def summary(S: dict) -> dict:
    return {"outcome": S["over"], "ticks": S["t"], "player": {"hp": S["P"]["hp"], "st": S["P"]["st"], "focus": S["P"]["focus"]},
            "enemy": {"hp": S["E"]["hp"], "hpmax": S["E"]["hpmax"]}, "stats": dict(S["stats"]), "counts": dict(S["counts"]),
            "events": S["events"]}


def apply_result(prof: dict, cfg: dict, res: dict) -> dict:
    """Skill XP, mastery, records and enemy pattern memory (decayed by half each fight)."""
    Sk, st = CB["skill"], res["stats"]
    win = res["outcome"] == "win"
    xp = (Sk["xp_win"] + Sk["xp_win_level"] * cfg["enemy"]["level"]) if win else (Sk["xp_loss"] if res["outcome"] in ("lose", "timeout") else 0)
    xp += 2 * st["parries"] + st["perfect"] + 2 * min(st["max_combo"], 10) + 2 * st["specials"] + 3 * st["finishers"]
    if res["outcome"] == "fled":
        xp = min(xp, 4)
    xp = min(Sk["xp_cap"], xp)
    before = level_of(prof["xp"])
    prof["xp"] += xp
    after = level_of(prof["xp"])
    w = cfg["weapon"]
    prof["mastery"][w] = int(prof["mastery"].get(w, 0)) + st["hits"]
    prof["fights"] += 1
    prof["wins"] += 1 if win else 0
    prof["best_combo"] = max(prof["best_combo"], st["max_combo"])
    prof["parries"] += st["parries"]
    prof["perfect"] += st["perfect"]
    sp = cfg["enemy"]["species"]
    mem = prof["adapt"].get(sp, {})
    prof["adapt"][sp] = {k: int(mem.get(k, 0)) // 2 + res["counts"][k] for k in ADAPT_KEYS} | {"fights": min(99, int(mem.get("fights", 0)) + 1)}
    prof["history"] = (prof["history"] + [[sp, res["outcome"], res["ticks"], xp]])[-8:]
    prof["fight"] = None
    return {"xp": xp, "level": after, "levelled": after > before, "unlocked": [s for s in sorted(CB["specials"]) if before < CB["specials"][s]["level"] <= after]}


def adapt_summary(prof: dict) -> dict:
    out = {}
    for sp, mem in sorted(prof["adapt"].items()):
        tot = max(1, sum(int(mem.get(k, 0)) for k in ADAPT_KEYS))
        top = max(ADAPT_KEYS, key=lambda k: (int(mem.get(k, 0)), k))
        out[sp] = {"fights": int(mem.get("fights", 0)), "habit": top if int(mem.get(top, 0)) else None,
                   "shares": {k: int(mem.get(k, 0)) * 100 // tot for k in ADAPT_KEYS}}
    return out


def combat_view(prof: dict) -> dict:
    lv = level_of(prof["xp"])
    nxt = CB["skill"]["xp"][lv] if lv < len(CB["skill"]["xp"]) else None
    return {"label": CB["label"], "level": lv, "xp": prof["xp"], "next": nxt, "parry_window": parry_window(lv),
            "stamina": CB["player"]["stamina"] + CB["player"]["stamina_per_level"] * (lv - 1),
            "specials": {sid: special_def(prof, sid) for sid in sorted(prof["specials"])}, "learnable": learnable(prof),
            "loadout": prof["loadout"], "mastery": prof["mastery"], "fights": prof["fights"], "wins": prof["wins"],
            "best_combo": prof["best_combo"], "parries": prof["parries"], "perfect": prof["perfect"],
            "adapt": adapt_summary(prof), "invent_budget": invent_budget(prof), "history": prof["history"]}
