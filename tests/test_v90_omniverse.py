"""Strata: Lux Genesis omniverse — deterministic infinite realms, simulated ecology, NPCs, factions and endings."""
import copy
import time

import pytest

from ogce4.v90 import omniverse as O

A = O.REALMS["aurelia"]


def test_same_seed_same_world_and_realms_differ():
    assert O.chunk(A, 3, -2) == O.chunk(A, 3, -2)
    sigs = {rid: O.chunk(O.REALMS[rid], 2, 2, 1)["tiles"] for rid in O.REALMS}
    assert len(set(sigs.values())) == len(sigs)


def test_practically_infinite_and_lod():
    far = O.chunk(A, 61000, -59000, 0)
    assert len(far["tiles"]) == 256 and len(far["heights"]) == 256
    assert len(O.chunk(A, 0, 0, 1)["tiles"]) == 16 and "biome" in O.chunk(A, 0, 0, 2)
    biomes = {O.chunk(O.REALMS[r], cx, cy, 2)["biome"] for r in O.REALMS for cx in range(-5, 5) for cy in range(-5, 5)}
    assert {"O", "M", "F", "D", "T", "C", "L"} <= biomes


def test_spawn_island_is_walkable_everywhere():
    for r in O.REALMS.values():
        assert O.sample(r, 0, 0)[0] not in ("O", "B")


def test_persistent_edit_then_regrowth_and_sapling_growth():
    feats = O.chunk(A, 0, 0)["features"]
    x, y, kind = next(f for f in feats if f[2] in O.OMNI["harvest"])
    d = {f"{x},{y}": ["-", 10]}
    assert O.feature_at(A, d, x, y, 20) is None and O.feature_at(A, d, x, y, 10 + O.OMNI["regrow"]) == kind
    assert O.feature_at(A, {"9,9": ["sapling", 0]}, 9, 9, 5) == "sapling" and O.feature_at(A, {"9,9": ["sapling", 0]}, 9, 9, 30) == "tree"


def test_ecology_reproduces_with_heritable_bounded_traits_and_is_deterministic():
    e1, e2 = O.new_ecology(A), O.new_ecology(A)
    O.evolve(e1, A, 24)
    for _ in range(6):
        O.evolve(e1, A, e1["tick"] + 24)
    for _ in range(7):
        O.evolve(e2, A, e2["tick"] + 24)
    assert e1 == e2
    assert e1["births"] > 10 and max(c["gen"] for c in e1["creatures"]) >= 3
    for c in e1["creatures"]:
        assert 1 <= c["t"][0] <= 5 and 1 <= c["t"][1] <= 5 and 1 <= c["t"][2] <= 8 and 0 <= c["t"][3] < 360
        assert 0 <= c["x"] < O.HAB and 0 <= c["y"] < O.HAB
    cen = O.census(e1)
    assert all(cen[sp]["count"] >= 1 for sp in O.SPECIES) and cen["plants"] <= 500


def test_predator_policy_caps_wolves():
    e = O.new_ecology(A)
    e["policy"]["predator_cap"] = 4
    O.evolve(e, A, 24)
    for _ in range(5):
        O.evolve(e, A, e["tick"] + 24)
    assert O.census(e)["duskwolf"]["count"] <= 6


def test_evolve_is_bounded_per_request_and_fast_enough_for_a_worker():
    e = O.new_ecology(A)
    assert O.evolve(e, A, 10_000) == O.MAX_STEPS
    t = time.perf_counter()
    O.evolve(e, A, e["tick"] + 24)
    assert time.perf_counter() - t < 2.0


def test_tools_double_yield_and_crafting_and_building():
    p = O.new_explorer()
    p["bag"] = {"wood": 5, "stone": 5, "fibre": 2}
    deltas = {}
    O.explorer_act(p, "craft", {"recipe": "axe"}, A, deltas, 0, None)
    assert "axe" in p["tools"] and p["bag"]["wood"] == 3
    O.explorer_act(p, "craft", {"recipe": "rope"}, A, deltas, 0, None)
    assert p["bag"]["rope"] == 1
    tree = next(f for f in O.chunk(A, 0, 0)["features"] + O.chunk(A, -1, -1)["features"] if f[2] in ("tree", "pine") and abs(f[0]) + abs(f[1]) <= 12)
    O.explorer_act(p, "move", {"x": tree[0], "y": tree[1]}, A, deltas, 1, None)
    assert O.explorer_act(p, "harvest", {"x": tree[0], "y": tree[1]}, A, deltas, 1, None)["count"] == 2
    with pytest.raises(O.OmniError, match="unknown_recipe"):
        O.explorer_act(p, "craft", {"recipe": "laser"}, A, deltas, 0, None)


def test_weapons_are_teen_safe_and_life_is_labelled_honestly():
    for name, r in O.OMNI["recipes"].items():
        assert not any(w in r["text"].lower() for w in ("blood", "kill", "gore"))
    assert "make-believe" in O.OMNI["recipes"]["lux_staff"]["text"] and "Nothing is hurt" in O.OMNI["recipes"]["sling"]["text"]
    assert "not alive, aware or sentient" in O.OMNI["label"]


def _play(route):
    p = O.new_explorer()
    for npc, ch in route:
        n = O.OMNI["npcs"][npc]
        p["x"], p["y"] = n["x"], n["y"]
        O.talk(p, npc)
        O.talk(p, npc, "start", ch)
    oru = O.OMNI["npcs"]["oru"]
    p["x"], p["y"] = oru["x"], oru["y"]
    return p, O.talk(p, "oru", "start", 0)


def test_branching_choices_lead_to_multiple_endings_including_the_accord():
    endings = set()
    for a in range(3):
        for b in range(3):
            for c in range(3):
                p, out = _play([("ilsa", a), ("bram", b), ("rook", c)])
                endings.add(out["ending"]["id"])
    assert len(endings) >= 3
    p, out = _play([("ilsa", 2), ("bram", 1), ("rook", 2)])
    O.talk(p, "oru", "start", None)
    assert "council" in p["flags"]


def test_council_locked_until_all_met_and_npcs_remember():
    p = O.new_explorer()
    p["x"], p["y"] = 0, 9
    view = O.talk(p, "oru")
    assert view["choices"][0]["locked"] is True
    with pytest.raises(O.OmniError, match="choice_locked"):
        O.talk(p, "oru", "start", 0)
    O.talk(p, "oru")
    assert p["npc"]["oru"]["times"] == 2
    p["bag"] = {"shell": 1}
    assert O.gift(p, "oru", "shell")["liked"] is True and p["npc"]["oru"]["rel"] == 8


def test_customisation_validation_and_seeded_realms():
    p = O.new_explorer()
    O.explorer_act(p, "customise", {"appearance": {"skin": 5, "cape": 3}}, A, {}, 0, None)
    with pytest.raises(O.OmniError):
        O.explorer_act(p, "customise", {"appearance": {"skin": 99}}, A, {}, 0, None)
    r1 = O.explorer_act(p, "create_realm", {"name": "Mirror", "seed": "abc"}, A, {}, 0, None)["realm"]
    q = O.new_explorer()
    r2 = O.explorer_act(q, "create_realm", {"name": "Mirror", "seed": "abc"}, A, {}, 0, None)["realm"]
    assert r1 == r2 and O.chunk(r1, 1, 1) == O.chunk(r2, 1, 1)


def test_norm_explorer_drops_bad_fields():
    p = O.norm_explorer({"x": "evil", "bag": [], "flags": ["a"], "hack": 1, "ending": "accord"})
    assert p["x"] == 0 and p["bag"] == {} and p["flags"] == ["a"] and "hack" not in p and p["ending"] == "accord"


# ---------------- discoveries, inventions and innovations
def _inventor():
    p = O.new_explorer()
    p["bag"] = {"wood": 10, "stone": 10, "crystal": 10, "petal": 10, "lux_mote": 10, "shell": 10, "berries": 10, "rope": 2, "fibre": 4}
    p["bestiary"] = ["mossback", "glowmoth"]
    return p


def test_invention_is_deterministic_for_same_seed_and_inputs():
    body = {"category": "technological", "form": "tool", "principles": ["lever"], "materials": {"wood": 2, "stone": 1}}
    a, b = _inventor(), _inventor()
    assert O.invent(a, dict(body), 99, 1, None) == O.invent(b, dict(body), 99, 1, None)
    assert a == b


def test_invention_validation_and_balancing_rules():
    p = _inventor()
    with pytest.raises(O.OmniError, match="rituals_are_mystical"):
        O.invent(p, {"category": "scientific", "form": "ritual", "principles": ["friction"], "materials": {"wood": 1}}, 1, 0, None)
    with pytest.raises(O.OmniError, match="category_mismatch"):
        O.invent(p, {"category": "scientific", "form": "tool", "principles": ["harmony"], "materials": {"wood": 1}}, 1, 0, None)
    with pytest.raises(O.OmniError, match="principle_locked"):
        O.invent(p, {"category": "technological", "form": "tool", "principles": ["circuit"], "materials": {"wood": 1}}, 1, 0, None)
    with pytest.raises(O.OmniError, match="too_ambitious"):
        O.invent(p, {"category": "scientific", "form": "tool", "principles": ["refraction", "photosynthesis"], "materials": {"lux_mote": 3, "crystal": 2}}, 1, 0, None)
    with pytest.raises(O.OmniError, match="not_observed"):
        O.invent(p, {"category": "scientific", "form": "tool", "principles": ["friction"], "materials": {"wood": 1}, "observation": "duskwolf"}, 1, 0, None)
    assert p["bag"]["wood"] == 10 and p["attempts"] == 0


def test_failed_attempt_keeps_materials_and_explains_why():
    p = _inventor()
    out = None
    for s in range(200):
        q = _inventor()
        r = O.invent(q, {"category": "scientific", "form": "ability", "principles": ["energy_transfer"], "materials": {"wood": 1}}, s, 0, None)
        if not r["ok"]:
            out, p = r, q
            break
    assert out and out["score"] < 55 and "heat idea doesn't suit a ability" in out["hint"]
    assert p["bag"]["wood"] == 10 and p["attempts"] == 1 and not p["inventions"]


def _succeed(p, body, tick=0, eco=None):
    for s in range(500):
        q = copy.deepcopy(p)
        r = O.invent(q, copy.deepcopy(body), s, tick, eco and copy.deepcopy(eco))
        if r["ok"]:
            p.clear(); p.update(q)
            return r, s
    raise AssertionError("never succeeded")


def test_inventions_change_gameplay_world_creatures_and_npcs():
    p = _inventor()
    r, _ = _succeed(p, {"category": "technological", "form": "tool", "principles": ["lever"], "materials": {"wood": 2, "stone": 1}})
    assert r["applied"] == {"yield:wood": 1} and r["rep"]["artificers"] == 2
    assert "kiln" in r["unlocked"] and "circuit" not in r["unlocked"], "the tree grows from what you invent (circuit needs two inventions)"
    tree = next(f for f in O.chunk(A, 0, 0)["features"] if f[2] in ("tree", "pine"))
    p["x"], p["y"] = tree[0], tree[1]
    assert O.explorer_act(p, "harvest", {"x": tree[0], "y": tree[1]}, A, {}, 1, None)["count"] == 2
    r2, _ = _succeed(p, {"category": "scientific", "form": "structure", "principles": ["photosynthesis"], "materials": {"petal": 2}, "observation": "mossback"})
    eco = O.new_ecology(A)
    kind = "inv:" + r2["invention"]["id"]
    spot = next((x, y) for x, y in ((1, 0), (0, 1), (-1, 0), (0, -1), (1, 1)) if not O.feature_at(A, {}, p["x"] + x, p["y"] + y, 2))
    placed = O.explorer_act(p, "place", {"kind": kind, "x": p["x"] + spot[0], "y": p["y"] + spot[1]}, A, {}, 2, eco)
    assert placed["policy"]["growth_bonus"] > 0
    plain = O.new_ecology(A)
    O.evolve(eco, A, 10)
    O.evolve(plain, A, 10)
    assert sum(eco["plants"].values()) > sum(plain["plants"].values()), "a growth structure makes plants grow faster"
    p["x"], p["y"] = O.OMNI["npcs"]["ilsa"]["x"], O.OMNI["npcs"]["ilsa"]["y"]
    assert "exactly the kind of thing" in O.talk(p, "ilsa")["remark"]


def test_mystical_is_labelled_symbolic_and_rituals_bless_the_ecology():
    p = _inventor()
    eco = O.new_ecology(A)
    for s in range(500):
        q, e = copy.deepcopy(p), copy.deepcopy(eco)
        r = O.invent(q, {"category": "mystical", "form": "ritual", "principles": ["harmony"], "materials": {"petal": 1}, "observation": "glowmoth"}, s, 0, e)
        if r["ok"]:
            break
    assert r["ok"] and "Symbolic, in-game only" in r["invention"]["explain"] and e["policy"]["spread_bonus"] >= 2
    assert all("make-believe" in O.DISC["label_mystical"] for _ in [0])


def test_duplicate_inventions_rejected_and_budget_grows():
    p = _inventor()
    body = {"category": "technological", "form": "tool", "principles": ["lever"], "materials": {"wood": 2, "stone": 1}}
    _, seed = _succeed(p, body)
    assert O.invention_budget(p) == 12
    with pytest.raises(O.OmniError, match="already_discovered"):
        O.invent(p, dict(body), seed, 0, None)
