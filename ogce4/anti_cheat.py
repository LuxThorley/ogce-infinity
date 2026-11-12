class AntiCheat:
    def inspect(self,m):
        out=[]
        if m.get("actions_per_second",0)>35:out.append({"type":"input_rate_anomaly","severity":"medium"})
        if m.get("score_delta",0)>10000:out.append({"type":"score_spike","severity":"high"})
        return out
