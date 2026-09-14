import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CELL_SIZE = 20;
const TEXTURE_CHANNEL_KEYS = [
  'map', 'aoMap', 'alphaMap', 'bumpMap', 'clearcoatMap',
  'clearcoatNormalMap', 'clearcoatRoughnessMap', 'displacementMap',
  'emissiveMap', 'envMap', 'lightMap', 'metalnessMap', 'normalMap',
  'roughnessMap', 'sheenColorMap', 'sheenRoughnessMap', 'specularColorMap',
  'specularIntensityMap', 'thicknessMap', 'transmissionMap',
];

function materialChannelKey(mesh, material) {
  const channels = [
    mesh.channel,
    mesh.userData && mesh.userData.channel,
    material.channel,
  ];

  for (const key of TEXTURE_CHANNEL_KEYS) {
    const texture = material[key];
    channels.push(texture && texture.channel);
  }

  return channels.map(channel => channel === undefined ? null : channel).join('|');
}

function attributeLayoutKey(geometry) {
  const names = Object.keys(geometry.attributes).sort();
  return names.map(name => {
    const attribute = geometry.attributes[name];
    const arrayType = attribute.array && attribute.array.constructor
      ? attribute.array.constructor.name
      : '';
    return [
      name,
      attribute.itemSize,
      attribute.normalized ? 1 : 0,
      attribute.gpuType === undefined ? -1 : attribute.gpuType,
      arrayType,
      attribute.isInterleavedBufferAttribute ? 1 : 0,
      attribute.isInterleavedBufferAttribute ? attribute.data.stride : '',
      attribute.isInterleavedBufferAttribute ? attribute.offset : '',
    ].join(':');
  }).join(';');
}

function hasMorphTargets(geometry, mesh) {
  return (mesh.morphTargetInfluences && mesh.morphTargetInfluences.length > 0)
    || !!mesh.morphTargetDictionary
    || Object.keys(geometry.morphAttributes).length !== 0;
}

function isOpaqueMaterial(material) {
  return material
    && material.transparent !== true
    && (material.opacity === undefined || material.opacity >= 1)
    && material.blending === THREE.NormalBlending
    && material.depthTest !== false
    && material.depthWrite !== false;
}

function isEligibleMesh(mesh, excludedMeshes) {
  if (!mesh || !mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh) return false;
  if (excludedMeshes.has(mesh) || mesh.visible !== true || mesh.renderOrder !== 0) return false;
  if (mesh.children.length !== 0) return false;
  if (mesh.matrixAutoUpdate) mesh.updateMatrix();
  if (mesh.matrix.determinant() < 0) return false;
  if (mesh.customDepthMaterial || mesh.customDistanceMaterial) return false;
  if (mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false;
  if (mesh.onAfterRender !== THREE.Object3D.prototype.onAfterRender) return false;
  if (!mesh.geometry || !mesh.geometry.isBufferGeometry || !mesh.geometry.attributes.position) return false;
  if (Array.isArray(mesh.material) || !isOpaqueMaterial(mesh.material)) return false;
  if (hasMorphTargets(mesh.geometry, mesh)) return false;
  // Groups are ignored by the renderer when a mesh has one material. The
  // multi-material case is excluded above; only a partial draw range needs
  // special handling because mergeGeometries() renders the whole geometry.
  const drawRange = mesh.geometry.drawRange;
  const vertexCount = mesh.geometry.attributes.position.count;
  const elementCount = mesh.geometry.index ? mesh.geometry.index.count : vertexCount;
  if (drawRange.start !== 0 || drawRange.count !== Infinity && drawRange.count !== elementCount) return false;
  return true;
}

function cellKey(mesh) {
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const center = geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrix);
  return `${Math.floor(center.x / CELL_SIZE)},${Math.floor(center.y / CELL_SIZE)},${Math.floor(center.z / CELL_SIZE)}`;
}

function countGeometry(geometry) {
  const vertices = geometry && geometry.attributes.position
    ? geometry.attributes.position.count
    : 0;
  const indices = geometry && geometry.index ? geometry.index.count : vertices;
  return { vertices, triangles: Math.floor(indices / 3) };
}

function addCounts(target, geometry) {
  const counts = countGeometry(geometry);
  target.vertices += counts.vertices;
  target.triangles += counts.triangles;
}

/**
 * Merge compatible static direct children of a world group into 20m cells.
 *
 * The input meshes' geometries are never disposed because they may be shared.
 * Only temporary transformed clones are released after a merge attempt.
 */
export function batchStaticWorld(world, excludedMeshes = new Set()) {
  if (!world || !world.isObject3D) throw new TypeError('batchStaticWorld expects an Object3D world');

  const excluded = excludedMeshes instanceof Set
    ? excludedMeshes
    : new Set(excludedMeshes || []);
  const children = world.children.slice();
  const before = { meshes: 0, drawCalls: 0, vertices: 0, triangles: 0 };
  const groups = new Map();

  for (const mesh of children) {
    if (!mesh.isMesh) continue;
    before.meshes++;
    before.drawCalls++;
    addCounts(before, mesh.geometry);

    if (!isEligibleMesh(mesh, excluded)) continue;

    const material = mesh.material;
    const key = [
      cellKey(mesh),
      material.uuid,
      materialChannelKey(mesh, material),
      mesh.castShadow ? 1 : 0,
      mesh.receiveShadow ? 1 : 0,
      mesh.layers.mask,
      mesh.frustumCulled ? 1 : 0,
      attributeLayoutKey(mesh.geometry),
      mesh.geometry.index ? 1 : 0,
    ].join('|');
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(mesh);
  }

  let batches = 0;
  let removedMeshes = 0;
  let mergedVertices = 0;
  let mergedTriangles = 0;
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;

    const source = meshes[0];
    const transformed = meshes.map(mesh => {
      if (mesh.matrixAutoUpdate) mesh.updateMatrix();
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrix);
      return geometry;
    });
    const mergedGeometry = mergeGeometries(transformed, false);

    for (const geometry of transformed) geometry.dispose();
    if (!mergedGeometry) continue;

    mergedGeometry.computeBoundingBox();
    mergedGeometry.computeBoundingSphere();
    const mergedMesh = new THREE.Mesh(mergedGeometry, source.material);
    mergedMesh.name = `static-batch:${source.material.uuid}:${batches}`;
    mergedMesh.castShadow = source.castShadow;
    mergedMesh.receiveShadow = source.receiveShadow;
    mergedMesh.layers.mask = source.layers.mask;
    mergedMesh.frustumCulled = source.frustumCulled;
    mergedMesh.renderOrder = 0;
    mergedMesh.visible = true;
    // Keep custom metadata useful to callers while avoiding references to an
    // individual source mesh that has just been removed.
    mergedMesh.userData = { ...source.userData };

    const firstIndex = Math.min(...meshes.map(mesh => world.children.indexOf(mesh)));
    for (const mesh of meshes) world.remove(mesh);
    world.add(mergedMesh);
    const appendedIndex = world.children.indexOf(mergedMesh);
    world.children.splice(appendedIndex, 1);
    world.children.splice(firstIndex, 0, mergedMesh);

    batches++;
    removedMeshes += meshes.length;
    const counts = countGeometry(mergedGeometry);
    mergedVertices += counts.vertices;
    mergedTriangles += counts.triangles;
  }

  const after = { meshes: 0, drawCalls: 0, vertices: 0, triangles: 0 };
  for (const child of world.children) {
    if (!child.isMesh) continue;
    after.meshes++;
    after.drawCalls++;
    addCounts(after, child.geometry);
  }

  return {
    before,
    after,
    batches,
    mergedMeshes: batches,
    removedMeshes,
    mergedVertices,
    mergedTriangles,
  };
}
