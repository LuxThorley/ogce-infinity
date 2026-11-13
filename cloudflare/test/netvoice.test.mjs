import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './helpers.mjs';
import { OGCEApp } from '../src/app.js';
import { RemoteDirectory } from '../src/mpapi.js';
import { Interpolator, Predictor, INTERP_DELAY_MS } from '../../web/js/netsync.js';
import { VoiceMesh, VOICE } from '../../web/js/voicechat.js';
import { QUICK, EMOTES } from '../../web/js/mpdata.js';

test('netsync: remote players interpolate ~120 ms behind, short extrapolation, local prediction reconciles on ack', () => {
  const I = new Interpolator(); I.push({ id: 'b', x: 0, z: 0, t: 1000 }, 5000); I.push({ id: 'b', x: 10, z: 0, t: 1100 }, 5100);
  const mid = I.sample('b', 5100 + 50 - INTERP_DELAY_MS + 100); assert.ok(mid.x > 0 && mid.x < 10, JSON.stringify(mid));
  assert.equal(I.sample('b', 5100 + INTERP_DELAY_MS).x, 10); assert.equal(I.sample('b', 5100 + INTERP_DELAY_MS + 50).extrapolated, true);
  I.push({ id: 'b', x: 5, z: 0, t: 1050 }, 5200); assert.equal(I.buf.get('b').length, 2); // out-of-order snapshots dropped
  const P = new Predictor(); P.set(0, 0); P.input(1, 0, 0); P.input(1, 0, 0); P.input(1, 0, 0);
  const r = P.ack({ seq: 1, x: 0.5, z: 0 }); assert.equal(r.x, 2.5); assert.equal(P.pending.length, 2); assert.ok(Math.abs(r.error - 0.5) < 1e-9);
});

function fakeWorld() {
  const peers = [], sent = [];
  class FakePC {
    constructor(cfg) { this.cfg = cfg; this.tracks = []; this.closed = false; this.connectionState = 'new'; peers.push(this); }
    addTrack(t) { this.tracks.push(t); }
    async createOffer() { return { type: 'offer', sdp: 'o' }; } async createAnswer() { return { type: 'answer', sdp: 'a' }; }
    async setLocalDescription(d) { this.local = d; } async setRemoteDescription(d) { this.remote = d; } async addIceCandidate(c) { this.ice = c; }
    close() { this.closed = true; }
    fire(state) { this.connectionState = state; this.onconnectionstatechange?.(); }
  }
  const track = { enabled: true, stop() { this.stopped = true; } };
  const timers = [];
  return { peers, sent, track, timers, deps: (me, extra = {}) => ({ me, send: (m) => sent.push(m), getMic: async () => ({ getAudioTracks: () => [track], getTracks: () => [track] }), makePeer: (c) => new FakePC(c), iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {}, ...extra }) };
}

test('voice mesh: opt-in, push-to-talk, only server-cleared peers, lower id offers (no glare), bye, fallback when P2P fails', async () => {
  const w = fakeWorld(), fallbacks = []; const V = new VoiceMesh(w.deps('alice', { onFallback: (id, why) => fallbacks.push([id, why]) }));
  await V.setAllowed(['bob']); assert.equal(w.peers.length, 0, 'nothing connects before opting in');
  await V.enable(); assert.equal(w.track.enabled, false, 'mic silent until push-to-talk'); assert.deepEqual(w.sent.at(-1), { type: 'voice', on: true });
  await V.setAllowed(['bob', 'carol']); // alice < bob/carol => alice offers to both
  assert.equal(w.sent.filter((m) => m.kind === 'offer').length, 2); assert.equal(w.peers[0].cfg.iceServers[0].urls, 'stun:stun.cloudflare.com:3478');
  V.talk(true); assert.equal(w.track.enabled, true); assert.deepEqual(w.sent.at(-1), { type: 'speaking', on: true }); V.talk(false); assert.equal(w.track.enabled, false);
  await V.signal({ from: 'mallory', kind: 'offer', data: { type: 'offer', sdp: 'x' } }); assert.equal(w.peers.length, 2, 'uncleared peer ignored');
  await V.signal({ from: 'bob', kind: 'answer', data: { type: 'answer', sdp: 'y' } }); assert.equal(w.peers[0].remote.sdp, 'y');
  await V.signal({ from: 'bob', kind: 'ice', data: { candidate: 'c' } }); assert.equal(w.peers[0].ice.candidate, 'c');
  w.peers[1].fire('failed'); assert.deepEqual(fallbacks, [['carol', 'p2p_failed']]); assert.equal(w.peers[1].closed, true);
  await V.setAllowed([]); assert.equal(w.peers[0].closed, true, 'server revoked permission (block/unfriend) => hang up');
  V.disable(); assert.equal(w.track.stopped, true); assert.deepEqual(w.sent.at(-1), { type: 'voice', on: false });
  // the higher id waits for the offer, then answers
  const w2 = fakeWorld(); const Z = new VoiceMesh(w2.deps('zed')); await Z.enable(); await Z.setAllowed(['amy']); assert.equal(w2.sent.filter((m) => m.kind === 'offer').length, 0);
  await Z.signal({ from: 'amy', kind: 'offer', data: { type: 'offer', sdp: 'o' } }); assert.equal(w2.sent.at(-1).kind, 'answer');
  w2.timers[0](); assert.equal(w2.peers[0].closed, true, 'connect timeout => fallback'); assert.ok(VOICE.maxPeers <= 7);
});

test('per-world Durable Objects: a room DO resolves identity, relations and moderation through the main DO (service token, internal API)', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ text: '{"verdict":"allow"}' }));
  const env = { OGCE_MALCOLM_ENABLED: 'yes', MALCOLM_INFINITY_BOT_TOKEN: 'tok-X' };
  const main = new OGCEApp(memoryDb(), 'svc', { env, fetch: fetchImpl }), room = new OGCEApp(memoryDb(), 'svc', { env, fetch: fetchImpl });
  const stub = { fetch: (url, init) => main.handle(new Request(url, init)) };
  room.directory = new RemoteDirectory(stub, 'svc');
  const reg = async (u) => { const b = JSON.stringify({ username: u, password: 'a long safe passphrase' }); return (await (await main.handle(new Request('https://x/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': String(b.length) }, body: b }))).json()).token; };
  const ta = await reg('room_amy'), tb = await reg('room_bo');
  const call = async (app, tok, method, path, body) => { const init = { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok } }; if (body) { init.body = JSON.stringify(body); init.headers['Content-Length'] = String(init.body.length); } const r = await app.handle(new Request('https://x' + path, init)); return { status: r.status, data: await r.json() }; };
  assert.equal((await call(room, ta, 'POST', '/api/v90/room/MNPQRS/create', { max: 3 })).data.room.member, true); // identity came from the main DO
  assert.equal((await call(room, tb, 'POST', '/api/v90/room/MNPQRS/join', {})).data.room.members, 2);
  assert.equal((await call(room, 'forged', 'GET', '/api/v90/room/MNPQRS')).status, 401);
  // internal API refuses players and anonymous callers
  assert.equal((await call(main, ta, 'POST', '/api/internal/relations', { pid: 'room_bo' })).status, 401);
  const rel = await room.directory.relations('room_amy'); assert.equal(rel.privacy.voice, false);
  const out = await room.roomSocket('room_amy', 'MNPQRS', { type: 'hello' }); assert.equal(out.find((d) => d.to === 'room_amy').msg.type, 'roster');
  assert.ok(QUICK.length >= 12 && EMOTES.length >= 8);
});
