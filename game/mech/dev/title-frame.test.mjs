import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { frameTitle } from '../title-visual.mjs';

test('title framing follows resize and restores the play camera before aiming or entering the cockpit', () => {
  const original = [globalThis.innerWidth, globalThis.innerHeight];
  try {
    const camera = new THREE.PerspectiveCamera(72, 1.6, .1, 1000);
    globalThis.innerWidth = 1440; globalThis.innerHeight = 900;
    frameTitle(camera, true); assert.equal(camera.fov, 50); assert(camera.view.offsetX < 0);
    globalThis.innerWidth = 390; globalThis.innerHeight = 844;
    frameTitle(camera, true); assert.equal(camera.fov, 60); assert.equal(camera.view.offsetX, 0);
    frameTitle(camera, false); assert.equal(camera.fov, 72); assert.equal(camera.view.enabled, false);
    camera.fov = 70; camera.updateProjectionMatrix();
    frameTitle(camera, false); assert.equal(camera.fov, 70, 'an already restored infantry camera must not override the mech FOV');
    frameTitle(camera, true); frameTitle(camera, false); assert.equal(camera.fov, 70);
  } finally { [globalThis.innerWidth, globalThis.innerHeight] = original; }
});
