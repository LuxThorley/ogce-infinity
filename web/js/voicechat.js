// v9.0 voice chat: WebRTC peer-to-peer mesh (≤8), signalling over the room WebSocket, free public STUN only.
// Off by default; only peers the SERVER says you may talk to (friends, House, or an owner-vouched party) are ever connected.
// Push-to-talk: the microphone track is disabled unless the talk key/button is held. Audio is never recorded or stored,
// and never passes through our servers (peer-to-peer). If a direct connection can't be made we fall back to quick chat/text.
export const VOICE = Object.freeze({ maxPeers: 7, connectTimeoutMs: 12000 });
export class VoiceMesh {
  /**
   * deps: { me, send(msg), getMic() -> Promise<MediaStream>, makePeer(config) -> RTCPeerConnection-like, iceServers,
   *         onSpeaking(id,on), onPeers(list), onFallback(id, why), onAudio(id, stream), setTimeout, clearTimeout }
   */
  constructor(deps) { this.d = { setTimeout: (...a) => setTimeout(...a), clearTimeout: (t) => clearTimeout(t), ...deps }; this.peers = new Map(); this.allowed = []; this.on = false; this.mic = null; this.talking = false; this.muted = new Set(); }
  async enable() {
    if (this.on) return true;
    this.mic = await this.d.getMic(); for (const t of this.mic.getAudioTracks()) t.enabled = false; // push-to-talk: silent until held
    this.on = true; this.d.send({ type: 'voice', on: true }); return true;
  }
  disable() {
    if (!this.on) return; this.on = false; this.talk(false);
    for (const id of [...this.peers.keys()]) this.hangup(id, true);
    if (this.mic) for (const t of this.mic.getTracks()) t.stop(); this.mic = null;
    this.d.send({ type: 'voice', on: false });
  }
  talk(down) {
    if (!this.on || !this.mic) return false; if (this.talking === !!down) return this.talking;
    this.talking = !!down; for (const t of this.mic.getAudioTracks()) t.enabled = this.talking;
    this.d.send({ type: 'speaking', on: this.talking }); return this.talking;
  }
  mute(id, on = true) { if (on) this.muted.add(id); else this.muted.delete(id); const p = this.peers.get(id); if (p?.audio) p.audio.muted = on; }
  /** server says which peers we may connect to. Lower id makes the offer (no glare). */
  async setAllowed(list) {
    this.allowed = (list || []).filter((id) => id !== this.d.me).slice(0, VOICE.maxPeers);
    for (const id of [...this.peers.keys()]) if (!this.allowed.includes(id)) this.hangup(id);
    this.d.onPeers?.(this.allowed);
    if (!this.on) return;
    for (const id of this.allowed) if (!this.peers.has(id) && this.d.me < id) await this.call(id);
  }
  peer(id) {
    if (this.peers.has(id)) return this.peers.get(id);
    const pc = this.d.makePeer({ iceServers: this.d.iceServers || [] }), rec = { pc, timer: null, audio: null, state: 'new' };
    if (this.mic) for (const t of this.mic.getAudioTracks()) pc.addTrack(t, this.mic);
    pc.onicecandidate = (e) => { if (e.candidate) this.d.send({ type: 'rtc', to: id, kind: 'ice', data: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
    pc.ontrack = (e) => { rec.audio = this.d.onAudio?.(id, e.streams[0]) || null; if (rec.audio && this.muted.has(id)) rec.audio.muted = true; };
    pc.onconnectionstatechange = () => {
      rec.state = pc.connectionState;
      if (pc.connectionState === 'connected') { this.d.clearTimeout(rec.timer); rec.timer = null; }
      if (pc.connectionState === 'failed') this.fail(id, 'p2p_failed');
    };
    rec.timer = this.d.setTimeout(() => { if (rec.state !== 'connected') this.fail(id, 'timeout'); }, VOICE.connectTimeoutMs);
    this.peers.set(id, rec); return rec;
  }
  fail(id, why) { this.hangup(id); this.d.onFallback?.(id, why); }
  async call(id) {
    if (!this.allowed.includes(id)) return;
    const { pc } = this.peer(id); const offer = await pc.createOffer({ offerToReceiveAudio: true }); await pc.setLocalDescription(offer);
    this.d.send({ type: 'rtc', to: id, kind: 'offer', data: { type: offer.type, sdp: offer.sdp } });
  }
  hangup(id, tell = true) {
    const rec = this.peers.get(id); if (!rec) return; this.d.clearTimeout(rec.timer);
    try { rec.pc.close(); } catch { /* closed */ } if (rec.audio) { try { rec.audio.srcObject = null; rec.audio.remove?.(); } catch { /* gone */ } }
    this.peers.delete(id); if (tell) this.d.send({ type: 'rtc', to: id, kind: 'bye', data: null });
  }
  async signal(m) {
    const id = m.from; if (m.kind === 'bye') { this.hangup(id, false); return; }
    if (!this.on || !this.allowed.includes(id)) return; // ignore anyone the server hasn't cleared for us
    if (m.kind === 'offer') { const { pc } = this.peer(id); await pc.setRemoteDescription(m.data); const ans = await pc.createAnswer(); await pc.setLocalDescription(ans); this.d.send({ type: 'rtc', to: id, kind: 'answer', data: { type: ans.type, sdp: ans.sdp } }); }
    else if (m.kind === 'answer') { const rec = this.peers.get(id); if (rec) await rec.pc.setRemoteDescription(m.data); }
    else if (m.kind === 'ice') { const rec = this.peers.get(id); if (rec && m.data) { try { await rec.pc.addIceCandidate(m.data); } catch { /* stale candidate */ } } }
  }
}
