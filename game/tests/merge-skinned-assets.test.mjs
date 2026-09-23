import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeSkinnedParts } from '../merge-skinned-parts.js';
import { shareClonedSkeletons } from '../skeleton-sharing.js';

const assetRoot = new URL('../assets/runtime/', import.meta.url);
const assetNames = [
  'Skeleton_Minion.glb', 'Skeleton_Warrior.glb', 'Barbarian.glb', 'Knight.glb', 'Rogue.glb',
];
const expectedMeshesAfter = new Map([
  ['Skeleton_Minion.glb', 2], ['Skeleton_Warrior.glb', 2],
  ['Barbarian.glb', 1], ['Knight.glb', 1], ['Rogue.glb', 1],
]);

for (const assetName of assetNames) {
  test(`${assetName}: real loader meshes merge with buffers and animation pose preserved`, async () => {
    const bytes = await readFile(fileURLToPath(new URL(assetName, assetRoot)));
    const { gltf } = await parseWithoutImages(bytes);
    const originalMeshes = [];
    gltf.scene.traverse(object => { if (object.isSkinnedMesh) originalMeshes.push(object); });
    const originalClips = [...gltf.animations];
    const originalTrackNames = originalClips.flatMap(clip => clip.tracks.map(track => track.name));
    const originalsByMaterial = groupBy(originalMeshes, mesh => mesh.material);
    const snapshots = new Map(originalMeshes.map(mesh => [mesh, snapshotGeometry(mesh.geometry)]));
    const beforeCounts = originalMeshes.length;

    const stats = mergeSkinnedParts(gltf.scene, gltf.animations);
    const mergedMeshes = [];
    gltf.scene.traverse(object => { if (object.isSkinnedMesh) mergedMeshes.push(object); });
    assert.equal(mergedMeshes.length, expectedMeshesAfter.get(assetName));
    assert.equal(stats.skinnedMeshesBefore, beforeCounts);
    assert.equal(stats.skinnedMeshesAfter, mergedMeshes.length);
    assert.ok(stats.mergedGroups > 0, 'runtime asset must use the qualified merge path');
    assert.deepEqual(gltf.animations, originalClips, 'the animation clip objects remain intact');
    assert.deepEqual(gltf.animations.flatMap(clip => clip.tracks.map(track => track.name)), originalTrackNames);

    for (const [material, sourceMeshes] of originalsByMaterial) {
      const merged = mergedMeshes.find(mesh => mesh.material === material);
      assert.ok(merged, `${assetName}: merged material ${material.name} is retained`);
      assert.ok(sourceMeshes.every(mesh => mesh.skeleton === merged.skeleton),
        `${assetName}: all merged parts must share the original rig`);
      assertMergedBuffers(sourceMeshes, snapshots, merged.geometry);
    }

    const clip = originalClips.find(candidate => candidate.duration > 0 && candidate.tracks.length > 0);
    assert.ok(clip, 'asset has animation clips');
    const mixer = new (await import('three')).AnimationMixer(gltf.scene);
    mixer.clipAction(clip).play();
    mixer.update(Math.min(0.25, clip.duration * 0.5));
    gltf.scene.updateMatrixWorld(true);
    for (const skeleton of new Set(mergedMeshes.map(mesh => mesh.skeleton))) skeleton.update();
    assertAnimatedVerticesMatch(originalMeshes, snapshots, mergedMeshes);

    const clonedScene = SkeletonUtils.clone(gltf.scene);
    shareClonedSkeletons(clonedScene);
    const clonedMeshes = [];
    clonedScene.traverse(object => { if (object.isSkinnedMesh) clonedMeshes.push(object); });
    const clonedMixer = new THREE.AnimationMixer(clonedScene);
    clonedMixer.clipAction(clip).play();
    clonedMixer.update(Math.min(0.25, clip.duration * 0.5));
    clonedScene.updateMatrixWorld(true);
    for (const skeleton of new Set(clonedMeshes.map(mesh => mesh.skeleton))) skeleton.update();
    assert.equal(clonedMeshes.length, mergedMeshes.length, 'clone retains the merged skinned mesh layout');
    for (const merged of mergedMeshes) {
      const cloned = clonedMeshes.find(mesh => mesh.material.name === merged.material.name);
      assert.ok(cloned, `clone retains material ${merged.material.name}`);
      assert.deepEqual(cloned.skeleton.boneMatrices, merged.skeleton.boneMatrices,
        'cloned rig evaluates the same animation pose');
    }
  });
}

function groupBy(items, getKey) {
  const groups = new Map();
  for (const item of items) {
    const key = getKey(item);
    let group = groups.get(key);
    if (!group) groups.set(key, group = []);
    group.push(item);
  }
  return groups;
}

function snapshotGeometry(geometry) {
  const attributes = {};
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    attributes[name] = {
      array: Array.from(attribute.array),
      itemSize: attribute.itemSize,
      normalized: attribute.normalized,
    };
  }
  return {
    attributes,
    index: geometry.index ? Array.from(geometry.index.array) : null,
  };
}

function assertMergedBuffers(sourceMeshes, snapshots, mergedGeometry) {
  const names = Object.keys(snapshots.get(sourceMeshes[0]).attributes).sort();
  assert.deepEqual(Object.keys(mergedGeometry.attributes).sort(), names);
  let vertexOffset = 0;
  const expectedIndices = [];
  for (const sourceMesh of sourceMeshes) {
    const snapshot = snapshots.get(sourceMesh);
    for (const name of names) {
      const attribute = mergedGeometry.attributes[name];
      assert.equal(attribute.itemSize, snapshot.attributes[name].itemSize, `attribute layout ${name}`);
      assert.equal(attribute.normalized, snapshot.attributes[name].normalized, `attribute normalization ${name}`);
      const start = vertexOffset * attribute.itemSize;
      const actual = Array.from(attribute.array.slice(start, start + snapshot.attributes[name].array.length));
      assert.deepEqual(actual, snapshot.attributes[name].array, `original ${name} values remain byte-exact`);
    }
    if (snapshot.index) {
      expectedIndices.push(...snapshot.index.map(index => index + vertexOffset));
    }
    vertexOffset += snapshot.attributes.position.array.length / 3;
  }
  if (expectedIndices.length) assert.deepEqual(Array.from(mergedGeometry.index.array), expectedIndices);
}

function assertAnimatedVerticesMatch(originalMeshes, snapshots, mergedMeshes) {
  const groups = groupBy(originalMeshes, mesh => `${mesh.skeleton.uuid}:${mesh.material.uuid}`);
  const vector = new THREE.Vector3();
  for (const sourceMeshes of groups.values()) {
    const merged = mergedMeshes.find(mesh => mesh.skeleton === sourceMeshes[0].skeleton
      && mesh.material === sourceMeshes[0].material);
    assert.ok(merged);
    let vertexOffset = 0;
    for (const sourceMesh of sourceMeshes) {
      const positions = snapshots.get(sourceMesh).attributes.position.array;
      for (let i = 0; i < positions.length / 3; i++) {
        sourceMesh.getVertexPosition(i, vector);
        merged.getVertexPosition(vertexOffset + i, _actual);
        assert.equal(_actual.x, vector.x, 'deformed x coordinate is identical');
        assert.equal(_actual.y, vector.y, 'deformed y coordinate is identical');
        assert.equal(_actual.z, vector.z, 'deformed z coordinate is identical');
      }
      vertexOffset += positions.length / 3;
    }
  }
}

const _actual = new THREE.Vector3();

async function parseWithoutImages(glbBytes) {
  const stripped = stripImagesAndMaterialTextures(glbBytes);
  const arrayBuffer = stripped.buffer.slice(stripped.byteOffset, stripped.byteOffset + stripped.byteLength);
  const gltf = await new Promise((resolve, reject) => {
    new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
  });
  return { gltf };
}

function stripImagesAndMaterialTextures(input) {
  const bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67, 'GLB magic');
  assert.equal(view.getUint32(4, true), 2, 'GLB version');
  const chunks = [];
  let offset = 12;
  while (offset < bytes.length) {
    const size = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const data = bytes.slice(offset + 8, offset + 8 + size);
    chunks.push({ type, data });
    offset += 8 + size;
  }

  const jsonChunk = chunks.find(chunk => chunk.type === 0x4e4f534a);
  assert.ok(jsonChunk, 'GLB JSON chunk');
  const json = JSON.parse(new TextDecoder().decode(jsonChunk.data));
  json.images = [];
  json.textures = [];
  json.samplers = [];
  json.extensionsUsed = (json.extensionsUsed || []).filter(extension => extension !== 'EXT_texture_webp');
  json.extensionsRequired = (json.extensionsRequired || []).filter(extension => extension !== 'EXT_texture_webp');
  for (const material of json.materials || []) stripTextureProperties(material);

  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = new Uint8Array((encoded.length + 3) & ~3).fill(0x20);
  jsonPadded.set(encoded);
  chunks[chunks.indexOf(jsonChunk)] = { type: jsonChunk.type, data: jsonPadded };
  const length = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const result = new Uint8Array(length);
  const resultView = new DataView(result.buffer);
  resultView.setUint32(0, 0x46546c67, true);
  resultView.setUint32(4, 2, true);
  resultView.setUint32(8, length, true);
  offset = 12;
  for (const chunk of chunks) {
    resultView.setUint32(offset, chunk.data.length, true);
    resultView.setUint32(offset + 4, chunk.type, true);
    result.set(chunk.data, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return result;
}

function stripTextureProperties(value) {
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (/texture$/i.test(key)) delete value[key];
    else stripTextureProperties(value[key]);
  }
}
