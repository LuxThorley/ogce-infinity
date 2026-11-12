"""OGCE v5.1 runtime CLI."""
import argparse,json
from pathlib import Path
def main():
 p=argparse.ArgumentParser(prog="ogce51",description="OGCE Infinity v5.1 Sovereign Living Worlds"); s=p.add_subparsers(dest="cmd",required=True)
 w=s.add_parser("generate-world"); w.add_argument("--name",default="Sovereign World"); w.add_argument("--seed",type=int,default=144); w.add_argument("--width",type=int,default=48); w.add_argument("--height",type=int,default=48); w.add_argument("--out",required=True)
 r=s.add_parser("serve-worlds"); r.add_argument("--host",default="127.0.0.1"); r.add_argument("--port",type=int,default=8765); r.add_argument("--db",default="ogce-universe.sqlite3")
 pvw=s.add_parser("preview-world"); pvw.add_argument("--name",default="Sovereign World"); pvw.add_argument("--seed",type=int,default=144)
 db=s.add_parser("init-world-db"); db.add_argument("--db",default="ogce-universe.sqlite3"); db.add_argument("--id",default="genesis"); db.add_argument("--name",default="Genesis World")
 x=p.parse_args()
 if x.cmd=="generate-world":
  from ogce4.v5.worldgen import generate_world
  data=generate_world(x.name,x.seed,x.width,x.height); Path(x.out).write_text(json.dumps(data)+"\\n"); print(f"Generated {x.name}: {x.width}x{x.height} -> {x.out}")
 elif x.cmd=="serve-worlds":
  from ogce4.v51.universe_server import serve
  serve(x.host,x.port,x.db)
 elif x.cmd=="preview-world":
  from ogce4.v51.renderer_world import run_world_preview
  run_world_preview(x.name,x.seed)
 elif x.cmd=="init-world-db":
  from ogce4.v51.world_runtime import WorldRuntime
  from ogce4.v5.worldgen import generate_world
  db=WorldRuntime(x.db); db.create(x.id,generate_world(x.name)); print(json.dumps(db.load(x.id),indent=2))
if __name__=="__main__": main()
