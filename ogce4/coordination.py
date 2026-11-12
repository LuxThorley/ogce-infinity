class SquadCoordinator:
    def __init__(self):self.links={}
    def link(self,a,b,trust=50,cohesion=50,bandwidth=50):self.links[(a,b)]=(trust,cohesion,bandwidth)
    def route(self,leader,command,urgency=50):
        out=[]
        for (a,b),(t,c,w) in self.links.items():
            if a==leader:
                score=round(.35*t+.35*c+.2*w+.1*urgency);out.append({"member":b,"command":command,"score":score,"accepted":score>=45})
        return out
