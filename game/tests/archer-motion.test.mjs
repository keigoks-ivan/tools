import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
import { createArcherClips } from '../3d-next/hero-motion.js';
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

test('bow draw and release retain stable joints and do not modify the source rig', async () => {
  const gltf=await loadRig(), root=gltf.scene, bones=[];root.traverse(b=>{if(b.isBone)bones.push(b);});
  const original=bones.map(b=>b.quaternion.toArray()), tracks=gltf.animations.map(c=>c.tracks.map(t=>Array.from(t.values)));
  const clips=createArcherClips(T,root,gltf.animations), mixer=new T.AnimationMixer(root);
  assert.deepEqual(bones.map(b=>b.quaternion.toArray()),original);assert.deepEqual(gltf.animations.map(c=>c.tracks.map(t=>Array.from(t.values))),tracks);
  assert.equal(clips.length,11);
  const equipment=createHeroEquipment(T,root,root.getObjectByName('Hero_sword'));equipment.apply(HEROES.jade);
  const bow=root.getObjectByName('jade_J_Bip_L_Hand_weapon');
  const string=root.getObjectByName('jade_bow_string'), arrow=root.getObjectByName('jade_nocked_arrow'), stringGeometry=string.geometry;
  for(const clip of clips) {
    mixer.stopAllAction();const action=mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1).play();action.clampWhenFinished=true;
    const previous=new Map(), planted=new Map();
    let stepHeight=0;
    for(let frame=0;frame<=Math.ceil(clip.duration*120);frame++) {
      mixer.setTime(Math.min(clip.duration,frame/120));root.updateMatrixWorld(true);equipment.update();
      if(['jadeIdle','jadeRun','jadeStep'].includes(clip.name)) {
        assert.ok(!arrow.visible,`${clip.name}: carrying the bow accidentally nocks an arrow`);
        assert.ok(Math.abs(string.geometry.attributes.position.getZ(1)+.04)<.005,`${clip.name}: carrying the bow pulls the string`);
      }
      for(const side of ['L','R']) {
        const upper=root.getObjectByName(`J_Bip_${side}_UpperArm`),hand=root.getObjectByName(`J_Bip_${side}_Hand`);
        assert.ok(hand.getWorldPosition(new T.Vector3()).toArray().every(Number.isFinite));
        if(previous.has(side))assert.ok(previous.get(side).angleTo(upper.quaternion)<.4,`${clip.name}/${frame}/${side}: elbow flip`);
        previous.set(side,upper.quaternion.clone());
        if(clip.name==='jadeStep') {
          const foot=root.getObjectByName(`J_Bip_${side}_Foot`).getWorldPosition(new T.Vector3());
          stepHeight=Math.max(stepHeight,foot.y);
          if(frame===0)planted.set(side,foot.clone());
          if(frame===Math.ceil(clip.duration*120))assert.ok(foot.distanceTo(planted.get(side))<.003,'step does not return to its landing stance');
          const time=Math.min(clip.duration,frame/120),dodge=HEROES.jade.dodge;
          if(time>dodge.moveStart && time<dodge.moveEnd)assert.ok(foot.y>.095,'dodge travels while its foot is planted');
        }
        if(!['jadeRun','jadeStep'].includes(clip.name)) {
          const foot=root.getObjectByName(`J_Bip_${side}_Foot`).getWorldPosition(new T.Vector3());
          if(planted.has(side))assert.ok(foot.distanceTo(planted.get(side))<.003,`${clip.name}/${side}: planted foot moved`);else planted.set(side,foot);
        }
      }
    }
    if(clip.name==='jadeStep')assert.ok(stepHeight>.22,'evasive step never leaves the ground');
    const move=[...HEROES.jade.chain,...HEROES.jade.charges,HEROES.jade.counter,HEROES.jade.air].find(move=>move.clip===clip.name);
    if(move)assert.equal(clip.duration,move.duration,'animation and release clock disagree');
    if(clip.name==='jadeShot'){
      action.reset().setLoop(T.LoopOnce,1).play();mixer.setTime(HEROES.jade.chain[0].hits[0]-.02); root.updateMatrixWorld(true);equipment.update();
      assert.ok(arrow.visible);const position=string.geometry.attributes.position;
      const drawn=new T.Vector3().fromBufferAttribute(position,1);assert.ok(drawn.z<-.30);
      assert.ok(drawn.distanceTo(arrow.position)<.01,'arrow nock leaves the string');
      const hand=root.getObjectByName('J_Bip_R_Hand'),head=root.getObjectByName('J_Bip_C_Head'),elbow=root.getObjectByName('J_Bip_R_LowerArm');
      assert.ok(hand.getWorldPosition(new T.Vector3()).distanceTo(head.getWorldPosition(new T.Vector3()))<.12,'drawing hand misses the cheek anchor');
      assert.ok(elbow.getWorldPosition(new T.Vector3()).y<head.getWorldPosition(new T.Vector3()).y+.07,'drawing elbow rises above the head');
      mixer.setTime(HEROES.jade.chain[0].hits[0]+.04);root.updateMatrixWorld(true);equipment.update();assert.ok(!arrow.visible);
      assert.ok(Math.abs(string.geometry.attributes.position.getZ(1)+.04)<.005,'released string does not snap back');
      assert.equal(string.geometry,stringGeometry,'string geometry allocated during animation');
    }
  }
  equipment.dispose();
});

test('all archer poses and ultimate clocks pass the deployed relay sanitizer',async()=>{
  const gltf=await loadRig();
  for(const clip of createArcherClips(T,gltf.scene,gltf.animations)) {
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
