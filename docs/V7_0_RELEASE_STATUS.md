# OGCE v7.0 Release Status

## Implemented foundations
Browser-playable 2D game vertical slice; SQLite persistence; revisioned world commits; event history; action validation; HTTP JSON service; optional real WebSocket transport; responsive touch/keyboard controls; retained v6.2 source lineage.

## Not represented as complete
Native desktop installers; native Android/iOS builds; production 3D rendering and physics; full campaign content; large-scale MMO orchestration; distributed room ownership; secure browser WebSocket session-ticket exchange; production account identity; managed database; payment/marketplace; anti-cheat certification; production deployment automation; live Malcolm API verification.

## Validation
Run `python -m compileall -q ogce4`, `pytest -q`, `ogce70 serve`, and in a second terminal `ogce70 ws`. Test the browser at `http://127.0.0.1:8787`. WebSocket server defaults to `ws://127.0.0.1:8765`. Use HTTPS/WSS and production identity/session controls before internet exposure.

## Build checks executed in this release session
- `python -m compileall -q ogce4`: passed.
- `pytest -q`: 91 passed.
- HTTP integration smoke: `/health`, browser static delivery, world snapshot, and an authoritative movement action passed.
- Browser UI source and WebSocket server implementation are included; full external-device/browser WSS deployment has not been certified.
