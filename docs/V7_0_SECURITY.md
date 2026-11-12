# OGCE v7.0 Security

- Bind HTTP/WebSocket services to loopback for local development.
- Remote HTTP binding requires `OGCE_SERVICE_TOKEN` of at least 32 characters. Put production TLS termination, rate limiting, origin policy, monitoring and firewall controls in front of the service.
- HTTP action endpoints use bearer authentication when a token is configured. Tokenless mode is intended only for loopback development.
- WebSocket clients use an Authorization bearer header when a token is configured; browsers cannot set arbitrary WebSocket headers, so production browser deployments should use a secure short-lived ticket/session handshake through an authenticated HTTPS endpoint and WSS. That ticket flow is not implemented in this release.
- Never place provider API keys in browser JavaScript. Malcolm credentials belong in server-side environment secrets.
- Game actions are allowlisted and validated server-side. This is a foundation, not a complete commercial anti-cheat system.
- SQLite is appropriate for single-host development and modest deployments, not a substitute for a managed high-availability database.
