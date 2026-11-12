# μLux — Costs (GBP)

**Current spend: £0.** Nothing paid has been enabled, bought or subscribed to.

## £0 path (what this build uses or is designed for)
| Item | Cost | Status |
|---|---|---|
| Local development on the box (Node built-in test runner, Python http.server, headless Chrome) | £0 | Used |
| Static PWA hosting on Cloudflare Pages free tier | £0 | **Not created** — needs Oliver's YES |
| GitHub repository + Actions (CI file included, not pushed) | £0 | **Not pushed** — needs YES |
| Fonts | £0 | System font stacks only (no downloads) |
| Analytics | £0 | None |

## Optional paid upgrades (estimates — verify current prices before any purchase; none enabled)
| Upgrade | Approx. cost | When it would matter |
|---|---|---|
| Cloudflare Workers Paid | about £4/month | P6 API beyond free-tier limits |
| Google Play developer account | about £20 one-off | Android store listing |
| Apple Developer Program | about £79/year | iOS App Store listing |
| Code-signing certificate | about £70–£300/year | Signed desktop builds |
| Paid LLM inference | about £5–£20/month | Tier 2 "write the world in words" |
| Cloud quantum / QRNG time | variable | Tier 2 Observatory/Intention Lab extensions |

Every paid item requires Oliver's explicit YES first.


## v0.5
- **mulux-api Worker** (not deployed): Cloudflare Workers Free covers 100,000 requests a day, and the free Rate Limiting binding is used. Estimated cost £0.
- **Malcolm upstream**: billed, if at all, on Oliver's existing Malcolm account. μLux caps use at 12 requests per minute per IP.
