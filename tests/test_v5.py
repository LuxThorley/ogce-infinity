import json, time
import pytest
from ogce4.v5.cra import *
from ogce4.v5.audit import run_audit
from ogce4.v5.formal import chain_local_transfer,restriction_audit
from ogce4.v5.omnigenesis import SovereignMatrix,MODULES
from ogce4.v5.evolution import EvolutionController
from ogce4.v5.token_service import issue_token,verify_token
from ogce4.v5.worldgen import generate_world
from ogce4.v5.evidence import EvidenceRecord

def test_cra_reproduces_documented_fixed_point():
    r=run_cra()
    assert len(ATOMS)==33 and len(r["fixed_point"])==31
    assert r["steps"]-1==9
    assert ATOMS-r["fixed_point"]==UNGENERATED
    assert gamma(r["fixed_point"])==r["fixed_point"]

def test_cra_audit_passes():
    r=run_audit()
    assert r["failed"]==0, r

def test_t8_restriction_actuality():
    mu=run_cra()["fixed_point"]
    assert restriction_audit([mu,ATOMS,frozenset()])["holds"]

def test_t6_nontransitive_filter_is_not_equivalence():
    mu=run_cra()["fixed_point"]
    a=mu; b=mu-{"M0:observable"}; c=mu-{"M0:observable","M0:relation"}
    assert epsilon_filter(a,b) and epsilon_filter(b,c) and not epsilon_filter(a,c)

def test_matrix_state_is_real_and_persistable(tmp_path):
    m=SovereignMatrix(tmp_path)
    assert m.status()["active_modules"]==0
    m.engage_all()
    assert m.status()["active_modules"]==10
    f=m.snapshot(); m2=SovereignMatrix(); m2.restore(f)
    assert m2.status()["active_modules"]==10

def test_worldgen_deterministic():
    a=generate_world(seed=21,width=8,height=8,poi_count=4)
    b=generate_world(seed=21,width=8,height=8,poi_count=4)
    assert a==b and len(a["points_of_interest"])==4

def test_evolution_requires_validation_and_human_approval():
    e=EvolutionController(); c=e.propose("Improve terrain",{"roughness":.4},"benchmark result")
    with pytest.raises(PermissionError): e.promote(c.id,"operator",lambda x:x)
    assert e.validate(c.id,{"regression":lambda:True})["status"]=="validated"
    with pytest.raises(PermissionError): e.promote(c.id,"",lambda x:x)
    assert e.promote(c.id,"operator",lambda x:"applied")=="applied"

def test_token_is_signed_scoped_and_expires():
    token=issue_token("x"*40,"player-1",["world:read"],ttl_seconds=60)
    assert verify_token("x"*40,token,"world:read")["valid"]
    assert not verify_token("y"*40,token)["valid"]
    assert not verify_token("x"*40,token,"admin")["valid"]
    assert not verify_token("x"*40,token,now=int(time.time())+61)["valid"]

def test_evidence_grades_enforced():
    EvidenceRecord("A finite model converged","FACT","CRA","recomputed")
    with pytest.raises(ValueError): EvidenceRecord("claim","MAGIC","source","method")

def test_t1_global_transfer_and_t2_chain_transfer():
    from ogce4.v5.formal import t1_global_transfer_audit
    def g(x): return frozenset({"a"} | ({"b"} if "a" in x else set()))
    result=t1_global_transfer_audit({"a","b"},g,lambda x:x,g)
    assert result["join_preserving"] and result["global_commutation"] and result["transfer"]
    chain=chain_local_transfer(g,lambda x:x,g)
    assert chain["holds"]

def test_t5_reciprocity_and_t7_fibre_criterion():
    from ogce4.v5.formal import t5_reciprocity_audit,t7_embedding_possible
    # Symmetric two-atom closure; swap a<->b commutes with the operator.
    def g(x): return frozenset(x)|frozenset({"a","b"})
    def swap(x): return frozenset({"b" if z=="a" else "a" if z=="b" else z for z in x})
    r=t5_reciprocity_audit({"a","b"},g,swap)
    assert r["order_automorphism"] and r["commutes"] and r["least_fixed_point_invariant"]
    assert not t7_embedding_possible()
    assert t7_embedding_possible(fibre_zero_infinite=True)

def test_t3_t4_order_bounds():
    from ogce4.v5.formal import lax_transfer_holds,sound_transfer_holds
    states=[frozenset(),frozenset({"a"}),frozenset({"b"}),frozenset({"a","b"})]
    def g(x): return frozenset(x)|frozenset({"a"})
    identity=lambda x:frozenset(x)
    assert lax_transfer_holds(states,g,identity,g)
    assert sound_transfer_holds(states,g,identity,g)
