"""Provider-neutral, policy-gated agent and room orchestration primitives."""
from dataclasses import dataclass, field
from .mulux import decide

@dataclass
class AgentIntent:
    agent_id: str
    action: str
    rationale: str
    confidence: float
    requires_approval: bool = False

@dataclass
class Room:
    world_id: str
    members: set[str] = field(default_factory=set)
    sequence: int = 0
    def join(self, player_id: str):
        if not player_id or len(player_id) > 80: raise ValueError("invalid_player_id")
        self.members.add(player_id); self.sequence += 1
        return {"type":"room_joined","world":self.world_id,"members":len(self.members),"sequence":self.sequence}

class AgentGovernor:
    def review(self, intent: AgentIntent, owner_yes: bool = False):
        action = intent.action
        decision = decide(action, owner_yes=owner_yes)
        if intent.confidence < 0 or intent.confidence > 1:
            return {"decision":"deny","reason":"confidence_out_of_range"}
        if intent.requires_approval and not owner_yes:
            return {"decision":"needs_owner_yes","reason":"intent requires owner approval"}
        return decision
