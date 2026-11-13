# Strata: Lux Genesis 9.0.0 (branch `v9.0`), built on the OGCE engine

Everything from v8.3 is kept: the three modes (Adventure, Magic & Science, Tiny Life Lab), the server rules, save data and accounts.
Cross-version coverage: `docs/FEATURE_MATRIX.md` · Design backbone, combat and camera: `docs/V9_0_DESIGN.md` · Architecture: `docs/V9_0_ARCHITECTURE.md` ·
Safety, privacy and the Children's Code: `docs/V9_0_SAFETY.md` · Renderer: `docs/RENDERER.md`.

## New in 9.0
### Identity and core design
* **New name and look:** "Strata: Lux Genesis" title screen, icon, installable app and branding. OGCE stays as the engine name.
* **Design backbone:** a premise (a newcomer in a fractured reality), the Lux measure, 8 strata from *M0 · The Fracture* to *M7 · The Source Stratum*,
  **7 core laws** (Decay, Halves, Drift, Layers, Trials, the Great Year, Return), **4 endings** (Harmony, Power, Sacrifice, The Stranger), measures,
  rewards and a **New Genesis** replay with legacy. SSR/CRA material is always labelled as Oliver Lux Prime Thorley's theory.
* **Cinematic opening** ("reality fracturing": procedural canvas art, captioned, skippable, calm under reduced motion) and **First Light**, a tutorial
  quest woven into the first steps (move → gather → duel → read the sky → open Progress).

### Play
* **Combat:** light/heavy attacks with 3-hit combos, block, dodge (i-frames), parry, stamina and poise, adaptive enemies that learn your habits,
  11 specials plus **player-invented specials** validated by the canon engine. A fixed-tick deterministic engine runs in Python and JS; the server
  replays the inputs to verify every result. Teen-safe: sparks and light, no gore.
* **Camera:** first and third person, smoothing, sensitivity, inversion, shoulder, FOV, head bob, presets and 3 saved views, gamepad, rebindable keys.
* **Mysticism (labelled MYSTICAL/IN-GAME, never science):** an in-game sky (365.26-day year, moon phases, five planets, alignments, the Grand Year),
  six sacred sites with blessings, six spirits (some only at night or full moon), four runes and star-chart puzzles. The sky changes duel powers
  server-side (capped); weekly and arena trials stay unmodified for fairness.
* **Lore Easter eggs:** decodable crop-circle glyphs (one spoke per letter, 5 bits), the Sallow "Healing" stream shrine, the Solar Return every 365.26
  in-game days, and 12 collectible Lux Prime Canon pages (derived on the server, so they cannot be faked).
* **Malcolm as narrator/director:** detects stuck, bored or racing-ahead play from coarse signals; deterministic rules adjust hint level and duel
  difficulty (±2); Malcolm only words the line (fallback lines when offline). Can be switched off.

### Together (multiplayer, £0)
* Invite-code worlds for 2–8 explorers, one server-authoritative Durable Object per world; co-op quests; split-clue law puzzles; shared Codex and
  co-invention with joint credit; the Hall of Discoveries; NPC group memory; Houses (charter, banner, stash, roles); community events; weekly
  seeded trials and opt-in arenas (PvP is never on by default).
* Quick chat and emotes (pre-written) are on by default; free text chat is opt-in and moderated (layered, fails closed).
* Voice chat: opt-in, push-to-talk, WebRTC peer-to-peer mesh with free public STUN only (no TURN, no relay, no recording).
* **Omniversal Leaderboard:** 9 categories (Lux, strata depth, Codex, Hall votes, arena rating, House standings, weekly challenge, community events,
  realignment speedrun), all-time/season/weekly, global/friends/House filters, past-season legends, cosmetic rewards only, anti-cheat (server-derived
  scores, rate caps, replay-verified duels, outlier holds).

### Graphics (photoreal push, still £0 and WebGL1)
* Ultra renders at the full native devicePixelRatio (4K/Retina, capped at 3×) with a render-scale setting (100/85/70/50%), FXAA.
* PBR (GGX metal/roughness) with **procedurally generated detail maps** (albedo variation, normal and roughness from a tileable fbm height field,
  256–1024 px, generated at start-up; no licensed assets), sampled triplanar in world space with anisotropic filtering.
* HDR + ACES, hemispheric ambient, 2-cascade Poisson-PCF soft shadows, SSAO (Ultra), bloom, **depth of field** (photo mode and cinematics, any tier),
  **screen-space light shafts**, volumetric-style **exponential height fog**, scattering sky with fbm clouds.
* Water: planar reflections, Fresnel, **refraction with Beer–Lambert absorption** (High/Ultra), foam and caustics.
* **Instanced grass** (ANGLE_instanced_arrays): wind-animated tapered blades near the player and alpha-cut tuft **impostor cards** further out,
  rebuilt as you move, sinking out at the LOD edge; ~2.6k (Medium), ~9k (High), ~27k (Ultra) instances.
* Low/Medium/High/Ultra tiers with FPS-driven auto-detect; phones start on Medium and never auto-raise above High.

### Extras
* **Photo mode** (key 0 or 📷): free camera, 8 filters, 4 frames, captions, depth of field, PNG download or system share.
* **Accessibility:** colour-blind modes (protanopia, deuteranopia, tritanopia, monochrome), subtitles for speech and sound effects, text scaling
  80–160%, high contrast, reduced motion, fully remappable game keys and one-handed (left/right) layouts that never clash with camera or menu keys.
* **Installable PWA** with offline solo play: the same world rules run locally in an "Offline practice" world; actions that failed because the
  connection dropped are queued and replayed (re-validated) on reconnect.
* **Adaptive soundtrack** (WebAudio, no files): mode/tempo by stratum, time of day, combat; timbre by the in-game Sun's element; shimmer at full moon;
  harmony during alignments.
* **Healthy play:** gentle break reminders (default 45 min, adjustable/off), pause, and no daily streaks, loot boxes, paid currency or FOMO timers
  (enforced by a test that scans the game code).

## Keys added in 9.0
`5` Sky & Spirits · `6` Together · `U` quick-chat wheel · `0` photo mode · camera: `Z/X` rotate, `Y/G` tilt, `L` recenter, `N` first/third person,
`7/8/9` saved views. (Letters were nearly all taken, so the new panels use digits; every game key can be remapped.)

## Tests
* JavaScript: **107** tests (Worker parity, API, combat, camera, Bard, voice, multiplayer, moderation, leaderboard, mystic, director, lore, client systems).
* Python: **219** tests (engine, omniverse, Bard, combat, genesis, mystic, v8.x regressions).
* Browser smoke (Playwright + SwiftShader): `smoke/v90.mjs`, `v90b.mjs`, `v90c.mjs` (opening, tutorial, sky, two-player room with quick chat, leaderboard,
  photo + DoF, accessibility, offline practice) and `gfx.mjs` (all four tiers).


### Late addition (13 Nov 2026)
* Room-mates now see each other's customised avatars (skin, hair, outfit, hat, cape) in 3D. Looks are sent as validated palette indices only (`cleanLook`, `LOOK_MAX`), in `hello`/`roster`/`joined` and a new `look` message. Test: `multiplayer.test.mjs` (JS suite now 108).
