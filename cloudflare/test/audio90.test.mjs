// v9.0 background-robust media: audio resume, background-safe scheduling, recognition restarts, voice-chat recovery,
// WebSocket keepalive, and the Worker's security headers / http→https redirect.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { lookahead, shouldResume, RESUME_EVENTS, LOOKAHEAD } from '../../web/js/keepalive.js';
import { restartDelay } from '../../web/js/voice.js';
import { createMusic } from '../../web/js/music.js';
import { createAudio } from '../../web/js/audio.js';
import { VoiceMesh } from '../../web/js/voicechat.js';

// ---- tiny WebAudio fake ----
function fakeCtx() {
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {} });
  const node = (extra = {}) => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), ...extra });
  const c = { currentTime: 10, sampleRate: 8000, state: 'running', resumes: 0, destination: node(), scheduled: [],
    createGain: () => node(), createBiquadFilter: () => node(), createConvolver: () => node(), createBufferSource: () => node(),
    createOscillator() { const o = node(); o.start = (t) => c.scheduled.push(t); return o; },
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    resume() { c.resumes++; c.state = 'running'; return Promise.resolve(); } };
  return c;
}

test('keepalive: hidden tabs schedule further ahead; only suspended/interrupted contexts are resumed; resume on return and on any gesture', () => {
  assert.equal(lookahead(false), LOOKAHEAD.visible); assert.equal(lookahead(true), LOOKAHEAD.hidden);
  assert.ok(LOOKAHEAD.hidden >= 2.5, 'covers the ~1 s timer throttling of hidden tabs with margin');
  assert.equal(shouldResume('suspended', true), true); assert.equal(shouldResume('interrupted', true), true);
  assert.equal(shouldResume('running', true), false); assert.equal(shouldResume('suspended', false), false); assert.equal(shouldResume('closed', true), false);
  for (const ev of ['visibilitychange', 'focus', 'pageshow', 'pointerdown', 'keydown', 'touchstart']) assert.ok(RESUME_EVENTS.includes(ev));
  assert.ok(!RESUME_EVENTS.includes('blur'), 'never reacts to blur');
  for (const f of ['audio.js', 'music.js', 'keepalive.js', 'app.js', 'voice.js', 'voicechat.js']) assert.doesNotMatch(readFileSync(new URL(`../../web/js/${f}`, import.meta.url), 'utf8'), /\.suspend\(/, `${f} never suspends the AudioContext`);
});

test('music: the scheduler fills the AudioContext clock ahead (3.5 s when the tab is hidden), so throttled timers leave no gaps', () => {
  const ctx = fakeCtx(), audio = { on: true, ctx, master: ctx.createGain(), reverb: null, duck() {} };
  const m = createMusic(audio); m.set({ day: 1, stratum: 2 });
  globalThis.document = { hidden: false }; m.tick(); assert.ok(m.scheduledUntil >= ctx.currentTime + LOOKAHEAD.visible && m.scheduledUntil < ctx.currentTime + 1);
  globalThis.document = { hidden: true }; m.tick(); assert.ok(m.scheduledUntil >= ctx.currentTime + LOOKAHEAD.hidden, `hidden: scheduled until ${m.scheduledUntil}`);
  ctx.currentTime += 3; m.tick(); assert.ok(m.scheduledUntil >= ctx.currentTime + LOOKAHEAD.hidden, 'a tick after a 3 s throttle gap still continues seamlessly');
  assert.ok(ctx.scheduled.length > 5 && ctx.scheduled.every((t) => t >= 10)); delete globalThis.document;
});

test('audio: sound on resumes a suspended context; a browser interruption (tab switch, call, Siri) is resumed automatically', async () => {
  const made = []; class AC { constructor() { const c = fakeCtx(); c.state = 'suspended'; made.push(c); return c; } }
  globalThis.window = { AudioContext: AC };
  const a = createAudio(); a.set(true); const c = made[0];
  assert.equal(c.resumes, 1); assert.equal(a.state, 'running');
  c.state = 'interrupted'; c.onstatechange(); await new Promise((r) => setTimeout(r, 300)); assert.equal(c.resumes, 2);
  a.resume(); assert.equal(c.resumes, 2, 'running contexts are left alone');
  a.set(false); c.state = 'suspended'; a.resume(); assert.equal(c.resumes, 2, 'sound off: not resumed');
  a.stop(); delete globalThis.window;
});

test('voice control: recognition restarts with backoff (0.4 s … 8 s cap) and re-arms when the tab returns', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(restartDelay), [400, 800, 1600, 3200, 6400, 8000, 8000]);
  const src = readFileSync(new URL('../../web/js/voice.js', import.meta.url), 'utf8');
  assert.match(src, /ptt && mode === 'ptt'/, 'push-to-talk restarts while held'); assert.match(src, /addEventListener\('visibilitychange', rearm\)/);
  assert.match(src, /not-allowed/, 'a refused microphone is never retried');
});

function fakeTrack() { return { kind: 'audio', enabled: true, onended: null, stop() { this.stopped = true; } }; }
function fakeStream() { const t = fakeTrack(); return { t, getAudioTracks: () => [t], getTracks: () => [t] }; }
function fakePc() {
  const pc = { senders: [], connectionState: 'new', restarts: 0, addTrack(t) { pc.senders.push({ track: t, replaceTrack(n) { this.track = n; return Promise.resolve(); } }); },
    getSenders: () => pc.senders, restartIce() { pc.restarts++; }, close() {}, createOffer: async () => ({ type: 'offer', sdp: 'x' }), setLocalDescription: async () => {}, setRemoteDescription: async () => {}, createAnswer: async () => ({ type: 'answer', sdp: 'y' }), addIceCandidate: async () => {} };
  return pc;
}
test('voice chat: a lost microphone track is re-acquired and swapped into live calls; one ICE restart before falling back; paused playback resumes', async () => {
  const sent = [], fallbacks = [], pcs = []; let mics = 0;
  const V = new VoiceMesh({ me: 'a', send: (m) => sent.push(m), getMic: async () => { mics++; return fakeStream(); }, makePeer: () => { const p = fakePc(); pcs.push(p); return p; },
    onFallback: (id, why) => fallbacks.push([id, why]), onAudio: () => ({ paused: true, plays: 0, play() { this.plays++; this.paused = false; return Promise.resolve(); } }), setTimeout: () => 0, clearTimeout() {} });
  await V.enable(); await V.setAllowed(['b']); const pc = pcs[0]; const first = V.mic.t;
  V.talk(true); first.onended(); await new Promise((r) => setTimeout(r, 0));
  assert.equal(mics, 2); assert.notEqual(V.mic.t, first); assert.equal(pc.senders[0].track, V.mic.t, 'sender now carries the new track'); assert.equal(V.mic.t.enabled, true, 'still talking');
  pc.ontrack({ streams: [{}] }); assert.equal(V.resumePlayback(), 1); assert.equal(V.resumePlayback(), 0);
  pc.connectionState = 'failed'; pc.onconnectionstatechange(); await new Promise((r) => setTimeout(r, 0));
  assert.equal(pc.restarts, 1); assert.equal(fallbacks.length, 0); assert.equal(sent.filter((m) => m.kind === 'offer').length, 2, 'ICE-restart offer sent');
  pc.onconnectionstatechange(); assert.deepEqual(fallbacks, [['b', 'p2p_failed']], 'second failure falls back to quick chat');
});

// ---- Worker entry with a stubbed cloudflare:workers module ----
registerHooks({ resolve: (spec, ctx, next) => (spec === 'cloudflare:workers' ? { url: 'data:text/javascript,export class DurableObject{constructor(c,e){this.ctx=c;this.env=e}}', shortCircuit: true } : next(spec, ctx)) });
test('worker: plain http redirects to https (301, never 500); responses carry HSTS (no subdomains/preload) and allow the microphone for this origin only', async () => {
  const { default: worker } = await import('../src/index.js');
  const env = { ASSETS: { fetch: async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }) } };
  const r = await worker.fetch(new Request('http://strata.malcolmai.live/play?x=1'), env);
  assert.equal(r.status, 301); assert.equal(r.headers.get('Location'), 'https://strata.malcolmai.live/play?x=1');
  const local = await worker.fetch(new Request('http://127.0.0.1:8787/'), env); assert.equal(local.status, 200, 'local dev stays on http');
  const s = await worker.fetch(new Request('https://strata.malcolmai.live/'), env);
  assert.equal(s.headers.get('Strict-Transport-Security'), 'max-age=31536000');
  const pp = s.headers.get('Permissions-Policy'); assert.match(pp, /(^|, )microphone=\(self\)/); assert.match(pp, /autoplay=\(self\)/); assert.match(pp, /camera=\(\)/); assert.match(pp, /geolocation=\(\)/);
  assert.equal(s.headers.get('Cache-Control'), 'no-cache');
  const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(src, /setWebSocketAutoResponse\(new WebSocketRequestResponsePair\('\{"type":"ping"\}', '\{"type":"pong"\}'\)\)/, 'keepalive answered without waking the DO');
  assert.match(readFileSync(new URL('../../web/js/app.js', import.meta.url), 'utf8'), /bgInterval\(\(\) => \{ try \{ if \(ws && ws\.readyState === 1\) ws\.send\('\{"type":"ping"\}'\)/);
});
