# μLux build phases and exit tests

| Phase | Delivered | Exit test (automated) |
|---|---|---|
| P0 Scaffold | PWA shell, CSP, service worker, Proof Ledger (73 checks), Omni-Policy | 73/73 checks match `fixtures/results.json`; policy pin, tamper and 500-case fuzz all fail closed; no secrets, no network APIs, SW caches every asset |
| P1 Genesis | Lattice engine + DSL, Genesis Bloom, Lattice Studio, Strata Lens | CRA-33 μΓ = 31 atoms in 9 steps (staged and Horn agree); 144,000-atom chain closes < 12,320 ms; T8 holds on all 543 × 9 subset/level pairs |
| P2 Truth | Grade Lens, forbidden-claim flags, graded export | 10,000-claim property test: no displayed grade exceeds its evidence |
| P3 Mirror | Transfer audit, Galois adjoint, receipts | Tables 2, 3, 4 reproduce the thesis exactly; 16 realisations certified; receipts verify and detect tampering |
| P4 Cosmos | Observatory, Chronos Clock, Symmetry Finder | CHSH = 2√2, classical max 2; 28125/77 = 365.(259740); T5 symmetries commute with Γ |
| P5 Life | Living World engine and UI | Deterministic replay; homeostasis deviation < 0.35 with the controller versus > 2 without; laws learned; self-model precision ≥ 0.95; sandbox; ledger, corruption detection and verified heal; Governor caps (10 tests) |
| P5 OmniGenesis | Static analysis and JS port | Every recovered function reproduces main.py's semantics; the bridge is deny-only (9 tests) |
| P6 local | mulux-api Worker, Malcolm client, offline engine | Mocked Malcolm: proxying, SSE, fail-closed paths, rate limits, redaction, end-to-end client, offline fallback (9 tests) |

Still not built: Covenant Scroll and Intention Lab. Deploying the Worker or Pages needs Oliver's YES.
| v0.6 Pulse | Sanctum Pulse (truthful lane + 2 ceremonial lanes), Source-claim guard, Worker pulse routes | Faithful renditions, guard detects claims and allows negations, policy denies Source labelling, string scan finds 0 claims, Worker probes relay no content, client e2e and offline degradation, doctrine readings (10 tests) |
