"""Authoritative multiplayer room state with bounded membership and sequence numbers."""
import threading, time
class RoomError(RuntimeError): pass
class WorldRoom:
    def __init__(self,world_id,max_players=64):
        if not world_id or not 1<=max_players<=10000: raise ValueError("invalid room configuration")
        self.world_id=world_id; self.max_players=max_players; self.players={}; self.sequence=0; self.lock=threading.RLock(); self.events=[]
    def join(self,player_id,permissions=()):
        with self.lock:
            if player_id in self.players: return self.snapshot()
            if len(self.players)>=self.max_players: raise RoomError("room is full")
            self.players[player_id]={"permissions":list(permissions),"joined_at":time.time(),"last_sequence":self.sequence}
            self._event("player_joined",{"player_id":player_id})
            return self.snapshot()
    def leave(self,player_id):
        with self.lock:
            if player_id in self.players:
                del self.players[player_id]; self._event("player_left",{"player_id":player_id})
            return self.snapshot()
    def _event(self,kind,payload):
        self.sequence+=1; self.events.append({"sequence":self.sequence,"kind":kind,"payload":payload,"time":time.time()}); self.events=self.events[-1000:]
    def publish(self,player_id,kind,payload):
        with self.lock:
            if player_id not in self.players: raise PermissionError("player is not in room")
            if kind not in {"player_moved","chat_message","interaction_requested"}: raise PermissionError("event type is not allowlisted")
            if len(str(payload))>4000: raise ValueError("payload too large")
            self._event(kind,{"player_id":player_id,"data":payload})
            return self.sequence
    def snapshot(self):
        with self.lock:
            return {"world_id":self.world_id,"sequence":self.sequence,"players":list(self.players),"events":list(self.events[-100:])}
    def events_since(self,sequence,limit=100):
        if not 1<=limit<=500: raise ValueError("limit outside 1..500")
        with self.lock: return [e for e in self.events if e["sequence"]>sequence][:limit]
