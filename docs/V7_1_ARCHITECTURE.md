# OGCE v7.1 Architecture

## Delivered
- Browser WebGL renderer using native WebGL 1 shaders and GPU draw calls; orbit/zoom camera controls.
- Retains server-authoritative game state, SQLite persistence, world events and HTTP/WebSocket service.
- Adds persistent username/password accounts (PBKDF2-HMAC-SHA256 with per-account random salts) and opaque expiring bearer sessions stored by SHA-256 token digest.
- Browser login/registration UI; authenticated HTTP player actions; browser WebSocket ticket query authentication.
- Remote service binding requires a 32-character `OGCE_SERVICE_TOKEN`; loopback remains the development default.
- Preserves v7.0 and v6.2 lineage.

## Cross-platform direction
The browser client is responsive and supports touch/keyboard input. It can be installed as a PWA-style web app. Desktop native packaging (Tauri/Electron) and native Android/iOS shells are not built in this release; the browser build is the shared client foundation.

## Renderer limits
The WebGL renderer is an initial low-poly voxel-like 3D scene. It is not a complete AAA renderer: no production PBR material pipeline, skeletal animation, shadow maps, advanced lighting, physics integration or GPU compatibility certification.

## Session security limitations
The browser passes its session token as a WebSocket URL query parameter because browser WebSocket APIs do not permit arbitrary Authorization headers. Deploy only behind WSS/TLS and configure proxy access-log redaction for `ticket` query parameters. A one-time WebSocket ticket exchange, CSRF controls, registration rate limiting, email verification, MFA and account recovery are not included. This is a controlled deployment foundation, not a public internet identity service without additional hardening.
