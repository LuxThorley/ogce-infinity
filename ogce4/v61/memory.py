"""Persistent, bounded agent memory with lexical retrieval and provenance."""
import json, sqlite3, time, uuid
class AgentMemory:
    def __init__(self,path="ogce_memory.sqlite3",max_items=100000):
        self.path=str(path); self.max_items=max_items
        with sqlite3.connect(self.path) as c:
            c.execute("""CREATE TABLE IF NOT EXISTS memories(
              memory_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, world_id TEXT NOT NULL,
              kind TEXT NOT NULL, content TEXT NOT NULL, tags TEXT NOT NULL,
              importance REAL NOT NULL, created_at REAL NOT NULL)""")
            c.execute("CREATE INDEX IF NOT EXISTS idx_memory_scope ON memories(agent_id,world_id,created_at)")
    def add(self,agent_id,world_id,content,kind="observation",tags=(),importance=.5):
        if not agent_id or not world_id or not isinstance(content,str) or not content.strip() or len(content)>4000: raise ValueError("invalid memory input")
        if not 0<=float(importance)<=1: raise ValueError("importance outside [0,1]")
        mid=str(uuid.uuid4())
        with sqlite3.connect(self.path) as c:
            c.execute("INSERT INTO memories VALUES(?,?,?,?,?,?,?,?)",(mid,agent_id,world_id,kind[:60],content,json.dumps(list(tags)[:30]),float(importance),time.time()))
            excess=c.execute("SELECT COUNT(*) FROM memories").fetchone()[0]-self.max_items
            if excess>0: c.execute("DELETE FROM memories WHERE memory_id IN (SELECT memory_id FROM memories ORDER BY importance ASC,created_at ASC LIMIT ?)",(excess,))
        return mid
    def search(self,agent_id,world_id,query,limit=10):
        if not 1<=limit<=100: raise ValueError("limit outside 1..100")
        terms=[t.lower() for t in query.split() if len(t)>1][:20]
        with sqlite3.connect(self.path) as c:
            rows=c.execute("SELECT memory_id,kind,content,tags,importance,created_at FROM memories WHERE agent_id=? AND world_id=? ORDER BY created_at DESC LIMIT 1000",(agent_id,world_id)).fetchall()
        scored=[]
        for r in rows:
            text=(r[2]+" "+r[1]+" "+r[3]).lower()
            score=sum(text.count(t) for t in terms)+r[4]*.2
            if score>0: scored.append((score,r))
        scored.sort(key=lambda x:(-x[0],-x[1][5]))
        return [{"memory_id":r[0],"kind":r[1],"content":r[2],"tags":json.loads(r[3]),"importance":r[4],"created_at":r[5],"relevance":round(s,4)} for s,r in scored[:limit]]
