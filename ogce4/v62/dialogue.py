"""Context-aware deterministic dialogue response templates."""
def dialogue_response(npc, player, intent, relationship=0.0):
    if not isinstance(intent,str) or len(intent)>500: raise ValueError("invalid dialogue intent")
    name=npc.get("name","Resident")
    player_name=player.get("display_name","traveller")
    tone="warm" if relationship>=.4 else "guarded" if relationship<=-.4 else "neutral"
    templates={
      "greeting":{"warm":f"{player_name}! It is good to see you again.","guarded":"What brings you here?","neutral":f"Greetings, {player_name}."},
      "help":{"warm":"Of course. Tell me what you need.","guarded":"I may help, but I will need a reason to trust you.","neutral":"I can try to help. What is the problem?"},
      "farewell":{"warm":"Until we meet again, friend.","guarded":"Be on your way.","neutral":"Safe travels."}}
    return {"speaker":name,"text":templates.get(intent,{}).get(tone,"I do not know how to respond to that."),"tone":tone,"intent":intent}
