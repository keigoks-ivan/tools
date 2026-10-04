import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Soldier } from '../zero/human.js';

test('run to aim transitions keep the weapon attached at every world position', () => {
  const chest = new THREE.Group();
  const s = Object.assign(Object.create(Soldier.prototype), {
    B: { Spine2: chest }, root: new THREE.Group(), aimYaw: 0.4, aimPitch: 0.2, recoil: 0,
  });
  const near = new THREE.Vector3(), far = new THREE.Vector3(), q = new THREE.Quaternion();
  for (const aim of [0, 0.1, 0.5, 0.9, 1]) for (const run of [0, 0.2, 0.7, 1]) {
    s.aimW = aim; s.runW = run;
    chest.position.set(0, 1.3, 0); chest.updateMatrixWorld(); s._weaponFrame(near, q);
    chest.position.add(new THREE.Vector3(-110, 3, 92)); chest.updateMatrixWorld(); s._weaponFrame(far, q);
    assert(far.sub(near).distanceTo(new THREE.Vector3(-110, 3, 92)) < 1e-10, `aim ${aim}, run ${run} remains translation invariant`);
    assert(Math.abs(q.length() - 1) < 1e-10);
  }
});
