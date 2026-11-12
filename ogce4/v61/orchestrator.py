"""Tool-allowlisted AI orchestration; provider output is never executed directly."""
import json, uuid
from .policy import ActionPolicy
class AgentOrchestrator:
    def __init__(self,provider,tools=None,policy=None,max_calls=8):
        self.provider=provider; self.tools=dict(tools or {}); self.policy=policy or ActionPolicy(); self.max_calls=max_calls
    def assist(self,task,context=None,approved=False,actor_permissions=()):
        if not isinstance(task,str) or not task.strip() or len(task)>12000: raise ValueError("task must be 1..12000 characters")
        result=self.provider.command(task,context or {},approved=False)
        # Provider output is treated strictly as data, not code or a command to execute.
        if not isinstance(result,dict): return {"provider_response":result,"tool_results":[],"status":"advisory_only"}
        proposed=result.get("actions",[])
        if not isinstance(proposed,list): proposed=[]
        outcomes=[]
        for action in proposed[:self.max_calls]:
            if not isinstance(action,dict): continue
            name=action.get("name"); payload=action.get("payload",{})
            decision=self.policy.evaluate(name,payload,approved,actor_permissions)
            if not decision["allowed"]:
                outcomes.append({"action":name,"status":"blocked","reason":decision["reason"]}); continue
            handler=self.tools.get(name)
            if handler is None:
                outcomes.append({"action":name,"status":"blocked","reason":"no_local_handler"}); continue
            try: outcomes.append({"action":name,"status":"completed","result":handler(payload)})
            except Exception as exc: outcomes.append({"action":name,"status":"failed","error":type(exc).__name__})
        return {"provider_response":result.get("response",result.get("message")),"tool_results":outcomes,
                "status":"completed" if all(x["status"] in ("completed","blocked") for x in outcomes) else "partial"}
