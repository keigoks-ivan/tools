/**
 * 三人連線客戶端：代號登入（換憑證）、開房／加入、斷線重連、送出與接收角色狀態。
 * 不依賴 Three.js，瀏覽器以外的環境可注入 WebSocket／fetch／storage（game/tests/coop-net.test.mjs）。
 */
import { CLOSE_TEXT, FATAL_CLOSE, PING_MS, TOKEN_KEY, backoffDelay, decodeLobbyState, decodeState, encodeState, wsUrl } from './protocol.js?v=20261002b';

/** localStorage 包一層 try/catch：私密模式或封鎖網站資料時仍能玩，只是每次要重新輸入代號 */
export function safeStorage(backing = globalThis.localStorage) {
  const memory = new Map();
  return {
    get(key) { try { const v = backing?.getItem(key); if (v !== null && v !== undefined) return v; } catch {} return memory.get(key) ?? null; },
    set(key, value) { memory.set(key, value); try { backing?.setItem(key, value); } catch {} },
    remove(key) { memory.delete(key); try { backing?.removeItem(key); } catch {} },
  };
}

export class CoopClient {
  constructor({ relay, WebSocketImpl = globalThis.WebSocket, fetchImpl = (...args) => globalThis.fetch(...args), storage = safeStorage(),
    now = () => globalThis.performance?.now() ?? Date.now(), timers = { set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id), every: (fn, ms) => setInterval(fn, ms), stop: id => clearInterval(id) },
    random = Math.random } = {}) {
    Object.assign(this, { relay, WebSocketImpl, fetchImpl, storage, now, timers, random });
    this.listeners = new Map();
    this.ws = null; this.room = null; this.you = null; this.host = null;
    this.members = new Map();
    this.attempt = 0; this.wanted = false; this.retryTimer = null; this.pingTimer = null; this.ready = false;
  }

  on(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); return () => this.listeners.get(type).delete(fn); }
  emit(type, ...args) { for (const fn of this.listeners.get(type) || []) { try { fn(...args); } catch (error) { console.error(error); } } }

  get token() { return this.storage.get(TOKEN_KEY); }
  /** 已存的憑證（含顯示名稱與到期日）；過期或格式壞掉就當作沒有 */
  savedIdentity() {
    const token = this.token;
    if (!token) return null;
    try {
      // 只讀內容顯示名稱與到期日；真偽由 relay 驗簽
      const bytes = Uint8Array.from(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      const payload = JSON.parse(new TextDecoder().decode(bytes));
      if (typeof payload.n !== 'string' || payload.e * 1000 <= Date.now()) { this.storage.remove(TOKEN_KEY); return null; }
      return { name: payload.n, exp: payload.e };
    } catch { this.storage.remove(TOKEN_KEY); return null; }
  }
  forget() { this.storage.remove(TOKEN_KEY); }

  /** 輸入代號換憑證；失敗時丟出可直接顯示的中文訊息 */
  async login(code) {
    let response;
    try {
      response = await this.fetchImpl(`${this.relay}/auth`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: String(code).trim() }) });
    } catch { throw new Error('連不上伺服器，請檢查網路後再試。'); }
    let body = null;
    try { body = await response.json(); } catch {}
    if (!response.ok || !body?.token) throw new Error(body?.error || '連不上伺服器，請稍後再試。');
    this.storage.set(TOKEN_KEY, body.token);
    return { name: body.name, exp: body.exp };
  }

  /**
   * 開房（room = 'NEW'）或加入房號。第一次收到 welcome 時 resolve；遇到無法重試的關閉就 reject。
   * 之後斷線會自動重連同一個房號。
   */
  connect(room) {
    this.close();
    this.wanted = true; this.attempt = 0; this.room = room;
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.open();
    });
  }

  open() {
    const token = this.token;
    if (!token) { this.fail(4001); return; }
    const ws = new this.WebSocketImpl(wsUrl(this.relay, this.room, token));
    this.ws = ws; this.ready = false;
    this.emit('status', this.attempt ? '重新連線中…' : '連線中…', 'connecting');
    ws.onmessage = event => { if (this.ws === ws) this.handle(event.data); };
    ws.onclose = event => { if (this.ws === ws) this.closed(event.code, event.reason); };
    ws.onerror = () => {};
  }

  handle(data) {
    if (data === 'pong') return;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg.t === 's') {
      if (this.members.has(msg.p) && msg.p !== this.you) {
        const choice = decodeLobbyState(msg.d);
        if (choice) this.emit('signal', msg.p, choice, this.now());
        else this.emit('state', msg.p, decodeState(msg.d), this.now());
      }
      return;
    }
    if (msg.t === 'welcome') {
      this.ready = true; this.attempt = 0;
      this.room = msg.room; this.you = msg.you; this.host = msg.host;
      const before = new Set(this.members.keys());
      this.members = new Map(msg.members.map(m => [m.id, m]));
      for (const id of before) if (!this.members.has(id)) this.emit('leave', id);   // 重連期間離開的人
      this.timers.stop(this.pingTimer);
      this.pingTimer = this.timers.every(() => { try { this.ws?.send('ping'); } catch {} }, PING_MS);
      this.emit('welcome', msg);
      this.emit('status', `已連線・房號 ${msg.room}`, 'ok');
      this.pending?.resolve(msg); this.pending = null;
      return;
    }
    if (msg.t === 'join') { this.members.set(msg.member.id, msg.member); this.host = msg.host; this.emit('join', msg.member, msg.rejoin); return; }
    if (msg.t === 'leave') { this.members.delete(msg.id); this.host = msg.host; this.emit('leave', msg.id); return; }
    if (msg.t === 'host') { this.host = msg.id; this.emit('host', msg.id); return; }
    // 第二階段：房主送的戰場（只收現任房主的）、隊友送給房主的命中申報（relay 只轉給房主）
    if (msg.t === 'e') {
      if (msg.p === this.host && msg.p !== this.you && msg.d && typeof msg.d === 'object') {
        if (msg.d.loadout && typeof msg.d.loadout === 'object') this.emit('signal', msg.p, msg.d.loadout, this.now());
        else this.emit('world', msg.d, this.now(), msg.p);
      }
      return;
    }
    // 隊伍訊號（喊話、結算成績），任何隊友都能發
    if (msg.t === 'x') { if (this.members.has(msg.p) && msg.p !== this.you && msg.d && typeof msg.d === 'object') this.emit('signal', msg.p, msg.d, this.now()); return; }
    if (msg.t === 'h') { if (this.isHost && msg.p !== this.you && this.members.has(msg.p) && msg.d && typeof msg.d === 'object') this.emit('claim', msg.p, msg.d, this.now()); }
  }

  get isHost() { return !!this.you && this.you === this.host; }

  closed(code, reason) {
    this.ws = null; this.ready = false;
    this.timers.stop(this.pingTimer); this.pingTimer = null;
    if (!this.wanted) return;
    if (FATAL_CLOSE.has(code)) { this.fail(code); return; }
    // 還沒進過房就連不上（伺服器沒開、網址錯）：直接回報，不無限重試
    if (this.pending && this.attempt >= 2) { this.fail(code, '連不上伺服器，請稍後再試。'); return; }
    const delay = backoffDelay(this.attempt++, this.random);
    this.emit('status', `連線中斷，${Math.ceil(delay / 1000)} 秒後重新連線…`, 'retry');
    this.retryTimer = this.timers.set(() => { this.retryTimer = null; if (this.wanted) this.open(); }, delay);
  }

  fail(code, text = CLOSE_TEXT[code] || '連線已中斷。') {
    this.wanted = false;
    if (code === 4001) this.forget();
    this.emit('status', text, 'error');
    this.emit('closed', code, text);
    if (this.pending) { const error = new Error(text); error.code = code; this.pending.reject(error); this.pending = null; }
  }

  /** 送出本機角色狀態（未連上時直接略過，不排隊） */
  sendState(state) {
    if (!this.ready || this.ws?.readyState !== 1) return false;
    try { this.ws.send(encodeState(state, this.now())); return true; } catch { return false; }
  }

  /** 第二階段的其他訊息（e＝戰場、h＝命中申報、y＝交出房主）；未連上時略過 */
  send(t, d) {
    if (!this.ready || this.ws?.readyState !== 1) return false;
    try { this.ws.send(JSON.stringify({ t, d })); return true; } catch { return false; }
  }

  close() {
    this.wanted = false;
    if (this.retryTimer) this.timers.clear(this.retryTimer);
    this.retryTimer = null;
    this.timers.stop(this.pingTimer); this.pingTimer = null;
    const ws = this.ws;
    this.ws = null; this.ready = false;
    if (ws) { try { ws.close(1000, 'bye'); } catch {} }
    this.members.clear();
  }
}
