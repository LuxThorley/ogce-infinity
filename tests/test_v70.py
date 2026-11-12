
import json
from ogce4.v70.runtime import GameRuntime

def test_persistent_world_and_revision(tmp_path):
    db=tmp_path/"world.db"; a=GameRuntime(db)
    snap=a.load("Test"); assert snap["revision"]==0
    out=a.act("Test","p1",{"type":"move","dx":1,"dy":0})
    assert out["revision"]==1 and out["state"]["players"]["p1"]["x"]==3
    b=GameRuntime(db); loaded=b.load("Test")
    assert loaded["revision"]==1 and loaded["state"]["players"]["p1"]["x"]==3
    assert len(b.events_since("Test",0))==1

def test_server_authoritative_validation(tmp_path):
    r=GameRuntime(tmp_path/"w.db")
    try:r.act("W","p",{"type":"move","dx":8,"dy":0})
    except ValueError as e: assert "cardinal" in str(e)
    else: assert False

def test_gather_requires_proximity(tmp_path):
    r=GameRuntime(tmp_path/"w.db")
    try:r.act("W","p",{"type":"gather","target":"crystal-01"})
    except ValueError as e: assert "reach" in str(e)
    else: assert False
