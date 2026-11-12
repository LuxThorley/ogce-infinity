"""Loopback-first JSON world API. Deploy behind TLS/auth gateway for remote use."""
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import json
from .world_runtime import WorldRuntime
class Handler(BaseHTTPRequestHandler):
    runtime=None
    def _send(self,code,obj):
        b=json.dumps(obj).encode(); self.send_response(code); self.send_header("Content-Type","application/json"); self.send_header("Content-Length",str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path.startswith("/health"): return self._send(200,{"status":"ok","service":"ogce-universe"})
        if self.path.startswith("/world/"):
            wid=self.path.split("/")[-1]
            try: return self._send(200,self.runtime.load(wid))
            except KeyError: return self._send(404,{"error":"world_not_found"})
        self._send(404,{"error":"not_found"})
    def do_POST(self):
        if self.path!="/world": return self._send(404,{"error":"not_found"})
        if int(self.headers.get("Content-Length","0"))>1_000_000: return self._send(413,{"error":"payload_too_large"})
        try:
            body=json.loads(self.rfile.read(int(self.headers.get("Content-Length","0"))))
            wid=body["id"]; self.runtime.create(wid,body["state"]); return self._send(201,{"id":wid})
        except Exception as e: return self._send(400,{"error":"invalid_request","detail":str(e)})
def serve(host="127.0.0.1",port=8765,db="ogce-universe.sqlite3"):
    Handler.runtime=WorldRuntime(db); server=ThreadingHTTPServer((host,port),Handler); server.serve_forever()
