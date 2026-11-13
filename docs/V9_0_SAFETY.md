# Strata: Lux Genesis (v9.0): safety, privacy and the Children's Code

Audience: about 13+. Design follows the UK ICO Age Appropriate Design Code ("Children's Code"): high privacy by default, data minimisation,
no nudge techniques, no profiling for engagement, parental/trusted-adult signposting.

## Defaults (all social features start at the safest setting)
| Setting | Default |
|---|---|
| Free text chat | off (quick chat and emotes only) |
| Voice chat | off; when on: push-to-talk, only with friends, your House, or a party the owner vouches for |
| Private messages | off (can be "friends only"; never strangers) |
| Friend requests | only with your friend code (or from a party you're in) |
| Name in Hall/leaderboards | anonymous |
| PvP arenas | off (opt-in) |
| Online status | friends only |

## Moderation (layered, fails closed) — `cloudflare/src/moderation.js`
1. Deterministic layer, always: rate limits, the canonical teen-safety categories, a profanity list with leetspeak/spacing normalisation,
   personal-information and off-platform-contact patterns.
2. Malcolm proxy layer (through the Worker; the token is a Worker secret): borderline text and every public item (House names, charters,
   mottos, Hall entries, display names) is classified.
3. Fail-closed: if Malcolm is off, rate-limited, slow or ambiguous, chat is not delivered and public items are held for human review
   (`/api/v90/admin/moderation`, service token only).
* Reports (bullying, inappropriate, personal info, cheating, spam, "I feel worried or unsafe", other) go to a review log; the "worried" reason
  replies with Childline (0800 1111) signposting. Block and mute act immediately.
* Data minimisation: allowed messages are never logged; only blocked/held items and reports are kept, truncated and PII-redacted.

## Voice
* Voice control (commands): the browser's speech recogniser produces text; only the text is sent. Audio is never recorded or stored.
* Voice chat: WebRTC peer-to-peer; audio never passes through or is stored on our servers; the server only relays signalling to peers it has
  authorised. Microphone tracks stay disabled unless the talk button is held.
* **No TURN relay.** Evidence: Cloudflare Realtime TURN is billed at $0.05/GB beyond a 1 000 GB free allowance shared with the SFU, with no
  documented spending cap, and the account currently has no TURN keys (`calls/turn_keys: []`). Under a £0 budget we did not create one.
  Consequence: players behind some strict NATs cannot connect voice; the game says so and falls back to quick chat.

## Healthy play
* Break reminders (default every 45 minutes; adjustable or off), a pause button, and nothing that expires when you leave.
* No daily streaks, loot boxes, gacha, paid currency, pay-to-win, or FOMO timers. A test (`extras.test.mjs`) scans the game code for these.
* Leaderboard rewards are cosmetic; seasons archive rather than reset your progress.

## Malcolm (AI)
* The OmniAPI token lives only as a Worker secret; it is never sent to the browser, logged or committed.
* Input and output moderation, PII redaction and Childline/999 signposting on every AI path; per-player and global limits;
  deterministic fallbacks so the game works with Malcolm switched off.

## Content
* Teen-appropriate, no gore. Magic, spirits and astrology are labelled MYSTICAL/IN-GAME (make-believe). SSR/CRA is labelled as Oliver's theory.
