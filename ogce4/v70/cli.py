import argparse, asyncio
from .server import serve, websocket_server
from .desktop import launch

def main():
 p=argparse.ArgumentParser(prog="ogce74"); sub=p.add_subparsers(dest="cmd",required=True)
 for name in ("serve","ws","desktop"):
  s=sub.add_parser(name); s.add_argument("--host",default="127.0.0.1"); s.add_argument("--port",type=int,default=8765 if name=="ws" else 8787); s.add_argument("--database",default="ogce_v70.sqlite3")
 a=p.parse_args()
 if a.cmd=="serve": serve(a.host,a.port,a.database)
 elif a.cmd=="desktop": launch(a.host,a.port,a.database)
 else: asyncio.run(websocket_server(a.host,a.port,a.database))
if __name__=="__main__": main()
