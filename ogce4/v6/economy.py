"""Deterministic resource production, consumption and bounded price discovery."""
from copy import deepcopy
def economy_step(state, production=None, consumption=None):
    out=deepcopy(state); production=production or {}; consumption=consumption or {}
    resources=out.setdefault("resources",{})
    for key in set(production)|set(consumption):
        if not key or len(key)>80: raise ValueError("invalid resource key")
        old=int(resources.get(key,0)); made=int(production.get(key,0)); used=int(consumption.get(key,0))
        if min(old,made,used)<0 or max(old,made,used)>1_000_000_000: raise ValueError("resource amount out of bounds")
        resources[key]=max(0,min(1_000_000_000,old+made-used))
    prices=out.setdefault("prices",{})
    for key,qty in resources.items():
        prices[key]=round(max(.01,min(100000,prices.get(key,1.0)*(1.0+(10-qty)/1000))),4)
    out["turn"]=int(out.get("turn",0))+1
    return out
