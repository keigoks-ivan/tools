import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { mergeSkinnedParts } from '../merge-skinned-parts.js';

function makeGeometry(offset = 0) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    offset, 0, 0, offset + 1, 0, 0, offset, 1, 0,
  ], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 0, 1, 0, 0, 1,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  geometry.setIndex([0, 1, 2]);
  return geometry;
}

function fixture() {
  const root = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = 'hips';
  root.add(bone);
  const skeleton = new THREE.Skeleton([bone], [new THREE.Matrix4()]);
  const material = new THREE.MeshToonMaterial({ color: 0x8899aa });
  const meshes = [];
  for (let i = 0; i < 2; i++) {
    const mesh = new THREE.SkinnedMesh(makeGeometry(i * 2), material);
    mesh.name = `part-${i}`;
    mesh.bind(skeleton, new THREE.Matrix4());
    root.add(mesh);
    meshes.push(mesh);
  }
  root.updateMatrixWorld(true);
  return { root, skeleton, material, meshes };
}

test('merges only same-rig same-material opaque parts and preserves skin attributes', () => {
  const { root, skeleton, material, meshes } = fixture();
  const originalPosition = [...meshes[0].geometry.attributes.position.array,
    ...meshes[1].geometry.attributes.position.array];
  const expectedWeights = [...meshes[0].geometry.attributes.skinWeight.array,
    ...meshes[1].geometry.attributes.skinWeight.array];

  const stats = mergeSkinnedParts(root);
  const skinned = [];
  root.traverse(object => { if (object.isSkinnedMesh) skinned.push(object); });

  assert.deepEqual(stats, {
    skinnedMeshesBefore: 2,
    skinnedMeshesAfter: 1,
    mergedGroups: 1,
    mergedParts: 2,
  });
  assert.equal(skinned.length, 1);
  assert.equal(skinned[0].skeleton, skeleton);
  assert.equal(skinned[0].material, material);
  assert.deepEqual([...skinned[0].geometry.attributes.position.array], originalPosition);
  assert.deepEqual([...skinned[0].geometry.attributes.skinWeight.array], expectedWeights);
  assert.deepEqual([...skinned[0].geometry.index.array], [0, 1, 2, 3, 4, 5]);
});

test('leaves animated, transformed, transparent, and mismatched-skeleton parts untouched', () => {
  const { root, meshes } = fixture();
  const differentRig = new THREE.Skeleton([new THREE.Bone()], [new THREE.Matrix4()]);
  const separate = new THREE.SkinnedMesh(makeGeometry(4), meshes[0].material);
  separate.name = 'separate-rig';
  separate.bind(differentRig, new THREE.Matrix4());
  root.add(separate);

  const transformed = new THREE.SkinnedMesh(makeGeometry(6), meshes[0].material);
  transformed.name = 'transformed';
  transformed.bind(meshes[0].skeleton, new THREE.Matrix4());
  transformed.position.x = 2;
  root.add(transformed);

  const transparentMaterial = new THREE.MeshToonMaterial({ transparent: true });
  const transparent = new THREE.SkinnedMesh(makeGeometry(8), transparentMaterial);
  transparent.name = 'transparent';
  transparent.bind(meshes[0].skeleton, new THREE.Matrix4());
  root.add(transparent);

  const stats = mergeSkinnedParts(root, [{ tracks: [{ name: 'part-0.position' }] }]);
  assert.equal(stats.mergedGroups, 0);
  assert.equal(stats.skinnedMeshesAfter, 5);
  assert.equal(meshes[0].parent, root);
  assert.equal(meshes[1].parent, root);
});

test('leaves children and geometry groups untouched', () => {
  const { root, meshes } = fixture();
  meshes[0].add(new THREE.Group());
  meshes[1].geometry.addGroup(0, 3, 0);

  const stats = mergeSkinnedParts(root);
  assert.equal(stats.mergedGroups, 0);
  assert.equal(stats.skinnedMeshesAfter, 2);
});
