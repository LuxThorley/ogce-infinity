# OGCE v7.0 Architecture

## Product direction
Cross-platform target: desktop, mobile and browser. Game direction: hybrid open-world RPG, MMO, survival, simulation and creation.

## Delivered in this package
- Preserves the v6.2 lineage and prior release assets.
- Adds a responsive browser/PWA-style game client with touch and keyboard controls.
- Adds a persistent SQLite world runtime with revisioned commits and event history.
- Adds server-authoritative movement, gathering, building, chat events and world ticks.
- Adds a real optional WebSocket server using the `websockets` package, room membership, snapshot-on-join and update broadcast.
- Adds HTTP health, world snapshot and authenticated action endpoints.
- Adds installable CLI entry point `ogce70`.

## Architecture boundaries
The browser client is the first cross-platform presentation target. Desktop packaging and native mobile shells are not included. Rendering is a 2D top-down playable vertical slice, not a finished 3D renderer. WebSocket rooms are process-local; durable world state/events are SQLite-backed. There is no distributed room ownership or multi-region cluster manager.
