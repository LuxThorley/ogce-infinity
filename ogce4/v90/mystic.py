"""Strata: Lux Genesis v9.0 mysticism layer (canonical; web/js/mystic.js is the exact port).

A deterministic in-game sky (zodiac, Moon, five planets), planetary alignments that modify duel abilities,
star-chart puzzles, the Grand Year cycle tied to New Genesis, sacred-site blessings, spirits and rune enchantments.
Integer-only so the Worker and the browser agree exactly. Everything mystical is labelled MYSTICAL/IN-GAME:
part of the story, never established science.
"""
from __future__ import annotations

import json
from pathlib import Path

from .omniverse import h3

MY = json.loads((Path(__file__).with_name("mystic.json")).read_text(encoding="utf-8"))
SIGNS = MY["signs"]
PLANETS = MY["planets"]
SITES = {s["id"]: s for s in MY["sites"]}
SPIRITS = {s["id"]: s for s in MY["spirits"]}
RUNES = {r["id"]: r for r in MY["runes"]}
CAPS = MY["caps"]
FULL = 360000


class MysticError(ValueError):
    pass


def day_hour(tick: int) -> tuple[int, int]:
    t = max(0, int(tick))
    return t // MY["day_ticks"], t % MY["day_ticks"]


def is_night(hour: int) -> bool:
    return MY["night_hours"][0] <= hour <= MY["night_hours"][1]


def sep(a: int, b: int) -> int:
    d = abs(a - b) % FULL
    return min(d, FULL - d)


def merge(*effs: dict) -> dict:
    out = {k: 0 for k in CAPS}
    for e in effs:
        for k, v in (e or {}).items():
            if k in out:
                out[k] += int(v)
    return {k: max(0, min(CAPS[k], v)) for k, v in out.items()}


def sky(tick: int, seed: int) -> dict:
    day, hour = day_hour(tick)
    s = (seed & 0xFFFFFFFF) % FULL
    sun = (day * 36000000 // MY["year_centidays"]) % FULL
    age = (day * 100 + (seed & 0xFFFFFFFF) % MY["month_centidays"]) % MY["month_centidays"]
    phase = ((age * 8 + MY["month_centidays"] // 2) // MY["month_centidays"]) % 8
    planets = []
    for i, p in enumerate(PLANETS):
        lon = (p["base"] + s * (2 * i + 1) + day * FULL // p["game_days"]) % FULL
        planets.append({"id": p["id"], "lon": lon, "sign": SIGNS[lon // 30000]["id"]})
    lon = {p["id"]: p["lon"] for p in planets}
    active, effs = [], []
    for a in MY["alignments"]:
        if sep(lon[a["pair"][0]], lon[a["pair"][1]]) <= MY["orb"]:
            active.append(a["id"]); effs.append(a["effect"])
    grand = any(sum(1 for q in planets if (q["lon"] - p["lon"]) % FULL <= MY["grand_window"]) >= 3 for p in planets)
    if grand:
        active.append(MY["grand"]["id"]); effs.append(MY["grand"]["effect"])
    mfx = MY["moon_fx"].get(str(phase))
    if mfx:
        active.append(mfx["id"]); effs.append(mfx["effect"])
    sign = SIGNS[sun // 30000]
    return {"day": day, "hour": hour, "night": is_night(hour), "sun": {"lon": sun, "sign": sign["id"]},
            "moon": {"age": age, "phase": phase, "name": MY["moon"][phase]}, "planets": planets, "active": active, "grand": grand,
            "element": sign["element"], "school": MY["elements"][sign["element"]]["school"], "effects": merge(*effs)}


def grand_year(cycle: int) -> dict:
    c = max(0, int(cycle))
    start = next(i for i, s in enumerate(SIGNS) if s["id"] == MY["grand_year"]["start_age"])
    i = (start - c) % 12
    nxt = (i - 1) % 12
    return {"age": SIGNS[i]["id"], "name": "Age of " + SIGNS[i]["name"], "glyph": SIGNS[i]["glyph"], "grand_years": c // 12,
            "ages_into": c % 12, "next": SIGNS[nxt]["id"], "years": MY["grand_year"]["years"]}


def norm_state(s: dict | None) -> dict:
    s = dict(s or {})
    ch = dict(s.get("charts") or {})
    return {"blessing": s.get("blessing"), "charts": {"day": int(ch.get("day", -1)), "solved": list(ch.get("solved", [])), "n": int(ch.get("n", 0))},
            "spirits": list(s.get("spirits", [])), "runes": dict(s.get("runes") or {}), "visits": dict(s.get("visits") or {})}


def _near(ex: dict, site: dict) -> bool:
    return ex.get("realm") == site["realm"] and abs(int(ex.get("x", 0)) - site["x"]) + abs(int(ex.get("y", 0)) - site["y"]) <= MY["visit_range"]


def _site_open(site: dict, sk: dict) -> bool:
    w = site["when"]
    return w == "any" or (w == "night" and sk["night"]) or (w == "moon" and sk["moon"]["phase"] in (0, 4))


def spirit_visible(sp: dict, sk: dict) -> bool:
    w = sp["when"]
    return w == "any" or (w == "night" and sk["night"]) or (w == "full" and sk["moon"]["phase"] == 4)


def bless(state: dict, ex: dict, site_id: str, tick: int, seed: int) -> dict:
    site = SITES.get(site_id)
    if site is None:
        raise MysticError("unknown_site")
    if not _near(ex, site):
        raise MysticError("too_far")
    sk = sky(tick, seed)
    if not _site_open(site, sk):
        raise MysticError("site_sleeping")
    if state["visits"].get(site_id) == sk["day"]:
        raise MysticError("already_blessed_today")
    state["visits"][site_id] = sk["day"]
    state["blessing"] = {"site": site_id, "effect": dict(site["effect"]), "day": sk["day"]}
    return {"site": site_id, "name": site["name"], "effect": dict(site["effect"]), "text": site["text"]}


def commune(state: dict, ex: dict, spirit_id: str, tick: int, seed: int) -> dict:
    sp = SPIRITS.get(spirit_id)
    if sp is None:
        raise MysticError("unknown_spirit")
    if not _near(ex, SITES[sp["site"]]):
        raise MysticError("too_far")
    if not spirit_visible(sp, sky(tick, seed)):
        raise MysticError("spirit_hidden")
    new = spirit_id not in state["spirits"]
    if new:
        state["spirits"].append(spirit_id)
    return {"spirit": spirit_id, "name": sp["name"], "kind": sp["kind"], "lore": sp["lore"], "new": new, "count": len(state["spirits"])}


def _rot(lst: list, r: int) -> list:
    return lst[r:] + lst[:r]


def puzzles(tick: int, seed: int) -> list:
    sk = sky(tick, seed)
    d = sk["day"]
    si = next(i for i, s in enumerate(SIGNS) if s["id"] == sk["sun"]["sign"])
    sun_opts = [SIGNS[(si + k) % 12]["name"] for k in (0, 3, 6, 9)]
    ph = sk["moon"]["phase"]
    moon_opts = [MY["moon"][(ph + k) % 8] for k in (0, 2, 4, 6)]
    P = sk["planets"]
    pairs = [(P[a], P[b]) for a in range(len(P)) for b in range(a + 1, len(P))]
    order = sorted(range(len(pairs)), key=lambda i: (sep(pairs[i][0]["lon"], pairs[i][1]["lon"]), i))
    best = order[0]
    pick = [best] + [order[k] for k in (3, 6, 9)]
    pname = {p["id"]: p["name"] for p in PLANETS}
    pair_opts = [pname[pairs[i][0]["id"]] + " & " + pname[pairs[i][1]["id"]] for i in pick]
    out = []
    for n, (kind, q, opts) in enumerate([("sun", "Star chart: in which zodiac sign is the Sun today?", sun_opts),
                                         ("moon", "Star chart: what is the Moon's phase tonight?", moon_opts),
                                         ("pair", "Star chart: which two planets are closest together in the sky today?", pair_opts)]):
        r = h3(seed, d, n + 1) % 4
        ch = _rot(opts, r)
        out.append({"id": kind + ":" + str(d), "kind": kind, "q": q, "choices": ch, "answer": ch.index(opts[0])})
    return out


def solve(state: dict, ex: dict, puzzle_id: str, choice: int, tick: int, seed: int) -> dict:
    sk = sky(tick, seed)
    pz = next((p for p in puzzles(tick, seed) if p["id"] == puzzle_id), None)
    if pz is None:
        raise MysticError("unknown_puzzle")
    ch = state["charts"]
    if ch["day"] != sk["day"]:
        ch["day"], ch["solved"] = sk["day"], []
    if puzzle_id in ch["solved"]:
        raise MysticError("already_solved")
    if len(ch["solved"]) >= MY["chart_daily_max"]:
        raise MysticError("charts_done_today")
    ch["solved"].append(puzzle_id)
    if not isinstance(choice, int) or isinstance(choice, bool) or choice != pz["answer"]:
        return {"correct": False, "answer": pz["answer"], "gain": 0, "n": ch["n"]}
    gain = 2 if (sk["night"] and _near(ex, SITES["star_dais"])) else 1
    ch["n"] += gain
    return {"correct": True, "answer": pz["answer"], "gain": gain, "n": ch["n"]}


def enchant(state: dict, ex: dict, weapon: str, rune_id: str, weapons) -> dict:
    rune = RUNES.get(rune_id)
    if rune is None:
        raise MysticError("unknown_rune")
    if weapon not in weapons or weapon == "fists":
        raise MysticError("unknown_weapon")
    if not any(_near(ex, SITES[s]) for s in rune["sites"]):
        raise MysticError("too_far")
    bag = ex.setdefault("bag", {})
    if any(bag.get(k, 0) < v for k, v in rune["cost"].items()):
        raise MysticError("missing_items")
    for k, v in rune["cost"].items():
        bag[k] -= v
    state["runes"][weapon] = rune_id
    return {"weapon": weapon, "rune": rune_id, "name": rune["name"], "effect": dict(rune["effect"])}


def duel_mods(state: dict, tick: int, seed: int, weapon: str, consume: bool = True) -> dict:
    sk = sky(tick, seed)
    b = state.get("blessing") or {}
    r = RUNES.get(state["runes"].get(weapon, ""), {})
    mods = merge(sk["effects"], b.get("effect"), r.get("effect"))
    srcs = list(sk["active"]) + (["blessing:" + b["site"]] if b else []) + (["rune:" + r["id"]] if r else [])
    if consume:
        state["blessing"] = None
    return {"effects": mods, "school": sk["school"], "sources": srcs}


def apply(cfg: dict, m: dict) -> dict:
    e = m["effects"]
    out = dict(cfg)
    out["hp"] = min(999, cfg["hp"] + e["hp"])
    out["stamina"] = cfg["stamina"] + e["stamina"]
    lo = []
    for d in cfg["loadout"]:
        d2 = dict(d)
        bonus = e["special_mult"] + (e["magic_mult"] if d.get("magic") else 0) + (10 if d.get("magic") and d.get("school") == m["school"] else 0)
        d2["mult"] = d["mult"] * (100 + bonus) // 100
        d2["focus"] = max(10, d["focus"] - e["focus"])
        lo.append(d2)
    out["loadout"] = lo
    out["mystic"] = {"effects": dict(e), "school": m["school"], "sources": list(m["sources"])}
    return out


def public_puzzles(tick: int, seed: int) -> list:
    return [{k: v for k, v in p.items() if k != "answer"} for p in puzzles(tick, seed)]


def view(state: dict, tick: int, seed: int, cycle: int) -> dict:
    sk = sky(tick, seed)
    ch = state["charts"]
    today = ch["solved"] if ch["day"] == sk["day"] else []
    return {"label": MY["label"], "sky": sk, "grand_year": grand_year(cycle), "puzzles": public_puzzles(tick, seed), "solved_today": list(today),
            "charts": ch["n"], "blessing": state["blessing"], "spirits": list(state["spirits"]), "runes": dict(state["runes"]),
            "visible": [s["id"] for s in MY["spirits"] if spirit_visible(s, sk)]}


def card(sk: dict, gy: dict) -> dict:
    """A shareable star-chart card: every statement carries one label (FACT, SSR/CRA THEORY or MYSTICAL/IN-GAME)."""
    sign = next(s for s in SIGNS if s["id"] == sk["sun"]["sign"])
    act = [a for a in MY["alignments"] if a["id"] in sk["active"]]
    st = [{"label": "FACT", "text": "The Moon goes through its phases about every 29.5 days; today's in-game Moon is a " + sk["moon"]["name"] + "."},
          {"label": "FACT", "text": "Real orbital periods: " + ", ".join(f'{p["name"]} {p["real_days"]} days' for p in PLANETS) + ". Strata's sky runs faster (IN-GAME)."},
          {"label": "FACT", "text": MY["grand_year"]["fact"].replace("FACT: ", "")},
          {"label": "SSR/CRA THEORY", "text": MY["grand_year"]["theory"].replace("SSR/CRA THEORY: ", "")},
          {"label": "MYSTICAL/IN-GAME", "text": f'The Sun stands in {sign["name"]} ({sign["element"]}); {MY["elements"][sign["element"]]["gift"]}'},
          {"label": "MYSTICAL/IN-GAME", "text": f'Strata turns in the {gy["name"]}. ' + MY["grand_year"]["game"].replace("MYSTICAL/IN-GAME: ", "")}]
    for a in act:
        st.append({"label": "MYSTICAL/IN-GAME", "text": a["name"] + ": " + a["text"]})
    st.append({"label": "MYSTICAL/IN-GAME", "text": MY["science_note"]})
    return {"title": f'Star chart: day {sk["day"]}, Sun in {sign["name"]}', "statements": st, "label": MY["label"]}
