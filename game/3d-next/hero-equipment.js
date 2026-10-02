import { createHeroArt } from './hero-art.js?v=20261002m';

// Moves a captured arm's hand onto a nearby target with the smallest change: the elbow bends
// for the new reach, then the whole arm swings by the shortest arc. Unlike a full two-bone
// solve it never picks a new elbow plane, so a straight arm cannot flip its twist.
function nudgeArm(T, [upper, lower, hand], target, handWorld, scratch) {
  const [s, e, h, n, a, b] = scratch.v, [qu, ql, qp, q] = scratch.q;
  upper.getWorldPosition(s); lower.getWorldPosition(e); hand.getWorldPosition(h);
  const la = s.distanceTo(e), lb = e.distanceTo(h), now = s.distanceTo(h), want = Math.min(s.distanceTo(target), (la + lb) * .999);
  const interior = d => Math.acos(T.MathUtils.clamp((la * la + lb * lb - d * d) / (2 * la * lb), -1, 1));
  n.crossVectors(a.subVectors(e, s), b.subVectors(h, e));
  if (n.lengthSq() > 1e-10) {
    n.normalize(); lower.getWorldQuaternion(ql); upper.getWorldQuaternion(qu);
    ql.premultiply(q.setFromAxisAngle(n, interior(now) - interior(want)));
    lower.quaternion.copy(qu.invert().multiply(ql)); lower.updateMatrixWorld(true);
  }
  hand.getWorldPosition(h);
  upper.getWorldQuaternion(qu); upper.parent.getWorldQuaternion(qp);
  qu.premultiply(q.setFromUnitVectors(a.subVectors(h, s).normalize(), b.subVectors(target, s).normalize()));
  upper.quaternion.copy(qp.invert().multiply(qu)); upper.updateMatrixWorld(true);
  lower.getWorldQuaternion(ql); hand.quaternion.copy(ql.invert().multiply(handWorld)); hand.updateMatrixWorld(true);
}

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
  const target=new THREE.Vector3(),palm=new THREE.Vector3(),
    leftArm=['UpperArm','LowerArm','Hand'].map(name=>({bone:root.getObjectByName(`J_Bip_L_${name}`),captured:new THREE.Quaternion()})),
    scratch={v:Array.from({length:6},()=>new THREE.Vector3()),q:Array.from({length:4},()=>new THREE.Quaternion())},offset=new THREE.Vector3();
  const rotation=new THREE.Quaternion();
  let activeId='violet';
  const art = createHeroArt(THREE, root, sword);
  return {
    ready: art.ready,
    update() {
      if(activeId==='azure') {
        // The capture already holds the great sword two-handed; only settle the left palm onto
        // the grip where it lies, so retargeted arm lengths (up to ~13 cm off) do not leave a gap.
        // A hand the capture takes clearly away from the grip is eased back to its captured pose.
        const weapon=root.getObjectByName('azure_J_Bip_R_Hand_weapon');
        if(weapon) {
          weapon.updateWorldMatrix(true,false);left.getWorldQuaternion(rotation);
          palm.set(.045,-.012,.025).applyMatrix4(left.matrixWorld);
          target.copy(palm);weapon.worldToLocal(target);
          const along=THREE.MathUtils.clamp(target.y,-.21,-.03);
          const gap=Math.hypot(target.x,target.z,target.y-along), hold=1-THREE.MathUtils.smoothstep(gap,.2,.3);
          if(hold>0) {
            // Palm centre on the grip's centre line, as the right hand is mounted.
            target.set(0,along,0);weapon.localToWorld(target);
            target.sub(offset.set(.045,-.012,.025).applyQuaternion(rotation));
            for(const joint of leftArm)joint.captured.copy(joint.bone.quaternion);
            nudgeArm(THREE,leftArm.map(joint=>joint.bone),target,rotation,scratch);
            // Ease between the captured arm and the settled grip so letting go never pops.
            if(hold<1){for(const joint of leftArm)joint.bone.quaternion.slerpQuaternions(joint.captured,joint.bone.quaternion,hold);leftArm[0].bone.updateMatrixWorld(true);}
          }
        }
      }
      art.update();
    },
    dispose() { art.dispose(); geometry.dispose(); },
    apply(profile) {
      activeId=profile.id;
      const length = profile.id === 'azure' ? 1.5 : profile.id === 'amber' ? 0.62 : 1;
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
