"""Bounded deterministic NPC society scheduler, roles and social influence."""
from copy import deepcopy
from ..v6.planning import plan_goals
def create_agent(agent_id,name,role="citizen",goals=None,relationships=None):
    if not agent_id or len(agent_id)>100: raise ValueError("invalid agent id")
    return {"id":agent_id,"name":name[:100],"role":role,"goals":goals or [{"name":"contribute","priority":.5,"urgency":.2}],
            "relationships":relationships or {},"state":"active","turns":0,"last_action":None}
def society_turn(agents,context=None,max_agents=10000):
    if len(agents)>max_agents: raise ValueError("society agent budget exceeded")
    updated=[]; events=[]
    for original in agents:
        a=deepcopy(original)
        if a.get("state")!="active": updated.append(a); continue
        ranked=plan_goals(a.get("goals",[]),context or {})
        action=ranked[0]["name"] if ranked else "idle"
        a["last_action"]=action; a["turns"]=int(a.get("turns",0))+1
        updated.append(a)
        events.append({"agent_id":a["id"],"action":action,"turn":a["turns"]})
    return updated,events
def social_influence(agent,other_id,interaction):
    if not -1<=interaction<=1: raise ValueError("interaction outside [-1,1]")
    out=deepcopy(agent); old=float(out.setdefault("relationships",{}).get(other_id,0))
    out["relationships"][other_id]=round(max(-1,min(1,.85*old+.15*interaction)),4)
    return out
