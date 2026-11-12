from dataclasses import dataclass
@dataclass
class Ticket: player_id:str; mode:str; region:str; skill:int
class Matchmaker:
    def __init__(self): self.queue=[]
    def enqueue(self,ticket): self.queue.append(ticket)
    def match(self,mode,region,size):
        pool=sorted([x for x in self.queue if x.mode==mode and x.region==region],key=lambda x:x.skill)
        if len(pool)<size:return None
        chosen=pool[:size]
        for x in chosen:self.queue.remove(x)
        return [x.player_id for x in chosen]
