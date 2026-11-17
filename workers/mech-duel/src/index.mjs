import { DurableObject } from 'cloudflare:workers';
import { STEP, createMatch, sanitizeInput, snapshotMatch, tickMatch } from '../../../game/mech/duel/rules.mjs';
import { CLOSE, PROTOCOL, makeResumeToken, makeRoomCode, originAllowed, readPacket, roomCode, validResumeToken } from './protocol.mjs';

const LEASE = 45_000;
const IDLE = 20 * 60_000;
const TICK_MS = STEP * 1000;
const SAVE_TICKS = Math.round(5 / STEP);
const INPUT_TIMEOUT = 400;
const limitFor = (address, env, create) => (create ? env.CREATE_LIMIT : env.JOIN_LIMIT).limit({ key: address });

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '3600', Vary: 'Origin',
  };
}

function rejectSocket(reason) {
  const pair = new WebSocketPair();
  pair[1].accept();
  pair[1].close(CLOSE[reason], reason);
  return new Response(null, { status: 101, webSocket: pair[0] });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/mech-duel(?=\/)/, '');
    if (path === '/health' && request.method === 'GET') return json({ ok: true, protocol: PROTOCOL });
    const origin = request.headers.get('Origin');
    if (!originAllowed(origin, env.ALLOWED_ORIGINS)) return json({ error: 'origin' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    const address = request.headers.get('CF-Connecting-IP') ?? 'local';

    if (path === '/rooms' && request.method === 'POST') {
      if (!(await limitFor(address, env, true)).success) return json({ error: 'rate_limit' }, 429, cors(origin));
      for (let i = 0; i < 3; i++) {
        const room = makeRoomCode();
        const response = await env.ROOMS.getByName(room).fetch(`https://room.internal/create?room=${room}`, { method: 'POST' });
        if (response.ok) return json({ room }, 201, cors(origin));
        if (response.status !== 409) break;
      }
      return json({ error: 'unavailable' }, 503, cors(origin));
    }

    if (path === '/ws' && request.method === 'GET') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'websocket_required' }, 426, cors(origin));
      if (!(await limitFor(address, env, false)).success) return rejectSocket('rate_limit');
      const room = roomCode(url.searchParams.get('room'));
      if (!room) return rejectSocket('room_not_found');
      const resume = url.searchParams.get('resume');
      if (resume !== null && !validResumeToken(resume)) return rejectSocket('resume_expired');
      const internal = new URL('https://room.internal/socket');
      if (resume) internal.searchParams.set('resume', resume);
      return env.ROOMS.getByName(room).fetch(new Request(internal, { headers: { Upgrade: 'websocket' } }));
    }
    return json({ error: 'not_found' }, 404, cors(origin));
  },
};

export class DuelRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.record = null;
    this.peers = [null, null];
    this.input = [null, null];
    this.rate = new WeakMap();
    this.timer = null;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.record = await ctx.storage.get('room') ?? null;
      for (const ws of ctx.getWebSockets()) {
        const slot = ws.deserializeAttachment()?.slot;
        if (this.record?.slots[slot]) this.peers[slot] = ws;
      }
      if (this.record) {
        const now = Date.now();
        const needsLease = this.record.slots.some((seat, slot) => seat && !this.peers[slot] && !seat.deadline);
        if (needsLease) {
          this.record.slots.forEach((seat, slot) => { if (seat && !this.peers[slot] && !seat.deadline) seat.deadline = now + LEASE; });
          await this.saveRoom();
        }
        this.startLoop();
      }
    });
  }

  get playing() {
    return this.record?.match && this.record.match.phase !== 'matchEnd';
  }

  status() {
    return {
      members: this.peers.map(Boolean),
      ready: this.record.slots.map(seat => seat?.ready === true),
      paused: Boolean(this.playing && !this.peers.every(Boolean)),
    };
  }

  send(ws, message) {
    if (ws?.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify(message)); } catch {}
  }

  broadcast(message) {
    for (const ws of this.peers) this.send(ws, message);
  }

  snapshots() {
    const state = snapshotMatch(this.record.match);
    this.peers.forEach((ws, slot) => this.send(ws, { t: 'state', state, ack: this.record.slots[slot]?.ack ?? -1 }));
  }

  async saveRoom() {
    await this.ctx.storage.put('room', this.record);
    const deadline = Math.min(this.record.idleUntil, ...this.record.slots.map(seat => seat?.deadline || Infinity));
    await this.ctx.storage.setAlarm(deadline);
  }

  reap(now) {
    let expired = false;
    for (let slot = 0; slot < 2; slot++) {
      const seat = this.record.slots[slot];
      if (!seat?.deadline || seat.deadline > now || this.peers[slot]) continue;
      this.record.slots[slot] = null;
      this.input[slot] = null;
      expired = true;
    }
    if (!expired) return false;
    if (this.record.match) {
      this.record.match = null;
      this.broadcast({ t: 'aborted', reason: 'disconnect' });
    }
    this.record.slots.forEach(seat => { if (seat) seat.ready = false; });
    this.broadcast({ t: 'room', ...this.status() });
    return true;
  }

  async expire() {
    this.stopLoop();
    for (const ws of this.peers) {
      if (ws) try { ws.close(CLOSE.room_expired, 'room_expired'); } catch {}
    }
    this.peers = [null, null];
    this.record = null;
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const now = Date.now();
    if (this.record?.idleUntil <= now) await this.expire();
    if (url.pathname === '/create' && request.method === 'POST') {
      if (this.record) return new Response(null, { status: 409 });
      this.record = { room: url.searchParams.get('room'), slots: [null, null], match: null, idleUntil: now + IDLE };
      await this.saveRoom();
      return new Response(null, { status: 201 });
    }
    if (url.pathname !== '/socket' || !this.record) return rejectSocket('room_not_found');
    if (this.reap(now)) await this.saveRoom();
    const token = url.searchParams.get('resume');
    const { slots, room } = this.record;
    const slot = slots.findIndex(seat => token ? seat?.resume === token : seat === null);
    if (slot < 0) return rejectSocket(token ? 'resume_expired' : 'room_full');
    const old = this.peers[slot];
    if (old) {
      old.serializeAttachment(null);
      try { old.close(CLOSE.replaced, 'replaced'); } catch {}
    }
    const seat = slots[slot] ?? { resume: makeResumeToken(), ready: false, ack: -1 };
    slots[slot] = seat;
    seat.deadline = null;
    this.record.idleUntil = now + IDLE;
    this.input[slot] = null;
    const pair = new WebSocketPair();
    this.peers[slot] = pair[1];
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ slot });
    this.send(pair[1], { t: 'welcome', slot, room, resume: seat.resume, ack: seat.ack, ...this.status() });
    this.broadcast({ t: 'room', ...this.status() });
    if (this.record.match) this.snapshots();
    this.startLoop();
    await this.saveRoom();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, message) {
    const slot = ws.deserializeAttachment()?.slot;
    if (this.peers[slot] !== ws) return;
    const now = Date.now();
    let rate = this.rate.get(ws);
    if (!rate || now >= rate.until) this.rate.set(ws, rate = { n: 0, until: now + 1000 });
    if (++rate.n > 60) {
      if (rate.n > 100) ws.close(CLOSE.rate_limit, 'rate_limit');
      return;
    }
    const packet = readPacket(message);
    if (!packet) return;
    if (packet.t === 'leave') return this.leave(ws, true);
    const { match, slots } = this.record;
    const seat = slots[slot];
    if (packet.t === 'input') {
      if (!this.playing || packet.seq <= seat.ack) return;
      seat.ack = packet.seq;
      this.input[slot] = { value: sanitizeInput(packet.input), until: now + INPUT_TIMEOUT };
      return;
    }
    const canReady = packet.t === 'ready' && !match;
    const canRematch = packet.t === 'rematch' && match?.phase === 'matchEnd';
    if (!canReady && !canRematch) return;
    seat.ready = canRematch || packet.value;
    this.record.idleUntil = now + IDLE;
    if (slots.every(item => item?.ready) && this.peers.every(Boolean)) this.beginMatch();
    else this.broadcast({ t: 'room', ...this.status() });
    await this.saveRoom();
  }

  beginMatch() {
    this.record.match = createMatch();
    this.record.slots.forEach(seat => { seat.ready = false; });
    this.input = [null, null];
    this.broadcast({ t: 'room', ...this.status() });
    this.snapshots();
    this.startLoop();
  }

  startLoop() {
    if (this.timer !== null || !this.playing || !this.peers.every(Boolean)) return;
    this.nextTick = Date.now() + TICK_MS;
    this.schedule();
  }

  schedule() {
    this.timer = setTimeout(() => this.runTicks(), Math.max(1, this.nextTick - Date.now()));
  }

  stopLoop() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  runTicks() {
    this.timer = null;
    if (!this.playing || !this.peers.every(Boolean)) return;
    const now = Date.now();
    const match = this.record.match;
    const phase = match.phase;
    const before = match.tick;
    const input = this.input.map(entry => entry && entry.until > now ? entry.value : null);
    let count = 0;
    // Keep a short, bounded catch-up after a late timer and send one state.
    while (this.nextTick <= now + 1 && this.playing && count < 4) {
      tickMatch(match, input);
      this.nextTick += TICK_MS;
      count++;
    }
    if (this.nextTick <= now) this.nextTick = now + TICK_MS;
    if (Math.floor(match.tick / 2) !== Math.floor(before / 2) || phase !== match.phase) this.snapshots();
    if (phase !== match.phase || Math.floor(match.tick / SAVE_TICKS) !== Math.floor(before / SAVE_TICKS)) {
      this.ctx.waitUntil(this.ctx.storage.put('room', this.record));
    }
    if (this.playing) this.schedule();
  }

  async webSocketClose(ws) {
    await this.leave(ws);
    try { ws.close(1000, 'bye'); } catch {}
  }
  async webSocketError(ws) { await this.leave(ws); }

  async leave(ws, permanent = false) {
    const slot = ws.deserializeAttachment()?.slot;
    if (this.peers[slot] !== ws) return;
    this.peers[slot] = null;
    this.input[slot] = null;
    this.stopLoop();
    const seat = this.record.slots[slot];
    seat.ready = false;
    const now = Date.now();
    seat.deadline = permanent ? now : now + LEASE;
    if (permanent) {
      this.reap(now);
      try { ws.close(1000, 'left'); } catch {}
    } else this.broadcast({ t: 'room', ...this.status() });
    await this.saveRoom();
  }

  async alarm() {
    if (!this.record) return;
    const now = Date.now();
    if (now >= this.record.idleUntil) await this.expire();
    else {
      this.reap(now);
      await this.saveRoom();
    }
  }
}
