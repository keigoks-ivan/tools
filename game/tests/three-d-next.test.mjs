import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createOni } from '../3d-next/oni.js';

test('new Rumi model keeps its compact animated 3D rig', async () => {
  const bytes = await readFile(new URL('../assets/heroes/rumi-v2.glb', import.meta.url));
  assert.ok(bytes.length < 2 * 1024 * 1024, '3D Rumi exceeds 2 MiB');
  const asset = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', resolve, reject);
  });
  assert.equal(asset.animations.length, 13);
  const meshes = [];
  asset.scene.traverse(object => { if (object.isSkinnedMesh) meshes.push(object); });
  assert.equal(meshes.length, 4);
  const sword = meshes.find(mesh => /sword/i.test(mesh.name));
  assert.ok(sword, 'animated sword missing');
  const clip = asset.animations.find(animation => animation.name === 'slash1');
  assert.ok(clip, 'slash animation missing');
  const mixer = new THREE.AnimationMixer(asset.scene);
  const vertex = new THREE.Vector3();
  sword.getVertexPosition(0, vertex);
  const rest = vertex.clone();
  mixer.clipAction(clip).play();
  mixer.update(Math.min(0.2, clip.duration * 0.4));
  asset.scene.updateMatrixWorld(true);
  sword.skeleton.update();
  sword.getVertexPosition(0, vertex);
  assert.ok(vertex.distanceTo(rest) > 1e-5, 'slash does not move the sword');
});

test('3D oni retain animated pivots with a bounded mesh count', () => {
  for (const role of ['grunt', 'runner', 'elite', 'boss']) {
    const actor = createOni(THREE, role);
    const meshes = [];
    actor.root.traverse(object => { if (object.isMesh) meshes.push(object); });
    assert.ok(meshes.length < 40, `${role}: too many separate draws`);
    actor.update('idle', 0, 0.016);
    const before = actor.root.children[0].position.y;
    actor.update('chase', 0.2, 0.016);
    assert.notEqual(actor.root.children[0].position.y, before, `${role}: chase animation did not move`);
    actor.update('telegraph', 0.4, 0.016);
    actor.update('attack', 0.1, 0.016);
    actor.update('dead', 0.4, 0.016);
    actor.dispose();
  }
});
