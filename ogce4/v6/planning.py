"""Bounded deterministic goal planner and simple behavior-tree primitives."""
def plan_goals(goals, context, max_candidates=100):
    if not isinstance(goals,list) or len(goals)>max_candidates: raise ValueError("goal candidate limit exceeded")
    ranked=[]
    for g in goals:
        if not isinstance(g,dict) or not isinstance(g.get("name"),str): continue
        priority=max(0,min(1,float(g.get("priority",0))))
        urgency=max(0,min(1,float(g.get("urgency",0))))
        if g.get("requires") and not all(context.get(k) for k in g["requires"]): continue
        ranked.append({"name":g["name"][:120],"score":round(.65*priority+.35*urgency,5)})
    return sorted(ranked,key=lambda x:(-x["score"],x["name"]))
class Sequence:
    def __init__(self,*nodes): self.nodes=nodes
    def tick(self, context):
        for node in self.nodes:
            result=node(context)
            if result not in ("success",True): return result
        return "success"
