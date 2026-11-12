# OGCE v5.0 architecture

## Three-source integration

1. OGCE v4.1 remains the game-engine foundation (Panda3D renderer, editor, PBR descriptors, glTF inspection, terrain, profiling, content pipeline and platform QA).
2. OmniGenesis Sovereign contributes the ten-core product vocabulary and shared-matrix interaction pattern. The supplied ZIP is a static browser prototype, not a verified live AI or remote-service implementation.
3. OmniLux Prime contributes formal finite-lattice computation, the CRA 33-atom model, nine named strata, least-fixed-point generation, transfer/restriction ideas, and epistemic grading.

## Runtime flow

```text
Creator / Game Runtime
        |
        v
UANE coordinator ---- Event log / snapshots
        |
        +-- QESC  consent-aware interaction state
        +-- IKCL  project knowledge index (extension point)
        +-- ORFS  procedural world generator
        +-- UEMH  simulation/resource balancing (extension point)
        +-- TOSAO diagnostics and metrics
        +-- IAAV controlled evolution proposals
        +-- ASAC identity/policy boundary
        +-- SAIC provider-neutral model adapter
        +-- ERLM recovery/snapshot workflow
        |
        v
CRA / formal validation / evidence provenance
        |
        v
Sandbox -> tests -> named human approval -> promotion / rollback
```

## Core engineering contracts

- State is local by default; no remote service is contacted.
- Module events have unique IDs and UTC timestamps.
- Snapshots are JSON and atomically replaced.
- Generated worlds are deterministic for a given seed and generator version.
- Adaptation proposals cannot be promoted before validation and a non-empty human approver identity.
- AI provider and remote OmniGenesis adapters are abstract contracts only.
- Token issuance requires an explicit secret of at least 32 characters and a finite TTL.

## Formal model and theorem boundaries

The finite powerset lattice is `P(U)` for the declared 33-atom CRA carrier. `gamma` is the Doctrine's Horn-style operator. `run_cra()` starts from the declared axiom seed and records the nine strict transitions reported by Appendix B; `kleene_lfp(gamma)` can also be called from `∅`, in which case the operator's unconditional axiom injection is an additional first transition.

T1/T2 require the stated join-preservation / chain commutation hypotheses. T3/T4 are inequality results with their respective assumptions. T5 requires an order automorphism commuting with the operator. T6 is conditional and explicitly demonstrates that epsilon-filter indistinguishability is not transitive. T7 is a theorem about infinite fibres; a finite runtime does not prove its infinite-domain direction. T8 is implemented as restriction/actuality projection and tested on selected states.

## Source-app audit

The original JS app:
- initialises all ten modules as engaged;
- randomises per-module load values;
- computes coherence using a heuristic formula;
- produces canned local response strings rather than model inference;
- does not call a configured Malcolm AI or Omni-Lattice endpoint;
- creates JWT-like strings with a random, non-cryptographic signature;
- has a Cloudflare token endpoint that explicitly returns an unsigned demonstration payload.

v5 preserves that code as reference and supplies a truthful local runtime plus a separate cryptographic token helper. The reference app should not be deployed as an identity provider.
