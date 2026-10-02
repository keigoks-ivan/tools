// Extract only the CC0 bow / two-handed clips, never meshes or textures.
// node --experimental-default-type=module --loader ./game/tests/three-loader.mjs game/scripts/import_free_motion.mjs /path/kaykit.glb /path/kaykit-melee.glb
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
globalThis.ProgressEvent = class {};
const targets = ['C_Hips','C_Spine','C_Chest','C_Head','R_UpperArm','R_LowerArm','R_Hand','L_UpperArm','L_LowerArm','L_Hand','R_UpperLeg','R_LowerLeg','R_Foot','L_UpperLeg','L_LowerLeg','L_Foot','C_WeaponGrip'];
const definitions = [
  ['bow',process.argv[2],['hips','spine','chest','head','upperarmr','lowerarmr','handr','upperarml','lowerarml','handl','upperlegr','lowerlegr','footr','upperlegl','lowerlegl','footl','handslotr'],['Ranged_Bow_Idle','Ranged_Bow_Aiming_Idle','Ranged_Bow_Draw','Ranged_Bow_Release','Ranged_Bow_Draw_Up','Ranged_Bow_Release_Up']],
  ['polearm',process.argv[3],['hips','spine','chest','head','upperarmr','lowerarmr','handr','upperarml','lowerarml','handl','upperlegr','lowerlegr','footr','upperlegl','lowerlegl','footl','handslotr'],['Melee_2H_Idle','Melee_2H_Attack_Slice','Melee_2H_Attack_Chop','Melee_2H_Attack_Spin']],
];
const result = {};
for (const [id,path,names,selected] of definitions) {
  const bytes=await readFile(path),size=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+size));
  json.meshes=[];json.nodes.forEach(n=>delete n.mesh);
  json.buffers[0].uri=`data:application/octet-stream;base64,${bytes.subarray(28+size).toString('base64')}`;
  const gltf=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
  gltf.scene.updateMatrixWorld(true);
  const bones=names.map(n=>gltf.scene.getObjectByName(n));
  if(bones.some(b=>!b))throw Error(`Missing ${id} bone`);
  const original=[];gltf.scene.traverse(n=>original.push([n,n.position.clone(),n.quaternion.clone(),n.scale.clone()]));
  const rounded=values=>values.map(v=>Number(v.toFixed(5)));
  const rest=bones.map(b=>({q:rounded(b.getWorldQuaternion(new T.Quaternion()).toArray()),p:rounded(b.getWorldPosition(new T.Vector3()).toArray())}));
  const clips={};
  for(const name of selected) {
    const clip=gltf.animations.find(c=>c.name===name);if(!clip)throw Error(`Missing ${name}`);
    const samples=clip.tracks.map(t=>{const dot=t.name.lastIndexOf('.');return [gltf.scene.getObjectByName(t.name.slice(0,dot)),t.name.slice(dot+1),t.createInterpolant()];});
    const count=Math.ceil(clip.duration*30),times=[],values=bones.map(()=>({q:[],p:[]}));
    for(let frame=0;frame<=count;frame++) {
      for(const [n,p,q,s] of original){n.position.copy(p);n.quaternion.copy(q);n.scale.copy(s);}
      const at=frame/count*clip.duration;
      for(const [bone,property,sample] of samples)bone?.[property]?.fromArray(sample.evaluate(at));
      gltf.scene.updateMatrixWorld(true);times.push(Number(at.toFixed(6)));
      bones.forEach((b,i)=>{values[i].q.push(...rounded(b.getWorldQuaternion(new T.Quaternion()).toArray()));values[i].p.push(...rounded(b.getWorldPosition(new T.Vector3()).toArray()));});
    }
    const tracks=[];
    targets.forEach((n,i)=>{tracks.push(new T.QuaternionKeyframeTrack(`J_Bip_${n}.quaternion`,times,values[i].q),new T.VectorKeyframeTrack(`J_Bip_${n}.position`,times,values[i].p));});
    clips[name]=T.AnimationClip.toJSON(new T.AnimationClip(name,clip.duration,tracks).optimize());delete clips[name].uuid;
  }
  result[id]={sha256:createHash('sha256').update(bytes).digest('hex'),bones:targets.map(n=>`J_Bip_${n}`),rest,clips};
}
await writeFile(new URL('../3d-next/free-motion-data.js',import.meta.url),'// Derived from Kay Lousberg CC0 animation assets. See assets/animations/README.md.\nexport const FREE_MOTION = '+JSON.stringify(result,(_key,value)=>typeof value==='number'?Number(value.toFixed(5)):value)+';\n');
console.log(Object.fromEntries(Object.entries(result).map(([id,v])=>[id,{sha256:v.sha256,clips:Object.keys(v.clips)}])));
