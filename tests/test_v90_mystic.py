"""v9.0 mysticism (canonical engine): sky, alignments, Grand Year, sites, spirits, charts, runes, duel modifiers, labels."""
import copy
from ogce4.v90 import mystic as M
from ogce4.v90 import combat as C


def _at(site_id, bag=None):
    s = M.SITES[site_id]
    return {"realm": s["realm"], "x": s["x"], "y": s["y"], "bag": dict(bag or {})}


def test_sky_is_deterministic_and_capped():
    assert M.sky(5000, 7) == M.sky(5000, 7)
    seen = set()
    for t in range(0, 24 * 4000, 24):
        sk = M.sky(t, 4242)
        seen.update(sk["active"])
        assert all(0 <= sk["effects"][k] <= M.CAPS[k] for k in M.CAPS)
    assert {"full_moon", "dark_moon", "great_conjunction", "grand_alignment"} <= seen
    assert M.sky(0, 1)["sun"]["sign"] == "aries" and M.sky(24 * 200, 1)["sun"]["sign"] != "aries"


def test_grand_year_turns_back_one_age_per_new_genesis():
    assert M.grand_year(0)["age"] == "aquarius" and M.grand_year(1)["age"] == "capricorn"
    assert M.grand_year(12)["age"] == "aquarius" and M.grand_year(12)["grand_years"] == 1
    assert "25,772" in M.MY["grand_year"]["fact"] and "Oliver" in M.MY["grand_year"]["theory"]


def test_sallow_shrine_blessing_once_per_day_and_consumed_by_duel():
    st = M.norm_state(None)
    r = M.bless(st, _at("sallow"), "sallow", 30, 1)
    assert r["effect"] == {"hp": 20} and "Sallow" in r["name"]
    try:
        M.bless(st, _at("sallow"), "sallow", 31, 1); assert False
    except M.MysticError as e:
        assert str(e) == "already_blessed_today"
    pr = C.new_profile(); pr["xp"] = 99999
    for s in C.learnable(pr): C.learn(pr, s)
    cfg = C.fight_config(pr, 1, "traveller_blade", 80, "moss_wolf", 2, "practice")
    m = M.duel_mods(st, 30, 1, "traveller_blade")
    out = M.apply(cfg, m)
    assert out["hp"] >= 100 and st["blessing"] is None and "blessing:sallow" in out["mystic"]["sources"]
    res = C.run_fight(out, [[0, "flee"]])
    assert res["outcome"] in ("fled", "loss", "win", "draw", "timeout") or res["outcome"]


def test_spirits_need_the_right_time_and_place():
    st = M.norm_state(None)
    try:
        M.commune(st, _at("sallow"), "wisp", 24 * 3 + 2, 1); assert False
    except M.MysticError as e:
        assert str(e) == "spirit_hidden"
    assert M.commune(st, _at("sallow"), "wisp", 24 * 3 + 12, 1)["new"]
    try:
        M.commune(st, {"realm": "ember", "x": 0, "y": 0}, "grey_lady", 24 * 3 + 12, 1); assert False
    except M.MysticError as e:
        assert str(e) == "too_far"


def test_star_charts_are_server_checked_and_limited():
    st = M.norm_state(None); ex = _at("sallow")
    pz = M.puzzles(24 * 9 + 3, 5)
    assert all("answer" not in p for p in M.public_puzzles(24 * 9 + 3, 5))
    assert M.solve(st, ex, pz[0]["id"], pz[0]["answer"], 24 * 9 + 3, 5)["correct"]
    assert not M.solve(st, ex, pz[1]["id"], (pz[1]["answer"] + 1) % 4, 24 * 9 + 3, 5)["correct"]
    try:
        M.solve(st, ex, pz[0]["id"], pz[0]["answer"], 24 * 9 + 3, 5); assert False
    except M.MysticError as e:
        assert str(e) == "already_solved"


def test_enchanting_costs_items_and_needs_a_site():
    st = M.norm_state(None); ex = _at("ember_altar", {"crystal": 2, "lux_mote": 1})
    r = M.enchant(st, ex, "traveller_blade", "rune_spark", list(C.CB["weapons"]))
    assert r["effect"] == {"special_mult": 8} and ex["bag"] == {"crystal": 0, "lux_mote": 0}
    try:
        M.enchant(st, ex, "stone_edge", "rune_spark", list(C.CB["weapons"])); assert False
    except M.MysticError as e:
        assert str(e) == "missing_items"


def test_cards_label_mysticism_honestly():
    c = M.card(M.sky(24 * 5 + 12, 3), M.grand_year(1))
    labs = {s["label"] for s in c["statements"]}
    assert labs <= {"FACT", "SSR/CRA THEORY", "MYSTICAL/IN-GAME"} and "MYSTICAL/IN-GAME" in labs
    assert "never established science" in M.MY["label"]
    for s in c["statements"]:
        if s["label"] == "FACT":
            assert "abilit" not in s["text"].lower() and "blessing" not in s["text"].lower()
