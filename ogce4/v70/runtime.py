"""Authoritative persistent simulation for OGCE v7.4."""
from __future__ import annotations
import json, sqlite3, threading, time, uuid, math
from pathlib import Path

class GameRuntime:
    def __init__(self, database="ogce_v70.sqlite3"):
        self.database=str(database); self.lock=threading.RLock()
        with self._db() as db:
            db.execute("PRAGMA journal_mode=WAL")  # v7.7 hardening restored in v9.0
            db.execute("PRAGMA synchronous=NORMAL")
            db.executescript("""
            CREATE TABLE IF NOT EXISTS worlds(id TEXT PRIMARY KEY, state TEXT NOT NULL, revision INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, world_id TEXT NOT NULL, revision INTEGER NOT NULL, event TEXT NOT NULL, created REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY, world_id TEXT NOT NULL, state TEXT NOT NULL, updated REAL NOT NULL);
            """)
    def _db(self):
        db=sqlite3.connect(self.database, timeout=30)
        db.execute("PRAGMA busy_timeout=30000")
        db.row_factory=sqlite3.Row
        return db
    @staticmethod
    def initial_world(world_id):
        return {
            "id":world_id,"tick":0,"seed":sum(map(ord,world_id)),"players":{},
            "entities":[
                {"id":"crystal-01","kind":"resource","x":5,"y":4,"resource":"crystal","quantity":8},
                {"id":"wood-01","kind":"resource","x":8,"y":6,"resource":"wood","quantity":12},
                {"id":"stone-01","kind":"resource","x":3,"y":8,"resource":"stone","quantity":10},
                {"id":"crystal-02","kind":"resource","x":14,"y":12,"resource":"crystal","quantity":6},
                {"id":"wood-02","kind":"resource","x":22,"y":18,"resource":"wood","quantity":10},
                {"id":"quest-board","kind":"quest_board","x":4,"y":3}
            ],
            "creatures":[
                {"id":"moss-wolf-01","species":"moss_wolf","name":"Mossfang","x":12,"y":8,"health":32,"max_health":32,"hostile":True,"alive":True,"level":1,"respawn":0},
                {"id":"moss-wolf-02","species":"moss_wolf","name":"Fernstalker","x":18,"y":14,"health":32,"max_health":32,"hostile":True,"alive":True,"level":1,"respawn":0},
                {"id":"silverhart-01","species":"silverhart","name":"Silverhart","x":9,"y":18,"health":18,"max_health":18,"hostile":False,"alive":True,"level":1,"respawn":0}
            ],
            "resources":{"wood":0,"stone":0,"crystal":0},"weather":"clear","chronicle":[]
        }
    def load(self, world_id="Aurelia"):
        with self._db() as db:
            row=db.execute("SELECT state,revision FROM worlds WHERE id=?",(world_id,)).fetchone()
            if row is None:
                state=self.initial_world(world_id)
                db.execute("INSERT INTO worlds VALUES(?,?,0)",(world_id,json.dumps(state)))
                return {"revision":0,"state":state}
            state=json.loads(row["state"])
            # Idempotent v7.2/v7.3 -> v7.4 world migration.
            known={e.get("id") for e in state.get("entities",[])}
            additions=[
                {"id":"wood-01","kind":"resource","x":8,"y":6,"resource":"wood","quantity":12},
                {"id":"stone-01","kind":"resource","x":3,"y":8,"resource":"stone","quantity":10},
                {"id":"crystal-02","kind":"resource","x":14,"y":12,"resource":"crystal","quantity":6},
                {"id":"wood-02","kind":"resource","x":22,"y":18,"resource":"wood","quantity":10},
                {"id":"quest-board","kind":"quest_board","x":4,"y":3}
            ]
            missing=[e for e in additions if e["id"] not in known]
            if missing: state.setdefault("entities",[]).extend(missing)
            if "creatures" not in state:
                state["creatures"]=self.initial_world(world_id)["creatures"]
                missing.append({"id":"creature-population","kind":"system"})
            if missing:
                next_revision=row["revision"]+1
                db.execute("UPDATE worlds SET state=?,revision=? WHERE id=? AND revision=?",
                           (json.dumps(state,separators=(",",":")),next_revision,world_id,row["revision"]))
                db.execute("INSERT INTO events(world_id,revision,event,created) VALUES(?,?,?,?)",
                           (world_id,next_revision,json.dumps({"type":"world_upgrade","version":"7.4.0","added":[e["id"] for e in missing]}),time.time()))
                return {"revision":next_revision,"state":state}
            return {"revision":row["revision"],"state":state}
    def _commit(self, db, world_id, expected, state, event):
        cur=db.execute("UPDATE worlds SET state=?,revision=revision+1 WHERE id=? AND revision=?",
                       (json.dumps(state,separators=(",",":")),world_id,expected))
        if cur.rowcount != 1: raise ValueError("revision_conflict")
        db.execute("INSERT INTO events(world_id,revision,event,created) VALUES(?,?,?,?)",
                   (world_id,expected+1,json.dumps(event),time.time()))
        return expected+1
    @staticmethod
    def _distance(a,b):
        return abs(int(a["x"])-int(b["x"]))+abs(int(a["y"])-int(b["y"]))
    def _simulate_tick(self,state,player):
        state["tick"]+=1
        player["hunger"]=min(100,player.get("hunger",0)+1)
        state["weather"]=["clear","rain","wind","mist","clear"][(state["tick"]//5)%5]
        notes=[]
        for c in state.get("creatures",[]):
            if not c.get("alive",True):
                c["respawn"]=max(0,int(c.get("respawn",0))-1)
                if c["respawn"]==0:
                    c["alive"]=True;c["health"]=c.get("max_health",24);notes.append(f"{c['name']} returns to the wild")
                continue
            dist=self._distance(c,player)
            if c.get("hostile") and dist<=6:
                if dist>1:
                    dx=0 if c["x"]==player["x"] else (1 if player["x"]>c["x"] else -1)
                    dy=0 if c["y"]==player["y"] else (1 if player["y"]>c["y"] else -1)
                    # Move along one axis per tick; keep creatures inside world bounds.
                    if abs(player["x"]-c["x"])>=abs(player["y"]-c["y"]): c["x"]=max(0,min(63,c["x"]+dx))
                    else: c["y"]=max(0,min(63,c["y"]+dy))
                else:
                    damage=max(1,3+int(c.get("level",1)))
                    player["health"]=max(0,player.get("health",100)-damage)
                    notes.append(f"{c['name']} strikes for {damage}")
            elif not c.get("hostile") and dist<=3:
                dx=1 if c["x"]>=player["x"] else -1
                dy=1 if c["y"]>=player["y"] else -1
                if abs(c["x"]-player["x"])>=abs(c["y"]-player["y"]): c["x"]=max(0,min(63,c["x"]+dx))
                else: c["y"]=max(0,min(63,c["y"]+dy))
        if player["health"]<=0:
            player["health"]=50
            player["x"],player["y"]=2,2
            notes.append("You awaken at the frontier camp")
        state.setdefault("chronicle",[]).extend({"type":"simulation","message":n,"at":int(time.time())} for n in notes)
        state["chronicle"]=state["chronicle"][-100:]
        return notes
    def act(self, world_id, player_id, action):
        if not isinstance(action,dict): raise ValueError("action_must_be_object")
        kind=action.get("type")
        allowed={"move","gather","build","chat","advance","attack","craft","drink_potion","quest","interact","rest"}
        if kind not in allowed: raise ValueError("unsupported_action")
        with self.lock, self._db() as db:
            row=db.execute("SELECT state,revision FROM worlds WHERE id=?",(world_id,)).fetchone()
            if row is None:
                state=self.initial_world(world_id); rev=0
                db.execute("INSERT INTO worlds VALUES(?,?,0)",(world_id,json.dumps(state)))
            else: state=json.loads(row["state"]); rev=row["revision"]
            players=state["players"]
            p=players.setdefault(player_id,{"x":2,"y":2,"health":100,"max_health":100,"hunger":0,"inventory":{},"name":player_id[:12],"level":1,"xp":0,"equipment":{"weapon":"traveller_blade"},"quests":{},"potions":0})
            p.setdefault("max_health",100);p.setdefault("level",1);p.setdefault("xp",0);p.setdefault("equipment",{"weapon":"traveller_blade"});p.setdefault("quests",{});p.setdefault("potions",0)
            p.setdefault("inventory",{})
            message=""
            if kind=="move":
                dx=int(action.get("dx",0)); dy=int(action.get("dy",0))
                if abs(dx)+abs(dy)!=1: raise ValueError("movement_must_be_one_cardinal_tile")
                nx=max(0,min(63,p["x"]+dx));ny=max(0,min(63,p["y"]+dy))
                blocker=next((e for e in state["entities"] if e.get("kind")=="structure" and e.get("structure")=="shelter" and e["x"]==nx and e["y"]==ny),None)
                if blocker: raise ValueError("movement_blocked")
                p["x"],p["y"]=nx,ny
            elif kind=="gather":
                target=next((e for e in state["entities"] if e["id"]==action.get("target")),None)
                if not target or target["kind"]!="resource": raise ValueError("resource_not_found")
                if self._distance(p,target)>1: raise ValueError("resource_out_of_reach")
                qty=min(3,target["quantity"])
                if qty<=0: raise ValueError("resource_depleted")
                target["quantity"]-=qty; resource=target["resource"]
                p["inventory"][resource]=p["inventory"].get(resource,0)+qty
                message=f"Gathered {qty} {resource}"
            elif kind=="build":
                recipe=action.get("recipe")
                costs={"campfire":{"wood":2,"stone":1},"shelter":{"wood":4,"stone":2}}
                if recipe not in costs: raise ValueError("unknown_recipe")
                inv=p["inventory"]
                if any(inv.get(k,0)<v for k,v in costs[recipe].items()): raise ValueError("insufficient_materials")
                for k,v in costs[recipe].items(): inv[k]-=v
                if any(e.get("kind")=="structure" and e["x"]==p["x"] and e["y"]==p["y"] for e in state["entities"]): raise ValueError("tile_occupied")
                state["entities"].append({"id":str(uuid.uuid4())[:8],"kind":"structure","structure":recipe,"x":p["x"],"y":p["y"]})
                message=f"Built {recipe}"
            elif kind=="attack":
                target=next((c for c in state.get("creatures",[]) if c["id"]==action.get("target") and c.get("alive",True)),None)
                if not target: raise ValueError("creature_not_found")
                if self._distance(p,target)>2: raise ValueError("target_out_of_reach")
                weapon=p["equipment"].get("weapon","traveller_blade")
                damage={"traveller_blade":12,"stone_edge":18,"crystal_sabre":27}.get(weapon,10)
                target["health"]=max(0,target["health"]-damage)
                if target["health"]==0:
                    target["alive"]=False;target["respawn"]=8
                    loot={"wood":2} if target["species"]=="moss_wolf" else {"crystal":1}
                    for item,qty in loot.items():p["inventory"][item]=p["inventory"].get(item,0)+qty
                    xp=25*int(target.get("level",1));p["xp"]+=xp
                    while p["xp"]>=p["level"]*100:
                        p["xp"]-=p["level"]*100;p["level"]+=1;p["max_health"]+=10;p["health"]=p["max_health"]
                    message=f"{target['name']} defeated · +{xp} XP"
                else: message=f"Hit {target['name']} for {damage}"
            elif kind=="craft":
                recipe=action.get("recipe")
                recipes={
                    "healing_potion":({"crystal":2}, {"potions":1}),
                    "stone_edge":({"stone":5,"wood":2}, {"weapon":"stone_edge"}),
                    "crystal_sabre":({"crystal":5,"stone":3,"wood":2}, {"weapon":"crystal_sabre"})
                }
                if recipe not in recipes: raise ValueError("unknown_recipe")
                costs,reward=recipes[recipe];inv=p["inventory"]
                if any(inv.get(k,0)<v for k,v in costs.items()):raise ValueError("insufficient_materials")
                for k,v in costs.items():inv[k]-=v
                for k,v in reward.items():
                    if k=="potions":p["potions"]=p.get("potions",0)+v
                    else:p["equipment"][k]=v
                message=f"Crafted {recipe}"
            elif kind=="drink_potion":
                if p.get("potions",0)<1:raise ValueError("no_healing_potions")
                if p["health"]>=p["max_health"]:raise ValueError("health_already_full")
                p["potions"]-=1;p["health"]=min(p["max_health"],p["health"]+45);message="Healing potion restored health"
            elif kind in {"quest","interact"}:
                op=action.get("operation","accept")
                qid=str(action.get("quest_id","frontier_hunt"))
                quests={
                    "frontier_hunt":{"title":"The Frontier Hunt","target":"moss_wolf","count":2,"reward":{"xp":80,"crystal":2}},
                    "gatherer_path":{"title":"The Gatherer's Path","target":"gather_any","count":6,"reward":{"xp":50,"wood":3}}
                }
                if qid not in quests:raise ValueError("quest_not_found")
                q=quests[qid];progress=p["quests"].setdefault(qid,{"accepted":False,"progress":0,"claimed":False})
                if op=="accept":
                    progress["accepted"]=True;message=f"Quest accepted: {q['title']}"
                elif op=="claim":
                    if not progress["accepted"] or progress["progress"]<q["count"]:raise ValueError("quest_objective_incomplete")
                    if progress["claimed"]:raise ValueError("quest_already_claimed")
                    progress["claimed"]=True;reward=q["reward"];p["xp"]+=reward["xp"]
                    while p["xp"]>=p["level"]*100:
                        p["xp"]-=p["level"]*100;p["level"]+=1;p["max_health"]+=10;p["health"]=p["max_health"]
                    for item,qty in reward.items():
                        if item!="xp":p["inventory"][item]=p["inventory"].get(item,0)+qty
                    message=f"Quest completed: {q['title']}"
                else:raise ValueError("unknown_quest_operation")
            elif kind=="rest":
                if not any(e.get("kind")=="structure" and e.get("structure") in {"campfire","shelter"} and self._distance(p,e)<=1 for e in state["entities"]):
                    raise ValueError("rest_requires_nearby_camp")
                p["health"]=min(p["max_health"],p["health"]+25);p["hunger"]=max(0,p["hunger"]-10);message="Rested by the camp"
            elif kind=="chat":
                msg=str(action.get("message",""))[:240]
                if not msg.strip(): raise ValueError("empty_message")
                state["chronicle"].append({"type":"chat","player":player_id[:12],"message":msg,"at":int(time.time())})
            elif kind=="advance":
                self._simulate_tick(state,p)
                message="The world moves onward"
            if kind=="gather":
                for qid,progress in p["quests"].items():
                    if progress.get("accepted") and not progress.get("claimed") and qid=="gatherer_path":
                        progress["progress"]+=qty
            if kind=="attack" and "defeated" in message:
                for qid,progress in p["quests"].items():
                    if qid=="frontier_hunt" and progress.get("accepted") and not progress.get("claimed") and target["species"]=="moss_wolf":
                        progress["progress"]+=1
            if message and kind not in {"chat"}:
                state.setdefault("chronicle",[]).append({"type":kind,"player":player_id[:12],"message":message,"at":int(time.time())})
            state["chronicle"]=state.get("chronicle",[])[-100:]
            event={"player":player_id,"action":action,"tick":state["tick"]}
            newrev=self._commit(db,world_id,rev,state,event)
            db.execute("INSERT OR REPLACE INTO players VALUES(?,?,?,?)",(player_id,world_id,json.dumps(p),time.time()))
            return {"revision":newrev,"state":state,"event":event}
    def events_since(self, world_id, after=0, limit=200):
        with self._db() as db:
            rows=db.execute("SELECT revision,event,created FROM events WHERE world_id=? AND revision>? ORDER BY revision LIMIT ?",
                            (world_id,max(0,int(after)),min(500,max(1,int(limit))))).fetchall()
            return [{"revision":r["revision"],"event":json.loads(r["event"]),"created":r["created"]} for r in rows]
