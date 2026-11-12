import tempfile
from pathlib import Path
import pytest
from ogce4.v82 import LivingWorld82, WorldError
from ogce4.v82.persistence import WorldStore82

def test_character_spell_celestial_and_ledger():
    w=LivingWorld82(42)
    c=w.create_character("seer","Seer",birth_cycle=3,path="hybrid")
    assert c["id"]=="seer"
    result=w.cast("seer","verdant_mend")
    assert result["character"]["mana"]==50
    assert w.celestial_reading("seer")["disclaimer"].startswith("Fictional")
    assert w.verify_ledger()

def test_research_requires_repeated_matching_observation():
    w=LivingWorld82()
    w.create_character("scholar","Scholar","", "scientific") if False else w.create_character("scholar","Scholar",0,"scientific")
    r=w.submit_hypothesis("scholar","Crystal resonance","physics","A measurable resonance occurs.")
    w.experiment("scholar",r["id"],"resonance=4",False)
    final=w.experiment("scholar",r["id"],"resonance=4",True)
    assert final["reproducible"] is True
    assert final["status"]=="supported_in_simulation"

def test_invention_prerequisites_and_unlock():
    w=LivingWorld82()
    w.create_character("maker","Maker",0,"hybrid")
    w.train("maker","engineering",10)
    assert w.invent("maker","windmill")["status"]=="invented"
    with pytest.raises(WorldError):
        w.invent("maker","automata")

def test_persistence_roundtrip(tmp_path):
    db=tmp_path/"world.sqlite"
    store=WorldStore82(db); w=LivingWorld82(99)
    w.create_character("hero","Hero")
    store.save("realm",w)
    loaded=LivingWorld82.from_record(store.load("realm"))
    assert loaded.snapshot()["characters"][0]["id"]=="hero"
    assert loaded.verify_ledger()

def test_invalid_identifiers_and_mana_are_rejected():
    w=LivingWorld82()
    with pytest.raises(WorldError): w.create_character("../bad","Bad")
    w.create_character("mage","Mage",0,"arcane")
    w.characters["mage"]["mana"]=0
    with pytest.raises(WorldError): w.cast("mage","ember_bolt")
