import argparse,json
from pathlib import Path
def main():
    p=argparse.ArgumentParser(prog="ogce5",description="OGCE Infinity v5.0 Sovereign Genesis")
    s=p.add_subparsers(dest="cmd",required=True)
    s.add_parser("cra-audit",help="Run the finite CRA reference-model audit")
    s.add_parser("matrix-status",help="Show honest local OmniGenesis module status")
    m=s.add_parser("matrix-engage");m.add_argument("module",choices=["all","uane","qesc","ikcl","orfs","uemh","tosao","iaav","asac","saic","erlm"])
    m.add_argument("--off",action="store_true")
    snap=s.add_parser("matrix-snapshot");snap.add_argument("--out",required=True)
    x=p.parse_args()
    if x.cmd=="cra-audit":
        from ogce4.v5.audit import run_audit
        print(json.dumps(run_audit(),indent=2))
    elif x.cmd.startswith("matrix-"):
        from ogce4.v5.omnigenesis import SovereignMatrix
        matrix=SovereignMatrix()
        if x.cmd=="matrix-engage":
            result=matrix.engage_all(not x.off) if x.module=="all" else matrix.engage(x.module,not x.off)
        elif x.cmd=="matrix-snapshot": result=matrix.snapshot(x.out)
        else: result=matrix.status()
        print(json.dumps(result,indent=2))
if __name__=="__main__": main()
