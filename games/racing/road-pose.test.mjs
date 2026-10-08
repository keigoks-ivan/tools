import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.js';
import { roadPose } from './road-pose.mjs';

test('wheel plane remains on inclined road while the car turns or drifts across it', () => {
  for (const roadHeading of [-2.7, -.4, 0, 1.8]) for (const heading of [-3, -1.2, 0, .6, 2.5]) for (const slope of [-.2, 0, .2]) {
    const pose = roadPose(heading, roadHeading, slope);
    const up = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(pose.pitch, heading, pose.roll, 'YXZ'));
    const normal = new THREE.Vector3(-Math.sin(roadHeading) * slope, 1, -Math.cos(roadHeading) * slope).normalize();
    assert.ok(up.distanceTo(normal) < 1e-10, 'car suspension and tyre contact share the road normal');
  }
});
