import argparse,json,sys
from pathlib import Path
def main():
    p=argparse.ArgumentParser(prog="ogce4");s=p.add_subparsers(dest="cmd",required=True)
    c=s.add_parser("create-project");c.add_argument("--name",required=True);c.add_argument("--out",required=True)
    e=s.add_parser("editor");e.add_argument("--project",required=True)
    r=s.add_parser("preview");r.add_argument("--project",required=True)
    a=s.add_parser("scan-assets");a.add_argument("--project",required=True)
    s.add_parser("doctor")
    x=p.parse_args()
    if x.cmd=="create-project":
        from ogce4.project import create_project;print(create_project(Path(x.out),x.name))
    elif x.cmd=="editor":
        from ogce4.editor import launch_editor;launch_editor(Path(x.project))
    elif x.cmd=="preview":
        from ogce4.renderer_panda import run_preview;run_preview(Path(x.project))
    elif x.cmd=="scan-assets":
        from ogce4.assets import scan_assets;print(json.dumps(scan_assets(Path(x.project)),indent=2))
    elif x.cmd=="doctor":
        try:import panda3d; renderer="installed"
        except ImportError:renderer="missing; install extra [render]"
        print(json.dumps({"version":"4.0.0","python":sys.version.split()[0],"renderer":renderer,"editor":"Tkinter"},indent=2))
if __name__=="__main__":main()
