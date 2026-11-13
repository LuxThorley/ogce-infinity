# v7.7 change log

- Release identity corrected and formalized as 7.7.0.
- Added Caddy reverse proxy configuration for automatic HTTPS and WebSocket upgrades.
- Added Dockerfile and Docker Compose app / WebSocket / Caddy topology.
- Added generated service-secret bootstrap scripts for Linux/macOS and PowerShell.
- Added health and readiness endpoints, response security headers, world-id validation and bounded HTTP request bodies.
- Added process-local auth endpoint rate limiting.
- Changed browser multiplayer handshake to request a short-lived one-time WebSocket ticket.
- Changed WebSocket authentication to consume and invalidate tickets on first use.
- Added SQLite WAL mode and extended busy timeout for concurrent single-host API and WebSocket processes.
- Added consistent SQLite online backup and integrity-checked restore tools.
- Added operations runbook, deployment documentation and production scope limitations.
