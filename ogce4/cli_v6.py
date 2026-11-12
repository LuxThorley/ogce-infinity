"""OGCE v6.0 operations CLI."""
import argparse, json, os
from .v6.storage import WorldStore
from .v6.malcolm_api import MalcolmOmniAPI, MalcolmAPIError
def main():
    p=argparse.ArgumentParser(prog="ogce6",description="OGCE v6.0 Persistent Sovereign Universe")
    s=p.add_subparsers(dest="cmd",required=True)
    h=s.add_parser("malcolm-health")
    c=s.add_parser("malcolm-command"); c.add_argument("instruction"); c.add_argument("--approved",action="store_true")
    sv=s.add_parser("save-world"); sv.add_argument("--db",default="ogce_worlds.sqlite3"); sv.add_argument("--id",required=True); sv.add_argument("--json",required=True)
    ld=s.add_parser("load-world"); ld.add_argument("--db",default="ogce_worlds.sqlite3"); ld.add_argument("--id",required=True)
    a=p.parse_args()
    if a.cmd in ("malcolm-health","malcolm-command"):
        api=MalcolmOmniAPI()
        try:
            result=api.health() if a.cmd=="malcolm-health" else api.command(a.instruction,approved=a.approved)
            print(json.dumps(result,indent=2,default=str))
        except MalcolmAPIError as e: p.exit(2,f"Malcolm API error: {e}\n")
    elif a.cmd=="save-world":
        state=json.load(open(a.json,encoding="utf-8"))
        print(json.dumps(WorldStore(a.db).save(a.id,state),indent=2))
    elif a.cmd=="load-world":
        result=WorldStore(a.db).load(a.id)
        if result is None: p.exit(1,"World not found\n")
        print(json.dumps(result,indent=2))
if __name__=="__main__": main()
