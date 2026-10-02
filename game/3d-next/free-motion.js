import { FREE_MOTION } from './free-motion-data.js?v=20261002j';

// Retarget world-space rotations through the bind poses, then correct the
// weapon grips with the character's own limb lengths in hero-motion.js.
export function createFreeMotionSampler(T, root, kind) {
  const data=FREE_MOTION[kind], rest=new Map(), parent=new T.Quaternion(), desired=new T.Quaternion();
  root.updateMatrixWorld(true);
  for(const name of data.bones) {
    const bone=root.getObjectByName(name);
    if(bone)rest.set(name,{bone,q:bone.getWorldQuaternion(new T.Quaternion())});
  }
  const clips=new Map(Object.entries(data.clips).map(([name,json])=>[name,T.AnimationClip.parse(json)]));
  const samples=new Map([...clips].map(([name,clip])=>[name,new Map(clip.tracks.map(track=>[track.name,track.createInterpolant()]))]));
  const sourceRest=data.rest.map(r=>new T.Quaternion().fromArray(r.q).normalize().invert());
  const point=new T.Vector3(),sourceHip=new T.Vector3();
  const scale=root.getObjectByName('J_Bip_L_LowerArm').position.length()+root.getObjectByName('J_Bip_L_Hand').position.length();
  const armScale=scale/new T.Vector3().fromArray(data.rest[data.bones.indexOf('J_Bip_L_UpperArm')].p).distanceTo(new T.Vector3().fromArray(data.rest[data.bones.indexOf('J_Bip_L_Hand')].p));
  return {
    duration(name){return clips.get(name).duration;},
    apply(name,time,weight=1){
      const sample=samples.get(name);
      for(const [i,boneName] of data.bones.entries()) {
        if(!rest.has(boneName))continue;
        const {bone,q}=rest.get(boneName);
        desired.fromArray(sample.get(`${boneName}.quaternion`).evaluate(time)).normalize().multiply(sourceRest[i]).multiply(q);
        bone.parent.getWorldQuaternion(parent).invert();desired.premultiply(parent);
        bone.quaternion.slerp(desired,weight);bone.updateMatrixWorld(true);
      }
    },
    rotation(name,time,boneName,out){return out.fromArray(samples.get(name).get(`${boneName}.quaternion`).evaluate(time)).normalize();},
    position(name,time,boneName,out){
      const sample=samples.get(name);
      point.fromArray(sample.get(`${boneName}.position`).evaluate(time));
      sourceHip.fromArray(sample.get('J_Bip_C_Hips.position').evaluate(time));
      return out.copy(point).sub(sourceHip).multiplyScalar(armScale).add(root.getObjectByName('J_Bip_C_Hips').getWorldPosition(new T.Vector3()));
    },
  };
}
