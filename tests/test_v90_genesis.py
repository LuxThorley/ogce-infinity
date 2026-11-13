"""v9.0 Genesis backbone (premise, objective, Lux, strata, laws, endings, rewards, New Genesis)."""
import unittest
from ogce4.v90 import genesis as G
from ogce4.v90 import omniverse as O
from ogce4.v90.safety import classify


class Genesis(unittest.TestCase):
    def facts(self, **kw):
        return G.norm_facts(kw)

    def test_constants_and_labels(self):
        self.assertEqual([l["value"] for l in G.GEN["laws"]], ["4500", "12.32", "72", "144", "144000", "26000", "365.26"])
        for l in G.GEN["laws"]:
            self.assertIn("Oliver", l["theory"])
            for t in [l["q"], l["fact"], l["theory"], *l["options"]]:
                self.assertIsNone(classify(t), t)
        for e in G.GEN["endings"].values():
            self.assertIsNone(classify(e["text"]))

    def test_lux_understanding_first(self):
        self.assertLessEqual(G.lux(G.new_record(), self.facts(wins=999))["total"], G.GEN["lux"]["win_cap"])
        self.assertGreater(G.lux(G.new_record(), self.facts(discoveries=3, principles=3))["total"], G.lux(G.new_record(), self.facts(wins=999))["total"])

    def test_strata_need_laws_and_lux(self):
        rec = G.new_record(); rich = self.facts(discoveries=99)
        self.assertEqual(G.stratum_index(rec, G.lux(rec, rich)["total"]), 0, "Lux alone can't climb: each stratum needs a law")
        rec["laws"] = [l["id"] for l in G.GEN["laws"]]
        self.assertEqual(G.stratum_index(rec, G.lux(rec, rich)["total"]), 7)

    def full(self, **kw):
        rec = G.new_record(); f = self.facts(discoveries=9, principles=12, inventions=6, allies=4, secrets=5, quiz=9, explored=80, quests=10, choices=15, **kw)
        for l in G.GEN["laws"]:
            self.assertTrue(G.claim_law(rec, f, l["id"], l["answer"])["correct"])
        return rec, f

    def test_endings_are_choice_driven(self):
        rec, f = self.full(combat_level=1)
        view = {e["id"]: e for e in G.endings_view(rec, f)}
        self.assertTrue(view["harmony"]["available"]); self.assertFalse(view["power"]["available"]); self.assertTrue(view["sacrifice"]["available"])
        self.assertTrue(view["stranger"]["hidden"])
        with self.assertRaises(G.GenesisError): G.choose_ending(rec, f, "power")
        rec2, f2 = self.full(clues=3, combat_level=6)
        self.assertEqual(G.choose_ending(rec2, f2, "stranger")["name"], "The Stranger")

    def test_new_genesis_carries_codex_and_deepens(self):
        rec, f = self.full(); G.choose_ending(rec, f, "harmony")
        ex = O.new_explorer(); ex["inventions"] = [{"id": "i1", "name": "Lamp", "domain": "light"}]
        with self.assertRaises(G.GenesisError): G.new_genesis(rec, f, ex, False)
        r = G.new_genesis(rec, f, ex, True)
        self.assertEqual(r["cycle"], 1); self.assertEqual(r["deeper"], 10); self.assertEqual(r["keep"]["inventions"], ex["inventions"])
        self.assertEqual(rec["archive"][0]["ending"], "harmony"); self.assertEqual(rec["laws"], [])
        self.assertGreater(G.strata_list(1)[1]["lux"], G.strata_list(0)[1]["lux"])

    def test_rewards(self):
        rec, f = self.full(); ex = O.new_explorer()
        G.claim_reward(rec, f, ex, "mat_crystal_1"); self.assertEqual(ex["bag"]["crystal"], 5)
        G.claim_reward(rec, f, ex, "cos_aura"); self.assertIn("cos_aura", rec["unlocked"])
        with self.assertRaises(G.GenesisError): G.claim_reward(rec, f, ex, "title_stranger")
        with self.assertRaises(G.GenesisError): G.set_title(rec, "title_keeper")
        G.claim_reward(rec, f, ex, "title_keeper"); self.assertEqual(rec["title"], "title_keeper")

    def test_wrong_answers_teach(self):
        rec = G.new_record(); f = self.facts(discoveries=1)
        r = G.claim_law(rec, f, "c4500", 0); self.assertFalse(r["correct"]); self.assertIn("FACT", r["hint"])
        with self.assertRaises(G.GenesisError): G.claim_law(rec, f, "c4500", True)


if __name__ == "__main__":
    unittest.main()
