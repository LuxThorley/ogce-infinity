# OGCE Infinity v7.4 — Sovereign Realms: Gameplay Awakening

## v7.4 capabilities

### Authoritative living creatures
- Persistent creature records stored with the world snapshot.
- Hostile Moss Wolves and skittish Silverhart wildlife.
- Deterministic tick-driven enemy pursuit, melee attacks, wildlife evasion and timed respawn.
- Creature health, hostile/friendly classification, defeat state and drops.

### Combat and progression
- Server-authoritative attack range and damage.
- Three weapon tiers: Traveller Blade, Stone Edge and Crystal Sabre.
- Enemy defeat awards experience and material loot.
- Level thresholds increase maximum health and restore the player's health.
- Defeated creatures respawn after simulation ticks.

### Quests
- Frontier Hunt: defeat two Moss Wolves.
- Gatherer's Path: collect six resource units.
- Per-player quest acceptance, progress and one-time reward claims.
- Quest rewards grant XP and materials.

### Crafting and survival
- Healing potion from crystals.
- Stone Edge and Crystal Sabre weapon crafting.
- Potion consumption restores health.
- Resting near a campfire or shelter restores health and reduces hunger.
- Existing resource gathering and structure construction retained.

### World simulation
- Server tick advances weather, hunger, hostile creature pursuit, attacks, wildlife movement and respawn timers.
- World movement remains bounded to 64×64 logical coordinates.
- Shelter tiles block player movement; occupied structure tiles reject duplicate construction.
- v7.2 worlds migrate once to add creature population and quest board while preserving existing world and player data.

### Browser experience
- Combat, crafting, quest and survival controls.
- Level, XP, health, hunger, weapon and potion HUD.
- Creature models are rendered in the existing WebGL scene.
- Responsive browser/PWA client and optional desktop wrapper retained.

## Controls

- WASD / arrow keys or touch pad: move.
- Drag: orbit camera; scroll: zoom.
- Gather: collect adjacent resource.
- Attack: strike a creature within two tiles.
- Advance time: run one authoritative simulation tick.
- Craft: create healing potions and upgraded weapons.
- Quests: accept and claim objectives.
- Rest: recover beside a campfire or shelter.

## v7.3 → v7.4 lineage

The package retains a `OGCE_Infinity_v7_3` intermediate source snapshot and v7.3 bridge documentation. The final top-level project is v7.4.0. v7.3 establishes the gameplay-awakening architecture; v7.4 implements and integrates the persistent gameplay systems described above.

## Limitations

- WebGL renderer remains generated low-poly geometry with vertex colours, not a production PBR renderer.
- Creature motion is grid/tick-based, not continuous rigid-body physics or navigation-mesh pathfinding.
- Combat is a simple turn/tick action model; there are no animation-state rigs, hitboxes, boss encounters, ranged weapons or advanced combat combos.
- Wildlife and hostile creatures are a small seeded population, not an unlimited ecosystem.
- Quests are a small fixed catalogue; no visual quest journal, branching dialogue, procedural narrative or authoring editor yet.
- No native Android/iOS binaries, distributed MMO shard architecture, production anti-cheat, large-scale load test or GPU certification.
- Malcolm API integration remains optional and unverified against a live authenticated endpoint.

## Security and deployment

Keep account and service credentials server-side. Use HTTPS/WSS, secure ticket exchange, rate limiting, CSRF protection, log redaction, backups and monitoring before public deployment. Do not expose the local development server directly to the public internet.
