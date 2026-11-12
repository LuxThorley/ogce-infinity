from ogce4.v70.runtime import GameRuntime

def player_state(runtime, world="Arena", player="hero"):
    return runtime.load(world)["state"]["players"].get(player)

def test_creature_combat_awards_xp_and_loot(tmp_path):
    runtime=GameRuntime(tmp_path/"combat.sqlite3")
    runtime.load("Arena")
    # Position the player close enough to the first moss wolf.
    for _ in range(10):
        runtime.act("Arena","hero",{"type":"move","dx":1,"dy":0})
    for _ in range(6):
        runtime.act("Arena","hero",{"type":"move","dx":0,"dy":1})
    for _ in range(3):
        result=runtime.act("Arena","hero",{"type":"attack","target":"moss-wolf-01"})
    p=result["state"]["players"]["hero"]
    wolf=next(c for c in result["state"]["creatures"] if c["id"]=="moss-wolf-01")
    assert wolf["alive"] is False
    assert p["xp"] >= 25
    assert p["inventory"]["wood"] >= 2

def test_crafting_consumes_materials_and_equips_weapon(tmp_path):
    runtime=GameRuntime(tmp_path/"craft.sqlite3")
    runtime.load("Craft")
    # Seed inventory through authoritative state setup for recipe unit test.
    with runtime._db() as db:
        import json
        state=json.loads(db.execute("SELECT state FROM worlds WHERE id='Craft'").fetchone()["state"])
        state["players"]["hero"]={"x":2,"y":2,"health":100,"max_health":100,"hunger":0,
          "inventory":{"stone":5,"wood":2},"level":1,"xp":0,"equipment":{"weapon":"traveller_blade"},"quests":{},"potions":0}
        db.execute("UPDATE worlds SET state=? WHERE id='Craft'",(json.dumps(state),))
    result=runtime.act("Craft","hero",{"type":"craft","recipe":"stone_edge"})
    p=result["state"]["players"]["hero"]
    assert p["equipment"]["weapon"]=="stone_edge"
    assert p["inventory"]["stone"]==0 and p["inventory"]["wood"]==0

def test_quest_acceptance_progress_and_claim(tmp_path):
    runtime=GameRuntime(tmp_path/"quest.sqlite3")
    runtime.load("Quest")
    runtime.act("Quest","hero",{"type":"quest","operation":"accept","quest_id":"gatherer_path"})
    # Add a nearby wood node for a deterministic gather test.
    with runtime._db() as db:
        import json
        state=json.loads(db.execute("SELECT state FROM worlds WHERE id='Quest'").fetchone()["state"])
        state["entities"].append({"id":"test-wood","kind":"resource","x":2,"y":3,"resource":"wood","quantity":8})
        db.execute("UPDATE worlds SET state=? WHERE id='Quest'",(json.dumps(state),))
    runtime.act("Quest","hero",{"type":"move","dx":0,"dy":1})
    runtime.act("Quest","hero",{"type":"gather","target":"test-wood"})
    runtime.act("Quest","hero",{"type":"gather","target":"test-wood"})
    result=runtime.act("Quest","hero",{"type":"quest","operation":"claim","quest_id":"gatherer_path"})
    p=result["state"]["players"]["hero"]
    assert p["quests"]["gatherer_path"]["claimed"]
    assert p["inventory"]["wood"]>=3

def test_advance_tick_moves_hostile_creature_toward_player(tmp_path):
    runtime=GameRuntime(tmp_path/"ai.sqlite3")
    state=runtime.load("AI")["state"]
    wolf=next(c for c in state["creatures"] if c["id"]=="moss-wolf-01")
    # Move player near wolf via state seeding; AI is deterministic.
    with runtime._db() as db:
        import json
        state=json.loads(db.execute("SELECT state FROM worlds WHERE id='AI'").fetchone()["state"])
        state["players"]["hero"]={"x":10,"y":8,"health":100,"max_health":100,"hunger":0,"inventory":{},"level":1,"xp":0,"equipment":{"weapon":"traveller_blade"},"quests":{},"potions":0}
        db.execute("UPDATE worlds SET state=? WHERE id='AI'",(json.dumps(state),))
    result=runtime.act("AI","hero",{"type":"advance"})
    moved=next(c for c in result["state"]["creatures"] if c["id"]=="moss-wolf-01")
    assert moved["x"] < 12
