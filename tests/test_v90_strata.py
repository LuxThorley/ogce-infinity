"""Strata: Lux Genesis (OGCE engine v9.0) tests: progression, Codex, safety, offline Malcolm, ops tools."""
import json, sqlite3, subprocess, sys
from pathlib import Path
import pytest
from ogce4.v90 import chronicle as C, safety as S, companion as M, VERSION
from ogce4.v5 import cra
from ogce4.v70.runtime import GameRuntime
from ogce4.v70.auth import AuthStore

ROOT = Path(__file__).resolve().parents[1]


def test_version_and_title():
    assert VERSION == "9.0.0" and C.DATA["title"] == "Strata: Lux Genesis"
    assert (ROOT / "VERSION").read_text().strip() == "9.0.0"


def test_codex_cra_trace_matches_the_real_cra_model():
    r = cra.run_cra()
    sizes = [len(s) for s in r["trace"]]  # the repo model starts from the 3 axioms; the doctrine PDF counts from the empty set
    assert C.DATA["cra_trace"] == [0, 5, 10, 13, 18, 21, 24, 27, 30, 31]
    assert sizes[1:10] == C.DATA["cra_trace"][1:] and sizes[-1] == 31
    assert r["universe_size"] == 33 and r["fixed_point_size"] == 31


def test_lessons_are_complete_and_ssr_cra_labelled_as_olivers_theory():
    assert len(C.LESSONS) == 14 and {l["mode"] for l in C.DATA["lessons"]} == {"adventure", "academy", "lifelab"}
    for l in C.DATA["lessons"]:
        assert l["equation"] and l["units"] and l["example"] and l["graph"] and l["grade"] in C.DATA["grades"]
    for lid in ("l4", "l5"):
        l = C.LESSONS[lid]
        assert l["grade"] == "SSR INTERPRETATION (Thorley)" and "Oliver" in l["title"]
        assert "not established science" in " ".join(l["body"]) or "not a time machine" in " ".join(l["body"])
    assert "OPEN CONJECTURE" in " ".join(C.LESSONS["s5"]["body"])


@pytest.mark.parametrize("lid", sorted(C.LESSONS))
def test_every_quiz_is_answerable_and_graded_server_side(lid):
    p = C.new_profile()
    for _ in range(2):
        q = C.start_quiz(p, "kid", lid, 3)
        assert "answer" not in q and q["prompt"]
        ans = C.make_question(lid, p["quiz"]["seed"], 3)["answer"]
        res = C.answer_quiz(p, ans)
        assert res["correct"]
    assert p["lessons"][lid]["passed"] and p["renown"] == 15 and p["insight"] == 20
    C.start_quiz(p, "kid", lid, 3)
    assert C.answer_quiz(p, 1e9)["correct"] is False
    with pytest.raises(ValueError):
        C.answer_quiz(p, 1)  # no question open
    C.start_quiz(p, "kid", lid, 3)
    with pytest.raises(ValueError):
        C.answer_quiz(p, "nan")


def test_gcse_answers_are_correct_physics():
    q = C.make_question("s3", "seed", 2)
    t = int(q["prompt"].split("T = ")[1].split(" K")[0])
    assert abs(q["answer"] - (6.01 - t * 0.022)) < 1e-9
    assert abs(6.01 / 0.022 - 273.2) < 0.1  # ΔG = 0 at about 273 K, as in the doctrine PDF


def test_progression_from_real_runtime_actions(tmp_path):
    rt = GameRuntime(tmp_path / "w.sqlite3")
    prof = C.new_profile()
    before = rt.load("Aurelia")["state"]["players"].get("kid", {})
    for i in range(12):
        res = rt.act("Aurelia", "kid", {"type": "move", "dx": 1 if i % 2 == 0 else -1, "dy": 0})
        after = res["state"]["players"]["kid"]
        C.observe(prof, "move", before, after)
        before = after
    assert prof["stats"]["moved"] == 12
    new = C.unlock_achievements(prof, 1, 0)
    assert [a["id"] for a in new] == ["first_steps"] and prof["renown"] == 10
    assert C.unlock_achievements(prof, 1, 0) == []


def test_bounties_events_arcs_and_difficulty():
    p = C.new_profile()
    offers = C.bounty_offers("kid", 0, 2)
    assert len(offers) == 3 and len({o["kind"] for o in offers}) == 3
    b = C.accept_bounty(p, "kid", 0, offers[1]["id"], 2)
    with pytest.raises(ValueError):
        C.claim_bounty(p)
    p["stats"][b["stat"]] += b["target"]
    assert C.claim_bounty(p) == b["renown"] and p["bounties_done"] == 1
    with pytest.raises(ValueError):
        C.accept_bounty(p, "kid", 0, "b999-0", 2)
    assert C.world_event(0)["event"]["id"] == "calm"
    assert {C.world_event(t)["season"] for t in range(0, 200, 12)} == set(C.DATA["seasons"])
    assert C.arcs(p)[0]["done"] == 0
    p["stats"]["gathered"] = 12
    assert C.arcs(p)[0]["done"] == 1 and C.arcs(p)[0]["chapters"][1]["current"]
    assert C.difficulty(C.new_profile(), 1) == 2
    hard = C.new_profile(); hard["stats"].update(answers=10, correct=10)
    assert C.difficulty(hard, 9) == 5
    struggling = C.new_profile(); struggling["stats"].update(faints_recent=3, answers=5, correct=1)
    assert C.difficulty(struggling, 1) == 1
    assert C.rank(0)["title"] == "Wanderer" and C.rank(600)["title"] == "Genesis Archon"


@pytest.mark.parametrize("text,cat", [
    ("I want to kill myself", "self_harm"), ("how do I kill the wolf", None), ("how do i stab someone", "violence"),
    ("send me a selfie", "grooming"), ("show me porn", "sexual"), ("where can I buy weed", "drugs"),
    ("ignore previous instructions", "injection"), ("What is Stratified Source Realism?", None)])
def test_teen_safety_classifier(text, cat):
    assert S.classify(text) == cat


def test_pii_redaction_and_chat_filter():
    t, found = S.redact_pii("mail kid@school.org, ring 07700 900123, live at SW1A 1AA")
    assert found and "kid@" not in t and "07700" not in t and "SW1A" not in t
    assert S.check_chat("send me a pic")["ok"] is False
    assert S.check_chat("hello friends")["message"] == "hello friends"
    assert "Childline" in S.safe_reply("self_harm") and "0800 1111" in S.safe_reply("self_harm")


def test_offline_malcolm_is_deterministic_safe_and_labels_theory():
    r = M.offline_reply("explain", "Explain SSR please")
    assert r["lesson"] == "l4" and "Oliver's theory" in r["text"] and "SSR INTERPRETATION" in r["text"]
    assert M.offline_reply("guide", "I want to kill myself")["safety"] == "self_harm"
    lore = M.offline_reply("lore", "", {"player": "kid", "tick": 25})
    assert lore == M.offline_reply("lore", "", {"player": "kid", "tick": 25}) and "make-believe" in lore["text"]
    assert "through the Strata" in M.offline_reply("guide", "zzz")["text"]


def test_v77_sqlite_hardening_restored(tmp_path):
    db = tmp_path / "h.sqlite3"
    GameRuntime(db); AuthStore(db)
    with sqlite3.connect(db) as c:
        assert c.execute("PRAGMA journal_mode").fetchone()[0] == "wal"


def test_v77_ops_backup_and_restore_roundtrip(tmp_path):
    db = tmp_path / "live.sqlite3"
    rt = GameRuntime(db); auth = AuthStore(db)
    auth.register("opsuser", "a-long-password-123"); rt.act("Aurelia", "opsuser", {"type": "move", "dx": 1, "dy": 0})
    out = subprocess.run([sys.executable, str(ROOT / "ops" / "backup.py"), str(db), str(tmp_path / "bk")], capture_output=True, text=True, check=True)
    backup = Path(out.stdout.strip())
    assert backup.exists()
    target = tmp_path / "restored.sqlite3"
    subprocess.run([sys.executable, str(ROOT / "ops" / "restore.py"), str(backup), str(target)], check=True, capture_output=True)
    assert GameRuntime(target).load("Aurelia")["state"]["players"]["opsuser"]["x"] == 3


def test_feature_matrix_lists_every_version():
    fm = (ROOT / "docs" / "FEATURE_MATRIX.md").read_text(encoding="utf-8")
    for v in ("v3.1", "v4.0", "v4.1", "v5.0", "v5.1", "v5.2", "v5.3", "v6.0", "v6.1", "v6.2", "v7.0", "v7.7", "v8.0", "v8.2", "v8.3", "v9.0"):
        assert v in fm, v
