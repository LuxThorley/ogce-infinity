# OGCE Infinity v8.0 — The Living Omniverse

## Release intent
v8.0 combines the retained v7.7 online cross-platform game foundation with compatible μLux v0.6.0
mechanisms and a first set of scalable-world foundations. It is an evolutionary software release,
not a claim of limitless capability or machine consciousness.

## Integrated capabilities
1. Retained browser WebGL world, exploration, survival, combat, crafting, quests, PWA, account and
   session foundation, HTTP API, WebSocket service and deployment assets from v7.7.
2. μLux reference archive retained intact for traceability.
3. Native Python μLux service: bounded Horn-rule least fixed point, six-grade evidence ledger,
   fail-closed action decisions, deterministic artificial-life simulation, hash-chained event ledger,
   SHA-256 snapshot receipts and SQLite persistence.
4. Browser μLux observatory panel: inspect life population, advance simulation, check integrity,
   create receipts, grade a claim and execute a small Horn-rule genesis example.
5. Scalable data-plane foundations: PostgreSQL schema and optional Redis pub/sub room fan-out adapter.
6. Native mobile wrapper handoff notes for Android/iOS; PWA remains the actual cross-platform client.

## Runtime API
- `GET /api/mulux/world/{world_id}` — snapshot, integrity and grade vocabulary.
- `POST /api/mulux/world/{world_id}` with `{ "operation":"tick", "count":12 }` — advance and persist.
- `POST ...` with `{ "operation":"receipt" }` — generate and store a SHA-256 receipt.
- `POST ...` with `{ "operation":"grade", "claim":"...", "grade":"FACT", "evidence":[{"kind":"computation"}] }`.
- `POST ...` with `{ "operation":"genesis", "atoms":[...], "axioms":[...], "rules":[{"then":"b","if":["a"]}] }`.
- `POST ...` with `{ "operation":"policy", "action":"deploy", "owner_yes":false }`.

## CLI
```bash
ogce80 mulux-demo
ogce80 life-tick --ticks 24 --seed 144
ogce80 genesis --axiom a --rule b:a --rule c:a,b
ogce80 grade "The world simulation converges" --evidence computation
ogce80 policy deploy
```

## Data and authority model
- OGCE's existing authoritative game runtime remains the source of truth for player/gameplay actions.
- μLux living-world simulation is a separate bounded subsystem, persisted to SQLite in the same
  configured database. Its snapshot and integrity ledger do not overwrite player state.
- PostgreSQL schema is supplied for a future managed deployment; the current runtime still uses
  SQLite. Redis adapter broadcasts committed events only; it is not a consensus engine.
- Autonomy is sandboxed. Unknown actions default to deny; external publication, spending, messaging,
  binary execution and Source-communication labels are denied. Deploy/certificate publication
  require explicit owner approval.
- AI provider calls are not required for core gameplay. Provider adapters remain optional and must
  be configured with server-side secrets.

## Artificial life and sentience boundary
Agents can perceive simple state, retain short memories, follow genomes, forage, move, reproduce,
  die and contribute to learned rule checkpoints. These are observable simulation behaviours.
They do not prove subjective experience, consciousness, independent moral agency or sentience.
All UI and documentation must preserve that distinction.

## v8.0 limitations
- SQLite is the active persistence backend; PostgreSQL DDL is a migration foundation, not an
  implemented interchangeable repository backend.
- Redis fan-out is optional adapter code and is not wired into the default WebSocket server.
- Multiplayer remains a single-host service unless an operator integrates the distributed adapter
  with authoritative storage and deployment orchestration.
- No Kubernetes cluster, cloud resources, domain, TLS certificate, app-store accounts or credentials
  are provisioned by this archive.
- No signed Android/iOS packages, Windows/macOS installers, penetration test, independent security
  audit or public load test is included.
- Browser renderer remains low-poly WebGL; v8.0 does not become an AAA PBR engine.
- μLux v0.6.0's original JavaScript Worker and all source tests are preserved, but the Worker is not
  deployed and Malcolm API authentication is not validated by this release.
