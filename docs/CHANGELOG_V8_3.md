# OGCE Infinity 8.3 — “Clear Skies” (branch `v8.3`)

All v8.2 gameplay is kept: the v7.4 world (explore, gather, craft, campfires, potions, weapons, Moss Wolves,
Silverhart, quests, levels), μLux (Tiny Life Lab), the v8.2 Academy (characters, make-believe spells and star
stories, experiments, inventions, town progress, tamper-proof record), accounts and live multiplayer.
The server game rules and save data are unchanged, so existing production worlds load as they are.

## Where the “7.0 / 7.7 engine” really came from (honest audit)
* **v7.0** package: a **2D top-down canvas** client only (no 3D renderer). Its tile drawing is reused in 8.3
  as the **minimap** and as the **no-WebGL fallback map view** (`web/js/minimap.js`).
* **v7.7** package: `web/renderer3d.js` is **byte-for-byte identical** to the one already in v8.2.
  v7.7’s real additions were **online hardening** (one-time WebSocket tickets, auth rate limiting,
  strict world ids, CSP/security headers, `/ready`) and Docker/Caddy/backup tooling.
* So “integrating the 7.7 engine” in 8.3 means: porting all v7.7 hardening into both the Python server and
  the Cloudflare Worker, and **rebuilding the v7.7 renderer** into a much better one (same orbit camera,
  terrain wave and builder ideas, but new lighting, shadows, water, sky, characters and performance).

## New 3D renderer (`web/js/renderer3d.js`, WebGL1, no libraries)
* Static GPU meshes built once per world (the old renderer rebuilt every triangle every frame).
* Sun + sky + ground lighting, rim light, distance fog; **real-time shadow maps** (2048/1024, soft 4-tap).
* Island landscape (`web/js/world3d.js`): meadows, footpaths that lead new players to the first resources,
  a pond, beaches and sea to the north-west, mountains with snow to the south-east.
* Animated **water** with waves, sky reflections, sun glints and see-through shallows.
* **Sky**: gradient, sun disc and glow, moon, twinkling stars at night, drifting clouds; 24-tick day/night tied
  to the world clock; weather (rain streaks, mist fog, windier trees).
* ~950 trees, bushes, rocks, flowers and grass tufts with wind sway; glowing crystal clusters, log piles,
  boulders, quest board, flickering campfires, shelters.
* Animated explorers (walk cycle, sword that changes with your weapon, attack/collect moves, cape),
  wolves (red eyes, tail, gait) and Silverhart (antlers); smooth movement and facing.
* Click picking, name labels with health bars, gold guide arrows to the next goal.
* **Adaptive quality** (High/Medium/Low) based on frame time; manual override in Settings.

## Controls and ergonomics
* W A S D / arrow keys **relative to the camera**, hold to keep walking, diagonals alternate smoothly,
  a quick tap moves one square.
* **Click/tap to move** (path-finding around shelters); click a crystal/log/rock to walk over and collect;
  click a wolf to walk up and attack.
* Mouse drag / one-finger drag to **orbit**, wheel / pinch to **zoom**, C to reset camera.
* **Touch joystick** on phones/tablets (or always, via Settings), phone-friendly layout.
* Big **context button** (“E · Collect crystal”, “F · Attack Mossfang”, “R · Rest by the fire”).
* Hotbar with key labels, **help overlay** (H or ?), tabs to declutter the side panel, minimap.
* Instant friendly feedback using a client copy of the rules (`web/js/rules.js`); the server still decides.

## Adaptive tips (`web/js/hints.js`)
One tip at a time, chosen from what the player has actually done: move → collect → accept quest → make a potion →
gather for a campfire → build → claim reward → Stone Sword → Wolf Watch → Academy → Tiny Life Lab.
Low health, hunger and mistakes jump the queue with specific advice. Touch devices get touch wording.

## Plain English (`web/js/text.js`) for curious ~11-year-olds
| Before | After |
|---|---|
| Horn rule set / Compute μΓ least fixed point | If-then puzzle / Solve the puzzle |
| Create integrity receipt (SHA-256) | Make a proof stamp (“like a fingerprint of the tiny world”) |
| hash-chained ledger · VERIFIED | tamper-proof diary · Diary check OK ✔ |
| Evidence-grade a world claim · OPEN CONJECTURE | How sure can we be? · “Not proven yet — still a mystery” |
| Submit hypothesis / Record experiment / reproducible | Write down my guess / Record what I saw / Repeat the test to check — “same result twice” |
| Read celestial signs | Read my star story (make-believe) |
| Awaken character · Arcane adept | Create character · Wizard (make-believe magic) |
| need 32 research aptitude points; gain XP or practice automation | You need 32 invention points. Points = your XP + 3 × your Automation practice… |
| rest_requires_nearby_camp | You can only rest next to a campfire or shelter. Build a campfire first (2 wood + 1 stone). |
| Agents / Life tick | Creatures alive / Steps so far |
Magic and star signs are labelled **make-believe** everywhere; the Tiny Life Lab says plainly it isn’t alive or aware.

## Online hardening (ported from v7.7) — Python server and Cloudflare Worker
* `POST /api/auth/ws-ticket` → one-time, 60-second WebSocket ticket (session tokens never go in URLs).
* Auth rate limit (12 per minute per client) → 429 `rate_limited_try_again_later`.
* Strict world ids `[A-Za-z0-9_-]{1,64}`; `GET /ready`; CSP + security headers; no-cache for `index.html`/`sw.js`.
* `/health` reports `version: 8.3.0` and `accounts_required`.
* Live mode connects automatically after sign-in when the server supports it (Cloudflare Durable Object).

## Child-safety choices
No free-text player chat was added to the UI (the engine’s chat action exists but is not exposed). The
password tip suggests asking a grown-up. No adverts, tracking or external requests (strict CSP, same-origin only).

## Tests
* Python: 120 passed (includes `tests/test_v83_online.py`).
* Node: 19 passed — Worker parity/API tests plus new `cloudflare/test/ui.test.mjs` (plain-English errors,
  make-believe labels, adaptive hints, camera-relative keys at every angle, joystick, path-finding,
  landscape keeps gameplay squares dry and clear, client rules agree with the real engine).
* Playwright with SwiftShader software WebGL: see the v8.3 report.

## Release files
`RELEASE_MANIFEST.json` and `SHA256SUMS.txt` are the original 8.2.0 package record and were not regenerated.
