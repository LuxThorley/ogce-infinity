from __future__ import annotations
from dataclasses import dataclass
from uuid import uuid4

SAFETY_NOTE = (
    "Biofeedback is limited to consensual, local, player-controlled signals for accessibility and adaptive gameplay. "
    "No telepathy, mind control, or covert neuropsychological manipulation is implemented."
)

@dataclass(slots=True)
class ConsentRecord:
    consent_id: str
    player_id: str
    input_type: str
    granted: bool
    purpose: str

@dataclass(slots=True)
class BiofeedbackSample:
    sample_id: str
    player_id: str
    input_type: str
    focus_level: int
    stress_level: int
    confidence: float

class ConsentManager:
    def __init__(self) -> None:
        self.consents: list[ConsentRecord] = []

    def grant(self, player_id: str, input_type: str, purpose: str) -> ConsentRecord:
        item = ConsentRecord(consent_id=uuid4().hex, player_id=player_id, input_type=input_type, granted=True, purpose=purpose)
        self.consents.append(item)
        return item

    def has_consent(self, player_id: str, input_type: str) -> bool:
        return any(c.player_id == player_id and c.input_type == input_type and c.granted for c in self.consents)

class BiofeedbackAdapter:
    def __init__(self, consent_manager: ConsentManager) -> None:
        self.consent_manager = consent_manager
        self.samples: list[BiofeedbackSample] = []

    def ingest_local_sample(self, player_id: str, input_type: str, focus_level: int, stress_level: int, confidence: float) -> BiofeedbackSample:
        if not self.consent_manager.has_consent(player_id, input_type):
            raise PermissionError("Consent required.")
        sample = BiofeedbackSample(
            sample_id=uuid4().hex,
            player_id=player_id,
            input_type=input_type,
            focus_level=max(0, min(100, focus_level)),
            stress_level=max(0, min(100, stress_level)),
            confidence=max(0.0, min(1.0, confidence)),
        )
        self.samples.append(sample)
        return sample

    def adaptive_hint(self, player_id: str) -> dict:
        samples = [s for s in self.samples if s.player_id == player_id]
        if not samples:
            return {"player_id": player_id, "mode": "neutral", "hint": "No data"}
        latest = samples[-1]
        if latest.stress_level >= 75:
            return {"player_id": player_id, "mode": "de-escalate", "hint": "Reduce encounter intensity."}
        if latest.focus_level >= 75 and latest.stress_level <= 40:
            return {"player_id": player_id, "mode": "enhance", "hint": "Offer advanced tactical prompts."}
        return {"player_id": player_id, "mode": "steady", "hint": "Maintain pacing."}
