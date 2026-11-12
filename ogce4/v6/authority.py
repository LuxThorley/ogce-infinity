"""Local server-authoritative command processor with idempotency and audit events."""
import hashlib, json, threading
class CommandAuthority:
    def __init__(self, handlers):
        self.handlers=dict(handlers); self.lock=threading.RLock(); self.seen={}; self.revision=0; self.audit=[]
    def submit(self, command_id, actor, action, payload, expected_revision):
        if not command_id or len(command_id)>160: raise ValueError("invalid command id")
        if len(json.dumps(payload))>65536: raise ValueError("payload too large")
        digest=hashlib.sha256(json.dumps([actor,action,payload],sort_keys=True).encode()).hexdigest()
        with self.lock:
            if command_id in self.seen:
                prior=self.seen[command_id]
                if prior["digest"]!=digest: raise ValueError("idempotency key reused with different command")
                return dict(prior["result"])
            if expected_revision!=self.revision: raise RuntimeError("authoritative revision conflict")
            if action not in self.handlers: raise PermissionError("action is not allowlisted")
            result=self.handlers[action](actor,payload)
            self.revision+=1
            response={"revision":self.revision,"result":result}
            self.seen[command_id]={"digest":digest,"result":response}
            self.audit.append({"revision":self.revision,"command_id":command_id,"actor":str(actor)[:100],"action":action})
            return response
