from __future__ import annotations
from dataclasses import dataclass, field

@dataclass(slots=True)
class CheatSignal:
    signal_type: str
    severity: int
    evidence: list[str] = field(default_factory=list)

class AntiCheatHooks:
    def inspect(self, combat_score: int, command_rate: int) -> list[CheatSignal]:
        out: list[CheatSignal] = []
        if combat_score > 100:
            out.append(CheatSignal(signal_type="combat_outlier", severity=70, evidence=["combat_score_above_expected_range"]))
        if command_rate > 30:
            out.append(CheatSignal(signal_type="macro_command_rate", severity=55, evidence=["command_rate_above_expected_range"]))
        return out
