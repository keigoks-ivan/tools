// 三人連線客戶端（game/3d-next/net/）：協定、插值緩衝、連線／重連、送出節流、隊友呈現，
// 以及「單人頁完全不載入連線程式」的隔離檢查。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { SnapshotBuffer, lerpAngle, INTERP_DELAY_MS, MAX_EXTRAPOLATE_MS } from '../3d-next/net/interp.js';
import { backoffDelay, decodeState, encodeState, relayUrl, wsUrl, LOCAL_RELAY, PRODUCTION_RELAY, FATAL_CLOSE, CLOSE_TEXT } from '../3d-next/net/protocol.js';
import { CoopClient, safeStorage } from '../3d-next/net/client.js';
import { createCoop, sameState } from '../3d-next/net/coop.js';
import { CLOSE } from '../../workers/coop-relay/src/logic.js';

const gameRoot = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, gameRoot), 'utf8');
const snap = (t, x, extra = {}) => ({ t, x, y: 0, z: 0, yaw: 0, lift: 0, anim: 'run', time: 0, scale: 1, loop: true, ...extra });

// ---------- 插值 ----------
test('snapshots render ~100 ms behind the sender and interpolate linearly between 12 Hz packets', () => {
  const buffer = new SnapshotBuffer();
  const latency = 40;   // sender clock 0 → arrives at local 1000 + 40
  for (let i = 0; i <= 6; i++) buffer.push(snap(i * 83, i * 0.5), 1000 + i * 83 + latency);
  // local time when sender time 250 should be on screen: 250 + offset(1040) + delay(100)
  const s = buffer.sample(250 + 1040 + INTERP_DELAY_MS);
  const expected = 0.5 * (3 + (250 - 249) / 83);   // between packets 3 (t=249) and 4 (t=332)
  assert.ok(Math.abs(s.x - expected) < 1e-9, `${s.x} vs ${expected}`);
  assert.equal(s.extrapolated, 0);
  assert.equal(s.frozen, false);
});

test('network jitter is absorbed: offset tracks the fastest packet, late packets still land inside the buffer', () => {
  const buffer = new SnapshotBuffer();
  const jitter = [30, 90, 45, 120, 35, 60, 100, 40];
  for (let i = 0; i < jitter.length; i++) buffer.push(snap(i * 83, i), 5000 + i * 83 + jitter[i]);
  assert.equal(buffer.offset <= 5000 + 35 + 5, true, `offset ${buffer.offset}`);
  // every rendered time up to the last packet is interpolated, never extrapolated
  for (let t = 100; t <= 7 * 83 - 1; t += 10) assert.equal(buffer.sample(t + buffer.offset + INTERP_DELAY_MS).extrapolated, 0, `t=${t}`);
});

test('packet gap: extrapolate along the last velocity for at most 250 ms, then freeze', () => {
  const buffer = new SnapshotBuffer();
  buffer.push(snap(0, 0), 1000);
  buffer.push(snap(100, 1), 1100);   // 10 m/s
  const at = sender => buffer.sample(sender + buffer.offset + INTERP_DELAY_MS);
  const soon = at(200);
  assert.ok(Math.abs(soon.x - 2) < 1e-9); assert.equal(soon.extrapolated, 100); assert.equal(soon.frozen, false);
  const late = at(100 + MAX_EXTRAPOLATE_MS + 500);
  assert.ok(Math.abs(late.x - (1 + MAX_EXTRAPOLATE_MS / 100)) < 1e-9, 'stops at the extrapolation cap');
  assert.equal(late.frozen, true);
});

test('duplicates and out-of-order packets are dropped; a sender page reload resets the buffer', () => {
  const buffer = new SnapshotBuffer();
  assert.equal(buffer.push(snap(100, 1), 1000), true);
  assert.equal(buffer.push(snap(100, 9), 1010), false);
  assert.equal(buffer.push(snap(50, 9), 1020), false);
  assert.equal(buffer.push(snap(3000, 2), 3900), true);
  assert.equal(buffer.push(snap(5, 2), 5000), true, 'clock jumped back > 1 s: new session');
  assert.equal(buffer.snaps.length, 1);
  assert.equal(buffer.offset, 4995);
});

test('idle keepalives: resuming movement after a quiet gap starts from where the player stood', () => {
  const buffer = new SnapshotBuffer();
  buffer.push(snap(0, 3, { anim: 'idle' }), 1000);
  buffer.push(snap(500, 3, { anim: 'idle' }), 1500);    // 2 Hz while standing
  buffer.push(snap(1000, 3, { anim: 'idle' }), 2000);
  buffer.push(snap(1400, 3.5), 2400);                   // starts running 400 ms after the last keepalive
  const at = sender => buffer.sample(sender + buffer.offset + INTERP_DELAY_MS);
  assert.equal(at(1200).x, 3, 'no slow slide across the quiet gap');
  assert.equal(at(1310).x, 3, 'hold snapshot inserted one interval before the first moving packet');
  assert.ok(at(1360).x > 3 && at(1360).x < 3.5);
  // a moving player who drops packets is NOT held (that would stutter)
  const moving = new SnapshotBuffer();
  moving.push(snap(0, 0), 1000); moving.push(snap(83, 1), 1083); moving.push(snap(500, 6), 1500);
  assert.equal(moving.snaps.length, 3);
});

test('yaw interpolates the short way around', () => {
  assert.ok(Math.abs(lerpAngle(3.1, -3.1, 0.5) - Math.PI) < 0.01 || Math.abs(lerpAngle(3.1, -3.1, 0.5) + Math.PI) < 0.01);
  assert.ok(Math.abs(lerpAngle(0.2, 0.6, 0.5) - 0.4) < 1e-12);
});

// ---------- 協定 ----------
test('state encoding is compact and round-trips', () => {
  const text = encodeState({ x: 1.23456, y: 0.5, z: -3, yaw: 2.5, lift: 0, anim: 'combo2', time: 0.1234, scale: 1.5, loop: false }, 12345.6);
  assert.ok(text.length < 120, text);
  const { t, d } = JSON.parse(text);
  assert.equal(t, 's');
  assert.deepEqual(decodeState(d), { x: 1.235, y: 0.5, z: -3, yaw: 2.5, lift: 0, anim: 'combo2', time: 0.123, scale: 1.5, loop: false, t: 12346, st: 0 });
});

test('relay URL: localhost uses wrangler dev, production otherwise, ?relay= overrides', () => {
  assert.equal(relayUrl(new URL('http://localhost:8931/game/trio/')), LOCAL_RELAY);
  assert.equal(relayUrl(new URL('https://tools.investmquest.com/game/trio/')), PRODUCTION_RELAY);
  assert.equal(relayUrl(new URL('https://tools.investmquest.com/game/trio/?relay=https://x.workers.dev/')), 'https://x.workers.dev');
  assert.equal(wsUrl('https://a.b/coop-relay', 'NEW', 'k.s'), 'wss://a.b/coop-relay/ws?room=NEW&token=k.s');
});

test('reconnect backoff doubles from 0.5 s, caps at 10 s, with ±20% jitter', () => {
  assert.equal(backoffDelay(0, () => 0.5), 500);
  assert.equal(backoffDelay(3, () => 0.5), 4000);
  assert.equal(backoffDelay(20, () => 0.5), 10000);
  assert.equal(backoffDelay(1, () => 0), 800);
  assert.equal(backoffDelay(1, () => 1), 1200);
});

test('client close texts cover every relay close code; those codes do not auto-reconnect', () => {
  for (const code of Object.values(CLOSE)) {
    assert.ok(CLOSE_TEXT[code], `missing text for ${code}`);
    assert.ok(FATAL_CLOSE.has(code));
  }
  for (const text of Object.values(CLOSE_TEXT)) assert.doesNotMatch(text, /[,.:;?!](?![\d])/, `half-width punctuation in ${text}`);
});

// ---------- 連線客戶端（假 WebSocket） ----------
class FakeSocket {
  static all = [];
  constructor(url) { this.url = url; this.readyState = 1; this.sent = []; FakeSocket.all.push(this); }
  send(data) { this.sent.push(data); }
  close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
  receive(message) { this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) }); }
  drop(code = 1006) { this.readyState = 3; this.onclose?.({ code, reason: '' }); }
}
function fakeTimers() {
  const pending = [];
  return {
    pending,
    set: (fn, ms) => { pending.push({ fn, ms }); return pending.length; },
    clear: () => {}, every: () => 1, stop: () => {},
    runAll() { while (pending.length) pending.shift().fn(); },
  };
}
const memoryStorage = () => safeStorage({ store: new Map(), getItem(k) { return this.store.get(k) ?? null; }, setItem(k, v) { this.store.set(k, v); }, removeItem(k) { this.store.delete(k); } });
const tokenFor = (name, days = 30) => `${Buffer.from(JSON.stringify({ v: 1, n: name, e: Math.floor(Date.now() / 1000) + days * 86400 })).toString('base64url')}.sig`;

test('login stores the token; wrong code surfaces the relay message; storage failures fall back to memory', async () => {
  const storage = memoryStorage();
  const fetchImpl = async (url, init) => {
    const { code } = JSON.parse(init.body);
    return code === 'good-code'
      ? { ok: true, json: async () => ({ token: tokenFor('大哥'), name: '大哥', exp: 1 }) }
      : { ok: false, json: async () => ({ error: '代號不正確。' }) };
  };
  const client = new CoopClient({ relay: 'http://r', fetchImpl, storage, WebSocketImpl: FakeSocket });
  await assert.rejects(client.login('bad'), /代號不正確/);
  assert.equal(client.savedIdentity(), null);
  assert.equal((await client.login(' good-code ')).name, '大哥');
  assert.equal(client.savedIdentity().name, '大哥');
  const broken = safeStorage({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } });
  broken.set('k', 'v');
  assert.equal(broken.get('k'), 'v');
  const offline = new CoopClient({ relay: 'http://r', fetchImpl: async () => { throw new TypeError('network'); }, storage: memoryStorage() });
  await assert.rejects(offline.login('x'), /連不上伺服器/);
});

test('expired saved tokens are discarded', () => {
  const storage = memoryStorage();
  storage.set('violet-trio-token', tokenFor('二哥', -1));
  assert.equal(new CoopClient({ relay: 'http://r', storage }).savedIdentity(), null);
  assert.equal(storage.get('violet-trio-token'), null);
});

test('connect → welcome → relayed state; unexpected drop reconnects to the same room with backoff', async () => {
  FakeSocket.all.length = 0;
  const storage = memoryStorage();
  storage.set('violet-trio-token', tokenFor('大哥'));
  const timers = fakeTimers();
  const client = new CoopClient({ relay: 'http://r', storage, WebSocketImpl: FakeSocket, timers, random: () => 0.5, now: () => 777 });
  const states = [], leaves = [];
  client.on('state', (id, s, at) => states.push([id, s.x, at]));
  client.on('leave', id => leaves.push(id));
  const joined = client.connect('NEW');
  const first = FakeSocket.all[0];
  assert.match(first.url, /^ws:\/\/r\/ws\?room=NEW&token=/);
  first.receive({ t: 'welcome', room: 'AB3K', you: '大哥', host: '大哥', members: [{ id: '大哥', name: '大哥', joinedAt: 1 }, { id: '二哥', name: '二哥', joinedAt: 2 }] });
  assert.equal((await joined).room, 'AB3K');
  first.receive({ t: 's', p: '二哥', d: { x: 4, y: 0, z: 0, r: 0, c: 10 } });
  first.receive({ t: 's', p: '陌生人', d: { x: 9, y: 0, z: 0, r: 0, c: 10 } });   // not a member: ignored
  assert.deepEqual(states, [['二哥', 4, 777]]);
  assert.equal(client.sendState({ x: 1, y: 0, z: 0, yaw: 0, anim: 'idle' }), true);
  assert.equal(JSON.parse(first.sent.at(-1)).t, 's');

  first.drop(1006);
  assert.equal(timers.pending[0].ms, 500);
  assert.equal(client.sendState({ x: 1, y: 0, z: 0, yaw: 0 }), false, 'nothing queued while offline');
  timers.runAll();
  const second = FakeSocket.all[1];
  assert.match(second.url, /room=AB3K/, 'reconnects to the room code, not NEW');
  second.receive({ t: 'welcome', room: 'AB3K', you: '大哥', host: '大哥', members: [{ id: '大哥', name: '大哥', joinedAt: 1 }] });
  assert.deepEqual(leaves, ['二哥'], 'someone who left during the outage is removed');
  client.close();
  assert.equal(second.readyState, 3);
});

test('fatal closes reject the join with a Chinese message and do not retry; bad token clears storage', async () => {
  FakeSocket.all.length = 0;
  const storage = memoryStorage();
  storage.set('violet-trio-token', tokenFor('大哥'));
  const timers = fakeTimers();
  const client = new CoopClient({ relay: 'http://r', storage, WebSocketImpl: FakeSocket, timers });
  const full = client.connect('AB3K');
  FakeSocket.all[0].drop(4003);
  await assert.rejects(full, error => error.code === 4003 && error.message === '房間已滿（最多 3 人）。');
  assert.equal(timers.pending.length, 0);
  const bad = client.connect('AB3K');
  FakeSocket.all[1].drop(4001);
  await assert.rejects(bad, error => error.code === 4001);
  assert.equal(storage.get('violet-trio-token'), null);
});

test('a relay that never answers fails the first join after a few tries instead of spinning forever', async () => {
  FakeSocket.all.length = 0;
  const storage = memoryStorage();
  storage.set('violet-trio-token', tokenFor('大哥'));
  const timers = fakeTimers();
  const client = new CoopClient({ relay: 'http://r', storage, WebSocketImpl: FakeSocket, timers, random: () => 0.5 });
  const attempt = client.connect('NEW');
  FakeSocket.all[0].drop(1006); timers.runAll();
  FakeSocket.all[1].drop(1006); timers.runAll();
  FakeSocket.all[2].drop(1006);
  await assert.rejects(attempt, /連不上伺服器/);
});

// ---------- 送出節流與隊友呈現 ----------
test('sameState: unchanged standing players count as idle; one-shot actions never do', () => {
  const a = { x: 1, y: 0, z: 2, yaw: 0.5, anim: 'idle', loop: true };
  assert.equal(sameState(a, { ...a, time: 0.9 }), true);
  assert.equal(sameState(a, { ...a, x: 1.01 }), false);
  assert.equal(sameState({ ...a, anim: 'combo1', loop: false }, { ...a, anim: 'combo1', loop: false }), false);
  assert.equal(sameState(a, null), false);
});

function stubDocument() {
  const ctx = new Proxy({}, { get: (target, key) => key === 'measureText' ? () => ({ width: 60 }) : (key in target ? target[key] : () => {}), set: (target, key, value) => { target[key] = value; return true; } });
  globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

function heroTemplate() {
  const bone = new THREE.Bone(); bone.name = 'Hips';
  const geometry = new THREE.BoxGeometry(0.5, 1.7, 0.3);
  const count = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0), 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  const toon = new THREE.MeshToonMaterial({ color: 0xffffff });
  const outline = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
  const body = new THREE.SkinnedMesh(geometry, toon);
  const shell = new THREE.SkinnedMesh(geometry, outline);
  const root = new THREE.Group();
  root.add(bone, body, shell);
  const skeleton = new THREE.Skeleton([bone]);
  body.bind(skeleton); shell.bind(skeleton);
  root.position.y = 0.9;
  const track = name => new THREE.AnimationClip(name, 1, [new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [0, 0, 0, 0, 0.1, 0])]);
  return { root, toon, outline, clips: [track('idle'), track('run'), track('combo1')] };
}

test('teammates reuse the hero model (shared geometry), get their own tinted toon materials and follow interpolated snapshots', () => {
  stubDocument();
  const scene = new THREE.Scene();
  const { root, toon, outline, clips } = heroTemplate();
  const members = new Map([['大哥', { id: '大哥', name: '大哥' }], ['二哥', { id: '二哥', name: '二哥' }]]);
  const listeners = {};
  const client = { you: '大哥', members, on: (type, fn) => { listeners[type] = fn; }, sendState: () => true };
  let now = 0;
  const coop = createCoop({ client, now: () => now });
  const view = coop.attach({ THREE, scene, heroModel: root, clips, cloneSkinned, local: () => ({ x: 0, y: 0, z: 0, yaw: 0 }) });
  const peers = coop.teammates.peers;
  assert.deepEqual([...peers.keys()], ['二哥'], 'own character is never duplicated as a teammate');
  const peer = peers.get('二哥');
  const meshes = [];
  peer.model.traverse(object => { if (object.isSkinnedMesh) meshes.push(object); });
  assert.equal(meshes[0].geometry, root.children[1].geometry, 'geometry shared with the hero');
  assert.notEqual(meshes[0].material, toon, 'tinted copy');
  assert.equal(meshes[1].material, outline, 'outline material stays shared');
  assert.notEqual(meshes[0].skeleton, root.children[1].skeleton, 'own skeleton so poses are independent');

  for (let i = 0; i < 6; i++) listeners.state('二哥', { t: i * 83, x: i, y: 0, z: 0, yaw: 0, lift: 0, anim: 'run', time: 0, scale: 1, loop: true }, 1000 + i * 83);
  now = 1000 + 2 * 83 + INTERP_DELAY_MS;
  view.update(1 / 60);
  assert.equal(peer.root.visible, true);
  assert.ok(Math.abs(peer.root.position.x - 2) < 1e-9);
  assert.equal(peer.currentName, 'run');

  listeners.join({ id: '小弟', name: '小弟' });
  assert.equal(peers.size, 2);
  const tinted = peers.get('小弟').owned.values().next().value;
  listeners.leave('小弟');
  assert.equal(peers.size, 1);
  assert.equal(scene.getObjectByName('teammate:小弟'), undefined, 'removed from the scene');
  assert.ok(tinted, 'owned material existed');
  coop.dispose();
  assert.equal(scene.children.length, 0);
});

// ---------- 單人頁隔離與三人頁接線 ----------
test('single-player page never loads or mentions co-op code', async () => {
  const [index, boot] = await Promise.all([read('3d-next/index.html'), read('3d-next/boot.js')]);
  for (const source of [index, boot]) assert.doesNotMatch(source, /net\/|coop|trio|三人/i);
});

test('battle.js co-op hooks are inert without the coop option', async () => {
  const battle = await read('3d-next/battle.js');
  assert.match(battle, /export async function createBattle\(canvas, \{[^}]*coop = null[^}]*\} = \{\}\)/);
  assert.doesNotMatch(battle, /import[^;]*net\//, 'battle.js does not import the net modules');
  const code = battle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const uses = [...code.matchAll(/\bcoop(View)?\b(?!\s*=\s*null)(.)/g)].map(m => m[0]);
  for (const use of uses) assert.match(use, /^coop(View)?[?\s)]/, `unguarded use: ${use}`);
});

test('trio page reuses the 3d-next engine modules and provides every element battle.js looks up', async () => {
  const [trioBoot, trioIndex, battle] = await Promise.all([read('trio/boot.js'), read('trio/index.html'), read('3d-next/battle.js')]);
  assert.match(trioBoot, /import\('\.\.\/3d-next\/battle\.js\?v=\w+'\)/);
  assert.match(trioBoot, /createBattle\(\$\('battle'\), \{ audio, assets, coop \}\)/);
  assert.match(trioIndex, /<script type="module" src="\.\/boot\.js\?v=\w+"><\/script>/);
  assert.match(trioIndex, /"three":"\.\.\/lib\/three\.module\.js"/);
  const ids = new Set([...battle.matchAll(/\$\('([\w-]+)'\)/g)].map(m => m[1]));
  for (const id of ids) assert.match(trioIndex, new RegExp(`id="${id}"`), `trio/index.html lacks #${id}`);
});
