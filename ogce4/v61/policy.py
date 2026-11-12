"""Local policy gate for remote AI suggestions and consequential engine actions."""
from dataclasses import dataclass, field
@dataclass
class ActionPolicy:
    allowed_actions: set = field(default_factory=lambda:{"world.read","npc.suggest","quest.draft","dialogue.draft","simulation.analyse"})
    approval_required: set = field(default_factory=lambda:{"world.write","economy.transfer","civilization.declare_conflict","player.grant_item","system.optimize"})
    max_payload_chars: int = 32000
    def evaluate(self,action,payload,approved=False,actor_permissions=()):
        import json
        if action not in self.allowed_actions and action not in self.approval_required:
            return {"allowed":False,"reason":"action_not_allowlisted"}
        if len(json.dumps(payload,default=str))>self.max_payload_chars:
            return {"allowed":False,"reason":"payload_limit_exceeded"}
        if action in self.approval_required and not approved:
            return {"allowed":False,"reason":"explicit_approval_required"}
        if action in self.approval_required and "admin" not in actor_permissions:
            return {"allowed":False,"reason":"admin_permission_required"}
        return {"allowed":True,"reason":"policy_approved"}
