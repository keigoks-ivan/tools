/**
 * 三人連線：客戶端共用常數與純函式（game/tests/coop-net.test.mjs 驗證）
 * 只有三人版頁面（game/trio/）會載入 net/ 底下的檔案；單人頁（game/3d-next/index.html）完全不碰。
 */

/** 正式 relay 網址：部署後改成實際網址（見 workers/coop-relay/README.md）。頁面也可用 ?relay= 覆寫 */
export const PRODUCTION_RELAY = 'https://coop-relay.keigoks.workers.dev';
/** 本機 `npx wrangler dev` 預設網址 */
export const LOCAL_RELAY = 'http://localhost:8787';

export const SEND_HZ = 12;
export const PING_MS = 20000;
export const TOKEN_KEY = 'violet-trio-token';

/** relay 用的關閉代碼（與 workers/coop-relay/src/logic.js 的 CLOSE 一致）→ 給玩家看的說明 */
export const CLOSE_TEXT = {
  4001: '代號憑證已失效，請重新輸入代號。',
  4003: '房間已滿（最多 4 人）。',
  4004: '找不到這個房號，請確認後再試。',
  4005: '你已在其他裝置或分頁加入這個房間。',
  4008: '傳送太頻繁，連線已中斷。',
  4010: '伺服器設定錯誤，請通知管理者。',
};
/** 這些關閉代碼代表「重試也沒用」，不自動重連 */
export const FATAL_CLOSE = new Set([4001, 4003, 4004, 4005, 4008, 4010]);

// Lobby messages are a tagged state variant; only current-host configuration
// uses the relay's already-authoritative world envelope. Scores/pings keep x.
export function encodeLobbyState(character, ready, revision) {
  return { x: 0, y: 0, z: 0, r: 0, a: `loadout_${character}_${ready ? 1 : 0}`, c: revision };
}
export function decodeLobbyState(d) {
  const match = /^loadout_(violet|azure|amber)_([01])$/.exec(d?.a || '');
  return match && Number.isInteger(d.c) && d.c >= 0 && d.c <= 1e13 ? { ch: match[1], ready: Number(match[2]), rv: d.c } : null;
}

/** 本機開發（localhost／127.0.0.1／file）連本機 wrangler dev，其餘連正式網址；?relay= 優先 */
export function relayUrl(location) {
  const override = new URLSearchParams(location.search).get('relay');
  if (override) return override.replace(/\/+$/, '');
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:' ? LOCAL_RELAY : PRODUCTION_RELAY;
}

export function wsUrl(relay, room, token) {
  const base = relay.replace(/^http/, 'ws');
  return `${base}/ws?room=${encodeURIComponent(room)}&token=${encodeURIComponent(token)}`;
}

/** 重連等待：0.5、1、2、4、8 秒…上限 10 秒，加 ±20% 抖動避免三人同時重連 */
export function backoffDelay(attempt, random = Math.random) {
  const base = Math.min(10000, 500 * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.8 + random() * 0.4));
}

const r3 = v => Math.round(v * 1000) / 1000;
/**
 * 本機角色狀態 → 精簡 JSON（約 100 bytes）。
 * @param {{x,y,z,yaw,lift?,anim,time?,scale?,loop?,st?}} s  @param {number} clock 本機毫秒時鐘（performance.now）
 */
export function encodeState(s, clock) {
  const d = { x: r3(s.x), y: r3(s.y), z: r3(s.z), r: r3(s.yaw), c: Math.round(clock) };
  if (s.lift) d.h = r3(s.lift);
  if (s.anim) d.a = s.anim;
  if (['violet', 'azure', 'amber'].includes(s.character)) {
    // Namespaced animation names fit the deployed relay's 24-character allowlist.
    // The suffix carries the ultimate clock without changing clip playback time.
    const musou = Number.isFinite(s.musou) && s.musou >= 0 && s.musou <= 10 ? `_m${Math.round(s.musou * 1000).toString(36)}` : '';
    d.a = `${s.character}_${s.anim || 'idle'}${musou}`;
  }
  if (s.time !== undefined) d.at = r3(s.time);
  if (s.scale !== undefined && s.scale !== 1) d.ts = r3(s.scale);
  d.l = s.loop === false ? 0 : 1;
  if (s.st) d.st = s.st | 0;   // 第三階段：狀態位元（net/team.js STATUS）
  return JSON.stringify({ t: 's', d });
}

/** relay 轉來的 d → 插值用快照 */
export function decodeState(d) {
  const match = /^(violet|azure|amber)_([\w-]+?)(?:_m([0-9a-z]{1,3}))?$/.exec(d.a || '');
  const ms = match?.[3] ? parseInt(match[3], 36) / 1000 : -1;
  return { x: d.x, y: d.y, z: d.z, yaw: d.r, lift: d.h || 0, anim: match?.[2] || d.a || 'idle', time: d.at || 0, scale: d.ts ?? 1, loop: d.l !== 0, t: d.c, st: d.st | 0,
    ...(match ? { character: match[1], musou: ms <= 10 ? ms : -1 } : {}) };
}
