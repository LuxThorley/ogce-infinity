"""Reproducible v5.0 verification harness for the documented CRA reference model."""
from .cra import *
from .formal import restriction_audit
def run_audit():
    cra=run_cra(); mu=cra["fixed_point"]
    checks={}
    checks["carrier_has_33_atoms"]=len(ATOMS)==33
    checks["fixed_point_has_31_atoms"]=len(mu)==31
    checks["ungenerated_atoms_are_exact"]=mu.isdisjoint(UNGENERATED) and len(ATOMS-mu)==2
    checks["totality_marker_generated"]=TOTALITY in mu
    checks["least_fixed_point_is_fixed"]=gamma(mu)==mu
    checks["iteration_has_9_transitions"]=cra["steps"]-1==9
    # Exhaustive monotonicity over the 4-atom illustrative toy, then sampled CRA extensions.
    toy=frozenset("abcd")
    def toy_gamma(x):
        return frozenset({"a"}|({"b"} if "a" in x else set())|
            ({"c"} if ("b" in x or "d" in x) else set())|
            ({"d"} if "d" in x else set()))
    from .lattice import check_monotone_exhaustive
    checks["toy_monotonicity_exhaustive"]=check_monotone_exhaustive(toy,toy_gamma)["monotone"]
    states=[frozenset(),mu,ATOMS]+[frozenset({a}) for a in sorted(ATOMS)]
    checks["restriction_actuality_T8"]=restriction_audit(states)["holds"]
    # T6's documented non-transitivity witness: A~B and B~C but not A~C.
    a=mu; b=mu-{"M0:observable"}; c=mu-{"M0:observable","M0:relation"}
    d_ab=euclidean(feature_map(a),feature_map(b)); d_bc=euclidean(feature_map(b),feature_map(c)); d_ac=euclidean(feature_map(a),feature_map(c))
    checks["epsilon_filter_nontransitivity_witness"]=d_ab<=.5 and d_bc<=.5 and d_ac>.5
    checks["indexical_filter_counterexample"]=epsilon_filter(mu,mu-{"act:indexical"}) and ("act:indexical" in mu)!=("act:indexical" in (mu-{"act:indexical"}))
    return {"suite":"OGCE v5.0 CRA audit","checks":checks,"passed":sum(checks.values()),"failed":sum(not v for v in checks.values()),
            "cra":{"carrier":len(ATOMS),"fixed_point":len(mu),"transitions":cra["steps"]-1,"trace_sizes":[len(x) for x in cra["trace"]]},
            "limitations":["The full 33-atom power set is not exhaustively enumerated (2^33 states).",
            "CRA labels are formal model strata, not demonstrated physical dimensions or timeline operations."]}
