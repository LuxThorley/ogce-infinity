# Strata v9.0: background-robust audio, voice and connection (14 Nov 2026)

Goal: music, sound effects, voice chat and voice control keep working when the tab is switched, minimised, moved to
another window, swapped or left inactive.

## What the game does
| Area | Mechanism | File |
|---|---|---|
| AudioContext | Created with `latencyHint: 'playback'`. Resumed on `visibilitychange`, `focus`, `pageshow` and every user gesture (`pointerdown`, `keydown`, `touchstart`, `click`), and automatically ~250 ms after the browser suspends or interrupts it (`onstatechange`). Never suspended on blur. | `audio.js`, `keepalive.js` |
| Timers | Soundtrack scheduler, ambient wildlife and WebSocket keepalive tick from a dedicated worker (`tickworker.js`). Page timers in hidden tabs are throttled to ~1/s or slower; the worker falls back to `setInterval` if it can't start. | `keepalive.js` |
| Soundtrack | Notes are scheduled on the AudioContext clock: 0.3 s ahead when visible, 3.5 s ahead when hidden, so a throttled tick never leaves a gap. Short multi-note effects are scheduled with clock offsets instead of `setTimeout`. | `music.js`, `audio.js` |
| MediaSession | Metadata (title, artwork) and `playbackState`, plus play/pause/stop handlers mapped to the sound toggle, so the browser and OS treat the tab as playing media. | `keepalive.js` |
| Voice chat (WebRTC) | Streams are never torn down on visibility changes. A microphone track that ends (device switch, OS interruption) is re-acquired and swapped into every call with `replaceTrack` (no renegotiation). A failed connection gets one ICE restart before falling back to quick chat. Remote audio that the browser paused is restarted when the tab returns. | `voicechat.js`, `multiplayer.js`, `app.js` |
| Voice control (SpeechRecognition) | Restarts automatically after silence, `aborted` (tab switch), `network` or `audio-capture` errors: wake-word mode with backoff (0.4 s → 8 s cap), push-to-talk while the key/button is still held. Re-armed on `visibilitychange`, `focus` and `pageshow`. A refused microphone is never retried. Audio is never recorded or stored. | `voice.js` |
| WebSocket | `{"type":"ping"}` every 25 s from the worker ticker. The Durable Object answers with `setWebSocketAutoResponse` without waking from hibernation. The connection is re-opened on return to the tab, on `online` and on `pageshow` (the retry counter resets). | `app.js`, `cloudflare/src/index.js` |
| Permissions | `Permissions-Policy: microphone=(self), autoplay=(self)`; camera, geolocation, payment, USB and the rest stay `()`. The previous policy `microphone=()` blocked voice control and voice chat entirely. | `cloudflare/src/index.js` |

## Browser limits that cannot be overcome (honest list)
* **iOS/iPadOS Safari (and every iOS browser, which all use WebKit):** when the page is backgrounded or the screen locks, WebKit suspends the page. The microphone, SpeechRecognition, WebRTC capture and Web Audio stop until the user returns. The game resumes them on return (the AudioContext may need one tap: iOS reports `interrupted` and only resumes on a gesture). An installed PWA behaves the same.
* **SpeechRecognition in hidden tabs:** Chrome and Edge stop recognition when the tab is hidden; Firefox has no SpeechRecognition. It restarts when the tab is visible again. Background voice *commands* are not possible in any browser.
* **Autoplay:** no audio can start before the first user gesture on the page (all browsers). After that the context is kept running.
* **Chrome Memory Saver / tab discarding and Android battery savers** can discard or freeze a background tab entirely. On return the page reloads or resumes, and the WebSocket and audio reconnect.
* **Hidden-tab timers:** Chrome's intensive throttling (1 wake-up per minute after 5 minutes hidden) is avoided while the tab is audible and by the worker ticker. If sound is off, the game's visuals pause in the background (no rendering is needed), but the connection keepalive continues.
* **Mobile Chrome on Android:** a backgrounded tab keeps WebRTC audio and playback while audible, but the OS may stop microphone capture when the screen is off.
* **No TURN relay:** voice still fails on strict/symmetric NATs (see `docs/V9_0_DEPLOY_STATUS.md`).

## Tests
`cloudflare/test/audio90.test.mjs`: lookahead and resume rules, scheduling across a simulated 3 s throttle gap,
automatic resume after interruption, recognition backoff, microphone re-acquisition with `replaceTrack`, ICE restart
before fallback, playback resume, http→https redirect, HSTS and Permissions-Policy, WebSocket keepalive wiring.
Headless verification with simulated visibility changes: `/workspace/ogce/smoke/audiobg.mjs`.
