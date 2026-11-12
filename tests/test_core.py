from ogce4.metaphysics import SymbolicMetaphysics
from ogce4.multiplayer import MultiplayerAuthority
from ogce4.biofeedback import LocalBiofeedback
def test_symbolic_seed():
 m=SymbolicMetaphysics();a=m.synthesize(9,"dream_logic",{});b=m.synthesize(9,"dream_logic",{})
 assert a["geometry"]==b["geometry"] and a["resonance"]==b["resonance"]
def test_scores():
 m=MultiplayerAuthority();p=m.register("A");m.award(p.id,"combat",4);assert m.leaderboard("combat")[0]["score"]==4
def test_consent():
 b=LocalBiofeedback()
 try:b.ingest("x","pulse",50,50)
 except PermissionError:pass
 else:assert False
