# OGCE v6.2 — Autonomous Agent Society & Persistent Multiplayer Foundations

## Added systems
- Agent society scheduler: deterministic bounded turns across large NPC collections, goal selection and social influence.
- Dialogue layer: relationship-aware authored response templates.
- Local semantic retrieval: lightweight lexical similarity index with metadata; not a neural embedding model.
- Multiplayer room state: membership, sequence numbers, bounded event history and event-type allowlist.
- Transport protocol: bounded JSON message encoding/decoding and an adapter contract ready for a real WebSocket implementation.
- CLI demos for society turns, room membership and local memory retrieval.

## Multiplayer status
The room and transport protocol are implemented and tested locally. A production WebSocket server, TLS termination, reconnect/resume protocol, distributed room ownership, cross-region replication and anti-cheat are not included in this release. The transport adapter is intentionally framework-neutral.

## AI and memory status
The v6.1 Malcolm API, governed orchestrator and persistent SQLite memory remain available. v6.2 adds local lexical semantic retrieval; it does not generate vector embeddings or call an embedding model. NPC turns are deterministic goal scheduling, not unconstrained autonomous AI.

## Security
Room event types and message sizes are restricted. Real network deployment must add TLS, authenticated player sessions, authorization, rate limiting, abuse controls and persistent authoritative event storage. Remote AI output remains advisory and must pass the v6.1 local action policy.
