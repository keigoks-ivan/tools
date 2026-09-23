// SkeletonUtils.clone() creates a Skeleton per SkinnedMesh. glTF assets often
// split one rig into body-part meshes; share the identical cloned rig within
// this root so those parts use one bone texture. Call once immediately after
// cloning, before the root is rendered.
export function shareClonedSkeletons(root) {
  const groups = new Map();
  const before = new Set();
  let merged = 0;

  root.traverse(object => {
    if (!object.isSkinnedMesh || !object.skeleton) return;
    const skeleton = object.skeleton;
    before.add(skeleton);

    const inverses = skeleton.boneInverses;
    let candidates = groups.get(inverses);
    if (!candidates) groups.set(inverses, candidates = []);
    const canonical = candidates.find(candidate =>
      candidate.bones.length === skeleton.bones.length
      && candidate.bones.every((bone, index) => bone === skeleton.bones[index]));

    if (!canonical) {
      candidates.push(skeleton);
      return;
    }
    if (canonical === skeleton) return;

    if (skeleton.boneTexture && skeleton.boneTexture !== canonical.boneTexture) {
      skeleton.dispose();
    }
    object.skeleton = canonical;
    merged++;
  });

  return { skinnedMeshes: countSkinnedMeshes(root), skeletonsBefore: before.size, merged };
}

function countSkinnedMeshes(root) {
  let count = 0;
  root.traverse(object => { if (object.isSkinnedMesh) count++; });
  return count;
}
