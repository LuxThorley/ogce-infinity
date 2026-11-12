import json, pytest
from ogce4.v6.storage import WorldStore
from ogce4.v6.player import create_player, grant_item, apply_player_action
from ogce4.v6.planning import plan_goals
from ogce4.v6.economy import economy_step
from ogce4.v6.authority import CommandAuthority
from ogce4.v6.malcolm_api import MalcolmConfig, MalcolmOmniAPI, MalcolmAPIError

def test_storage_roundtrip_and_revision(tmp_path):
    db=WorldStore(tmp_path/"world.db")
    assert db.save("w1",{"tick":1})["revision"]==1
    assert db.load("w1")["state"]=={"tick":1}
    with pytest.raises(RuntimeError): db.save("w1",{"tick":2},expected_revision=0)
    assert db.save("w1",{"tick":2},expected_revision=1)["revision"]==2

def test_storage_history_idempotency(tmp_path):
    db=WorldStore(tmp_path/"world.db")
    db.save("w",{"x":1},event_id="evt1",event={"kind":"spawn"})
    assert db.history("w")[0]["event"]["kind"]=="spawn"
    with pytest.raises(Exception): db.save("w",{"x":2},event_id="evt1",event={"kind":"duplicate"})

def test_player_permissions_and_inventory():
    p=create_player("p1","Player")
    p=grant_item(p,"crystal",3)
    assert p["inventory"]["crystal"]==3
    assert apply_player_action(p,"move",{"position":[1,2,3]})["position"]==[1.,2.,3.]
    p["permissions"]=[]
    with pytest.raises(PermissionError): apply_player_action(p,"move",{"position":[0,0,0]})

def test_planner_rank_and_prerequisites():
    goals=[{"name":"explore","priority":.8,"urgency":.5},{"name":"craft","priority":1,"urgency":1,"requires":["ore"]}]
    assert plan_goals(goals,{})[0]["name"]=="explore"
    assert plan_goals(goals,{"ore":True})[0]["name"]=="craft"

def test_economy_bounded_and_deterministic():
    state=economy_step({"resources":{"food":10}},{"food":5},{"food":3})
    assert state["resources"]["food"]==12 and state["turn"]==1
    with pytest.raises(ValueError): economy_step({},{"ore":-1})

def test_authority_idempotency_and_revision():
    auth=CommandAuthority({"echo":lambda actor,payload:{"actor":actor,"value":payload["v"]}})
    first=auth.submit("c1","player","echo",{"v":2},0)
    assert auth.submit("c1","player","echo",{"v":2},0)==first
    with pytest.raises(RuntimeError): auth.submit("c2","player","echo",{"v":3},0)
    with pytest.raises(ValueError): auth.submit("c1","player","echo",{"v":9},1)

def test_authority_blocks_unlisted_action():
    with pytest.raises(PermissionError): CommandAuthority({}).submit("x","p","admin",{},0)

def test_malcolm_config_requires_https():
    with pytest.raises(ValueError): MalcolmConfig(base_url="http://example.com").validate()

def test_malcolm_never_embeds_token_and_requires_env_token(monkeypatch):
    monkeypatch.delenv("MALCOLM_OMNI_API_TOKEN",raising=False)
    api=MalcolmOmniAPI()
    assert not api.configured
    with pytest.raises(MalcolmAPIError): api.command("hello")

def test_malcolm_optimizer_requires_approval():
    api=MalcolmOmniAPI(MalcolmConfig(token="test-token"))
    with pytest.raises(PermissionError): api.optimize("world",{})
