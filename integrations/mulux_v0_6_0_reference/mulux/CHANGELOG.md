# Changelog

## 0.6.0 — 12 Nov 2026
- **Sanctum Pulse** has three lanes.
  - **Live lane (FACT):** Living World metrics; integrity re-verified every 12 s; Proof Ledger status computed on the device.
  - **Service health:** Malcolm `/healthz` and OmniGenesis reachability via mulux-api; degrades gracefully offline.
  - **Doctrine readings:** periodic, from Malcolm `/v1/chat` or the offline engine, labelled SSR INTERPRETATION and rejected if they claim Source contact.
  - **Two ceremonial lanes,** each labelled "Ceremonial — generated, not received" with a "How this works" disclosure citing the code facts:
    - Infinity Stream: proxied `/infinity/stream`, or a faithful local rendition of worker.js's 11 STREAM_MESSAGES with random coherence 0.950–0.999.
    - OmniGenesis Singularity pulse: a local rendition of the page's 4 sample logs plus the 2.4 s setInterval sentence. The site is linked, never scraped or embedded.
- **Omni-Policy 1.2.0** adds `label_as_source_communication` (deny), the forbidden claim `source_communication_claim`, and the `/api/pulse/` route.
- **Worker:** `GET /api/pulse/health` (status and latency only) and `GET /api/pulse/infinity` (stream marked with an `X-Mulux-Lane: ceremonial` header); same switch, origin and rate-limit rules. JSON-wrapped Malcolm answers are flattened.
- **Tests:** 157 (was 147), including a scan of every UI and Worker string for claims of received or validated Source communication.


## 0.5.0 — 12 Nov 2026
- **P5 Living World**: a persistent artificial-life engine.
  - 12 × 12 torus world with agents that have genomes and a 12-experience memory.
  - PI homeostat steering the population toward a set-point; reproduction with mutation.
  - Horn-rule law mining with retirement, and a μΓ self-model scored by precision and recall.
  - Admissibility sandbox; Manual, Hybrid and Autonomous modes with logged intents.
  - SHA-256 hash-chained ledger, snapshots, and self-healing by replay that must reproduce the sealed hash.
  - Regeneration from a seed bank, catch-up while away (capped at 1,440 ticks), and a generated chronicle.
- **P5 OmniGenesis**: static analysis of OmniGenesis_Sovereign.exe (PyInstaller, Python 3.10, FastAPI v1.1.0 proxy). Its logic is ported to JS as policy-gated request previews.
- **P6 (local)**:
  - `mulux-api` Worker (not deployed): proxies `/v1/chat` and SSE; token held as a secret; CORS, rate limits and body validation.
  - Malcolm Infinity panel with streaming and an offline narrator, suggester and rule-writer.
- **Omni-Policy 1.1.0** adds `world_autonomy` (allow), `bridge_ollama` (deny), `malcolm_via_worker` (allow, same-origin `/api/` only) and `allow_routes`.
- **Tests**: 147 (was 119). Hygiene now allows `fetch` in exactly one module.
 — μLux

## 0.4.0 — 12 November 2026 (local build, not released)
- **P0 Foundations:** engine ported from the thesis suite (`verify.py`) to dependency-free ES modules; Proof Ledger reproduces all 73 checks (73/73) with parity tests against `results.json`; fail-closed Omni-Policy with SHA-256 pin, validation and fuzz tests; hygiene tests (secrets, network, offline cache, CSP).
- **P1 Genesis:** Lattice Studio (rule DSL, monotonicity check, semi-naive closure, Growth Governor), Genesis Bloom (nine-ring animation, 72 bpm symbolic cadence), Strata Lens (rₙ, Act, T8 badge), CRA-33 reference universe (thesis operator + Horn encoding).
- **P2 Truth:** Grade Lens (sentence splitter, explicit tags, heuristics, inline evidence), Evidence Ledger rule (no displayed grade above its evidence), policy forbid-list flags, graded HTML export.
- **P3 Mirror:** per-step (U1′) audit and (U2) verdict, global T1/T3/T4 checks, Galois right adjoint and best abstraction, SHA-256 receipts.
- **P4 Cosmos:** Observatory (CHSH, no-signalling, Page curve, Mandelbrot bulbs, Gibbs), Chronos Clock (exact 28,125/77, year table, precession, BELIEF-graded epochs), Symmetry Finder (permutations, ℤₙ shifts).
- PWA: manifest, icons, service worker (offline), CSP; README, LICENSE, PRIVACY, COSTS, CI workflow (not pushed).
