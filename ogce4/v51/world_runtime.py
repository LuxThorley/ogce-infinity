"""Persistent, deterministic world simulation using SQLite and bounded fixed ticks."""
import json, sqlite3, time
from pathlib import Path
class WorldRuntime:
    def __init__(self,db_path):
        self.path=Path(db_path); self.path.parent.mkdir(parents=True,exist_ok=True)
        with self._db() as c:
            c.execute("CREATE TABLE IF NOT EXISTS worlds(id TEXT PRIMARY KEY, state TEXT NOT NULL, revision INTEGER NOT NULL)")
            c.execute("CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, world_id TEXT, tick INTEGER, kind TEXT, payload TEXT, created REAL)")
    def _db(self): return sqlite3.connect(self.path)
    def create(self,world_id,state):
        with self._db() as c: c.execute("INSERT INTO worlds VALUES(?,?,0)",(world_id,json.dumps(state,sort_keys=True)))
    def load(self,world_id):
        with self._db() as c: row=c.execute("SELECT state,revision FROM worlds WHERE id=?",(world_id,)).fetchone()
        if not row: raise KeyError(world_id)
        return {"state":json.loads(row[0]),"revision":row[1]}
    def tick(self,world_id,events=()):
        if len(events)>1000: raise ValueError("tick event limit exceeded")
        with self._db() as c:
            row=c.execute("SELECT state,revision FROM worlds WHERE id=?",(world_id,)).fetchone()
            if not row: raise KeyError(world_id)
            state=json.loads(row[0]); tick=int(state.get("tick",0))+1
            for e in events:
                if e.get("kind") not in {"weather","resource","npc","quest"}: raise ValueError("unsupported event kind")
                c.execute("INSERT INTO events(world_id,tick,kind,payload,created) VALUES(?,?,?,?,?)",(world_id,tick,e["kind"],json.dumps(e.get("payload",{})),time.time()))
            state["tick"]=tick
            c.execute("UPDATE worlds SET state=?,revision=? WHERE id=?",(json.dumps(state,sort_keys=True),row[1]+1,world_id))
        return {"tick":tick,"revision":row[1]+1,"state":state}
    def history(self,world_id,limit=100):
        with self._db() as c: rows=c.execute("SELECT tick,kind,payload FROM events WHERE world_id=? ORDER BY id DESC LIMIT ?",(world_id,min(max(1,limit),1000))).fetchall()
        return [{"tick":r[0],"kind":r[1],"payload":json.loads(r[2])} for r in rows]
