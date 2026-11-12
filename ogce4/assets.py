import hashlib,json
from pathlib import Path
def scan_assets(project:Path):
    items=[]
    for f in sorted((project/"assets").rglob("*")):
        if f.is_file(): items.append({"path":str(f.relative_to(project)),"bytes":f.stat().st_size,"sha256":hashlib.sha256(f.read_bytes()).hexdigest()})
    (project/".ogce/asset_manifest.json").write_text(json.dumps(items,indent=2))
    return items
