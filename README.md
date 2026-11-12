# OGCE Infinity v8.0 — The Living Omniverse

v8.0 retains the v7.7 cross-platform online game foundation and integrates compatible μLux v0.6.0
capabilities: bounded least-fixed-point world genesis, evidence grading, fail-closed autonomy policy,
artificial-life simulation, persistent snapshots and SHA-256 integrity receipts. It adds PostgreSQL
schema and Redis room-bus extension points for a future horizontally scaled deployment.

## Quick start

```bash
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -e ".[server,test]"
pytest -q
ogce80 serve --host 127.0.0.1 --port 8787
```

Open http://127.0.0.1:8787. Sign in or use local guest mode, explore the 3D realm, then open the
**μLux · Living Lattice** panel to inspect/advance artificial life, verify its ledger, create a
receipt, grade a claim or compute a Horn-rule closure.

## μLux CLI

```bash
ogce80 mulux-demo
ogce80 life-tick --ticks 24 --seed 144
ogce80 genesis --axiom a --rule b:a --rule c:a,b
ogce80 grade "The simulation converges" --evidence computation
ogce80 policy deploy
```

## v8.0 deployment boundaries

The active database remains SQLite. PostgreSQL DDL and Redis pub/sub adapter are extension foundations,
not a production distributed MMO deployment. The PWA is the working cross-platform mobile client;
native signed Android/iOS packages are not included. Public deployment still requires an operator's
server, domain/DNS, TLS, secrets, monitoring, backups and security review. No consciousness claim is
made for simulated agents. See `docs/V8_0_ARCHITECTURE.md`, `docs/MULUX_V0_6_0_TECHNICAL_AUDIT.md`
and `docs/V8_0_RELEASE_STATUS.md`.

---

# OGCE Infinity v6.2 — Autonomous Agent Society & Persistent Multiplayer

v6.2 extends v6.1 with bounded NPC society scheduling, relationship-aware dialogue, local lexical semantic retrieval, multiplayer room state and a safe JSON transport protocol adapter.

## Install and test

```bash
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -e ".[test]"
pytest
```

## v6.2 demonstrations

```bash
ogce62 society-demo --agents 20 --turns 10
ogce62 room-demo --world aurelia --players 4
ogce62 memory-demo --query "ancient forest"
```

## Retained v6.1 capabilities

- Malcolm API adapter and governed tool orchestration (`ogce6` / `ogce61`).
- Persistent SQLite agent memory.
- Loopback-first local world service (`ogce61 serve`).
- World persistence, player profiles and authoritative command foundation.

Malcolm credentials remain environment-only. Rotate credentials pasted into chat; do not embed bearer tokens in source code or client packages.

See `docs/V6_2_ARCHITECTURE.md`, `docs/V6_2_SECURITY.md` and `docs/V6_2_RELEASE_VALIDATION.md`.

## Capability boundary

The room state and transport protocol are foundations, not a deployed WebSocket multiplayer service. The local semantic index is lexical similarity, not neural embeddings. No live Malcolm connection or public production multiplayer deployment is certified by this release.


# OGCE v7.0 — Ultimate Cross-Platform Game Platform

The v7.0 package preserves the v6.2 lineage and adds a playable responsive browser game, persistent SQLite world runtime, HTTP API and optional real WebSocket multiplayer transport.

## Install
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -e ".[test,server]"
pytest -q
```

## Launch the browser game and API
```bash
ogce70 serve --host 127.0.0.1 --port 8787
```
Open http://127.0.0.1:8787

## Launch WebSocket multiplayer
In another terminal:
```bash
ogce70 ws --host 127.0.0.1 --port 8765
```
Set the browser WebSocket field to `ws://127.0.0.1:8765` and connect. For browser clients on a remote deployment, implement the documented secure session-ticket handshake and deploy WSS behind TLS before public exposure.

## Windows quick start
Run `install_windows.bat`, then `ogce70 serve`. For WebSocket support install `python -m pip install -e ".[server]"`.

See `docs/V7_0_ARCHITECTURE.md`, `docs/V7_0_SECURITY.md`, and `docs/V7_0_RELEASE_STATUS.md` for scope and deployment boundaries.


# OGCE v7.1 — WebGL 3D and Player Accounts

Install with `python -m pip install -e ".[server,test]"`, then launch `ogce70 serve`.
The browser client now includes a WebGL 3D scene with orbit/zoom camera, a PWA service worker and account registration/sign-in. Register a username (3–24 letters/numbers/underscore) and password (12+ characters). Account sessions expire after 12 hours and are stored in the SQLite database.

Launch WebSocket multiplayer separately using `ogce70 ws`. Sign in through the browser first; the client supplies the session ticket to the WebSocket connection. For any internet deployment, use WSS/TLS and redact `ticket` query parameters from access logs. See `docs/V7_1_ARCHITECTURE.md` for security limitations.

For the v7.1 command alias, use `ogce71 serve` and `ogce71 ws`. The `ogce70` alias remains for compatibility.


# OGCE v7.2 — The Living Realms

v7.2 evolves the browser experience into a genuinely explorable low-poly 3D frontier: seeded rolling terrain, forests, rocks, river, roaming wildlife, animated explorer, day/night cycle, weather effects, resource landmarks and a follow camera. The persistent world now seeds crystal, wood and stone gathering sites. The shared client remains responsive and installable as a PWA.

## Quick start

```bash
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -e ".[server,test]"
pytest -q
ogce72 serve --host 127.0.0.1 --port 8787
```

Open http://127.0.0.1:8787. Move with WASD / arrow keys or touch controls; drag the scene to orbit and scroll to zoom. Explore to find crystal, wood and stone nodes, then gather nearby resources and build.

## Desktop window

```bash
python -m pip install -e ".[desktop]"
ogce72 desktop
```

## Multiplayer

Run the HTTP service and, in a second terminal:

```bash
ogce72 ws --host 127.0.0.1 --port 8765
```

For public deployment, use HTTPS/WSS, secure session-ticket handling, rate limits and redacted access logs. Never place service credentials in browser code.

## Scope

See `docs/V7_2_ARCHITECTURE.md` and `docs/V7_2_RELEASE_STATUS.md`. v7.2 is a working 3D exploration milestone, not a finished AAA engine. The renderer is low-poly WebGL with generated geometry; physics/combat, native Android/iOS packages, spherical seamless terrain, production PBR/shadows, distributed MMO infrastructure and live Malcolm authentication remain unimplemented or unverified.


# OGCE Infinity v7.4 — Sovereign Realms: Gameplay Awakening

v7.4 advances the v7.2 Living Realms through the v7.3 gameplay-awakening architecture. The authoritative simulation now includes hostile creatures, wildlife, enemy pursuit and attacks, combat, weapon tiers, experience and levels, quest objectives, crafting, healing potions, resting, loot and creature respawn.

## Install and launch

```bash
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -e ".[server,test]"
pytest -q
ogce74 serve --host 127.0.0.1 --port 8787
```

Open http://127.0.0.1:8787. Use WASD/arrow keys or touch controls to explore. Approach a creature and use Attack. Gather crystals, wood and stone to craft potions and weapons. Accept quests and claim rewards when their objectives are complete. Advance world time to run creature AI and weather simulation.

Optional desktop shell:

```bash
python -m pip install -e ".[desktop]"
ogce74 desktop
```

Optional WebSocket transport:

```bash
ogce74 ws --host 127.0.0.1 --port 8765
```

See `docs/V7_3_ARCHITECTURE.md`, `docs/V7_4_ARCHITECTURE.md` and `docs/V7_4_RELEASE_STATUS.md` for the version bridge, features and limitations. The top-level package is v7.4.0; `docs/V7_3_ARCHITECTURE.md` records the intermediate milestone definition.


## v8.2 — Living Arcana & Discovery

The v8.2 browser expansion adds simulated spellcasting, celestial narrative,
scientific hypotheses and repeat observations, technology invention, and
persistent civilization effects. See `docs/V8_2_ARCHITECTURE.md` and
`docs/V8_2_RELEASE_STATUS.md`. Run `pytest` to execute the suite.

Start the HTTP browser server with:
`python -c "from ogce4.v70.server import serve; serve(host='127.0.0.1', port=8787)"`

For public deployment, bind only behind a TLS reverse proxy and set a strong
`OGCE_SERVICE_TOKEN` (at least 32 characters). The v8.2 persistence adapter is
SQLite; PostgreSQL schema is a migration foundation, not a live adapter.
