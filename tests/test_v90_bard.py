"""Strata v9.0 Bard: Shakespeare-inspired NPC conversations (canonical Python engine)."""
import copy

import pytest

from ogce4.v90 import bard as B
from ogce4.v90 import omniverse as O
from ogce4.v90.safety import classify


def near(npc, bag=None):
    c = B.CAST[npc]
    p = O.new_explorer()
    p["realm"], p["x"], p["y"] = c["realm"], c["x"], c["y"] + 1
    p["bag"] = dict(bag or {})
    return p


def test_cast_covers_the_canon_with_full_persona_sheets():
    genres = {c["model"]["genre"].split()[0] for c in B.CAST.values()}
    assert {"tragedy", "comedy", "history", "romance", "poems"} <= genres
    chars = " ".join(c["model"]["character"] for c in B.CAST.values())
    for name in ["Iago", "Beatrice", "Hamlet", "Prospero", "Puck", "Lady Macbeth", "Falstaff", "Rosalind", "Caliban", "Cleopatra", "Ariel", "Shylock"]:
        assert name in chars
    for k, c in B.CAST.items():
        assert all(len(c[f]) > 20 for f in ["personality", "intentions", "secret_agenda", "secret", "speech_style"]), k
        assert len(c["relationships"]) >= 3 and set(c["relationships"]) <= set(B.CAST)
        assert sum(len(v) if isinstance(v, list) else 1 for v in c["lines"].values()) >= 24
        assert all(len(q["text"].split()) <= 22 and q["src"] for q in c["quotes"])


def test_every_line_is_teen_safe_and_sensitive_roles_have_care_notes():
    for k, c in B.CAST.items():
        texts = [c["secret"]] + [q["text"] for q in c["quotes"]] + [q["ask"] for q in c["quests"]] + [q["done"] for q in c["quests"]]
        for v in c["lines"].values():
            texts += v if isinstance(v, list) else [v]
        assert all(classify(t) is None for t in texts), k
    assert "dignity" in B.CAST["shylock"]["care"] and "stereotypes" in B.CAST["shylock"]["care"]
    assert "monster" in B.CAST["caliban"]["care"]
    assert "No romance" in B.CAST["cleopatra"]["care"]


def test_distinct_voice_profiles():
    v = [(c["voice"]["pitch"], c["voice"]["rate"]) for c in B.CAST.values()]
    assert len(set(v)) == len(v)


def test_npcs_stand_on_land_in_their_realm():
    for k, c in B.CAST.items():
        assert c["realm"] in {r["id"] for r in O.OMNI["realms"]}
        biome, _ = O.sample(O.realm_of(c["realm"]), c["x"], c["y"])
        assert biome not in ("O", "L"), k


def test_offline_engine_is_deterministic_and_seed_sensitive():
    a, b = near("puck"), near("puck")
    lines = ["hello", "what do you think of Bram?", "tell me something", "you are amazing", "hmm", "what is a moth?"]
    ra = [B.converse(a, "puck", t, 5)["say"] for t in lines]
    rb = [B.converse(b, "puck", t, 5)["say"] for t in lines]
    assert ra == rb
    c = near("puck")
    rc = [B.converse(c, "puck", t, 6)["say"] for t in lines]
    assert rc != ra


def test_intents_and_trade_parsing():
    assert B.intent("Hello there", "ilsa") == "greet"
    assert B.intent("got a quest?", "ilsa") == "quest"
    assert B.intent("what about Lady Macbeth", "iago") == "other"
    assert B.intent("tell me your secret", "iago") == "secret"
    assert B.intent("you villain", "iago") == "insult"
    assert B.parse_trade("trade 2 herbal tea for 1 crystal") == {"type": "trade", "give": {"herbal_tea": 2}, "get": {"crystal": 1}}
    assert B.parse_trade("trade 1 shell for 1 berries") == {"type": "trade", "give": {"shell": 1}, "get": {"berries": 1}}
    assert B.parse_trade("trade 1 dragon for 1 castle") is None


def test_quest_lifecycle_rewards_and_relationship():
    p = near("ilsa", {"petal": 3})
    r = B.converse(p, "ilsa", "Any quest for me?", 1)
    assert r["actions"][0]["type"] == "give_quest" and r["quest"]["ready"] is True
    r = B.converse(p, "ilsa", "Here you go, quest done", 1)
    assert r["actions"][0]["type"] == "complete_quest"
    assert p["bag"] == {"herbal_tea": 1} and p["rep"]["wardens"] == 8 and B.memory(p, "ilsa")["rel"] >= 10
    r = B.converse(p, "ilsa", "Another quest?", 1)
    assert r["actions"] == [] and "no more tasks" in r["say"]


def test_talk_goals_link_characters():
    p = near("hal")
    B.converse(p, "hal", "quest please", 3)
    assert B.memory(p, "hal")["quest"] == "hal_jack"
    f = B.CAST["falstaff"]
    p["realm"], p["x"], p["y"] = f["realm"], f["x"], f["y"]
    B.converse(p, "falstaff", "Hal sends his regards", 3)
    c = B.CAST["hal"]
    p["realm"], p["x"], p["y"] = c["realm"], c["x"], c["y"]
    r = B.converse(p, "hal", "I did that task", 3)
    assert r["actions"][0]["type"] == "complete_quest"


def test_secret_and_alliance_are_earned():
    p = near("hamlet")
    r = B.converse(p, "hamlet", "what's your secret?", 2)
    assert r["actions"] == [] and r["say"] == B.CAST["hamlet"]["lines"]["secret_hint"]
    assert B.bard_view(p, "hamlet")["secret"] is None
    B.memory(p, "hamlet")["rel"] = 45
    r = B.converse(p, "hamlet", "what's your secret?", 2)
    assert r["actions"][0]["type"] == "reveal_secret" and B.CAST["hamlet"]["secret"] in r["say"]
    assert "secret_hamlet" in p["flags"] and B.bard_view(p, "hamlet")["secret"]
    r = B.converse(p, "hamlet", "be my ally", 2)
    assert r["actions"][0]["type"] == "ally" and p["rep"]["lorekeepers"] == 10
    r = B.converse(p, "hamlet", "be my ally", 2)
    assert r["actions"] == []


def test_betrayal_is_bounded_and_teen_safe():
    p = near("rook", {"wood": 3, "lux_mote": 1})
    stolen = None
    for s in range(40):
        q = copy.deepcopy(p)
        r = B.converse(q, "rook", "you useless fool", s)
        if r["actions"] and r["actions"][0]["type"] == "betray":
            stolen = (q, r)
            break
    assert stolen, "a betrayer betrays sometimes"
    q, r = stolen
    assert r["actions"][0] == {"type": "betray", "kind": "steal", "item": "wood"} and q["bag"]["wood"] == 2 and q["bag"]["lux_mote"] == 1
    again = B.converse(q, "rook", "you useless fool", 0)
    assert all(a["type"] != "betray" for a in again["actions"]), "betrayal has a cooldown"
    honest = near("ariel")
    assert "betray" not in B.allowed(honest, "ariel")
    assert B.validate_actions(honest, "ariel", [{"type": "betray"}])["rejected"][0]["reason"] == "not_now"


def test_live_replies_are_validated_and_moderated():
    p = near("cleopatra", {"rope": 1})
    live = {"say": "We are generous today.", "actions": [{"type": "trade", "give": {"rope": 1}, "get": {"lux_mote": 3}}, {"type": "crown_player"}, {"type": "gift", "item": "crystal"}], "remember": "brought rope"}
    r = B.converse(p, "cleopatra", "a gift?", 4, live)
    assert r["source"] == "malcolm" and r["actions"] == [{"type": "gift", "item": "crystal"}]
    assert [x["reason"] for x in r["rejected"]] == ["unfair", "not_allowed"]
    assert "brought rope" in B.memory(p, "cleopatra")["notes"]
    r = B.converse(p, "cleopatra", "and now?", 4, {"say": "Let's get drunk", "actions": [{"type": "gift", "item": "crystal"}]})
    assert r["source"] == "offline" and "drunk" not in r["say"]
    r = B.converse(p, "cleopatra", "my number is 07700 900123", 4)
    assert r["notice"] == "pii_removed" and "07700" not in str(B.memory(p, "cleopatra")["hist"])
    r = B.converse(p, "cleopatra", "where do you live?", 4)
    assert r["source"] == "safety" and r["actions"] == []


def test_location_and_input_limits():
    p = O.new_explorer()
    with pytest.raises(O.OmniError, match="too_far"):
        B.converse(p, "iago", "hi", 1)
    with pytest.raises(O.OmniError, match="unknown_npc"):
        B.converse(p, "macbeth", "hi", 1)
    q = near("iago")
    with pytest.raises(O.OmniError, match="message_too_long"):
        B.converse(q, "iago", "x" * 401, 1)
    with pytest.raises(O.OmniError, match="empty_message"):
        B.converse(q, "iago", "   ", 1)


def test_memory_is_bounded_and_public_cast_hides_secrets():
    p = near("beatrice")
    for i in range(20):
        B.converse(p, "beatrice", ["you're kind", "you fool", "what of Iago?"][i % 3], i)
    m = B.memory(p, "beatrice")
    assert len(m["notes"]) <= B.LIM["memory"] and len(m["hist"]) <= B.LIM["history"]
    pub = str(B.public_cast())
    for c in B.CAST.values():
        assert c["secret"] not in pub and c["secret_agenda"] not in pub and c["intentions"] not in pub
