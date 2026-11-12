"""Persistent μLux world snapshots and audit ledger using SQLite."""
import json, sqlite3, threading
from .mulux import LivingWorld, canonical

class MuluxStore:
    def __init__(self, database="ogce_v80.sqlite3"):
        self.database, self.lock = str(database), threading.RLock()
        with self._db() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS mulux_worlds(
              world_id TEXT PRIMARY KEY, seed INTEGER NOT NULL, tick INTEGER NOT NULL,
              state TEXT NOT NULL, ledger TEXT NOT NULL, updated REAL NOT NULL DEFAULT (unixepoch()));
            CREATE TABLE IF NOT EXISTS mulux_receipts(
              id INTEGER PRIMARY KEY AUTOINCREMENT, world_id TEXT NOT NULL,
              receipt TEXT NOT NULL, created REAL NOT NULL DEFAULT (unixepoch()));
            """)
    def _db(self):
        db=sqlite3.connect(self.database, timeout=30)
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA busy_timeout=30000")
        return db
    def save(self, world_id, world: LivingWorld):
        snap=world.snapshot()
        with self.lock, self._db() as db:
            db.execute("""INSERT INTO mulux_worlds(world_id,seed,tick,state,ledger,updated)
              VALUES(?,?,?,?,?,unixepoch()) ON CONFLICT(world_id) DO UPDATE SET
              seed=excluded.seed,tick=excluded.tick,state=excluded.state,
              ledger=excluded.ledger,updated=unixepoch()""",
              (world_id,world.seed,world.tick_count,canonical(snap),canonical(world.ledger)))
    def load_record(self, world_id):
        with self._db() as db:
            row=db.execute("SELECT seed,tick,state,ledger,updated FROM mulux_worlds WHERE world_id=?",(world_id,)).fetchone()
        if not row: return None
        return {"seed":row[0],"tick":row[1],"state":json.loads(row[2]),
                "ledger":json.loads(row[3]),"updated":row[4]}
    def save_receipt(self, world_id, receipt):
        with self._db() as db:
            db.execute("INSERT INTO mulux_receipts(world_id,receipt) VALUES(?,?)",(world_id,canonical(receipt)))
