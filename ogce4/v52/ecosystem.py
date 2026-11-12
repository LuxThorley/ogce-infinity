"""Bounded deterministic ecosystem and NPC state simulation."""
import random
SPECIES={"grazer":{"food":"grass","rate":.08},"predator":{"food":"grazer","rate":.035},"flora":{"food":"nutrients","rate":.12}}
def create_ecosystem(seed=1,initial=40):
    rng=random.Random(seed)
    return {"tick":0,"populations":{"flora":initial*4,"grazer":initial,"predator":max(1,initial//8)},
            "resources":{"nutrients":initial*10,"grass":initial*5},"npcs":[]}
def step_ecosystem(state,climate_factor=1.0):
    if not .1<=climate_factor<=2: raise ValueError("climate factor outside safe bounds")
    s={**state,"populations":dict(state["populations"]),"resources":dict(state["resources"])}
    p=s["populations"]; r=s["resources"]
    growth=max(0,int(p["flora"]*.04*climate_factor)); p["flora"]=min(1_000_000,p["flora"]+growth)
    graze=min(p["grazer"],max(0,int(p["grazer"]*.08)))
    p["flora"]=max(0,p["flora"]-graze); p["grazer"]=max(0,min(1_000_000,p["grazer"]+int(p["grazer"]*.025*climate_factor)-int(p["predator"]*.06)))
    p["predator"]=max(0,min(1_000_000,p["predator"]+int(p["predator"]*.015)-int(p["predator"]*.02)))
    r["nutrients"]=min(1_000_000,max(0,r["nutrients"]+int(graze*.2)-growth//3))
    s["tick"]=int(s.get("tick",0))+1
    return s
def create_npc(npc_id,name,role="wanderer",traits=None):
    return {"id":npc_id,"name":name,"role":role,"traits":traits or {},"needs":{"food":1.0,"rest":1.0},"memory":[]}
