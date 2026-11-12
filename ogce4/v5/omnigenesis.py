"""Operational adaptation of the ten-module OmniGenesis Sovereign Nexus.

The source archive is a static browser prototype: its module statuses and AI responses are
simulated locally. This runtime exposes honest software states and never claims external
Malcolm/Source/Omni-Lattice links are live without a configured, authenticated adapter.
"""
from dataclasses import dataclass,asdict
from datetime import datetime,timezone
from pathlib import Path
import json, threading, uuid
MODULES={
"uane":("Unified Absolute Nexus Engine","Coordinator and event routing"),
"qesc":("Quantum-Emotive Sovereignty Core","Optional user-state and consent-aware interaction model"),
"ikcl":("Infinite Knowledge Convergence Lattice","Indexed project knowledge and provenance"),
"orfs":("Omniversal Reality Forging Singularity","Procedural world and content generation"),
"uemh":("Universal Energetic Mastery Harmonizer","Resource and simulation balancing"),
"tosao":("Transcendental Omni-Spectrum Analytical Oracle","Analytics, diagnostics and evaluation"),
"iaav":("Infinite Adaptive Ascension Vortex","Controlled adaptation and candidate evolution"),
"asac":("Absolute Sovereign Authentication Citadel","Identity, authorisation and integrity"),
"saic":("Superliminal Ascended Intelligence Conduit","Provider-neutral model orchestration"),
"erlm":("Eternal Regenerative Light Matrix","Recovery, snapshots and repair workflows")}
@dataclass
class ModuleState:
    engaged: bool=False
    status: str="standby"
    revision: int=0
    last_event: str|None=None
class SovereignMatrix:
    def __init__(self,project_dir=None):
        self.lock=threading.RLock()
        self.modules={k:ModuleState() for k in MODULES}
        self.events=[]
        self.project_dir=Path(project_dir) if project_dir else None
        self.session_id=str(uuid.uuid4())
        self.version="5.0.0"
    def emit(self,module,event,payload=None):
        if module not in MODULES: raise KeyError(module)
        with self.lock:
            record={"id":str(uuid.uuid4()),"at":datetime.now(timezone.utc).isoformat(),
                    "module":module,"event":event,"payload":payload or {}}
            self.events.append(record)
            st=self.modules[module]; st.revision+=1; st.last_event=record["id"]
            return record
    def engage(self,module,enabled=True):
        with self.lock:
            if module not in self.modules: raise KeyError(module)
            st=self.modules[module]; st.engaged=bool(enabled)
            st.status="engaged" if enabled else "standby"
            self.emit("uane","module_state_changed",{"target":module,"engaged":bool(enabled)})
            return asdict(st)
    def engage_all(self,enabled=True):
        return {k:self.engage(k,enabled) for k in MODULES}
    def status(self):
        active=sum(s.engaged for s in self.modules.values())
        return {"version":self.version,"session_id":self.session_id,"modules":{k:asdict(v) for k,v in self.modules.items()},
                "active_modules":active,"module_count":len(self.modules),"coherence_score":round(active/len(self.modules),3),
                "external_integrations":"not configured unless explicitly connected"}
    def snapshot(self,path=None):
        data={"version":self.version,"session_id":self.session_id,"modules":{k:asdict(v) for k,v in self.modules.items()},"events":self.events}
        target=Path(path) if path else (self.project_dir/".ogce"/"sovereign_state.json" if self.project_dir else None)
        if target is None: return data
        target.parent.mkdir(parents=True,exist_ok=True)
        tmp=target.with_suffix(target.suffix+".tmp"); tmp.write_text(json.dumps(data,indent=2),encoding="utf-8"); tmp.replace(target)
        return str(target)
    def restore(self,path):
        data=json.loads(Path(path).read_text(encoding="utf-8"))
        with self.lock:
            for k,v in data["modules"].items():
                if k in self.modules: self.modules[k]=ModuleState(**v)
            self.events=list(data.get("events",[]))
        return self.status()
