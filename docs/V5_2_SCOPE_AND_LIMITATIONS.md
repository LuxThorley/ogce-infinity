# OGCE v5.2 scope and limitations

## Eight v5.2 objectives
1. **Planetary generation:** deterministic spherical height/elevation grid, biome and climate fields. Not yet tectonic simulation, volumetric geology or seamless multi-resolution planetary streaming.
2. **Oceans/weather/climate:** deterministic per-cell climate sampling, wave phase, wind, precipitation and coarse weather classification. No fluid dynamics, ocean mesh/wave renderer, atmospheric scattering or validated climate science.
3. **Ecosystems/NPCs:** bounded flora/grazer/predator population updates and NPC state records. No autonomous planning, navigation, dialogue model or large-scale ecology calibration.
4. **Civilizations/economies/settlements:** settlement stock, farm/food demand, prosperity and event history. No complete trade network, agent-driven politics or economic balancing study.
5. **Quests/narrative/history:** seeded template quests and chronicle events. These are deterministic templates, not a full narrative AI or authored campaign.
6. **Streaming/LOD:** grid chunk load/unload radius and distance-based LOD selector. No asynchronous asset streaming, GPU residency manager or occlusion pipeline yet.
7. **Shared multiplayer universe:** revision-checked shared state and conflict rejection primitive. It is not a production multiplayer transport, authoritative anti-cheat stack, distributed database or matchmaking service.
8. **Adaptive simulation:** bounded step scheduler and candidate validation/explicit approval gate. No self-modifying executable code or automatic deployment.

## Rendering notes
`renderer_planet.py` constructs a spherical terrain mesh in Panda3D with biome vertex colours and directional/ambient lighting. It is a rendering prototype. Ocean rendering, physically based atmosphere, real-time shadows, GPU profiling and visual QA on physical hardware remain future work. Install Panda3D separately using the `render` extra.

## Safety and operations
- Keep network services behind authenticated TLS gateways; do not expose development services directly to the public internet.
- AI adapters require operator-configured endpoints and secrets. Never commit API keys.
- Shared state is a concurrency primitive, not a complete trust boundary. Validate client inputs and authorize every operation in a real server.
- Ecosystem and economy models are illustrative simulation rules and require balancing and domain validation.

## Validation not claimed
Local tests do not certify Windows/macOS/Linux, GPU vendors, rendering quality, network load, security, anti-cheat, game balance or production readiness. No AAA equivalence or limitless simulation is claimed.
