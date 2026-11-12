# μLux v0.6.0 technical dissection

## Scope inspected
The supplied `mulux-v0.6.0.zip` contains 71 archive entries: a dependency-free ES-module PWA,
Node test suites, policy and pinning logic, an optional Cloudflare Worker, documentation, fixtures,
and UI screenshots. Its README identifies the product as local-first and offline-capable. The
package metadata is v0.6.0, while the README still says v0.5.0; the changelog records v0.6.0 on
12 November 2026. This is a documentation/version-label inconsistency, not a runtime feature.

## Architecture and strongest capabilities

| μLux subsystem | Source implementation | OGCE v8.0 disposition |
|---|---|---|
| P0 Proof Ledger | `engine/doctrine.js`, 73 checks, fixture parity | Retained source archive; OGCE's own test and event ledger remain authoritative. |
| Omni-Policy | SHA-256-pinned JSON, strict schema, default deny, fail closed | Ported to native action governor with explicit allow/deny/owner approval. |
| Genesis Bloom / Lattice Studio | Horn-rule DSL, monotone operator, Kleene iteration, growth caps | Ported as bounded `least_fixed_point` API and in-game rule editor. |
| Strata Lens | Restriction and commutation checks | Preserved in reference source; future visualization bridge documented. |
| Grade Lens | Six evidence grades, evidence rank cap, forbidden-claim flags | Ported as `grade_claim`; evidence required for FACT/INFERENCE. |
| OmniGenesis Mirror | Transfer audit, Galois abstraction, SHA-256 receipts | Receipt concept integrated; original theorem-specific JS implementation preserved. |
| Observatory | CHSH, Born rule, Page curve, Mandelbrot, Gibbs | Kept as μLux reference modules; not misrepresented as game physics. |
| Chronos / Symmetry | Symbolic time calculations and commuting permutations | Kept as optional simulation research tools, not predictive metaphysics. |
| Living World | 12×12 torus, genomes, memory, homeostasis, reproduction, law mining, self-model, ledger, replay/heal | Translated into a bounded seeded ecosystem service with durable snapshots and integrity ledger. |
| OmniGenesis bridge | Static-analysis-derived request previews | Replaced by explicit policy-gated intent review; no arbitrary binary execution. |
| Sanctum Pulse | Live vitals + integrity + service health; ceremonial lanes clearly labelled | In-game status/integrity panel; ceremonial streams intentionally excluded from factual telemetry. |
| Malcolm bridge | Optional same-origin Worker proxy; secret kept server-side; explicit enablement | Provider-neutral adapter boundary retained. No Malcolm credentials or live link assumed. |

## Detailed implementation observations
- `public/js/engine/living.js` is the central life simulation. It uses a 12×12 toroidal grid,
  founder population, per-agent genome and 12-entry memory, perception/action/outcome vocabularies,
  PI homeostasis, reproduction/mutation, rule mining/retirement, self-model scoring, a bounded
  catch-up mechanism, SHA-256 state hashing and replay-based healing.
- `public/js/engine/lattice.js` parses finite universes and Horn rules, computes the least fixed
  point by Kleene iteration, and applies a growth governor (144,000 atoms/steps, 12,320 ms).
- `public/js/policy/engine.js` validates an exact schema, checks a SHA-256 pin, deep-freezes the
  policy and denies on missing/tampered/unknown inputs. This is the most important safety pattern
  to retain when adding autonomy.
- `public/js/engine/grades.js` defines FACT, INFERENCE, SPECULATION, BELIEF, SSR INTERPRETATION,
  and OPEN CONJECTURE. The displayed grade cannot exceed the rank justified by evidence.
- `public/js/engine/receipt.js` canonicalises payloads and signs integrity receipts with SHA-256.
- `public/js/ui/views5.js` and `views.js` supply the Living World, OmniGenesis, Malcolm and Pulse
  interface. `public/sw.js` and the manifest provide offline/PWA behaviour.
- The optional Worker is documented as not deployed. It uses an explicit enable switch, same-origin
  restrictions, rate limits and a Worker secret. Deployment needs the owner's affirmative approval.

## Source test claims and verification boundary
The source changelog states 157 tests for v0.6.0. The archive includes test files for P0–P7 and a
fixture parity suite. OGCE v8.0 preserves the complete original archive under
`integrations/mulux_v0_6_0_reference/`; its tests are not silently counted as OGCE v8 tests.

## Important constraints
μLux explicitly says its artificial-life mechanisms are FACT as simulation behaviour but do not
establish consciousness; consciousness is SPECULATION. It labels Malcolm/Source readings as SSR
INTERPRETATION and labels two pulse streams ceremonial/generated, not received. OGCE v8.0 retains
these epistemic boundaries. The optional Worker is not deployed, Malcolm connectivity is not
verified, and symbolic Chronos outputs are not predictions.
