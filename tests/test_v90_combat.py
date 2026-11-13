"""v9.0 combat: balance and maths (TTK, stamina, parry window, combos, i-frames), adaptation, specials, invention."""
import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from ogce4.v90 import combat as C
from ogce4.v90 import omniverse as O
from ogce4.v90.safety import classify  # noqa: F401  (teen-safety classifier, if present)
from combat_bots import play

CB = C.CB


def prof(level=1, learn=True):
    p = C.new_profile(); p["xp"] = CB["skill"]["xp"][level - 1]
    if learn:
        for s in C.learnable(p): C.learn(p, s)
    return p


def stats(kind, sp="moss_wolf", el=1, w="traveller_blade", lv=1, n=20, adapt=None):
    wins = ticks = taken = 0; res = []
    for seed in range(n):
        p = prof(lv)
        if adapt: p["adapt"][sp] = dict(adapt)
        r, _ = play(C.fight_config(p, seed * 7919 + 1, w, 100, sp, el, "x"), kind)
        wins += r["outcome"] == "win"; ticks += r["ticks"]; taken += r["stats"]["taken"]; res.append(r)
    return wins / n, ticks / n / CB["tick_hz"], taken / n, res


def scripted(cfg, script):
    S = C.new_fight(cfg)
    while not S["over"]:
        C.step(S, script(S))
    return S


class Balance(unittest.TestCase):
    def test_skill_beats_mashing_and_turtling(self):
        sk = stats("skilled"); sl = stats("spam_light"); sh = stats("spam_heavy"); tu = stats("turtle")
        self.assertGreaterEqual(sk[0], 0.95)
        self.assertLess(sk[2], sl[2], "skilled play takes less damage than light-spam")
        self.assertLessEqual(sh[0], sk[0]); self.assertGreater(sh[2], sk[2], "heavy-spam is punished")
        self.assertEqual(tu[0], 0, "pure blocking never wins (guard breaks, chip damage)")
        self.assertTrue(5 <= sk[1] <= 25, "time-to-kill vs a level-1 wolf at skill 1 is %.1fs" % sk[1])

    def test_harder_foes_need_skill(self):
        sk = stats("skilled", el=3); sl = stats("spam_light", el=3)
        self.assertGreaterEqual(sk[0], 0.8); self.assertLessEqual(sl[0], 0.4)

    def test_progression_makes_you_stronger(self):
        lo = stats("skilled", el=3, lv=1); hi = stats("skilled", el=3, w="stone_edge", lv=4)
        self.assertLess(hi[1], lo[1]); self.assertLess(hi[2], lo[2])

    def test_fights_are_bounded(self):
        for r in stats("turtle", sp="silverhart")[3]:
            self.assertLessEqual(r["ticks"], CB["max_ticks"])


class Maths(unittest.TestCase):
    def cfg(self, lv=1, sp="lux_golem", seed=5, w="traveller_blade"):
        return C.fight_config(prof(lv), seed, w, 100, sp, 1, "x")

    def test_combo_chain_and_finisher_multipliers(self):
        self.assertEqual(CB["combo"]["chain"], [100, 120, 150])
        S = C.new_fight(self.cfg(lv=3)); S["P"]["last_kind"] = "light"; S["P"]["last_end"] = 0; S["t"] = 2; S["P"]["combo"] = 2
        mv = C._player_move(S, "heavy"); self.assertEqual((mv["kind"], mv["mult"]), ("finisher", CB["combo"]["finisher"]["mult"]))
        S1 = C.new_fight(self.cfg(lv=1)); S1["P"].update({"last_kind": "light", "last_end": 0, "combo": 2}); S1["t"] = 2
        self.assertEqual(C._player_move(S1, "heavy")["kind"], "heavy", "finisher unlocks at skill level 3")
        S1["P"]["combo"] = 2; self.assertEqual(C._player_move(S1, "light")["mult"], 100, "3rd chain hit needs level 2")

    def test_damage_formula(self):
        W, E = CB["weapons"]["stone_edge"], CB["enemies"]["moss_wolf"]
        raw = W["power"] * 220 // 100 * (100 + 4 * 4) // 100
        self.assertEqual(raw, 45); self.assertEqual(max(1, raw - E["armour"]), 44)

    def test_stamina_economy(self):
        cfg = self.cfg()
        S = C.new_fight(cfg); S["P"]["st"] = CB["moves"]["heavy"]["stamina"] - 1; C.step(S, ["heavy"])
        self.assertIn("tired", [e[1] for e in S["events"]], "stamina gates attacks")
        S = C.new_fight(cfg); S["P"]["st"] = CB["moves"]["dodge"]["stamina"]; C.step(S, ["dodge"]); self.assertEqual(S["P"]["st"], 0)
        S2 = C.new_fight(cfg); S2["P"]["st"] = 10
        for _ in range(10): C.step(S2, [])
        self.assertGreater(S2["P"]["st"], 10, "stamina regenerates when idle")

    def parry_at(self, lead):
        cfg = self.cfg(); fired = {}
        def script(S):
            E = S["E"]
            if E["phase"] == "windup" and E["move"]["kind"] == "light" and "t" not in fired and E["dur"] - E["pt"] == lead:
                fired["t"] = S["t"]; return ["block_on"]
            if "t" in fired and S["t"] > fired["t"] + 12: return ["flee"]
            return []
        S = C.new_fight(cfg); S["dist"] = 12
        while not S["over"]: C.step(S, script(S))
        return [e[1] for e in S["events"]]

    def test_parry_window(self):
        w = C.parry_window(1)
        self.assertEqual(w, 3)
        self.assertIn("parry", self.parry_at(1))
        self.assertNotIn("parry", self.parry_at(w + 3))
        self.assertEqual(C.parry_window(15), 6)

    def test_dodge_iframes_give_perfect_dodges(self):
        cfg = self.cfg()
        def script(S):
            E = S["E"]
            if E["phase"] == "windup" and E["dur"] - E["pt"] == 2: return ["dodge"]
            return ["flee"] if S["t"] > 400 else []
        S = C.new_fight(cfg); S["dist"] = 12
        while not S["over"]: C.step(S, script(S))
        self.assertGreater(S["stats"]["perfect"], 0); self.assertEqual(S["stats"]["enemy_hits"], 0)

    def test_hit_reactions_and_knockback(self):
        S = C.new_fight(self.cfg()); S["dist"] = 10; d0 = S["dist"]
        while "hit" not in [e[1] for e in S["events"]] and S["t"] < 20: C.step(S, ["light"] if S["t"] == 0 else [])
        self.assertEqual(S["E"]["phase"], "stun"); self.assertGreaterEqual(S["dist"], d0 + CB["moves"]["light"]["kb"] - CB["range"]["lunge"])

    def test_determinism(self):
        cfg = self.cfg(); ins = [[t, "light"] for t in range(0, 600, 5)]
        self.assertEqual(C.run_fight(cfg, ins), C.run_fight(cfg, ins))
        self.assertNotEqual(C.run_fight(cfg, ins)["events"], C.run_fight(self.cfg(seed=6), ins)["events"])


class Adaptation(unittest.TestCase):
    def test_enemy_learns_light_spam(self):
        habit = {"light": 60, "heavy": 2, "block": 2, "dodge": 2, "parry": 0, "fights": 5}
        g0 = sum(sum(1 for e in r["events"] if e[1] == "e_guard") for r in stats("spam_light", el=2)[3])
        g1 = sum(sum(1 for e in r["events"] if e[1] == "e_guard") for r in stats("spam_light", el=2, adapt=habit)[3])
        self.assertGreater(g1, g0)

    def test_enemy_learns_blocking_and_dodging(self):
        blocky = {"light": 2, "heavy": 2, "block": 60, "dodge": 2, "parry": 0, "fights": 5}
        r = stats("turtle", adapt=blocky)[3]
        self.assertGreater(sum(sum(1 for e in x["events"] if e[1] in ("e_feint", "e_heavy")) for x in r),
                           sum(sum(1 for e in x["events"] if e[1] in ("e_feint", "e_heavy")) for x in stats("turtle")[3]))
        dodgy = {"light": 2, "heavy": 2, "block": 2, "dodge": 60, "parry": 0, "fights": 5}
        self.assertGreater(sum(sum(1 for e in x["events"] if e[1] == "e_delay") for x in stats("skilled", adapt=dodgy)[3]), 0)

    def test_memory_decays(self):
        p = prof(); cfg = C.fight_config(p, 1, "traveller_blade", 100, "moss_wolf", 1, "x")
        r, _ = play(cfg, "spam_light"); C.apply_result(p, cfg, r)
        first = dict(p["adapt"]["moss_wolf"])
        cfg = C.fight_config(p, 2, "traveller_blade", 100, "moss_wolf", 1, "x"); r2, _ = play(cfg, "turtle"); C.apply_result(p, cfg, r2)
        self.assertEqual(p["adapt"]["moss_wolf"]["light"], first["light"] // 2 + r2["counts"]["light"])
        self.assertEqual(p["adapt"]["moss_wolf"]["fights"], 2)
        self.assertEqual(C.adapt_summary(p)["moss_wolf"]["fights"], 2)


class Specials(unittest.TestCase):
    def test_every_weapon_has_specials_that_outdamage_heavies(self):
        for w in CB["weapons"]:
            sp = [s for s in CB["specials"].values() if s["weapon"] == w]
            self.assertTrue(sp, w)
            for s in sp: self.assertGreater(s["mult"] * s["hits"], CB["moves"]["heavy"]["mult"] * 0.9, s["name"])

    def test_effects(self):
        p = prof(9); cfg = C.fight_config(p, 9, "stone_edge", 100, "moss_wolf", 1, "x")
        C.equip(p, "stone_edge", ["quarry_quake"]); cfg = C.fight_config(p, 9, "stone_edge", 100, "moss_wolf", 1, "x")
        S = C.new_fight(cfg); S["P"]["focus"] = 100; S["dist"] = 12; C._start(S["E"], "stun", 40)
        for _ in range(30): C.step(S, ["special1"] if S["t"] == 0 else [])
        ev = [e[1] for e in S["events"]]
        self.assertIn("special:quarry_quake", ev); self.assertIn("effect:root", ev)
        self.assertGreater(S["E"]["root"], 0)

    def test_specials_need_focus(self):
        p = prof(9); cfg = C.fight_config(p, 9, "crystal_sabre", 100, "moss_wolf", 1, "x")
        S = C.new_fight(cfg); C.step(S, ["special1"])
        self.assertIn("no_focus", [e[1] for e in S["events"]])

    def test_invent_validation(self):
        full = O.new_explorer(); full.update({"bestiary": ["duskwolf", "glowmoth", "mossback"], "bag": {"crystal": 5, "lux_mote": 4, "rope": 1},
                                              "inventions": [{"domain": "heat"}, {"domain": "light"}, {"domain": "motion"}]}); full["rep"]["lorekeepers"] = 10
        low = prof(1)
        r = C.invent_move(low, full, {"weapon": "traveller_blade", "shape": "burst", "principles": ["circuit", "natural_selection"]}, 1)
        self.assertFalse(r["ok"]); self.assertFalse(r["laws"][0]["ok"], "conservation: too powerful for skill level 1")
        with self.assertRaises(C.CombatError): C.invent_move(low, O.new_explorer(), {"weapon": "traveller_blade", "shape": "arc", "principles": ["circuit"]}, 1)
        hi = prof(11); made = 0
        for seed in range(12):
            r = C.invent_move(hi, full, {"weapon": "traveller_blade", "shape": "arc", "principles": ["friction"]}, seed)
            if r["ok"]:
                made += 1; m = r["move"]
                self.assertEqual([c["label"] for c in m["card"]], ["FACT", "FACT", "SSR/CRA THEORY", "IN-GAME"])
                self.assertIn(m["id"], hi["loadout"].get("traveller_blade", []) + list(hi["specials"]))
            if len(hi["invented"]) >= CB["invent"]["max"]: break
        self.assertGreater(made, 0)
        r = C.invent_move(prof(11), full, {"weapon": "fists", "shape": "burst", "principles": ["lux_sigil"]}, 3)
        if r["ok"]:
            self.assertTrue(r["move"]["symbolic"]); self.assertEqual(r["move"]["card"][1]["label"], "MYSTICAL/IN-GAME")

    def test_xp_and_unlocks(self):
        p = prof(1, learn=False); cfg = C.fight_config(p, 3, "traveller_blade", 100, "lux_golem", 1, "practice")
        r, _ = play(cfg, "skilled"); a = C.apply_result(p, cfg, r)
        self.assertLessEqual(a["xp"], CB["skill"]["xp_cap"]); self.assertGreater(a["xp"], 0)
        p2 = C.new_profile(); p2["xp"] = 55; cfg = C.fight_config(p2, 3, "traveller_blade", 100, "lux_golem", 1, "practice")
        r, _ = play(cfg, "skilled"); a = C.apply_result(p2, cfg, r)
        self.assertTrue(a["levelled"]); self.assertIn("wayfarers_arc", a["unlocked"])

    def test_inputs_validated(self):
        for bad in [None, [[0, "kick"]], [[3, "light"], [1, "light"]], [[True, "light"]], [[0, "light"]] * 5]:
            with self.assertRaises(C.CombatError): C.validate_inputs(bad)


if __name__ == "__main__":
    unittest.main()
