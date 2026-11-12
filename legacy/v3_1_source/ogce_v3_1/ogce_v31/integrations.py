from __future__ import annotations
from dataclasses import dataclass, field

BOUNDARY = "Integrations model content, simulation, analytics, and orchestration only; no physical-world control."

@dataclass(slots=True)
class SourceAdapter:
    enabled: bool = True
    capabilities: list[str] = field(default_factory=lambda: ["simulation_sync","event_ingest"])

@dataclass(slots=True)
class OmniLatticeAdapter:
    enabled: bool = True
    modes: list[str] = field(default_factory=lambda: ["art_to_gameplay","gameplay_to_art","creative_feedback_loop","symbolic_resonance"])

@dataclass(slots=True)
class MalcolmAIDaemonAdapter:
    enabled: bool = True
    channels: list[str] = field(default_factory=lambda: ["orchestration","strategy","analytics","content_guidance"])

class IntegrationManifest:
    def build(self) -> dict:
        return {
            "source": SourceAdapter().__dict__,
            "omni_lattice": OmniLatticeAdapter().__dict__,
            "malcolm_ai_daemon": MalcolmAIDaemonAdapter().__dict__,
            "boundary": BOUNDARY,
        }
