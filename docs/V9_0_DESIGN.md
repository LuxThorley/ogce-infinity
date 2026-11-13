# Strata: Lux Genesis (v9.0): design backbone, combat and camera

## Premise and objective
You arrive as a newcomer in a fractured, scrambled reality. The strata (SSR layers) have slipped out of order. Climb them, uncover the hidden laws,
invent with them and repair the timeline through the CRA. SSR (Stratified Source Realism) and the CRA (Chronological Realignment Array) are
**Oliver Lux Prime Thorley's theory** and every card, lesson and line that uses them is labelled `SSR/CRA THEORY`; real science is labelled `FACT`;
magic, spirits and astrology are labelled `MYSTICAL/IN-GAME`.

## Structure (canonical: `ogce4/v90/genesis.py` + `genesis.json`; JS port `cloudflare/src/genesis.js`, parity-tested)
* **Lux** is the single progress measure, earned from discoveries, inventions, principles, exploration, allies, secrets, quests, Codex answers,
  choices, combat (wins, specials, invented moves) and crafting. Gains are derived on the server from saved state.
* **8 strata:** M0 · The Fracture → M1 Root → M2 Verdant → M3 Ember → M4 Frost → M5 Lumen → M6 Harmonic → M7 · The Source Stratum.
  Each needs a Lux total and a number of claimed core laws.
* **7 core laws:** Decay, Halves, Drift, Layers, Trials, the Great Year, Return. Each is found through clues and claimed by answering its question.
  (They double as the split-clue co-op puzzles in Together.)
* **4 endings:** Harmony, Power, Sacrifice, The Stranger, chosen at the Source stratum with consequences shown before you confirm.
* **New Genesis:** start again with a legacy (cosmetics, titles and a small head start), never pay-to-win.
* **Rewards** are cosmetic or convenience only (titles, frames, banner charges, trails). Nothing can be bought.

## Combat (canonical: `ogce4/v90/combat.py` + `combat.json`; JS port `web/js/combat.js` shared by browser and Worker)
* Fixed-tick deterministic engine (20 Hz, max 2 400 ticks): light attack (3-hit combo), heavy attack (telegraphed), block (stamina drain),
  dodge (invulnerability frames), parry (3-tick window → stun 16 ticks and a 150% riposte), stamina and poise.
* **Adaptive enemies** track your habits each fight (light/block/dodge/parry shares) and counter the habit you lean on.
* **Specials:** 11 built-in (e.g. Palm Gust, Wayfarer's Arc, Rising Comet, Prism Cascade, Lux Nova, Aegis Ward) with ranks, plus
  **player-invented specials** validated by the canon engine (conservation budget, 72/144 harmonic, 144-trial fair test).
* Anti-cheat: the browser sends only inputs; the Worker replays them with the same engine and seed and stores the verified outcome.
* Director: when enabled, the enemy level in normal duels shifts by the director offset (−2…+2). The in-game sky adds capped effects
  (HP/stamina/special/magic multipliers, focus) to normal duels; weekly and arena trials use neither, for fairness.
* Teen-safe presentation: light, sparks and colour flashes only; foes "yield" or "fade"; no blood or gore.

## Camera (`web/js/camera.js`)
* Third person (over-the-shoulder to far overview) and first person with head bob; smoothing, sensitivity, invert X/Y, shoulder left/centre/right,
  separate FOVs, collision-aware distance, presets and 3 saved views, gamepad right stick.
* **Default keys (documented deviation from the original brief):** `Z/X` rotate, `Y/G` tilt, `L` recenter, `N` toggle first/third person,
  `7/8/9` saved views, `=`/`-` zoom, PageUp/PageDown tilt. Camera keys are processed before game keys, so v9.0's new panels use digits:
  `5` Sky & Spirits, `6` Together, `0` photo mode, and `U` quick chat. Remapping refuses every camera and menu key, and the one-handed
  layouts are tested to never clash with them.

## The sky, lore and director (in-game systems)
* **Sky:** day = tick ÷ 24; the Sun moves through 12 signs over a 365.26-day year; the Moon cycles through 8 phases (29.53 days); five planets
  with real periods (FACT) mapped to faster in-game periods; alignments within 10° and grand alignments (3+ planets within 20°).
* **Lore:** glyph = one spoke per letter, 5 bits per spoke (inner→outer = 16, 8, 4, 2, 1; A = 1). Six glyphs; Sallow's is always visible, the
  others appear after visiting their site. The Solar Return happens at each 365.26-day year boundary (8 766 ticks; rare by design).
  12 Canon pages are derived from progress on the server.
* **Director:** deterministic classification (stuck / bored / racing / flow) → hint level 0–2 and offset ±2 that drift back to 0;
  Malcolm only words a one-line narration (rejected if it contains links, prices, buying or streak language), with fallback lines offline.
