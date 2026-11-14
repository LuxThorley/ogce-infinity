// Cloudflare Worker entry: static game client from Workers Static Assets (./web),
// /health and /api/* routed to a single SQLite-backed Durable Object that runs the OGCE v8.2 engine.
import { DurableObject } from 'cloudflare:workers';
import { OGCEApp, validWorldId } from './app.js';
import { ROOM_CODE, roomWorld } from './rooms.js';

export class OGCEWorldV2 extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    const db = {
      all: (q, ...p) => sql.exec(q, ...p).toArray(),
      run: (q, ...p) => { sql.exec(q, ...p); },
      transaction: (fn) => ctx.storage.transactionSync(fn),
    };
    this.app = new OGCEApp(db, env.OGCE_SERVICE_TOKEN || '', { env });
    // Client keepalive pings are answered at the edge without waking the hibernated Durable Object.
    try { this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}')); } catch { /* older runtime / tests */ }
  }
  async fetch(request) {
    if (request.headers.get('X-OGCE-DO') === 'room') this.app.useRemoteDirectory(this.env); // per-world DO: identity + social via the main DO
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') return this.upgrade(request);
    return this.app.handle(request);
  }
  // WebSocket multiplayer, equivalent to ogce4/v70/server.py websocket_server() (join / action / broadcast).
  async upgrade(request) {
    const url = new URL(request.url);
    const ticket = url.searchParams.get('ticket') || '';
    // v7.7: one-time 60-second ticket from POST /api/auth/ws-ticket (never the raw session token).
    const room = ROOM_CODE.test(url.searchParams.get('room') || '') ? url.searchParams.get('room') : null;
    const account = this.app.directory.remote ? await this.app.directory.consumeTicket(ticket).catch(() => null) : await this.app.auth.consumeWsTicket(ticket);
    const token = this.env.OGCE_SERVICE_TOKEN || '';
    const auth = request.headers.get('Authorization') || '';
    const headerOk = Boolean(token) && auth === 'Bearer ' + token;
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ account, room: null, player: null, code: room, voice: false });
    if (!account && !headerOk && token) server.close(4401, 'one_time_ticket_required');
    else if (room && (!account || !this.app.rooms.isMember(room, account))) server.close(4403, 'room_members_only'); // shared worlds: signed-in members only
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, raw) {
    const meta = ws.deserializeAttachment() || {};
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    if (new TextEncoder().encode(text).length > 16384) { ws.close(4409, 'message too large'); return; }
    let msg; try { msg = JSON.parse(text); } catch { ws.send(JSON.stringify({ type: 'error', error: 'invalid_json' })); return; }
    if (msg?.type === 'ping') { ws.send('{"type":"pong"}'); return; } // keepalive (normally answered by the auto-response)
    try {
      if (meta.code && !['join', 'action'].includes(msg.type)) return await this.roomMessage(ws, meta, msg);
      if (msg.type === 'join') {
        const room = meta.code ? roomWorld(meta.code) : [...String(msg.world ?? 'Aurelia')].slice(0, 64).join('');
        if (!validWorldId(room)) { ws.close(4400, 'invalid_world'); return; }
        const player = meta.account || [...String(msg.player_id ?? '')].slice(0, 80).join('');
        if (!player) { ws.close(4400, 'player_id required'); return; }
        if (meta.account && ![undefined, null, '', meta.account].includes(msg.player_id)) { ws.close(4403, 'identity mismatch'); return; }
        ws.serializeAttachment({ ...meta, room, player });
        const snap = this.ctx.storage.transactionSync(() => this.app.runtime.load(room));
        ws.send(JSON.stringify({ type: 'snapshot', ...snap }));
      } else if (msg.type === 'action' && meta.room && meta.player) {
        const { v90, ...result } = this.app.actWithProgress(meta.room, meta.player, msg.action);
        const payload = JSON.stringify({ type: 'update', player_id: meta.player, ...result });
        if (v90?.unlocked?.length) ws.send(JSON.stringify({ type: 'v90', ...v90 }));
        for (const peer of this.ctx.getWebSockets()) {
          const m = peer.deserializeAttachment() || {};
          if (m.room === meta.room) { try { peer.send(payload); } catch { /* peer gone */ } }
        }
      } else ws.send(JSON.stringify({ type: 'error', error: 'join_required_or_unknown_message' }));
    } catch (e) { ws.send(JSON.stringify({ type: 'error', error: e.message })); }
  }
  // v9.0 room protocol (presence, quick chat, emotes, opt-in text chat, voice signalling). Audio never passes through here.
  async roomMessage(ws, meta, msg) {
    if (!meta.player) { ws.send(JSON.stringify({ type: 'error', error: 'join_first' })); return; }
    const peers = this.ctx.getWebSockets().filter((p) => (p.deserializeAttachment() || {}).code === meta.code);
    if (!Object.keys(this.app.hub.live.voice).length) for (const p of peers) { const m = p.deserializeAttachment() || {}; if (m.voice && m.player) this.app.hub.live.voice[m.player] = true; } // rebuild after hibernation
    const out = await this.app.roomSocket(meta.player, meta.code, msg);
    if (msg.type === 'voice') ws.serializeAttachment({ ...meta, voice: msg.on === true && !!this.app.hub.live.voice[meta.player] });
    for (const d of out) for (const p of peers) { const m = p.deserializeAttachment() || {}; if (m.player === d.to) { try { p.send(JSON.stringify(d.msg)); } catch { /* gone */ } } }
  }
  async webSocketClose(ws, code) {
    const meta = ws.deserializeAttachment() || {};
    if (meta.code && meta.player) { // tell the room this player left (and drop their voice/presence)
      this.app.hub.leave(meta.player);
      const others = this.ctx.getWebSockets().filter((p) => p !== ws && (p.deserializeAttachment() || {}).code === meta.code);
      for (const p of others) { try { p.send(JSON.stringify({ type: 'left', id: meta.player })); } catch { /* gone */ } }
    } try { ws.close(code === 1005 ? 1000 : code, 'closing'); } catch { /* already closed */ } }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  // Microphone for this origin only (voice control + voice chat); autoplay for the soundtrack; everything else stays off.
  'Permissions-Policy': 'microphone=(self), autoplay=(self), camera=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), interest-cohort=()',
  // HSTS for this host only (no includeSubDomains, no preload). Browsers ignore it on plain http, so local dev is unaffected.
  'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};
const withHeaders = (res) => { const r = new Response(res.body, res); for (const [k, v] of Object.entries(SECURITY_HEADERS)) r.headers.set(k, v); return r; };

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newRoomCode() { let c = ''; for (const b of crypto.getRandomValues(new Uint8Array(6))) c += CODE_ALPHABET[b % CODE_ALPHABET.length]; return c; }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Plain http:// is redirected to https:// (never served, never a 500). Local development stays on http.
    if (url.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)) { url.protocol = 'https:'; return new Response(null, { status: 301, headers: { Location: url.toString(), 'Strict-Transport-Security': 'max-age=31536000' } }); }
    if (url.pathname === '/health' || url.pathname === '/ready' || url.pathname === '/ws' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/s/')) {
      if (url.pathname.startsWith('/api/internal/')) return withHeaders(new Response('{"error":"not_found"}', { status: 404, headers: { 'Content-Type': 'application/json' } })); // DO-to-DO only
      let fwd = request, code = null;
      if (url.pathname === '/api/v90/room/new' && request.method === 'POST') { // fresh invite code -> a brand-new Durable Object for that world
        code = newRoomCode(); fwd = new Request(new URL(`/api/v90/room/${code}/create`, url), request);
      } else {
        const m = /^\/api\/v90\/room\/([A-Z0-9]{6,9})(?:\/|$)/.exec(url.pathname) || /\/sw_([A-Z0-9]{6,9})(?:\/|$)/.exec(url.pathname) || /[?&]world=sw_([A-Z0-9]{6,9})/.exec(url.search);
        code = m ? m[1] : (url.pathname === '/ws' ? url.searchParams.get('room') : null);
        if (code && !ROOM_CODE.test(code)) return withHeaders(new Response('{"error":"bad_room_code"}', { status: 400, headers: { 'Content-Type': 'application/json' } }));
      }
      const headers = new Headers(fwd.headers); headers.set('X-OGCE-DO', code ? 'room' : 'main'); // never trust a client-sent value
      fwd = new Request(fwd, { headers });
      const stub = env.OGCE_WORLD.get(env.OGCE_WORLD.idFromName(code ? `room:${code}` : 'ogce-main'));
      const res = await stub.fetch(fwd);
      return res.status === 101 ? res : withHeaders(res);
    }
    const res = withHeaders(await env.ASSETS.fetch(request));
    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/sw.js') res.headers.set('Cache-Control', 'no-cache');
    return res;
  },
};
