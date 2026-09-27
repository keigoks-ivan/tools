// 三人連線第二階段（房主權威的敵人同步）：封包、人數加成、仇恨分配、命中申報驗證、換房主接手。
// 整合測試用兩個真的 MarchDirector（房主 A、隊友 B）經過記憶體內的假 relay（沿用 relay 的淨化器）對打。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_CAP, LEVEL, MarchDirector, TUNING, toPx, toWorld } from '../3d-next/march.js';
import * as marchModule from '../3d-next/march.js';
import { COOP_SCALE, applyCountScale, scaleFor, scaledCounts, scaledHp, snapshotCounts, COOP_SUPPLY, applySupplyScale, snapshotSupply } from '../3d-next/net/scaling.js';
import {
  ACTIONS, BITS, TYPES, WORLD_MAX_CHARS, WorldDecoder, WorldEncoder, compactEvent, decodeEnemy, decodeLevel, encodeEnemy, enemyType,
  fitWorld, isEmptyWorld, levelStatus, recipeFor,
} from '../3d-next/net/world.js';
import { CLAIM_LIMITS, ClaimMeter, SOURCES, assignTargets, validateClaimEntry } from '../3d-next/net/authority.js';
import { createEnemySync } from '../3d-next/net/enemy-sync.js';
import { cleanClaim, cleanPayload } from '../../workers/coop-relay/src/logic.js';

const STEP = 1 / 60;

// ---------------------------------------------------------------- 封包

test('enemy snapshots round-trip through the compact array format', () => {
  const enemy = { id: 42, role: 'officer', kind: 'officer', variant: 'red', x: 700.4, y: 311.6, facing: -1.234, action: 'telegraph', hp: 51.26, maxHp: 64, phase: 1, guardBrokenUntil: 5, lift: 0 };
  const t = encodeEnemy(enemy, 4);
  assert.equal(t.length, 9, 'trailing zeros (lift, index) are trimmed');
  const u = decodeEnemy(t);
  assert.equal(u.id, 42);
  assert.equal(TYPES[u.type], 'officer:red');
  assert.deepEqual([u.x, u.y], [700, 312]);
  assert.equal(u.facing, -1.23);
  assert.equal(u.action, 'telegraph');
  assert.equal(u.hp, 51.3);
  assert.equal(u.maxHp, 64);
  assert.equal(u.bits & BITS.broken, BITS.broken);
  const boss = decodeEnemy(encodeEnemy({ id: 7, role: 'boss', kind: 'boss', x: 1, y: 2, facing: 0, action: 'idle', hp: 90, maxHp: 117, phase: 2, intangible: true, lift: 1.5 }));
  assert.equal(TYPES[boss.type], 'boss');
  assert.equal(boss.bits, BITS.phase2 | BITS.intangible);
  assert.equal(boss.lift, 1.5);
  const crate = decodeEnemy(encodeEnemy({ id: 3, role: 'breakable', kind: 'breakable', breakType: 'jar', breakIndex: 11, x: 0, y: 0, action: 'idle', hp: 3, maxHp: 3 }));
  assert.equal(TYPES[crate.type], 'breakable:jar');
  assert.equal(crate.index, 11);
  // every type code maps back to the same spawn recipe the host used
  for (let type = 0; type < TYPES.length; type++) {
    const { role, options } = recipeFor(type, TUNING, 2);
    assert.equal(enemyType({ role, ...options }), TYPES[type] === 'elite' ? TYPES.indexOf('elite') : type, TYPES[type]);
  }
  assert.deepEqual(ACTIONS.slice(0, 5), ['chase', 'telegraph', 'attack', 'hit', 'dead']);
});

test('world encoder sends keyframes, deltas and removals; decoder rebuilds the enemy set', () => {
  const encoder = new WorldEncoder({ keyframeEvery: 3 });
  const decoder = new WorldDecoder();
  const enemies = [1, 2, 3].map(id => ({ id, role: 'grunt', kind: 'grunt', x: id * 100, y: 400, facing: 0, action: 'chase', hp: 7, maxHp: 7 }));
  const a = encoder.encode({ enemies, clock: 1000, epoch: 'A:1' });
  assert.equal(a.f, 1);
  assert.equal(a.n.length, 3);
  assert.deepEqual(decoder.apply(a).upserts.map(u => u.id), [1, 2, 3]);
  enemies[0].x += 10;                   // moved
  enemies.pop();                        // #3 died / left
  const b = encoder.encode({ enemies, clock: 1100, epoch: 'A:1' });
  assert.equal(b.f, undefined);
  assert.deepEqual(b.n.map(t => t[0]), [1], 'only the changed enemy is sent');
  assert.deepEqual(b.r, [3]);
  const applied = decoder.apply(b);
  assert.deepEqual(applied.removed, [3]);
  assert.equal(decoder.known.get(1).x, 110);
  const c = encoder.encode({ enemies, clock: 1200, epoch: 'A:1' });
  assert.ok(isEmptyWorld(c), 'nothing changed → nothing worth sending');
  // a guest that missed the removal still converges on the next keyframe
  const late = new WorldDecoder();
  late.apply(a);
  const key = encoder.encode({ enemies, clock: 1300, epoch: 'A:1' });
  assert.equal(key.f, 1);
  assert.deepEqual(late.apply(key).removed, [3]);
  assert.deepEqual([...late.known.keys()].sort(), [1, 2]);
});

test('a full 18-enemy keyframe with a burst of events stays under the 4096-char world cap', () => {
  const march = new MarchDirector({ seed: 3 });
  const enemies = Array.from({ length: 18 }, (_, i) => ({
    id: 1000 + i, role: i === 17 ? 'boss' : i % 3 ? 'grunt' : 'runner', kind: i === 17 ? 'boss' : 'grunt', x: 123.456 + i * 37.1, y: 987.654 - i * 11.3,
    facing: -3.14159, action: 'telegraph', hp: 127.35, maxHp: 1170, phase: 2, intangible: true, lift: 2.5, guardBrokenUntil: 99,
  }));
  const events = Array.from({ length: 48 }, (_, i) => compactEvent({ type: i % 2 ? 'groundTelegraph' : 'kill', id: i, ownerId: 1000 + i, x: 1234.5678, y: 876.54321, radius: 180, duration: 0.9, enemyId: 1000 + i, role: 'runner', facing: 1.23456, nested: { a: 1 } }));
  const encoder = new WorldEncoder();
  const raw = encoder.encode({ enemies, clock: 123456789, epoch: 'Ivan:12', level: levelStatus(march), events, dm: [['Ivan', 22, 1, 1017, -157], ['Bob', 9, 1, 1003, 20]] });
  assert.equal('nested' in raw.v[0], false, 'nested objects are dropped from events');
  const { d, rest } = fitWorld(raw);
  const size = JSON.stringify({ t: 'e', d }).length;
  assert.ok(size <= WORLD_MAX_CHARS, `world message is ${size} chars`);
  assert.equal(d.n.length, 18, 'enemies are never split');
  assert.equal(d.v.length + rest.length, 48, 'events that did not fit wait for the next message');
  // enemies alone (the steady state) are far under the cap
  const steady = new WorldEncoder().encode({ enemies, clock: 1, epoch: 'Ivan:12', level: levelStatus(march) });
  assert.ok(JSON.stringify(steady).length < 1500, `18-enemy keyframe is ${JSON.stringify(steady).length} chars`);
  // the relay sanitizer keeps the whole payload intact
  assert.deepEqual(cleanPayload(d), d);
});

test('level status encodes each segment and decodes back', () => {
  const march = new MarchDirector({ seed: 4 });
  march.seg.kills = 12; march.seg.spawned = 15; march.arena.kills = 13; march.brokenProps.add(0).add(5);
  let L = decodeLevel(levelStatus(march));
  assert.deepEqual([L.segment, L.segKills, L.spawned, L.kills], [0, 12, 15, 13]);
  assert.deepEqual(L.brokenProps, [0, 5]);
  march.skipTo(2);
  march.gates[1].open = false; march.seg.lamp.hp = 33.33; march.seg.lamp.down = 1.26; march.seg.timer = 12.34; march.seg.breaks = 2;
  L = decodeLevel(levelStatus(march));
  assert.equal(L.segment, 2);
  assert.equal(L.lampHp, 33.3);
  assert.equal(L.lampDown, 1.3);
  assert.equal(L.timer, 12.3);
  assert.equal(L.breaks, 2);
  march.gates[2].open = true;
  assert.equal(decodeLevel(levelStatus(march)).gatesOpen[2], true);
});

// ---------------------------------------------------------------- 人數加成

test('co-op supply: 2–3 players get guaranteed prop drops, kill drops and longer-lived pickups; 1p restores single-player numbers', () => {
  const before = JSON.stringify(TUNING);
  assert.equal(TUNING.killDrop, null, 'single player never rolls kill drops');
  const base = snapshotSupply(TUNING);
  applySupplyScale(TUNING, base, 3);
  for (const table of Object.values(TUNING.breakables.tables)) assert.ok(Math.abs(table.reduce((sum, [, p]) => sum + p, 0) - 1) < 1e-9, 'every prop drops something');
  assert.deepEqual(TUNING.killDrop, { kind: 'bun', chance: COOP_SUPPLY.killDropChance[3] });
  assert.equal(TUNING.pickupLife, COOP_SUPPLY.pickupLife);
  assert.ok(TUNING.segmentHeal > JSON.parse(before).segmentHeal && TUNING.officerHeal > JSON.parse(before).officerHeal);
  applySupplyScale(TUNING, base, 2);
  assert.equal(TUNING.killDrop.chance, COOP_SUPPLY.killDropChance[2]);
  applySupplyScale(TUNING, base, 1);
  assert.equal(JSON.stringify(TUNING), before);
});

test('co-op scaling: 1p is untouched, 2p ×1.3 count ×1.4 hp, 3p ×1.6 count ×1.8 hp', () => {
  assert.deepEqual(COOP_SCALE[1], { count: 1, hp: 1 });
  assert.deepEqual(scaleFor(2), { count: 1.3, hp: 1.4 });
  assert.deepEqual(scaleFor(3), { count: 1.6, hp: 1.8 });
  assert.deepEqual(scaleFor(7), scaleFor(3), 'clamped to 3 players');
  assert.deepEqual(scaleFor(0), scaleFor(1));
  assert.equal(scaledHp(5, 1), 5);
  assert.equal(scaledHp(5, 2), 7);      // 7.0
  assert.equal(scaledHp(4, 3), 8);      // 7.2 → 8
  assert.equal(scaledHp(0.2, 2), 1, 'never below 1');
  const base = snapshotCounts(TUNING);
  assert.deepEqual(scaledCounts(base, 1), base);
  const two = scaledCounts(base, 2);
  assert.equal(two.market.goal, Math.round(base.market.goal * 1.3));
  assert.ok(Math.abs(two.market.groupEvery - base.market.groupEvery / 1.3) < 1e-9);
  assert.equal(scaledCounts(base, 3).boss.resummon.count, Math.round(base.boss.resummon.count * 1.6));
  // applying repeatedly from the baseline never compounds, and 1p restores the original numbers
  const before = JSON.stringify(TUNING);
  applyCountScale(TUNING, base, 3);
  applyCountScale(TUNING, base, 3);
  assert.equal(TUNING.market.goal, Math.round(base.market.goal * 1.6));
  applyCountScale(TUNING, base, 1);
  assert.equal(JSON.stringify(TUNING), before);
  // the on-screen cap is not part of the scaling
  assert.deepEqual(ENEMY_CAP, { desktop: 16, mobile: 10 });
});

// ---------------------------------------------------------------- 仇恨分配

test('targeting spreads enemies across players, keeps targets sticky and weighs officers heavier', () => {
  const players = [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 300, y: 0 }];
  const pack = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, role: 'grunt', x: 20 + i * 5, y: 10, action: 'chase' }));
  const split = assignTargets(pack, players);
  const count = id => [...split.values()].filter(p => p === id).length;
  assert.ok(count('A') >= 2 && count('B') >= 2, `a pack next to A is still shared (${count('A')}/${count('B')})`);
  // far enemies go to the near player
  const far = assignTargets([{ id: 9, role: 'grunt', x: 1300, y: 0, action: 'chase' }], [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 1200, y: 0 }]);
  assert.equal(far.get(9), 'B');
  // sticky: a small move does not flip targets
  const moved = players.map(p => ({ ...p, x: p.x + 20 }));
  const again = assignTargets(pack, moved, split);
  assert.deepEqual([...again], [...split]);
  // dead enemies, props and dead players are skipped
  const out = assignTargets([{ id: 1, action: 'dead', x: 0, y: 0 }, { id: 2, prop: true, x: 0, y: 0, action: 'idle' }, { id: 3, x: 0, y: 0, action: 'chase' }], [{ id: 'A', x: 0, y: 0, alive: false }, { id: 'B', x: 900, y: 0 }]);
  assert.deepEqual([...out], [[3, 'B']]);
  // an officer counts as 3: the grunts next to it go to the other player
  const withOfficer = assignTargets([{ id: 1, role: 'officer', x: 0, y: 0, action: 'chase' }, { id: 2, role: 'grunt', x: 30, y: 0, action: 'chase' }, { id: 3, role: 'grunt', x: 40, y: 0, action: 'chase' }], [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 250, y: 0 }]);
  assert.equal(withOfficer.get(1), 'A');
  assert.equal(withOfficer.get(2), 'B');
  assert.equal(withOfficer.get(3), 'B');
  assert.equal(assignTargets(pack, []).size, 0);
});

// ---------------------------------------------------------------- 命中申報

test('hit-claim validation rejects malformed, impossible and out-of-range claims', () => {
  const grunt = { id: 5, x: 600, y: 400, hp: 7, action: 'chase' };
  const near = { x: 640, y: 420 };
  assert.deepEqual(validateClaimEntry([5, 12, 0, 3], grunt, near), { ok: true, source: 'attack', amount: 12 });
  assert.equal(validateClaimEntry([5, 30, 2, 3], grunt, near).source, 'special');
  assert.equal(validateClaimEntry([5, 3.5, SOURCES.indexOf('stun'), 3], grunt, near).source, 'stun');
  const reason = (...args) => validateClaimEntry(...args).reason;
  assert.equal(reason('nope', grunt, near), 'shape');
  assert.equal(reason([5, 12], grunt, near), 'shape');
  assert.equal(reason([5, 12, 9], grunt, near), 'source');
  assert.equal(reason([5, -1, 0], grunt, near), 'amount');
  assert.equal(reason([5, 'x', 0], grunt, near), 'amount');
  assert.equal(reason([5, CLAIM_LIMITS.maxDamage + 1, 0], grunt, near), 'amount');
  assert.equal(reason([5, CLAIM_LIMITS.maxStun + 1, 3], grunt, near), 'amount');
  assert.equal(reason([5, 12, 0], undefined, near), 'gone');
  assert.equal(reason([5, 12, 0], { ...grunt, action: 'dead' }, near), 'gone');
  assert.equal(reason([5, 12, 0], { ...grunt, hp: 0 }, near), 'gone');
  assert.equal(reason([5, 12, 0], { ...grunt, intangible: true }, near), 'intangible');
  assert.equal(reason([5, 2, 3], { ...grunt, prop: true }, near), 'prop');
  assert.equal(reason([5, 12, 0], grunt, { x: 600 + CLAIM_LIMITS.range + 1, y: 400 }), 'range');
  const meter = new ClaimMeter(3);
  assert.deepEqual([meter.allow(0), meter.allow(10), meter.allow(20), meter.allow(30)], [true, true, true, false]);
  assert.equal(meter.allow(1000), true, 'next second');
});

// ---------------------------------------------------------------- 整合：兩台裝置

/** 記憶體內的 relay：e 只收房主的並轉給其他人，h 只轉給房主，y 交棒；payload 過 relay 的淨化器與長度上限 */
function makeRoom(ids) {
  const clock = { t: 1000 };
  const clients = new Map();
  const log = { e: [], h: [], y: [], oversize: 0 };
  let host = ids[0];
  const members = () => new Map([...clients.keys()].map(id => [id, { id, name: id }]));
  function makeClient(id) {
    const listeners = new Map();
    const c = {
      you: id, host, members: new Map(), online: true,
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
      emit(type, ...args) { for (const fn of listeners.get(type) || []) fn(...args); },
      send(t, d) {
        if (!c.online) return false;
        const text = JSON.stringify({ t, d });
        if (text.length > (t === 'e' ? 4096 : 512)) { log.oversize++; return true; }
        route(id, t, JSON.parse(text).d);
        return true;
      },
    };
    clients.set(id, c);
    return c;
  }
  function route(from, t, d) {
    if (t === 'e' && from === host) {
      const clean = cleanPayload(d);
      log.e.push(clean);
      for (const c of clients.values()) if (c.you !== from && c.online && c.host === from) c.emit('world', clean, clock.t, from);
    } else if (t === 'h' && from !== host) {
      const clean = cleanClaim(d);
      if (clean) { log.h.push(clean); clients.get(host)?.emit('claim', from, clean, clock.t); }
    } else if (t === 'y' && from === host && clients.has(d.to)) {
      log.y.push(d.to);
      setHost(d.to);
    }
  }
  function setHost(id) {
    host = id;
    for (const c of clients.values()) { c.host = id; c.emit('host', id); }
  }
  function welcome() {
    for (const c of clients.values()) { c.members = members(); c.host = host; c.emit('welcome', {}); }
  }
  function leave(id) {
    const gone = clients.get(id);
    gone.online = false;
    clients.delete(id);
    if (host === id) host = [...clients.keys()][0];
    for (const c of clients.values()) { c.members.delete(id); c.host = host; c.emit('leave', id); }
  }
  for (const id of ids) makeClient(id);
  return { clock, clients, log, welcome, leave, setHost, get host() { return host; } };
}

function makeDevice(room, id, seed) {
  const client = room.clients.get(id);
  const peers = new Map();
  const march = new MarchDirector({ seed });
  const device = { id, client, march, arena: march.arena, peers, events: [], hidden: false };
  device.sync = createEnemySync({ client, now: () => room.clock.t, peers: () => peers, hidden: () => device.hidden });
  march.arena.hero.hp = march.arena.hero.maxHp = 100000;   // 測試要跑很久，不讓任何人倒下
  return device;
}

/** 一格：兩台各自 update（房主先），每 100 ms 各送一次 */
function step(room, devices, input = {}) {
  room.clock.t += 1000 * STEP;
  for (const a of devices) for (const b of devices) {
    if (a === b || !a.client.online || !b.client.online) continue;
    const w = toWorld(b.arena.hero.x, b.arena.hero.y);
    const downed = !!b.arena.hero.downed;
    a.peers.set(b.id, { x: w.x, z: w.z, alive: b.arena.state === 'play' && !downed, downed, hidden: b.hidden, at: room.clock.t });
  }
  for (const device of devices) if (device.client.online && !device.frozen) {
    device.march.update(STEP, device.id === 'A' ? input : {});
    device.events.push(...device.march.drainEvents());
  }
  if (Math.round(room.clock.t / (1000 * STEP)) % 6 === 0) for (const device of devices) if (device.client.online) device.sync.tick();
}

function setup() {
  const room = makeRoom(['A', 'B']);
  const baseline = snapshotCounts(TUNING);
  const A = makeDevice(room, 'A', 17), B = makeDevice(room, 'B', 17);
  room.welcome();
  A.sync.bind({ march: A.march, arena: A.arena, level: marchModule });
  B.sync.bind({ march: B.march, arena: B.arena, level: marchModule });
  A.march.reset(); B.march.reset();   // battle.js start()
  for (const d of [A, B]) d.arena.hero.hp = d.arena.hero.maxHp = 100000;
  // B 站在 A 右邊 3 公尺
  B.arena.hero.x = A.arena.hero.x + 180;
  const restore = () => applyCountScale(TUNING, baseline, 1);
  return { room, A, B, restore, baseline };
}

const liveIds = arena => arena.enemies.filter(e => e.action !== 'dead').map(e => e.id).sort((a, b) => a - b);

test('host runs the level and the guest mirrors the same enemies without running AI', () => {
  const { room, A, B, restore, baseline } = setup();
  try {
    assert.equal(A.sync.role, 'host');
    assert.equal(B.sync.role, 'guest');
    assert.equal(TUNING.market.goal, Math.round(baseline.market.goal * 1.3), '2 players: more enemies over the segment');
    for (let i = 0; i < 60 * 6; i++) step(room, [A, B]);
    const hostGrunts = A.arena.enemies.filter(e => !e.prop);
    assert.ok(hostGrunts.length > 0, 'host spawned enemies');
    for (const e of hostGrunts) assert.equal(e.maxHp, scaledHp(e.role === 'runner' ? TUNING.units.runnerHp : TUNING.units.gruntHp, 2), '2 players: ×1.4 hp');
    assert.equal(B.march.stats.spawned.grunt + B.march.stats.spawned.runner, 0, 'guest never spawns');
    // after one more world message the guest has exactly the host's enemy set, all as puppets
    for (let i = 0; i < 6; i++) step(room, [A, B]);
    assert.deepEqual(liveIds(B.arena), liveIds(A.arena));
    assert.ok(B.arena.enemies.every(e => e.remote && e.ai === 'puppet'));
    // positions follow the host (interpolated ~100 ms behind), not a local chase
    const e = hostGrunts[0], p = B.march.units.get(e.id);
    assert.ok(Math.hypot(p.x - e.x, p.y - e.y) < 60, `puppet within 1 m of host enemy (${Math.hypot(p.x - e.x, p.y - e.y).toFixed(1)} px)`);
    // enemies are split between the two players
    const targets = [...A.sync._debug.targets.values()];
    assert.ok(targets.includes('B') && targets.some(t => t !== 'B'), `targets ${targets.join(',')}`);
    // level state is mirrored
    assert.equal(B.march.seg.spawned, A.march.seg.spawned);
    assert.equal(B.march.segmentIndex, 0);
    assert.equal(B.march.hud().objective, A.march.hud().objective);
    assert.equal(room.log.oversize, 0);
    assert.ok(room.log.e.length >= 30 && room.log.e.length <= 62, `at most 10 world messages per second, empty frames skipped (${room.log.e.length} in 6.1 s)`);
  } finally { restore(); }
});

test('enemy attacks on the guest become damage messages that only the guest applies', () => {
  const { room, A, B, restore } = setup();
  try {
    let hurt = 0;
    for (let i = 0; i < 60 * 20 && !hurt; i++) {
      step(room, [A, B]);
      hurt = B.events.filter(e => e.type === 'hurt').length;
    }
    assert.ok(hurt > 0, 'guest was hit by a host enemy');
    assert.ok(B.arena.hero.hp < B.arena.hero.maxHp);
    assert.ok(room.log.e.some(d => d.dm?.some(hit => hit[0] === 'B')), 'host addressed damage to B');
    assert.ok(room.log.e.every(d => !d.dm?.some(hit => hit[0] === 'A')), 'the host never sends damage to itself');
    assert.ok(A.sync._debug.proxies.get('B').hp === 100, "the host does not track B's hp");
  } finally { restore(); }
});

test('guest hits play locally, are claimed, and the host applies the damage', () => {
  const { room, A, B, restore } = setup();
  try {
    for (let i = 0; i < 60 * 5; i++) step(room, [A, B]);
    const puppet = B.arena.enemies.find(e => !e.prop && e.role === 'grunt' && e.hp > 3);
    assert.ok(puppet, 'a grunt puppet exists');
    const hostEnemy = A.march.units.get(puppet.id);
    const before = hostEnemy.hp;
    // move B next to it so the claim is in range, then hit it once with a heavy
    B.arena.hero.x = puppet.x - 40; B.arena.hero.y = puppet.y;
    B.arena._damageEnemy(puppet, 3, 'heavy');
    const local = B.arena.drainEvents();
    assert.ok(local.some(e => e.type === 'hit' && e.enemyId === puppet.id), 'spark / sound / hitstop fire on the guest right away');
    assert.ok(local.some(e => e.type === 'hitstop'));
    assert.equal(puppet.hp, before - 3, 'predicted hp shown until the host confirms');
    assert.equal(puppet.action, 'hit');
    assert.ok(B.arena.enemies.includes(puppet), 'the guest never kills a host enemy on its own');
    for (let i = 0; i < 12; i++) step(room, [A, B]);
    assert.ok(room.log.h.some(c => c.h.some(entry => entry[0] === puppet.id && entry[1] === 3 && entry[2] === SOURCES.indexOf('heavy'))), 'claim sent');
    assert.ok(hostEnemy.hp <= before - 3 || !A.arena.enemies.includes(hostEnemy), `host applied it (${before} → ${hostEnemy.hp})`);
    // a lethal claim kills on the host and the kill reaches the guest
    const victim = B.arena.enemies.find(e => !e.prop && A.march.units.get(e.id)?.hp > 0);
    B.arena.hero.x = victim.x - 40; B.arena.hero.y = victim.y;
    const hostKills = A.arena.kills;
    for (let k = 0; k < 6 && B.arena.enemies.includes(victim); k++) {
      B.arena._damageEnemy(victim, 20, 'heavy');
      B.arena.drainEvents();
      for (let i = 0; i < 12; i++) step(room, [A, B]);
    }
    assert.ok(!A.march.units.has(victim.id), 'host enemy died');
    assert.ok(!B.arena.enemies.includes(victim), 'guest puppet removed');
    assert.ok(B.events.some(e => e.type === 'kill' && e.enemyId === victim.id), 'guest plays the kill (corpse, sound)');
    assert.ok(A.arena.kills > hostKills);
    assert.equal(B.arena.kills, A.arena.kills, 'team kill count mirrored');
    // musou stun from the guest goes through the claim path too
    const stunned = B.arena.enemies.find(e => !e.prop);
    B.arena.hero.x = stunned.x - 40; B.arena.hero.y = stunned.y;
    B.arena.stagger(stunned, 2);
    for (let i = 0; i < 12; i++) step(room, [A, B]);
    const hostStunned = A.march.units.get(stunned.id);
    assert.ok(!hostStunned || hostStunned.action === 'hit' || (hostStunned.stunUntil ?? 0) > A.arena.time - 1, 'host staggered it');
    // a bogus claim (enemy far away, absurd damage) is ignored
    const target = A.arena.enemies.find(e => !e.prop);
    const hp = target.hp;
    B.client.send('h', { x: 99999, y: 99999, h: [[target.id, 5, 0, 1], [target.id, 999, 0, 1]] });
    A.march.update(STEP, {});
    assert.equal(target.hp, hp);
    assert.ok(A.sync.stats.claimsRejected >= 2);
  } finally { restore(); }
});

test('solo host is identical to single player (no teammates → wrappers pass through)', () => {
  const baseline = snapshotCounts(TUNING);
  try {
    const room = makeRoom(['A']);
    const coop = makeDevice(room, 'A', 5);
    room.welcome();
    coop.sync.bind({ march: coop.march, arena: coop.arena, level: marchModule });
    coop.march.reset();
    const solo = new MarchDirector({ seed: 5 });
    for (const m of [coop.march, solo]) m.arena.hero.hp = m.arena.hero.maxHp = 100000;
    for (let i = 0; i < 60 * 8; i++) {
      room.clock.t += 1000 * STEP;
      const input = i % 20 < 10 ? { attack: true } : { x: 0.3, y: -1 };
      coop.march.update(STEP, input); solo.update(STEP, input);
      coop.march.drainEvents(); solo.drainEvents();
      if (i % 6 === 0) coop.sync.tick();
    }
    const snap = m => JSON.stringify(m.arena.enemies.map(e => [e.id, Math.round(e.x), Math.round(e.y), e.hp, e.action]));
    assert.equal(snap(coop.march), snap(solo));
    assert.equal(coop.march.seg.kills, solo.seg.kills);
    assert.equal(room.log.e.length, 0, 'nothing is sent while alone');
  } finally { applyCountScale(TUNING, baseline, 1); }
});

test('host migration: the guest promotes its mirror and the level keeps running', () => {
  const { room, A, B, restore } = setup();
  try {
    for (let i = 0; i < 60 * 7; i++) step(room, [A, B]);
    for (let i = 0; i < 6; i++) step(room, [A, B]);
    const mirrored = liveIds(B.arena);
    assert.ok(mirrored.length > 0);
    const hostSeg = { ...A.march.seg };
    room.leave('A');                       // host closes the tab
    assert.equal(B.sync.role, 'host');
    assert.equal(TUNING.market.goal, snapshotCounts(TUNING).market.goal, 'alone again: back to ×1');
    assert.ok(B.arena.enemies.every(e => !e.remote && e.ai !== 'puppet'), 'puppets became real enemies');
    assert.deepEqual(liveIds(B.arena), mirrored, 'same enemies, same ids');
    assert.ok(B.march.seg.spawned >= hostSeg.kills, 'segment counters rebuilt');
    assert.ok(Number.isFinite(B.march.seg.nextGroupAt), 'spawner re-armed');
    const positions = new Map(B.arena.enemies.map(e => [e.id, [e.x, e.y]]));
    const maxBefore = Math.max(...B.arena.enemies.map(e => e.id));
    const B2 = [B];
    for (let i = 0; i < 60 * 6; i++) step(room, B2);
    const moved = B.arena.enemies.filter(e => positions.has(e.id) && !e.prop && Math.hypot(e.x - positions.get(e.id)[0], e.y - positions.get(e.id)[1]) > 5);
    assert.ok(moved.length > 0, 'AI resumed on the new host: mirrored enemies move again');
    const ids = B.arena.enemies.map(e => e.id);
    assert.equal(new Set(ids).size, ids.length, 'no id collisions');
    const fresh = ids.filter(id => !positions.has(id));
    assert.ok(fresh.every(id => id > maxBefore), 'new spawns continue after the mirrored ids');
    assert.ok(B.march.stats.spawned.grunt + B.march.stats.spawned.runner > 0, 'the new host spawns');
  } finally { restore(); }
});

test('a stalled host hands off to a visible teammate, who takes over from the last snapshot', () => {
  const { room, A, B, restore } = setup();
  try {
    for (let i = 0; i < 60 * 6; i++) step(room, [A, B]);
    const mirrored = liveIds(A.arena);
    // host stops simulating (tab hidden): its ticks keep running, frames don't. Stall 1.5 s + grace 2 s
    for (let k = 0; k < 30; k++) { room.clock.t += 100; A.sync.tick(); }
    assert.deepEqual(room.log.y, [], 'no hand-off during the grace period');
    for (let k = 0; k < 10; k++) { room.clock.t += 100; A.sync.tick(); }
    assert.deepEqual(room.log.y, ['B'], 'host yielded to B');
    assert.equal(A.sync.role, 'guest');
    assert.equal(B.sync.role, 'host');
    assert.ok(A.arena.enemies.every(e => e.remote), 'old host now shows puppets');
    assert.ok(mirrored.every(id => B.march.units.has(id)), 'new host kept every enemy');
    for (let i = 0; i < 60 * 3; i++) step(room, [A, B]);
    assert.deepEqual(liveIds(A.arena), liveIds(B.arena), 'old host mirrors the new host');
    assert.ok(A.march.stats.spawned.grunt + A.march.stats.spawned.runner > 0, 'A had spawned before');
    const spawnedA = A.march.stats.spawned.grunt + A.march.stats.spawned.runner;
    for (let i = 0; i < 60 * 3; i++) step(room, [A, B]);
    assert.equal(A.march.stats.spawned.grunt + A.march.stats.spawned.runner, spawnedA, 'A no longer spawns');
    // no hand-off after the level is cleared
    B.march.state = 'clear';
    const yields = room.log.y.length;
    for (let k = 0; k < 40; k++) { room.clock.t += 100; B.sync.tick(); }
    assert.equal(room.log.y.length, yields);
  } finally { restore(); }
});

test('guest follows segment changes, gates and boss phase from host events', () => {
  const { room, A, B, restore } = setup();
  try {
    for (let i = 0; i < 60; i++) step(room, [A, B]);
    A.march.skipTo(3);                    // host jumps to the boss (debug path emits segment + bossIntro)
    for (let i = 0; i < 60 * 2; i++) step(room, [A, B]);
    assert.equal(B.march.segmentIndex, 3);
    const boss = [...B.march.units.values()].find(e => e.kind === 'boss');
    assert.ok(boss?.remote, 'boss puppet mirrored');
    assert.ok(B.events.some(e => e.type === 'bossIntro'), 'boss intro replayed on the guest');
    assert.equal(B.march.hud().foe?.name, TUNING.boss.name);
    assert.equal(A.march.units.get(boss.id).maxHp, scaledHp(TUNING.boss.hp, 2));
    assert.equal(boss.maxHp, scaledHp(TUNING.boss.hp, 2));
  } finally { restore(); }
});

test('client accepts world messages only from the current host and claims only while hosting', async () => {
  const { CoopClient } = await import('../3d-next/net/client.js');
  const client = new CoopClient({ relay: 'http://x', storage: { get: () => null, set() {}, remove() {} } });
  client.you = 'B'; client.host = 'A';
  client.members = new Map([['A', { id: 'A' }], ['B', { id: 'B' }], ['C', { id: 'C' }]]);
  const worlds = [], claims = [];
  client.on('world', (d, at, from) => worlds.push(from));
  client.on('claim', (from) => claims.push(from));
  client.handle(JSON.stringify({ t: 'e', p: 'A', d: { c: 1 } }));
  client.handle(JSON.stringify({ t: 'e', p: 'C', d: { c: 1 } }));      // not the host
  client.handle(JSON.stringify({ t: 'h', p: 'C', d: { h: [] } }));     // B is not hosting
  assert.deepEqual(worlds, ['A']);
  assert.deepEqual(claims, []);
  assert.equal(client.isHost, false);
  client.handle(JSON.stringify({ t: 'host', id: 'B' }));
  assert.equal(client.isHost, true);
  client.handle(JSON.stringify({ t: 'h', p: 'C', d: { h: [] } }));
  client.handle(JSON.stringify({ t: 'h', p: 'Z', d: { h: [] } }));     // not a member
  client.handle(JSON.stringify({ t: 'e', p: 'B', d: { c: 1 } }));      // own world echoed back
  assert.deepEqual(claims, ['C']);
  assert.deepEqual(worlds, ['A']);
  assert.equal(client.send('e', {}), false, 'not connected → not sent');
});

// ---------------------------------------------------------------- 第三階段：倒地、救援、全滅、合體、補給、交棒

const runFor = (room, devices, seconds, before = () => {}, input = {}) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) { before(i); step(room, devices, input); }
};

test('co-op: a guest at 0 HP is downed, not dead; the host standing still next to them revives them at 50 %', () => {
  const { room, A, B, restore } = setup();
  try {
    runFor(room, [A, B], 2);
    const hero = B.arena.hero;
    B.arena.hurtHero(1e9, {});
    assert.equal(B.arena.state, 'play', 'the arena keeps running');
    assert.equal(hero.downed, true);
    assert.equal(hero.action, 'dead', 'lies down (battle.js plays the death clip)');
    step(room, [A, B]);
    assert.equal(B.march.state, 'play');
    assert.ok(B.events.some(e => e.type === 'downed') && !B.events.some(e => e.type === 'dead' || e.type === 'fail'), 'no defeat music, no result screen');
    // cannot act: movement and musou are ignored; enemy hits are ignored
    const x = hero.x;
    hero.energy = 100;
    B.march.update(STEP, { x: 1, special: true });
    assert.equal(hero.x, x);
    assert.equal(hero.energy, 100);
    assert.equal(B.arena.hurtHero(5, {}), true);
    assert.equal(hero.hp, 0);
    // the host sees the downed bit, keeps hosting, walks next to B and holds still
    let mid = null;
    runFor(room, [A, B], 3.6, i => {
      A.arena.hero.x = hero.x - 40; A.arena.hero.y = hero.y;
      if (i === 90) mid = { guest: B.sync.reviveProgress.get('B'), host: A.sync.reviveProgress.get('B') };
    });
    assert.ok(mid.host?.pct > 0 && mid.host.by === 'A', `host timed the revive (${JSON.stringify(mid.host)})`);
    assert.ok(mid.guest?.pct > 0, 'the downed guest sees the progress ring too');
    assert.equal(hero.downed, false, 'revived');
    assert.equal(hero.hp, hero.maxHp * 0.5);
    assert.ok(B.events.some(e => e.type === 'revived'));
    assert.deepEqual(room.log.y, [], 'no host change');
    assert.equal(A.march.state, 'play');
  } finally { restore(); }
});

test('co-op: a downed host keeps hosting and is revived by the guest', () => {
  const { room, A, B, restore } = setup();
  try {
    runFor(room, [A, B], 2);
    A.arena.hurtHero(1e9, {});
    assert.equal(A.arena.hero.downed, true);
    assert.equal(A.march.state, 'play');
    runFor(room, [A, B], 3.8, () => { B.arena.hero.x = A.arena.hero.x + 40; B.arena.hero.y = A.arena.hero.y; });
    assert.equal(A.arena.hero.downed, false);
    assert.equal(A.arena.hero.hp, A.arena.hero.maxHp * 0.5);
    assert.equal(A.sync.role, 'host');
    assert.deepEqual(room.log.y, []);
    assert.ok(B.events.some(e => e.type === 'revive' && e.id === 'A'), 'guest learned about it (fx)');
    // enemies went for the standing guest while the host was down
  } finally { restore(); }
});

function wipe(room, A, B) {
  A.arena.hurtHero(1e9, {}); B.arena.hurtHero(1e9, {});
  runFor(room, [A, B], 0.5);
}

test('co-op: team wipe only when everyone is downed; any player can retry and the room restarts together', () => {
  const { room, A, B, restore } = setup();
  try {
    runFor(room, [A, B], 3);
    A.arena.hurtHero(1e9, {});
    runFor(room, [A, B], 0.5);
    assert.equal(A.march.state, 'play', 'one player down is not a wipe');
    B.arena.hurtHero(1e9, {});
    runFor(room, [A, B], 0.5);
    for (const d of [A, B]) {
      assert.equal(d.march.state, 'dead', `${d.id} sees the shared game over`);
      assert.equal(d.arena.state, 'dead', 'battle.js finish() shows the result screen');
    }
    assert.ok(B.events.some(e => e.type === 'fail'));
    assert.deepEqual(room.log.y, [], 'a wipe does not move the host');
    // after the wipe the host stops streaming the frozen enemies
    const sent = room.log.e.length;
    runFor(room, [A, B], 1);
    assert.ok(room.log.e.slice(sent).every(d => !d.n && !d.dm), 'no enemy snapshots while on the result screen');
    // the GUEST presses retry (battle.js start() → march.reset())
    const hostEpoch = room.log.e.at(-1)?.q;
    B.march.reset();
    for (let i = 0; i < 60 && A.march.state !== 'play'; i++) step(room, [A, B]);
    assert.equal(A.march.state, 'play', 'the host restarted on the guest request');
    for (const d of [A, B]) d.arena.hero.hp = d.arena.hero.maxHp = 100000;
    runFor(room, [A, B], 3);
    assert.notEqual(room.log.e.at(-1).q, hostEpoch, 'new run epoch');
    assert.equal(B.march.state, 'play');
    assert.equal(B.sync._debug.endEpoch, null);
    assert.ok(liveIds(A.arena).length > 0);
    assert.deepEqual(liveIds(B.arena), liveIds(A.arena), 'guest mirrors the new run');
    assert.ok(!A.arena.hero.downed && !B.arena.hero.downed);
  } finally { restore(); }
});

test('co-op: when the host presses retry, guests on the result screen follow automatically', () => {
  const { room, A, B, restore } = setup();
  try {
    runFor(room, [A, B], 3);
    wipe(room, A, B);
    assert.equal(B.march.state, 'dead');
    let followed = 0;
    B.sync.setControls({ start: () => { followed++; B.march.reset(); } });   // battle.start in the browser
    A.march.reset();                                                           // host clicks 重來
    for (const d of [A, B]) d.arena.hero.hp = d.arena.hero.maxHp = 100000;
    const mark = room.log.e.length;
    runFor(room, [A, B], 3);
    assert.equal(followed, 1, 'guest restarted once, by itself');
    assert.equal(B.march.state, 'play');
    assert.equal(new Set(room.log.e.slice(mark).map(d => d.q)).size, 1, 'the guest retry that follows does not restart the host again');
    assert.deepEqual(liveIds(B.arena), liveIds(A.arena));
  } finally { restore(); }
});

test('co-op: the host arbitrates pickups — nobody takes the same one twice', () => {
  const { room, A, B, restore } = setup();
  try {
    runFor(room, [A, B], 2);
    const hb = B.arena.hero, ha = A.arena.hero;
    hb.hp = hb.maxHp - 5000; ha.hp = ha.maxHp - 5000;
    // 1) a bun only the guest walks to: granted, healed exactly once, gone everywhere
    const bun = A.march._drop('bun', hb.x, hb.y, { heal: 30 });
    runFor(room, [A, B], 1, () => { hb.x = bun.x; hb.y = bun.y; });
    assert.equal(hb.hp, hb.maxHp - 5000 + 30);
    assert.equal(B.events.filter(e => e.type === 'pickup' && e.pickupId === bun.id).length, 1);
    assert.ok(!A.march.pickups.some(p => p.id === bun.id) && !B.march.pickups.some(p => p.id === bun.id));
    // 2) both step on the same bun in the same frame: the host (first) gets it, the guest's claim is refused
    const spot = { x: (ha.x + hb.x) / 2, y: ha.y };
    const contested = A.march._drop('bun', spot.x, spot.y, { heal: 40 });
    runFor(room, [A, B], 0.5, () => { ha.x = contested.x - 200; hb.x = contested.x + 200; });
    assert.ok(B.march.pickups.some(p => p.id === contested.id), 'guest sees the bun');
    const hpA = ha.hp, hpB = hb.hp;
    runFor(room, [A, B], 1, () => { ha.x = hb.x = contested.x; ha.y = hb.y = contested.y; });
    assert.equal(ha.hp, hpA + 40, 'host took it');
    assert.equal(hb.hp, hpB, 'guest did not heal');
    assert.ok(room.log.h.some(c => c.p === contested.id), 'the guest did ask');
    assert.equal(B.events.filter(e => e.type === 'pickup' && e.pickupId === contested.id).length, 0);
    assert.ok(!B.march.pickups.some(p => p.id === contested.id));
  } finally { restore(); }
});

test('co-op: combo musou — two musou starts within 1.5 s boost damage and radius on both sides', () => {
  const { room, A, B, restore } = setup();
  try {
    runFor(room, [A, B], 1);
    const fx = [];
    A.sync.onFx(e => fx.push(e));
    A.arena.hero.energy = 100;
    step(room, [A, B], { special: true });
    const attack = A.arena.attack;
    assert.ok(attack?.flurry, 'host started the musou');
    assert.ok(!attack.profile.combo, 'alone: no bonus yet');
    room.clock.t += 700;
    A.sync.notePeerMusou('B');                       // coop.js: B's animation switched to musouFlurry
    assert.equal(attack.profile.combo, true);
    assert.equal(attack.profile.damageScale, 1.25);
    assert.equal(attack.profile.radius, 220 * 1.2);
    assert.ok(fx.some(e => e.type === 'combo' && e.ids.includes('A') && e.ids.includes('B')), 'shared flourish');
    assert.ok(fx.some(e => e.type === 'peerMusou' && e.id === 'B'), 'teammate musou pulse');
    // guest side, peer first then local: boosted at its own start
    B.sync.notePeerMusou('A');
    B.arena.hero.energy = 100;
    B.march.update(STEP, { special: true });
    B.march.drainEvents();
    assert.equal(B.arena.attack?.profile.combo, true);
    // outside the window: no bonus
    runFor(room, [A, B], 5.5);
    A.arena.hero.energy = 100;
    room.clock.t += 5000;
    step(room, [A, B], { special: true });
    room.clock.t += 1600;
    A.sync.notePeerMusou('B');
    assert.ok(A.arena.attack?.flurry && !A.arena.attack.profile.combo, 'too far apart');
  } finally { restore(); }
});

test('co-op hand-off: only to a visible player; nobody visible keeps the host; no bouncing back', () => {
  const { room, A, B, restore } = setup();
  try {
    runFor(room, [A, B], 6);
    // host tab hidden and frozen, guest also in the background
    A.hidden = true; A.frozen = true; B.hidden = true;
    runFor(room, [A, B], 10);
    assert.deepEqual(room.log.y, [], 'nobody can see the game: keep the current host');
    assert.equal(A.sync.role, 'host');
    // the guest comes back: after it has been visible for a moment, the role moves to it
    B.hidden = false;
    let waited = 0;
    while (!room.log.y.length && waited < 600) { step(room, [A, B]); waited++; }
    assert.deepEqual(room.log.y, ['B']);
    assert.ok(waited / 60 >= 1.4, `waited ${(waited / 60).toFixed(2)} s for B to be stably visible`);
    assert.equal(B.sync.role, 'host');
    // A comes back, B immediately goes away: B keeps the role for its minimum tenure (no ping-pong)
    A.hidden = false; A.frozen = false; B.hidden = true; B.frozen = true;
    runFor(room, [A, B], 4);
    assert.deepEqual(room.log.y, ['B'], 'no immediate hand-back');
    runFor(room, [A, B], 6);
    assert.deepEqual(room.log.y, ['B', 'A'], 'after the tenure and grace period it does move back');
  } finally { restore(); }
});
