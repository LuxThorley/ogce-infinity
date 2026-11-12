"""Bounded simulation scheduler and candidate evolution gate."""
from dataclasses import dataclass
@dataclass
class Candidate:
    name:str
    changes:dict
    rationale:str
    status:str="proposed"
class AdaptiveSimulation:
    def __init__(self,max_steps=1000): self.max_steps=max_steps; self.metrics={}
    def run(self,world,step_fn,steps):
        if not 0<=steps<=self.max_steps: raise ValueError("simulation step budget exceeded")
        state=world
        for _ in range(steps): state=step_fn(state)
        self.metrics={"steps":steps,"completed":True}
        return state
    def validate_candidate(self,candidate,validators):
        outcomes=[]
        for validator in validators:
            try: outcomes.append(bool(validator(candidate.changes)))
            except Exception: outcomes.append(False)
        candidate.status="validated" if outcomes and all(outcomes) else "rejected"
        return {"status":candidate.status,"checks":outcomes}
    def promote(self,candidate,approved=False):
        if candidate.status!="validated" or not approved: raise PermissionError("candidate requires successful validation and explicit approval")
        candidate.status="promoted"; return candidate.changes
