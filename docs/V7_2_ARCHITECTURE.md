# OGCE Infinity v7.2 — The Living Realms

## Delivered

- Procedural height-field landscape rendered in native WebGL 1 from a deterministic world seed.
- Follow-camera third-person explorer avatar, animated gait, orbit/zoom controls and keyboard/touch movement.
- Procedurally placed forest canopy, shrubs, boulders, small roaming wildlife, resource landmarks and player-built structures.
- Animated day/night lighting cycle, moving sun/moon marker, fog, river ribbon, rain/mist effects and weather state driven by the authoritative world tick.
- Expanded seeded resource nodes (crystal, wood, stone) with server-authoritative gathering and existing persistent inventory/build actions.
- Existing SQLite world persistence, account identity, revisioned events and optional WebSocket room updates retained.
- Optional desktop window wrapper via pywebview; shared browser client remains the PWA/mobile foundation.
- Existing v6.2 agent-society, memory, diplomacy and Malcolm provider adapter lineage retained.

## Controls

- WASD / arrow keys or touch direction pad: move.
- Drag the scene: orbit camera.
- Mouse wheel / trackpad scroll: zoom.
- Gather nearby resource: collect a node when adjacent.
- Build campfire: uses the existing authoritative recipe and inventory.

## Desktop and mobile

- Browser/PWA: installable from a compatible browser when served over localhost or HTTPS.
- Desktop shell: `python -m pip install -e '.[desktop]'` then `ogce72 desktop`.
- Browser client adapts to desktop and mobile layouts. Native Android APK and iOS app packages are not included; those require platform signing/build environments and a dedicated native wrapper.

## Engineering boundaries / not yet production-complete

- Terrain is a deterministic local height-field, not a seamless spherical planet; the player navigates the existing bounded authoritative tile coordinates (0–63).
- WebGL renderer uses generated low-poly geometry and vertex colours; it is not a full PBR pipeline and has no production skeletal animation, shadow maps, advanced lighting, GPU particle system or asset streaming/LOD.
- Avatar gait and wildlife are visual animation; there is no production rigid-body physics, collision mesh, combat loop, damage model or skeletal character rig yet.
- The world simulation and weather are authoritative only to the extent of the existing server actions/ticks; the sky/day cycle is a client visual cycle.
- WebSocket room transport remains a single-process room broadcast; no distributed MMO sharding, durable distributed pub/sub or fleet orchestration.
- NPC society/goal planning exists in retained v6.2 modules, but this browser scene does not yet run a fully populated autonomous NPC population.
- Malcolm API integration remains provider-configurable and unverified against a live authenticated endpoint. It is not required to run the game and cannot execute arbitrary provider-generated code.
- Native mobile packaging, app-store compliance, production anti-cheat, full campaign, production load testing and cross-device GPU certification remain future work.

## Security

Keep account credentials and service tokens on the server. Rotate any token previously pasted into chat. Use HTTPS/WSS, secure session-ticket exchange, rate limiting, CSRF protections, log redaction and production identity controls before public deployment.
