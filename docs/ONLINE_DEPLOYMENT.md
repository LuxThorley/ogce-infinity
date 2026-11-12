# Online deployment — OGCE v8.2

## Prerequisites
- A Linux host with Docker Engine and Docker Compose plugin.
- A DNS A/AAAA record pointing your domain to the host.
- Public TCP ports 80 and 443.
- A unique random `OGCE_SERVICE_TOKEN` of at least 32 characters.

## Deploy
1. Copy `.env.example` to `.env`.
2. Set `OGCE_DOMAIN` to your DNS hostname.
3. Set `OGCE_SERVICE_TOKEN` to a fresh secret. Never commit `.env`.
4. Run `docker compose up -d --build`.
5. Visit `https://YOUR_DOMAIN`; Caddy manages TLS certificates.
6. Inspect `docker compose ps` and `docker compose logs -f game`.

## Data and backups
The SQLite database resides in the `ogce_data` named volume. Back up regularly
using SQLite's online backup API or after stopping the service. Keep encrypted
off-host backups and preserve the volume during upgrades.

## Deployment boundaries
This profile is a single-node HTTPS browser/API deployment. The v8.2 aggregate
store uses SQLite. The PostgreSQL DDL is a migration foundation, not a runtime
adapter. Redis, multi-host world coordination, high availability, load testing,
penetration testing and public hosting are not included or verified. The
existing WebSocket transport remains a separate service and is not wired into
this Compose profile. Use a reverse proxy and strong secrets; do not expose
the service directly to the public internet without TLS.
