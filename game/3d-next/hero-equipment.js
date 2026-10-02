import { createArmSolver } from './hero-motion.js?v=20261002k';
import { createHeroArt } from './hero-art.js?v=20261002k';

// Keep the animated sword's skin weights and vertex order so the existing blade sampler
// continues to follow it. Visible weapons and clothing are authored in hero-art.js.
export function createHeroEquipment(THREE, root, sword) {
  if (!sword?.isSkinnedMesh) return { ready: Promise.resolve(), apply() {}, update() {}, dispose() {} };
  root.updateMatrixWorld(true);
  const hand = root.getObjectByName('J_Bip_R_Hand');
  const left = root.getObjectByName('J_Bip_L_Hand');
  if (!hand || !left) return { ready: Promise.resolve(), apply() {}, update() {}, dispose() {} };
  const source = sword.geometry;
  const geometry = source.clone();
  const original = source.attributes.position;
  source.computeBoundingBox();
  const span = source.boundingBox.getSize(new THREE.Vector3());
  const axis = span.x > span.y && span.x > span.z ? 0 : span.y > span.z ? 1 : 2;
  const anchor = sword.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
  root.traverse(mesh => { if (mesh.isMesh && mesh.geometry === source) { mesh.geometry = geometry; } });
  const solveLeft=createArmSolver(THREE,root,'L'),target=new THREE.Vector3(),offset=new THREE.Vector3(),pole=new THREE.Vector3(),shoulder=new THREE.Vector3();
  const rotation=new THREE.Quaternion(),mountInverse=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0))).invert();
  const flip=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI);
  let activeId='violet';
  const art = createHeroArt(THREE, root, sword);
  return {
    ready: art.ready,
    update() {
      if(activeId==='azure') {
        const weapon=root.getObjectByName('azure_J_Bip_R_Hand_weapon');
        if(weapon) {
          weapon.updateWorldMatrix(true,false);weapon.getWorldQuaternion(rotation);rotation.multiply(mountInverse).multiply(flip);
          target.set(0,.40,0);weapon.localToWorld(target);target.sub(offset.set(.045,-.012,.025).applyQuaternion(rotation));
          root.getObjectByName('J_Bip_L_UpperArm').getWorldPosition(shoulder);
          root.getObjectByName('J_Bip_L_LowerArm').getWorldPosition(pole);pole.sub(shoulder);
          solveLeft(target,pole,rotation);
        }
      }
      art.update();
    },
    dispose() { art.dispose(); geometry.dispose(); },
    apply(profile) {
      activeId=profile.id;solveLeft.reset();
      const length = profile.id === 'azure' ? 1.8 : profile.id === 'amber' ? 0.62 : 1;
      const width = profile.id === 'azure' ? 1 : profile.id === 'amber' ? 0.85 : 1;
      const positions = geometry.attributes.position;
      for (let i = 0; i < original.count; i++) {
        for (let component = 0; component < 3; component++) {
          const base = anchor.getComponent(component);
          positions.setComponent(i, component, base + (original.getComponent(i, component) - base) * (component === axis ? length : width));
        }
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      art.apply(profile);
    },
  };
}
