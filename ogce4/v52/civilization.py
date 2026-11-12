"""Settlement, economy and civilization simulation primitives."""
def create_settlement(name,biome,population=100):
    if population<1: raise ValueError("population must be positive")
    return {"name":name,"biome":biome,"population":population,"stock":{"food":population*3,"wood":population,"ore":population//4},
            "buildings":{"homes":max(1,population//5),"farms":max(1,population//20)},"prosperity":0.5,"history":[]}
def economy_tick(settlement,season="temperate",trade_delta=None):
    s={**settlement,"stock":dict(settlement["stock"]),"history":list(settlement.get("history",[]))}
    demand=max(1,s["population"]//10); harvest=s["buildings"].get("farms",0)*(2 if season=="fertile" else 1)
    s["stock"]["food"]=max(0,s["stock"]["food"]+harvest-demand+(trade_delta or {}).get("food",0))
    s["prosperity"]=round(max(0,min(1,.5+s["stock"]["food"]/max(1,s["population"]*10))),4)
    s["history"].append({"event":"economy_tick","season":season,"food":s["stock"]["food"]})
    return s
