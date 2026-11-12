# OGCE v6.1 — Live Intelligence & Autonomous World Operations

## Added systems
- Persistent agent memory: SQLite storage, agent/world scoping, bounded retention and lexical retrieval.
- Governed AI orchestration: provider advice is data; only locally registered tool handlers execute. Action allowlist, payload cap and admin approval for privileged actions.
- Malcolm feed polling: bounded cursor-based polling built on the v6.0 provider adapter. It is not a WebSocket/SSE connection.
- Local HTTP world service: loopback-first health endpoint, authenticated world read and authenticated save endpoint, body-size limits and SQLite persistence.
- CLI: `ogce61 serve`, `memory-add`, `memory-search`, and `malcolm-feed`.

## Malcolm live integration status
The v6.0 adapter is reused. The v6.1 feed poller expects a JSON response with `items` or `events` and optional `next_cursor`/`cursor`. The `/infinity/stream` transport and schema must be confirmed with the provider. No successful authenticated live call is claimed by this release. Set `MALCOLM_OMNI_API_TOKEN` at runtime; never embed the token in source or client builds.

## Deployment
The HTTP service binds to `127.0.0.1` by default and requires `OGCE_SERVICE_TOKEN`. Remote binding is disabled unless `OGCE_ALLOW_REMOTE=true`; only enable behind TLS termination, a firewall, strong authentication, rate limiting and operational monitoring. The included service is a development/single-host service, not a hardened public production deployment.

## Agent governance
Provider output cannot execute arbitrary code. Proposed tool actions must match local registered handlers and policy. Privileged actions require both explicit approval and an `admin` permission. Treat all remote content as untrusted input.
