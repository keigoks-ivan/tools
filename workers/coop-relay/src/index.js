/**
 * 紫刃夜行三人連線 relay（Cloudflare Workers Free plan）
 *
 * 路徑（前面可加 /coop-relay，方便以 route 掛在 tools.investmquest.com/coop-relay/* 底下）：
 *   POST /auth   {"code": "個人代號"} → {"token", "name", "exp"}；錯誤一律回「代號不正確」，每個 IP 10 分鐘最多錯 5 次
 *   GET  /ws?room=NEW|房號&token=…     → WebSocket，一個房號一個 Durable Object（CoopRoom）
 *   GET  /health                        → ok
 *
 * Secrets（wrangler secret put，不在 repo 裡）：
 *   PLAYER_CODES  JSON {"代號": "顯示名稱"}，最多 3 組；超過 3 組整個服務拒絕（設定錯誤）
 *   TOKEN_SECRET  HMAC 金鑰（≥16 字）；輪換它＝撤銷所有已發出的憑證
 * Vars（wrangler.toml）：ALLOWED_ORIGINS 逗號分隔的 Origin 白名單；ROOM_CAP（選填，只能小於等於 3，冒煙測試用）
 */
import { DurableObject } from 'cloudflare:workers';
import {
  CLOSE, MAX_MESSAGE_BYTES, Membership, RateLimiter, cleanState, makeRoomCode, normalizeRoomCode,
  originAllowed, parsePlayerCodes, throttleState,
} from './logic.js';
import { matchCode, signToken, verifyToken } from './token.js';

const ROOM_GRACE_MS = 5 * 60 * 1000;   // 房間最後一人離開後保留 5 分鐘，斷線重連（或唯一玩家網路閃斷）還能回來

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

function cors(origin) {
  return { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'Origin' };
}

/** 先接受再用代碼關閉：瀏覽器的 WebSocket 讀不到 HTTP 錯誤內容，只看得到關閉代碼與原因 */
function rejectSocket(code, reason) {
  const pair = new WebSocketPair();
  pair[1].accept();
  pair[1].close(code, reason);
  return new Response(null, { status: 101, webSocket: pair[0] });
}

/**
 * Cloudflare Access 接縫（目前不啟用，也不需要）。
 * 若日後把 /game/trio/* 與 relay 放進 Access 應用程式，Access 會在請求帶上 `Cf-Access-Jwt-Assertion`。
 * 要多一層把關時，在這裡驗證該 JWT（以 https://<team>.cloudflareaccess.com/cdn-cgi/access/certs 的公鑰驗簽，
 * 檢查 aud＝env.ACCESS_AUD、exp），驗不過回 null，呼叫端就拒絕。代號憑證仍然保留，兩層同時生效。
 * @returns {Promise<{ email: string } | 'not-configured' | null>}
 */
async function accessIdentity(request, env) {
  if (!env.ACCESS_AUD) return 'not-configured';
  // 尚未實作：設定了 ACCESS_AUD 卻沒有驗證碼時一律拒絕，避免誤以為有保護
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/coop-relay(?=\/)/, '');
    const origin = request.headers.get('Origin');
    if (path === '/health') return new Response('ok');
    if (!originAllowed(origin, env.ALLOWED_ORIGINS)) return new Response('forbidden origin', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (await accessIdentity(request, env) === null) return new Response('access denied', { status: 403 });

    const config = parsePlayerCodes(env.PLAYER_CODES);
    if (path === '/auth' && request.method === 'POST') {
      if (!config.ok || !env.TOKEN_SECRET) return json({ error: '伺服器設定錯誤，請通知管理者。' }, 500, cors(origin));
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      const throttle = env.AUTH_THROTTLE.get(env.AUTH_THROTTLE.idFromName(ip));
      const state = await throttle.check();
      if (state.blocked) {
        const minutes = Math.max(1, Math.ceil(state.retryAfterMs / 60000));
        return json({ error: `嘗試次數太多，請 ${minutes} 分鐘後再試。` }, 429, { ...cors(origin), 'retry-after': String(Math.ceil(state.retryAfterMs / 1000)) });
      }
      let code = '';
      try { code = String((await request.json())?.code ?? '').slice(0, 200); } catch {}
      const name = code ? await matchCode(code, config.entries) : null;
      if (!name) { await throttle.fail(); return json({ error: '代號不正確。' }, 401, cors(origin)); }
      const token = await signToken(name, env.TOKEN_SECRET);
      const exp = (await verifyToken(token, env.TOKEN_SECRET)).exp;
      return json({ token, name, exp }, 200, cors(origin));
    }

    if (path === '/ws') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('expected websocket', { status: 426 });
      if (!config.ok || !env.TOKEN_SECRET) return rejectSocket(CLOSE.config, 'server config');
      const who = await verifyToken(url.searchParams.get('token') || '', env.TOKEN_SECRET);
      // 憑證名稱必須仍在 PLAYER_CODES 裡：把某人的代號從 secret 移除就立刻不能再進房
      if (!who || !config.entries.some(([, name]) => name === who.name)) return rejectSocket(CLOSE.badToken, 'bad token');
      const wanted = url.searchParams.get('room') || '';
      const forward = (code, mode) => {
        const headers = new Headers(request.headers);
        headers.set('X-Coop-Room', code); headers.set('X-Coop-Name', who.name); headers.set('X-Coop-Mode', mode);
        return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(request.url, { headers }));
      };
      if (wanted.toUpperCase() === 'NEW') {
        // 開新房：隨機房號撞到還在用的房間（409）就換一個
        for (let i = 0; i < 8; i++) {
          const response = await forward(makeRoomCode(), 'create');
          if (response.status !== 409) return response;
        }
        return rejectSocket(CLOSE.noRoom, 'no free room code');
      }
      const code = normalizeRoomCode(wanted);
      if (!code) return rejectSocket(CLOSE.noRoom, 'bad room code');
      return forward(code, 'join');
    }
    return new Response('not found', { status: 404 });
  },
};

/** 每個房號一個實例。只做成員管理與轉發，不跑遊戲邏輯；用 Hibernation API，沒人說話時不計時間。 */
export class CoopRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.limiters = new WeakMap();
    // 心跳：客戶端送 "ping"，由平台直接回 "pong"，不會喚醒這個物件
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  /** 目前在房內的連線（排除正在被取代或關閉中的） */
  live(exclude = null) {
    return this.ctx.getWebSockets().filter(ws => ws !== exclude && ws.deserializeAttachment()?.id && !ws.deserializeAttachment().gone);
  }
  membership(exclude = null) { return new Membership(this.live(exclude).map(ws => ws.deserializeAttachment()), Number(this.env.ROOM_CAP) || undefined); }
  send(ws, message) { try { ws.send(typeof message === 'string' ? message : JSON.stringify(message)); } catch {} }
  broadcast(message, except = null) {
    const text = JSON.stringify(message);
    for (const ws of this.live()) if (ws !== except) this.send(ws, text);
  }

  async fetch(request) {
    const room = request.headers.get('X-Coop-Room');
    const name = request.headers.get('X-Coop-Name');
    const mode = request.headers.get('X-Coop-Mode');
    const now = Date.now();
    const members = this.membership();
    const lastSeen = (await this.ctx.storage.get('lastSeen')) || 0;
    const recent = now - lastSeen < ROOM_GRACE_MS;
    if (mode === 'create') {
      if (members.size > 0 || recent) return new Response('room code in use', { status: 409 });
      await this.ctx.storage.put('lastSeen', now);
    } else if (members.size === 0 && !recent) return rejectSocket(CLOSE.noRoom, 'room not found');

    const result = members.join(name, name, now);
    if (!result.ok) return rejectSocket(CLOSE.roomFull, 'room full');
    // 同一個人重新連線（或換裝置）：舊連線標記後關閉，關閉事件不再廣播離開
    for (const ws of this.live()) {
      const info = ws.deserializeAttachment();
      if (info.id !== name) continue;
      ws.serializeAttachment({ ...info, gone: true });
      try { ws.close(CLOSE.replaced, 'replaced'); } catch {}
    }
    const pair = new WebSocketPair();
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: name, name, joinedAt: result.member.joinedAt, room });
    const after = this.membership();
    this.send(server, { t: 'welcome', room, you: name, host: after.host, members: after.list() });
    this.broadcast({ t: 'join', member: result.member, host: after.host, rejoin: result.rejoin }, server);
    await this.ctx.storage.deleteAlarm();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES) return;
    let limiter = this.limiters.get(ws);
    if (!limiter) this.limiters.set(ws, limiter = new RateLimiter());
    if (!limiter.allow(Date.now())) {
      if (limiter.abusive) { try { ws.close(CLOSE.abuse, 'too many messages'); } catch {} }
      return;
    }
    const info = ws.deserializeAttachment();
    if (!info?.id || info.gone) return;
    let msg;
    try { msg = JSON.parse(message); } catch { return; }
    if (msg?.t === 's') {
      const d = cleanState(msg.d);
      if (d) this.broadcast({ t: 's', p: info.id, d }, ws);
    }
  }

  async webSocketClose(ws, code, reason) { await this.leave(ws); try { ws.close(1000, 'bye'); } catch {} }
  async webSocketError(ws) { await this.leave(ws); }

  async leave(ws) {
    const info = ws.deserializeAttachment();
    if (!info?.id || info.gone) return;
    ws.serializeAttachment({ ...info, gone: true });
    const before = new Membership([...this.live(ws).map(s => s.deserializeAttachment()), info]);
    const outcome = before.leave(info.id);
    if (!outcome.removed) return;
    this.broadcast({ t: 'leave', id: info.id, host: outcome.host });
    if (outcome.hostChanged && outcome.host) this.broadcast({ t: 'host', id: outcome.host });
    if (before.size === 0) {
      await this.ctx.storage.put('lastSeen', Date.now());
      await this.ctx.storage.setAlarm(Date.now() + ROOM_GRACE_MS + 1000);
    }
  }

  /** 房間空了超過保留時間：清掉儲存，房號可以再被抽到 */
  async alarm() {
    if (this.live().length === 0) await this.ctx.storage.deleteAll();
  }
}

/** 每個 IP 一個實例：記錄 10 分鐘內代號輸入錯誤的時間 */
export class AuthThrottle extends DurableObject {
  async check() {
    const { recent, blocked, retryAfterMs } = throttleState(await this.ctx.storage.get('hits'), Date.now());
    return { blocked, retryAfterMs, failures: recent.length };
  }
  async fail() {
    const now = Date.now();
    const { recent } = throttleState(await this.ctx.storage.get('hits'), now);
    recent.push(now);
    await this.ctx.storage.put('hits', recent);
    await this.ctx.storage.setAlarm(now + 11 * 60 * 1000);
  }
  async alarm() {
    const { recent } = throttleState(await this.ctx.storage.get('hits'), Date.now());
    if (recent.length === 0) await this.ctx.storage.deleteAll();
  }
}
