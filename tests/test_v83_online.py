"""v8.3: v7.7 online hardening carried into the v8.x server (ported from v7.7 tests/test_v77_online.py)."""
import json, threading, urllib.request, urllib.error
from http.server import ThreadingHTTPServer
from ogce4.v70.auth import AuthStore
from ogce4.v70.runtime import GameRuntime
from ogce4.v70.server import RateLimiter, make_handler, valid_world_id

def _serve(tmp_path):
    db=str(tmp_path/"world.sqlite3"); runtime=GameRuntime(db); auth=AuthStore(db)
    server=ThreadingHTTPServer(("127.0.0.1",0),make_handler(runtime,"",None,auth))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    return server, auth, f"http://127.0.0.1:{server.server_port}"

def _post(url, body=None, headers=None):
    req=urllib.request.Request(url,data=json.dumps(body or {}).encode(),headers={"Content-Type":"application/json",**(headers or {})},method="POST")
    with urllib.request.urlopen(req) as r: return json.loads(r.read())

def test_websocket_ticket_is_one_time(tmp_path):
    auth=AuthStore(tmp_path/"auth.sqlite3")
    result=auth.register("onlinehero","a-long-password-123")
    ticket=auth.issue_ws_ticket(result["token"])["ticket"]
    assert auth.consume_ws_ticket(ticket)=="onlinehero"
    assert auth.consume_ws_ticket(ticket) is None

def test_rate_limiter_enforces_window():
    limiter=RateLimiter(limit=2,window=60)
    assert limiter.allow("client") and limiter.allow("client") and not limiter.allow("client")

def test_world_id_rule():
    assert valid_world_id("Aurelia") and valid_world_id("AURELIA_2-x")
    assert not valid_world_id("") and not valid_world_id("../secret") and not valid_world_id("a"*65) and not valid_world_id("wörld")

def test_health_ready_ticket_and_headers(tmp_path):
    server, auth, base = _serve(tmp_path)
    try:
        with urllib.request.urlopen(base+"/health") as r:
            health=json.loads(r.read())
            assert health["version"]=="8.3.0" and "accounts_required" in health
            assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]
        with urllib.request.urlopen(base+"/ready") as r: assert json.loads(r.read())=={"status":"ready"}
        account=_post(base+"/api/auth/register",{"username":"onlinehero","password":"a-long-password-123"})
        ticket=_post(base+"/api/auth/ws-ticket",{},{"Authorization":"Bearer "+account["token"]})
        assert ticket["expires_in"]==60 and auth.consume_ws_ticket(ticket["ticket"])=="onlinehero"
        try: _post(base+"/api/auth/ws-ticket",{},{}); assert False
        except urllib.error.HTTPError as e: assert e.code==401
        try: urllib.request.urlopen(base+"/api/world/bad%20id"); assert False
        except urllib.error.HTTPError as e: assert e.code==400
    finally:
        server.shutdown(); server.server_close()

def test_auth_rate_limit_returns_429(tmp_path):
    server, auth, base = _serve(tmp_path)
    try:
        codes=[]
        for i in range(14):
            try: _post(base+"/api/auth/login",{"username":"nobody","password":"x"*12})
            except urllib.error.HTTPError as e: codes.append(e.code)
        assert codes[:12]==[400]*12 and codes[12:]==[429,429]
    finally:
        server.shutdown(); server.server_close()
