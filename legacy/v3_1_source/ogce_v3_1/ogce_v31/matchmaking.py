from __future__ import annotations
from dataclasses import dataclass
from uuid import uuid4

@dataclass(slots=True)
class QueueEntry:
    player_id: str
    skill: int
    preferred_mode: str
    region: str

@dataclass(slots=True)
class MatchCandidate:
    candidate_id: str
    mode: str
    region: str
    players: list[str]

class Matchmaker:
    def __init__(self) -> None:
        self.queue: list[QueueEntry] = []

    def enqueue(self, player_id: str, skill: int, preferred_mode: str, region: str) -> QueueEntry:
        item = QueueEntry(player_id=player_id, skill=skill, preferred_mode=preferred_mode, region=region)
        self.queue.append(item)
        return item

    def form_match(self, mode: str, region: str, size: int) -> MatchCandidate | None:
        eligible = [x for x in self.queue if x.preferred_mode == mode and x.region == region]
        if len(eligible) < size:
            return None
        selected = eligible[:size]
        for item in selected:
            self.queue.remove(item)
        return MatchCandidate(candidate_id=uuid4().hex, mode=mode, region=region, players=[x.player_id for x in selected])
