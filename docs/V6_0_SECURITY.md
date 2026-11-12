# v6.0 Security and credential handling

- Do not place bearer tokens in Python source, `.env.example`, README files, archives, command history or client-side bundles.
- Set `MALCOLM_OMNI_API_TOKEN` in the runtime environment or inject it through a secret manager.
- The token previously pasted into chat should be considered compromised and rotated/revoked.
- The API client requires HTTPS, rejects redirects to avoid forwarding bearer credentials, applies timeouts and response-size limits, and avoids printing credentials.
- Do not pass untrusted provider output to `eval`, shell commands, Python imports, SQL, filesystem paths or privileged game-engine operations.
- Apply server-side authentication, authorization, rate limits and audit retention before exposing APIs to remote clients.
