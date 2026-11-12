"""Bounded cursor-based polling loop for provider feeds (not SSE/WebSocket)."""
class FeedPoller:
    def __init__(self,provider,max_batches=100): self.provider=provider; self.max_batches=max_batches; self.cursor=None
    def poll_once(self):
        batch=self.provider.stream(self.cursor)
        if not isinstance(batch,dict): return {"items":[],"cursor":self.cursor,"warning":"non_json_feed"}
        items=batch.get("items",batch.get("events",[]))
        if not isinstance(items,list): items=[]
        items=items[:100]
        self.cursor=batch.get("next_cursor",batch.get("cursor",self.cursor))
        return {"items":items,"cursor":self.cursor}
    def drain(self,batches=1):
        if not 1<=batches<=self.max_batches: raise ValueError("batch count outside configured limit")
        result=[]
        for _ in range(batches):
            part=self.poll_once(); result.extend(part["items"])
            if not part["items"]: break
        return {"items":result,"cursor":self.cursor}
