"""Deterministic v9.0 progression engine (canonical; mirrored by cloudflare/src/v90.js).

Everything here is a pure function of its inputs so the Worker port can be parity-tested
against golden fixtures. Profiles are plain JSON dicts stored beside, never inside, the
v7.4 world state, so existing worlds and players load unchanged.
"""
import json, math
from pathlib import Path

DATA = json.loads((Path(__file__).with_name("data.json")).read_text(encoding="utf-8"))
LESSONS = {l["id"]: l for l in DATA["lessons"]}
STATS = ("moved", "gathered", "gathered.wood", "gathered.stone", "gathered.crystal", "defeated", "crafted",
         "built", "rested", "chats", "faints", "faints_recent", "malcolm", "lab", "answers", "correct")
EVENT_TICKS = 12
SEASON_TICKS = 48
PASS_CORRECT = 2  # test twice, like a scientist


def fnv(text):
    h = 0x811C9DC5
    for b in str(text).encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def pick(seed, key, lo, hi):
    return lo + fnv(f"{seed}:{key}") % (hi - lo + 1)


def new_profile():
    return {"v": 1, "stats": {k: 0 for k in STATS}, "lessons": {}, "achievements": {}, "renown": 0, "insight": 0,
            "bounty": None, "bounties_done": 0, "events_seen": [], "quiz": None}


def normalise(profile):
    p = new_profile() if not isinstance(profile, dict) else profile
    base = new_profile()
    for k, v in base.items():
        p.setdefault(k, v)
    for k in STATS:
        p["stats"].setdefault(k, 0)
    return p


def bump(profile, key, n=1):
    profile["stats"][key] = profile["stats"].get(key, 0) + n


def observe(profile, kind, before, after, message=""):
    """Update cumulative stats after a successful v7.4 world action."""
    p = normalise(profile)
    before = before or {}
    after = after or {}
    if kind == "move" and (before.get("x"), before.get("y")) != (after.get("x"), after.get("y")):
        bump(p, "moved")
    elif kind == "gather":
        for res in ("wood", "stone", "crystal"):
            d = (after.get("inventory") or {}).get(res, 0) - (before.get("inventory") or {}).get(res, 0)
            if d > 0:
                bump(p, "gathered", d)
                bump(p, "gathered." + res, d)
    elif kind == "attack" and "defeated" in str(message):
        bump(p, "defeated")
    elif kind == "craft":
        bump(p, "crafted")
    elif kind == "build":
        bump(p, "built")
    elif kind == "rest":
        bump(p, "rested")
    elif kind == "chat":
        bump(p, "chats")
    if (after.get("x"), after.get("y"), after.get("health")) == (2, 2, 50) and before.get("health", 100) != 50 \
            and (before.get("x"), before.get("y")) != (2, 2):
        bump(p, "faints")
        bump(p, "faints_recent")
    return p


def lessons_passed(profile):
    return sorted(k for k, v in profile["lessons"].items() if v.get("passed"))


def difficulty(profile, level=1):
    s = profile["stats"]
    d = 2 + (1 if level >= 4 else 0) + (1 if level >= 8 else 0)
    if s["answers"] >= 4:
        acc = s["correct"] / s["answers"]
        d += 1 if acc >= 0.8 else (-1 if acc < 0.4 else 0)
    if s["faints_recent"] >= 2:
        d -= 1
    return max(1, min(5, d))


DIFFICULTY_NAMES = ["", "Gentle", "Steady", "Bold", "Daring", "Heroic"]


def world_event(tick):
    cycle = tick // EVENT_TICKS
    events = DATA["events"]
    ev = events[0] if cycle == 0 else events[fnv(f"event:{cycle}") % len(events)]
    return {"cycle": cycle, "event": ev, "ticks_left": EVENT_TICKS - tick % EVENT_TICKS,
            "season": DATA["seasons"][(tick // SEASON_TICKS) % 4]}


def note_event(profile, tick):
    ev = world_event(tick)["event"]["id"]
    if ev not in profile["events_seen"]:
        profile["events_seen"].append(ev)
    return profile


BOUNTY_KINDS = ("gather", "defeat", "walk", "craft", "rest", "study", "lab")


def bounty_offers(player_id, tick, diff):
    day = tick // EVENT_TICKS
    boost = world_event(tick)["event"]["boost"]
    offers = []
    used = set()
    for i in range(3):
        seed = f"{player_id}:{day}:{i}"
        k = BOUNTY_KINDS[fnv(seed) % len(BOUNTY_KINDS)]
        if k in used:
            k = BOUNTY_KINDS[(BOUNTY_KINDS.index(k) + 1 + i) % len(BOUNTY_KINDS)]
        used.add(k)
        if k == "gather":
            res = ("wood", "stone", "crystal")[pick(seed, "res", 0, 2)]
            n, stat, title = 3 * (1 + diff), "gathered." + res, f"Collect {3 * (1 + diff)} {res}"
            bkind = "crystal" if res == "crystal" else "gather"
        elif k == "defeat":
            n, stat, title, bkind = 1 + diff // 2, "defeated", f"Defeat {1 + diff // 2} creature(s)", "defeat"
        elif k == "walk":
            n, stat, title, bkind = 15 * diff, "moved", f"Explore {15 * diff} squares", "walk"
        elif k == "craft":
            n, stat, title, bkind = 1 + diff // 3, "crafted", f"Craft {1 + diff // 3} item(s)", "craft"
        elif k == "rest":
            n, stat, title, bkind = 1 + diff // 3, "rested", f"Rest by a fire {1 + diff // 3} time(s)", "rest"
        elif k == "study":
            n, stat, title, bkind = 1 + diff // 2, "correct", f"Answer {1 + diff // 2} Codex question(s) correctly", "study"
        else:
            n, stat, title, bkind = 2 + diff, "lab", f"Run {2 + diff} experiments or lab steps", "lab"
        reward = 10 + 6 * diff + 2 * n
        doubled = bkind == boost
        offers.append({"id": f"b{day}-{i}", "kind": k, "stat": stat, "target": n, "title": title,
                       "renown": reward * (2 if doubled else 1), "boosted": doubled})
    return offers


def accept_bounty(profile, player_id, tick, bounty_id, diff):
    offers = {o["id"]: o for o in bounty_offers(player_id, tick, diff)}
    if bounty_id not in offers:
        raise ValueError("bounty_not_offered")
    if profile["bounty"] and profile["bounty"].get("id") == bounty_id:
        raise ValueError("bounty_already_active")
    o = dict(offers[bounty_id])
    o["baseline"] = profile["stats"].get(o["stat"], 0)
    profile["bounty"] = o
    return o


def bounty_progress(profile):
    b = profile["bounty"]
    if not b:
        return 0
    return max(0, min(b["target"], profile["stats"].get(b["stat"], 0) - b["baseline"]))


def claim_bounty(profile):
    b = profile["bounty"]
    if not b:
        raise ValueError("no_active_bounty")
    if bounty_progress(profile) < b["target"]:
        raise ValueError("bounty_incomplete")
    profile["renown"] += b["renown"]
    profile["bounties_done"] += 1
    profile["stats"]["faints_recent"] = 0
    profile["bounty"] = None
    return b["renown"]


def abandon_bounty(profile):
    if not profile["bounty"]:
        raise ValueError("no_active_bounty")
    profile["bounty"] = None


# ---------- Codex quizzes (answers never leave the server) ----------
def make_question(lesson_id, seed, diff):
    if lesson_id not in LESSONS:
        raise ValueError("lesson_not_found")
    kind = LESSONS[lesson_id]["quiz"]
    r = lambda key, lo, hi: pick(seed, key, lo, hi)
    trace = DATA["cra_trace"]
    if kind == "ke":
        m, v = r("m", 1, 2 + diff), r("v", 2, 3 + 2 * diff)
        q, a, tol, unit = f"A {m} kg stone moves at {v} m/s. What is its kinetic energy?", 0.5 * m * v * v, 0.05, "J"
    elif kind == "efficiency":
        total, pct = 100 * r("t", 5, 20), 5 * r("p", 2, 18)
        q, a, tol, unit = f"A campfire releases {total} J. {total * pct // 100} J heats the stew. What is the efficiency?", pct, 0.5, "%"
    elif kind == "speed":
        v, t = r("v", 1, 3 + diff), r("t", 2, 10)
        q, a, tol, unit = f"You walk {v * t} m in {t} s. What is your speed?", v, 0.01, "m/s"
    elif kind == "expected":
        p, n = r("p", 1, 5), 10 * r("n", 1, 5)
        q, a, tol, unit = f"Each search finds a crystal with probability 0.{p}. How many crystals do you expect in {n} searches?", n * p / 10, 0.01, "crystals"
    elif kind == "mean":
        k = 3 if diff < 3 else 5
        vals = [r(f"x{i}", 2, 20) for i in range(k)]
        q, a, tol, unit = f"Readings: {', '.join(map(str, vals))}. What is the mean? (2 d.p.)", sum(vals) / k, 0.006, ""
    elif kind == "uncertainty":
        vals = [r(f"x{i}", 10, 30) for i in range(3)]
        q, a, tol, unit = f"Readings: {', '.join(map(str, vals))}. What is the uncertainty (half the range)?", (max(vals) - min(vals)) / 2, 0.01, ""
    elif kind == "gibbs":
        t = r("T", 250, 320)
        q, a, tol, unit = f"Using ΔG = 6.01 − T × 0.0220, find ΔG for melting ice at T = {t} K (2 d.p.).", round(6.01 - t * 0.022, 4), 0.006, "kJ/mol"
    elif kind == "light":
        d = r("d", 2, 18)
        q, a, tol, unit = f"Light travels at 3.00 × 10⁸ m/s. How long does it take to cross {d / 2:g} × 10⁸ m? (2 d.p.)", d / 6, 0.006, "s"
    elif kind == "zscore":
        s = (10, 20, 30, 50, 100)[r("s", 0, 4)]
        delta = r("d", 0, 4 * s) - 2 * s
        n, k = s * s, s * s // 2 + delta
        q, a, tol, unit = f"n = {n} coin flips gave K = {k} heads. Find z = (2K − n) ÷ √n (2 d.p.).", 2 * delta / s, 0.006, ""
    elif kind == "growth":
        n0, t = r("n", 2, 10), r("t", 1, 3 + diff)
        q, a, tol, unit = f"{n0} creatures double every generation. How many after {t} generations?", n0 * 2 ** t, 0, "creatures"
    elif kind == "hash":
        prev, x = r("p", 0, 96), r("x", 1, 20)
        q, a, tol, unit = f"Toy diary code: previous code {prev}, page value {x}. Work out ({prev} × 31 + {x}) mod 97.", (prev * 31 + x) % 97, 0, ""
    elif kind == "chain":
        L = r("L", 2, 5 + diff)
        names = "abcdefghijk"
        rules = ", ".join(f"{names[i + 1]}: {names[i]}" for i in range(L))
        q, a, tol, unit = f"You know a. Rules: {rules}. How many facts do you know at the least fixed point?", L + 1, 0, "facts"
    elif kind == "trace":
        k = r("k", 1, 9)
        q, a, tol, unit = f"Read the graph: how many atoms has the CRA model generated after Kleene step {k}?", trace[k], 0, "atoms"
    else:  # percent
        k = r("k", 1, 9)
        q, a, tol, unit = f"After step {k} the CRA has {trace[k]} of its 33 atoms. What percentage is that? (1 d.p.)", round(trace[k] / 33 * 100, 1), 0.06, "%"
    return {"lesson": lesson_id, "prompt": q, "answer": a, "tolerance": tol, "unit": unit}


def start_quiz(profile, player_id, lesson_id, diff):
    lp = profile["lessons"].setdefault(lesson_id, {"attempts": 0, "correct": 0, "passed": False})
    if lesson_id not in LESSONS:
        raise ValueError("lesson_not_found")
    seed = f"{player_id}:{lesson_id}:{lp['attempts']}"
    profile["quiz"] = {"lesson": lesson_id, "seed": seed, "diff": diff}
    q = make_question(lesson_id, seed, diff)
    return {"lesson": lesson_id, "prompt": q["prompt"], "unit": q["unit"]}


def answer_quiz(profile, value):
    qz = profile.get("quiz")
    if not qz:
        raise ValueError("no_question_open")
    try:
        v = float(value)
    except (TypeError, ValueError):
        raise ValueError("answer_must_be_a_number")
    if not math.isfinite(v):
        raise ValueError("answer_must_be_a_number")
    q = make_question(qz["lesson"], qz["seed"], qz["diff"])
    lp = profile["lessons"].setdefault(qz["lesson"], {"attempts": 0, "correct": 0, "passed": False})
    ok = abs(v - q["answer"]) <= q["tolerance"] + 1e-9
    lp["attempts"] += 1
    bump(profile, "answers")
    newly = False
    if ok:
        lp["correct"] += 1
        bump(profile, "correct")
        profile["insight"] += 10
        if not lp["passed"] and lp["correct"] >= PASS_CORRECT:
            lp["passed"] = True
            newly = True
            profile["renown"] += 15
    profile["quiz"] = None
    return {"correct": ok, "answer": q["answer"], "unit": q["unit"], "passed": lp["passed"], "newly_passed": newly,
            "correct_count": lp["correct"], "needed": PASS_CORRECT}


# ---------- story arcs, achievements, ranks ----------
def _requirement(profile, req, n):
    s, passed = profile["stats"], set(lessons_passed(profile))
    if req.startswith("lesson:"):
        return all(x in passed for x in req[7:].split("+"))
    if req == "built+a2":
        return s["built"] >= 1 and "a2" in passed
    return s.get(req, 0) >= n


def arcs(profile):
    out = []
    for arc in DATA["arcs"]:
        done = 0
        for _title, _goal, req, n in arc["chapters"]:
            if not _requirement(profile, req, n):
                break
            done += 1
        out.append({"id": arc["id"], "mode": arc["mode"], "title": arc["title"], "done": done,
                    "chapters": [{"title": c[0], "goal": c[1], "done": i < done, "current": i == done} for i, c in enumerate(arc["chapters"])]})
    return out


def metric(profile, key, level):
    if key == "level":
        return level
    if key == "lessons":
        return len(lessons_passed(profile))
    if key == "bounties":
        return profile["bounties_done"]
    if key == "chapters":
        return sum(a["done"] for a in arcs(profile))
    if key == "events_seen":
        return len(profile["events_seen"])
    return profile["stats"].get(key, 0)


def unlock_achievements(profile, level, tick):
    new = []
    for aid, name, _desc, key, n in DATA["achievements"]:
        if aid not in profile["achievements"] and metric(profile, key, level) >= n:
            profile["achievements"][aid] = tick
            profile["renown"] += 10
            new.append({"id": aid, "name": name})
    return new


def rank(renown):
    name, nxt = DATA["ranks"][0][1], None
    for i, (need, title) in enumerate(DATA["ranks"]):
        if renown >= need:
            name = title
            nxt = DATA["ranks"][i + 1][0] if i + 1 < len(DATA["ranks"]) else None
    return {"title": name, "next_at": nxt}


def view(profile, player_id, level, tick):
    p = normalise(profile)
    diff = difficulty(p, level)
    b = p["bounty"]
    return {
        "rank": rank(p["renown"]), "renown": p["renown"], "insight": p["insight"],
        "difficulty": {"level": diff, "name": DIFFICULTY_NAMES[diff]},
        "world": world_event(tick), "offers": bounty_offers(player_id, tick, diff),
        "bounty": None if not b else {k: b[k] for k in ("id", "title", "target", "renown", "kind")} | {"progress": bounty_progress(p)},
        "bounties_done": p["bounties_done"], "arcs": arcs(p),
        "achievements": [{"id": a[0], "name": a[1], "desc": a[2], "unlocked": a[0] in p["achievements"],
                          "progress": min(a[4], metric(p, a[3], level)), "need": a[4]} for a in DATA["achievements"]],
        "lessons": {k: v for k, v in p["lessons"].items()}, "stats": dict(p["stats"]),
        "events_seen": list(p["events_seen"]),
    }
