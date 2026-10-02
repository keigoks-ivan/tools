import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { steer, flankPoint, squadFlank, coveringFire, segmentBox, planRoute, routeDirection, allyInLane } from '../tactics.js';
import { Combat } from '../combat.js';
import { Encounter, parse } from '../encounter.js';
import { STAGE_DATA } from '../stages.js';
import { Trooper, Drone, TYPES, hearNoise } from '../zero/ai.js';
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
test('bounded search routes around a long wall without cutting through it', () => {
  const wall = { x0: -30, x1: 30, z0: 10, z1: 30 }, pos = V(), goal = V(0, 0, 60);
  const clear = (ax, az, bx, bz) => !segmentBox(ax, az, bx, bz, wall, 1);
  const route = planRoute(pos, goal, clear, 10);
  assert(route.visited <= 160); assert(route.points.length > 2);
  let prev = pos;
  for (const p of route.points) { assert(clear(prev.x, prev.z, p.x, p.z)); prev = p; }
  assert(Math.hypot(prev.x - goal.x, prev.z - goal.z) < 0.01);
  const state = {};
  for (let i = 0; i < 400 && pos.distanceTo(goal) > 1; i++) {
    const nav = routeDirection(state, pos, goal, clear, i * 0.25, 10); assert(nav);
    const next = pos.clone().add(V(nav.x * 1.5, 0, nav.z * 1.5)); assert(clear(pos.x, pos.z, next.x, next.z)); pos.copy(next);
  }
  assert(pos.distanceTo(goal) < 2);
});
test('thin walls block diagonal cuts; enclosure and failed searches remain bounded', () => {
  const box = { x0: 0.9, x1: 1.1, z0: -10, z1: 10 };
  assert(segmentBox(0, 0, 2, 1, box, 0.34)); assert(!segmentBox(-4, 0, -2, 1, box, 0.34));
  const state = {}, blocked = () => false;
  assert.equal(routeDirection(state, V(), V(0,0,10), blocked, 0, 1.5), null);
  assert(state.visited <= 160); const first = state.nextPlan;
  assert.equal(routeDirection(state, V(), V(0,0,10), blocked, 0.5, 1.5), null); assert.equal(state.nextPlan, first);
});
test('flank units choose the open firing angle while a live support unit covers them', () => {
  const self = { pos: V(0,0,20), role: 'flank' }, target = V(), a = flankPoint(self.pos, target, 1, 15);
  const support = { pos: V(a.x,0,a.z), role: 'support', los: true, burst: 3 };
  const goal = squadFlank(self.pos, target, [self,support], self, 1, 15);
  assert(goal.x < 0); assert(coveringFire([self,support], self));
  support.dead = true; assert(!coveringFire([self,support], self));
  assert(squadFlank(self.pos, target, [self,support], self, 1, 15).x > 0);
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

test('support fire lets one visible flank trooper advance without revealing a hidden player', () => {
  const e = soldierFixture(); e.role = 'flank'; e.pushCd = 0;
  const mate = { pos: V(12,0,3), role: 'support', sees: true, burst: 4, state: 'combat' }; e.G.enemies.push(mate);
  e.update(0.1); assert(e.pushCd > 0); assert.equal(e.phase, 'move');
  const hidden = soldierFixture(); hidden.role='flank'; hidden.pushCd=0; hidden.sees=false; hidden.G.enemies.push(mate);
  hidden.update(0.1); assert(hidden.pushCd<=0); assert.equal(hidden.phase,'hide');
});
test('a close player still makes infantry retreat instead of following its old cover goal', () => {
  const e = soldierFixture(); e.G.player.pos.set(8,0,0); e.G.playerEye.set(8,1.6,0);
  e.update(0.1); assert(e.pos.x > 10);
});

test('a changed retreat goal drops the old path without bypassing the search cooldown', () => {
  const state = { points: [{x:2,z:0}], gx:6, gz:0, nextPlan:2, expires:5 };
  const nav = routeDirection(state,V(),V(-6,0,0),()=>false,1,1.5);
  assert.equal(nav,null); assert.equal(state.points.length,0); assert.equal(state.nextPlan,2);
});

test('line infantry provides suppression but reloading and flanking allies do not', () => {
  const self = { role: 'flank' }, mate = { role: 'line', sees: true, burst: 4, s: { reloadT: -1 } };
  assert(coveringFire([self, mate], self));
  mate.s.reloadT = 0; assert(!coveringFire([mate], self));
  mate.s.reloadT = -1; mate.role = 'flank'; assert(!coveringFire([mate], self));
  mate.role = 'support'; mate.burst = 0; mate.volley = 3; assert(coveringFire([mate], self));
});
test('contact sharing needs an observed source and respects radio range and living allies', async () => {
  const { shareContact } = await import('../tactics.js');
  const source = { pos: V(), lastSeen: V(8, 0, 12), sees: true };
  const near = { pos: V(10), lastSeen: V() }, far = { pos: V(100), lastSeen: V() }, dead = { pos: V(5), lastSeen: V(), dead: true };
  shareContact([source, near, far, dead], source, 32);
  assert.deepEqual(near.lastSeen.toArray(), [8, 0, 12]); assert.equal(far.lastSeen.length(), 0); assert.equal(dead.lastSeen.length(), 0);
  source.sees = false; source.lastSeen.set(99, 0, 99); shareContact([near], source, 32);
  assert.deepEqual(near.lastSeen.toArray(), [8, 0, 12]);
  source.los = true; let alerts = 0;
  shareContact([near], source, 32, (e, p) => { assert.equal(e, near); assert.equal(p, source.lastSeen); alerts++; });
  assert.equal(alerts, 1);
});
test('flank reservations keep one active push on each side and release dead units', async () => {
  const { flankAvailable } = await import('../tactics.js');
  const a = { pushT: 2, pushSide: 1 }, b = { pushT: 2, pushSide: -1 }, self = {};
  assert(!flankAvailable([a], self, 1)); assert(flankAvailable([a], self, -1));
  assert(!flankAvailable([a, b], self, -1)); b.dead = true; assert(flankAvailable([a, b], self, -1));
  a.pushT = 0; assert(flankAvailable([a, b], self, 1));
});
test('quick boost reverses away from a wall and cancels when both lanes are blocked', () => {
  const wall = { x0: 6, x1: 8, z0: -20, z1: 20, top: 30 };
  const C = Object.assign(Object.create(Combat.prototype), { player: { pos: V(100, 0, 0) }, audio: silent, fx: silent,
    world: { nearBoxes: () => [wall], collide: () => false, support: () => 0 } });
  const e = { pos: V(), vel: V(), qbCd: 0, strafe: 1, grounded: true, scale: 1, los: false, lastSeen: V(0, 0, 100) };
  C.enemyQB(e, 1); assert.equal(e.vel.x, -60); assert.equal(e.vel.z, 0);
  e.qbCd = 0; e.vel.set(0, 0, 0); C.world.nearBoxes = () => [wall, { ...wall, x0: -8, x1: -6 }];
  C.enemyQB(e, 1); assert.equal(e.vel.length(), 0); assert.equal(e.qbCd, 0.5);
});

function droneFixture() {
  const G = { scene: new THREE.Scene(), nextId: 1, solid: new Solid(), audio: silent, fx: silent, t: 0,
    player: { pos: V(), vel: V(), dead: false }, playerEye: V(0, 1.6, 0), enemies: [], canShoot: () => true, diff: { acc: 1, dmg: 1 }, bolt: noop };
  const e = new Drone(G, { x: 0, y: 4, z: 10, alert: true }); G.enemies.push(e); return e;
}
test('a drone searches the reported location and releases its firing slot after losing sight', () => {
  const e = droneFixture(); e.lastSeen.set(0, 0, 20); e.G.player.pos.set(100, 0, 100); e.G.playerEye.set(100, 1.6, 100);
  e.losT = 1; e.sees = false; e.burst = 2; e.update(.1);
  assert(e.goal.distanceTo(e.lastSeen) < 16); assert(e.goal.distanceTo(e.G.player.pos) > 100); assert.equal(e.burst, 0);
});
test('drone three-shot bursts release the slot during cooldown and cannot shoot through a blocked muzzle', () => {
  const e = droneFixture(); let shots = 0; e.G.bolt = () => shots++;
  e.sees = true; e.losT = 1; e.shotT = 0;
  for (const dt of [.01, .15, .15]) e.update(dt);
  assert.equal(shots, 3); assert.equal(e.burst, 0); assert(e.shotT >= .9);
  e.shotT = 0; e.sees = true; e.losT = 1; e.G.solid.sees = () => false; e.update(.01);
  assert.equal(shots, 3); assert.equal(e.burst, 0);
});

test('patrol investigates a heard location and resumes its route without tracking a hidden player', () => {
  const e = soldierFixture();e.def={yaw:0};e.state='patrol';e.aware=0;e.sees=false;e.losT=10;e.cover=null;e.searchT=0;e.patrol=[[10,0],[20,0]];e.pi=0;e.wait=2;e.lastSpeak=-99;
  const heard=V(10,0,8);e.alert(heard,.4);const start=e.pos.clone();e.G.player.pos.set(-80,0,-80);e.update(.1);
  assert(e.pos.z>start.z);assert(e.searchT>0);assert.deepEqual(e.lastSeen.toArray(),heard.toArray());
  e.searchT=.05;e.update(.1);assert(e.aware<=.25);assert.equal(e.state,'patrol');
});
test('hearing respects walls, distance and stronger visual information', () => {
  const e=soldierFixture();e.state='idle';e.aware=0;e.sees=false;e.G.solid.sees=()=>false;
  hearNoise(e.G,V(25,0,0),20,.6);assert.equal(e.aware,0);
  hearNoise(e.G,V(14,0,0),20,.6);assert(e.aware>0&&e.aware<1);assert(e.searchT>0);
  e.state='combat';e.sees=true;const at=e.lastSeen.clone();hearNoise(e.G,V(12,0,0),20,.8);assert.deepEqual(e.lastSeen.toArray(),at.toArray());
});
test('a discovered body prompts one investigation and warns nearby guards without revealing the player', () => {
  const e=soldierFixture();e.state='idle';e.aware=0;e.sees=false;e.lastSpeak=-99;e.s.aimYaw=0;
  const body={dead:true,id:20,pos:V(10,0,5)},mate={dead:false,state:'idle',pos:V(12,0,0),seenBodies:new Set(),reports:[],alert(p,k){this.reports.push([p.clone(),k]);}};
  e.G.enemies.push(body,mate);e.inspectBodies(.1);assert.equal(e.aware,.65);assert(e.searchT>0);assert.deepEqual(e.lastSeen.toArray(),body.pos.toArray());assert.equal(mate.reports.length,1);
  for(let i=0;i<5;i++)e.inspectBodies(1);assert.equal(e.aware,.65);assert.equal(mate.reports.length,1);
});
