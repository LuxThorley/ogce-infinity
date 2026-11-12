from __future__ import annotations
from dataclasses import dataclass
from uuid import uuid4

@dataclass(slots=True)
class PlayerProfile:
    player_id: str
    display_name: str
    leadership: int = 0
    tactical: int = 0
    combat: int = 0
    support: int = 0
    strategy: int = 0
    cohesion: int = 0

@dataclass(slots=True)
class RankingRow:
    category: str
    player_id: str
    display_name: str
    score: int
    rank: int = 0

class MultiplayerAuthority:
    def __init__(self) -> None:
        self.players: dict[str, PlayerProfile] = {}

    def register_player(self, display_name: str) -> PlayerProfile:
        p = PlayerProfile(player_id=uuid4().hex, display_name=display_name)
        self.players[p.player_id] = p
        return p

    def apply_stats(self, player_id: str, stats: dict[str, int]) -> None:
        p = self.players[player_id]
        for k, v in stats.items():
            if hasattr(p, k):
                setattr(p, k, getattr(p, k) + int(v))

    def leaderboard(self, category: str) -> list[RankingRow]:
        rows = [RankingRow(category=category, player_id=p.player_id, display_name=p.display_name, score=getattr(p, category)) for p in self.players.values()]
        rows.sort(key=lambda r: (-r.score, r.display_name))
        for i, row in enumerate(rows, start=1):
            row.rank = i
        return rows
