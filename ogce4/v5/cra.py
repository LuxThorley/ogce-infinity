"""OmniLux Prime Doctrine's finite 33-atom CRA demonstration, implemented as a software model.

The M∞ label denotes a completion marker in this finite model, not a literal infinite
carrier or a physical timeline mechanism.
"""
from .lattice import kleene_lfp
FINITE_STRATA=("M0","M1","M2","M3","M4","M5","M6","M7+")
STRATA=FINITE_STRATA+("M∞",)
STRATA_LABELS={
"M0":"Pre-geometric proto-regularity","M1":"Biological / ecological",
"M2":"Chemical / molecular","M3":"Physical spacetime",
"M4":"Quantum / information","M5":"Quantum gravity / unified field",
"M6":"Cosmological multiverse","M7+":"Meta-mathematical / transcendent",
"M∞":"Infinite / Absolute (limit marker)"}
TOTALITY="M∞:totality"
AXIOMS=frozenset({"source:Gamma_C","constraint:monotonicity","M0:primitive"})
UNGENERATED=frozenset({"timeline:aperiodic","act:non-indexical"})
FINITE_ATOMS=frozenset(f"{s}:{k}" for s in FINITE_STRATA for k in ("primitive","relation","observable"))
ATOMS=frozenset(
    [f"{s}:{k}" for s in FINITE_STRATA for k in ("primitive","relation","observable")]
    +["constraint:CLAAL","constraint:monotonicity","constraint:recoverability",
      "timeline:periodic","act:indexical","source:Gamma_C",TOTALITY]
    +list(UNGENERATED))
assert len(ATOMS)==33

def gamma(state):
    """The exact finite Horn-style rule composition described in the Doctrine."""
    z=set(state)|set(AXIOMS)
    def full(s):
        return TOTALITY in z if s=="M∞" else {f"{s}:primitive",f"{s}:relation",f"{s}:observable"}<=z
    adv={f"{FINITE_STRATA[i+1]}:primitive" for i in range(len(FINITE_STRATA)-1) if full(FINITE_STRATA[i])}
    if FINITE_ATOMS<=z: adv.add(TOTALITY)
    z |= adv
    for i,s in enumerate(FINITE_STRATA):
        if f"{s}:primitive" in z:
            z |= {f"{s}:relation",f"{s}:observable"}
            if i>0: z.add(f"{STRATA[i-1]}:relation")
    if any(e.startswith("M1:") for e in z):
        z |= {"constraint:CLAAL","constraint:recoverability"}
    if any(e.startswith("M3:") for e in z):
        z |= {"act:indexical","timeline:periodic"}
    return frozenset(z)&ATOMS

def run_cra():
    result=kleene_lfp(gamma,bottom=AXIOMS)
    return {**result,"seed":sorted(AXIOMS),"universe_size":len(ATOMS),"fixed_point_size":len(result["fixed_point"]),
            "strata":list(STRATA),"axioms":sorted(AXIOMS),
            "ungenerated":sorted(UNGENERATED),"totality_marker":TOTALITY}

def active_strata(state):
    return frozenset(s for s in STRATA if any(a.startswith(s+":") for a in state))
def restrict(state,n):
    if not 0<=n<len(STRATA): raise ValueError("stratum index must be 0..8")
    allowed=set(STRATA[:n+1])
    return frozenset(a for a in state if a.split(":",1)[0] in allowed)
def project_actuality(actuality,n):
    return frozenset(actuality)&frozenset(STRATA[:n+1])
def feature_map(state):
    values=[sum(a.startswith(s+":") for a in state)/3.0 for s in FINITE_STRATA]
    values += [float(TOTALITY in state),float("constraint:CLAAL" in state),float("source:Gamma_C" in state)]
    return tuple(values)
def euclidean(a,b):
    if len(a)!=len(b): raise ValueError("Feature vectors must have equal dimensions")
    return sum((x-y)**2 for x,y in zip(a,b))**0.5
def epsilon_filter(a,b,epsilon=0.5):
    if epsilon<0: raise ValueError("epsilon must be non-negative")
    return active_strata(a)==active_strata(b) and euclidean(feature_map(a),feature_map(b))<=epsilon
