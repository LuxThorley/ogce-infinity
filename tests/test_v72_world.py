from ogce4.v70.runtime import GameRuntime

def test_v72_world_seeds_exploration_resources():
    state = GameRuntime.initial_world("Aurelia")
    resources = {item["resource"] for item in state["entities"] if item["kind"] == "resource"}
    assert {"crystal", "wood", "stone"} <= resources
    assert all(0 <= item["x"] <= 63 and 0 <= item["y"] <= 63 for item in state["entities"])

def test_v72_resource_gathering_persists_inventory(tmp_path):
    runtime = GameRuntime(tmp_path / "world.sqlite3")
    runtime.load("Aurelia")
    runtime.act("Aurelia", "tester", {"type":"move", "dx":1, "dy":0})
    runtime.act("Aurelia", "tester", {"type":"move", "dx":1, "dy":0})
    runtime.act("Aurelia", "tester", {"type":"move", "dx":0, "dy":1})
    runtime.act("Aurelia", "tester", {"type":"move", "dx":0, "dy":1})
    runtime.act("Aurelia", "tester", {"type":"move", "dx":1, "dy":0})
    result = runtime.act("Aurelia", "tester", {"type":"gather", "target":"crystal-01"})
    assert result["state"]["players"]["tester"]["inventory"]["crystal"] == 3


def test_v72_upgrades_existing_world_once(tmp_path):
    runtime = GameRuntime(tmp_path / "upgrade.sqlite3")
    # Simulate a previously saved v7.1 world lacking v7.2 discovery nodes.
    with runtime._db() as db:
        legacy = runtime.initial_world("Legacy")
        legacy["entities"] = legacy["entities"][:1]
        db.execute("INSERT INTO worlds VALUES(?,?,0)", ("Legacy", __import__("json").dumps(legacy)))
    first = runtime.load("Legacy")
    second = runtime.load("Legacy")
    ids = {item["id"] for item in first["state"]["entities"]}
    assert {"wood-01", "stone-01", "crystal-02", "wood-02"} <= ids
    assert second["revision"] == first["revision"]
