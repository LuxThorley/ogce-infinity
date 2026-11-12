from ogce_v31.metaphysics_engine import MetaphysicsEngine

def test_metaphysics():
    m = MetaphysicsEngine()
    m.add_node("A", "astral")
    m.add_rule("astral", "mnemonic", "projection", 30)
    m.manifest_event("E", "astral", 70)
    s = m.summarize()
    assert s["ontology_nodes"] == 1
