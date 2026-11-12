# μLux — Privacy notice (draft, v0.4.0, 12 November 2026)

**Controller:** Oliver Lux Prime Thorley (United Kingdom). *Draft for review before any public release; not legal advice.*

## What μLux does with your data
- **Nothing leaves your device.** This build (phases P0–P4) makes **no network requests**. The Content-Security-Policy restricts scripts and connections to the app's own origin, and the code is tested for the absence of `fetch`, XHR, WebSocket, EventSource and beacons.
- **No accounts, cookies, analytics, advertising or trackers.**
- **Local storage:** if you press "Save locally" in the Lattice Studio, your rules are stored in your browser's `localStorage` under `mulux.studio.v1`. The service worker caches the app's own files so it works offline.
- **Exports** (rules, receipts, graded documents, evidence ledgers) are files you download; μLux keeps no copy elsewhere.
- **Delete everything:** Policy & Privacy → "Delete all local data", or clear the site's data in your browser.

## Future phases
Malcolm narration (P6) and any certificate registry would involve a server. They are **not built**, are **denied** by the current Omni-Policy, and will need this notice updated (lawful basis, retention, processors such as Cloudflare) and Oliver's explicit approval before release.

## Your rights (UK GDPR)
Because no personal data is collected or processed by the operator in this build, there is nothing held to access, correct or erase beyond what sits in your own browser.


## v0.5 additions
- **Living World** state is kept in this browser's `localStorage` (`mulux.world.v1`). "Delete all local data" on the Policy screen removes it.
- **Malcolm** is optional. When the `mulux-api` Worker is deployed and enabled, the text you send from the Malcolm panel goes to it. That text is a summary of your simulated world plus anything you type. The Worker forwards it to Malcolm (malcolmai-live.oliverluxthorley.workers.dev); the model provider is chosen upstream. The Worker stores no logs. The token stays in the Worker and never reaches your browser.
- The OmniGenesis bridge composer sends nothing. Do not paste real secrets into it.
