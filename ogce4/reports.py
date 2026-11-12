from statistics import mean
def build_report(mode,scores,event_count):
    vals=list(scores.values())
    return {"mode":mode,"players":len(vals),"events":event_count,
    "mean_combat":round(mean([x.get("combat",0) for x in vals]),2) if vals else 0,
    "mean_cohesion":round(mean([x.get("cohesion",0) for x in vals]),2) if vals else 0}
