"""Human-governed, test-gated evolution proposals with immutable audit history."""
from dataclasses import dataclass,asdict
from datetime import datetime,timezone
import hashlib,json,uuid
@dataclass
class Candidate:
    id:str
    title:str
    change:dict
    rationale:str
    status:str="proposed"
    evidence:list|None=None
    created_at:str|None=None
class EvolutionController:
    def __init__(self): self.candidates={}; self.audit=[]
    def propose(self,title,change,rationale):
        c=Candidate(str(uuid.uuid4()),title,change,rationale,created_at=datetime.now(timezone.utc).isoformat())
        self.candidates[c.id]=c; self._log("proposed",c.id,{"title":title}); return c
    def validate(self,candidate_id,tests):
        c=self.candidates[candidate_id]
        results=[]
        for name,fn in tests.items():
            try: ok=bool(fn()); detail="passed" if ok else "returned false"
            except Exception as e: ok=False; detail=f"{type(e).__name__}: {e}"
            results.append({"test":name,"passed":ok,"detail":detail})
        c.evidence=results; c.status="validated" if results and all(x["passed"] for x in results) else "rejected"
        self._log(c.status,c.id,{"tests":results}); return {"status":c.status,"tests":results}
    def promote(self,candidate_id,approved_by,apply):
        c=self.candidates[candidate_id]
        if c.status!="validated": raise PermissionError("Only validated candidates can be promoted")
        if not approved_by or not approved_by.strip(): raise PermissionError("Human approver identity required")
        result=apply(c.change)
        c.status="promoted"; self._log("promoted",c.id,{"approved_by":approved_by,"result":str(result)})
        return result
    def _log(self,event,cid,details):
        self.audit.append({"at":datetime.now(timezone.utc).isoformat(),"event":event,"candidate":cid,"details":details})
    def audit_digest(self):
        raw=json.dumps(self.audit,sort_keys=True,separators=(",",":")).encode()
        return hashlib.sha256(raw).hexdigest()
