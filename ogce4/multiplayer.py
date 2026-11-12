from dataclasses import dataclass,field
from uuid import uuid4
@dataclass
class Player:
    id:str
    name:str
    scores:dict=field(default_factory=lambda:{"combat":0,"leadership":0,"support":0,"strategy":0,"cohesion":0})
class MultiplayerAuthority:
    def __init__(self): self.players={}
    def register(self,name):
        p=Player(uuid4().hex,name);self.players[p.id]=p;return p
    def award(self,pid,category,points):
        if category not in self.players[pid].scores: raise ValueError("Unknown category")
        self.players[pid].scores[category]+=int(points)
    def leaderboard(self,category):
        return sorted([{"id":p.id,"name":p.name,"score":p.scores[category]} for p in self.players.values()],key=lambda x:(-x["score"],x["name"]))
