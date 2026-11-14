# Strata: Lux Genesis (v9.0): deployment status (13 Nov 2026)

## Where it runs
* **Production (v9.0, approved 13 Nov 2026):** NEW Worker `strata-lux-genesis` at **https://strata.malcolmai.live** (Workers Custom Domain) and https://strata-lux-genesis.oliverluxthorley.workers.dev, with its own fresh Durable Object storage (`OGCEWorldV2`), deployed from branch `v9.0` with `npx wrangler deploy --env strata`. Secrets: `OGCE_SERVICE_TOKEN` (new, kept in `/workspace/ogce/secrets/strata_service_token` on the build box, never committed), `MALCOLM_INFINITY_BOT_TOKEN`, `OGCE_MALCOLM_ENABLED=yes`.
  Roll back: `npx wrangler rollback --env strata <version-id>` (list versions with `npx wrangler deployments list --env strata`); take it offline by removing the custom domain (Workers → strata-lux-genesis → Domains) or `npx wrangler delete --env strata` (this also deletes its storage).
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

## luxthorley.one nameserver move (approved 13 Nov 2026): waiting on one permission
* Snapshot of the current GoDaddy records: `docs/dns/luxthorley-snapshot-2026-11-13.txt` (21 records; no DNSSEC/DS, so the move is safe).
* Exact copy for Cloudflare: `docs/dns/luxthorley.one.zone` (BIND import, all DNS-only) or `docs/dns/apply_luxthorley.js` (API, proxied:false).
* **Blocked:** neither the box API token nor the Cloudflare connector has `account.zone.create`, so the zone could not be added. Oliver needs to either add `luxthorley.one` in the dashboard (Add a domain → Free plan → skip the record scan or delete what it finds), or grant Zone:Edit / zone-create to the connector. The records and the `strata.luxthorley.one` custom domain can then be applied in minutes. The nameservers to set at GoDaddy are shown only after the zone is created.

## 14 Nov 2026: audio/voice robustness, headers, zone and repo security (approved by Oliver)
* `strata-lux-genesis` version `d5966d91-7867-4493-8f89-b9a023af4309` (previous `1658b377-1435-4bb7-b277-9dda5e5bd8ca`); preview `cc398e11-a51d-4d27-82c7-690a00eac1d3`.
  Roll back: `npx wrangler rollback --env strata 1658b377-1435-4bb7-b277-9dda5e5bd8ca`.
* Worker headers: `Permissions-Policy: microphone=(self), autoplay=(self), …=()`, `Strict-Transport-Security: max-age=31536000`; plain http → 301 https in the Worker as well.
* malcolmai.live zone: Always Use HTTPS **on**; HSTS **on** (max-age 31536000, no includeSubDomains, no preload). All proxied hosts (apex, www, ogce, strata) serve valid HTTPS.
  Undo: zone settings `always_use_https=off`, `security_header.strict_transport_security.enabled=false` (browsers that saw HSTS keep it for up to a year).
* ogce-infinity (v8.3, deployed from `main`) does not share the v9.0 code, so its Worker is unchanged (still `microphone=()`); it gets HSTS and the http→https redirect from the zone settings only.
* GitHub LuxThorley/ogce-infinity: secret scanning + push protection on; Dependabot alerts on; ruleset `main-protection` (id 27242153) copied from LuxThorley/luxthorley: default branch, no deletion, no force push, admin bypass. CI on main is unaffected.
