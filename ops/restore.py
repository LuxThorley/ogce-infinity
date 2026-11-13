#!/usr/bin/env python3
"""Restore a verified SQLite backup. Stop all OGCE services first."""
import argparse, pathlib, sqlite3, shutil, time
def main():
    p=argparse.ArgumentParser();p.add_argument("backup");p.add_argument("database");a=p.parse_args()
    src=pathlib.Path(a.backup);dst=pathlib.Path(a.database)
    if not src.is_file():raise SystemExit("Backup file does not exist")
    with sqlite3.connect(f"file:{src.resolve()}?mode=ro",uri=True) as db:
        result=db.execute("PRAGMA integrity_check").fetchone()[0]
        if result!="ok":raise SystemExit(f"Backup failed integrity check: {result}")
        tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not {"worlds","accounts","sessions"}<=tables:raise SystemExit("Backup is not a valid OGCE database")
    if dst.exists():shutil.copy2(dst,dst.with_name(dst.name+f".pre-restore-{int(time.time())}"))
    tmp=dst.with_suffix(dst.suffix+".restore")
    shutil.copy2(src,tmp)
    with sqlite3.connect(tmp) as db:
        if db.execute("PRAGMA integrity_check").fetchone()[0]!="ok":tmp.unlink(missing_ok=True);raise SystemExit("Restored copy failed integrity check")
    tmp.replace(dst);print(f"Restored {src} -> {dst}")
if __name__=="__main__":main()
