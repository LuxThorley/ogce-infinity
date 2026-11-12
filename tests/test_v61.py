import json, threading, urllib.request, urllib.error, pytest
from ogce4.v61.memory import AgentMemory
from ogce4.v61.policy import ActionPolicy
from ogce4.v61.orchestrator import AgentOrchestrator
from ogce4.v61.streaming import FeedPoller
from ogce4.v61.service import OGCEHandler
from ogce4.v6.malcolm_api import MalcolmConfig, MalcolmOmniAPI

def test_memory_add_search_and_scope(tmp_path):
    m=AgentMemory(tmp_path/"m.db",max_items=10)
    m.add("npc1","world1","Mira discovered an ancient forest","discovery",["forest"],.9)
    assert m.search("npc1","world1","ancient forest")[0]["kind"]=="discovery"
    assert m.search("npc2","world1","ancient forest")==[]

def test_memory_is_bounded(tmp_path):
    m=AgentMemory(tmp_path/"m.db",max_items=3)
    for i in range(6): m.add("a","w",f"note {i}",importance=i/6)
    assert len(m.search("a","w","note",limit=10))<=3

def test_policy_blocks_privileged_action_without_approval():
    p=ActionPolicy()
    assert not p.evaluate("economy.transfer",{"amount":5})["allowed"]
    assert p.evaluate("economy.transfer",{"amount":5},True,("admin",))["allowed"]
    assert not p.evaluate("shell.exec",{})["allowed"]

class FakeProvider:
    def __init__(self,response=None): self.response=response or {}
    def command(self,*args,**kwargs): return self.response
    def stream(self,cursor=None): return {"items":[{"id":1}],"next_cursor":"next"}

def test_orchestrator_only_calls_local_allowlisted_tool():
    called=[]
    provider=FakeProvider({"response":"advice","actions":[{"name":"npc.suggest","payload":{"goal":"explore"}},{"name":"shell.exec","payload":{}}]})
    o=AgentOrchestrator(provider,{"npc.suggest":lambda p:called.append(p) or {"ok":True}})
    r=o.assist("help")
    assert len(called)==1 and r["tool_results"][1]["status"]=="blocked"

def test_orchestrator_requires_approval_for_mutation():
    provider=FakeProvider({"actions":[{"name":"world.write","payload":{"x":1}}]})
    o=AgentOrchestrator(provider,{"world.write":lambda p:p})
    assert o.assist("write")["tool_results"][0]["status"]=="blocked"
    assert o.assist("write",approved=True,actor_permissions=("admin",))["tool_results"][0]["status"]=="completed"

def test_feed_poller_cursor_and_bound():
    poller=FeedPoller(FakeProvider(),max_batches=2)
    r=poller.poll_once()
    assert r["cursor"]=="next" and r["items"]==[{"id":1}]
    with pytest.raises(ValueError): poller.drain(3)

def test_service_health_and_auth(tmp_path):
    from http.server import ThreadingHTTPServer
    from ogce4.v6.storage import WorldStore
    class H(OGCEHandler): pass
    H.store=WorldStore(tmp_path/"w.db"); H.service_key="secret"
    server=ThreadingHTTPServer(("127.0.0.1",0),H)
    t=threading.Thread(target=server.serve_forever,daemon=True); t.start()
    try:
        url=f"http://127.0.0.1:{server.server_port}/healthz"
        assert json.loads(urllib.request.urlopen(url).read())["status"]=="ok"
        req=urllib.request.Request(f"http://127.0.0.1:{server.server_port}/world/x")
        with pytest.raises(urllib.error.HTTPError) as err: urllib.request.urlopen(req)
        assert err.value.code==401
        req=urllib.request.Request(f"http://127.0.0.1:{server.server_port}/world/x",headers={"Authorization":"Bearer secret"})
        with pytest.raises(urllib.error.HTTPError) as err: urllib.request.urlopen(req)
        assert err.value.code==404
    finally:
        server.shutdown(); server.server_close()

def test_api_stream_is_configurable():
    cfg=MalcolmConfig(token="x",stream_path="/feed")
    assert cfg.stream_path=="/feed"
