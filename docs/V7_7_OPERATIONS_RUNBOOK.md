# v7.7 Operations Runbook

## First deployment

- `cp .env.example .env` (or run `./deploy.sh` to create one interactively).
- Set the real DNS hostname and a unique random service token.
- `docker compose up -d --build`
- `docker compose ps`
- `curl -fsS https://$OGCE_DOMAIN/health`

## Routine operations

- Logs: `docker compose logs --tail=200 app ws caddy`
- Restart: `docker compose restart app ws`
- Update: back up first, replace release files, then `docker compose up -d --build`
- Backup: `./backup.sh`
- Check disk: `docker system df` and host filesystem monitoring.
- Check certificate issuance in Caddy logs if HTTPS is not available.

## Restore

1. `docker compose stop app ws`
2. Copy the chosen verified backup into `backups/`.
3. Restore it into the persistent database volume using a temporary one-off container or copy the volume database to a maintenance host.
4. Run `ops/restore.py` with the backup and target database paths.
5. `docker compose up -d app ws caddy`
6. Verify `/health`, login and a test world action.

Never restore over a database while app/ws are running.

## Incident response

- Rotate `OGCE_SERVICE_TOKEN` in `.env` and restart app/ws if exposed.
- Revoke compromised player sessions by deleting their rows from the `sessions` table after taking a backup.
- Preserve logs and database backups before investigating suspected abuse.
- For data corruption, stop all writers and restore the latest verified backup.
