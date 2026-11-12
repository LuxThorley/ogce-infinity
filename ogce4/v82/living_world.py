"""Deterministic, fictional game systems for arcana, science and technology.

All supernatural effects are explicitly simulated game mechanics. No claims about
real-world paranormal phenomena or scientific discovery are made.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
import hashlib, json, random, time

class WorldError(ValueError): pass

DISCIPLINES = {
    "arcana": ["elementalism","restoration","warding","enchantment","naturecraft","astralism"],
    "science": ["physics","chemistry","biology","astronomy","ecology","archaeology"],
    "technology": ["engineering","materials","energy","computing","automation","transport"],
}
SPELLS = {
    "ember_bolt": {"school":"elementalism","cost":8,"power":12,"description":"A simulated burst of ember-light."},
    "verdant_mend": {"school":"restoration","cost":10,"power":18,"description":"Restores a little vitality through fictional nature magic."},
    "aegis_ward": {"school":"warding","cost":12,"power":15,"description":"Raises a temporary protective ward."},
    "star_sight": {"school":"astralism","cost":7,"power":0,"description":"Reveals a symbolic celestial omen."},
    "rune_spark": {"school":"enchantment","cost":9,"power":10,"description":"Charges a crafted item with a short-lived arcane effect."},
}
TECHS = {
    "windmill": {"discipline":"engineering","cost":12,"effects":{"energy":3},"requires":[]},
    "crystal_lens": {"discipline":"materials","cost":18,"effects":{"research":3},"requires":[]},
    "star_charting": {"discipline":"astronomy","cost":16,"effects":{"knowledge":4},"requires":[]},
    "field_medicine": {"discipline":"biology","cost":20,"effects":{"health":5},"requires":[]},
    "automata": {"discipline":"automation","cost":32,"effects":{"industry":5},"requires":["windmill","crystal_lens"]},
    "aether_dynamo": {"discipline":"energy","cost":40,"effects":{"energy":12},"requires":["crystal_lens","star_charting"]},
    "living_architecture": {"discipline":"ecology","cost":36,"effects":{"harmony":8},"requires":["field_medicine"]},
    "celestial_engine": {"discipline":"astronomy","cost":55,"effects":{"energy":8,"knowledge":8},"requires":["aether_dynamo","automata"]},
}
def _safe_id(value):
    value=str(value or "").strip()
    if not value or len(value)>48 or not all(c.isalnum() or c in "_-" for c in value):
        raise WorldError("identifier must be 1–48 letters, digits, '_' or '-'")
    return value

class LivingWorld82:
    """A serializable, deterministic game-world aggregate."""
    def __init__(self, seed=8200):
        self.seed=int(seed); self.tick_count=0; self.revision=0
        self.characters={}; self.research={}; self.inventions={}
        self.events=[]; self.celestial={"cycle":0,"alignment":"Dawn Conjunction","omen":"A season of patient discovery"}
        self.civilization={"energy":0,"research":0,"knowledge":0,"industry":0,"harmony":50}
        self.ledger=[]
        self._record("world_created",{"seed":self.seed})
    def _record(self, kind, payload):
        previous=self.ledger[-1]["hash"] if self.ledger else "0"*64
        body={"seq":len(self.ledger)+1,"tick":self.tick_count,"kind":kind,"payload":payload,"previous":previous}
        digest=hashlib.sha256(json.dumps(body,sort_keys=True,separators=(",",":")).encode()).hexdigest()
        self.ledger.append({**body,"hash":digest})
    def verify_ledger(self):
        previous="0"*64
        for row in self.ledger:
            body={k:row[k] for k in ("seq","tick","kind","payload","previous")}
            expected=hashlib.sha256(json.dumps(body,sort_keys=True,separators=(",",":")).encode()).hexdigest()
            if row["previous"]!=previous or row["hash"]!=expected: return False
            previous=row["hash"]
        return True
    def create_character(self, character_id, name, birth_cycle=0, path="hybrid"):
        cid=_safe_id(character_id)
        if cid in self.characters: raise WorldError("character already exists")
        if path not in ("arcane","scientific","hybrid"): raise WorldError("invalid character path")
        self.characters[cid]={"id":cid,"name":str(name)[:64] or cid,"path":path,
            "birth_cycle":int(birth_cycle)%12,"level":1,"xp":0,"health":100,"mana":60,
            "arcane_affinity":25 if path in ("arcane","hybrid") else 5,
            "scientific_aptitude":25 if path in ("scientific","hybrid") else 5,
            "skills":{d:0 for group in DISCIPLINES.values() for d in group},
            "spells":["ember_bolt","verdant_mend"] if path!="scientific" else [],
            "known_techs":[],"discoveries":[],"inventory":{"aether_crystal":2,"herb":3,"ore":2}}
        self._record("character_created",{"id":cid,"path":path})
        return self.character(cid)
    def character(self, cid):
        try: return json.loads(json.dumps(self.characters[_safe_id(cid)]))
        except KeyError: raise WorldError("unknown character")
    def learn_spell(self, cid, spell):
        c=self._get(cid)
        if spell not in SPELLS: raise WorldError("unknown spell")
        if c["path"]=="scientific": raise WorldError("scientific path must unlock arcane study through hybrid progression")
        if spell not in c["spells"]: c["spells"].append(spell); self._record("spell_learned",{"character":cid,"spell":spell})
        return self.character(cid)
    def cast(self, cid, spell, target=None):
        c=self._get(cid)
        if spell not in c["spells"] or spell not in SPELLS: raise WorldError("spell not learned")
        spec=SPELLS[spell]
        if c["mana"]<spec["cost"]: raise WorldError("insufficient mana")
        c["mana"]-=spec["cost"]; outcome={"spell":spell,"target":str(target or "self")[:64],"power":spec["power"],"effect":spec["description"]}
        if spell=="verdant_mend": c["health"]=min(100,c["health"]+spec["power"])
        if spell=="aegis_ward": c["health"]=min(100,c["health"]+spec["power"]//2)
        if spell=="rune_spark": c["inventory"]["enchanted_shard"]=c["inventory"].get("enchanted_shard",0)+1
        if spell=="star_sight": outcome["omen"]=self.celestial["omen"]
        c["xp"]+=4; self._record("spell_cast",{"character":cid,**outcome})
        return {"character":self.character(cid),"outcome":outcome}
    def celestial_reading(self, cid):
        c=self._get(cid); cycle=(self.tick_count//5+c["birth_cycle"])%12
        signs=["Dawn","Ember","Tide","Grove","Stone","Gale","Crown","Veil","Lantern","Comet","Hearth","Horizon"]
        sign=signs[cycle]
        alignments=["Dawn Conjunction","Silver Crossing","The Wandering Crown","Quiet Apogee"]
        rng=random.Random(self.seed+cycle+self.tick_count//3)
        return {"sign":sign,"alignment":alignments[(self.tick_count//4)%4],
            "reading":rng.choice(["A bold experiment may open a new path.","Tend alliances before seeking distant wonders.","A forgotten pattern connects two discoveries.","Patience turns scattered clues into knowledge."]),
            "gameplay_affinity":{"arcana":2 if cycle%3==0 else 0,"science":2 if cycle%3==1 else 0,"craft":2 if cycle%3==2 else 0},
            "disclaimer":"Fictional in-world astrology: symbolic narrative and game modifiers only."}
    def submit_hypothesis(self, cid, title, discipline, hypothesis, method="controlled comparison"):
        c=self._get(cid)
        if discipline not in DISCIPLINES["science"]: raise WorldError("invalid scientific discipline")
        rid=f"r{len(self.research)+1:05d}"
        self.research[rid]={"id":rid,"character":cid,"title":str(title)[:100],"discipline":discipline,
            "hypothesis":str(hypothesis)[:500],"method":str(method)[:200],"status":"proposed",
            "observations":[],"result":None,"reproducible":False,"tick":self.tick_count}
        self._record("hypothesis_submitted",{"id":rid,"discipline":discipline})
        return json.loads(json.dumps(self.research[rid]))
    def experiment(self, cid, research_id, observation, repeat=False):
        c=self._get(cid)
        try: r=self.research[str(research_id)]
        except KeyError: raise WorldError("unknown research")
        if r["character"]!=cid: raise WorldError("research belongs to another character")
        if len(r["observations"])>=12: raise WorldError("observation limit reached")
        obs=str(observation)[:300]
        r["observations"].append(obs)
        r["status"]="observing"
        if repeat and len(r["observations"])>=2:
            r["reproducible"]=r["observations"][-1]==r["observations"][-2]
            r["status"]="supported_in_simulation" if r["reproducible"] else "inconclusive"
            r["result"]="Repeated observation matched." if r["reproducible"] else "Repeated observation differed; revise the hypothesis."
            c["xp"]+=8 if r["reproducible"] else 2
            if r["reproducible"]:
                c["discoveries"].append(r["title"])
                self.civilization["knowledge"]+=2
        self._record("experiment_recorded",{"research":research_id,"repeat":bool(repeat),"reproducible":r["reproducible"]})
        return json.loads(json.dumps(r))
    def invent(self, cid, tech_id):
        c=self._get(cid)
        if tech_id not in TECHS: raise WorldError("unknown technology")
        spec=TECHS[tech_id]
        if tech_id in c["known_techs"]: return {"status":"already_invented","technology":tech_id}
        missing=[x for x in spec["requires"] if x not in c["known_techs"]]
        if missing: raise WorldError("prerequisites missing: "+", ".join(missing))
        skill=c["skills"].get(spec["discipline"],0)
        if c["xp"]+skill*3<spec["cost"]: raise WorldError(f"need {spec['cost']} research aptitude points; gain XP or practice {spec['discipline']}")
        c["known_techs"].append(tech_id); c["xp"]=max(0,c["xp"]-spec["cost"]//2)
        for k,v in spec["effects"].items(): self.civilization[k]=self.civilization.get(k,0)+v
        self.inventions[tech_id]={"inventor":cid,"tick":self.tick_count,"effects":spec["effects"]}
        self._record("technology_invented",{"character":cid,"technology":tech_id})
        return {"status":"invented","technology":tech_id,"effects":spec["effects"],"civilization":dict(self.civilization)}
    def train(self,cid,discipline,amount=1):
        c=self._get(cid)
        if discipline not in c["skills"]: raise WorldError("unknown discipline")
        amount=max(1,min(10,int(amount))); c["skills"][discipline]+=amount
        c["xp"]+=amount*2; self._record("skill_trained",{"character":cid,"discipline":discipline,"amount":amount})
        return self.character(cid)
    def tick(self,count=1):
        count=max(1,min(100,int(count)))
        for _ in range(count):
            self.tick_count+=1; self.celestial["cycle"]=(self.celestial["cycle"]+1)%12
            self.celestial["alignment"]=["Dawn Conjunction","Silver Crossing","The Wandering Crown","Quiet Apogee"][(self.tick_count//4)%4]
            if self.tick_count%5==0:
                self.celestial["omen"]="The heavens favour careful observation" if self.tick_count%10==0 else "A rare alignment inspires arcane study"
                for c in self.characters.values(): c["mana"]=min(100,c["mana"]+3)
            if self.tick_count%12==0:
                self.events.append({"tick":self.tick_count,"event":"Seasonal turning","effect":"A new cycle begins across the simulated realm."})
                self.events=self.events[-50:]
            self._record("world_tick",{"tick":self.tick_count})
        self.revision+=1
        return self.snapshot()
    def _get(self,cid):
        try: return self.characters[_safe_id(cid)]
        except KeyError: raise WorldError("unknown character")
    def snapshot(self):
        return {"version":"8.2.0","seed":self.seed,"tick":self.tick_count,"revision":self.revision,
            "characters":list(self.characters.values()),"research":list(self.research.values()),
            "inventions":self.inventions,"celestial":self.celestial,"civilization":self.civilization,
            "events":self.events[-10:],"ledger":{"entries":len(self.ledger),"valid":self.verify_ledger(),
            "head":self.ledger[-1]["hash"] if self.ledger else None},
            "fiction_notice":"Arcana, astrology and supernatural effects are fictional simulations; scientific results describe this game world only."}
    def to_record(self):
        return {"seed":self.seed,"tick_count":self.tick_count,"revision":self.revision,
            "characters":self.characters,"research":self.research,"inventions":self.inventions,
            "events":self.events,"celestial":self.celestial,"civilization":self.civilization,"ledger":self.ledger}
    @classmethod
    def from_record(cls,record):
        w=cls(record.get("seed",8200))
        for key in ("tick_count","revision","characters","research","inventions","events","celestial","civilization","ledger"):
            if key in record: setattr(w,key,record[key])
        if not w.verify_ledger(): raise WorldError("world ledger integrity failure")
        return w
