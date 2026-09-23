import { SkinnedMesh } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TRANSFORM_SUFFIX = /\.(?:position|quaternion|rotation|scale)(?:\[[^\]]+\])?$/;

// Merge only opaque skinned parts with identical draw state and an unchanged
// local transform. Call once on a loaded source scene before toonify/material
// cloning; pass its animation clips so animated mesh transforms stay separate.
export function mergeSkinnedParts(root, clips = []) {
  const animatedNodes = collectAnimatedMeshTransforms(root, clips);
  const candidates = new Map();
  const before = [];

  root.traverse(object => {
    if (!object.isSkinnedMesh) return;
    before.push(object);
    if (!canMergeMesh(object, animatedNodes)) return;

    let bySkeleton = candidates.get(object.parent);
    if (!bySkeleton) candidates.set(object.parent, bySkeleton = new Map());
    let byMaterial = bySkeleton.get(object.skeleton);
    if (!byMaterial) bySkeleton.set(object.skeleton, byMaterial = new Map());
    let byState = byMaterial.get(object.material);
    if (!byState) byMaterial.set(object.material, byState = []);

    const group = byState.find(items => compatibleGeometry(items[0].geometry, object.geometry)
      && sameBind(items[0], object)
      && sameDrawState(items[0], object));
    if (group) group.push(object);
    else byState.push([object]);
  });

  const merged = [];
  for (const bySkeleton of candidates.values()) {
    for (const byMaterial of bySkeleton.values()) {
      for (const byState of byMaterial.values()) {
        for (const meshes of byState) {
          if (meshes.length < 2) continue;
          const geometry = mergeGeometries(meshes.map(mesh => mesh.geometry));
          if (!geometry) continue;

          const combined = new SkinnedMesh(geometry, meshes[0].material);
          combined.copy(meshes[0], false);
          combined.geometry = geometry;
          combined.material = meshes[0].material;
          combined.skeleton = meshes[0].skeleton;
          combined.boundingBox = null;
          combined.boundingSphere = null;

          const parent = meshes[0].parent;
          parent.add(combined);
          for (const mesh of meshes) parent.remove(mesh);
          merged.push({ mesh: combined, sourceCount: meshes.length });
        }
      }
    }
  }

  return {
    skinnedMeshesBefore: before.length,
    skinnedMeshesAfter: before.length - merged.reduce((count, item) => count + item.sourceCount - 1, 0),
    mergedGroups: merged.length,
    mergedParts: merged.reduce((count, item) => count + item.sourceCount, 0),
  };
}

function collectAnimatedMeshTransforms(root, clips) {
  const names = new Set();
  root.traverse(object => {
    if (object.isSkinnedMesh) {
      names.add(object.name);
      names.add(object.uuid);
    }
  });

  const animated = new Set();
  for (const clip of clips) {
    for (const track of clip.tracks || []) {
      if (!TRANSFORM_SUFFIX.test(track.name)) continue;
      const target = track.name.slice(0, track.name.lastIndexOf('.'));
      if (names.has(target)) animated.add(target);
    }
  }
  return animated;
}

function canMergeMesh(mesh, animatedNodes) {
  if (!mesh.parent || mesh.children.length !== 0 || !mesh.skeleton) return false;
  if (!mesh.material || Array.isArray(mesh.material)) return false;
  if (mesh.material.transparent || mesh.material.depthWrite === false) return false;
  if (!isIdentityTransform(mesh)) return false;
  if (animatedNodes.has(mesh.name) || animatedNodes.has(mesh.uuid)) return false;
  if (mesh.morphTargetInfluences?.length || mesh.geometry.morphAttributes
    && Object.keys(mesh.geometry.morphAttributes).length) return false;
  if (!mesh.geometry?.attributes?.position || mesh.geometry.groups.length) return false;
  if (mesh.geometry.drawRange.start !== 0 || mesh.geometry.drawRange.count !== Infinity) return false;
  return Object.values(mesh.geometry.attributes).every(attribute => !attribute.isInterleavedBufferAttribute);
}

function isIdentityTransform(mesh) {
  const p = mesh.position, q = mesh.quaternion, s = mesh.scale;
  if (p.x !== 0 || p.y !== 0 || p.z !== 0
    || q.x !== 0 || q.y !== 0 || q.z !== 0 || q.w !== 1
    || s.x !== 1 || s.y !== 1 || s.z !== 1) return false;

  const e = mesh.matrix.elements;
  return e[0] === 1 && e[5] === 1 && e[10] === 1 && e[15] === 1
    && e[1] === 0 && e[2] === 0 && e[3] === 0
    && e[4] === 0 && e[6] === 0 && e[7] === 0
    && e[8] === 0 && e[9] === 0 && e[11] === 0
    && e[12] === 0 && e[13] === 0 && e[14] === 0;
}

function sameBind(a, b) {
  return a.bindMode === b.bindMode
    && sameElements(a.bindMatrix.elements, b.bindMatrix.elements)
    && sameElements(a.bindMatrixInverse.elements, b.bindMatrixInverse.elements);
}

function sameElements(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameDrawState(a, b) {
  return a.castShadow === b.castShadow
    && a.receiveShadow === b.receiveShadow
    && a.frustumCulled === b.frustumCulled
    && a.renderOrder === b.renderOrder
    && a.layers.mask === b.layers.mask
    && a.visible === b.visible
    && a.matrixAutoUpdate === b.matrixAutoUpdate
    && a.matrixWorldAutoUpdate === b.matrixWorldAutoUpdate
    && a.customDepthMaterial === b.customDepthMaterial
    && a.customDistanceMaterial === b.customDistanceMaterial
    && a.onBeforeShadow === b.onBeforeShadow
    && a.onAfterShadow === b.onAfterShadow
    && a.onBeforeRender === b.onBeforeRender
    && a.onAfterRender === b.onAfterRender
    && a.raycast === b.raycast;
}

function compatibleGeometry(a, b) {
  const aNames = Object.keys(a.attributes).sort();
  const bNames = Object.keys(b.attributes).sort();
  if (aNames.length !== bNames.length || aNames.some((name, i) => name !== bNames[i])) return false;
  if ((a.index === null) !== (b.index === null)) return false;
  if (Object.keys(a.morphAttributes).length || Object.keys(b.morphAttributes).length) return false;
  if (a.morphTargetsRelative !== b.morphTargetsRelative) return false;

  return aNames.every(name => {
    const aa = a.attributes[name], ba = b.attributes[name];
    return aa.array.constructor === ba.array.constructor
      && aa.itemSize === ba.itemSize
      && aa.normalized === ba.normalized
      && aa.usage === ba.usage
      && aa.gpuType === ba.gpuType;
  });
}
