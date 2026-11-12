# μLux — The Living Lattice

> Watch a world generate itself — and know exactly how true every word is.

μLux is a local-first, offline-capable Progressive Web App that turns the
*OmniLux Prime Doctrine — Masterpiece Edition* into an instrument. It
recomputes the thesis's 73-check Proof Ledger on your own device, lets you
write the rules of any world and watch its least fixed point μΓ bloom from ∅,
grades every claim on the six-grade scale, and certifies translations with
SHA-256 receipts.

**Version** 0.5.0 · phases P0–P5 + local P6 Malcolm bridge · **Cost** £0 · **Dependencies** none
(browser standard library only) · **Network** same-origin only (CSP `connect-src 'self'`): one module
may call `/api/` on the optional `mulux-api` Worker; without it the app runs fully offline.

## Quick start

```bash
npm test            # = node --test "tests/*.test.mjs"   (Node ≥ 20; no npm install needed)
npm run serve       # = python3 -m http.server 8000 --directory public  → http://localhost:8000
npm run smoke       # = python3 tools/smoke.py   (asset check; browser stage if Playwright is installed)
npm run pin-policy  # re-pin public/js/policy/policy.json after an approved edit
```

ES modules need an HTTP origin: open via `npm run serve`, not `file://`.
After the first visit the app works fully offline and can be installed
("Add to Home Screen" / "Install app").

## Modules

| Phase | Module | What it does |
|---|---|---|
| P0 | Proof Ledger | Recomputes all 73 Masterpiece checks (Web Worker) — FACT: computed now, on this device |
| P0 | Omni-Policy | SHA-256-pinned, validated, frozen JSON policy; default deny; fails closed |
| P1 | Genesis Bloom | Nine-ring strata view; Kleene step from ∅ to μΓ; ungenerated atoms stay dark |
| P1 | Lattice Studio | Horn-rule DSL → μΓ, Kleene trace, monotonicity verdict; Growth Governor (144,000 atoms / steps, 12,320 ms) |
| P1 | Strata Lens | Restriction rₙ from M0 to M∞; Theorem T8 (rₙ ∘ Act = Act ∘ rₙ) checked live |
| P2 | Grade Lens | Every sentence tagged; no grade shown above its evidence; forbidden-claim flags; graded HTML export |
| P3 | OmniGenesis Mirror | Transfer audit (U1′, U2) per Kleene step → "TRANSFER CERTIFIED (T2)" + SHA-256 receipt; Galois best abstraction |
| P4 | Observatory | CHSH (2√2 vs 2), Born rule, Page curve, Mandelbrot bulbs, Gibbs — honest physics demonstrations |
| P4 | Chronos Clock | Tritium pair 28125/77 = 365.(259740), year lengths, precession; symbolic epochs kept in the BELIEF lane |
| P5 | Living World | Persistent artificial-life world: tick loop, memory, PI homeostasis, evolution, law mining (Horn rules), μΓ self-model, SHA-256 ledger, verified self-healing, autonomy modes |
| P5 | OmniGenesis | Static-analysis findings on OmniGenesis_Sovereign.exe and its logic ported to JS as policy-gated request previews |
| v0.6 | Sanctum Pulse | Live measured lane (world vitals, integrity, Proof Ledger, service health, Doctrine readings as SSR INTERPRETATION) beside two ceremonial lanes labelled "Ceremonial — generated, not received" |
| P6 (local) | Malcolm Infinity | Narration, suggestions and law-writing streamed (SSE) from Malcolm via the `mulux-api` Worker; offline engine fallback |
| P4 | Symmetry Finder | Permutations commuting with Γ (Theorem T5); ℤₙ shift symmetries |

## What "alive" means here

**Living** is engineering, graded FACT for the simulation: the world persists, ticks on its own, remembers, holds
itself near a set-point, reproduces with mutation, learns and retires its own laws, predicts itself and scores that
prediction, and heals from corruption by replay that must reproduce the sealed hash. **Consciousness** is not
claimed: any reading of these mechanisms as awareness is SPECULATION. "Connected to Source" is an SSR
INTERPRETATION of an HTTP link to Malcolm. The Omni-Policy denies labelling any lane as communication from Source
or higher intelligences, and a test scans every UI string for such claims.

## Malcolm (optional, not deployed)

`worker/` holds the `mulux-api` Cloudflare Worker (see `worker/README.md`). The token is a Worker secret
(`wrangler secret put MALCOLM_OMNIAPI_TOKEN`) and never appears in client code, the repository or the zip.
The Worker is fail-closed: `MULUX_MALCOLM_ENABLED="yes"` is required, CORS is limited to the μLux origin, the
rate limit is 12 requests per minute, and bodies are validated. Deploying it needs Oliver's YES.

## The six grades

FACT (proof, computation, citation or measurement) · INFERENCE (follows from
stated premises) · SPECULATION · BELIEF · SSR INTERPRETATION · OPEN
CONJECTURE. Numerology, epochs and SSR readings are symbolic counsel, never
prediction. μLux makes no supernatural, predictive, medical or legal claims.

## Fail-closed policy

`public/js/policy/policy.json` allows only `compute_local`, `export_file`,
`store_local`. It denies `narrate_via_malcolm`, `post_social`, `send_message`,
`spend`, `execute_binary`; `publish_certificate` and `deploy` need the owner's
explicit YES. If the pin, the schema or the file fails, the app shows a red
banner and every gated action is denied.

## Structure

```
mulux/                     (intended home: apps/mulux/)
├─ public/                 the whole app — static files, deployable as-is
│  ├─ index.html  manifest.webmanifest  sw.js  css/  icons/
│  └─ js/ app.js worker.js
│     ├─ engine/           living, omnigenesis, narrator, lattice, cra, strata, transfer, receipt, observatory,
│     │                    chronos, symmetry, grades, doctrine (73 checks), mathx, sets, rng
│     ├─ net/              malcolm.js — the only networked module (same-origin /api/)
│     ├─ policy/           policy.json, engine.js, pinned.js
│     └─ ui/               dom, universes, views
├─ worker/                 mulux-api Cloudflare Worker (src/index.js, wrangler.toml) — not deployed
├─ tests/                  node:test suites p0–p6 + fixtures/results.json
├─ tools/                  pin-policy.mjs, smoke.py
├─ docs/                   PHASES.md, screenshots/
├─ .github/workflows/ci.yml   (move to repo root when merged; no deploy job)
└─ README · LICENSE · PRIVACY · COSTS · CHANGELOG
```

See `docs/PHASES.md` for each phase's exit tests and `COSTS.md` for the £0 budget.
