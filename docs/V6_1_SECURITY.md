# v6.1 Security notes

- Rotate credentials pasted into chat. Set the replacement token in `MALCOLM_OMNI_API_TOKEN`.
- Do not store tokens in source, archives, browser clients or logs.
- Keep `OGCE_BIND_HOST` loopback-only unless deployment protections are configured.
- `OGCE_SERVICE_TOKEN` is a separate local service credential; use a high-entropy secret.
- AI tool calls are locally allowlisted; no eval/shell execution is provided.
- Privileged world mutation requires explicit approval plus admin permission.
- SQLite and the included HTTP server are single-host foundations. Perform threat modeling, TLS, rate limiting, account auth, backups and penetration testing before production.
