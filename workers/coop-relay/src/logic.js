/**
 * 三人連線 relay 的純邏輯（不碰 Cloudflare API，Node 測試直接 import：game/tests/coop-relay.test.mjs）
 *
 * - 房號：4 碼，字母表去掉易混淆的 0/O/1/I
 * - 成員與房主：房主＝最早加入的人；房主離開時由剩下最早加入者接手
 * - 每條連線的訊息速率限制（每秒最多 40 則，超過的直接丟掉）
 * - 第二階段：房主的戰場訊息（e）、隊友的命中申報（h）用通用淨化器 cleanPayload；房主可主動交棒（handOff）
 * - 代號設定（PLAYER_CODES）解析：最多 3 組
 * - Origin 白名單比對
 */

export const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';   // 32 字：無 0/O/1/I
export const ROOM_CODE_LENGTH = 4;
export const MAX_PLAYERS = 3;
export const MAX_CODES = 3;
export const MAX_MESSAGE_BYTES = 512;
/**
 * 房主的戰場訊息（t:'e'）上限。為什麼放寬：Workers 免費額度按「則數」計，不按位元組；
 * 18 隻敵人的關鍵幀約 800 字、加上一段時間的事件（擊倒、紅圈、提示）常超過 512，
 * 硬切成多則反而多花額度。其他類型（角色狀態、命中申報、交棒）仍是 512。
 */
export const MAX_WORLD_BYTES = 4096;
/**
 * 每條連線每秒上限。房主：角色狀態 12 ＋ 戰場 10 ＝ 22 則／秒；隊友：角色狀態 12 ＋ 命中申報最多 10。
 * 40 留約 1.8 倍餘裕，持續超過兩倍（80）五秒才斷線。
 */
export const RATE_LIMIT_PER_SEC = 40;
export const NAME_MAX = 12;

/** 自訂關閉代碼（4000–4999 是應用程式可用範圍）；中文說明在 game/3d-next/net/protocol.js */
export const CLOSE = {
  badToken: 4001,     // 代號憑證無效或過期 → 重新輸入代號
  roomFull: 4003,     // 房間已滿 3 人
  noRoom: 4004,       // 房號不存在
  replaced: 4005,     // 同一個人從另一個裝置／分頁加入，舊連線被取代
  abuse: 4008,        // 持續超量送訊息
  config: 4010,       // 伺服器設定錯誤（PLAYER_CODES 超過 3 組等）
};

/** randomBytes(n) → Uint8Array；預設用 WebCrypto（Workers 與 Node 20+ 都有） */
export function makeRoomCode(randomBytes = n => crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = randomBytes(ROOM_CODE_LENGTH);
  let code = '';
  // 32 = 256 / 8，取餘數不會偏向任何字母
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_ALPHABET[bytes[i] % ROOM_ALPHABET.length];
  return code;
}

/** 使用者輸入的房號：去空白、轉大寫，只接受字母表內的字（不猜 0／O 之類的混淆字） */
export function normalizeRoomCode(input) {
  const code = String(input ?? '').trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_ALPHABET.includes(ch)) return null;
  return code;
}

export function sanitizeName(input) {
  // 去掉控制字元與角括號（名稱會出現在別人的畫面上），截到 12 個字
  const clean = [...String(input ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim()].slice(0, NAME_MAX).join('');
  return clean || '無名';
}

/**
 * 成員名單（純資料）。成員 { id, name, joinedAt }；id 用代號對應的顯示名稱（每位兄弟一個身分），
 * 同一個 id 再次加入＝重新連線，保留原本的加入順序。
 */
export class Membership {
  constructor(members = [], cap = MAX_PLAYERS) {
    this.cap = Math.min(MAX_PLAYERS, Math.max(1, cap | 0 || MAX_PLAYERS));   // 只能調小（冒煙測試用 2 驗證滿房）
    this.members = members.map(m => ({ ...m })).sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
  }
  get size() { return this.members.length; }
  get host() { return this.members[0]?.id ?? null; }
  has(id) { return this.members.some(m => m.id === id); }
  get(id) { return this.members.find(m => m.id === id) || null; }
  /**
   * @returns {{ ok: true, member, rejoin: boolean } | { ok: false, reason: 'full' }}
   */
  join(id, name, now) {
    const existing = this.get(id);
    if (existing) { existing.name = name; return { ok: true, member: existing, rejoin: true }; }
    if (this.members.length >= this.cap) return { ok: false, reason: 'full' };
    const member = { id, name, joinedAt: now };
    this.members.push(member);
    this.members.sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
    return { ok: true, member, rejoin: false };
  }
  /** @returns {{ removed: boolean, hostChanged: boolean, host: string|null }} */
  leave(id) {
    const before = this.host;
    const index = this.members.findIndex(m => m.id === id);
    if (index < 0) return { removed: false, hostChanged: false, host: before };
    this.members.splice(index, 1);
    return { removed: true, hostChanged: before !== this.host, host: this.host };
  }
  list() { return this.members.map(m => ({ ...m })); }
  /**
   * 房主主動交棒（頁面停住、死亡、過關後由遊戲端要求）：from 排到最後、to 排到最前。
   * @returns {{ ok: boolean, host: string|null, joinedAt?: Record<string,number> }}
   */
  handOff(from, to, now) {
    if (from === to || this.host !== from || !this.has(to)) return { ok: false, host: this.host };
    const first = Math.min(...this.members.map(m => m.joinedAt));
    this.get(from).joinedAt = Math.max(now, ...this.members.map(m => m.joinedAt)) + 1;
    this.get(to).joinedAt = first - 1;
    this.members.sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
    return { ok: true, host: this.host, joinedAt: Object.fromEntries(this.members.map(m => [m.id, m.joinedAt])) };
  }
}

/** 固定一秒視窗的計數器：每條連線一個。回傳 false 的訊息丟掉不轉發。 */
export class RateLimiter {
  constructor(limit = RATE_LIMIT_PER_SEC, windowMs = 1000) {
    this.limit = limit; this.windowMs = windowMs;
    this.windowStart = -Infinity; this.count = 0;
    this.dropped = 0;          // 目前視窗丟掉的數量
    this.strikes = 0;          // 連續幾個視窗超量（持續濫用才斷線）
  }
  allow(now) {
    if (now - this.windowStart >= this.windowMs) {
      this.strikes = this.dropped > this.limit ? this.strikes + 1 : 0;   // 上個視窗送超過兩倍才記一次
      this.windowStart = now; this.count = 0; this.dropped = 0;
    }
    if (this.count < this.limit) { this.count++; return true; }
    this.dropped++;
    return false;
  }
  /** 連續 5 個視窗都送超過兩倍上限 → 呼叫端可以斷線 */
  get abusive() { return this.strikes >= 5; }
}

/**
 * 驗證並整理一則玩家狀態訊息。只轉發白名單欄位，數字限制範圍，避免有人塞任意資料給別人。
 * @returns {object|null}
 */
export function cleanState(d) {
  if (!d || typeof d !== 'object') return null;
  const num = (v, lim) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim ? Math.round(v * 1000) / 1000 : null);
  const x = num(d.x, 1e4), y = num(d.y, 1e4), z = num(d.z, 1e4), r = num(d.r, 100);
  if (x === null || y === null || z === null || r === null) return null;
  const out = { x, y, z, r, c: num(d.c, 1e13) ?? 0 };
  const h = num(d.h, 50); if (h !== null) out.h = h;
  if (typeof d.a === 'string' && /^[\w-]{1,24}$/.test(d.a)) out.a = d.a;
  const at = num(d.at, 1e4); if (at !== null) out.at = at;
  const ts = num(d.ts, 100); if (ts !== null) out.ts = ts;
  if (d.l === 0 || d.l === 1) out.l = d.l;
  if (Number.isInteger(d.st) && d.st > 0 && d.st < 64) out.st = d.st;   // 第三階段：狀態位元（1＝切到背景、2＝倒地）
  return out;
}

/**
 * 通用淨化：第二階段的 e／h 訊息內容由遊戲定義、relay 不解讀，只保證轉給別人的是「無害的小 JSON」：
 * 有限數字、短字串（去控制字元與角括號）、布林、null、有限長度的陣列與物件（鍵名限英數底線），深度有限。
 * 不合格的欄位直接丟掉（不是整則拒絕），避免單一壞欄位讓整個房間卡住。
 */
export const PAYLOAD_LIMITS = { number: 1e13, string: 80, array: 128, keys: 24, depth: 5 };
export function cleanPayload(value, depth = 0, limits = PAYLOAD_LIMITS) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= limits.number ? value : undefined;
  if (typeof value === 'string') return value.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, limits.string);
  if (depth >= limits.depth || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) return value.slice(0, limits.array).map(v => cleanPayload(v, depth + 1, limits)).map(v => (v === undefined ? null : v));
  const out = {};
  let count = 0;
  for (const [key, v] of Object.entries(value)) {
    if (count >= limits.keys) break;
    if (!/^\w{1,16}$/.test(key)) continue;
    const clean = cleanPayload(v, depth + 1, limits);
    if (clean === undefined) continue;
    out[key] = clean;
    count++;
  }
  return out;
}

/** 命中申報：{ x, y, h: [[敵人 id, 數值, 來源碼, 招式編號], …], p?: 想撿的補給 id, r?: 1＝結算後請房主重開 }，h 最多 32 筆 */
export function cleanClaim(d) {
  const out = cleanPayload(d);
  if (!out || typeof out !== 'object' || Array.isArray(out)) return null;
  const h = Array.isArray(out.h) ? out.h.filter(e => Array.isArray(e) && e.length >= 3 && e.length <= 4 && e.every(v => typeof v === 'number')).slice(0, 32) : [];
  const claim = { h };
  if (typeof out.x === 'number' && typeof out.y === 'number') { claim.x = out.x; claim.y = out.y; }
  if (Number.isInteger(out.p)) claim.p = out.p;
  if (out.r === 1) claim.r = 1;
  return h.length || claim.p !== undefined || claim.r ? claim : null;
}

/**
 * PLAYER_CODES（wrangler secret）＝ JSON {"代號": "顯示名稱", ...}，最多 3 組。
 * @returns {{ ok: true, entries: Array<[string,string]> } | { ok: false, error: string }}
 */
export function parsePlayerCodes(raw) {
  let value;
  try { value = JSON.parse(raw ?? ''); } catch { return { ok: false, error: 'PLAYER_CODES is not valid JSON' }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'PLAYER_CODES must be a JSON object {code: name}' };
  const entries = Object.entries(value);
  if (entries.length === 0) return { ok: false, error: 'PLAYER_CODES is empty' };
  if (entries.length > MAX_CODES) return { ok: false, error: `PLAYER_CODES has ${entries.length} entries; at most ${MAX_CODES} allowed` };
  const names = new Set();
  for (const [code, name] of entries) {
    if (code.length < 4) return { ok: false, error: 'each code must be at least 4 characters' };
    if (typeof name !== 'string' || !name.trim()) return { ok: false, error: 'each code needs a display name' };
    const clean = sanitizeName(name);
    if (names.has(clean)) return { ok: false, error: 'display names must be unique' };
    names.add(clean);
  }
  return { ok: true, entries: entries.map(([code, name]) => [code, sanitizeName(name)]) };
}

/** 等長位元組的常數時間比較（長度不同時仍跑完同樣的迴圈） */
export function constantTimeEqual(a, b) {
  const n = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/**
 * Origin 白名單。規則以逗號分隔，支援：完整 origin、`https://*.example.pages.dev`（任一子網域）、
 * `http://localhost:*`（任一 port）。
 */
export function originAllowed(origin, rules) {
  if (!origin) return false;
  let url;
  try { url = new URL(origin); } catch { return false; }
  if (url.origin !== origin) return false;
  for (const rule of String(rules || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const m = rule.match(/^(https?):\/\/(\*\.)?([^:/]+)(?::(\*|\d+))?$/);
    if (!m) continue;
    const [, scheme, wildcard, host, port] = m;
    if (url.protocol !== `${scheme}:`) continue;
    const hostOk = wildcard ? url.hostname.endsWith(`.${host}`) && url.hostname.length > host.length + 1 : url.hostname === host;
    if (!hostOk) continue;
    if (port === '*') return true;
    if ((port || '') === url.port) return true;
  }
  return false;
}

/**
 * 代號嘗試的節流：每個 IP 在 windowMs 內最多 limit 次「錯誤」嘗試；超過後連正確的也先擋（不透露對錯）。
 * hits 是錯誤嘗試的時間戳陣列（存在 Durable Object storage）。
 */
export const AUTH_LIMIT = 5;
export const AUTH_WINDOW_MS = 10 * 60 * 1000;
export function throttleState(hits, now, limit = AUTH_LIMIT, windowMs = AUTH_WINDOW_MS) {
  const recent = (hits || []).filter(t => now - t < windowMs);
  const blocked = recent.length >= limit;
  const retryAfterMs = blocked ? windowMs - (now - Math.min(...recent)) : 0;
  return { recent, blocked, retryAfterMs };
}
