// Cloudflare Worker entry: static game client from Workers Static Assets (./web),
// /health and /api/* routed to a single SQLite-backed Durable Object that runs the OGCE v8.2 engine.
import { DurableObject } from 'cloudflare:workers';
import { OGCEApp, validWorldId } from './app.js';

export class OGCEWorldV2 extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    const db = {
      all: (q, ...p) => sql.exec(q, ...p).toArray(),
      run: (q, ...p) => { sql.exec(q, ...p); },
      transaction: (fn) => ctx.storage.transactionSync(fn),
    };
    this.app = new OGCEApp(db, env.OGCE_SERVICE_TOKEN || '');
  }
  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') return this.upgrade(request);
    return this.app.handle(request);
  }
  // WebSocket multiplayer, equivalent to ogce4/v70/server.py websocket_server() (join / action / broadcast).
  async upgrade(request) {
    const url = new URL(request.url);
    const ticket = url.searchParams.get('ticket') || '';
    // v7.7: one-time 60-second ticket from POST /api/auth/ws-ticket (never the raw session token).
    const account = await this.app.auth.consumeWsTicket(ticket);
    const token = this.env.OGCE_SERVICE_TOKEN || '';
    const auth = request.headers.get('Authorization') || '';
    const headerOk = Boolean(token) && auth === 'Bearer ' + token;
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ account, room: null, player: null });
    if (!account && !headerOk && token) server.close(4401, 'one_time_ticket_required');
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, raw) {
    const meta = ws.deserializeAttachment() || {};
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    if (new TextEncoder().encode(text).length > 16384) { ws.close(4409, 'message too large'); return; }
    let msg; try { msg = JSON.parse(text); } catch { ws.send(JSON.stringify({ type: 'error', error: 'invalid_json' })); return; }
    try {
      if (msg.type === 'join') {
        const room = [...String(msg.world ?? 'Aurelia')].slice(0, 64).join('');
        if (!validWorldId(room)) { ws.close(4400, 'invalid_world'); return; }
        const player = meta.account || [...String(msg.player_id ?? '')].slice(0, 80).join('');
        if (!player) { ws.close(4400, 'player_id required'); return; }
        if (meta.account && ![undefined, null, '', meta.account].includes(msg.player_id)) { ws.close(4403, 'identity mismatch'); return; }
        ws.serializeAttachment({ ...meta, room, player });
        const snap = this.ctx.storage.transactionSync(() => this.app.runtime.load(room));
        ws.send(JSON.stringify({ type: 'snapshot', ...snap }));
      } else if (msg.type === 'action' && meta.room && meta.player) {
        const result = this.ctx.storage.transactionSync(() => this.app.runtime.act(meta.room, meta.player, msg.action));
        const payload = JSON.stringify({ type: 'update', player_id: meta.player, ...result });
        for (const peer of this.ctx.getWebSockets()) {
          const m = peer.deserializeAttachment() || {};
          if (m.room === meta.room) { try { peer.send(payload); } catch { /* peer gone */ } }
        }
      } else ws.send(JSON.stringify({ type: 'error', error: 'join_required_or_unknown_message' }));
    } catch (e) { ws.send(JSON.stringify({ type: 'error', error: e.message })); }
  }
  async webSocketClose(ws, code) { try { ws.close(code === 1005 ? 1000 : code, 'closing'); } catch { /* already closed */ } }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};
const withHeaders = (res) => { const r = new Response(res.body, res); for (const [k, v] of Object.entries(SECURITY_HEADERS)) r.headers.set(k, v); return r; };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname === '/ready' || url.pathname === '/ws' || url.pathname.startsWith('/api/')) {
      const stub = env.OGCE_WORLD.get(env.OGCE_WORLD.idFromName('ogce-main'));
      const res = await stub.fetch(request);
      return res.status === 101 ? res : withHeaders(res);
    }
    const res = withHeaders(await env.ASSETS.fetch(request));
    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/sw.js') res.headers.set('Cache-Control', 'no-cache');
    return res;
  },
};
