"""Auditable helpers for OmniLux Prime Doctrine transfer results T1–T8."""
from .cra import active_strata,restrict,project_actuality,epsilon_filter,feature_map,euclidean,STRATA
def chain_local_transfer(gamma,realise,abstract,limit=10000):
    x=frozenset(); y=frozenset(); rows=[]
    for i in range(limit):
        gx=frozenset(gamma(x)); fx=frozenset(realise(x))
        lhs=frozenset(realise(gx)); rhs=frozenset(abstract(fx))
        rows.append({"step":i,"commutes":lhs==rhs,"source_size":len(x),"image_size":len(fx)})
        if lhs!=rhs: return {"holds":False,"rows":rows,"reason":"commutation fails on generated chain"}
        if gx==x:
            y=frozenset(abstract(y))
            # independently compute abstract least fixed point from bottom
            z=frozenset()
            for _ in range(limit):
                zn=frozenset(abstract(z))
                if zn==z: break
                if not z<=zn: return {"holds":False,"rows":rows,"reason":"abstract iteration not inflationary"}
                z=zn
            return {"holds":fx==z,"image_lfp":sorted(fx),"abstract_lfp":sorted(z),"rows":rows}
        if not x<=gx: return {"holds":False,"rows":rows,"reason":"source chain not increasing"}
        x=gx
    raise RuntimeError("iteration limit reached")
def restriction_actuality_coherent(state,n):
    return active_strata(restrict(state,n))==project_actuality(active_strata(state),n)
def galois_connection_holds(concrete,abstract,alpha,gamma):
    for x in concrete:
        for y in abstract:
            if ((alpha(x)<=y)!=(x<=gamma(y))): return False
    return True
def lax_transfer_holds(states,gamma,realise,abstract):
    return all(frozenset(abstract(realise(x)))<=frozenset(realise(gamma(x))) for x in states)
def sound_transfer_holds(states,gamma,realise,abstract):
    return all(frozenset(realise(gamma(x)))<=frozenset(abstract(realise(x))) for x in states)
def recoverability_report(states,predicate,epsilon=.5):
    """Sufficiency check: K must be constant on every pair accepted by the declared filter."""
    accepted=0
    for a in states:
        for b in states:
            if epsilon_filter(a,b,epsilon):
                accepted+=1
                if predicate(a)!=predicate(b): return {"sufficient":False,"counterexample":[sorted(a),sorted(b)],"accepted_pairs_checked":accepted}
    return {"sufficient":True,"accepted_pairs_checked":accepted}
def restriction_audit(states):
    checked=0
    for state in states:
        for n in range(len(STRATA)):
            checked+=1
            if not restriction_actuality_coherent(state,n): return {"holds":False,"checked":checked,"counterexample":[sorted(state),n]}
    return {"holds":True,"checked":checked}

def _all_subsets(atoms):
    atoms=tuple(atoms)
    if len(atoms)>12: raise ValueError("Exhaustive finite theorem audit capped at 12 atoms")
    for mask in range(1<<len(atoms)):
        yield frozenset(atoms[i] for i in range(len(atoms)) if mask>>i&1)
def t1_global_transfer_audit(atoms,gamma,realise,abstract):
    """Finite-carrier audit of T1 hypotheses and conclusion."""
    states=list(_all_subsets(atoms))
    bottom=frozenset()
    join_preserving=realise(bottom)==bottom
    for x in states:
        for y in states:
            if realise(x|y)!=(realise(x)|realise(y)): join_preserving=False; break
        if not join_preserving: break
    commuting=all(frozenset(realise(gamma(x)))==frozenset(abstract(realise(x))) for x in states)
    monotone_source=all(gamma(x)<=gamma(y) for x in states for y in states if x<=y)
    image_states=[frozenset(realise(x)) for x in states]
    monotone_abstract=all(abstract(x)<=abstract(y) for x in image_states for y in image_states if x<=y)
    src=_lfp_finite(gamma); dst=_lfp_finite(abstract)
    return {"join_preserving":join_preserving,"global_commutation":commuting,
            "source_monotone":monotone_source,"abstract_monotone":monotone_abstract,
            "transfer":frozenset(realise(src))==frozenset(dst),"source_lfp":sorted(src),"abstract_lfp":sorted(dst)}
def _lfp_finite(op,limit=10000):
    x=frozenset()
    for _ in range(limit):
        y=frozenset(op(x))
        if y==x: return x
        if not x<=y: raise ValueError("operator iteration not inflationary")
        x=y
    raise RuntimeError("fixed point iteration limit exceeded")
def t5_reciprocity_audit(atoms,gamma,automorphism):
    states=list(_all_subsets(atoms))
    images=[frozenset(automorphism(x)) for x in states]
    bijective=len(set(images))==len(states)
    order_preserving=all(automorphism(x)<=automorphism(y) for x in states for y in states if x<=y)
    commutes=all(automorphism(gamma(x))==gamma(automorphism(x)) for x in states)
    mu=_lfp_finite(gamma)
    return {"order_automorphism":bijective and order_preserving,"commutes":commutes,
            "least_fixed_point_invariant":frozenset(automorphism(mu))==mu}
def t7_embedding_possible(fibre_zero_infinite=False,fibre_one_infinite=False):
    """Theorem criterion: a proper K-preserving self-embedding exists iff some fibre is infinite."""
    return bool(fibre_zero_infinite or fibre_one_infinite)
