"""Finite powerset lattices, monotone operators and Kleene least-fixed-point iteration."""
from dataclasses import dataclass
from typing import Callable, FrozenSet, Iterable
State = FrozenSet[str]

@dataclass(frozen=True)
class HornRule:
    requires: frozenset[str]
    produces: frozenset[str]
    name: str = "rule"
    def apply(self, state: State) -> State:
        return state | self.produces if self.requires <= state else state

class FinitePowerset:
    def __init__(self, atoms: Iterable[str]):
        items=tuple(atoms)
        self.atoms=frozenset(items)
        if len(self.atoms)!=len(items): raise ValueError("Duplicate atoms")
    @property
    def bottom(self): return frozenset()
    @property
    def top(self): return self.atoms
    def join(self, states): return frozenset().union(*states)
    def meet(self, states): return frozenset.intersection(*states) if states else self.top
    def contains(self, state): return state <= self.atoms

def kleene_lfp(operator: Callable[[State],State], bottom= frozenset(), max_steps=100000):
    """Return trace including X0 and the first stable state."""
    trace=[frozenset(bottom)]
    for _ in range(max_steps):
        nxt=frozenset(operator(trace[-1]))
        if nxt==trace[-1]: return {"fixed_point":nxt,"trace":trace+[nxt],"steps":len(trace),"converged":True}
        if not trace[-1] <= nxt:
            raise ValueError("Operator iteration is not inflationary on this trace; monotonicity alone does not imply this.")
        trace.append(nxt)
    return {"fixed_point":None,"trace":trace,"steps":len(trace)-1,"converged":False}

def check_monotone_exhaustive(atoms, operator, max_atoms=16):
    atoms=tuple(atoms)
    if len(atoms)>max_atoms: raise ValueError(f"Exhaustive check capped at {max_atoms} atoms")
    n=1<<len(atoms); states=[frozenset(atoms[i] for i in range(len(atoms)) if mask>>i&1) for mask in range(n)]
    for x in states:
        gx=frozenset(operator(x))
        for y in states:
            if x<=y and not gx<=operator(y): return {"monotone":False,"counterexample":[sorted(x),sorted(y)]}
    return {"monotone":True,"states":n,"comparable_pairs":sum(1 for x in states for y in states if x<=y)}

def check_inflationary_exhaustive(atoms, operator, max_atoms=16):
    atoms=tuple(atoms)
    if len(atoms)>max_atoms: raise ValueError("Exhaustive check capped")
    for mask in range(1<<len(atoms)):
        x=frozenset(atoms[i] for i in range(len(atoms)) if mask>>i&1)
        if not x<=operator(x): return False
    return True
