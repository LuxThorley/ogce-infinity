# Strata: Lux Genesis (v9.0): feature matrix across every OGCE version

Strata: Lux Genesis is version **9.0.0** of the game built on the **OGCE engine** (repo `LuxThorley/ogce-infinity`, branch `v9.0`).
This matrix lists every feature from every version (v3.1 to v8.3), the supplied uploads and the PDF, and how each is carried into v9.0.

**Key.** ✅ playable in the v9.0 browser game and Worker · 🧩 kept in the Python engine, CLI or legacy tree (tested, not a web feature) ·
🔁 superseded by a better v9.0 system · ➖ not ported (reason given).

Honesty labels used in the game: **FACT** (established science/maths), **SSR/CRA THEORY** (Oliver Lux Prime Thorley's own framework, not established science),
**IN-GAME** (game fiction or mechanics). Creatures, plants and characters are **simulated**: seeded rules, not living or conscious. Mystical content is **symbolic and make-believe**.

## 1. Version-by-version

| Version | Feature | v9.0 status |
|---|---|---|
| v3.1 | Original archive (project/scene/assets, early metaphysics modules) | 🧩 preserved verbatim in `legacy/` |
| v4.0 | Project/scene/asset model, editor, SQLite foundation | 🧩 `ogce4/` Python modules |
| v4.0 | Matchmaking, multiplayer scores, squad coordination, anti-cheat hooks, reports | 🧩 Python; 🔁 live multiplayer is the Durable Object world (§2) |
| v4.0 | Plugin registry; provider-neutral Source/Malcolm adapter contracts | 🧩 Python; 🔁 Malcolm OmniAPI is the Worker proxy (§5) |
| v4.0 | Consented biofeedback | ➖ not in a teen web game: no sensors, and it would mean collecting health data |
| v4.0 | Symbolic metaphysics, Omni-Lattice modes | ✅ mystical discoveries, Strata realms, the Lux obelisk (always labelled symbolic) |
| v4.1 | PBR material descriptors, lighting/shadow settings, glTF inspection | ✅ PBR (GGX metal/roughness) in the WebGL renderer; 🧩 glTF validator in Python |
| v4.1 | Seeded procedural heightfield terrain | ✅ HD terrain; ✅ infinite seeded omniverse chunks |
| v4.1 | Frame-time profiler, budgets | ✅ auto quality tiers measure FPS and move between Low/Medium/High/Ultra |
| v4.1 | Undo/redo, docking layouts, platform QA | 🧩 Python editor tooling |
| v5.0 | OmniGenesis ten-core vocabulary; OmniLux finite lattice; CRA 33-atom model; nine strata; least fixed point; epistemic grading | ✅ Strata realms and SSR palette, canon validation engine (§4), Horn-rule genesis and six-grade ledger in Tiny Life Lab; 🧩 Python |
| v5.1 | Provider-neutral AI adapter | 🔁 Malcolm Worker proxy with secret token and offline fallback |
| v5.1 | Loopback world service, SQLite persistence, ticks, event log | 🔁 Cloudflare Durable Object (SQLite) |
| v5.1 | Panda3D terrain preview, JSON export | 🧩 Python; 🔁 WebGL renderer in the browser |
| v5.1 | API keys, HMAC licence verifier, billing interfaces | 🧩 Python; ➖ no billing in the game (£0, teen audience) |
| v5.2 | Planetary/biome/climate generation | ✅ 9 biomes × 5 realms + player-seeded realms, infinite chunks |
| v5.2 | Oceans, weather, climate | ✅ animated reflective water, seasons, weather and world events |
| v5.2 | Ecosystems/NPC records | ✅ living Wildwood ecology (§3) |
| v5.2 | Settlements/economy | ✅ town progress (v8.2), crafting, NPC trade (§6) |
| v5.2 | Template quests and chronicle | ✅ quests, bounties, story arcs, chronicle |
| v5.2 | Streaming/LOD | ✅ chunk streaming with LOD 0/1/2 and caching |
| v5.2 | Revision-checked shared state | ✅ Durable Object revisions |
| v5.2 | Adaptive simulation with approval gate | ✅ adaptive difficulty; owner-YES policy card for risky ops |
| v5.3 | Utility-scored NPC actions, needs, memory, relationships | ✅ creature utility AI; ✅ NPC memory and relationships (§6) |
| v5.3 | Food web, civilisation diplomacy/trade, events, world tick | ✅ ecology + factions + reputation + world events; 🧩 Python v5.3 |
| v6.0 | SQLite WAL persistence, players, planning, economy, authoritative commands | ✅ Worker authority + DO SQLite; 🧩 Python |
| v6.0 | HTTPS Malcolm client with env token | 🔁 Worker secret, never in client or repo |
| v6.1 | Persistent agent memory, governed AI orchestration (allowlisted tools) | ✅ same pattern: Malcolm and NPCs may only propose whitelisted actions that the server validates |
| v6.1 | Malcolm feed polling, local HTTP service | 🧩 Python |
| v6.2 | Agent society scheduler, relationship-aware dialogue templates, lexical retrieval | ✅ offline persona engine (§6); 🧩 Python |
| v6.2 | Multiplayer rooms/transport protocol | 🔁 real WebSocket rooms in the Durable Object |
| v7.0 | Browser/PWA client, touch + keyboard, 2D top-down map | ✅ PWA; ✅ 2D map kept as minimap and no-WebGL fallback |
| v7.0 | Server-authoritative movement, gather, build, chat, ticks; WebSocket | ✅ |
| v7.4 | Survival RPG loop: explore, gather, craft, campfires, potions, weapons, Moss Wolves, Silverhart, quests, levels | ✅ unchanged rules (Adventure mode) |
| v7.7 | PBKDF2 accounts, hashed sessions, one-time 60 s WebSocket tickets, auth rate limits, strict world ids, CSP, /ready | ✅ Python server and Worker |
| v7.7 | Docker, Caddy TLS, backups | 🧩 kept for self-hosting |
| v8.0 | μLux: Horn-rule least fixed point, six-grade evidence ledger, fail-closed decisions, artificial life, hash-chained ledger, receipts | ✅ Tiny Life Lab mode |
| v8.2 | Arcane/scientific/hybrid paths, make-believe spells, celestial calendar, hypothesis/observation/repeatability, inventions, town progress, hash-chain integrity | ✅ Magic & Science mode (Academy) |
| v8.3 | New WebGL renderer, intuitive controls, adaptive tips, plain-English UI, preview environment | ✅ consolidated into the v9.0 HD renderer (§7) |
| **v9.0** | Strata layer: title screen, Journal (ranks, bounties, arcs, achievements), Codex (GCSE lessons with real equations, units, graphs and quizzes; SSR/CRA labelled as theory), world events and seasons, adaptive difficulty, ambient audio | ✅ |
| **v9.0** | Malcolm OmniAPI companion (guide, explain, lore, NPC, invent, voice) with deterministic offline fallback | ✅ (§5) |
| **v9.0** | Omniverse: infinite seeded worlds, realms, living ecology, crafting, building, factions, endings, customisation | ✅ (§3) |
| **v9.0** | Player discoveries and inventions; canon validation engine; Copy/Markdown/Print-PDF/Share cards | ✅ (§4) |
| **v9.0** | Voice control (Web Speech API) | ✅ (§8) |
| **v9.0** | Open AI-driven conversations with Shakespeare-inspired NPCs | ✅ (§6) |

### Uploads and PDF (v8.4 source pack)
| Source | What it contributed | v9.0 status |
|---|---|---|
| OGCE version zips (v7.x to v8.3 lineage) | Gameplay, renderer, online hardening, μLux, Academy | ✅ audited; every gameplay feature kept (see table above) |
| OmniLux Prime Masterpiece + SSR/CRA theses (PDF, `ssr.txt`, number register) | Constants 4500, 12.32, 72, 144, 144 000, 26 000, 365.26 = 4500/12.32; strata M0–M7+; epistemic grading | ✅ canon validation engine and labelled Codex lessons. Always labelled theory, never presented as proven |
| Windows executables inside archives | none | ➖ never executed (read-only audit, as instructed) |

## 2. Modes and core loop
| Feature | Status |
|---|---|
| Adventure (v7.4 survival RPG), Magic & Science (v8.2 Academy), Tiny Life Lab (v8.0 μLux): three modes on tabs | ✅ |
| WASD/arrows, click/tap-to-walk, joystick, orbit/pinch camera, context button, adaptive tips | ✅ |
| Accounts, guests, live multiplayer over WebSocket tickets, player chat (moderated) | ✅ |
| Title screen, ranks Wanderer → Genesis Archon, bounties, arcs, achievements, world events | ✅ |

## 3. Omniverse (“simulated life”, labelled in-game)
| Feature | Status |
|---|---|
| Seeded, effectively infinite 16×16 chunks; LOD 0/1/2; cached streaming | ✅ |
| 5 realms (Aurelia, Verdant, Ember, Frostveil, Luxfall) + player-seeded realms; 9 biomes | ✅ |
| Persistent world changes (harvest, build) with regrowth after 60 ticks; saplings grow into trees after 30 | ✅ |
| Wildwood ecology: mossbacks, duskwolves, glowmoths, plants; needs-based utility AI, memory, reproduction with heritable traits and mutation | ✅ |
| Census table and population chart; player choices change ecology policy (e.g. wolf limit) | ✅ |
| Items, recipes, tools, teen-safe weapons (sling “nothing is hurt”, make-believe Lux staff) | ✅ |
| Factions and reputation, branching dialogue, 5 endings, appearance customisation (also shown on the 3D avatar) | ✅ |
| Deterministic integer engine, Python ↔ JS parity fixtures | ✅ |

## 4. Discoveries, inventions and the canon validation engine
| Feature | Status |
|---|---|
| 16 principles (scientific, technological, mystical: symbolic and in-game only) with unlock requirements | ✅ |
| Compose category + form (tool/ability/structure/effect/ritual) + principles + materials (+ observation) | ✅ |
| Canon laws: conservation (power ≤ budget), carrier (≤ 144 inventions), stratum ascent, harmonic 72·power mod 144 bonus, fair test (144 seeded trials, works if > 72), 12.32-day half-life | ✅ |
| Inventions change the world (harvest perks, structures alter ecology), NPC remarks and future options | ✅ |
| Malcolm names and explains (tagged lines), template fallback | ✅ |
| Cards: every statement labelled FACT / SSR/CRA THEORY / IN-GAME, MathML formulas, no-proof disclaimer; Copy, Markdown, Print/PDF, read-only share link `/s/<id>` (no personal data, rate-limited, moderated, strict CSP) | ✅ |

## 5. Malcolm OmniAPI (server-side only)
| Feature | Status |
|---|---|
| Worker proxy to `malcolmai-live…/v1/chat`; token only as a Worker secret | ✅ |
| Modes: guide, explain, lore, npc, invent, voice; Bard NPC persona prompts | ✅ |
| Fail-closed: `OGCE_MALCOLM_ENABLED=yes` + token + signed-in; otherwise deterministic offline replies | ✅ |
| Limits: 20 per 10 minutes and 100 per day per account, 300 per hour globally | ✅ |
| Teen safety: PII redaction, input/output classifiers, Childline/999 signposting, injection resistance | ✅ |

## 6. Bard: open, AI-driven conversation with Shakespeare-inspired NPCs
| Feature | Status |
|---|---|
| 18 NPCs, each modelled on a Shakespeare character: tragedies (Iago, Hamlet, Lady Macbeth, Cleopatra, Lear), comedies (Rosalind→Ilsa, Bottom→Bram, Beatrice, Puck, Shylock, Viola), histories (Falstaff, Prince Hal), romances (Prospero→Oru, Autolycus→Rook, Caliban, Ariel), poems (the Sonneteer) | ✅ |
| Persona sheet: personality, intentions, secret agenda, relationships, speech style (light Early Modern English), voice profile, quests, trade stock, short credited quotations | ✅ |
| Sensitive roles handled with care notes (Shylock with dignity and no stereotypes; Caliban never called a monster; Cleopatra without romance) | ✅ |
| Typed chat and spoken chat (voice control routes speech to the character; “command …” escapes to game commands) | ✅ |
| Server-side Malcolm proxy with persona + per-player memory, history, relationship and reputation | ✅ |
| Structured NPC actions validated against a whitelist and game state: give_quest, complete_quest, trade (fair value), betray (harmless trick, cooldown), ally, reveal_secret (earned), gift | ✅ |
| Seeded temperament roll per turn (persona “temper”) for reproducible unpredictability | ✅ |
| Secrets never sent to the browser or to Malcolm until they may be revealed | ✅ |
| Moderation on input and output; per-player limits (12/minute, 300/day) plus Malcolm's limits | ✅ |
| Distinct browser voice, pitch and rate per character via speechSynthesis (£0), with captions and a mute toggle | ✅ |
| Offline fallback: deterministic persona engine with ~490 lines (intents: greet, quest, trade, secret, ally, insult, compliment, quote, self, other characters, topics, farewell) | ✅ |

## 7. Graphics
| Feature | Origin | v9.0 |
|---|---|---|
| 2D tile map | v7.0 | ✅ minimap + no-WebGL fallback |
| Vertex-colour terrain, depth fog, day/night | v7.7/v8.0/v8.2 | ✅ finer terrain with baked AO |
| Shadow maps, cloud/star sky, Fresnel water, wind sway, animated actors, picking | v8.3 | ✅ upgraded |
| PBR, tone mapping, gamma, AO probes, post-FX chain, LOD, ocean/storm (Python specs) | v4.1–v5.2 | ✅ implemented on the GPU |
| HDR target (half-float when available), ACES tone mapping + grading | new | ✅ |
| Bloom, SSAO, FXAA | new | ✅ (bloom High+, SSAO Ultra) |
| 2-cascade Poisson-PCF soft shadows (1024–4096) | new | ✅ |
| GGX lighting, planar water reflections, shoreline foam, caustics | new | ✅ |
| Atmospheric-scattering sky, aurora, meteors, Milky Way; seasons (autumn, snow) | new | ✅ |
| GPU particles; strata pillars; Lux obelisk; PBR crystals; detailed characters with customisation | new | ✅ |
| Auto quality tiers Low/Medium/High + opt-in Ultra, DPR-aware, FPS-driven | new | ✅ |
| Expedition omniverse map (2D canvas, LOD) | new | ✅ (a full 3D omniverse renderer is deferred) |
| Ultra at full native devicePixelRatio (≤3×) + render-scale 50–100% | new (photoreal push) | ✅ |
| Procedural PBR detail maps (albedo/normal/roughness from tileable fbm, 256–1024 px), triplanar, anisotropic | new | ✅ Medium+ |
| Depth of field (photo mode, cinematics) | new | ✅ any post tier |
| Screen-space light shafts; volumetric-style exponential height fog | new | ✅ High+ / Medium+ |
| Water refraction with Beer–Lambert absorption (plus reflections and Fresnel) | new | ✅ High+ |
| Instanced grass with wind, distance fade/sink LOD and tuft impostor cards | new | ✅ ~2.6k/9k/27k instances |
| TAA | requested | ❌ not done: FXAA only (TAA needs motion vectors and history buffers; judged too heavy for WebGL1 phones) |
| Cascaded shadows beyond 2 cascades; true volumetric clouds (ray-marched) | requested | ⚠️ 2 cascades; clouds are fbm on the sky dome |


Before/after screenshots: `/workspace/ogce/screenshots/v83-*.png` (before) and `v90-*.png` (after). Tier comparison: `v90gfx-{low,medium,high,ultra}.png` and `-close.png`.

## 8. Voice control (Web Speech API, £0)
| Feature | Status |
|---|---|
| SpeechRecognition push-to-talk (hold V or 🎙️), optional wake word (“Malcolm …”), live captions | ✅ |
| Deterministic local grammar: movement, modes, crafting, inventory, building, settings, camera, help, bounties, travel, talk to any NPC, customise, invent | ✅ |
| Free-form requests → Malcolm → structured action list validated against the whitelist (client and Worker) | ✅ |
| Confirmation for destructive actions; optional spoken replies; typed fallback (/) | ✅ |
| Accessibility: ARIA live regions, captions, keyboard-only use, reduced-motion support | ✅ |
| Privacy: audio is never recorded or stored by the game; only the transcript text is sent | ✅ |

## 8b. Design backbone, combat and camera (details in `docs/V9_0_DESIGN.md`)
| Feature | Status |
|---|---|
| Premise, Lux, 8 strata (M0–M7), 7 core laws, 4 endings, measures, rewards, New Genesis + legacy (Python canonical, JS port, parity-tested) | ✅ |
| Combat: light/heavy, 3-hit combos, block, dodge, parry, stamina, poise, adaptive enemies, 11 specials, player-invented specials, replay-verified | ✅ |
| Camera: first/third person, smoothing, sensitivity, inversion, shoulder, FOV, head bob, presets, 3 saved views, gamepad, rebindable keys | ✅ |

## 11. Mysticism (MYSTICAL/IN-GAME; JS + Python parity)
| Feature | Origin | Status |
|---|---|---|
| Spells and the rune of sparks | v8.2 | ✅ ported as `rune_spark`, plus rune_ward/wind/star |
| Academy paths (elementalism, restoration, astralism, warding) | v8.2 | ✅ schools linked to the Sun's element |
| MuLux ceremony lane | v8.x | ✅ echoed as sacred-site blessings (Sallow stream, Lattice stones, Moonwell, Ember altar, Battlements, Star Dais) |
| Grand Year 26 000 years / zodiacal filter (PDF) | PDF | ✅ Grand Year view (FACT: precession ~25 772 years; theory and in-game texts labelled) |
| Sky: 365.26-day year, moon phases, 5 planets, alignments, grand alignment, capped duel effects | new | ✅ server-authoritative |
| Spirits (6) and star-chart puzzles (3 a day) | new | ✅ |

## 12. Together (multiplayer) and the Omniversal Leaderboard
| Feature | Status |
|---|---|
| Invite-code rooms 2–8, one Durable Object per world (`room:<CODE>`), `?room=CODE` links | ✅ |
| Co-op quests, split-clue law puzzles, shared Codex, co-invention with joint credit, Hall of Discoveries, NPC group memory | ✅ |
| Friends by code, privacy (Children's Code defaults), block/mute/report, display names checked before use | ✅ |
| Houses (charter, banner, motto, stash, roles, invites), community events, weekly seeded trials, opt-in arenas | ✅ |
| Quick chat + emotes on by default; opt-in free text chat with layered moderation (fails closed) | ✅ |
| Voice chat: opt-in push-to-talk, WebRTC mesh, STUN only | ✅ (no TURN: some strict NATs cannot connect; quick chat is the fallback) |
| Leaderboard: 9 categories, all-time/season/weekly, global/friends/House, legends, cosmetic rewards, anti-cheat | ✅ |
| Room-mates' customised avatars in 3D | ✅ skin, hair, outfit, hat and cape travel as palette indices only (validated against the palette, no free text) in `hello`/`roster`/`joined` and a `look` message on change; the renderer draws each room-mate with their own look. |
| Smooth remote movement | ⚠️ the world is tile-based and server-authoritative; remote players animate between tiles. The continuous `pos` channel and `Interpolator` exist and are tested but are not used by the tile world. |

## 13. Extras
| Feature | Status |
|---|---|
| Cinematic opening + First Light tutorial | ✅ (procedural 2D canvas cinematic, ~20 s, not a 3D cut-scene) |
| Photo mode (free camera, filters, frames, DoF, PNG share/download) | ✅ |
| Accessibility: colour-blind, subtitles (speech + SFX), text scale, high contrast, reduced motion, remapping, one-handed | ✅ |
| Installable PWA, offline solo play, reconnect sync | ✅ (offline practice is a separate local world; it does not merge into the server world) |
| Malcolm narrator/director | ✅ |
| Procedural adaptive soundtrack | ✅ (generative synth; pleasant but simple) |
| Healthy play (break reminders, no streaks/loot boxes/paid currency) | ✅ test-enforced |
| Lore: glyphs, Sallow stream, 365.26-day Solar Return, 12 Canon pages | ✅ |

## 9. Not ported, and why
* **Consented biofeedback (v4.0):** needs sensors and health data; inappropriate for a teen browser game.
* **Billing/licensing (v5.1):** £0 budget and a teen audience; kept in Python only.
* **Panda3D desktop renderer and editor (v4.x/v5.x):** a desktop tool; the browser game uses WebGL. Kept in Python.
* **Malcolm feed polling / local HTTP services (v6.1):** replaced by the Worker and Durable Object.
* **Windows executables in the uploads:** never run (security instruction).

## 10. Deferred (honest list)
* TAA (FXAA only), more than two shadow cascades, ray-marched volumetric clouds.
* A Python port of the Worker-only systems (rooms, social, moderation, leaderboard, director, lore). They are JS-only and tested in JS.
* TURN relay for voice: Cloudflare TURN has no spending cap; Metered Open Relay's hard-capped free tier is £0 but needs a new account (Oliver's YES). See `docs/V9_0_DEPLOY_STATUS.md`.
* Merging offline-practice progress into the server world (it would bypass server authority).
* Full 3D rendering of the omniverse (the Expedition uses a fast 2D streaming map; the 3D world is the home island).
* Multiplayer sync of omniverse (Expedition map) positions. (Room-mates' customised avatars ARE shown in 3D since 9.0.0: see §12.)
* Mechanical invention decay (the 12.32-day half-life currently appears on cards only).
* Boats and travel across open ocean in the omniverse.
* NPCs walking schedules and NPC-to-NPC conversations; voice-to-voice NPC chat without captions is intentionally not offered.
