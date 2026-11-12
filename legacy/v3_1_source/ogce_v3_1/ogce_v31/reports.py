from __future__ import annotations
from dataclasses import dataclass
from statistics import mean

@dataclass(slots=True)
class AfterActionReport:
    title: str
    summary: str
    highlights: list[str]
    recommendations: list[str]

class ReportBuilder:
    def build(self, mode: str, stats: dict[str, dict], cohesion_scores: list[int]) -> AfterActionReport:
        avg_combat = mean([int(v.get("combat", 0)) for v in stats.values()]) if stats else 0.0
        avg_leadership = mean([int(v.get("leadership", 0)) for v in stats.values()]) if stats else 0.0
        avg_cohesion = mean(cohesion_scores) if cohesion_scores else 0.0
        highlights = [
            f"Mode: {mode}",
            f"Average combat: {avg_combat:.2f}",
            f"Average leadership: {avg_leadership:.2f}",
            f"Average cohesion: {avg_cohesion:.2f}",
        ]
        recommendations = []
        if avg_cohesion < 50:
            recommendations.append("Improve cohesion through clearer squad command routing.")
        if avg_leadership < 50:
            recommendations.append("Encourage more distributed tactical callouts.")
        if not recommendations:
            recommendations.append("Maintain current command structure and raise encounter complexity.")
        return AfterActionReport(
            title="After Action Summary",
            summary="Automated multiplayer review with leadership, combat, and cohesion signals.",
            highlights=highlights,
            recommendations=recommendations,
        )
