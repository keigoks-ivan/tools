import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchStaticWorld } from '../scene-optimizer.js';

const EPSILON = 1e-5;

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= EPSILON, `${message}: ${actual} !== ${expected}`);
}

function assertVectorClose(actual, expected, message) {
  assertClose(actual.x, expected.x, `${message}.x`);
  assertClose(actual.y, expected.y, `${message}.y`);
  assertClose(actual.z, expected.z, `${message}.z`);
}

function makeMesh(geometry, material, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.fromArray(position);
  return mesh;
}

function positionAt(attribute, index) {
  return new THREE.Vector3().fromBufferAttribute(attribute, index);
}

function normalAt(attribute, index) {
  return new THREE.Vector3().fromBufferAttribute(attribute, index);
}

function transformedVertices(mesh) {
  mesh.updateMatrix();
  const position = mesh.geometry.attributes.position;
  const normal = mesh.geometry.attributes.normal;
  const normalMatrix = normal
    ? new THREE.Matrix3().getNormalMatrix(mesh.matrix)
    : null;
  const vertices = [];

  for (let index = 0; index < position.count; index++) {
    const point = positionAt(position, index).applyMatrix4(mesh.matrix);
    const transformedNormal = normal
      ? normalAt(normal, index).applyMatrix3(normalMatrix).normalize()
      : null;
    vertices.push({ point, normal: transformedNormal });
  }

  return vertices;
}

function assertMergedGeometryMatchesSources(merged, sources) {
  const mergedPosition = merged.geometry.attributes.position;
  const mergedNormal = merged.geometry.attributes.normal;
  let outputIndex = 0;

  for (const source of sources) {
    const expected = transformedVertices(source);
    for (const vertex of expected) {
      assertVectorClose(
        positionAt(mergedPosition, outputIndex),
        vertex.point,
        `merged position ${outputIndex}`,
      );
      if (vertex.normal) {
        assertVectorClose(
          normalAt(mergedNormal, outputIndex),
          vertex.normal,
          `merged normal ${outputIndex}`,
        );
      }
      outputIndex++;
    }
  }

  assert.equal(outputIndex, mergedPosition.count, 'merged position count differs from sources');
}

function testTransformedGeometryBoundsAndDisposal() {
  const world = new THREE.Group();
  world.position.set(11, -4, 7);
  world.rotation.set(0.15, -0.4, 0.25);
  world.scale.set(1.5, 0.75, 2.25);

  const material = new THREE.MeshBasicMaterial({ color: 0x336699 });
  const firstGeometry = new THREE.BoxGeometry(2, 1, 3);
  const secondGeometry = new THREE.BoxGeometry(2, 1, 3);
  let firstDisposed = false;
  let secondDisposed = false;
  firstGeometry.addEventListener('dispose', () => { firstDisposed = true; });
  secondGeometry.addEventListener('dispose', () => { secondDisposed = true; });

  const first = makeMesh(firstGeometry, material, [1, 2, -3]);
  first.rotation.set(0.2, 0.35, -0.1);
  first.scale.set(1.5, 0.75, 2);
  const second = makeMesh(secondGeometry, material, [3, 1, -2]);
  second.rotation.set(-0.25, 0.15, 0.3);
  second.scale.set(0.8, 1.25, 1.4);
  world.add(first, second);
  world.updateMatrixWorld(true);

  const firstSourceGeometry = first.geometry;
  const secondSourceGeometry = second.geometry;
  const expectedVertices = [
    ...transformedVertices(first),
    ...transformedVertices(second),
  ];
  const expectedBounds = new THREE.Box3();
  for (const { point } of expectedVertices) expectedBounds.expandByPoint(point);

  const stats = batchStaticWorld(world);
  assert.equal(stats.batches, 1, 'transformed meshes should share a cell and batch');
  assert.equal(stats.before.vertices, stats.after.vertices, 'batching changed vertex totals');
  assert.equal(stats.before.triangles, stats.after.triangles, 'batching changed triangle totals');
  assert.equal(first.geometry, firstSourceGeometry, 'first source geometry was replaced');
  assert.equal(second.geometry, secondSourceGeometry, 'second source geometry was replaced');
  assert.equal(firstDisposed, false, 'first input geometry was disposed');
  assert.equal(secondDisposed, false, 'second input geometry was disposed');

  const merged = world.children.find(child => child.name.startsWith('static-batch:'));
  assert.ok(merged, 'expected transformed meshes to produce a batch');
  assertMergedGeometryMatchesSources(merged, [first, second]);
  assertVectorClose(merged.geometry.boundingBox.min, expectedBounds.min, 'merged bounds min');
  assertVectorClose(merged.geometry.boundingBox.max, expectedBounds.max, 'merged bounds max');
  assert.ok(merged.geometry.boundingSphere, 'merged bounding sphere was not computed');
  for (const { point } of expectedVertices) {
    assert.ok(
      merged.geometry.boundingSphere.distanceToPoint(point) <= 1e-4,
      'merged bounding sphere does not contain a transformed vertex',
    );
  }

  // The merged geometry is in the parent group's local space. Applying the
  // group's world transform must recover the original rendered positions.
  world.updateMatrixWorld(true);
  merged.updateMatrixWorld(true);
  const mergedPosition = merged.geometry.attributes.position;
  const expectedWorldPoint = expectedVertices[0].point.clone().applyMatrix4(world.matrixWorld);
  const actualWorldPoint = positionAt(mergedPosition, 0).applyMatrix4(merged.matrixWorld);
  assertVectorClose(actualWorldPoint, expectedWorldPoint, 'world transformed position');
}

function testEligibilityAndMaterialFiltering() {
  const world = new THREE.Group();
  const opaque = new THREE.MeshBasicMaterial({ color: 0x336699 });
  const otherOpaque = new THREE.MeshBasicMaterial({ color: 0x996633 });
  const thirdOpaque = new THREE.MeshBasicMaterial({ color: 0x663399 });
  const transparent = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.5,
  });
  const opacityOnly = new THREE.MeshBasicMaterial({ color: 0xff00ff, opacity: 0.5 });

  const eligibleA = makeMesh(new THREE.BoxGeometry(1, 1, 1), opaque, [0, 0, 0]);
  const eligibleB = makeMesh(new THREE.BoxGeometry(1, 1, 1), opaque, [2, 0, 0]);
  const differentMaterialA = makeMesh(new THREE.BoxGeometry(1, 1, 1), otherOpaque, [4, 0, 0]);
  const differentMaterialB = makeMesh(new THREE.BoxGeometry(1, 1, 1), thirdOpaque, [6, 0, 0]);
  const transparentA = makeMesh(new THREE.BoxGeometry(1, 1, 1), transparent, [8, 0, 0]);
  const transparentB = makeMesh(new THREE.BoxGeometry(1, 1, 1), transparent, [10, 0, 0]);
  const opacityA = makeMesh(new THREE.BoxGeometry(1, 1, 1), opacityOnly, [12, 0, 0]);
  const opacityB = makeMesh(new THREE.BoxGeometry(1, 1, 1), opacityOnly, [14, 0, 0]);
  const excludedA = makeMesh(new THREE.BoxGeometry(1, 1, 1), opaque, [16, 0, 0]);
  const excludedB = makeMesh(new THREE.BoxGeometry(1, 1, 1), opaque, [18, 0, 0]);
  const morphA = makeMesh(new THREE.BoxGeometry(1, 1, 1), opaque, [0, 3, 0]);
  const morphB = makeMesh(new THREE.BoxGeometry(1, 1, 1), opaque, [2, 3, 0]);
  morphA.morphTargetInfluences = [0];
  morphB.morphTargetInfluences = [0];
  const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(1, 1, 1), opaque);
  skinned.position.set(4, 3, 0);
  const callback = makeMesh(new THREE.BoxGeometry(1, 1, 1), opaque, [6, 3, 0]);
  callback.onBeforeRender = () => {};
  const negativeScale = makeMesh(new THREE.BoxGeometry(1, 1, 1), opaque, [8, 3, 0]);
  negativeScale.scale.set(-1, 1, 1);

  world.add(
    eligibleA,
    eligibleB,
    differentMaterialA,
    differentMaterialB,
    transparentA,
    transparentB,
    opacityA,
    opacityB,
    excludedA,
    excludedB,
    morphA,
    morphB,
    skinned,
    callback,
    negativeScale,
  );

  const excluded = new Set([excludedA, excludedB]);
  const stats = batchStaticWorld(world, excluded);
  assert.equal(stats.batches, 1, 'only the eligible opaque pair should batch');
  assert.equal(stats.removedMeshes, 2, 'ineligible meshes were removed');
  assert.equal(stats.before.vertices, stats.after.vertices, 'filtering changed vertex totals');
  assert.equal(stats.before.triangles, stats.after.triangles, 'filtering changed triangle totals');

  const merged = world.children.find(child => child.name.startsWith('static-batch:'));
  assert.ok(merged, 'expected eligible opaque pair to batch');
  for (const mesh of [
    differentMaterialA,
    differentMaterialB,
    transparentA,
    transparentB,
    opacityA,
    opacityB,
    excludedA,
    excludedB,
    morphA,
    morphB,
    skinned,
    callback,
    negativeScale,
  ]) {
    assert.ok(world.children.includes(mesh), `ineligible mesh ${mesh.uuid} was removed`);
  }
}

function testCellGroupingAndSceneChildren() {
  const world = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0x8844aa });

  // The first mesh's geometry is offset locally, so its transformed bounding
  // center is near x=0 even though its mesh origin is at x=-10.
  const offsetGeometry = new THREE.BoxGeometry(2, 2, 2);
  offsetGeometry.translate(10, 0, 0);
  const nearA = makeMesh(offsetGeometry, material, [-9, 0, 0]);
  nearA.rotation.y = 0.2;
  const nearB = makeMesh(new THREE.BoxGeometry(2, 2, 2), material, [2, 0, -2]);
  nearB.scale.set(1.2, 0.8, 1.1);
  const farA = makeMesh(new THREE.BoxGeometry(2, 2, 2), material, [21, 0, -2]);
  const farB = makeMesh(new THREE.BoxGeometry(2, 2, 2), material, [23, 0, -2]);

  const nested = new THREE.Group();
  const nestedMeshA = makeMesh(new THREE.BoxGeometry(1, 1, 1), material, [0, 0, 0]);
  const nestedMeshB = makeMesh(new THREE.BoxGeometry(1, 1, 1), material, [1, 0, 0]);
  nested.add(nestedMeshA, nestedMeshB);
  world.add(nearA, nearB, farA, farB, nested);

  const stats = batchStaticWorld(world);
  assert.equal(stats.batches, 2, 'meshes in distinct cells should form two batches');
  assert.equal(stats.removedMeshes, 4, 'all direct eligible meshes should be removed');
  assert.ok(world.children.includes(nested), 'nested scene group was removed');
  assert.ok(nested.children.includes(nestedMeshA), 'nested child A was unexpectedly batched');
  assert.ok(nested.children.includes(nestedMeshB), 'nested child B was unexpectedly batched');

  const batches = world.children.filter(child => child.name.startsWith('static-batch:'));
  assert.equal(batches.length, 2, 'expected one batch per occupied cell');
  assert.equal(world.children.indexOf(batches[0]), 0, 'first cell batch did not retain first source order');
  assert.equal(world.children.indexOf(batches[1]), 1, 'second cell batch did not retain source order');
  assert.equal(batches[0].geometry.attributes.position.count, 48);
  assert.equal(batches[1].geometry.attributes.position.count, 48);
}

testTransformedGeometryBoundsAndDisposal();
testEligibilityAndMaterialFiltering();
testCellGroupingAndSceneChildren();
console.log('scene optimizer tests passed');
