import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ViewModel, WEAPONS } from '../zero/viewmodel.js';

const noop = () => {};
function fixture() {
  const g = Object.fromEntries(Object.keys(WEAPONS).map(k => [k, { visible: k === 'rifle', userData: {
    ammoBar: [], ammoInstances: { instanceColor: {}, setColorAt: noop }, glow: { color: new THREE.Color() }, glowBase: new THREE.Color(1, 2, 3),
  } }]));
  return Object.assign(Object.create(ViewModel.prototype), {
    g, cur: 'rifle', ammo: Object.fromEntries(Object.entries(WEAPONS).map(([k,w]) => [k,w.mag])),
    bloom: { rifle: 0, pistol: 0, smg: 0 }, audio: new Proxy({}, { get: () => noop }),
    cd: 0, reloadT: -1, swapT: -1, nadeT: -1, t: 0, ads: 0, breath: 1, heat: 0,
    kick: new THREE.Vector3(), kickV: new THREE.Vector3(), rot: new THREE.Vector3(), rotV: new THREE.Vector3(),
    sway: new THREE.Vector2(), bobT: 0, sprintK: 0, landK: 0, lastTrigger: false, _pose: noop,
  });
}
const player = { sprintK: 0, moveK: 0, grounded: true, crouchK: 0 }, look = { x: 0, y: 0 };
const tick = (v, c = {}, dt = 1 / 60) => v.update(dt, c, player, look);
test('Q cycles all three default weapons and a direct selection uses the new weapon stats immediately', () => {
  const v = fixture();
  for (const kind of ['pistol', 'smg', 'rifle']) { v.swap(); tick(v, {}, 0.6); assert.equal(v.cur, kind); assert.equal(v.model.visible, true); }
  v.swap('smg'); const shot = tick(v, { fire: true }, 0.6);
  assert.equal(shot.weapon, 'smg'); assert.equal(shot.W, WEAPONS.smg); assert.equal(v.ammo.smg, 31);
  v.swap('missing'); assert.equal(v.swapT, -1);
});
test('SMG continues firing while held, rifle fires once, and sprint blocks firing', () => {
  for (const kind of ['smg', 'rifle']) {
    const v = fixture(); v.cur = kind; let shots = 0;
    for (let i = 0; i < 60; i++) if (tick(v, { fire: true })) shots++;
    assert.ok(kind === 'smg' ? shots >= 10 && shots <= 12 : shots === 1);
    assert.equal(v.ammo[kind], WEAPONS[kind].mag - shots);
  }
  const v = fixture(); v.cur = 'smg'; assert.equal(v.update(0.1, { fire: true }, { ...player, sprintK: 1 }, look), null);
});
test('reload interruption preserves ammunition, and chapter refill restores every default weapon', () => {
  const v = fixture(); v.cur = 'smg'; v.ammo.smg = 4; v.reload(); tick(v, {}, 0.5); v.swap('pistol'); tick(v, {}, 0.6);
  assert.equal(v.ammo.smg, 4); assert.equal(v.reloadT, -1);
  v.swap('smg'); tick(v, {}, 0.6); v.reload(); tick(v, {}, 2);
  assert.equal(v.ammo.smg, 32); assert.equal(v.reloadT, -1);
  v.ammo.rifle = v.ammo.pistol = v.ammo.smg = 0; v.refill();
  for (const k in WEAPONS) assert.equal(v.ammo[k], WEAPONS[k].mag);
});

test('SMG keeps the sight window on the actual aim ray during movement and recoil', () => {
  const vm = fixture();
  vm.cur = 'smg';
  vm.holder = new THREE.Group(); vm.arms = { root: new THREE.Group() };
  vm.g = { smg: new THREE.Group() };
  vm.holder.add(vm.model);
  vm._pose = ViewModel.prototype._pose;
  vm._hands = noop;
  vm.bobT = .6; vm.landK = .8;
  vm.handling = { pose: () => ({ side: -.025, vertical: -.045, yaw: .14, pitch: -.13, back: .025, lift: .08, roll: .035 }) };
  const mag = new THREE.Group();
  vm.model.userData = { mag, magHome: mag.position.clone(), sightY: .122, sightZ: .285 };
  const sight = () => vm.model.localToWorld(new THREE.Vector3(0, .122, .285));
  vm.ads = .6;
  vm._pose(1 / 60, 1, .8);
  assert.equal(vm.reflexReady, false);
  assert(Math.abs(sight().x) > .001);
  for (const ads of [.82, 1]) {
    vm.ads = ads;
    vm._pose(1 / 60, 1, .8);
    assert.equal(vm.reflexReady, true);
    const center = sight();
    assert(Math.hypot(center.x, center.y) < 1e-8 && center.z < 0);
    assert(Math.abs(vm.holder.rotation.x) > .05 && Math.abs(vm.holder.rotation.z) > .02);
  }
  vm.reloadT = .5;
  assert.equal(vm.reflexReady, false);
});
