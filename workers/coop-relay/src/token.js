/**
 * 玩家憑證：base64url(JSON payload) + '.' + base64url(HMAC-SHA256(payload, TOKEN_SECRET))
 * payload = { v: 1, n: 顯示名稱, e: 到期（Unix 秒） }
 * 只用 WebCrypto，Workers 與 Node 20+ 都能跑（測試：game/tests/coop-relay.test.mjs）。
 * 撤銷已發出的憑證＝輪換 TOKEN_SECRET（全部人重新輸入一次代號）。
 */
import { constantTimeEqual } from './logic.js';

export const TOKEN_DAYS = 30;
const enc = new TextEncoder();

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(text) {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function signToken(name, secret, { nowSec = Math.floor(Date.now() / 1000), days = TOKEN_DAYS } = {}) {
  if (!secret || secret.length < 16) throw new Error('TOKEN_SECRET must be at least 16 characters');
  const body = b64url(enc.encode(JSON.stringify({ v: 1, n: name, e: nowSec + days * 86400 })));
  return `${body}.${b64url(await hmac(secret, body))}`;
}

/** @returns {Promise<{ name: string, exp: number } | null>} */
export async function verifyToken(token, secret, { nowSec = Math.floor(Date.now() / 1000) } = {}) {
  if (!secret || typeof token !== 'string' || token.length > 600) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  let sig;
  try { sig = fromB64url(parts[1]); } catch { return null; }
  if (!constantTimeEqual(sig, await hmac(secret, parts[0]))) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[0]))); } catch { return null; }
  if (payload?.v !== 1 || typeof payload.n !== 'string' || typeof payload.e !== 'number') return null;
  if (payload.e <= nowSec) return null;
  return { name: payload.n, exp: payload.e };
}

/**
 * 代號比對：兩邊先做 SHA-256 再常數時間比較（長度不外洩），而且每一組都比完才回傳。
 * @param {Array<[string,string]>} entries parsePlayerCodes() 的結果
 * @returns {Promise<string|null>} 對應的顯示名稱
 */
export async function matchCode(input, entries) {
  const digest = async text => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(text))));
  const given = await digest(input);
  let found = null;
  for (const [code, name] of entries) {
    if (constantTimeEqual(given, await digest(code)) && found === null) found = name;
  }
  return found;
}
