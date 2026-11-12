# OGCE v5.3 — Scope and limitations

## Release objective
v5.3 adds a deterministic, local simulation layer for autonomous agent decisions, social relationships, coupled ecology, civilization diplomacy/trade, world events and an integrated world-tick coordinator. It extends rather than replaces the v5.2 planetary, weather, streaming and rendering foundations.

## Implemented in this release
- Utility-scored NPC actions, bounded needs, capped memory and relationship updates (`ogce4.v53.npc`).
- Bounded food-web population/resource updates with deterministic state transitions (`ogce4.v53.ecosystem`).
- Civilization state, relations, treaty acceptance/rejection, conflict records and atomic in-memory resource trades (`ogce4.v53.civilization`).
- Seeded world events and bounded, de-duplicated chronicles (`ogce4.v53.events`).
- Integrated world tick coordinating NPCs, ecology, civilization turns and chronicle events (`ogce4.v53.simulation`).
- CLI for repeatable world simulations, NPC demonstrations and seeded events (`ogce53`).

## Foundations, not finished production systems
- NPC decisions are utility heuristics, not a learned or generative AI model. Memory is bounded in-process data, not semantic long-term memory.
- Diplomacy and conflict are state records and simple rule operations. There is no tactical combat, pathfinding, military logistics, economic equilibrium solver or player-facing diplomacy UI.
- Ecosystem is a simplified discrete model. It is not validated ecological science and does not simulate individual organisms, genetics, migration or full nutrient cycles.
- Trade is an in-memory transfer helper; it is not a secure marketplace, network transaction, or persistent economy service.
- Events are seeded templates, not unrestricted AI-generated narrative. No external AI provider is called.
- World state is local JSON-compatible Python data. Multiplayer authority, authentication, anti-cheat, distributed consensus and production persistence remain future integration work.
- v5.2 Panda3D rendering and GPU behavior are inherited; v5.3 adds no new visual renderer and does not certify any GPU or operating system.

## Security and operational notes
- Treat world snapshots, names, actor IDs and external patches as untrusted input at service boundaries.
- Apply authentication, authorization, rate limits, schema validation and durable transaction handling before exposing simulation APIs to networks.
- The simulator uses explicit step bounds in the CLI and caps population/memory/chronicle growth in core operations.
