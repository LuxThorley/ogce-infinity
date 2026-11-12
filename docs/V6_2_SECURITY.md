# v6.2 Security

- Do not store Malcolm or player bearer credentials in source code, archives or client bundles.
- Treat all network messages as untrusted; validate schema, size, player identity and permissions at the server boundary.
- Only allowlisted room event types are accepted.
- The JSON transport framing is not itself encryption or authentication.
- Deploy real multiplayer behind TLS with authenticated sessions, authorization, rate limits, abuse monitoring and durable event storage.
- Remote AI output remains advisory and must pass local tool allowlists and approval gates.
