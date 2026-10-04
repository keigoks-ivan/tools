import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Solid } from '../zero/kit.js';
import { GroundVehicle, VEHICLE_TYPES, sweepVehiclePose, validVehicleSnapshot } from '../zero/ground-vehicle.mjs';
import { createGroundVehicleModel } from '../zero/vehicle-model.mjs';

const pose = (x = 0, y = 0, z = 0, yaw = 0) => ({ x, y, z, yaw });
const car = (solid = new Solid(), type = 'patrol', options = {}) => new GroundVehicle({ id: 'test-car', type, solid, ...options });
const driver = new THREE.Vector3(-1.7, 0, .2);
const run = (v, seconds, input, dt = 1 / 60) => { for (let i = 0; i < Math.round(seconds / dt); i++) v.update(dt, input); };
function wall(s, x0, x1, z0, z1, y0 = 0, y1 = 8) { return s.add({ x0, x1, z0, z1, y0, y1, mat: 'concrete' }); }

test('continuous full-body sweep stops before a thin wall even across a long route segment', () => {
  const s = new Solid(); wall(s, -8, 8, 6, 6.01);
  for (const type of ['patrol', 'apc']) {
    const result = sweepVehiclePose(s, pose(), pose(0, 0, 100), type);
    assert(!result.ok && result.reason === 'collision');
    assert(result.pose.z + VEHICLE_TYPES[type].length / 2 < 6);
    assert(result.pose.z > 2.9, 'the sweep should retain travel up to the obstacle rather than reject the entire route');
  }
});

test('rotating long corners cannot clip a wall and a straight APC fits a legal lane', () => {
  const s = new Solid(); wall(s, 1.3, 4, 1.7, 3.5);
  assert(sweepVehiclePose(s, pose(), pose()).ok);
  const turn = sweepVehiclePose(s, pose(), pose(0, 0, 0, Math.PI / 2));
  assert(!turn.ok && turn.reason === 'collision'); assert(turn.pose.yaw < .4);
  const lane = new Solid(); wall(lane, -5, -1.4, -20, 20); wall(lane, 1.4, 5, -20, 20);
  assert(sweepVehiclePose(lane, pose(0, 0, -10), pose(0, 0, 10), 'apc', { clearance: .1 }).ok);
  assert(!sweepVehiclePose(lane, pose(), pose(0, 0, 3, .4), 'apc').ok);
});

test('four-wheel support follows a genuine ramp and rejects tall kerbs, cliff drops and steep cross slopes', () => {
  const s = new Solid(); s.add({ x0: -4, x1: 4, z0: 0, z1: 50, y0: 0, y1: 10, ramp: { axis: 'z', dir: 1 } });
  const up = sweepVehiclePose(s, pose(0, 0, -4), pose(0, 0, 40), 'patrol');
  assert(up.ok); assert(Math.abs(up.pose.y - 8) < .001); assert(Math.abs(up.pose.pitch + Math.atan(.2)) < .001);
  const kerb = new Solid(); wall(kerb, -10, 10, 4, 20, 0, 1);
  assert(!sweepVehiclePose(kerb, pose(), pose(0, 0, 10)).ok, 'a vehicle cannot climb a one metre wall');
  const cliff = sweepVehiclePose(new Solid(), pose(0, 5, 0), pose(0, 5, 20), 'patrol', { groundAt: (_, z) => z < 5 ? 5 : 0 });
  assert(!cliff.ok && cliff.reason === 'drop'); assert(cliff.pose.z < 4);
  const steep = sweepVehiclePose(new Solid(), pose(0, 5, 0), pose(.1, 5, 0), 'apc', { groundAt: (x) => 5 + x * .6 });
  assert(!steep.ok, 'separate tyres cannot hide an unsafe side slope');
});

test('small road kerbs are traversable and checkpoint restoration on a ramp retains wheel support', () => {
  const kerb = new Solid(); wall(kerb, -10, 10, 4, 30, 0, .18);
  const crossing = sweepVehiclePose(kerb, pose(), pose(0, 0, 12), 'apc');
  assert(crossing.ok && Math.abs(crossing.pose.y - .18) < 1e-8);
  const s = new Solid(); s.add({ x0: -8, x1: 8, z0: 0, z1: 80, y0: 0, y1: 20, ramp: { axis: 'z', dir: 1 } });
  const v = car(s, 'apc', { pos: new THREE.Vector3(0, 0, -5) }); v.enter(new THREE.Vector3(-2, 0, -5));
  run(v, 6, { throttle: 1 }); const saved = v.snapshot(); assert(saved.pitch < -.2 && saved.pos[1] > 3);
  assert(v.reset(saved)); assert(v.enter(new THREE.Vector3(v.pos.x - 2, v.pos.y, v.pos.z)));
  const z = v.pos.z; run(v, 1, { throttle: 1 }); assert(v.pos.z > z + .8 && v.lastBlock === null);
});

test('sweep uses true oblique props and respects dead/noMove and overhead clearance', () => {
  const s = new Solid(); const b = wall(s, -4, 4, -4, 4);
  b.obb = { cx: 0, cz: 0, hx: .25, hz: 4, ry: Math.PI / 4 };
  assert(sweepVehiclePose(s, pose(-3, 0, 3), pose(-3, 0, 3)).ok, 'unused corners of an oblique prop AABB stay clear');
  assert(!sweepVehiclePose(s, pose(-5, 0, 0), pose(5, 0, 0)).ok);
  b.noMove = true; assert(sweepVehiclePose(s, pose(-5, 0, 0), pose(5, 0, 0)).ok);
  b.noMove = false; b.dead = true; assert(sweepVehiclePose(s, pose(-5, 0, 0), pose(5, 0, 0)).ok);
  const roof = new Solid(); wall(roof, -10, 10, 5, 15, 3, 4);
  assert(sweepVehiclePose(roof, pose(), pose(0, 0, 10), 'apc').ok);
  wall(roof, -10, 10, 16, 20, 2.15, 4);
  assert(!sweepVehiclePose(roof, pose(0, 0, 10), pose(0, 0, 18), 'apc').ok);
});

test('30 km/h patrol cap, slower APC, braking, steering direction and 30/60 Hz controls agree', () => {
  for (const type of ['patrol', 'apc']) for (const dt of [1 / 30, 1 / 60]) {
    const v = car(new Solid(), type); assert(v.enter(driver)); run(v, 5, { throttle: 1 }, dt);
    assert(Math.abs(v.speed - VEHICLE_TYPES[type].maxSpeed) < .001); assert(v.pos.z > 20);
    const z = v.pos.z; run(v, .4, { throttle: 1, steer: 1 }, dt); assert(v.yaw < 0 && v.pos.x < 0, 'positive steering follows Pilot right input');
    assert(v.pos.z > z); run(v, 2, { brake: true }, dt); assert.equal(v.speed, 0);
    run(v, 2, { throttle: -1 }, dt); assert(v.speed < 0 && Math.abs(v.speed) <= VEHICLE_TYPES[type].reverseSpeed);
    v.update(5, { throttle: 1 }); assert(Math.abs(v.speed) <= VEHICLE_TYPES[type].maxSpeed, 'background frame cannot teleport a vehicle');
  }
  const a = car(), b = car(); a.enter(driver); b.enter(driver); run(a, 6, { throttle: 1 }, 1 / 30); run(b, 6, { throttle: 1 });
  assert(a.pos.distanceTo(b.pos) < .12);
});

test('driver camera follows actual turns and retains mouse/touch orbit relative to the chassis at 30/60 Hz', () => {
  const angle = a => Math.atan2(Math.sin(a), Math.cos(a));
  for (const dt of [1 / 30, 1 / 60]) {
    const v = car(); v.enter(driver); run(v, 3, { my: 1, mx: 0 }, dt); run(v, 1.5, { my: 1, mx: -1 }, dt);
    assert(v.yaw > .6 && Math.abs(angle(v.viewYaw - v.yaw)) < 1e-8, 'a default chase camera must rotate through the bend with the vehicle');
    const c = v.camera(), forward = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw));
    assert(Math.abs(c.position.clone().sub(v.pos).dot(forward) + 7.5) < 1e-6, 'camera remains above and behind the turning car');
    v.update(dt, { lookX: -.45, my: 1, mx: -1 }); const offset = angle(v.viewYaw - v.yaw); assert(Math.abs(offset - .45) < 1e-8);
    run(v, 3, { my: 1, mx: -1, lookX: 0, lookY: 0 }, dt);
    assert(Math.abs(angle(v.viewYaw - v.yaw) - offset) < 1e-8, 'free look must survive continuing turns and the ±PI wrap');
    v.update(dt, { lookX: .2 }); assert(Math.abs(angle(v.viewYaw - v.yaw) - .25) < 1e-8);
  }
  const gun = car(); gun.enter(driver); run(gun, 3, { my: 1, mx: 1 }); gun.setMode('gun'); gun.update(.016, { lookYaw: gun.yaw + .4, lookPitch: .1 });
  const aim = gun.viewYaw, yaw = gun.yaw; run(gun, .3, {});
  assert(Math.abs(gun.yaw - yaw) > .005 && Math.abs(angle(gun.viewYaw - aim)) < 1e-8, 'braking chassis rotation must not drag a gunner off the target');
});

test('Pilot S input brakes from full forward speed and then reverses without a separate gear control', () => {
  for (const type of ['patrol', 'apc']) {
    const v = car(new Solid(), type); v.enter(driver); run(v, 5, { my: 1 }); const speed = v.speed;
    v.update(1 / 60, { my: -1 }); assert(v.speed < speed && v.speed > 0, 'S initially brakes instead of instantly reversing velocity');
    let peak = v.pos.z; for (let i = 0; i < 180; i++) { v.update(1 / 60, { my: -1 }); peak = Math.max(peak, v.pos.z); }
    assert(v.speed < 0 && Math.abs(v.speed) <= v.profile.reverseSpeed && v.pos.z < peak - 3);
    run(v, 2, { my: 1 }); assert(v.speed > 0, 'W returns from reverse through the same controlled stop');
  }
});

test('driving collision leaves room to reverse out rather than trapping the player', () => {
  const s = new Solid(); wall(s, -5, 5, 12, 12.03); const v = car(s); v.enter(driver);
  run(v, 8, { throttle: 1 }); assert(v.pos.z + v.profile.length / 2 < 12); assert.equal(v.speed, 0);
  const z = v.pos.z; run(v, 2, { throttle: -1 }); assert(v.pos.z < z - 2);
});

test('gun mode brakes before fire; aiming, ammunition, heat lock and destroyed vehicle fallback are real', () => {
  const v = car(); assert(v.enter(driver)); run(v, 3, { throttle: 1 });
  assert.equal(v.fire(), null); assert(v.setMode('gun')); assert.equal(v.fire(), null);
  run(v, 2, { lookYaw: .5, lookPitch: .1 }); const ammo = v.ammo, shot = v.fire();
  assert(shot && shot.lightArmorOnly); assert.equal(v.ammo, ammo - 1); assert(shot.direction.x > .4 && shot.direction.y > 0);
  assert(Math.abs(shot.direction.length() - 1) < 1e-9); assert.equal(v.fire(), null, 'fire rate gate prevents duplicated same-frame shots');
  let shots = 1; for (let i = 0; i < 400; i++) { v.update(1 / 120); if (v.fire()) shots++; if (v.heatLocked) break; }
  assert(v.heatLocked && shots < 20 && shots >= 10); assert.equal(v.fire(), null); run(v, 4, {}); assert(!v.heatLocked && v.fire());
  assert.equal(v.damage(10000), v.profile.hp); assert(v.destroyed && v.occupied && v.speed === 0); assert.equal(v.fire(), null);
  const exit = v.exit(); assert(exit && !v.occupied); assert(!v.enter(exit));
});

test('safe exit chooses an unblocked door, stays outside vehicle and supports stopping requests', () => {
  const s = new Solid(); wall(s, -3, -1.1, -4, 4); const v = car(s);
  assert(v.enter(new THREE.Vector3(1.7, 0, .2))); const p = v.exit();
  assert(p && p.x > 1.3); const copy = p.clone(); assert(!s.pushOut(copy, .34, p.y, p.y + 1.76, .45));
  assert(v.enter(p)); run(v, 2, { throttle: 1 }); assert.equal(v.exit(), null); assert.equal(v.seatMode, 'gun');
  run(v, 2, {}); assert(v.exit());
});

test('narrow entrance exits through its open end; sealed thin walls cannot be skipped by local exit rings', () => {
  const s = new Solid(), v = car(s); v.enter(new THREE.Vector3(0, 0, -3.3));
  wall(s, -3, -1.25, -12, 12); wall(s, 1.25, 3, -12, 12); wall(s, -3, 3, 2.55, 4);
  const safe = v.exit(); assert(safe && Math.abs(safe.x) < .5 && safe.z < -2.76, 'narrow doors should lead to the available rear passage');
  assert(!s.pushOut(safe.clone(), .34, safe.y, safe.y + 1.76, .45));
  v.enter(safe); wall(s, -3, 3, -4, -2.55);
  assert.equal(v.exit(), null, 'a free endpoint beyond a thin wall is not a local door exit');
  v.damage(9999); const backup = v.exit(new THREE.Vector3(0, 0, -15)); assert(backup && backup.z === -15 && !v.occupied, 'checked checkpoint fallback still provides a foot route for a destroyed trapped vehicle');
});

test('destroyed vehicle surrounded on all four sides can use a checked foot checkpoint fallback', () => {
  const s = new Solid(), v = car(s); v.enter(driver);
  wall(s, -10, -1.1, -10, 10); wall(s, 1.1, 10, -10, 10);
  wall(s, -10, 10, -10, -2.5); wall(s, -10, 10, 2.5, 10);
  v.damage(9999); assert.equal(v.exit(), null, 'never invent a safe point inside a solid wall');
  assert.equal(v.exit(new THREE.Vector3(-5, 0, 0)), null, 'a blocked fallback is also checked');
  const safe = v.exit(new THREE.Vector3(14, 0, 0)); assert(safe && safe.x === 14 && !v.occupied);
});

test('checkpoint snapshots validate ranges and identity, reset to stationary external mode, retain damage and ammo', () => {
  const v = car(); v.enter(driver); v.setMode('gun'); v.fire(); v.damage(70); const saved = v.snapshot();
  assert(validVehicleSnapshot(saved)); assert.equal(saved.hp, 250); assert.equal(saved.ammo, 359);
  for (const patch of [{ type: 'tank' }, { pos: [0, NaN, 0] }, { ammo: -1 }, { hp: 1e9 }, { overheat: 2 }, { yaw: Infinity }, { version: 2 }, { id: '' }]) assert(!validVehicleSnapshot({ ...saved, ...patch }));
  assert(!v.reset({ ...saved, id: 'another-car' })); v.damage(90); assert(v.reset(saved));
  assert.equal(v.hp, 250); assert.equal(v.ammo, 359); assert(!v.occupied && v.speed === 0); assert.equal(v.fire(), null);
  assert(v.reset()); assert.equal(v.hp, v.profile.hp); assert.equal(v.ammo, v.profile.ammo);
});

test('camera vectors are reused, third person clips safely before walls, muzzle cannot start behind a wall', () => {
  const s = new Solid(); wall(s, -6, 6, -5, -4.8); const v = car(s); v.enter(driver);
  const a = v.camera(), pos = a.position; assert(a.position.z > -4.8);
  assert.strictEqual(v.camera(), a); assert.strictEqual(v.camera().position, pos);
  v.setMode('gun'); v.update(.01, { lookYaw: Math.PI / 2, lookPitch: 0 }); wall(s, .5, .7, -1, 1);
  const ammo = v.ammo; assert.equal(v.fire(), null); assert.equal(v.ammo, ammo, 'blocked muzzle consumes no ammunition');
});

test('gun camera follows the sight and muzzle converges on a supplied real crosshair target', () => {
  const v = car(); v.enter(driver); v.setMode('gun'); v.update(.01, { lookYaw: .7, lookPitch: .2 });
  const camera = v.camera(), sight = camera.target.clone().sub(camera.position).normalize();
  const expected = new THREE.Vector3(Math.sin(.7) * Math.cos(.2), Math.sin(.2), Math.cos(.7) * Math.cos(.2));
  assert(sight.distanceTo(expected) < 1e-9);
  const target = camera.position.clone().addScaledVector(sight, 20), shot = v.fire(target);
  assert(shot && shot.origin.clone().addScaledVector(shot.direction, shot.origin.distanceTo(target)).distanceTo(target) < 1e-8);
  v.update(.1, { throttle: NaN, steer: Infinity, lookX: Infinity, lookY: NaN });
  assert(validVehicleSnapshot(v.snapshot()), 'bad input cannot corrupt persistent motion state');
});

test('visible muzzle and local gun joints match the world sight on pitched and rolled chassis', () => {
  const materials = Object.fromEntries(['carPaint', 'carDark', 'carMetal', 'carGlass', 'carLights'].map(key => [key, new THREE.MeshStandardMaterial({ vertexColors: true })]));
  for (const type of ['patrol', 'apc']) for (const [pitch, roll] of [[-.24, .15], [.27, -.18], [-.33, -.12]]) {
    const model = createGroundVehicleModel(type, { materials }), v = car(new Solid(), type, { pos: new THREE.Vector3(7, 5, -2), yaw: .7, model });
    v.enter(v.pos.clone().add(new THREE.Vector3(-1.7, 0, 0))); v.setMode('gun'); v.pitch = pitch; v.roll = roll;
    v.update(.01, { lookYaw: 1.1, lookPitch: .2 }); model.root.updateMatrixWorld(true);
    const camera = v.camera(), sight = camera.target.clone().sub(camera.position).normalize(), muzzle = model.muzzle.getWorldPosition(new THREE.Vector3()), barrel = model.muzzle.getWorldDirection(new THREE.Vector3());
    assert(sight.distanceTo(barrel) < 1e-7, 'root slope must not tilt the visible barrel away from the world camera sight');
    const target = camera.position.clone().addScaledVector(sight, 30), shot = v.fire(target);
    assert(shot && shot.origin.distanceTo(muzzle) < 1e-7, 'projectile starts at the transformed visible muzzle');
    assert(shot.origin.clone().addScaledVector(shot.direction, shot.origin.distanceTo(target)).distanceTo(target) < 1e-7);
    v.update(.05, { lookYaw: -.9, lookPitch: 1.1 }); model.root.updateMatrixWorld(true);
    assert(v.turretPitch <= .620001 && v.turretPitch >= -.300001 && Math.abs(v.turretYaw) <= 2.950001);
    const limited = v.camera(); assert(model.muzzle.getWorldDirection(new THREE.Vector3()).distanceTo(limited.target.clone().sub(limited.position).normalize()) < 1e-7, 'mechanical joint limits also constrain the world sight');
    model.dispose();
  }
});
