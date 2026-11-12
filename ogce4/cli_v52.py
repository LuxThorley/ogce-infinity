"""OGCE v5.2 planetary and living-world tools."""
import argparse,json
from pathlib import Path
def main():
 p=argparse.ArgumentParser(prog="ogce52",description="OGCE v5.2 Omniversal Reality Simulation"); s=p.add_subparsers(dest="cmd",required=True)
 g=s.add_parser("generate-planet"); g.add_argument("--name",default="Sovereign Planet"); g.add_argument("--seed",type=int,default=52); g.add_argument("--rings",type=int,default=48); g.add_argument("--sectors",type=int,default=96); g.add_argument("--out",required=True)
 r=s.add_parser("preview-planet"); r.add_argument("--name",default="Sovereign Planet"); r.add_argument("--seed",type=int,default=52)
 w=s.add_parser("stream-update"); w.add_argument("--x",type=float,default=0); w.add_argument("--z",type=float,default=0)
 e=s.add_parser("simulate-ecosystem"); e.add_argument("--ticks",type=int,default=20); e.add_argument("--seed",type=int,default=52)
 x=p.parse_args()
 if x.cmd=="generate-planet":
  from ogce4.v52.planet import generate_planet
  data=generate_planet(x.name,x.seed,x.rings,x.sectors); Path(x.out).write_text(json.dumps(data)+"\\n"); print(f"Generated {x.name}: {x.rings}x{x.sectors} -> {x.out}")
 elif x.cmd=="preview-planet":
  from ogce4.v52.renderer_planet import preview_planet
  preview_planet(x.name,x.seed)
 elif x.cmd=="stream-update":
  from ogce4.v52.streaming import WorldStreamer
  print(json.dumps(WorldStreamer().update(x.x,x.z),indent=2))
 elif x.cmd=="simulate-ecosystem":
  from ogce4.v52.ecosystem import create_ecosystem,step_ecosystem
  state=create_ecosystem(x.seed)
  for _ in range(x.ticks): state=step_ecosystem(state)
  print(json.dumps(state,indent=2))
if __name__=="__main__": main()
