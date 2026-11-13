# OGCE Infinity v7.7 — Online Cross-Platform Release

## Release goal

v7.7 consolidates the v7.4 gameplay foundation and v7.6 live-service deployment direction into a self-hostable online release. It includes reproducible container deployment, HTTPS/WSS reverse proxy, persistent storage, health checks, backup/restore tools, hardened session handling and responsive PWA delivery.

## Included

- Browser/PWA client for current desktop and mobile browsers.
- Existing optional desktop wrapper through pywebview.
- HTTP world API and a separate WebSocket multiplayer service.
- SQLite WAL mode and busy timeout for concurrent HTTP/WebSocket service processes.
- Account password hashing with PBKDF2-HMAC-SHA256 and hashed bearer session storage.
- One-time, 60-second WebSocket tickets: the browser exchanges its bearer session for a short-lived ticket; the WebSocket service consumes it once. The raw account session is no longer sent in the WebSocket URL.
- Authentication endpoint rate limiting per client IP (process-local baseline), bounded limiter memory and configurable WebSocket Origin allow-list (Compose binds it to the configured HTTPS domain).
- Strict world identifier validation, request body bounds, security response headers, readiness and health endpoints.
- Dockerfile, Compose topology, Caddy automatic TLS reverse proxy, persistent named volumes and generated deployment secret.
- SQLite online backup and validated restore scripts.
- v7.4 gameplay: exploration, creatures, combat, crafting, quests, progression and survival.
- Historical v3.1–v7.6 documentation/source lineage retained in the package.

## Deployment topology

```text
Desktop / mobile browser (HTTPS + WSS)
                 |
            Caddy :80/:443
             /        \
        HTTP API     WebSocket
          app          ws
             \        /
           shared SQLite volume
```

The app and WebSocket processes share one SQLite database volume. WAL and busy timeout are enabled. This is suitable for a small single-host deployment and development community, not a horizontally sharded MMO cluster.

## Production deployment

1. Provision a Linux host with Docker Engine and Docker Compose plugin.
2. Point a DNS A/AAAA record for the chosen hostname to the host.
3. Allow inbound TCP 80 and 443 (UDP 443 optional for HTTP/3).
4. Copy `.env.example` to `.env`, set `OGCE_DOMAIN`, and generate a long random `OGCE_SERVICE_TOKEN`.
5. Run `docker compose up -d --build`.
6. Open `https://your-domain`. Caddy obtains and renews certificates when DNS and inbound ports are correctly configured.
7. Confirm `docker compose ps` and `https://your-domain/health`.
8. Back up regularly using `./backup.sh` and copy backup files off-host.

The `deploy.sh` helper generates `.env` and a random service secret if `.env` does not yet exist, then starts the stack. It cannot configure DNS, firewall rules, cloud accounts or provider billing.

## Backup and restore

- Create a consistent live backup: `./backup.sh`.
- Or run `python ops/backup.py /path/to/ogce.sqlite3 ./backups`.
- Stop both app and ws services before restore.
- Restore only a trusted backup: `python ops/restore.py ./backups/ogce-file.sqlite3 /path/to/ogce.sqlite3`.
- The restore utility checks SQLite integrity and OGCE table presence and preserves a pre-restore copy.

## Desktop and mobile

- Mobile: install the PWA from the browser's install/add-to-home-screen workflow over HTTPS. Responsive touch controls are included.
- Desktop: use the PWA in a browser, or install optional pywebview support and run `ogce77 desktop`.
- The same online account and world service are used by all clients.
- Signed Windows/macOS installers and signed Android APK/AAB/iOS IPA packages are not generated in this release. App-store publishing requires platform signing keys, developer accounts, platform build hosts and review.

## Security posture and operational caveats

- Use a unique high-entropy `OGCE_SERVICE_TOKEN`; never commit `.env`.
- The service token is a server-to-server gate for remote binding; player browser sessions use account tokens and one-time WebSocket tickets.
- The account rate limiter is process-local. Put a managed WAF/rate limiter in front for a public launch.
- Add email verification, password reset, MFA, moderation/reporting, privacy/retention policy and abuse operations before a commercial public release.
- Caddy terminates TLS. Do not expose app:8787 or ws:8765 directly to the internet.
- SQLite is single-host persistent storage. For multiple game-server replicas, migrate to PostgreSQL and a distributed event/pub-sub layer with authoritative shard ownership.
- Multiplayer room broadcasts are single-process and are not a global MMO mesh.
- No load test, penetration test, external vulnerability audit or multi-device GPU certification is claimed.
- The 3D renderer remains low-poly generated WebGL; no production PBR/shadow pipeline or native 3D engine port is included.
- Malcolm API connectivity remains optional and not live-authenticated/verified.

## Release scope

This is a self-hostable online game service package and playable cross-platform browser/PWA client. It is not an externally deployed hosted service until an operator supplies a domain, server, DNS, firewall and deployment credentials and runs the deployment steps.


### Windows deployment helper

With Docker Desktop installed and DNS configured, run PowerShell as an operator in the extracted project directory:

```powershell
.\deploy.ps1
```

The script creates `.env` with a generated high-entropy service token if needed and starts Docker Compose. Keep `.env` private and back it up securely.

### Local desktop and browser

Windows desktop wrapper:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install -e ".[desktop,server,test]"
ogce77 desktop
```

The browser/PWA is the recommended common desktop/mobile client. Native mobile app packages are not generated by this build.
