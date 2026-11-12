from __future__ import annotations
from pathlib import Path
import hashlib, json, zipfile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def main() -> None:
    DIST.mkdir(exist_ok=True)
    out = DIST / "ogce_v3_1_release.zip"
    if out.exists():
        out.unlink()
    include = ["ogce_v31","docs","sample_project","tools","README.md","requirements.txt","pyproject.toml","VERSION","LICENSE.txt",".gitignore"]
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for item in include:
            src = ROOT / item
            if src.is_dir():
                for p in src.rglob("*"):
                    if p.is_file():
                        zf.write(p, p.relative_to(ROOT))
            elif src.is_file():
                zf.write(src, src.relative_to(ROOT))
    manifest = DIST / "manifest.json"
    manifest.write_text(json.dumps({"version":"3.1.0","package":out.name,"sha256":sha256(out)}, indent=2), encoding="utf-8")
    print(out)
    print(manifest)

if __name__ == "__main__":
    main()
