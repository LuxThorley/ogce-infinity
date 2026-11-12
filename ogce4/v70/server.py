
"""HTTP JSON API and optional real WebSocket multiplayer transport."""
from __future__ import annotations
import asyncio, json, os, secrets, threading, mimetypes, time
from collections import defaultdict, deque
from urllib.parse import urlsplit, parse_qs
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from .runtime import GameRuntime
from .auth import AuthStore
from ..v80.mulux import LivingWorld, LifeAgent, least_fixed_point, grade_claim, decide
from ..v80.persistence import MuluxStore
from ..v82 import LivingWorld82, WorldError
from ..v82.persistence import WorldStore82

VERSION = "8.3.0"
WORLD_ID_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
}

def valid_world_id(wid):
    """v7.7 strict world identifier rule: 1-64 of [A-Za-z0-9_-]."""
    return bool(wid) and len(wid)<=64 and all(c in WORLD_ID_CHARS for c in wid)

class RateLimiter:
    """Small per-process sliding-window limiter (from v7.7); place a proxy/WAF in front for public scale."""
    def __init__(self, limit=12, window=60):
        self.limit=limit; self.window=window; self.hits=defaultdict(deque); self.lock=threading.Lock()
    def allow(self,key):
        now=time.time()
        with self.lock:
            if key not in self.hits and len(self.hits)>=10000:
                cutoff=now-self.window
                for stale in [k for k,v in self.hits.items() if not v or v[-1]<=cutoff]:
                    self.hits.pop(stale,None)
            q=self.hits[key]
            while q and q[0] <= now-self.window: q.popleft()
            if len(q)>=self.limit:return False
            q.append(now);return True

STATIC_TYPES={".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".webmanifest":"application/manifest+json",".svg":"image/svg+xml",".css":"text/css; charset=utf-8"}
def make_handler(runtime, token, web_root=None, auth=None):
    limiter = RateLimiter()
    mulux_store = MuluxStore(runtime.database)
    v82_store = WorldStore82(runtime.database)
    v82_worlds = {}
    mulux_worlds = {}
    mulux_lock = threading.RLock()
    def get_v82_world(world_id):
        with mulux_lock:
            if world_id not in v82_worlds:
                record=v82_store.load(world_id)
                v82_worlds[world_id]=LivingWorld82.from_record(record) if record else LivingWorld82(seed=sum(map(ord,world_id))+82)
            return v82_worlds[world_id]

    def get_mulux_world(world_id):
        with mulux_lock:
            if world_id not in mulux_worlds:
                record = mulux_store.load_record(world_id)
                world = (LivingWorld.from_record(record) if record else
                         LivingWorld(seed=sum(map(ord, world_id))))
                mulux_worlds[world_id] = world
            return mulux_worlds[world_id]

    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def _send(self, code, data):
            raw=json.dumps(data).encode()
            self.send_response(code); self.send_header("Content-Type","application/json")
            self.send_header("Content-Length",str(len(raw))); self.send_header("Cache-Control","no-store")
            for k,v in SECURITY_HEADERS.items(): self.send_header(k,v)
            self.end_headers(); self.wfile.write(raw)
        def do_GET(self):
            if self.path=="/health": return self._send(200,{"status":"ok","engine":"OGCE","version":VERSION,"accounts_required":bool(token)})
            if self.path=="/ready":
                try:
                    with runtime._db() as db: db.execute("SELECT 1").fetchone()
                    return self._send(200,{"status":"ready"})
                except Exception: return self._send(503,{"status":"not_ready"})
            if self.path.startswith("/api/v82/world/"):
                auth_header=self.headers.get("Authorization","")
                credential=auth_header[7:] if auth_header.startswith("Bearer ") else ""
                account=auth.validate(credential) if auth else None
                service_ok=bool(token and secrets.compare_digest(auth_header,"Bearer "+token))
                if token and not account and not service_ok: return self._send(401,{"error":"unauthorized"})
                wid=self.path.split("/api/v82/world/",1)[1].split("?",1)[0]
                if not wid or len(wid)>64: return self._send(400,{"error":"invalid_world"})
                return self._send(200,get_v82_world(wid).snapshot())
            if self.path.startswith("/api/mulux/world/"):
                wid=self.path.split("/api/mulux/world/",1)[1].split("?",1)[0]
                if not wid or len(wid)>64: return self._send(400,{"error":"invalid_world"})
                world=get_mulux_world(wid)
                return self._send(200,{"snapshot":world.snapshot(),"integrity":world.verify_ledger(),
                                       "grades":["FACT","INFERENCE","SPECULATION","BELIEF","SSR INTERPRETATION","OPEN CONJECTURE"]})
            if self.path.startswith("/api/world/"):
                wid=self.path.split("/api/world/",1)[1].split("?",1)[0]
                if not valid_world_id(wid): return self._send(400,{"error":"invalid_world"})
                return self._send(200,runtime.load(wid))
            if web_root:
                path_only=urlsplit(self.path).path
                rel="index.html" if path_only=="/" else path_only.lstrip("/")
                candidate=(Path(web_root)/rel).resolve()
                base=Path(web_root).resolve()
                if candidate==base or base in candidate.parents:
                    if candidate.is_file():
                        raw=candidate.read_bytes(); self.send_response(200)
                        self.send_header("Content-Type",STATIC_TYPES.get(candidate.suffix) or mimetypes.guess_type(str(candidate))[0] or "application/octet-stream")
                        self.send_header("Content-Length",str(len(raw)))
                        self.send_header("Cache-Control","no-cache" if candidate.name in {"index.html","sw.js"} else "public, max-age=3600")
                        for k,v in SECURITY_HEADERS.items(): self.send_header(k,v)
                        self.end_headers(); self.wfile.write(raw); return
            return self._send(404,{"error":"not_found"})
        def do_POST(self):
            if self.path.startswith("/api/v82/world/"):
                auth_header=self.headers.get("Authorization","")
                credential=auth_header[7:] if auth_header.startswith("Bearer ") else ""
                account=auth.validate(credential) if auth else None
                service_ok=bool(token and secrets.compare_digest(auth_header,"Bearer "+token))
                if token and not account and not service_ok: return self._send(401,{"error":"unauthorized"})
                wid=self.path.split("/api/v82/world/",1)[1].split("/",1)[0]
                if not wid or len(wid)>64: return self._send(400,{"error":"invalid_world"})
                try:
                    length=int(self.headers.get("Content-Length","0"))
                    if length<1 or length>16384: raise ValueError("invalid_body_size")
                    body=json.loads(self.rfile.read(length)); world=get_v82_world(wid)
                    op=body.get("operation"); cid=str(body.get("character_id",""))
                    if op=="character":
                        result=world.create_character(cid,body.get("name","Wanderer"),body.get("birth_cycle",0),body.get("path","hybrid"))
                        world.characters[cid]["owner"]=account or "guest"
                        result=world.character(cid)
                    elif op!="tick":
                        character=world.character(cid)
                        if account and character.get("owner")!=account:
                            return self._send(403,{"error":"character_not_owned_by_account"})
                    if op=="character": pass  # result already set above; fall through to save
                    elif op=="cast": result=world.cast(cid,str(body.get("spell","")),body.get("target"))
                    elif op=="learn_spell": result=world.learn_spell(cid,str(body.get("spell","")))
                    elif op=="reading": result=world.celestial_reading(cid)
                    elif op=="hypothesis": result=world.submit_hypothesis(cid,body.get("title","Untitled inquiry"),body.get("discipline","physics"),body.get("hypothesis",""),body.get("method","controlled comparison"))
                    elif op=="experiment": result=world.experiment(cid,str(body.get("research_id","")),body.get("observation",""),bool(body.get("repeat",False)))
                    elif op=="invent": result=world.invent(cid,str(body.get("technology","")))
                    elif op=="train": result=world.train(cid,str(body.get("discipline","")),body.get("amount",1))
                    elif op=="tick": result=world.tick(body.get("count",1))
                    else: return self._send(400,{"error":"unknown_v82_operation"})
                    v82_store.save(wid,world)
                    return self._send(200,{"result":result,"world":world.snapshot()})
                except (ValueError,TypeError,KeyError,WorldError,json.JSONDecodeError) as e:
                    return self._send(400,{"error":str(e)})
            if self.path.startswith("/api/mulux/world/"):
                wid=self.path.split("/api/mulux/world/",1)[1].split("/",1)[0]
                if not wid or len(wid)>64: return self._send(400,{"error":"invalid_world"})
                try:
                    length=int(self.headers.get("Content-Length","0"))
                    if length<1 or length>16384: raise ValueError("invalid_body_size")
                    body=json.loads(self.rfile.read(length))
                    world=get_mulux_world(wid)
                    operation=body.get("operation")
                    if operation=="tick":
                        result=world.tick(int(body.get("count",1)))
                        mulux_store.save(wid,world)
                        return self._send(200,{"snapshot":result,"integrity":world.verify_ledger()})
                    if operation=="receipt":
                        receipt=world.export_receipt();mulux_store.save_receipt(wid,receipt)
                        return self._send(200,{"receipt":receipt})
                    if operation=="policy":
                        return self._send(200,decide(str(body.get("action","")),owner_yes=bool(body.get("owner_yes",False))))
                    if operation=="grade":
                        return self._send(200,grade_claim(str(body.get("claim","")),body.get("evidence",[]),str(body.get("grade","OPEN CONJECTURE"))))
                    if operation=="genesis":
                        return self._send(200,least_fixed_point(body.get("atoms",[]),body.get("rules",[]),body.get("axioms",[])))
                    return self._send(400,{"error":"unknown_mulux_operation"})
                except (ValueError,TypeError,json.JSONDecodeError) as e:
                    return self._send(400,{"error":str(e)})
            if self.path=="/api/auth/ws-ticket":
                header=self.headers.get("Authorization","")
                account=auth.validate(header[7:] if header.startswith("Bearer ") else "") if auth else None
                if not account: return self._send(401,{"error":"valid_account_session_required"})
                try: return self._send(200,auth.issue_ws_ticket(header[7:]))
                except (ValueError,TypeError) as e: return self._send(401,{"error":str(e)})
            if self.path in {"/api/auth/register","/api/auth/login"}:
                if not limiter.allow(("auth",self.client_address[0])): return self._send(429,{"error":"rate_limited_try_again_later"})
                try:
                    length=int(self.headers.get("Content-Length","0"))
                    if length<1 or length>4096: raise ValueError("invalid_body_size")
                    body=json.loads(self.rfile.read(length))
                    result=auth.register(body.get("username"),body.get("password")) if self.path.endswith("register") else auth.login(body.get("username"),body.get("password"))
                    return self._send(200,result)
                except (ValueError,TypeError,json.JSONDecodeError) as e: return self._send(400,{"error":str(e)})
            if not self.path.startswith("/api/world/") or not self.path.endswith("/action"):
                return self._send(404,{"error":"not_found"})
            wid=self.path[len("/api/world/"):-len("/action")].strip("/")
            if not valid_world_id(wid): return self._send(400,{"error":"invalid_world"})
            try:
                auth_header=self.headers.get("Authorization","")
                credential=auth_header[7:] if auth_header.startswith("Bearer ") else ""
                account=auth.validate(credential) if auth else None
                service_ok=bool(token and secrets.compare_digest(auth_header,"Bearer "+token))
                if not account and not service_ok and token: return self._send(401,{"error":"unauthorized"})
                length=int(self.headers.get("Content-Length","0"))
                if length<1 or length>16384: raise ValueError("invalid_body_size")
                body=json.loads(self.rfile.read(length))
                player_id=account or str(body.get("player_id",""))[:80]
                if account and body.get("player_id") not in (None,"",account): return self._send(403,{"error":"player_identity_mismatch"})
                result=runtime.act(wid,player_id,body.get("action"))
                return self._send(200,result)
            except (ValueError,TypeError,json.JSONDecodeError) as e:
                return self._send(400,{"error":str(e)})
    return Handler

def serve(host="127.0.0.1",port=8787,database="ogce_v70.sqlite3"):
    token=os.environ.get("OGCE_SERVICE_TOKEN","")
    if host not in {"127.0.0.1","localhost","::1"} and len(token)<32:
        raise RuntimeError("Remote binding requires OGCE_SERVICE_TOKEN with at least 32 characters and production TLS/reverse-proxy configuration.")
    runtime=GameRuntime(database); auth=AuthStore(database)
    web_root=Path(__file__).resolve().parents[2]/"web"
    server=ThreadingHTTPServer((host,port),make_handler(runtime,token,web_root,auth))
    print(f"OGCE v{VERSION} API listening at http://{host}:{port}")
    server.serve_forever()

async def websocket_server(host="127.0.0.1",port=8765,database="ogce_v70.sqlite3"):
    try: import websockets
    except ImportError as e: raise RuntimeError("Install optional dependency: pip install 'websockets>=12,<16'") from e
    runtime=GameRuntime(database); rooms={}
    token=os.environ.get("OGCE_SERVICE_TOKEN",""); auth=AuthStore(database)
    if host not in {"127.0.0.1","localhost","::1"} and len(token)<32:
        raise RuntimeError("Remote WebSocket binding requires OGCE_SERVICE_TOKEN with at least 32 characters and production WSS/TLS configuration.")
    async def handler(ws):
        # v7.7: the browser exchanges its session for a one-time, 60-second ticket (POST /api/auth/ws-ticket);
        # the raw session token is never placed in the WebSocket URL.
        ticket=(parse_qs(urlsplit(ws.request.path).query).get("ticket") or [""])[0]
        account=auth.consume_ws_ticket(ticket)
        header_ok=bool(token and secrets.compare_digest(ws.request.headers.get("Authorization",""),"Bearer "+token))
        if not account and not header_ok and token:
            await ws.close(code=4401,reason="one_time_ticket_required"); return
        room=None; player=None
        try:
            async for raw in ws:
                if len(raw.encode())>16384: await ws.close(code=4409,reason="message too large"); return
                msg=json.loads(raw); typ=msg.get("type")
                if typ=="join":
                    room=str(msg.get("world","Aurelia"))[:64]
                    if not valid_world_id(room): await ws.close(code=4400,reason="invalid_world"); return
                    player=account or str(msg.get("player_id",""))[:80]
                    if not player: await ws.close(code=4400,reason="player_id required"); return
                    if account and msg.get("player_id") not in (None,"",account): await ws.close(code=4403,reason="identity mismatch"); return
                    rooms.setdefault(room,set()).add(ws)
                    await ws.send(json.dumps({"type":"snapshot",**runtime.load(room)}))
                elif typ=="action" and room and player:
                    result=runtime.act(room,player,msg.get("action"))
                    payload=json.dumps({"type":"update","player_id":player,**result})
                    for peer in list(rooms.get(room,set())):
                        try: await peer.send(payload)
                        except Exception: rooms[room].discard(peer)
                else: await ws.send(json.dumps({"type":"error","error":"join_required_or_unknown_message"}))
        except Exception: pass
        finally:
            if room in rooms: rooms[room].discard(ws)
    allowed_origins=[v.strip() for v in os.environ.get("OGCE_ALLOWED_ORIGINS","").split(",") if v.strip()]
    async with websockets.serve(handler,host,port,max_size=16384,ping_interval=20,ping_timeout=20,origins=allowed_origins or None):
        print(f"OGCE v7.4 WebSocket listening at ws://{host}:{port}")
        await asyncio.Future()
