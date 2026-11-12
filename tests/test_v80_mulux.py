import json, threading, urllib.request
from http.server import ThreadingHTTPServer
from ogce4.v80.mulux import LivingWorld, least_fixed_point, grade_claim, decide
from ogce4.v80.persistence import MuluxStore
from ogce4.v70.server import make_handler
from ogce4.v70.runtime import GameRuntime

def test_least_fixed_point_closes_monotone_horn_rules():
    r=least_fixed_point(["a","b","c"],[{"then":"b","if":["a"]},{"then":"c","if":["a","b"]}],["a"])
    assert r["closure"] == ["a","b","c"] and r["converged"] and r["steps"] == 3

def test_growth_governor_rejects_invalid_atoms_and_caps():
    try:
        least_fixed_point(["a"],[{"then":"z","if":[]}])
        assert False
    except ValueError as e:
        assert "invalid_rule_atom" in str(e)
    try:
        least_fixed_point(["a","b"],[],["a"],max_atoms=1)
        assert False
    except ValueError as e:
        assert "max_atoms" in str(e)

def test_policy_fails_closed_and_requires_owner_approval():
    assert decide("spend")["decision"] == "deny"
    assert decide("unlisted")["decision"] == "deny"
    assert decide("deploy")["decision"] == "needs_owner_yes"
    assert decide("deploy",owner_yes=True)["decision"] == "allow"
    assert decide("compute_local",policy_valid=False)["decision"] == "deny"

def test_evidence_grading_caps_claim_and_flags():
    a=grade_claim("The world is a miracle cure and will definitely happen",[], "FACT")
    assert a["grade"] == "OPEN CONJECTURE"
    assert "medical_advice" in a["flags"] and "future_prediction" in a["flags"]
    b=grade_claim("The simulation converged", [{"kind":"computation"}], "FACT")
    assert b["grade"] == "FACT"

def test_living_world_ledger_verifies_after_ticks_and_receipt():
    w=LivingWorld(seed=77)
    w.tick(24)
    assert w.verify_ledger()["valid"]
    receipt=w.export_receipt()
    assert len(receipt["sha256"]) == 64 and receipt["payload"]["tick"] == 24

def test_living_world_bounded_ticks():
    w=LivingWorld()
    try:
        w.tick(1441)
        assert False
    except ValueError as e:
        assert "out_of_bounds" in str(e)

def test_mulux_store_persists_and_resumes_full_snapshot(tmp_path):
    db=str(tmp_path/"v80.sqlite3")
    store=MuluxStore(db); w=LivingWorld(seed=19); w.tick(12); store.save("Aurelia",w)
    rec=store.load_record("Aurelia")
    resumed=LivingWorld.from_record(rec)
    assert resumed.tick_count == 12
    assert resumed.population == w.population
    assert resumed.food == w.food
    assert resumed.verify_ledger()["valid"]

def test_mulux_http_api_endpoints(tmp_path):
    runtime=GameRuntime(str(tmp_path/"api.sqlite3"))
    server=ThreadingHTTPServer(("127.0.0.1",0),make_handler(runtime,"",None,None))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    base=f"http://127.0.0.1:{server.server_port}"
    try:
        with urllib.request.urlopen(base+"/api/mulux/world/Aurelia") as r:
            data=json.loads(r.read())
        assert data["integrity"]["valid"]
        req=urllib.request.Request(base+"/api/mulux/world/Aurelia",data=json.dumps({"operation":"tick","count":12}).encode(),headers={"Content-Type":"application/json"},method="POST")
        with urllib.request.urlopen(req) as r: result=json.loads(r.read())
        assert result["snapshot"]["tick"] == 12 and result["integrity"]["valid"]
        req=urllib.request.Request(base+"/api/mulux/world/Aurelia",data=json.dumps({"operation":"grade","claim":"Computed simulation","grade":"FACT","evidence":[{"kind":"computation"}]}).encode(),headers={"Content-Type":"application/json"},method="POST")
        with urllib.request.urlopen(req) as r: graded=json.loads(r.read())
        assert graded["grade"] == "FACT"
    finally:
        server.shutdown();server.server_close();thread.join(timeout=2)
