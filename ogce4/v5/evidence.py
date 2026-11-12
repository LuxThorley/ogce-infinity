"""Claim grading and provenance records inspired by the OmniLux epistemic method."""
from dataclasses import dataclass,asdict
from datetime import datetime,timezone
GRADES={"FACT","INFERENCE","SPECULATION","BELIEF","SSR INTERPRETATION","OPEN CONJECTURE"}
@dataclass
class EvidenceRecord:
    claim:str
    grade:str
    source:str
    method:str
    status:str="unverified"
    def __post_init__(self):
        if self.grade not in GRADES: raise ValueError(f"Unknown evidence grade: {self.grade}")
        if not self.claim.strip() or not self.source.strip(): raise ValueError("claim and source required")
def record_dict(record):
    return {**asdict(record),"recorded_at":datetime.now(timezone.utc).isoformat()}
