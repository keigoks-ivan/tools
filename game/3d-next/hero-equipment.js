// Keep the animated sword's skin weights and vertex order so the existing blade sampler
// continues to follow it. Only its proportions change; the off-hand dagger follows a bone.
export function createHeroEquipment(THREE, root, sword) {
  if (!sword?.isSkinnedMesh) return { apply() {} };
  root.updateMatrixWorld(true);
  const hand = root.getObjectByName('J_Bip_R_Hand');
  const left = root.getObjectByName('J_Bip_L_Hand');
  if (!hand || !left) return { apply() {} };
  const source = sword.geometry;
  const geometry = source.clone();
  const original = source.attributes.position;
  source.computeBoundingBox();
  const span = source.boundingBox.getSize(new THREE.Vector3());
  const axis = span.x > span.y && span.x > span.z ? 0 : span.y > span.z ? 1 : 2;
  const anchor = sword.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
  root.traverse(mesh => { if (mesh.isMesh && mesh.geometry === source) { mesh.geometry = geometry; } });
  const clothes = new Map();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const material of [].concat(mesh.material)) {
      if (/Plum damask|Lavender binding|HairBack|Hair_00/i.test(material.name) && !clothes.has(material)) clothes.set(material, material.color.clone());
    }
  });
  // Reuse the authored blade and atlas for the off-hand weapon, expressed in hand-local
  // coordinates at bind pose. A rigid mesh follows the left hand without a second rig.
  const offhandGeometry = source.clone();
  offhandGeometry.applyMatrix4(hand.matrixWorld.clone().invert().multiply(sword.matrixWorld));
  offhandGeometry.scale(0.62, 0.62, 0.62);
  const dagger = new THREE.Mesh(offhandGeometry, sword.material.clone());
  dagger.frustumCulled = false;
  left.add(dagger);
  return {
    apply(profile) {
      const length = profile.id === 'azure' ? 1.18 : profile.id === 'amber' ? 0.62 : 1;
      const width = profile.id === 'azure' ? 2.8 : profile.id === 'amber' ? 0.85 : 1;
      const positions = geometry.attributes.position;
      for (let i = 0; i < original.count; i++) {
        for (let component = 0; component < 3; component++) {
          const base = anchor.getComponent(component);
          positions.setComponent(i, component, base + (original.getComponent(i, component) - base) * (component === axis ? length : width));
        }
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      for (const [material, color] of clothes) material.color.copy(color).multiply(new THREE.Color(profile.tint));
      dagger.visible = profile.id === 'amber';
    },
  };
}
