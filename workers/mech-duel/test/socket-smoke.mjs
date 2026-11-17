import { strict as assert } from 'node:assert';
import { setTimeout as sleep } from 'node:timers/promises';
import { CLOSE, makeRoomCode, makeResumeToken, roomCode } from '../src/protocol.mjs';

const base = (process.env.DUEL_BASE || 'http://127.0.0.1:8791').replace(/\/$/, '');
const origin = process.env.DUEL_ORIGIN || 'http://localhost:8997';
const peers = [];
const age = () => Date.now();

async function wait(read, until, label, timeout = 5000) {
  const end = age() + timeout;
  do {
    const value = read();
    if (until(value)) return value;
    await sleep(20);
  } while (age() < end);
  throw new Error(`等待逾時：${label}`);
}

function connect(room, resume) {
  const url = new URL(base.replace(/^http/, 'ws') + '/ws');
  url.searchParams.set('room', room);
  if (resume) url.searchParams.set('resume', resume);
  const socket = new WebSocket(url, { headers: { Origin: origin } });
  const client = { socket, status: null, welcome: null, state: null, close: null, seq: 0 };
  peers.push(client);
  socket.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.t === 'welcome') { client.welcome = msg; client.seq = msg.ack + 1; }
    if (msg.t === 'room') client.status = msg;
    if (msg.t === 'state') client.state = msg;
  });
  socket.addEventListener('close', ({ code, reason }) => { client.close = { code, reason }; });
  socket.addEventListener('error', () => {});
  client.send = packet => socket.send(JSON.stringify(packet));
  client.input = input => client.send({ t: 'input', seq: client.seq++, input });
  return client;
}

async function expectClose(client, code) {
  const result = await wait(() => client.close, Boolean, code);
  assert.deepEqual(result, { code: CLOSE[code], reason: code });
}

try {
  assert.deepEqual(await (await fetch(base + '/health')).json(), { ok: true, protocol: 1 });
  const denied = await fetch(base + '/rooms', { method: 'POST', headers: { Origin: 'https://foreign.invalid' } });
  assert.equal(denied.status, 403);
  const response = await fetch(base + '/rooms', { method: 'POST', headers: { Origin: origin } });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  const { room } = await response.json();
  assert.equal(roomCode(room), room);
  await expectClose(connect(makeRoomCode()), 'room_not_found');
  await expectClose(connect(room, makeResumeToken()), 'resume_expired');

  const first = connect(room);
  const a = await wait(() => first.welcome, Boolean, '第一位玩家');
  assert.deepEqual([a.slot, a.members, a.ack], [0, [true, false], -1]);
  first.send({t:'mech',id:'bailu'});
  await wait(()=>first.status,s=>s?.mechs[0]==='bailu','第一位選擇白鷺');
  first.send({ t: 'ready', value: true });
  const second = connect(room);
  const b = await wait(() => second.welcome, Boolean, '第二位玩家');
  assert.deepEqual([b.slot, b.members], [1, [true, true]]);
  assert.notEqual(a.resume, b.resume);
  assert.deepEqual(b.mechs,['bailu','cangyan']);
  second.send({t:'mech',id:'tiechao'});
  await wait(()=>first.status,s=>s?.mechs[1]==='tiechao','雙方看到鐵潮');
  first.send({t:'mech',id:'cangyan'});
  first.send({t:'mech',id:'invalid'});
  await expectClose(connect(room), 'room_full');
  assert.equal(first.state, null);
  second.send({ t: 'ready', value: true });
  await wait(() => first.state, s => s?.state.phase === 'fight', '兩人同步開局');
  await wait(() => second.state, s => s?.state.phase === 'fight', '第二位同步開局');
  assert.deepEqual(first.state.state.mechs,['bailu','tiechao']);
  assert(first.state.state.players.every(p=>p.hp===9000&&p.ammo===40));
  second.send({t:'mech',id:'cangyan'});
  await sleep(100);
  assert.deepEqual(second.state.state.mechs,['bailu','tiechao']);
  console.log('PASS 三款外型同步，準備與交戰後鎖定，性能完全共用');
  console.log('PASS 建立私房、拒絕錯誤憑證和第三人、兩人準備後進入對局');

  first.send({ t: 'state', winner: 0, players: [{ hp: 0 }, { hp: 0 }] });
  const moving = setInterval(() => {
    first.input({ ascend: true });
    second.input({ ascend: true });
  }, 70);
  try {
    await wait(() => second.state, s => s?.state.players.every(p => p.y >= 32), '兩端同步飛行、假狀態無效');
    assert(second.state.state.players.every(p => p.hp === 9000));
  } finally { clearInterval(moving); }
  second.socket.close();
  await wait(() => first.status, s => s?.paused && !s.members[1], '看見對手斷線');
  const pausedAt = first.state.state.tick;
  await sleep(300);
  assert.equal(first.state.state.tick, pausedAt);
  const rejoin = connect(room, b.resume);
  const resumed = await wait(() => rejoin.welcome, Boolean, '回到保留的座位');
  assert.equal(resumed.slot, 1);
  assert.deepEqual(resumed.mechs,['bailu','tiechao']);
  assert(resumed.ack >= 0);
  await wait(() => rejoin.state, s => s?.state.tick > pausedAt, '重連後恢復戰鬥');
  assert(rejoin.state.state.players[1].y >= 32);
  console.log('PASS 兩台客戶端同步飛行、伺服器忽略假勝負、斷線暫停後保留位置重連');

  const fighting = setInterval(() => {
    const [a, b] = first.state.state.players;
    const range = Math.hypot(b.x - a.x, b.z - a.z);
    first.input({
      ascend: a.y < 33, yaw: Math.atan2(b.x - a.x, b.z - a.z),
      pitch: Math.atan2(b.y - a.y, range), fire: a.y >= 32,
    });
    rejoin.input({ ascend: b.y < 33 });
  }, 65);
  try {
    await wait(() => first.state, s => s?.state.phase === 'matchEnd', '步槍命中、回合結算、三戰兩勝', 30_000);
    await wait(() => rejoin.state, s => s?.state.phase === 'matchEnd', '雙方收到同一個結算');
  } finally { clearInterval(fighting); }
  const result = first.state.state;
  assert.deepEqual(result.wins, [2, 0]);
  assert.equal(result.winner, 0);
  assert.deepEqual(result, rejoin.state.state);
  first.send({t:'mech',id:'cangyan'});
  rejoin.send({t:'mech',id:'bailu'});
  await wait(()=>first.status,s=>s?.mechs.join(',')==='cangyan,bailu','結算後可選擇下一場外型');
  first.send({ t: 'rematch' });
  await wait(() => first.status, s => s?.ready[0], '等待對手同意再戰');
  assert.equal(first.state.state.phase, 'matchEnd');
  rejoin.send({ t: 'rematch' });
  await wait(() => first.state, s => s?.state.phase === 'countdown' && s.state.round === 1, '兩人同意再戰');
  assert.deepEqual(first.state.state.mechs,['cangyan','bailu']);
  console.log('PASS 真實伺服器步槍命中、雙方勝負一致、雙方同意後重新開戰');
  rejoin.send({ t: 'leave' });
  assert.deepEqual(await wait(() => rejoin.close, Boolean, '主動離開'), { code: 1000, reason: 'left' });
  const replacement = connect(room);
  assert.equal((await wait(() => replacement.welcome, Boolean, '新的玩家加入')).slot, 1);
  assert.equal(replacement.state, null);
  console.log('PASS 主動離開後座位可立即讓新對手加入');
} finally {
  for (const { socket } of peers) if (socket.readyState < WebSocket.CLOSING) socket.close();
}
