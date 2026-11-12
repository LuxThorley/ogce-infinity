"""Loopback-first stdlib HTTP service exposing health and controlled world operations."""
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import json, os, hmac
class OGCEHandler(BaseHTTPRequestHandler):
    store=None; api=None; service_key=""
    def _json(self,status,payload):
        data=json.dumps(payload,default=str).encode()
        self.send_response(status); self.send_header("Content-Type","application/json"); self.send_header("Content-Length",str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        if self.path=="/healthz": return self._json(200,{"service":"ogce-v6.1","status":"ok"})
        if self.path.startswith("/world/"):
            if not self._authorized(): return self._json(401,{"error":"unauthorized"})
            wid=self.path.split("/",2)[-1]
            result=self.store.load(wid) if self.store else None
            return self._json(200 if result else 404,result or {"error":"not_found"})
        return self._json(404,{"error":"not_found"})
    def do_POST(self):
        if not self._authorized(): return self._json(401,{"error":"unauthorized"})
        if self.path!="/world/save": return self._json(404,{"error":"not_found"})
        try:
            size=int(self.headers.get("Content-Length","0"))
            if not 1<=size<=1_000_000: return self._json(413,{"error":"invalid_body_size"})
            payload=json.loads(self.rfile.read(size))
            result=self.store.save(payload["world_id"],payload["state"],payload.get("expected_revision"))
            return self._json(200,result)
        except Exception as exc: return self._json(400,{"error":type(exc).__name__})
    def _authorized(self):
        supplied=self.headers.get("Authorization","")
        return bool(self.service_key) and hmac.compare_digest(supplied,"Bearer "+self.service_key)
    def log_message(self,fmt,*args):
        # Avoid accidental logging of authorization headers or request bodies.
        super().log_message(fmt,*args)
def serve(host=None,port=None,db_path=None,service_key=None):
    host=host or os.getenv("OGCE_BIND_HOST","127.0.0.1")
    port=int(port or os.getenv("OGCE_PORT","8765"))
    if host not in ("127.0.0.1","::1","localhost") and os.getenv("OGCE_ALLOW_REMOTE","").lower()!="true":
        raise ValueError("remote binding disabled; set OGCE_ALLOW_REMOTE=true only behind a secured deployment")
    key=service_key or os.getenv("OGCE_SERVICE_TOKEN","")
    if not key: raise ValueError("OGCE_SERVICE_TOKEN must be configured")
    from .v6.storage import WorldStore
    OGCEHandler.store=WorldStore(db_path or os.getenv("OGCE_DB_PATH","ogce_worlds.sqlite3")); OGCEHandler.service_key=key
    server=ThreadingHTTPServer((host,port),OGCEHandler)
    server.serve_forever()
