import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { steer, flankPoint, allyInLane } from '../tactics.js';
import { Combat } from '../combat.js';
import { Encounter, parse } from '../encounter.js';
import { STAGE_DATA } from '../stages.js';
import { Trooper, TYPES } from '../zero/ai.js';
import { Solid } from '../zero/kit.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const noop = () => {};
const silent = new Proxy({}, { get: () => noop });
test('blocked movement takes a stable side route, and enclosed units stop', () => {
  const nav = steer(0, 1, (x, z) => z > 0.2, 1);
  assert.ok(nav.x > 0.9 && nav.z < 0.2);
  assert.deepEqual(nav, steer(0, 1, (x, z) => z > 0.2, 1));
  assert.deepEqual(steer(0, 1, () => true), { x: 0, z: 0 });
  assert.deepEqual(steer(0, 0, () => false), { x: 0, z: 0 });
});
test('opposite flank assignments create different firing angles at the same range', () => {
  const a = flankPoint(V(0, 0, 20), V(), 1, 15), b = flankPoint(V(0, 0, 20), V(), -1, 15);
  assert.ok(a.x > 0 && b.x < 0);
  assert.ok(Math.abs(Math.hypot(a.x, a.z) - 15) < 1e-6);
});
test('friendly fire lanes exclude dead units and units beyond or below the shot', () => {
  const mate = { pos: V(0, 0, 5), dead: false };
  assert.equal(allyInLane(V(0, 1, 0), V(0, 1, 10), [mate], null, 0.4, 1.8), true);
  assert.equal(allyInLane(V(0, 3, 0), V(0, 3, 10), [mate], null, 0.4, 1.8), false);
  mate.pos.z = 12;
  assert.equal(allyInLane(V(0, 1, 0), V(0, 1, 10), [mate], null, 0.4, 1.8), false);
  mate.pos.z = 5; mate.dead = true;
  assert.equal(allyInLane(V(0, 1, 0), V(0, 1, 10), [mate], null, 0.4, 1.8), false);
});
test('ace quick boost produces real sideways velocity instead of a zero vector', () => {
  const C = Object.assign(Object.create(Combat.prototype), { player: { pos: V(0, 0, 100) }, audio: silent, fx: silent });
  const e = { pos: V(), vel: V(), qbCd: 0, strafe: 1, grounded: true };
  C.enemyQB(e, 1);
  assert.equal(e.vel.length(), 60); assert.ok(Math.abs(e.vel.z) < 1e-6); assert.equal(e.vel.x, 60);
});
test('mech gunfire and a charged beam cannot damage a player behind a wall', () => {
  const old = Math.random; Math.random = () => 0.5;
  try {
    let damage = 0;
    const C = Object.assign(Object.create(Combat.prototype), {
      player: { vel: V(), speed: 0, qbT: 0 }, hero: { capsule: () => ({ x: 0, z: 100, y0: 0, y1: 20, r: 5 }) },
      world: { raycast: () => 0.1, hitBuilding: noop },
      fx: silent, audio: silent, enemies: [], hurt: () => damage++, note: noop,
    });
    Object.defineProperty(C, 'tier', { value: { aim: 1, fire: 1, atk: 2 } });
    const e = { kind: 'ace', K: { range: 500 }, fireCd: 1, altCd: 1, warn: 0, charge: 0.01, dodged: false, los: true,
      m: { muzzle: { updateWorldMatrix: noop, getWorldPosition: out => out.set(0, 10, 0) } } };
    C.bullet(e, V(0, 10, 0), V(0, 10, 100), 100);
    C.enemyFire(e, 0.02, 100, V(0, 10, 100));
    assert.equal(damage, 0);
    C.world.raycast = () => -1;
    C.bullet(e, V(0, 10, 0), V(0, 10, 100), 100);
    assert.equal(damage, 1);
  } finally { Math.random = old; }
});
function soldierFixture() {
  const pos = V(10, 0, 0), solid = new Solid();
  const s = { pos, vel: V(), yaw: 0, aimYaw: 0, aimPitch: 0, bodyYaw: 0, reloadT: -1, crouchT: 0,
    headPos: out => out.copy(pos).add(V(0, 1.6, 0)), chestPos: out => out.copy(pos).add(V(0, 1.2, 0)), update: noop };
  const G = { t: 1, solid, player: { pos: V(), dead: false, vel: V(), moveK: 0, crouchK: 0 }, playerEye: V(0, 1.6, 0),
    vm: { reloadT: -1 }, aimDir: V(1, 0, 0), ads: 0, enemies: [], grenades: [], audio: silent, canShoot: () => true };
  const e = Object.assign(Object.create(Trooper.prototype), { G, s, pos, T: TYPES.trooper, type: 'trooper', id: 1,
    state: 'combat', phase: 'hide', phaseT: 1, aware: 1, dead: false, hitFlash: 0, sees: true, losT: 1, reportT: 1, pushCd: 1,
    cover: V(10, 0, -2), coverT: 10, hunt: false, post: false, role: 'line', side: 1, navT: 0, nav: V(),
    lastSeen: V(), notSeen: 0, nades: 0, burst: 5, aimT: 0, stagger: 0, stuckT: 0, last: pos.clone(), stepPh: 0 });
  G.enemies.push(e); return e;
}
test('infantry actually retreats from a peek point and releases its firing slot', () => {
  const e = soldierFixture(); e.update(0.1);
  assert.ok(e.pos.z < 0); assert.equal(e.burst, 0); assert.equal(e.phase, 'hide');
});
test('infantry losing sight cancels its unfinished burst', () => {
  const e = soldierFixture(); e.phase = 'peek'; e.sees = false; e.cover.copy(e.pos); e.update(0.1);
  assert.equal(e.burst, 0);
});
test('a visible reload lets flank infantry advance, but a hidden reload does not', () => {
  const e = soldierFixture(); e.role = 'flank'; e.pushCd = 0; e.G.vm.reloadT = 0;
  e.update(0.1); assert.equal(e.phase, 'move'); assert.ok(e.pushCd > 0);
  const hidden = soldierFixture(); hidden.role = 'flank'; hidden.pushCd = 0; hidden.sees = false; hidden.G.vm.reloadT = 0;
  hidden.update(0.1); assert.ok(hidden.pushCd <= 0); assert.equal(hidden.phase, 'hide');
});
test('infantry searches the last reported position rather than a hidden player', () => {
  const e = soldierFixture(); e.sees = false; e.G.player.pos.set(100, 0, 100);
  const cover = e.findCover(true);
  assert.ok(cover.distanceTo(e.lastSeen) < 20);
  assert.ok(cover.distanceTo(e.G.player.pos) > 100);
});
test('scripted pressure fires once across large time steps and still obeys the spawn cap', () => {
  const C = { stats: {}, player: { pos: V() }, enemies: [], events: [], dead: false, lines: noop, note: noop, audio: silent,
    world: { height: () => 0 }, fx: silent, spawn: kind => { const e = { kind, dead: false }; C.enemies.push(e); return e; } };
  const E = parse({ pts: [[0, 0], [0, 120]], arena: 40, fin: 40, par: 50, secs: [{ at: 1, hold: 75, gap: 1000, amb: 'grunt@drop',
    beats: [{ t: 25, lines: [['radio', 'flank']], spawn: 'grunt@side' }] }] }, 1);
  const enc = new Encounter(C, E); enc.state = 'fight'; enc.mine = Array.from({ length: 9 }, () => ({ dead: false }));
  const messages = []; C.lines = l => messages.push(l);
  enc.updQueue = noop; enc.update(26); enc.update(1);
  assert.equal(messages.length, 1); assert.equal(enc.queue.length, 1);
  enc.queue.length = 0; enc.reinforce(Array.from({ length: 12 }, () => ({ kind: 'grunt', where: 'side' })));
  enc.place = () => ({ x: 0, z: 0, ground: true }); enc.flare = noop;
  Encounter.prototype.updQueue.call(enc, 3); Encounter.prototype.updQueue.call(enc, 1.2); Encounter.prototype.updQueue.call(enc, 1.2);
  assert.equal(C.enemies.length, 9); assert.equal(enc.queue.length, 3);
});
test('boss health phases request their guards once and stop requesting them after death', () => {
  const C = { stats: {}, player: { pos: V() }, enemies: [], events: [], dead: false, lines: noop, note: noop, audio: silent };
  const E = parse({ pts: [[0, 0], [0, 120]], arena: 40, fin: 40, par: 50, secs: [{ at: 1, amb: 'grunt@drop',
    boss: { halfWave: 'ace@side', lowWave: 'grunt@side' } }] }, 1);
  const enc = new Encounter(C, E); enc.updQueue = noop;
  enc.bossE = { ap: 49, apMax: 100, dead: false };
  enc.update(0.1); enc.update(0.1); assert.equal(enc.queue.length, 1); assert.equal(enc.queue[0].kind, 'ace');
  enc.bossE.ap = 24;
  enc.update(0.1); enc.update(0.1); assert.equal(enc.queue.length, 2); assert.equal(enc.queue[1].kind, 'grunt');
  enc.bossE.dead = true; enc.update(0.1); enc.update(0.1);
  assert.equal(enc.queue.length, 0); assert.equal(enc.bossTalk, 2);
});
test('every new scripted beat and boss reinforcement references a supported unit and location', () => {
  const kinds = new Set(['grunt', 'ace', 'heavy', 'tank', 'heli', 'jet']);
  const where = new Set(['far', 'out', 'side', 'drop', 'roof', 'rise', 'ring']);
  for (const [i, D] of STAGE_DATA.entries()) {
    const E = parse(D.route, i + 1);
    for (const c of E.secs) {
      for (const b of c.beats) { assert.ok(b.t > 0); if (c.hold) assert.ok(b.t < c.hold); }
      for (const o of [...c.beats.flatMap(b => b.spawn), ...c.boss?.halfWave || [], ...c.boss?.lowWave || []]) {
        assert.ok(kinds.has(o.kind)); assert.ok(where.has(o.where));
      }
    }
  }
});
