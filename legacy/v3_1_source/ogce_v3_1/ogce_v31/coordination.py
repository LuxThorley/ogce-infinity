from __future__ import annotations
from dataclasses import dataclass
from statistics import mean

@dataclass(slots=True)
class SquadLink:
    source_id: str
    target_id: str
    trust: int = 50
    cohesion: int = 50
    bandwidth: int = 50

class SquadCoordinator:
    def __init__(self) -> None:
        self.links: dict[tuple[str,str], SquadLink] = {}

    def link(self, source_id: str, target_id: str, trust: int = 50, cohesion: int = 50, bandwidth: int = 50) -> SquadLink:
        link = SquadLink(source_id=source_id, target_id=target_id, trust=trust, cohesion=cohesion, bandwidth=bandwidth)
        self.links[(source_id, target_id)] = link
        return link

    def propagate(self, source_id: str, urgency: int) -> list[dict]:
        out = []
        for (src, tgt), link in self.links.items():
            if src != source_id:
                continue
            score = round((link.trust*0.35)+(link.cohesion*0.35)+(link.bandwidth*0.2)+(urgency*0.1))
            out.append({"target_id": tgt, "score": score, "accepted": score >= 45})
        return out

    def summary(self) -> dict:
        if not self.links:
            return {"avg_trust": 0.0, "avg_cohesion": 0.0}
        trust = [x.trust for x in self.links.values()]
        coh = [x.cohesion for x in self.links.values()]
        return {"avg_trust": mean(trust), "avg_cohesion": mean(coh)}
