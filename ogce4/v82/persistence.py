"""SQLite persistence adapter for v8.2 world aggregates; WAL and revision checks."""
import json, sqlite3, threading
class WorldStore82:
    def __init__(self, database):
        self.database=str(database); self.lock=threading.RLock()
        with sqlite3.connect(self.database) as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("""CREATE TABLE IF NOT EXISTS worlds_v82(
                world_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, record TEXT NOT NULL)""")
    def load(self, world_id):
        with self.lock, sqlite3.connect(self.database,timeout=10) as db:
            row=db.execute("SELECT record FROM worlds_v82 WHERE world_id=?",(world_id,)).fetchone()
            return json.loads(row[0]) if row else None
    def save(self, world_id, world):
        payload=json.dumps(world.to_record(),separators=(",",":"),sort_keys=True)
        with self.lock, sqlite3.connect(self.database,timeout=10) as db:
            db.execute("BEGIN IMMEDIATE")
            row=db.execute("SELECT revision FROM worlds_v82 WHERE world_id=?",(world_id,)).fetchone()
            if row and int(row[0])>int(world.revision):
                db.rollback(); raise ValueError("stale_world_revision")
            db.execute("""INSERT INTO worlds_v82(world_id,revision,record) VALUES(?,?,?)
                ON CONFLICT(world_id) DO UPDATE SET revision=excluded.revision,record=excluded.record""",
                (world_id,world.revision,payload)); db.commit()
