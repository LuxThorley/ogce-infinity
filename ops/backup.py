#!/usr/bin/env python3
"""Consistent SQLite online backup using SQLite's backup API."""
import argparse, datetime, pathlib, sqlite3, sys
def main():
    p=argparse.ArgumentParser();p.add_argument("database");p.add_argument("destination",nargs="?",default="backups");a=p.parse_args()
    source=pathlib.Path(a.database);dest=pathlib.Path(a.destination);dest.mkdir(parents=True,exist_ok=True)
    if not source.exists():raise SystemExit(f"Database not found: {source}")
    name=f"ogce-{datetime.datetime.now(datetime.timezone.utc):%Y%m%dT%H%M%SZ}.sqlite3"
    target=dest/name
    with sqlite3.connect(f"file:{source.resolve()}?mode=ro",uri=True) as src,sqlite3.connect(target) as dst:
        src.backup(dst)
        check=dst.execute("PRAGMA integrity_check").fetchone()[0]
        if check!="ok":target.unlink(missing_ok=True);raise SystemExit(f"Backup integrity check failed: {check}")
    print(target.resolve())
if __name__=="__main__":main()
