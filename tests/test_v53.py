from copy import deepcopy
import pytest
from ogce4.v53.npc import NPC, relationship_update
from ogce4.v53.civilization import create_civilization, set_relation, negotiate, declare_conflict, trade
from ogce4.v53.ecosystem import create_ecosystem, step_ecosystem
from ogce4.v53.events import generate_event, append_chronicle
from ogce4.v53.simulation import create_world, world_tick

def test_npc_action_prioritizes_high_need():
    npc = NPC("a", "A", needs={"hunger": .95, "safety": .1, "belonging": .1, "curiosity": .1})
    assert npc.choose_action() == "eat"

def test_npc_memory_is_bounded():
    npc = NPC("a", "A")
    for i in range(80): npc.remember(i, "note", str(i), .5)
    assert len(npc.memory) == 50

def test_npc_relationship_bounded():
    npc = NPC("a", "A")
    for _ in range(100): relationship_update(npc, "b", 1)
    assert 0 < npc.relationships["b"] <= 1

def test_npc_rejects_invalid_need():
    with pytest.raises(ValueError): NPC("a", "A", needs={"hunger": 2})

def test_ecosystem_reproducible():
    a = create_ecosystem(seed=4); b = create_ecosystem(seed=4)
    for _ in range(12): a = step_ecosystem(a); b = step_ecosystem(b)
    assert a == b

def test_ecosystem_bounds_populations():
    state = create_ecosystem(flora=1_000_000, herbivores=1_000_000, predators=1_000_000)
    out = step_ecosystem(state)
    assert all(0 <= v <= 1_000_000 for v in out["populations"].values())

def test_ecosystem_rejects_bad_climate():
    with pytest.raises(ValueError): step_ecosystem(create_ecosystem(), climate=9)

def test_civilization_diplomacy_and_treaty():
    c = create_civilization("A")
    c = set_relation(c, "B", 20)
    c = negotiate(c, "B", "river accord")
    assert c["relations"]["B"] == 30 and c["treaties"]

def test_civilization_conflict():
    c = declare_conflict(create_civilization("A"), "B")
    assert c["relations"]["B"] == -100 and c["wars"][0]["status"] == "active"

def test_trade_is_atomic_and_validated():
    a = {"stock": {"food": 10}}; b = {"stock": {"food": 1}}
    aa, bb = trade(a, b, "food", 4)
    assert aa["stock"]["food"] == 6 and bb["stock"]["food"] == 5
    assert a["stock"]["food"] == 10
    with pytest.raises(ValueError): trade(a, b, "food", 20)

def test_events_seeded():
    assert generate_event(1, 2) == generate_event(1, 2)
    assert generate_event(1, 2) != generate_event(2, 2)

def test_chronicle_deduplicates():
    event = generate_event(1, 1)
    assert len(append_chronicle([event], event)) == 1

def test_world_tick_integrates_subsystems():
    state = create_world()
    result = world_tick(state)
    assert result["tick"] == 1
    assert result["ecosystem"]["tick"] == 1
    assert result["civilization"]["turn"] == 1
    assert result["npcs"][0]["memory"]
    assert len(result["chronicle"]) == 1
    assert state["tick"] == 0

def test_world_replay_deterministic():
    a = create_world(seed=12); b = create_world(seed=12)
    for _ in range(8): a = world_tick(a); b = world_tick(b)
    assert a == b

def test_world_cli_tick_limit():
    from ogce4.cli_v53 import main
    import sys
    old = sys.argv
    try:
        sys.argv = ["ogce53", "simulate-world", "--ticks", "0"]
        main()
    finally:
        sys.argv = old
