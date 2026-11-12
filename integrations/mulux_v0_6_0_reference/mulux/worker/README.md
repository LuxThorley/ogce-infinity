# mulux-api (Cloudflare Worker) — not deployed

Proxies μLux to the Malcolm AI Infinity nexus so the browser never sees a token.

| Route | Does |
|---|---|
| `GET /api/healthz` | Worker status (never reveals the token, only whether one is configured) |
| `POST /api/malcolm/chat` | `{messages:[{role,content}], purpose}` → upstream `POST /v1/chat` → `{text, model, provider, ms}` |
| `POST /api/malcolm/stream` | same, returned as Server-Sent Events (`event: delta` … `event: done`) |
| `GET /api/malcolm/pulse` | pass-through of upstream SSE `/infinity/stream` |
| `GET /api/pulse/infinity` | same stream for the Sanctum Pulse ceremonial lane (header `X-Mulux-Lane: ceremonial`) |
| `GET /api/pulse/health` | reachability of Malcolm `/healthz` and the OmniGenesis site: HTTP status and latency only |

Pulse routes follow the same switch, origin and rate-limit rules. Fail-closed: `MULUX_MALCOLM_ENABLED` must be `yes`; unknown routes 404; foreign origins 403; 12 requests/min per IP and route;
bodies ≤ 32 KB, ≤ 24 messages, ≤ 8,000 characters. The system prompt forbids sentience, medical, legal, predictive and supernatural claims.

Deploy (only after Oliver's YES): `wrangler secret put MALCOLM_OMNIAPI_TOKEN` (preferred; MALCOLM_INFINITY_BOT_TOKEN or MALCOLMAI_LIVE_TOKEN are accepted fallbacks), uncomment `routes`, set `MULUX_MALCOLM_ENABLED = "yes"`, `wrangler deploy`.
Tests: `node --test tests/p6-worker.test.mjs` (mocked Malcolm; no network).
