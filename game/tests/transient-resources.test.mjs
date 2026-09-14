import assert from 'node:assert/strict';
import * as THREE from 'three';
import { releaseTransient } from '../transient-resources.js';

function countDisposals(object) {
  let count = 0;
  object.addEventListener('dispose', () => { count++; });
  return () => count;
}

function testSpriteSharedResourcesSurvive() {
  const scene = new THREE.Scene();
  const sharedGeometry = new THREE.BufferGeometry();
  const sharedTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const spriteMaterial = new THREE.SpriteMaterial({ map: sharedTexture });
  const otherMaterial = new THREE.SpriteMaterial({ map: sharedTexture });
  const sprite = new THREE.Sprite(spriteMaterial);
  const otherSprite = new THREE.Sprite(otherMaterial);
  // Sprite.geometry is a shared Three.js resource; make the ownership hazard
  // explicit even though releaseTransient also handles normal sprites.
  sprite.geometry = sharedGeometry;
  otherSprite.geometry = sharedGeometry;
  scene.add(sprite, otherSprite);

  const geometryDisposed = countDisposals(sharedGeometry);
  const textureDisposed = countDisposals(sharedTexture);
  const materialDisposed = countDisposals(spriteMaterial);
  const otherMaterialDisposed = countDisposals(otherMaterial);
  releaseTransient(sprite);

  assert.equal(geometryDisposed(), 0, 'sprite shared geometry was disposed');
  assert.equal(textureDisposed(), 0, 'sprite shared texture was disposed');
  assert.equal(materialDisposed(), 1, 'sprite material was not disposed');
  assert.equal(otherMaterialDisposed(), 0, 'other sprite material was disposed');
  assert.ok(scene.children.includes(otherSprite), 'other sprite was removed');
}

function testTransientMeshResourcesAreDeduped() {
  const scene = new THREE.Scene();
  const transient = new THREE.Group();
  const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
  const sharedMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  const first = new THREE.Mesh(sharedGeometry, sharedMaterial);
  const second = new THREE.Mesh(sharedGeometry, sharedMaterial);
  transient.add(first, new THREE.Group().add(second));

  const unrelatedGeometry = new THREE.BoxGeometry(1, 1, 1);
  const unrelatedMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff });
  const unrelated = new THREE.Mesh(unrelatedGeometry, unrelatedMaterial);
  scene.add(transient, unrelated);

  const geometryDisposed = countDisposals(sharedGeometry);
  const materialDisposed = countDisposals(sharedMaterial);
  const unrelatedGeometryDisposed = countDisposals(unrelatedGeometry);
  const unrelatedMaterialDisposed = countDisposals(unrelatedMaterial);
  releaseTransient(transient);

  assert.equal(geometryDisposed(), 1, 'shared transient geometry was disposed more than once');
  assert.equal(materialDisposed(), 1, 'shared transient material was disposed more than once');
  assert.equal(unrelatedGeometryDisposed(), 0, 'unrelated geometry was disposed');
  assert.equal(unrelatedMaterialDisposed(), 0, 'unrelated material was disposed');
  assert.ok(scene.children.includes(unrelated), 'unrelated mesh was removed');
}

testSpriteSharedResourcesSurvive();
testTransientMeshResourcesAreDeduped();
console.log('transient resource tests passed');
