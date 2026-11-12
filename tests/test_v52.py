import pytest
from ogce4.v52.planet import generate_planet
from ogce4.v52.ocean_weather import sample_environment
from ogce4.v52.ecosystem import create_ecosystem,step_ecosystem,create_npc
from ogce4.v52.civilization import create_settlement,economy_tick
from ogce4.v52.narrative import generate_quest,chronicle_event
from ogce4.v52.streaming import WorldStreamer,select_lod
from ogce4.v52.universe_sync import SharedWorld,RevisionConflict
from ogce4.v52.adaptive_sim import AdaptiveSimulation,Candidate

def test_planet_reproducible_and_spherical_grid():
 a=generate_planet(seed=3,rings=8,sectors=16); b=generate_planet(seed=3,rings=8,sectors=16)
 assert a==b and len(a["elevation"])==9 and len(a["biomes"][0])==16

def test_planet_resolution_guard():
 with pytest.raises(ValueError): generate_planet(rings=2000,sectors=2000)

def test_weather_is_bounded():
 p=generate_planet(rings=8,sectors=16); e=sample_environment(p,3,2,10)
 assert 0<=e["precipitation"]<=1 and e["weather"] in {"storm","rain","clear"}

def test_ecosystem_bounded_ticks():
 s=create_ecosystem(4)
 for _ in range(5): s=step_ecosystem(s)
 assert s["tick"]==5 and all(0<=v<=1_000_000 for v in s["populations"].values())

def test_npc_and_settlement():
 assert create_npc("n1","Ari")["needs"]["food"]==1
 s=economy_tick(create_settlement("Haven","forest"),"fertile")
 assert s["history"][-1]["event"]=="economy_tick"

def test_quest_seeded(): assert generate_quest(9)==generate_quest(9)

def test_chronicle_length_guard():
 with pytest.raises(ValueError): chronicle_event(1,"lore","x"*501)

def test_streaming_load_unload_and_lod():
 s=WorldStreamer(chunk_size=10,load_radius=1,unload_radius=2); assert len(s.update(0,0)["loaded"])==9
 s.update(100,100); assert len(s.loaded)<=25
 assert select_lod(400)==2

def test_shared_world_revision_conflict():
 w=SharedWorld({"day":1}); a=w.apply(0,{"day":2},"host")
 assert a["revision"]==1
 with pytest.raises(RevisionConflict): w.apply(0,{"day":3},"guest")

def test_shared_world_reserved_keys():
 with pytest.raises(ValueError): SharedWorld().apply(0,{"_private":1},"guest")

def test_adaptive_candidate_approval():
 sim=AdaptiveSimulation(); c=Candidate("tune",{"lod":2},"reduce load")
 assert sim.validate_candidate(c,[lambda x:x["lod"]<4])["status"]=="validated"
 with pytest.raises(PermissionError): sim.promote(c)
 assert sim.promote(c,approved=True)=={"lod":2}
