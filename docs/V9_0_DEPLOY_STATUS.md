# Strata: Lux Genesis (v9.0): deployment status (13 Nov 2026)

## Where it runs
* **Preview (v9.0):** Worker `ogce-infinity-preview` at https://ogce-infinity-preview.oliverluxthorley.workers.dev
  (workers.dev only, no custom domain, its own Durable Object storage). Deployed from branch `v9.0`.
* **Production (unchanged, v8.3):** Worker `ogce-infinity` at https://ogce.malcolmai.live. Not touched.
* `main` is not merged.

## Secrets on the preview Worker (names only, values never printed or committed)
`OGCE_SERVICE_TOKEN`, `MALCOLM_INFINITY_BOT_TOKEN` (the Malcolm OmniAPI token, a Worker secret only), `OGCE_MALCOLM_ENABLED=yes`.

## strata.luxthorley.one: blocked, needs a decision from Oliver
Read-only checks on 13 Nov 2026:
* `luxthorley.one` is **not a zone in this Cloudflare account** (the account has aichef.food, malcolmaichef.food, malcolmai.live, malcolminfinity.online).
* Its nameservers are GoDaddy (`ns33/ns34.domaincontrol.com`). The apex points at GitHub Pages and GoDaddy addresses. `strata.luxthorley.one` does not exist yet (NXDOMAIN).

A Worker custom domain needs the zone to be on Cloudflare, so the Worker cannot be attached without changes outside what was approved. Nothing was deployed for it and nothing was changed. Options:
1. **Move luxthorley.one's nameservers to Cloudflare** (free plan). This changes the nameservers and means re-creating the apex/GitHub Pages and any mail records in Cloudflare first. Then `strata-lux-genesis` can be attached as a Worker custom domain. Needs Oliver's YES.
2. **Keep GoDaddy DNS. Add ONE new record there:** a `CNAME strata → <hostname on malcolmai.live>`, plus the validation TXT. Then serve it through Cloudflare for SaaS custom hostnames on the malcolmai.live zone (the first 100 custom hostnames are free). This enables SaaS on malcolmai.live (a zone change) and needs GoDaddy access. Needs Oliver's YES.
3. **Use a malcolmai.live subdomain** (for example `strata.malcolmai.live`) as a Worker custom domain. This adds one new record in a zone already on Cloudflare. Needs Oliver's YES (it is a DNS change).

## Voice relay (TURN)
Voice is peer-to-peer WebRTC with **STUN only** (`stun.cloudflare.com`, free and unlimited). No TURN is configured, so players behind strict/symmetric NATs cannot hear each other. Findings:
* Cloudflare Realtime TURN costs $0.05/GB after 1,000 GB a month, shared with the SFU. There is **no spending cap**, so it is not "genuinely free".
* Metered "Open Relay" has a free tier that is **hard-capped with no overage**: 500 MB a month without a card (20 GB with a card on file). It is genuinely £0, but it needs a new third-party account and API key. Needs Oliver's YES. The key would be a Worker secret; the Worker would mint short-lived ICE credentials.
