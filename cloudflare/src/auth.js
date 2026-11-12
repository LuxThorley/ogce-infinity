// JS port of ogce4/v70/auth.py. PBKDF2-HMAC-SHA256 via WebCrypto.
// Deviation: Cloudflare Workers cap PBKDF2 at 100,000 iterations (Python original uses 310,000).
import { ValueError } from './pyjson.js';
export const PBKDF2_ITERATIONS = 100000;
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tokenUrlsafe = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const now = () => Date.now() / 1000;
function timingSafeEqualHex(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
export class AuthStore {
  constructor(db) {
    this.db = db;
    db.run('CREATE TABLE IF NOT EXISTS accounts(username TEXT PRIMARY KEY,salt TEXT NOT NULL,password_hash TEXT NOT NULL,iterations INTEGER NOT NULL,created REAL NOT NULL)');
    db.run('CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,username TEXT NOT NULL,expires REAL NOT NULL)');
    db.run('CREATE TABLE IF NOT EXISTS ws_tickets(ticket_hash TEXT PRIMARY KEY,username TEXT NOT NULL,expires REAL NOT NULL)');
  }
  async register(username, password) {
    username = String(username ?? 'None').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new ValueError('username_must_be_3_to_24_letters_numbers_or_underscore');
    if (typeof password !== 'string' || [...password].length < 12 || [...password].length > 256) throw new ValueError('password_must_be_12_to_256_characters');
    if (this.db.all('SELECT 1 FROM accounts WHERE username=?', username).length) throw new ValueError('account_already_exists');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const digest = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
    try { this.db.run('INSERT INTO accounts VALUES(?,?,?,?,?)', username, hex(salt), digest, PBKDF2_ITERATIONS, now()); }
    catch { throw new ValueError('account_already_exists'); }
    return this.login(username, password);
  }
  async login(username, password) {
    username = String(username ?? 'None').trim().toLowerCase();
    const row = this.db.all('SELECT salt,password_hash,iterations FROM accounts WHERE username=?', username)[0];
    if (!row || !timingSafeEqualHex(await pbkdf2(String(password ?? 'None'), unhex(row.salt), row.iterations), row.password_hash)) throw new ValueError('invalid_credentials');
    const token = tokenUrlsafe(32);
    this.db.run('INSERT INTO sessions VALUES(?,?,?)', await sha256(token), username, now() + 43200);
    this.db.run('DELETE FROM sessions WHERE expires<?', now());
    return { token, username, expires_in: 43200 };
  }
  // v7.7 one-time 60-second WebSocket tickets (Python: AuthStore.issue_ws_ticket / consume_ws_ticket).
  async issueWsTicket(token) {
    const username = await this.validate(token);
    if (!username) throw new ValueError('invalid_session');
    const ticket = tokenUrlsafe(32);
    this.db.run('DELETE FROM ws_tickets WHERE expires<?', now());
    this.db.run('INSERT INTO ws_tickets VALUES(?,?,?)', await sha256(ticket), username, now() + 60);
    return { ticket, expires_in: 60 };
  }
  async consumeWsTicket(ticket) {
    if (!ticket) return null;
    const digest = await sha256(ticket);
    const row = this.db.all('SELECT username,expires FROM ws_tickets WHERE ticket_hash=?', digest)[0];
    if (!row) return null;
    this.db.run('DELETE FROM ws_tickets WHERE ticket_hash=?', digest);
    return row.expires >= now() ? row.username : null;
  }
  async validate(token) {
    if (!token) return null;
    const digest = await sha256(token);
    const row = this.db.all('SELECT username,expires FROM sessions WHERE token_hash=?', digest)[0];
    if (!row) return null;
    if (row.expires < now()) { this.db.run('DELETE FROM sessions WHERE token_hash=?', digest); return null; }
    return row.username;
  }
}
