"""Strata: Lux Genesis omniverse (v9.0): seeded, practically infinite realms with simulated life.

Everything is deterministic integer arithmetic, so the same seed and inputs give the same world in Python
and in the Cloudflare JS port (parity-tested via golden fixtures). Simulated life is labelled honestly:
creatures, plants and characters follow simple rules and are not alive or aware.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

OMNI = json.loads((Path(__file__).with_name("omni.json")).read_text(encoding="utf-8"))
M = 0xFFFFFFFF
CH = OMNI["chunk"]
HAB = OMNI["habitat"]
REALMS = {r["id"]: r for r in OMNI["realms"]}
SPECIES = ["duskwolf", "glowmoth", "mossback"]
MAX_STEPS = 24
MAX_CUSTOM_REALMS = 8


class OmniError(ValueError):
    pass


def mix32(a: int) -> int:
    a &= M
    a ^= a >> 16
    a = (a * 0x7FEB352D) & M
    a ^= a >> 15
    a = (a * 0x846CA68B) & M
    a ^= a >> 16
    return a


def h3(seed: int, x: int, y: int) -> int:
    return mix32((seed & M) ^ mix32(((x * 73856093) & M) ^ mix32((y * 19349663 + 83492791) & M)))


def seed_of(text: str) -> int:
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & M
    return h


def noise(seed: int, x: int, y: int, scale: int) -> int:
    gx, gy = x // scale, y // scale
    fx, fy = x - gx * scale, y - gy * scale
    v00, v10 = h3(seed, gx, gy) & 1023, h3(seed, gx + 1, gy) & 1023
    v01, v11 = h3(seed, gx, gy + 1) & 1023, h3(seed, gx + 1, gy + 1) & 1023
    top = v00 * (scale - fx) + v10 * fx
    bot = v01 * (scale - fx) + v11 * fx
    return (top * (scale - fy) + bot * fy) // (scale * scale)


def realm_of(realm_id: str, custom: dict | None = None) -> dict:
    if realm_id in REALMS:
        return REALMS[realm_id]
    if custom and realm_id in custom:
        return custom[realm_id]
    raise OmniError("unknown_realm")


def sample(realm: dict, x: int, y: int) -> tuple[str, int]:
    s = realm["seed"]
    h = (2 * noise(s, x, y, 32) + noise(s + 1, x, y, 12) + noise(s + 2, x, y, 5)) // 4 + realm["hbias"]
    if x * x + y * y < 400:  # a guaranteed island around every realm's origin
        h = max(h, 470 + (20 - (abs(x) + abs(y)) // 2))
    m = noise(s + 7, x, y, 40) + realm["mbias"]
    t = noise(s + 13, x, y, 64) + realm["tbias"]
    if x * x + y * y < 400:
        t, m = max(t, 420 + realm["tbias"] // 2), max(m, 380)
    if h < 380:
        return "O", h
    if h < 420:
        return "B", h
    if h > 800:
        return ("T" if t < 520 else "P"), h
    if realm["special"] == "lux" and noise(s + 21, x, y, 18) > 640:
        return "L", h
    if noise(s + 21, x, y, 20) > 760:
        return "C", h
    if t < 230:
        return "T", h
    if m < 330 and t > 520:
        return "D", h
    if m > 560:
        return "F", h
    return "M", h


def natural_feature(realm: dict, biome: str, x: int, y: int) -> str | None:
    r = h3(realm["seed"] + 99, x, y) % 1000
    for kind, limit in OMNI["features"][biome]:
        if r < limit:
            return kind
    return None


def feature_at(realm: dict, deltas: dict, x: int, y: int, tick: int) -> str | None:
    biome, _ = sample(realm, x, y)
    d = deltas.get(f"{x},{y}")
    if d:
        kind, at = d
        if kind == "-":
            if tick - at < OMNI["regrow"]:
                return None
        else:
            grow = OMNI["grows"].get(kind)
            if grow and tick - at >= grow[1]:
                return grow[0]
            return kind
    return natural_feature(realm, biome, x, y)


def chunk(realm: dict, cx: int, cy: int, lod: int = 0, deltas: dict | None = None, tick: int = 0, difficulty: int = 1, density: int = 1) -> dict:
    deltas = deltas or {}
    out = {"realm": realm["id"], "cx": cx, "cy": cy, "lod": lod}
    x0, y0 = cx * CH, cy * CH
    if lod >= 2:
        counts: dict[str, int] = {}
        for j in range(0, CH, 4):
            for i in range(0, CH, 4):
                b = sample(realm, x0 + i + 2, y0 + j + 2)[0]
                counts[b] = counts.get(b, 0) + 1
        out["biome"] = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        return out
    step = 1 if lod == 0 else 4
    tiles, heights = [], []
    for j in range(0, CH, step):
        for i in range(0, CH, step):
            b, h = sample(realm, x0 + i + step // 2, y0 + j + step // 2)
            tiles.append(b)
            heights.append(h >> 4)
    out["tiles"], out["heights"] = "".join(tiles), heights
    if lod == 0:
        feats = []
        for j in range(CH):
            for i in range(CH):
                f = feature_at(realm, deltas, x0 + i, y0 + j, tick)
                if f:
                    feats.append([x0 + i, y0 + j, f])
        out["features"] = feats
        poi = None
        if h3(realm["seed"] + 555, cx, cy) % 13 == 0:
            px, py = x0 + 4 + h3(realm["seed"] + 556, cx, cy) % 8, y0 + 4 + h3(realm["seed"] + 557, cx, cy) % 8
            if sample(realm, px, py)[0] != "O":
                poi = {"x": px, "y": py, "kind": "ruin", "name": f"Ruin of the {['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh'][h3(realm['seed'], cx, cy) % 7]} Lantern"}
        out["poi"] = poi
        spawns = []
        n = min(4, h3(realm["seed"] + 31, cx, cy) % 3 + density + difficulty // 3 - 1)
        for k in range(max(0, n)):
            sx, sy = x0 + h3(realm["seed"] + 40 + k, cx, cy) % CH, y0 + h3(realm["seed"] + 60 + k, cx, cy) % CH
            b = sample(realm, sx, sy)[0]
            if b == "O":
                continue
            sp = SPECIES[h3(realm["seed"] + 80 + k, cx, cy) % 3]
            spawns.append({"id": f"w{cx}_{cy}_{k}", "species": sp, "x": sx, "y": sy, "hue": h3(realm["seed"] + 90 + k, cx, cy) % 360})
        out["spawns"] = spawns
    return out


# ---------------------------------------------------------------- ecology (utility AI, heritable traits)
def new_ecology(realm: dict) -> dict:
    s = realm["seed"]
    plants = {}
    for k in range(140):
        x, y = h3(s + 200, k, 1) % HAB, h3(s + 201, k, 2) % HAB
        plants[f"{x},{y}"] = h3(s + 202, k, 3) % 4
    creatures, nid = [], 1
    for sp, count in (("mossback", 18), ("duskwolf", 4), ("glowmoth", 8)):
        base = OMNI["species"][sp]["base"]
        for k in range(count):
            r = h3(s + 300, nid, 0)
            creatures.append({"id": nid, "sp": sp, "x": r % HAB, "y": (r >> 8) % HAB, "e": 60 + r % 30, "age": (r >> 16) % 20, "gen": 0,
                              "t": [base[0], base[1], base[2], (r >> 4) % 360], "mem": [-1, -1], "cd": 0})
            nid += 1
    return {"realm": realm["id"], "tick": 0, "next": nid, "plants": plants, "creatures": creatures, "log": [], "policy": {"predator_cap": 12},
            "births": 0, "deaths": 0, "caught": 0}


def _clamp(v: int, lo: int, hi: int) -> int:
    return lo if v < lo else hi if v > hi else v


def _dist(a: dict, x: int, y: int) -> int:
    return abs(a["x"] - x) + abs(a["y"] - y)


def _toward(c: dict, tx: int, ty: int, steps: int, away: bool = False) -> None:
    for k in range(steps):
        dx, dy = (tx > c["x"]) - (tx < c["x"]), (ty > c["y"]) - (ty < c["y"])
        if away:
            dx, dy = -dx or 1, -dy or 1
        if (k + c["id"]) % 2 == 0 and dx:
            c["x"] = _clamp(c["x"] + dx, 0, HAB - 1)
        elif dy:
            c["y"] = _clamp(c["y"] + dy, 0, HAB - 1)
        elif dx:
            c["x"] = _clamp(c["x"] + dx, 0, HAB - 1)


def _log(eco: dict, text: str) -> None:
    eco["log"].append([eco["tick"], text])
    eco["log"] = eco["log"][-30:]


def eco_step(eco: dict, seed: int) -> dict:
    eco["tick"] += 1
    t = eco["tick"]
    plants = eco["plants"]
    alive = sorted(eco["creatures"], key=lambda c: c["id"])
    gone: set[int] = set()
    born = []
    counts = {sp: 0 for sp in SPECIES}
    for c in alive:
        counts[c["sp"]] += 1
    caps = {sp: OMNI["species"][sp]["cap"] for sp in SPECIES}
    caps["duskwolf"] = eco["policy"].get("predator_cap", caps["duskwolf"])
    for c in alive:
        if c["id"] in gone:
            continue
        rng = h3(seed ^ t, c["id"], 7)
        speed, size, sense = c["t"][0], c["t"][1], c["t"][2]
        c["age"] += 1
        c["cd"] = max(0, c["cd"] - 1)
        c["e"] -= 1 + size // 2 + speed // 3
        near = [o for o in alive if o["id"] != c["id"] and o["id"] not in gone and _dist(c, o["x"], o["y"]) <= sense]
        threat = None
        if c["sp"] == "mossback":
            wolves = sorted((o for o in near if o["sp"] == "duskwolf"), key=lambda o: (_dist(c, o["x"], o["y"]), o["id"]))
            threat = wolves[0] if wolves else None
        food = None
        if c["sp"] == "duskwolf":
            prey = sorted((o for o in near if o["sp"] == "mossback"), key=lambda o: (_dist(c, o["x"], o["y"]), o["id"]))
            food = (prey[0]["x"], prey[0]["y"], prey[0]) if prey else None
        else:
            need = 3 if c["sp"] == "glowmoth" else 1
            best = None
            for dy in range(-sense, sense + 1):
                rem = sense - abs(dy)
                for dx in range(-rem, rem + 1):
                    x, y = c["x"] + dx, c["y"] + dy
                    st = plants.get(f"{x},{y}")
                    if st is not None and st >= need:
                        key = (abs(dx) + abs(dy), y, x)
                        if best is None or key < best[0]:
                            best = (key, x, y)
            food = (best[1], best[2], None) if best else None
        mate = None
        if c["e"] >= 60 and c["age"] >= 12 and c["cd"] == 0 and counts[c["sp"]] < caps[c["sp"]]:
            ms = sorted((o for o in near if o["sp"] == c["sp"] and o["e"] >= 60 and o["age"] >= 12 and o["cd"] == 0), key=lambda o: (_dist(c, o["x"], o["y"]), o["id"]))
            mate = ms[0] if ms else None
        hunger = 100 - c["e"]
        scores = [
            ("flee", 400 if threat else 0),
            ("eat", hunger * 3 if food else (60 + hunger if c["mem"][0] >= 0 else 0)),
            ("mate", 200 if mate else 0),
            ("rest", 50 if c["e"] < 20 and not food else 0),
            ("wander", 30 + rng % 20),
        ]
        act = max(scores, key=lambda s: s[1])[0]
        if act == "flee":
            _toward(c, threat["x"], threat["y"], speed, away=True)
        elif act == "eat":
            tx, ty = (food[0], food[1]) if food else (c["mem"][0], c["mem"][1])
            _toward(c, tx, ty, speed)
            if food and _dist(c, tx, ty) <= 1:
                if c["sp"] == "duskwolf":
                    prey = food[2]
                    if speed + rng % 3 - eco["policy"].get("calm", 0) >= prey["t"][0] + (rng >> 4) % 3:
                        gone.add(prey["id"])
                        counts["mossback"] -= 1
                        c["e"] = min(100, c["e"] + 70)
                        eco["caught"] += 1
                        if eco["caught"] % 5 == 1:
                            _log(eco, "A Duskwolf caught a Mossback.")
                else:
                    key = f"{tx},{ty}"
                    st = plants[key]
                    if c["sp"] == "glowmoth":
                        c["e"] = min(100, c["e"] + 12)
                        nx, ny = _clamp(tx + rng % 3 - 1, 0, HAB - 1), _clamp(ty + (rng >> 3) % 3 - 1, 0, HAB - 1)
                        if f"{nx},{ny}" not in plants and len(plants) < 500:
                            plants[f"{nx},{ny}"] = 0
                    else:
                        c["e"] = min(100, c["e"] + 10 * st + 5)
                        plants[key] = 0
                    c["mem"] = [tx, ty]
            elif not food and _dist(c, tx, ty) == 0:
                c["mem"] = [-1, -1]
        elif act == "mate":
            _toward(c, mate["x"], mate["y"], speed)
            if _dist(c, mate["x"], mate["y"]) <= 1:
                kid_t = []
                for i in range(3):
                    mut = h3(seed ^ t, c["id"] * 31 + mate["id"], i) % 3 - 1
                    kid_t.append(_clamp((c["t"][i] + mate["t"][i]) // 2 + mut, 1, 8 if i == 2 else 5))
                kid_t.append((c["t"][3] + mate["t"][3]) // 2 % 360)
                born.append({"id": eco["next"], "sp": c["sp"], "x": c["x"], "y": c["y"], "e": 50, "age": 0, "gen": max(c["gen"], mate["gen"]) + 1,
                             "t": kid_t, "mem": [-1, -1], "cd": 8})
                eco["next"] += 1
                counts[c["sp"]] += 1
                c["e"] -= 30
                mate["e"] -= 30
                c["cd"] = mate["cd"] = 10
                eco["births"] += 1
                if eco["births"] % 4 == 1:
                    _log(eco, f"A young {OMNI['species'][c['sp']]['name']} hatched (generation {born[-1]['gen']}).")
        elif act == "wander":
            _toward(c, rng % HAB, (rng >> 8) % HAB, 1)
        if c["e"] <= 0 or c["age"] > 120 + size * 10:
            gone.add(c["id"])
            counts[c["sp"]] -= 1
            eco["deaths"] += 1
    eco["creatures"] = [c for c in alive if c["id"] not in gone] + born
    for key in sorted(plants.keys()):
        st = plants[key]
        x, y = (int(v) for v in key.split(","))
        r = h3(seed ^ t, x, y + 5000)
        if st < 3:
            if r % 100 < 30 + eco["policy"].get("growth_bonus", 0):
                plants[key] = st + 1
        elif r % 100 < 6 + eco["policy"].get("spread_bonus", 0) and len(plants) < 500:
            nx, ny = _clamp(x + (r >> 8) % 3 - 1, 0, HAB - 1), _clamp(y + (r >> 12) % 3 - 1, 0, HAB - 1)
            if f"{nx},{ny}" not in plants:
                plants[f"{nx},{ny}"] = 0
    # Reseed a species that has died out at a habitat edge, so the world never ends.
    for sp in SPECIES:
        if sum(1 for c in eco["creatures"] if c["sp"] == sp) < 2 and t % 20 == 0:
            base = OMNI["species"][sp]["base"]
            for k in range(2):
                eco["creatures"].append({"id": eco["next"], "sp": sp, "x": k * (HAB - 1), "y": HAB // 2, "e": 70, "age": 12, "gen": 0,
                                         "t": [base[0], base[1], base[2], 30 + k * 40], "mem": [-1, -1], "cd": 0})
                eco["next"] += 1
            _log(eco, f"{OMNI['species'][sp]['name']}s wandered in from the next stratum.")
    return eco


def evolve(eco: dict, realm: dict, to_tick: int) -> int:
    n = 0
    while eco["tick"] < to_tick and n < MAX_STEPS:
        eco_step(eco, realm["seed"])
        n += 1
    return n


def census(eco: dict) -> dict:
    out = {}
    for sp in SPECIES:
        cs = [c for c in eco["creatures"] if c["sp"] == sp]
        n = len(cs)
        out[sp] = {"count": n, "speed": (sum(c["t"][0] for c in cs) * 10 // n) if n else 0, "size": (sum(c["t"][1] for c in cs) * 10 // n) if n else 0,
                   "sense": (sum(c["t"][2] for c in cs) * 10 // n) if n else 0, "max_gen": max((c["gen"] for c in cs), default=0)}
    out["plants"] = len(eco["plants"])
    out["flowering"] = sum(1 for v in eco["plants"].values() if v == 3)
    return out


def eco_view(eco: dict) -> dict:
    return {"realm": eco["realm"], "tick": eco["tick"], "habitat": HAB, "census": census(eco), "log": eco["log"][-10:], "policy": eco["policy"],
            "creatures": [[c["id"], c["sp"], c["x"], c["y"], c["e"], c["gen"], c["t"][3]] for c in sorted(eco["creatures"], key=lambda c: c["id"])],
            "plants": [[int(k.split(",")[0]), int(k.split(",")[1]), v] for k, v in sorted(eco["plants"].items())],
            "births": eco["births"], "deaths": eco["deaths"], "caught": eco["caught"], "label": OMNI["label"]}


# ---------------------------------------------------------------- explorer profile, NPCs, factions, endings
def new_explorer() -> dict:
    return {"realm": "aurelia", "x": 0, "y": 0, "bag": {}, "tools": [], "rep": {f: 0 for f in OMNI["factions"]}, "npc": {}, "flags": [], "quests": [],
            "bestiary": [], "explored": [], "appearance": {"skin": 1, "hair": 1, "outfit": 0, "hat": 0, "cape": 0}, "ending": None, "custom_realms": {},
            "inventions": [], "perks": {}, "attempts": 0}


def norm_explorer(p: dict | None) -> dict:
    base = new_explorer()
    if isinstance(p, dict):
        for k, v in p.items():
            if k in base and type(v) is type(base[k]) or (k == "ending" and (v is None or isinstance(v, str))):
                base[k] = v
    return base


def _rel_tier(rel: int) -> int:
    return 0 if rel < 15 else 1 if rel < 40 else 2


def npc_line(npc_id: str, rel: int, times: int, seed: int) -> str:
    npc = OMNI["npcs"][npc_id]
    greet = npc["greet"][_rel_tier(rel)]
    tips = ["The Wildwood changes every day; check the census.", "Creatures pass their traits to their young. Watch the averages shift.",
            "Every stratum is seeded: same seed, same land.", "Gifts I like make me trust you more."]
    return f"{greet} {tips[h3(seed, times, len(npc_id)) % len(tips)]}"


def _has(bag: dict, needs: dict) -> bool:
    return all(bag.get(k, 0) >= v for k, v in needs.items())


def _pay(bag: dict, needs: dict) -> None:
    for k, v in needs.items():
        bag[k] -= v
        if bag[k] <= 0:
            del bag[k]


def _visit(p: dict, realm_id: str, x: int, y: int) -> None:
    key = f"{realm_id}:{x // CH},{y // CH}"
    if key not in p["explored"] and len(p["explored"]) < 5000:
        p["explored"].append(key)


def ending_for(p: dict) -> str:
    rep = p["rep"]
    if all(v >= 10 for v in rep.values()):
        return "accord"
    return sorted(rep.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]


def talk(p: dict, npc_id: str, node: str = "start", choice: int | None = None, seed: int = 0) -> dict:
    if npc_id not in OMNI["npcs"]:
        raise OmniError("unknown_npc")
    npc = OMNI["npcs"][npc_id]
    if abs(p["x"] - npc["x"]) + abs(p["y"] - npc["y"]) > 3 or p["realm"] != "aurelia":
        raise OmniError("too_far")
    mem = p["npc"].setdefault(npc_id, {"rel": 0, "times": 0, "last": None, "gifts": 0})
    flag = f"met_{npc_id}"
    if flag not in p["flags"]:
        p["flags"].append(flag)
    if node not in npc["nodes"]:
        raise OmniError("unknown_node")
    out = {"npc": npc_id, "name": npc["name"], "faction": npc["faction"]}
    if choice is None:
        mem["times"] += 1
        n = npc["nodes"][node]
        if p["inventions"]:
            out["remark"] = npc_remark(npc_id, p["inventions"][-1])
        out.update(node=node, line=npc_line(npc_id, mem["rel"], mem["times"], seed), text=n["text"],
                   choices=[{"i": i, "label": c["label"], "locked": not all(f in p["flags"] for f in c.get("require", []))} for i, c in enumerate(n["choices"])])
        return out
    n = npc["nodes"][node]
    if not isinstance(choice, int) or not 0 <= choice < len(n["choices"]):
        raise OmniError("bad_choice")
    c = n["choices"][choice]
    if not all(f in p["flags"] for f in c.get("require", [])):
        raise OmniError("choice_locked")
    for f, d in c.get("rep", {}).items():
        p["rep"][f] = _clamp(p["rep"][f] + d, -100, 100)
    if c.get("rep", {}).get(npc["faction"], 0) > 0:
        mem["rel"] = _clamp(mem["rel"] + c["rep"][npc["faction"]], -100, 100)
    for f in ([c["flag"]] if c.get("flag") else []):
        if f not in p["flags"]:
            p["flags"].append(f)
    if c.get("quest") and c["quest"] not in p["quests"]:
        p["quests"].append(c["quest"])
    mem["last"] = f"{node}:{choice}"
    out["policy"] = c.get("policy")
    nxt = c["next"]
    if c.get("flag") == "council":
        p["ending"] = ending_for(p)
        out["ending"] = {"id": p["ending"], **OMNI["endings"][p["ending"]]}
    if nxt != "end":
        nn = npc["nodes"][nxt]
        out.update(node=nxt, text=nn["text"], choices=[{"i": i, "label": cc["label"], "locked": not all(f in p["flags"] for f in cc.get("require", []))} for i, cc in enumerate(nn["choices"])])
    else:
        out.update(node="end", text="", choices=[])
    out["rep"] = dict(p["rep"])
    return out


def gift(p: dict, npc_id: str, item: str) -> dict:
    if npc_id not in OMNI["npcs"]:
        raise OmniError("unknown_npc")
    if p["bag"].get(item, 0) < 1:
        raise OmniError("missing_item")
    npc = OMNI["npcs"][npc_id]
    _pay(p["bag"], {item: 1})
    mem = p["npc"].setdefault(npc_id, {"rel": 0, "times": 0, "last": None, "gifts": 0})
    liked = item in npc["likes"]
    gain = 8 if liked else 2
    mem["rel"] = _clamp(mem["rel"] + gain, -100, 100)
    mem["gifts"] += 1
    p["rep"][npc["faction"]] = _clamp(p["rep"][npc["faction"]] + gain // 2, -100, 100)
    return {"npc": npc_id, "liked": liked, "rel": mem["rel"]}


def explorer_act(p: dict, op: str, body: dict, realm: dict, deltas: dict, tick: int, eco: dict | None, seed: int = 0) -> dict:
    """Apply one explorer action. `deltas` is the realm's persistent change map {"x,y": [kind, tick]}."""
    if op == "move":
        x, y = body.get("x"), body.get("y")
        if not isinstance(x, int) or not isinstance(y, int) or isinstance(x, bool) or isinstance(y, bool):
            raise OmniError("bad_position")
        if abs(x - p["x"]) + abs(y - p["y"]) > 12 + p["perks"].get("stride", 0):
            raise OmniError("too_far")
        if abs(x) > 1_000_000 or abs(y) > 1_000_000:
            raise OmniError("edge_of_strata")
        if sample(realm, x, y)[0] == "O" and "boat" not in p["flags"]:
            raise OmniError("water")
        p["x"], p["y"] = x, y
        _visit(p, realm["id"], x, y)
        return {"x": x, "y": y, "biome": sample(realm, x, y)[0]}
    if op == "travel":
        if realm["id"] not in REALMS and realm["id"] not in p["custom_realms"]:
            raise OmniError("unknown_realm")
        p["realm"], p["x"], p["y"] = realm["id"], 0, 0
        _visit(p, realm["id"], 0, 0)
        return {"realm": realm["id"], "name": realm["name"]}
    if op == "harvest":
        x, y = body.get("x"), body.get("y")
        if not isinstance(x, int) or not isinstance(y, int) or abs(x - p["x"]) + abs(y - p["y"]) > 2 + p["perks"].get("reach", 0):
            raise OmniError("too_far")
        f = feature_at(realm, deltas, x, y, tick)
        item = OMNI["harvest"].get(f or "")
        if not item:
            raise OmniError("nothing_to_harvest")
        n = 2 if (item == "wood" and "axe" in p["tools"]) or (item in ("stone", "crystal") and "pickaxe" in p["tools"]) else 1
        n += p["perks"].get("yield:" + item, 0)
        if p["perks"].get("boost", 0) > 0:
            n *= 2
            p["perks"]["boost"] -= 1
        p["bag"][item] = p["bag"].get(item, 0) + n
        deltas[f"{x},{y}"] = ["-", tick]
        return {"item": item, "count": n, "regrows_in": OMNI["regrow"]}
    if op == "place":
        kind, x, y = body.get("kind"), body.get("x"), body.get("y")
        if isinstance(kind, str) and kind.startswith("inv:"):
            return place_invention(p, kind, x, y, realm, deltas, tick, eco)
        cost = OMNI["place"].get(kind if isinstance(kind, str) else "")
        if cost is None:
            raise OmniError("unknown_build")
        if not isinstance(x, int) or not isinstance(y, int) or abs(x - p["x"]) + abs(y - p["y"]) > 2:
            raise OmniError("too_far")
        if feature_at(realm, deltas, x, y, tick) or sample(realm, x, y)[0] == "O":
            raise OmniError("occupied")
        if not _has(p["bag"], cost):
            raise OmniError("missing_resources")
        _pay(p["bag"], cost)
        deltas[f"{x},{y}"] = [kind, tick]
        return {"placed": kind, "x": x, "y": y}
    if op == "craft":
        r = OMNI["recipes"].get(body.get("recipe") if isinstance(body.get("recipe"), str) else "")
        if r is None:
            raise OmniError("unknown_recipe")
        if not _has(p["bag"], r["needs"]):
            raise OmniError("missing_resources")
        _pay(p["bag"], r["needs"])
        name = body["recipe"]
        if r["kind"] in ("tool", "weapon"):
            if name not in p["tools"]:
                p["tools"].append(name)
        else:
            p["bag"][name] = p["bag"].get(name, 0) + 1
        return {"crafted": name, "kind": r["kind"]}
    if op == "observe":
        if eco is None:
            raise OmniError("no_habitat")
        cid = body.get("creature")
        c = next((c for c in eco["creatures"] if c["id"] == cid), None)
        if c is None:
            raise OmniError("unknown_creature")
        tagged = "field_net" in p["tools"]
        entry = c["sp"] if not tagged else f"{c['sp']}:g{c['gen']}"
        if entry not in p["bestiary"] and len(p["bestiary"]) < 400:
            p["bestiary"].append(entry)
        out = {"species": c["sp"], "gen": c["gen"], "traits": {"speed": c["t"][0], "size": c["t"][1], "sense": c["t"][2]}, "energy": c["e"], "tagged": tagged}
        if p["perks"].get("insight"):
            out["hidden"] = {"age": c["age"], "memory": list(c["mem"]), "hue": c["t"][3]}
        return out
    if op == "customise":
        a = body.get("appearance")
        if not isinstance(a, dict):
            raise OmniError("bad_appearance")
        opts = OMNI["appearance"]
        for k, v in a.items():
            if k not in opts or not isinstance(v, int) or isinstance(v, bool) or not 0 <= v < len(opts[k]):
                raise OmniError("bad_appearance")
        p["appearance"].update(a)
        return {"appearance": dict(p["appearance"])}
    if op == "invent":
        return invent(p, body, seed, tick, eco)
    if op == "use":
        return use_invention(p, body.get("item"))
    if op == "create_realm":
        name = str(body.get("name", ""))[:40].strip()
        if not name or len(p["custom_realms"]) >= MAX_CUSTOM_REALMS:
            raise OmniError("bad_realm")
        warmth, wet, height = (_clamp(int(body.get(k, 0)) if isinstance(body.get(k, 0), int) else 0, -3, 3) for k in ("warmth", "wetness", "height"))
        rid = f"c{seed_of(name + str(body.get('seed', ''))) % 1000000}"
        p["custom_realms"][rid] = {"id": rid, "name": name, "seed": seed_of(str(body.get("seed", name))), "hbias": height * 40, "mbias": wet * 90,
                                   "tbias": warmth * 110, "special": "lux" if body.get("lux") is True else "crystal", "blurb": "A stratum you seeded yourself."}
        return {"realm": p["custom_realms"][rid]}
    raise OmniError("unknown_omni_operation")


def explorer_view(p: dict) -> dict:
    return {"realm": p["realm"], "x": p["x"], "y": p["y"], "bag": dict(p["bag"]), "tools": list(p["tools"]), "rep": dict(p["rep"]),
            "npc": {k: dict(v) for k, v in p["npc"].items()}, "flags": list(p["flags"]), "quests": list(p["quests"]),
            "bestiary": list(p["bestiary"]), "explored": len(p["explored"]), "appearance": dict(p["appearance"]),
            "ending": None if not p["ending"] else {"id": p["ending"], **OMNI["endings"][p["ending"]]},
            "custom_realms": list(p["custom_realms"].values()),
            "inventions": [dict(i) for i in p["inventions"]], "perks": dict(p["perks"]), "attempts": p["attempts"],
            "principles": known_principles(p), "budget": invention_budget(p)}


# ---------------------------------------------------------------- discoveries, inventions and innovations
DISC = OMNI["discovery"]
CATEGORIES = ("scientific", "technological", "mystical")
DOMAIN_ITEM = {"light": "crystal", "motion": "wood", "sense": "shell", "heat": "stone", "growth": "petal", "life": "berries", "calm": "fibre"}


def _met(p: dict, req: str) -> bool:
    kind, _, arg = req.partition(":")
    if kind == "obs":
        return any(b.split(":")[0] == arg for b in p["bestiary"])
    if kind == "item":
        return p["bag"].get(arg, 0) > 0 or arg in p["tools"]
    if kind == "inv":
        return any(i["domain"] == arg for i in p["inventions"])
    if kind == "inv_count":
        return len(p["inventions"]) >= int(arg)
    if kind == "rep":
        f, _, n = arg.partition(":")
        return p["rep"].get(f, 0) >= int(n)
    return False


def known_principles(p: dict) -> list:
    return [k for k in sorted(DISC["principles"]) if all(_met(p, r) for r in DISC["principles"][k]["requires"])]


def invention_budget(p: dict) -> int:
    return min(40, 8 + 4 * len(p["inventions"]))


def npc_remark(npc_id: str, inv: dict) -> str:
    fac = OMNI["npcs"][npc_id]["faction"]
    if inv["domain"] in DISC["affinity"][fac]:
        return f"I heard about your {inv['name']}. That's exactly the kind of thing we need!"
    return f"Your {inv['name']}… interesting, if not quite our way."


def _signature(cat: str, form: str, prs: list, mats: dict, obs) -> str:
    return "|".join([cat, form, ",".join(sorted(prs)), ",".join(f"{k}{v}" for k, v in sorted(mats.items())), obs or "-"])


def explain_invention(inv: dict) -> str:
    prs = DISC["principles"]
    how = "; and ".join(prs[k]["gcse"] for k in inv["principles"])
    mats = ", ".join(f"{v} {k}" for k, v in sorted(inv["materials"].items()))
    text = (f"{inv['name']} is a {inv['category']} {inv['form']}. How it works: {how}. Made from {mats}"
            + (f", inspired by watching the {inv['observation']}" if inv["observation"] else "") + f". In the game: {inv['effect']}.")
    if inv["category"] == "mystical":
        text += " " + DISC["label_mystical"]
    return text


def _effect_text(form: str, domain: str, m: int, item: str) -> str:
    e = DISC["effects"][form]
    if isinstance(e, dict):
        e = e.get(domain, "a small, steady benefit")
    return e.replace("{m}", str(m)).replace("{item}", item)


def invent(p: dict, body: dict, seed: int, tick: int, eco: dict | None) -> dict:
    cat, form, prs, mats, obs = body.get("category"), body.get("form"), body.get("principles"), body.get("materials"), body.get("observation")
    if cat not in CATEGORIES:
        raise OmniError("bad_category")
    if form not in DISC["forms"]:
        raise OmniError("bad_form")
    if form == "ritual" and cat != "mystical":
        raise OmniError("rituals_are_mystical")
    if not isinstance(prs, list) or not 1 <= len(prs) <= 2 or len(set(prs)) != len(prs) or not all(isinstance(k, str) and k in DISC["principles"] for k in prs):
        raise OmniError("bad_principles")
    cats = [DISC["principles"][k]["cat"] for k in prs]
    if cat == "mystical" and any(c != "mystical" for c in cats) or cat != "mystical" and ("mystical" in cats or cat not in cats):
        raise OmniError("category_mismatch")
    known = known_principles(p)
    if any(k not in known for k in prs):
        raise OmniError("principle_locked")
    if not isinstance(mats, dict) or not 1 <= len(mats) <= 3:
        raise OmniError("bad_materials")
    for k, v in mats.items():
        if k not in DISC["materials"] or not isinstance(v, int) or isinstance(v, bool) or not 1 <= v <= 5:
            raise OmniError("bad_materials")
    if sum(mats.values()) > 8:
        raise OmniError("bad_materials")
    if not _has(p["bag"], mats):
        raise OmniError("missing_resources")
    if obs is not None and (not isinstance(obs, str) or not any(b.split(":")[0] == obs for b in p["bestiary"])):
        raise OmniError("not_observed")
    sig = _signature(cat, form, prs, mats, obs)
    if any(i["sig"] == sig for i in p["inventions"]):
        raise OmniError("already_discovered")
    top = sorted(prs, key=lambda k: (-DISC["principles"][k]["tier"], k))[0]
    domain = DISC["principles"][top]["domain"]
    power = sum(DISC["principles"][k]["tier"] * 2 for k in prs) + sum(v * DISC["materials"][k][1] for k, v in mats.items()) + (2 if obs else 0)
    budget = invention_budget(p)
    if power > budget:  # conservation law
        raise OmniError("too_ambitious")
    if len(p["inventions"]) >= DISC["max_inventions"]:  # finite carrier bound
        raise OmniError("carrier_full")
    stratum = min(CANON["constants"]["strata"] - 1, power // 6)
    if stratum > max((i.get("stratum", 0) for i in p["inventions"]), default=0) + 1:  # stratum ascent
        raise OmniError("stratum_too_high")
    p["attempts"] += 1
    fits = DISC["forms"][form]
    compat = 40 if fits[0] == domain else 30 if domain in fits else 0
    mat_fit = 20 if any(DISC["materials"][k][0] == domain for k in mats) else 0
    obs_fit = 15 if obs else 0
    harmonic = (CANON["constants"]["involution_shift"] * power) % CANON["constants"]["carrier_small"] == 0
    score = compat + mat_fit + obs_fit + (10 if harmonic else 0)
    trials = fair_test(seed, sig, score)
    if trials["successes"] <= CANON["constants"]["trial_threshold"]:
        hints = []
        if not compat:
            hints.append(f"a {domain} idea doesn't suit a {form}; try a {' / '.join(fits)} idea")
        if not mat_fit:
            hints.append(f"add a material linked to {domain}")
        if not obs:
            hints.append("an observation from the Wildwood would help")
        return {"ok": False, "score": score, "trials": trials, "needed": CANON["constants"]["trial_threshold"] + 1, "harmonic": harmonic,
                "hint": "; ".join(hints) or "close! change one ingredient and try again"}
    before = set(known)
    _pay(p["bag"], mats)
    m = _clamp(1 + power // 10, 1, 3)
    item = DOMAIN_ITEM[domain]
    names = DISC["names"]
    name = f"{names['domain'][domain][h3(seed, seed_of(sig), 5) % 3]} {names['form'][form][h3(seed, seed_of(sig), 6) % 3]}"
    if any(i["name"] == name for i in p["inventions"]):
        name += f" Mk {len(p['inventions']) + 1}"
    inv = {"id": f"i{len(p['inventions']) + 1}", "sig": sig, "name": name, "category": cat, "form": form, "domain": domain, "principles": list(prs),
           "materials": dict(mats), "observation": obs, "m": m, "power": power, "score": score, "tick": tick, "effect": _effect_text(form, domain, m, item),
           "stratum": stratum, "harmonic": harmonic, "trials": trials, "half_life_days": CANON_HALF_CENTI * (stratum + 1) / 100}
    inv["explain"] = explain_invention(inv)
    p["inventions"].append(inv)
    pk = p["perks"]
    applied = {}
    if form == "tool":
        pk["yield:" + item] = applied["yield:" + item] = min(2, pk.get("yield:" + item, 0) + m)
    elif form == "ability":
        key, cap, add = {"sense": ("reach", 4, m), "motion": ("stride", 8, 2 * m), "life": ("insight", 1, 1), "calm": ("calm", 3, m)}.get(domain, ("insight", 1, 1))
        pk[key] = applied[key] = min(cap, pk.get(key, 0) + add)
    elif form in ("structure", "effect"):
        k = "inv:" + inv["id"]
        p["bag"][k] = p["bag"].get(k, 0) + (1 if form == "structure" else m)
        applied[k] = p["bag"][k]
    elif form == "ritual":
        pk["blessing"] = applied["blessing"] = min(3, pk.get("blessing", 0) + m)
        if eco is not None:
            eco["policy"]["spread_bonus"] = min(6, eco["policy"].get("spread_bonus", 0) + 2 * m)
            applied["spread_bonus"] = eco["policy"]["spread_bonus"]
    rep = {}
    for f, doms in sorted(DISC["affinity"].items()):
        if domain in doms:
            d = 3 * m if form == "ritual" else 2
            p["rep"][f] = _clamp(p["rep"][f] + d, -100, 100)
            rep[f] = d
    unlocked = [k for k in known_principles(p) if k not in before]
    return {"ok": True, "invention": {k: v for k, v in inv.items() if k != "sig"}, "applied": applied, "rep": rep, "unlocked": unlocked}


def place_invention(p: dict, kind: str, x, y, realm: dict, deltas: dict, tick: int, eco: dict | None) -> dict:
    inv = next((i for i in p["inventions"] if "inv:" + i["id"] == kind and i["form"] == "structure"), None)
    if inv is None or p["bag"].get(kind, 0) < 1:
        raise OmniError("unknown_build")
    if not isinstance(x, int) or not isinstance(y, int) or abs(x - p["x"]) + abs(y - p["y"]) > 2 + p["perks"].get("reach", 0):
        raise OmniError("too_far")
    if feature_at(realm, deltas, x, y, tick) or sample(realm, x, y)[0] == "O":
        raise OmniError("occupied")
    _pay(p["bag"], {kind: 1})
    deltas[f"{x},{y}"] = [kind, tick]
    policy = {}
    if eco is not None:
        pol, m = eco["policy"], inv["m"]
        if inv["domain"] in ("growth", "heat"):
            pol["growth_bonus"] = policy["growth_bonus"] = min(25, pol.get("growth_bonus", 0) + (5 if inv["domain"] == "growth" else 3) * m)
        else:
            pol["calm"] = policy["calm"] = min(3, pol.get("calm", 0) + m)
    return {"placed": kind, "name": inv["name"], "x": x, "y": y, "policy": policy}


def use_invention(p: dict, item) -> dict:
    if not isinstance(item, str) or p["bag"].get(item, 0) < 1:
        raise OmniError("missing_item")
    inv = next((i for i in p["inventions"] if "inv:" + i["id"] == item and i["form"] == "effect"), None)
    if inv is None:
        raise OmniError("not_usable")
    _pay(p["bag"], {item: 1})
    p["perks"]["boost"] = min(9, p["perks"].get("boost", 0) + 3)
    return {"used": inv["name"], "boost": p["perks"]["boost"]}


# ---------------------------------------------------------------- canon validation engine and discovery cards
CANON = OMNI["canon"]
CANON_HALF_CENTI = 1232  # 12.32 days in hundredths (tritium: 4500 d = 12.32 yr)


def fair_test(seed: int, sig: str, score: int) -> dict:
    """144 seeded Bernoulli trials (1/1000 of the doctrine's 144,000-trial protocol); works if more than 72 succeed."""
    n = CANON["constants"]["trials"]
    p = _clamp(score * 10, 0, 1000)
    sh = seed_of(sig)
    k = sum(1 for i in range(n) if h3(seed, sh, 100 + i) % 1000 < p)
    return {"n": n, "p_permille": p, "successes": k}


def _hundredths(x_num: int, den: int) -> str:
    v = (x_num * 100 * 2 + den) // (2 * den)  # round half up, integers only
    return f"{v // 100}.{v % 100:02d}"


def _f2(x: float) -> str:
    v = math.floor(x * 100 + 0.5)
    return f"{v // 100}.{v % 100:02d}"


def build_card(inv: dict, ai_lines: list | None = None) -> dict:
    C, L, F = CANON["constants"], CANON["laws"], CANON["formulas"]
    prs = DISC["principles"]
    st = [{"label": "IN-GAME", "text": f"{inv['name']} is an in-game {inv['category']} {inv['form']} on stratum M{inv['stratum']}."},
          {"label": "IN-GAME", "text": f"Effect in the game: {inv['effect']}."},
          {"label": "IN-GAME", "text": "Made from " + ", ".join(f"{v} {k}" for k, v in sorted(inv["materials"].items()))
           + (f", inspired by observing the {inv['observation']}" if inv["observation"] else "") + "."}]
    for k in inv["principles"]:
        pr = prs[k]
        lab = "FACT" if pr["cat"] != "mystical" else ("SSR/CRA THEORY" if k == "strata_resonance" else "MYSTICAL/IN-GAME")
        st.append({"label": lab, "text": f"{k.replace('_', ' ').capitalize()}: {pr['gcse']}."})
    st += [{"label": "FACT", "text": L["conservation"]["fact"]}, {"label": "IN-GAME", "text": L["conservation"]["game"]},
           {"label": "FACT", "text": L["fair_test"]["fact"]},
           {"label": "IN-GAME", "text": f"Fair test: {inv['trials']['successes']} of {inv['trials']['n']} seeded trials worked (more than {C['trial_threshold']} needed)."},
           {"label": "SSR/CRA THEORY", "text": L["stratum"]["theory"]}, {"label": "IN-GAME", "text": L["stratum"]["game"]},
           {"label": "FACT", "text": L["harmonic"]["fact"]}, {"label": "SSR/CRA THEORY", "text": L["harmonic"]["theory"]},
           {"label": "IN-GAME", "text": "Harmonic: yes, +10 stability (power is even, so 72 × power is a whole number of 144-cycles)." if inv["harmonic"]
            else "Harmonic: no (power is odd, so 72 × power leaves 72 over on ℤ144)."},
           {"label": "FACT", "text": L["half_life"]["fact"]}, {"label": "IN-GAME", "text": L["half_life"]["game"]}]
    if inv["category"] == "mystical":
        st += [{"label": "FACT", "text": L["year_clock"]["fact"]}, {"label": "SSR/CRA THEORY", "text": L["year_clock"]["theory"]},
               {"label": "MYSTICAL/IN-GAME", "text": DISC["label_mystical"]}]
    maths, seen = [], set()
    for k in inv["principles"]:
        fid = CANON["principle_formula"][k]
        if fid not in seen:
            seen.add(fid)
            maths.append({"id": fid, "label": "FACT", "plain": F[fid]["plain"], "mathml": F[fid]["mathml"], "worked": ""})
    pm, n = inv["trials"]["p_permille"], inv["trials"]["n"]
    sd = math.sqrt(n * pm * (1000 - pm)) / 1000
    maths.append({"id": "binomial", "label": "FACT", "plain": F["binomial"]["plain"], "mathml": F["binomial"]["mathml"],
                  "worked": f"n = {n}, p = {_hundredths(pm, 1000)}: mean = {_hundredths(n * pm, 1000)}, σ = {_f2(sd)}; observed {inv['trials']['successes']}."})
    half = CANON_HALF_CENTI * (inv["stratum"] + 1)
    left = math.floor(100 * 2 ** (-3000 / half) + 0.5)
    maths.append({"id": "half_life", "label": "FACT", "plain": F["half_life"]["plain"], "mathml": F["half_life"]["mathml"],
                  "worked": f"In-game T½ = 12.32 × {inv['stratum'] + 1} = {_hundredths(half, 100)} days; after 30 days about {left}% of the glow remains."})
    maths.append({"id": "involution", "label": "FACT", "plain": F["involution"]["plain"], "mathml": F["involution"]["mathml"],
                  "worked": f"power = {inv['power']}: 72 × {inv['power']} mod 144 = {(72 * inv['power']) % 144}."})
    if inv["category"] == "mystical":
        maths.append({"id": "year_ratio", "label": "FACT", "plain": F["year_ratio"]["plain"], "mathml": F["year_ratio"]["mathml"],
                      "worked": f"28125 ÷ 77 = {_hundredths(C['year_ratio_num'] * 100, C['year_ratio_den'] * 100)}… days (rounding of 4500 d ÷ 365.25 = 12.3203 yr)."})
    ai = []
    for line in ai_lines or []:
        if isinstance(line, dict) and line.get("label") in CANON["labels"] and isinstance(line.get("text"), str) and line["text"].strip():
            ai.append({"label": line["label"], "text": line["text"].strip()[:300]})
    return {"title": inv["name"], "category": inv["category"], "form": inv["form"], "domain": inv["domain"], "stratum": f"M{inv['stratum']}",
            "definition": f"{inv['name']}: an in-game {inv['category']} {inv['form']} ({inv['domain']}) on stratum M{inv['stratum']}.",
            "summary": inv["effect"], "statements": st, "maths": maths, "ai": ai[:8], "labels": list(CANON["labels"]),
            "no_proof": CANON["no_proof"], "source": CANON["source"], "game": "Strata: Lux Genesis 9.0"}


PROOF_WORDS = ("proves", "proven", "proof that", "scientifically confirmed", "confirms that ssr", "real magic")


def parse_ai_lines(text: str) -> list:
    """Keep only Malcolm lines that carry exactly one valid label and make no proof claim."""
    out = []
    for raw in str(text or "").splitlines():
        line = raw.strip().lstrip("-• ").strip()
        for lab in CANON["labels"]:
            tag = f"[{lab}]"
            if line.upper().startswith(tag):
                body = line[len(tag):].strip(" :—-")
                if body and not any(w in body.lower() for w in PROOF_WORDS) and not any(f"[{l2}]" in body.upper() for l2 in CANON["labels"]):
                    out.append({"label": lab, "text": body[:300]})
                break
    return out[:8]
