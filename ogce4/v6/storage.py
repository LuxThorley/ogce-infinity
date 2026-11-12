"""Transactional SQLite persistence for world snapshots and event history."""
import json, sqlite3, time
from pathlib import Path

class WorldStore:
    def __init__(self, path="ogce_worlds.sqlite3"):
        self.path = str(path)
        self._init()
    def _connect(self):
        c = sqlite3.connect(self.path, timeout=10)
        c.execute("PRAGMA foreign_keys=ON")
        c.execute("PRAGMA journal_mode=WAL")
        return c
    def _init(self):
        with self._connect() as c:
            c.executescript("""
            CREATE TABLE IF NOT EXISTS worlds(
              world_id TEXT PRIMARY KEY, revision INTEGER NOT NULL,
              state_json TEXT NOT NULL, updated_at REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS world_events(
              event_id TEXT PRIMARY KEY, world_id TEXT NOT NULL,
              revision INTEGER NOT NULL, event_json TEXT NOT NULL,
              created_at REAL NOT NULL,
              FOREIGN KEY(world_id) REFERENCES worlds(world_id));
            CREATE TABLE IF NOT EXISTS schema_migrations(
              version INTEGER PRIMARY KEY, applied_at REAL NOT NULL);
            INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, strftime('%s','now'));
            """)
    def save(self, world_id, state, expected_revision=None, event_id=None, event=None):
        if not world_id or len(world_id) > 120: raise ValueError("invalid world_id")
        payload = json.dumps(state, sort_keys=True, separators=(",", ":"), allow_nan=False)
        now = time.time()
        with self._connect() as c:
            row = c.execute("SELECT revision FROM worlds WHERE world_id=?", (world_id,)).fetchone()
            current = row[0] if row else 0
            if expected_revision is not None and expected_revision != current:
                raise RuntimeError(f"revision conflict: expected {expected_revision}, current {current}")
            newrev = current + 1
            c.execute("""INSERT INTO worlds(world_id,revision,state_json,updated_at) VALUES(?,?,?,?)
                ON CONFLICT(world_id) DO UPDATE SET revision=excluded.revision,
                state_json=excluded.state_json, updated_at=excluded.updated_at""",
                (world_id, newrev, payload, now))
            if event_id:
                if not event or len(event_id) > 160: raise ValueError("event_id and event required")
                c.execute("INSERT INTO world_events VALUES(?,?,?,?,?)",
                          (event_id, world_id, newrev, json.dumps(event, sort_keys=True), now))
        return {"world_id": world_id, "revision": newrev}
    def load(self, world_id):
        with self._connect() as c:
            row = c.execute("SELECT revision,state_json,updated_at FROM worlds WHERE world_id=?", (world_id,)).fetchone()
        if not row: return None
        return {"world_id": world_id, "revision": row[0], "state": json.loads(row[1]), "updated_at": row[2]}
    def history(self, world_id, limit=100):
        if not 1 <= limit <= 1000: raise ValueError("limit outside 1..1000")
        with self._connect() as c:
            rows = c.execute("SELECT event_id,revision,event_json,created_at FROM world_events WHERE world_id=? ORDER BY revision DESC LIMIT ?", (world_id,limit)).fetchall()
        return [{"event_id":r[0],"revision":r[1],"event":json.loads(r[2]),"created_at":r[3]} for r in rows]
