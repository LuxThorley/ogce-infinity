# Strata: Lux Genesis (v9.0) architecture

```
Browser (web/)                              Cloudflare Worker (cloudflare/src)                    Upstream
 app.js ── renderer3d.js + shaders90.js      index.js ─ routes /health /ready /ws /api/* /s/*
   ├─ strata.js (Journal, Codex, Malcolm)    app.js  ─ OGCEApp in a SQLite Durable Object
   ├─ expedition.js (omniverse map, Bard)      ├─ runtime.js (v7.4 world), living82.js, mulux.js
   ├─ voice.js + voicegrammar.js               ├─ v90.js (ranks, Codex, events, safety)
   ├─ cardrender.js, codexgraph.js, audio.js   ├─ omniverse.js (worlds, ecology, inventions, canon cards)
   └─ minimap.js (2D fallback)                 ├─ bard.js (Shakespeare-inspired NPC engine)
                                               └─ malcolm.js ── POST /v1/chat (Bearer secret) ──▶ Malcolm OmniAPI
```

* **One source of truth per rule set.** Python modules in `ogce4/v90/` (`chronicle.py`, `safety.py`, `omniverse.py`, `bard.py`) are canonical. The Worker
  has exact JS ports; `cloudflare/tools/gen_fixtures.py` writes golden fixtures that `node --test` replays. Hashes are integer-only (`Math.imul`, `>>> 0`).
* **Shared data:** `omni.json` (realms, biomes, recipes, factions, discovery, canon) and `bard.json` (cast persona sheets, intents, limits) are imported by both runtimes.
  `web/js/voicegrammar.js` and `web/js/cardrender.js` are shared by the browser and the Worker.
* **Authority:** the browser only asks; the Worker validates every action (game actions, omniverse ops, voice actions, NPC actions) and persists in Durable Object SQL
  (`omni_v90`, `omni_players_v90`, `shares_v90`, `malcolm_usage`).

## Malcolm and fallbacks
`companion()` (modes guide/explain/lore/npc/invent/voice) and the Bard route call upstream only when `OGCE_MALCOLM_ENABLED=yes`, a token secret exists and the player is
signed in. Unsafe input never leaves the Worker; output is PII-redacted and re-classified; anything unusual falls back to the deterministic offline engines.
Limits: 20 per 10 minutes and 100 per day per account, 300 per hour globally. Bard adds 12 per minute and 300 per day per player.

## Bard turn
1. Rate limit → load explorer → check the player is within 3 squares in the NPC's realm.
2. `turnContext` computes intent, the seeded roll, the actions allowed right now, relationship, memory and history.
3. Signed in + enabled → `bardPrompt` (persona sheet, care notes, state, memory, allowed actions; the secret only when it may be revealed) → `/v1/chat` → `parseBardReply`.
4. `converse` moderates, picks the live reply or the offline line, validates and applies actions, updates relationship and memory, and returns what to say plus the voice profile.

## Voice
SpeechRecognition (push-to-talk or wake word) → local grammar → whitelist → `execute()` in app.js. Unknown requests go to Malcolm `voice` mode, which returns `{say, actions}` that
are validated again. During an NPC conversation, speech goes to the character; “command …” escapes to the grammar. NPC replies use `speechSynthesis` with per-character
voice, pitch and rate, and are always captioned.

## Deployment
* Preview: `npx wrangler deploy --env preview` → Worker `ogce-infinity-preview` (workers.dev only, separate Durable Object).
* Production (`ogce-infinity`, ogce.malcolmai.live) stays on v8.3 until the owner approves.


## v9.0 additions (late in the cycle)
```
Browser                                         Worker / Durable Objects
 multiplayer.js  (Together, leaderboard UI)  ──▶ index.js: /api/v90/room/new → fresh code → DO "room:<CODE>"
 voicechat.js    (WebRTC mesh, STUN only)        paths with room/<CODE> or sw_<CODE>, and /ws?room=CODE → that room's DO
 netsync.js      (Interpolator/Predictor)        mpapi.js (rooms, social, Houses, Hall, events, weekly, arena, leaderboard)
 mysticui.js + mystic.js + lore.js            ──▶ app.js /api/v90/mystic|lore|director/<world>
 directorclient.js                                rooms.js (RoomHub: presence, quick chat, chat, voice signalling)
 access.js, photo.js, opening.js, music.js        social.js, leaderboard.js, moderation.js, director.js
 offline.js + vendor/runtime.js (same rules)      main DO "ogce-main" is the directory (accounts, friends, Houses, Hall, boards);
 sw.js (pre-caches the whole shell)               room DOs call it through RemoteDirectory (/api/internal/*, OGCE_SERVICE_TOKEN)
```
* `web/js/vendor/runtime.js` and `pyjson.js` are generated copies of the Worker's world rules (`cloudflare/tools/vendor_runtime.mjs`); a test fails if they drift.
* JS-only systems (no Python port): rooms, social, moderation, leaderboard, director, lore, client UI. Python stays canonical for engine, omniverse,
  Bard, combat, genesis and mystic (parity fixtures in `cloudflare/test/fixtures.json`).
* Room worlds are named `sw_<CODE>`; the client switches to them with `?room=CODE`. Live state in rooms (presence, voice flags) is memory-only.
