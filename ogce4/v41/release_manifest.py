"""Reproducible SHA-256 release manifest; signing is delegated to release CI."""
import hashlib,json
from pathlib import Path
def build_manifest(directory):
    root=Path(directory).resolve(); items=[]
    for p in sorted(root.rglob("*")):
        if p.is_file() and p.name not in {"manifest.sha256.json"}:
            items.append({"path":p.relative_to(root).as_posix(),"sha256":hashlib.sha256(p.read_bytes()).hexdigest(),"bytes":p.stat().st_size})
    return {"schema":1,"algorithm":"sha256","files":items}
def verify_manifest(directory,manifest):
    root=Path(directory).resolve(); errors=[]
    for item in manifest.get("files",[]):
        p=(root/item["path"]).resolve()
        if not p.is_relative_to(root) or not p.is_file(): errors.append(item["path"]); continue
        if hashlib.sha256(p.read_bytes()).hexdigest()!=item["sha256"]: errors.append(item["path"])
    return {"valid":not errors,"errors":errors}
