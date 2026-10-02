import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
import { createArcherClips, createComboPreview } from '../3d-next/hero-motion.js';
import { createHeroEquipment } from '../3d-next/hero-equipment.js';
import { HEROES } from '../3d-next/heroes.js';
import { encodeState, decodeState } from '../3d-next/net/protocol.js';
import { createArrowFx } from '../3d-next/hero-bow.js';
import { cleanState } from '../../workers/coop-relay/src/logic.js';
import { createHeroSpecialFx } from '../3d-next/hero-special-fx.js';

async function loadRig() {
  globalThis.ProgressEvent = class { constructor(type, init) { Object.assign(this, init); } };
  const bytes = await readFile(new URL('../assets/heroes/swordswoman-v4.glb', import.meta.url));
  const size = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20,20+size).toString());
  const strip = value => { for (const k of Object.keys(value)) { if (/texture$/i.test(k)) delete value[k]; else if (value[k] && typeof value[k] === 'object') strip(value[k]); } };
  json.materials.forEach(strip); json.images=[]; json.textures=[];
  json.buffers[0].uri=`data:application/octet-stream;base64,${bytes.subarray(28+size).toString('base64')}`;
  return new GLTFLoader().parseAsync(JSON.stringify(json),'');
}

test('every arrow is drawn to the cheek and loosed on its hit time, without altering the source rig', async () => {
  const gltf=await loadRig(), root=gltf.scene, bones=[];root.traverse(b=>{if(b.isBone)bones.push(b);});
  const original=bones.map(b=>b.quaternion.toArray()), tracks=gltf.animations.map(c=>c.tracks.map(t=>Array.from(t.values)));
  const clips=createArcherClips(T,root), mixer=new T.AnimationMixer(root);
  assert.deepEqual(bones.map(b=>b.quaternion.toArray()),original);assert.deepEqual(gltf.animations.map(c=>c.tracks.map(t=>Array.from(t.values))),tracks);
  assert.equal(clips.length,11);
  const equipment=createHeroEquipment(T,root,root.getObjectByName('Hero_sword'));equipment.apply(HEROES.jade);
  const string=root.getObjectByName('jade_bow_string'), arrow=root.getObjectByName('jade_nocked_arrow'), stringGeometry=string.geometry;
  const hand=root.getObjectByName('J_Bip_R_Hand'), head=root.getObjectByName('J_Bip_C_Head'), drawn=()=>new T.Vector3().fromBufferAttribute(string.geometry.attributes.position,1);
  const moves=[...HEROES.jade.chain,...HEROES.jade.charges,HEROES.jade.counter,HEROES.jade.air];
  for(const clip of clips) {
    const move=moves.find(move=>move.clip===clip.name);
    if(move)assert.equal(clip.duration,move.duration,'animation and release clock disagree');
    mixer.stopAllAction();const action=mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1).play();action.clampWhenFinished=true;
    const previous=new Map();
    for(let frame=0;frame<=Math.round(clip.duration*120);frame++) {
      mixer.setTime(Math.min(clip.duration-1e-5,frame/120));root.updateMatrixWorld(true);equipment.update();
      if(['jadeIdle','jadeRun'].includes(clip.name)) {
        assert.ok(!arrow.visible,`${clip.name}: carrying the bow accidentally nocks an arrow`);
        assert.ok(Math.abs(drawn().z+.04)<.005,`${clip.name}: carrying the bow pulls the string`);
      }
      for(const side of ['L','R']) {
        const upper=root.getObjectByName(`J_Bip_${side}_UpperArm`);
        if(previous.has(side))assert.ok(previous.get(side).angleTo(upper.quaternion)<.4,`${clip.name}/${frame}/${side}: arm snapped`);
        previous.set(side,upper.quaternion.clone());
        assert.ok(root.getObjectByName(`J_Bip_${side}_Foot`).getWorldPosition(new T.Vector3()).y>.08,`${clip.name}/${side}: foot below the floor`);
      }
      const hips=root.getObjectByName('J_Bip_C_Hips').position;
      assert.ok(Math.hypot(hips.x,hips.z)<.13,`${clip.name}: capture travel dragged the hero off its mark`);
    }
    const shots=move?move.hits:clip.name==='jadeUlt'?[.65,2.75]:[];
    for(const hit of shots) {
      mixer.setTime(hit-.02);root.updateMatrixWorld(true);equipment.update();
      assert.ok(arrow.visible,`${clip.name}@${hit}: no arrow nocked at full draw`);
      assert.ok(drawn().z<-.40,`${clip.name}@${hit}: string not drawn (${drawn().z})`);
      assert.ok(drawn().distanceTo(arrow.position)<.01,`${clip.name}@${hit}: arrow nock leaves the string`);
      assert.ok(hand.getWorldPosition(new T.Vector3()).distanceTo(head.getWorldPosition(new T.Vector3()))<.2,`${clip.name}@${hit}: drawing hand misses the cheek anchor`);
      mixer.setTime(hit+.04);root.updateMatrixWorld(true);equipment.update();
      assert.ok(!arrow.visible,`${clip.name}@${hit}: arrow still on the string after release`);
      assert.ok(Math.abs(drawn().z+.04)<.005,`${clip.name}@${hit}: released string does not snap back`);
    }
    assert.equal(string.geometry,stringGeometry,'string geometry allocated during animation');
  }
  // The ultimate's first volley rises toward the sky; ordinary shots fly level.
  for(const [name,at,low,high] of [['jadeUlt',.6,.35,.9],['jadeShot',.22,-.15,.15]]) {
    mixer.stopAllAction();mixer.clipAction(clips.find(c=>c.name===name)).reset().play();mixer.setTime(at);root.updateMatrixWorld(true);
    const aim=root.getObjectByName('J_Bip_L_Hand').getWorldPosition(new T.Vector3()).sub(hand.getWorldPosition(new T.Vector3())).normalize();
    assert.ok(aim.z>.5&&aim.y>low&&aim.y<high,`${name}: aim ${aim.toArray()}`);
  }
  mixer.stopAllAction();const roll=gltf.animations.find(c=>c.name==='roll');
  mixer.clipAction(roll).reset().setLoop(T.LoopOnce,1).play();
  for(let at=0;at<roll.duration;at+=1/120){
    mixer.setTime(at);root.updateMatrixWorld(true);equipment.update();
    assert.ok(!arrow.visible,'rolling accidentally nocks an arrow');
    assert.ok(Math.abs(drawn().z+.04)<.005,'rolling pulls the bow string');
  }
  equipment.dispose();
});

test('all archer poses and ultimate clocks pass the deployed relay sanitizer',async()=>{
  const gltf=await loadRig();
  for(const clip of [...createArcherClips(T,gltf.scene,gltf.animations),gltf.animations.find(c=>c.name==='roll')]) {
    const packet=JSON.parse(encodeState({character:'jade',anim:clip.name,musou:2.9,time:clip.duration*.5,x:0,y:0,z:0,yaw:0},42));
    assert.ok(packet.d.a.length<=24);const decoded=decodeState(cleanState(packet.d));
    assert.equal(decoded.character,'jade');assert.equal(decoded.anim,clip.name);assert.equal(decoded.musou,2.9);
  }
});

test('flying arrows and emerald ultimate reuse bounded pools and dispose all scene objects',()=>{
  const scene=new T.Scene(),arrows=createArrowFx(T,scene,()=>0,{capacity:16}),initial=scene.children.slice();
  for(let i=0;i<100;i++)arrows.onEvent({type:'arrow',id:i,x:640,y:500,facing:0,range:500,speed:1500,pierce:1});
  assert.equal(arrows.stats().active,16);assert.deepEqual(scene.children,initial);
  arrows.update(.1,[]);assert.equal(arrows.stats().active,0);arrows.dispose();assert.equal(scene.children.length,0);
  const fx=createHeroSpecialFx(T,scene,()=>0);fx.setStyle('jade');const count=scene.children.length;
  fx.onEvent({type:'musouFinish',radius:460,facing:0},new T.Vector3());
  assert.ok(scene.children.some(mesh=>mesh.visible&&mesh.material.color.g>mesh.material.color.r));
  for(let i=0;i<40;i++){fx.onEvent({type:'swing',flurry:true,radius:420,index:i},new T.Vector3());fx.update(.03);}
  assert.equal(scene.children.length,count);fx.update(2);assert.equal(fx.stats().active,0);fx.dispose();assert.equal(scene.children.length,0);
});


test('the four-stage preview matches combat cancels and keeps joints continuous through every blend',async()=>{
  const gltf=await loadRig(),root=gltf.scene,clips=createArcherClips(T,root,gltf.animations),clip=createComboPreview(T,clips,HEROES.jade);
  const expected=HEROES.jade.chain.reduce((sum,move)=>sum+(Number.isFinite(move.cancel)?move.cancel:move.duration),0);
  assert.equal(clip.duration,expected);
  const mixer=new T.AnimationMixer(root),action=mixer.clipAction(clip).setLoop(T.LoopOnce,1).play();action.clampWhenFinished=true;
  const previous=new Map();
  for(let frame=0;frame<=Math.ceil(clip.duration*120);frame++) {
    mixer.setTime(Math.min(clip.duration,frame/120));root.updateMatrixWorld(true);
    for(const side of ['L','R']) {
      const joint=root.getObjectByName(`J_Bip_${side}_UpperArm`);
      if(previous.has(side))assert.ok(previous.get(side).angleTo(joint.quaternion)<.4,`${frame}/${side}: combo transition snapped`);
      previous.set(side,joint.quaternion.clone());
      assert.ok(root.getObjectByName(`J_Bip_${side}_Foot`).getWorldPosition(new T.Vector3()).y>=.087,'combo blend penetrated the floor');
    }
  }
});
