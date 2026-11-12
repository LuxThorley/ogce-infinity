# OGCE Infinity v8.2 on Cloudflare Workers

The supplied package targets a single Linux host (Python stdlib HTTP server + SQLite, Docker Compose + Caddy).
Cloudflare Workers cannot run that Python process, so this repository adds a Workers-native runtime in
`cloudflare/` that serves the **unchanged** browser client in `web/` and re-implements the HTTP API of
`ogce4/v70/server.py` in JavaScript.

## Live deployment
- URL: https://ogce.malcolmai.live (Workers Custom Domain) and https://ogce-infinity.oliverluxthorley.workers.dev (Worker `ogce-infinity`, free plan)
- Continuous deployment: Cloudflare Workers Builds is connected to this repository; every push to `main`
  runs `npm test` and then `npx wrangler deploy`.
- Multiplayer WebSocket: `wss://ogce.malcolmai.live/ws` or `wss://ogce-infinity.oliverluxthorley.workers.dev/ws` (sign in first).

## Architecture

| Piece | Cloudflare resource |
|---|---|
| `web/` (HTML, WebGL renderer, PWA) | Workers Static Assets |
| `/health`, `/api/*`, `/ws` | One SQLite-backed Durable Object (`OGCEWorldV2`, instance `ogce-main`; v1 class deleted by migration `v2` to reset the world) |
| SQLite database file | Durable Object SQLite storage (persistent) |
| `OGCE_SERVICE_TOKEN` | Worker secret |

The engine modules are line-by-line ports of the Python originals:

| Python (canonical) | JavaScript port |
|---|---|
| `ogce4/v70/runtime.py` (v7.4 world, combat, quests, crafting) | `cloudflare/src/runtime.js` |
| `ogce4/v70/auth.py` (accounts, sessions) | `cloudflare/src/auth.js` |
| `ogce4/v80/mulux.py` + `persistence.py` (μLux living lattice) | `cloudflare/src/mulux.js` |
| `ogce4/v82/living_world.py` + `persistence.py` (arcana, science, invention) | `cloudflare/src/living82.js` |
| `random.Random` (MT19937) | `cloudflare/src/pyrandom.js` (bit-exact) |
| `ogce4/v70/server.py` HTTP + WebSocket handlers | `cloudflare/src/app.js`, `cloudflare/src/index.js` |

### Parity testing
`cloudflare/tools/gen_fixtures.py` runs the Python engine and records golden outputs
(`cloudflare/test/fixtures.json`). `cloudflare/test/parity.test.mjs` replays them through the JS port and
requires exact equality: identical random streams, world snapshots, SHA-256 ledger hashes (including
`ensure_ascii` behaviour) and runtime states (wall-clock `at` fields excepted).

## Known deviations from the Python server
- **PBKDF2 iterations: 100,000** (Python uses 310,000). Cloudflare Workers' WebCrypto caps PBKDF2 at 100,000.
  Iterations are stored per account so they can be raised later.
- Password salt/hash are stored as hex `TEXT`, not `BLOB`.
- The one-time `ws_tickets` table is not used (the Python WebSocket server also validates the session token directly).
- WebSocket multiplayer is served on the same origin at `/ws` (Python ran it as a separate process on port 8765).
  In the client's "Multiplayer connection" box enter `wss://<host>/ws`.
- μLux/v8.2 worlds are cached in Durable Object memory exactly as the Python server cached them in-process;
  after the object is evicted they reload from storage (equivalent to a Python server restart).

## Commands
```bash
npm install
npm test                 # JS parity + API tests (node --test)
python -m pip install -e ".[test]" && pytest -q   # canonical Python suite
npx wrangler dev         # local workerd; put OGCE_SERVICE_TOKEN in .dev.vars (git-ignored)
npx wrangler secret put OGCE_SERVICE_TOKEN
npx wrangler deploy
```

With `OGCE_SERVICE_TOKEN` set (as the original deployment guide requires), guests can view the world but must
create an account to act — the same rule the Python server enforces.

## Bug fixed from the supplied package
`POST /api/v82/world/{id}` with `{"operation":"character"}` returned `400 unknown_v82_operation` in `ogce4/v70/server.py`
because the operation dispatch chain had no `character` branch. Fixed in Python (with regression test
`tests/test_v82_http.py`) and in the Worker.
