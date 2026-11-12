"""Optional desktop window for the shared OGCE browser client."""
from __future__ import annotations
import os, threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from .runtime import GameRuntime
from .auth import AuthStore
from .server import make_handler

def launch(host="127.0.0.1", port=8787, database="ogce_v70.sqlite3"):
    try:
        import webview
    except ImportError as exc:
        raise RuntimeError("Install desktop support with: pip install -e '.[desktop]'") from exc
    token=os.environ.get("OGCE_SERVICE_TOKEN","")
    runtime=GameRuntime(database); auth=AuthStore(database)
    web_root=Path(__file__).resolve().parents[2]/"web"
    server=ThreadingHTTPServer((host,port),make_handler(runtime,token,web_root,auth))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    webview.create_window("OGCE Infinity — Living Realms",f"http://{host}:{port}",width=1440,height=960,min_size=(900,640))
    try: webview.start()
    finally: server.shutdown()
