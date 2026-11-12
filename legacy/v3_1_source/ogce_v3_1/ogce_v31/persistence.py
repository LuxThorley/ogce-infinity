from __future__ import annotations
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    map_name TEXT NOT NULL,
    status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
    player_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
    report_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS updates (
    update_id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    channel TEXT NOT NULL
);
"""

class Persistence:
    def __init__(self, path: Path) -> None:
        self.path = path

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path)
        try:
            conn.executescript(SCHEMA)
            conn.commit()
        finally:
            conn.close()

    def execute(self, sql: str, params: tuple = ()) -> None:
        conn = sqlite3.connect(self.path)
        try:
            conn.execute(sql, params)
            conn.commit()
        finally:
            conn.close()
