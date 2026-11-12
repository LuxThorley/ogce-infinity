"""Asset build manifest and reproducible SHA-256 inventory."""
from pathlib import Path
import hashlib,json
ALLOWED={".gltf",".glb",".png",".jpg",".jpeg",".wav",".ogg",".obj",".mtl",".json"}
def build_manifest(root,out=None):
    root=Path(root).resolve(); records=[]
    for p in sorted(root.rglob("*")):
        if not p.is_file() or ".git" in p.parts or "__pycache__" in p.parts: continue
        if p.suffix.lower() not in ALLOWED: continue
        records.append({"path":p.relative_to(root).as_posix(),"size":p.stat().st_size,"sha256":hashlib.sha256(p.read_bytes()).hexdigest(),"extension":p.suffix.lower()})
    result={"schema":"ogce.asset-manifest.v1","assets":records}
    if out: Path(out).write_text(json.dumps(result,indent=2)+"\\n")
    return result
