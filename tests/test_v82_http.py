"""Regression: v8.2 'character' operation must succeed over HTTP and persist."""
import json, threading
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from ogce4.v70.server import make_handler
from ogce4.v70.runtime import GameRuntime
from ogce4.v70.auth import AuthStore

def _post(base, path, body):
    req = Request(base + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(req, timeout=5) as r:
        return r.status, json.loads(r.read())

def test_v82_character_creation_over_http(tmp_path):
    db = tmp_path / "w.sqlite3"
    runtime = GameRuntime(db); auth = AuthStore(db)
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(runtime, "", None, auth))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        status, data = _post(base, "/api/v82/world/REALM", {"operation": "character", "character_id": "hero", "name": "Hero"})
        assert status == 200 and data["result"]["id"] == "hero"
        assert data["world"]["characters"][0]["owner"] == "guest"
        status, data = _post(base, "/api/v82/world/REALM", {"operation": "cast", "character_id": "hero", "spell": "verdant_mend"})
        assert status == 200 and data["result"]["character"]["mana"] == 50
    finally:
        server.shutdown()
