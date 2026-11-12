"""Generate golden fixtures from the canonical Python engine for the JS Worker parity tests.

Run from the repository root:  python cloudflare/tools/gen_fixtures.py
"""
import json, random, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from ogce4.v80.mulux import LivingWorld, least_fixed_point, grade_claim, decide
from ogce4.v82 import LivingWorld82, WorldError
from ogce4.v70.runtime import GameRuntime

out = {}
freeze = lambda v: json.loads(json.dumps(v))  # snapshots alias live state; copy at capture time
# 1. Python random.Random parity
rng_cases = []
for seed in [0, 1, 42, 707, 8282, 2**32 + 5, 123456789012345]:
    r = random.Random(seed)
    rng_cases.append({"seed": seed, "random": [r.random() for _ in range(5)],
                      "randrange12": [r.randrange(12) for _ in range(10)],
                      "choice5": [r.choice(range(5)) for _ in range(10)],
                      "randrange1440": [r.randrange(1440) for _ in range(5)]})
out["rng"] = rng_cases

# 2. muLux living world
w = LivingWorld(seed=sum(map(ord, "Aurelia")))
steps = [freeze({"op": "init", "snapshot": w.snapshot(), "ledger": w.ledger, "verify": w.verify_ledger()})]
for n in [1, 12, 30, 12]:
    snap = w.tick(n)
    steps.append(freeze({"op": "tick", "count": n, "snapshot": snap, "verify": w.verify_ledger()}))
record = {"seed": w.seed, "tick": w.tick_count, "state": json.loads(json.dumps(w.snapshot())), "ledger": json.loads(json.dumps(w.ledger))}
record_frozen = freeze(record)
w2 = LivingWorld.from_record(record)
steps.append(freeze({"op": "reload_tick", "count": 7, "snapshot": w2.tick(7), "verify": w2.verify_ledger()}))
out["mulux"] = {"seed": w.seed, "steps": steps, "record": record_frozen}
out["genesis"] = [
    {"args": [["a", "b", "c"], [{"then": "b", "if": ["a"]}, {"then": "c", "if": ["a", "b"]}], ["a"]],
     "result": least_fixed_point(["a", "b", "c"], [{"then": "b", "if": ["a"]}, {"then": "c", "if": ["a", "b"]}], ["a"])},
]
out["grades"] = [
    {"args": ["The simulation converges", [{"kind": "computation"}], "FACT"], "result": grade_claim("The simulation converges", [{"kind": "computation"}], "FACT")},
    {"args": ["This will definitely cure everything", [], "FACT"], "result": grade_claim("This will definitely cure everything", [], "FACT")},
    {"args": ["premise only", [{"kind": "premise"}], "FACT"], "result": grade_claim("premise only", [{"kind": "premise"}], "FACT")},
]
out["policy"] = [{"args": [a, y], "result": decide(a, owner_yes=y)} for a in ["deploy", "spend", "compute_local", "xyz"] for y in [False, True]]

# 3. v8.2 world
w = LivingWorld82(seed=sum(map(ord, "AURELIA")) + 82)
ops = [
    ("character", dict(character_id="hero", name="Hero", birth_cycle=3, path="hybrid")),
    ("cast", dict(character_id="hero", spell="verdant_mend", target="Ærwyn ☉")),
    ("reading", dict(character_id="hero")),
    ("train", dict(character_id="hero", discipline="engineering", amount=10)),
    ("invent", dict(character_id="hero", technology="windmill")),
    ("hypothesis", dict(character_id="hero", title="Crystal resonance", discipline="physics", hypothesis="A resonance occurs", method="controlled comparison")),
    ("experiment", dict(character_id="hero", research_id="r00001", observation="res=4", repeat=False)),
    ("experiment", dict(character_id="hero", research_id="r00001", observation="res=4", repeat=True)),
    ("tick", dict(count=13)),
    ("reading", dict(character_id="hero")),
    ("learn_spell", dict(character_id="hero", spell="star_sight")),
    ("cast", dict(character_id="hero", spell="star_sight")),
    ("invent", dict(character_id="hero", technology="automata")),
]
v82 = []
for op, kw in ops:
    try:
        if op == "character": res = w.create_character(kw["character_id"], kw["name"], kw["birth_cycle"], kw["path"])
        elif op == "cast": res = w.cast(kw["character_id"], kw["spell"], kw.get("target"))
        elif op == "reading": res = w.celestial_reading(kw["character_id"])
        elif op == "train": res = w.train(kw["character_id"], kw["discipline"], kw["amount"])
        elif op == "invent": res = w.invent(kw["character_id"], kw["technology"])
        elif op == "hypothesis": res = w.submit_hypothesis(kw["character_id"], kw["title"], kw["discipline"], kw["hypothesis"], kw["method"])
        elif op == "experiment": res = w.experiment(kw["character_id"], kw["research_id"], kw["observation"], kw["repeat"])
        elif op == "tick": res = w.tick(kw["count"])
        elif op == "learn_spell": res = w.learn_spell(kw["character_id"], kw["spell"])
        v82.append(freeze({"op": op, "kw": kw, "result": res, "snapshot": w.snapshot()}))
    except WorldError as e:
        v82.append(freeze({"op": op, "kw": kw, "error": str(e), "snapshot": w.snapshot()}))
out["v82"] = {"seed": w.seed, "steps": v82, "record": json.loads(json.dumps(w.to_record()))}

# 4. v7.4 runtime
db = Path(tempfile.mkdtemp()) / "rt.sqlite3"
rt = GameRuntime(db)
actions = [{"type": "move", "dx": 1, "dy": 0}, {"type": "move", "dx": 0, "dy": 1}, {"type": "move", "dx": 1, "dy": 0},
           {"type": "quest", "operation": "accept", "quest_id": "gatherer_path"},
           {"type": "move", "dx": 0, "dy": 1}]
# walk next to crystal-01 at (5,4)
actions += [{"type": "move", "dx": 1, "dy": 0}] * 1 + [{"type": "gather", "target": "crystal-01"}] * 3
actions += [{"type": "craft", "recipe": "healing_potion"}]
actions += [{"type": "advance"}] * 6
actions += [{"type": "move", "dx": 1, "dy": 0}] * 5 + [{"type": "advance"}] * 4
actions += [{"type": "attack", "target": "moss-wolf-01"}] * 3
actions += [{"type": "quest", "operation": "claim", "quest_id": "gatherer_path"}, {"type": "drink_potion"}, {"type": "chat", "message": "hello Ω"}]
rsteps = [freeze({"op": "load", "result": rt.load("Aurelia")})]
for a in actions:
    try: rsteps.append(freeze({"action": a, "result": rt.act("Aurelia", "tester", a)}))
    except ValueError as e: rsteps.append({"action": a, "error": str(e)})
out["runtime"] = rsteps

dest = Path(__file__).resolve().parents[1] / "test" / "fixtures.json"
dest.write_text(json.dumps(out, ensure_ascii=False, indent=1))
print("wrote", dest, dest.stat().st_size, "bytes")
