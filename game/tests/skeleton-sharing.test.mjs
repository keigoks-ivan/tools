import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { shareClonedSkeletons } from '../skeleton-sharing.js';

function makeRig(root, name) {
  const hips = new THREE.Bone();
  hips.name = `${name}_hips`;
  const chest = new THREE.Bone();
  chest.name = `${name}_chest`;
  hips.add(chest);
  root.add(hips);
  const bones = [hips, chest];
  const inverses = bones.map(() => new THREE.Matrix4());
  return { bones, inverses };
}

function addSkinnedMesh(root, name, bones, inverses) {
  const mesh = new THREE.SkinnedMesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  mesh.name = name;
  mesh.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  root.add(mesh);
  return mesh;
}

test('shares only identical cloned rigs and releases duplicate bone textures', () => {
  const source = new THREE.Group();
  const rigA = makeRig(source, 'a');
  const rigB = makeRig(source, 'b');

  addSkinnedMesh(source, 'a-body', rigA.bones, rigA.inverses);
  addSkinnedMesh(source, 'a-cloak', rigA.bones, rigA.inverses);
  addSkinnedMesh(source, 'a-other-inverses', rigA.bones, rigA.inverses.map(m => m.clone()));
  addSkinnedMesh(source, 'b-body', rigB.bones, rigA.inverses);
  const sourceMeshes = source.children.filter(child => child.isSkinnedMesh);
  const originalSkeletons = sourceMeshes.map(mesh => mesh.skeleton);

  const cloned = SkeletonUtils.clone(source);
  const meshes = [];
  cloned.traverse(object => { if (object.isSkinnedMesh) meshes.push(object); });
  assert.equal(meshes.length, 4);
  assert.notEqual(meshes[0].skeleton, meshes[1].skeleton,
    'SkeletonUtils should start with per-mesh skeleton clones');
  assert.deepEqual(meshes[0].skeleton.bones, meshes[1].skeleton.bones,
    'split meshes should point at the same cloned bones');

  const released = [];
  for (const mesh of meshes) {
    mesh.skeleton.computeBoneTexture();
    mesh.skeleton.boneTexture.addEventListener('dispose', () => released.push(mesh.name));
  }
  const stats = shareClonedSkeletons(cloned);

  assert.deepEqual(stats, { skinnedMeshes: 4, skeletonsBefore: 4, merged: 1 });
  assert.equal(meshes[0].skeleton, meshes[1].skeleton,
    'identical body-part rigs should share one skeleton');
  assert.notEqual(meshes[0].skeleton, meshes[2].skeleton,
    'a separate inverse-bind array should remain independent');
  assert.notEqual(meshes[0].skeleton, meshes[3].skeleton,
    'a different cloned bone set should remain independent');
  assert.deepEqual(released, ['a-cloak'], 'the discarded duplicate GPU texture should be disposed');
  assert.deepEqual(sourceMeshes.map(mesh => mesh.skeleton), originalSkeletons,
    'source asset skeletons should remain unchanged');
  assert.notEqual(originalSkeletons[0], originalSkeletons[1],
    'helper should not merge skeletons on the source asset');
});
