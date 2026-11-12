"""Player profile, inventory and permission-checked world action primitives."""
from copy import deepcopy
def create_player(player_id, display_name):
    if not player_id or len(player_id)>100 or not display_name or len(display_name)>100: raise ValueError("invalid player identity")
    return {"player_id":player_id,"display_name":display_name,"inventory":{},"position":[0,0,0],"permissions":["world.read","world.interact"],"profile":{}}
def grant_item(player, item, quantity=1):
    if not item or len(item)>100 or not isinstance(quantity,int) or quantity<1 or quantity>100000: raise ValueError("invalid item grant")
    p=deepcopy(player); p["inventory"][item]=p["inventory"].get(item,0)+quantity; return p
def apply_player_action(player, action, payload, required_permission="world.interact"):
    if required_permission not in player.get("permissions",[]): raise PermissionError("player lacks required permission")
    if action=="move":
        pos=payload.get("position")
        if not isinstance(pos,list) or len(pos)!=3 or any(not isinstance(v,(int,float)) or abs(v)>1e7 for v in pos): raise ValueError("invalid position")
        p=deepcopy(player); p["position"]=[float(v) for v in pos]; return p
    raise ValueError("unsupported player action")
