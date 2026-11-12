# OGCE Infinity v8.2 — Living Arcana & Discovery

## Product scope
v8.2 adds a deterministic, persistent game-world aggregate for character arcana,
celestial lore, experimental science, invention, and civilization-level effects.
It is an online-first browser game expansion over the v8.0 engine lineage.

## Systems
- Character paths: arcane, scientific, hybrid; skills, mana, health, XP and inventory.
- Arcana: learned spell list, resource-costed casting, restoration, warding,
  elemental, enchantment and astral-themed fictional effects.
- Celestial lore: deterministic symbolic readings driven by world tick, seed and
  character birth cycle. Astrology is an in-world narrative/game modifier only.
- Scientific discovery: hypothesis records, bounded observations, repeat tests,
  reproducibility flags, and knowledge rewards. Results are scoped to the simulation.
- Technology: prerequisite graph, research/skill cost, inventions and civilization
  effects for energy, knowledge, industry and harmony.
- Integrity: append-only SHA-256 hash chain for state-changing events.
- Persistence: SQLite WAL aggregate storage with revision checks; compatible with
  the engine's existing SQLite runtime database.

## HTTP API
All routes are served by the existing v7.0 HTTP server:
- `GET /api/v82/world/{world_id}`
- `POST /api/v82/world/{world_id}` with JSON `operation`:
  `character`, `cast`, `learn_spell`, `reading`, `hypothesis`, `experiment`,
  `invent`, `train`, `tick`.
The body is bounded to 16 KiB by the route. Keep the service behind TLS and an
authenticated reverse proxy for public deployment. Existing service-token
configuration is enforced for remote server binding.

## Data model and migration
v8.2 stores world aggregates in `worlds_v82` in the same SQLite database file,
leaving v8.0 μLux tables and prior world data untouched. A PostgreSQL schema
foundation is included in `ogce4/v82/postgres_schema.sql`; the runtime adapter
is still SQLite. PostgreSQL/Redis distributed runtime migration is a future
deployment gate, not represented as completed here.

## Security and operational boundaries
- Use HTTPS/WSS in production, strong unique service secrets, backups and
  least-privilege database credentials.
- Never place API credentials in browser JavaScript or commit `.env` files.
- Spell effects and astrology are fictional game mechanics.
- Reproducibility is an in-game flag over recorded strings, not real scientific
  validation. NPC/game simulation is not evidence of consciousness.
- This package is built and locally tested; public hosting, penetration testing,
  load testing, managed PostgreSQL cutover and app-store certification are not
  performed by this build.
