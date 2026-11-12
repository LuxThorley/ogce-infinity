# OGCE v6.0 Architecture

## Release theme
Persistent Sovereign Universe: durable world state, governed player actions, planning/economy primitives, authoritative command processing and a provider-neutral boundary to Malcolm OmniAPI.

## Modules
- `ogce4.v6.storage`: SQLite WAL persistence, revision-checked snapshots, event history and schema migration marker.
- `ogce4.v6.player`: player profile, inventory and permission-checked movement.
- `ogce4.v6.planning`: bounded deterministic goal ranking and sequence behavior primitive.
- `ogce4.v6.economy`: deterministic resource accounting and bounded price adjustment.
- `ogce4.v6.authority`: allowlisted authoritative command execution, idempotency keys, revision checks and audit records.
- `ogce4.v6.malcolm_api`: HTTPS-only configurable client, env-based bearer token, bounded requests/responses, no redirects, no credential logging, health/command/stream-poll/optimizer methods.
- `ogce4.cli_v6`: CLI for local persistence and Malcolm API health/command operations.

## Malcolm endpoint integration
Default base URL: `https://malcolmai-live.oliverluxthorley.workers.dev`
Default published route assumptions: `/healthz`, `/omni/command`, `/infinity/stream`, `/optimize`.
The provider's complete request/response schema and stream transport are not guaranteed by the public portal. All routes are environment-overridable. The `stream()` method currently uses bounded JSON polling; it is not an SSE/WebSocket implementation. Validate the actual provider contract before production use.

Credentials are read from `MALCOLM_OMNI_API_TOKEN`; they are not stored in source, manifests, logs or package files. Configure `MALCOLM_OMNI_API_URL` and optional `MALCOLM_OMNI_*_PATH` variables as needed. Rotate any credential pasted into chat before configuring the new value locally.

## Trust and safety boundary
Remote model output is advisory data. It must not be executed as code or applied directly as privileged world mutations. Route any proposed change through locally registered allowlisted actions, schema validation, permissions, quotas and explicit approval. Keep service secrets on the trusted server side, never in browser/game clients.

## Current limitations
This release adds a functional local SQLite store and local authoritative command processor, but not a deployed multiplayer server, distributed consensus, account authentication, payment stack, client UI, live SSE/WebSocket stream, or complete NPC pathfinding/combat. SQLite is intended for local/single-host persistence. API calls have not been authenticated against the live Malcolm service in this build environment.
