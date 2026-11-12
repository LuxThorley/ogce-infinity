import sqlite3
from pathlib import Path
class Store:
    def __init__(self,path:Path): self.path=path
    def initialize(self):
        self.path.parent.mkdir(parents=True,exist_ok=True)
        with sqlite3.connect(self.path) as db:
            db.executescript("CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,mode TEXT,region TEXT,status TEXT); CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,session_id TEXT,kind TEXT,payload TEXT);")
