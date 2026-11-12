from __future__ import annotations
import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ZIP_PATH = ROOT / "dist" / "ogce_v3_1_release.zip"
OUT_PATH = ROOT / "dist" / "ogce_v3_1_self_extract.py"

TEMPLATE = """from __future__ import annotations
import argparse, base64, zipfile
from pathlib import Path

PAYLOAD = {payload}

def main() -> None:
    parser = argparse.ArgumentParser(description="OGCE v3.1 self extracting release")
    parser.add_argument("--extract-dir", default="./ogce_v3_1_extracted")
    args = parser.parse_args()
    target = Path(args.extract_dir)
    target.mkdir(parents=True, exist_ok=True)
    zip_path = target / "ogce_v3_1_release.zip"
    zip_path.write_bytes(base64.b64decode(PAYLOAD.encode("ascii")))
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(target)
    print("Extracted to:", target)

if __name__ == "__main__":
    main()
"""

def main() -> None:
    payload = repr(base64.b64encode(ZIP_PATH.read_bytes()).decode("ascii"))
    OUT_PATH.write_text(TEMPLATE.format(payload=payload), encoding="utf-8")
    print(OUT_PATH)

if __name__ == "__main__":
    main()
