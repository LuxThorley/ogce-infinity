"""Revision-checked shared-world state protocol; storage adapter can be local or remote."""
import hashlib,json,threading
class RevisionConflict(RuntimeError): pass
class SharedWorld:
    def __init__(self,initial=None):
        self.state=initial or {}; self.revision=0; self.lock=threading.RLock(); self.log=[]
    def snapshot(self):
        with self.lock:
            payload=json.dumps(self.state,sort_keys=True,separators=(",",":"))
            return {"revision":self.revision,"state":json.loads(payload),"digest":hashlib.sha256(payload.encode()).hexdigest()}
    def apply(self,expected_revision,patch,actor):
        if len(patch)>100: raise ValueError("patch operation limit exceeded")
        with self.lock:
            if expected_revision!=self.revision: raise RevisionConflict(f"expected {expected_revision}, current {self.revision}")
            for key,value in patch.items():
                if key.startswith("_") or key in {"auth","permissions","server_secret"}: raise ValueError("reserved state key")
                self.state[key]=value
            self.revision+=1
            self.log.append({"revision":self.revision,"actor":str(actor)[:80],"patch":patch})
            return self.snapshot()
