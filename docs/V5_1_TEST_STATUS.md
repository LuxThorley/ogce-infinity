# v5.1 test status

Automated local unit tests cover deterministic generation, SQLite persistence/ticks, event allow-listing, asset SHA-256 manifests, scoped API keys, offline licence signatures/expiry, AI endpoint transport policy, and disabled-by-default billing.

Not tested here: Panda3D graphical runtime on actual GPU; Windows/Linux/macOS; remote TLS/API deployment; external AI provider credentials; Malcolm AI endpoint; multiplayer concurrency/chaos; billing webhooks; Ed25519 signing pipeline; security penetration; performance certification.

Run: `python -m pip install -e ".[test]"` then `pytest`.
