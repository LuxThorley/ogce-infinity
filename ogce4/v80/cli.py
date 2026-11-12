from __future__ import annotations
import argparse, json
from .mulux import LivingWorld, least_fixed_point, grade_claim, decide
from .persistence import MuluxStore

def main():
    import sys
    if len(sys.argv) > 1 and sys.argv[1] in {"serve", "ws", "desktop"}:
        from ..v70.cli import main as server_main
        server_main()
        return
    p=argparse.ArgumentParser(prog="ogce80",description="OGCE Infinity v8.0")
    sub=p.add_subparsers(dest="cmd",required=True)
    sub.add_parser("mulux-demo")
    t=sub.add_parser("life-tick"); t.add_argument("--ticks",type=int,default=24); t.add_argument("--seed",type=int,default=144)
    g=sub.add_parser("genesis"); g.add_argument("--axiom",action="append",default=["a"]); g.add_argument("--rule",action="append",default=["b:a","c:a,b"])
    c=sub.add_parser("grade"); c.add_argument("claim"); c.add_argument("--evidence",action="append",default=[])
    a=sub.add_parser("policy"); a.add_argument("action"); a.add_argument("--owner-yes",action="store_true")
    args=p.parse_args()
    if args.cmd in ("mulux-demo","life-tick"):
        w=LivingWorld(seed=getattr(args,"seed",144)); result=w.tick(getattr(args,"ticks",24))
        print(json.dumps({"snapshot":result,"integrity":w.verify_ledger()},indent=2))
    elif args.cmd=="genesis":
        atoms=set(args.axiom)
        rules=[]
        for raw in args.rule:
            head,body=raw.split(":",1); parts=body.split(",") if body else []
            atoms.add(head); atoms.update(parts); rules.append({"then":head,"if":parts})
        print(json.dumps(least_fixed_point(atoms,rules,args.axiom),indent=2))
    elif args.cmd=="grade":
        ev=[{"kind":x} for x in args.evidence]
        print(json.dumps(grade_claim(args.claim,ev),indent=2))
    elif args.cmd=="policy": print(json.dumps(decide(args.action,owner_yes=args.owner_yes),indent=2))
if __name__=="__main__": main()
