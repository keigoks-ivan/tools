import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { motionDefinition } from './motion-clips.mjs';

register('../../game/tests/three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { createAthlete } = await import('./athlete.js');
const point = (actor, name) => actor.root.worldToLocal(actor.root.getObjectByName(name).getWorldPosition(new THREE.Vector3()));

test('short receive free arms balance in front without lifting the elbow to the shoulder', () => {
  for (const [profile, hand] of [['lin', 'left'], ['harimoto', 'right']]) for (const side of [-1, 1]) for (const shotType of ['flick', 'push']) {
    const mirror = hand === 'left' ? -1 : 1, back = shotType === 'flick';
    const actor = createAthlete(new THREE.Scene(), side, 0x799583, hand, profile);
    for (let frame = 0; frame < 120; frame++) actor.update(-1 + frame / 120, 1 / 120, 0, null, true);
    actor.beginSwing(0, { x: side * mirror * (back ? -0.12 : 0.27), y: 0.96, z: side * 1.10, contactDelay: 0.24, handedness: back ? 'backhand' : 'forehand', shotType, spin: back ? 1 : -1 });
    const definition = motionDefinition(profile, back ? 'backhand' : 'forehand', shotType, false, true);
    for (let frame = 1; frame <= Math.ceil((0.24 + definition.followTime) * 240); frame++) {
      const time = frame / 240;
      const enter = THREE.MathUtils.smoothstep(time, 0, 0.24 * 0.85);
      actor.update(time, 1 / 240, 0, null, true, null, { rootZ: 1.94 - 0.29 * enter });
      if (time < 0.12) continue;
      const shoulder = point(actor, `arm-${mirror}-anchor`), elbow = point(actor, `arm-${mirror}-lower`), wrist = point(actor, `arm-${mirror}-end`);
      assert.ok(shoulder.y - elbow.y > 0.10, `${profile}/${side}/${shotType}: free upper arm rises horizontally`);
      assert.ok(wrist.z > 0.40, `${profile}/${side}/${shotType}: free hand folds back toward the hip`);
    }
  }
});

test('short receive knee poles use each foot facing while preserving the stance and playing-side step', () => {
  for (const profile of ['lin', 'harimoto']) for (const hand of ['forehand', 'backhand']) for (const shotType of ['flick', 'push']) {
    const base = motionDefinition(profile, hand, shotType);
    const short = motionDefinition(profile, hand, shotType, false, true);
    for (let key = 1; key <= 3; key++) {
      const pose = short.keys[key];
      assert.deepEqual(pose.footYaw, base.keys[key].footYaw, 'short receive changes the shoe facing');
      assert.equal(pose.feet[0][0], base.keys[key].feet[0][0], 'short receive narrows the stance');
      assert.equal(pose.feet[1][0], base.keys[key].feet[1][0], 'short receive narrows the stance');
      for (let leg = 0; leg < 2; leg++) {
        const sign = leg ? 1 : -1;
        const hip = new THREE.Vector3(pose.hips[0] + sign * 0.097 * Math.cos(pose.hipYaw), pose.hips[1] - 0.025, pose.hips[2] - sign * 0.097 * Math.sin(pose.hipYaw));
        const ankle = new THREE.Vector3(pose.feet[leg][0], 0.072, pose.feet[leg][1]);
        const axis = ankle.sub(hip).normalize();
        const knee = new THREE.Vector3(...pose.knees[leg]).sub(hip);
        knee.addScaledVector(axis, -knee.dot(axis)).normalize();
        const toe = new THREE.Vector3(Math.sin(pose.footYaw[leg]), 0, Math.cos(pose.footYaw[leg]));
        toe.addScaledVector(axis, -toe.dot(axis)).normalize();
        assert.ok(knee.angleTo(toe) < 0.001, `${profile}/${hand}/${shotType}: knee bends away from the shoe facing`);
      }
    }
    if (shotType === 'push') assert.ok(short.keys[2].feet[0][1] > base.keys[2].feet[0][1] + 0.16, 'the forward receive step is lost');
  }
});
