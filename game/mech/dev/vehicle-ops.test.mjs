import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Solid } from '../zero/kit.js';
import { Pilot } from '../zero/player.js';
import { VehicleOps } from '../zero/vehicle-ops.mjs';
import { VEHICLE_ROUTES } from '../zero/vehicle-routes.mjs';
import { MAX_ACTORS } from '../zero/patrol.js';

// DOM only supports the real adapter/HistoryReader's construction; geometry, controller,
// story, spatial collision and resident actor lifecycle remain the production modules.
class Element {
  constructor(tag, document) { this.tagName = tag.toUpperCase(); this.document = document; this.children = []; this.style = {}; this.dataset = {}; this.listeners = new Map(); this.hidden = false; }
  append(...children) { for (const c of children) { c.parentNode = this; this.children.push(c); } }
  appendChild(c) { this.append(c); return c; }
  replaceChildren(...children) { for (const c of this.children) c.parentNode = null; this.children = []; this.append(...children); }
  setAttribute(k, v) { (this.attributes ||= {})[k] = String(v); }
  addEventListener(k, f) { this.listeners.set(k, f); }
  removeEventListener(k) { this.listeners.delete(k); }
  querySelectorAll(tag) { return this.children.flatMap(c => [ ...(c.tagName === tag.toUpperCase() ? [c] : []), ...c.querySelectorAll(tag) ]); }
  focus() { this.document.activeElement = this; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); this.parentNode = null; }
  setPointerCapture() {}
}
function dom() {
  const d = { elements: [], activeElement: null, createElement(tag) { const e = new Element(tag, this); this.elements.push(e); return e; }, getElementById(id) { return this.elements.find(e => e.id === id) || null; } };
  d.head = d.createElement('head'); d.body = d.createElement('body'); return d;
}
const V = p => new THREE.Vector3(...p), clone = o => JSON.parse(JSON.stringify(o));
function fixture(campaign = 'zero') {
  globalThis.document = dom();
  const solid = new Solid(), scene = new THREE.Scene(), player = new Pilot(solid), input = { keys: new Set(), down: new Set(), touch: { on: false }, held(k) { return this.keys.has(k); }, pressed(k) { return this.down.has(k); }, reset() { this.keys.clear(); this.down.clear(); }, unlock() {} };
  player.pos.set(0, 0, 0); player.hurtT = 10;
  const notes = [], sayings = [], shots = [], pins = [], material = () => new THREE.MeshStandardMaterial({ vertexColors: true });
  const materials = Object.fromEntries(['carPaint', 'carDark', 'carMetal', 'carGlass', 'carLights'].map(k => [k, material()]));
  const surfaces = Object.fromEntries(['floor', 'metal', 'painted', 'fabric'].map(k => [k, material()]));
  const audio = { radio() {}, swap() {} }, vm = { holder: new THREE.Group(), arms: { root: new THREE.Group() }, scoped: false, ads: 0 };
  const G = { solid, scene, player, input, audio, vm, scout: { active: false, pos: new THREE.Vector3() }, footExtent: 640, nextId: 1, enemies: [], playerEye: new THREE.Vector3(), hud: { prompt: null, note(...a) { notes.push(a); }, say(...a) { sayings.push(a); } }, shotRay: (o, d, r) => solid.ray(o, d, r) };
  let changed = 0, spawnCount = 0, disposed = 0;
  const spawn = def => {
    if (G.enemies.filter(e => !e.dead).length >= MAX_ACTORS) return null;
    spawnCount++;
    const actor = { id: G.nextId++, pos: new THREE.Vector3(def.x, def.y || 0, def.z), home: new THREE.Vector3(def.x, def.y || 0, def.z), lastSeen: new THREE.Vector3(def.x, def.y || 0, def.z), hp: 100, dead: false, state: 'patrol', sees: false, yaw: def.yaw || 0, update() {}, alert(p) { this.state = 'combat'; this.lastSeen.copy(p); }, dispose() { disposed++; } };
    G.enemies.push(actor); return actor;
  };
  const camera = new THREE.PerspectiveCamera(70, 1, .1, 2000), fallback = new THREE.Vector3(0, 0, 0);
  const ops = new VehicleOps({ G, campaign, materials, surfaces, map: {}, input, camera, pause() {}, resume() {}, canOpen: () => true, changed: () => changed++, spawn, shoot: shot => shots.push(shot), fallback: () => fallback });
  ops.chapter = campaign === 'zero' ? 3 : 3; ops.done = new Set(campaign === 'zero' ? ['D1', 'I2'] : ['B5', 'D2C', 'F3']);
  const x = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({ width: 0 }) : () => {}, set: () => true });
  const hud = { x, _pin(...args) { pins.push(args); } };
  return { ops, G, solid, input, scene, camera, shots, notes, sayings, pins, hud, changed: () => changed, spawnCount: () => spawnCount, disposed: () => disposed };
}
function accept(f, id = f.ops.campaign === 'zero' ? 'zero_kitano' : 'lastline_manifest') { assert(f.ops.accept(id)); return f.ops.vehicle; }
function holdOperation(f) {
  const c = f.ops.story.current; assert.equal(c.kind, 'operate'); f.G.player.pos.copy(V(c.point)); f.input.keys.add('KeyE'); f.G.player.hurtT = 10;
  for (let i = 0; i < Math.ceil(c.seconds / .05) + 1 && f.ops.story.current?.token === c.token; i++) f.ops.update(.05, f.ops.chapter, f.ops.done);
  f.input.keys.clear();
}
function driveStage(f, mode = 'drive') {
  const c = f.ops.story.current; assert.equal(c.kind, 'drive'); const v = f.ops.vehicle;
  v.seatMode = mode; f.G.player.frozen = true;
  for (const p of c.route) { v.pos.copy(V(p)); f.G.player.pos.copy(v.pos); f.ops.update(.05, f.ops.chapter, f.ops.done); }
}
function completeMission(f, id) {
  const v = accept(f, id);
  for (let i = 0; f.ops.story.current && i < 12; i++) {
    const c = f.ops.story.current;
    if (c.kind === 'drive') driveStage(f);
    else {
      v.seatMode = null; f.G.player.frozen = false;
      if (c.kind === 'operate') holdOperation(f);
      else {
        f.G.player.pos.copy(V(c.point)); f.G.player.hurtT = 10;
        if (c.kind === 'clear') f.ops.cleared.add(c.token);
        for (let j = 0; j < Math.ceil((c.seconds || .05) / .05) + 1 && f.ops.story.current?.token === c.token; j++) f.ops.update(.05, f.ops.chapter, f.ops.done);
      }
    }
  }
  assert.equal(f.ops.story.active, null); assert(f.ops.story.completed.has(id)); return v;
}

test('active story with absent, malformed or wrong vehicle cannot revive passengers/cargo or fabricate a fresh car', () => {
  const source = fixture(); accept(source); holdOperation(source); const saved = source.ops.snapshot();
  assert.equal(saved.story.active.passengers, 2); assert.equal(saved.story.active.stage, 1);
  for (const invalid of [null, undefined, { ...saved.vehicle, id: 'another-car' }, { ...saved.vehicle, type: 'apc' }, { ...saved.vehicle, hp: 9999 }, { ...saved.vehicle, pos: [NaN, 0, 0] }]) {
    const f = fixture(), s = clone(saved); s.vehicle = invalid; const player = f.G.player.pos.clone();
    f.ops.restore(s); assert.equal(f.ops.story.active, null, 'invalid active vehicle must abandon the optional side mission');
    assert.equal(f.ops.story.completed.size, 0); assert.equal(f.ops.story.support.size, 0); assert(f.G.player.pos.equals(player));
    assert(!f.ops.vehicle || f.ops.vehicle.destroyed || !f.ops.vehicle.model.root.visible, 'never provide a new healthy car from invalid active state');
  }
});

test('valid restore preserves wear/ammunition, stays external, and malformed Solid positions do not teleport into a wall', () => {
  const source = fixture(); const v = accept(source); v.hp = 127; v.ammo = 71; holdOperation(source); const saved = source.ops.snapshot();
  const f = fixture(); assert(f.ops.restore(clone(saved))); assert.equal(f.ops.vehicle.hp, 127); assert.equal(f.ops.vehicle.ammo, 71); assert(!f.ops.vehicle.occupied && !f.G.player.frozen);
  const blocked = fixture(); blocked.solid.add({ x0: 20, x1: 30, y0: 0, y1: 12, z0: 20, z1: 30 }); const tampered = clone(saved); tampered.vehicle.pos = [25, 0, 25];
  blocked.ops.restore(tampered); assert.equal(blocked.ops.story.active, null); assert(!blocked.ops.vehicle || !blocked.ops.vehicle.model.root.visible);
  assert(!blocked.solid.pushOut(blocked.G.player.pos.clone(), .34, blocked.G.player.pos.y, blocked.G.player.pos.y + 1.76, .45));
  for (const pos of [[0, 30, 0], [639, 0, 0]]) { const q = fixture(), s = clone(saved); s.vehicle.pos = pos; q.ops.restore(s); assert.equal(q.ops.story.active, null, 'roof/floor and full footprint boundaries require validation'); }
});

test('completed optional missions restore their parked patrol/APC with wear and ammunition without replaying rewards or growing models', () => {
  for (const [campaign, id] of [['zero', 'zero_patrol'], ['lastline', 'lastline_manifest']]) {
    const source = fixture(campaign), v = completeMission(source, id); v.hp = 127; v.ammo = 71; v.overheat = .63;
    const saved = clone(source.ops.snapshot()), f = fixture(campaign); f.G.player.hp = 37; const player = f.G.player.pos.clone();
    for (let i = 0; i < 3; i++) {
      assert(f.ops.restore(saved)); const parked = f.ops.vehicle;
      assert(parked && parked.model.root.visible && parked.visible); assert.equal(parked.id, id + ':vehicle'); assert.equal(parked.type, v.type);
      assert.equal(parked.hp, 127); assert.equal(parked.ammo, 71); assert.equal(parked.overheat, .63); assert(parked.pos.equals(v.pos));
      assert(!parked.occupied && !f.G.player.frozen); assert(f.G.player.pos.equals(player)); assert.equal(f.G.player.hp, 37);
      assert.equal(f.ops.story.active, null); assert.deepEqual(f.ops.story.snapshot(), saved.story); assert.equal(f.ops.props.length, 0);
      assert.equal(f.ops.models.size, 1); assert.equal([...f.ops.models.values()].filter(m => m.root.visible).length, 1);
      assert.equal(f.changed(), 0); assert.equal(f.sayings.length, 0); assert.equal(f.notes.length, 0); assert.equal(f.spawnCount(), 0);
    }
    f.G.player.pos.copy(f.ops.vehicle.pos).add(new THREE.Vector3(Math.cos(f.ops.vehicle.yaw) * 2, 0, -Math.sin(f.ops.vehicle.yaw) * 2));
    f.input.down.add('KeyE'); f.ops.controls(.05, {}); f.input.down.clear(); assert(f.ops.vehicle.occupied, 'restored completed vehicle remains available through the actual entry controls');
    f.ops.leave(true);
    const destroyed = clone(saved); destroyed.vehicle.hp = 0; destroyed.vehicle.ammo = 0;
    assert(f.ops.restore(destroyed)); assert(f.ops.vehicle.destroyed); assert.equal(f.ops.vehicle.ammo, 0); assert.equal(f.G.player.hp, 37);
  }
});

test('completed vehicle restore rejects absent/unknown/unearned identities and unsafe parked poses without manufacturing resources', () => {
  const source = fixture(); completeMission(source, 'zero_patrol'); const saved = clone(source.ops.snapshot());
  const invalid = [null, undefined, { ...saved.vehicle, id: 'unknown:vehicle' }, { ...saved.vehicle, id: 'zero_kitano:vehicle' }, { ...saved.vehicle, id: 'lastline_channel:vehicle' }, { ...saved.vehicle, type: 'apc' }, { ...saved.vehicle, hp: 9999 }, { ...saved.vehicle, pos: [NaN, 0, 0] }, { ...saved.vehicle, pos: [0, 30, 0] }, { ...saved.vehicle, pos: [639, 0, 0] }, { ...saved.vehicle, pos: [637.5, 0, 0] }];
  for (const vehicle of invalid) {
    const f = fixture(), s = clone(saved); s.vehicle = vehicle; f.G.player.hp = 37;
    assert(f.ops.restore(s)); assert.equal(f.ops.vehicle, null); assert.equal(f.ops.models.size, 0); assert.equal(f.G.player.hp, 37);
    assert.deepEqual(f.ops.story.snapshot(), saved.story); assert.equal(f.sayings.length, 0); assert.equal(f.notes.length, 0); assert.equal(f.changed(), 0);
  }
  const blocked = fixture(), wall = clone(saved); wall.vehicle.pos = [25, 0, 25]; blocked.solid.add({ x0: 20, x1: 30, y0: 0, y1: 12, z0: 20, z1: 30 });
  assert(blocked.ops.restore(wall)); assert.equal(blocked.ops.vehicle, null); assert.deepEqual(blocked.ops.story.snapshot(), saved.story);
  const raised = fixture(), platform = clone(saved); platform.vehicle.pos = [0, 4, 0]; raised.solid.add({ x0: -10, x1: 10, y0: 0, y1: 4, z0: -10, z1: 10 });
  assert(raised.ops.restore(platform)); assert(raised.ops.vehicle && raised.ops.vehicle.pos.y === 4, 'safe parked ground height comes from the actual Solid, not a forced zero');
});

test('restore/null while driving cannot leave a frozen pilot or duplicate visible active models', () => {
  const f = fixture(), v = accept(f); f.G.player.pos.copy(v.pos).add(new THREE.Vector3(-1.7, 0, .2)); f.input.down.add('KeyE'); f.ops.controls(.05, {}); f.input.down.clear();
  assert(v.occupied && f.G.player.frozen); for (let i = 0; i < 50; i++) f.ops.controls(.05, { my: 1, mx: 0, lookX: 0, lookY: 0 });
  assert(v.speed > 1); f.ops.restore(null); assert(!f.G.player.frozen && !f.ops.occupied, 'discarding a moving controller must release the Pilot');
  const roots = () => [...f.ops.models.values()].filter(m => m.root.visible).length; assert.equal(roots(), 0);
  assert(f.ops.accept('zero_patrol')); assert.equal(roots(), 1); f.ops.story.abandon(); f.ops.events(); assert(f.ops.accept('zero_kitano')); assert.equal(roots(), 1);
});

test('operation props are actual readable geometry, E is required and operation takes place on foot', () => {
  const f = fixture(), v = accept(f); assert(f.ops.props.length >= 2);
  for (const m of f.ops.props) { assert(m.isMesh && m.geometry.attributes.position.count > 0 && m.visible); assert(m.name.startsWith('vehicle-operation-')); }
  f.G.player.pos.copy(V(f.ops.story.current.point)); for (let i = 0; i < 120; i++) f.ops.update(.05, 3, f.ops.done);
  assert.equal(f.ops.story.active.stage, 0); assert.equal(f.ops.story.active.passengers, 0);
  v.seatMode = 'drive'; f.input.keys.add('KeyE'); for (let i = 0; i < 120; i++) f.ops.update(.05, 3, f.ops.done); assert.equal(f.ops.story.active.stage, 0);
  v.seatMode = null; f.input.keys.clear(); holdOperation(f); assert.equal(f.ops.story.active.stage, 1); assert.equal(f.ops.story.active.passengers, 2); assert.equal(f.ops.props.length, 0, 'workstation removed on driving stage');
});

test('gun mode cannot advance drive objectives and current context preserves stopped/seat requirements', () => {
  const f = fixture(); accept(f); holdOperation(f); driveStage(f, 'gun'); assert.equal(f.ops.story.current.id, 'kitano');
  assert.equal(f.ops.context().vehicle.seatMode, 'gun'); f.ops.vehicle.speed = 2; assert.equal(f.ops.context().vehicle.speed, 2);
  f.ops.vehicle.speed = 0; driveStage(f, 'drive'); assert.equal(f.ops.story.current.id, 'garden');
});

test('enter/exit consumes the E edge; active drone prevents taking a seat and touch seats use the same gate', () => {
  const f = fixture(), v = accept(f); f.G.player.pos.copy(v.pos).add(new THREE.Vector3(-1.7, 0, .2));
  f.G.scout.active = true; f.input.down.add('KeyE'); f.ops.controls(.016, {}); assert(!v.occupied); f.G.scout.active = false;
  f.ops.controls(.016, {}); assert(v.occupied && f.G.player.frozen); assert(!f.input.pressed('KeyE'), 'the foot hatch/pickup caller must not see the vehicle E edge');
  f.input.down.add('KeyE'); f.ops.controls(.016, {}); assert(!v.occupied && !f.G.player.frozen); assert(!f.input.pressed('KeyE'));
  f.input.touch.on = true; f.input.down.add('Tvehicle'); f.ops.controls(.016, {}); assert(v.occupied && !f.ops.seats.hidden); assert(!f.input.pressed('Tvehicle'));
});

test('parked car body remains hittable but vehicle-only damage does not injure/freeze distant pilot', () => {
  const f = fixture(), v = accept(f); const o = v.pos.clone().add(new THREE.Vector3(-10, 1, 0)), d = new THREE.Vector3(1, 0, 0);
  const hit = f.ops.hitTest(o, d, 20), p = v.profile;
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(p.width, p.height - .34, p.length), new THREE.MeshBasicMaterial());
  chassis.position.copy(v.pos).add(new THREE.Vector3(0, (p.height + .34) / 2, 0)); chassis.rotation.y = v.yaw; chassis.updateMatrixWorld();
  const independently = new THREE.Raycaster(o, d, 0, 20).intersectObject(chassis)[0]?.distance;
  assert(Number.isFinite(hit) && Math.abs(hit - independently) < 1e-6); assert.equal(f.ops.hitTest(o, d, 5), null);
  const hp = v.hp; f.G.player.hurtT = 10; assert(f.ops.damage(35)); assert.equal(v.hp, hp - 35); assert.equal(f.G.player.hp, 100); assert.equal(f.G.player.hurtT, 10);
  f.G.player.pos.copy(v.pos).add(new THREE.Vector3(-1.7, 0, .2)); v.enter(f.G.player.pos); f.G.player.frozen = true; f.ops.damage(35); assert.equal(f.G.player.hurtT, 0);
  f.ops.damage(9999); assert(!v.occupied && !f.G.player.frozen && f.ops.story.active === null); assert.equal(v.hp, 0);
});

test('chassis bullet hit distances agree with independent three-dimensional raycasts on slopes', () => {
  const f = fixture(), v = accept(f), p = v.profile;
  for (const [pitch, roll, yaw] of [[-.3, .12, 0], [.25, -.18, .8], [-.22, -.15, -1.4]]) {
    v.pitch = pitch; v.roll = roll; v.yaw = yaw;
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
    const geometry = new THREE.BoxGeometry(p.width, p.height - .34, p.length).translate(0, (p.height + .34) / 2, 0), chassis = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    chassis.position.copy(v.pos); chassis.quaternion.copy(rotation); chassis.updateMatrixWorld();
    const surface = new THREE.Vector3(.2, 1.7, p.length / 2).applyQuaternion(rotation).add(v.pos), normal = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation), origin = surface.clone().addScaledVector(normal, 10), direction = normal.negate();
    const expected = new THREE.Raycaster(origin, direction, 0, 20).intersectObject(chassis)[0]?.distance;
    const actual = f.ops.hitTest(origin, direction, 20); assert(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-6, 'pitched armour cannot become invulnerable above the yaw-only hitbox');
  }
});

test('camera/vehicle fire dispatches real muzzle shots only when parked in gun mode, and dormant models sleep', () => {
  const f = fixture(), v = accept(f); let updates = 0; const update = v.model.update; v.model.update = state => { updates++; update(state); };
  for (let i = 0; i < 120; i++) f.ops.controls(.016, {}); assert.equal(updates, 0, 'parked undamaged models should not rewrite wheel matrices every frame');
  v.enter(v.pos.clone().add(new THREE.Vector3(-1.7, 0, .2))); f.input.keys.add('M0'); f.ops.cameraOverride(); assert.equal(f.shots.length, 0);
  v.setMode('gun'); v.update(.01, { lookYaw: .4, lookPitch: .15 }); f.ops.cameraOverride(); assert.equal(f.shots.length, 1);
  const shot = f.shots[0]; assert(shot.origin.isVector3 && shot.direction.isVector3 && shot.lightArmorOnly); assert(!f.G.vm.holder.visible && !f.G.vm.arms.root.visible);
  v.speed = 1; v.cooldown = 0; f.ops.cameraOverride(); assert.equal(f.shots.length, 1, 'no moving turret fire');
});

test('actual north hill walking route drives the HUD to the connector first instead of pointing through houses', () => {
  const f = fixture(); accept(f); holdOperation(f); driveStage(f); f.ops.vehicle.seatMode = null; f.G.player.frozen = false;
  assert.equal(f.ops.story.current.id, 'garden'); const route = VEHICLE_ROUTES.zero_kitano.walkRoutes.garden;
  f.G.player.pos.set(300, 0, -70); f.ops.draw(f.hud, 1000, 700);
  const pin = f.pins[0][2]; assert.equal(pin.x, route[0][0]); assert.equal(pin.z, route[0][2]);
  f.G.player.pos.copy(V(route[0])); f.pins.length = 0; f.ops.draw(f.hud, 1000, 700);
  assert.equal(f.pins[0][2].x, route[2][0]); assert.equal(f.pins[0][2].z, route[2][2]);
});

test('side guard residents use the shared cap and release skeletal actors when distant and unseen', () => {
  const f = fixture(); accept(f, 'zero_patrol'); const p = f.ops.sidePatrols.get('zero_patrol'); assert(p && p.records.length === 4);
  f.G.player.pos.set(133, 0, -65); f.G.playerEye.copy(f.G.player.pos).add(new THREE.Vector3(0, 1.6, 0));
  for (let i = 0; i < MAX_ACTORS; i++) f.G.enemies.push({ dead: false, pos: new THREE.Vector3(), id: i });
  p.update(.5, true); assert.equal(f.spawnCount(), 0); assert.equal(f.G.enemies.length, MAX_ACTORS);
  f.G.enemies.length = 0; p.update(.5, true); assert.equal(f.spawnCount(), 4); assert.equal(f.G.enemies.length, 4);
  f.G.player.pos.set(-250, 0, 250); f.G.playerEye.copy(f.G.player.pos).add(new THREE.Vector3(0, 1.6, 0));
  f.solid.add({ x0: -50, x1: 0, y0: 0, y1: 30, z0: -400, z1: 400 }); p.update(.5, true);
  assert.equal(f.disposed(), 4); assert.equal(f.G.enemies.length, 0); assert(p.records.every(r => r.actor === null));
});

test('real repair/drive/foot-cargo/return/unload adapter completes once and never grants duplicate healing on restore', () => {
  const f = fixture(); const v = accept(f); f.G.player.hp = 40; holdOperation(f); driveStage(f); v.seatMode = null; f.G.player.frozen = false;
  const onHill = f.ops.story.current; assert.equal(onHill.id, 'garden'); assert(f.ops.props.some(m => m.geometry.attributes.position.count > 100));
  holdOperation(f); assert.equal(f.ops.story.active.cargo, 'medical-kit'); assert.equal(f.ops.story.current.id, 'return');
  driveStage(f); v.seatMode = null; f.G.player.frozen = false; holdOperation(f);
  assert.equal(f.ops.story.active, null); assert(f.ops.story.completed.has('zero_kitano')); assert.equal(f.G.player.hp, 55);
  assert.equal(f.ops.story.completed.size, 1); assert.equal(f.ops.props.length, 0); const saved = clone(f.ops.snapshot());
  const restored = fixture(); restored.G.player.hp = 30; assert(restored.ops.restore(saved));
  for (let i = 0; i < 100; i++) restored.ops.update(.05, 3, restored.ops.done);
  assert.equal(restored.G.player.hp, 30); assert(restored.ops.story.completed.has('zero_kitano')); assert(!restored.ops.accept('zero_kitano'));
});
