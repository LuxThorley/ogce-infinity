class LocalBiofeedback:
    def __init__(self):self.consents=set();self.samples={}
    def grant(self,player,signal,purpose):self.consents.add((player,signal));return {"player":player,"signal":signal,"purpose":purpose,"granted":True}
    def ingest(self,player,signal,focus,stress):
        if (player,signal) not in self.consents:raise PermissionError("Explicit consent required")
        data={"focus":max(0,min(100,int(focus))),"stress":max(0,min(100,int(stress)))}
        self.samples[player]=data;return data
