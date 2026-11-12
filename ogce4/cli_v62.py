"""OGCE v6.2 agent society and multiplayer tools."""
import argparse,json
from .v62.agent_society import create_agent,society_turn
from .v62.room import WorldRoom
from .v62.vector_memory import LocalSemanticIndex
def main():
 p=argparse.ArgumentParser(prog="ogce62",description="OGCE v6.2 Agent Society & Multiplayer")
 s=p.add_subparsers(dest="cmd",required=True)
 a=s.add_parser("society-demo"); a.add_argument("--agents",type=int,default=5); a.add_argument("--turns",type=int,default=3)
 r=s.add_parser("room-demo"); r.add_argument("--world",default="aurelia"); r.add_argument("--players",type=int,default=2)
 m=s.add_parser("memory-demo"); m.add_argument("--query",default="ancient forest")
 x=p.parse_args()
 if x.cmd=="society-demo":
  if not 0<=x.agents<=10000 or not 0<=x.turns<=10000: p.error("agent/turn limits exceeded")
  agents=[create_agent(f"npc-{i}",f"NPC {i}") for i in range(x.agents)]
  history=[]
  for _ in range(x.turns): agents,events=society_turn(agents); history.extend(events)
  print(json.dumps({"agents":agents,"events":history[-100:]},indent=2))
 elif x.cmd=="room-demo":
  room=WorldRoom(x.world)
  for i in range(x.players): room.join(f"player-{i}",["world.read"])
  print(json.dumps(room.snapshot(),indent=2))
 elif x.cmd=="memory-demo":
  idx=LocalSemanticIndex(); idx.add("lore-1","The ancient forest surrounds the northern river"); idx.add("lore-2","A desert kingdom trades copper and salt")
  print(json.dumps(idx.search(x.query),indent=2))
if __name__=="__main__": main()
