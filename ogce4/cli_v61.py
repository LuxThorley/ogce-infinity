"""OGCE v6.1 command-line operations."""
import argparse,json,os
from .v6.memory import AgentMemory
from .v6.service import serve
from .v6.malcolm_api import MalcolmOmniAPI,MalcolmAPIError
def main():
 p=argparse.ArgumentParser(prog="ogce61",description="OGCE v6.1 Live Intelligence & Autonomous Operations")
 s=p.add_subparsers(dest="cmd",required=True)
 s.add_parser("serve")
 m=s.add_parser("memory-add"); m.add_argument("--db",default="ogce_memory.sqlite3"); m.add_argument("--agent",required=True); m.add_argument("--world",required=True); m.add_argument("--content",required=True); m.add_argument("--kind",default="observation"); m.add_argument("--importance",type=float,default=.5)
 q=s.add_parser("memory-search"); q.add_argument("--db",default="ogce_memory.sqlite3"); q.add_argument("--agent",required=True); q.add_argument("--world",required=True); q.add_argument("--query",required=True)
 s.add_parser("malcolm-feed")
 a=p.parse_args()
 if a.cmd=="serve": serve()
 elif a.cmd=="memory-add":
  mid=AgentMemory(a.db).add(a.agent,a.world,a.content,a.kind,importance=a.importance); print(json.dumps({"memory_id":mid}))
 elif a.cmd=="memory-search":
  print(json.dumps(AgentMemory(a.db).search(a.agent,a.world,a.query),indent=2))
 elif a.cmd=="malcolm-feed":
  try: print(json.dumps(MalcolmOmniAPI().stream(),indent=2))
  except MalcolmAPIError as e: p.exit(2,f"Malcolm API error: {e}\n")
if __name__=="__main__": main()
