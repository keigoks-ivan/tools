import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
import { createPolearmClips, createDualBladeUltimate } from '../3d-next/hero-motion.js';
import { createHeroEquipment } from '../3d-next/hero-equipment.js';
import { HEROES } from '../3d-next/heroes.js';
import { encodeState, decodeState } from '../3d-next/net/protocol.js';
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

test('polearm clips keep both palms on the shaft without elbow flips or altering the source rig', async () => {
  const gltf=await loadRig(), root=gltf.scene, bones=[]; root.traverse(b=>{if(b.isBone)bones.push(b);});
  const before=bones.map(b=>b.quaternion.toArray());
  const sourceTracks=gltf.animations.map(c=>c.tracks.map(t=>Array.from(t.values)));
  const clips=createPolearmClips(T,root,gltf.animations);
  assert.deepEqual(bones.map(b=>b.quaternion.toArray()),before);
  assert.deepEqual(gltf.animations.map(c=>c.tracks.map(t=>Array.from(t.values))),sourceTracks);
  assert.equal(clips.length,7);
  const equipment=createHeroEquipment(T,root,root.getObjectByName('Hero_sword')); equipment.apply(HEROES.azure);
  const mixer=new T.AnimationMixer(root), weapon=root.getObjectByName('azure_J_Bip_R_Hand_weapon');
  for (const clip of clips) {
    mixer.stopAllAction(); const action=mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1).play(); action.clampWhenFinished=true;
    const previous=new Map();
    for (let frame=0;frame<=Math.ceil(clip.duration*120);frame++) {
      mixer.setTime(Math.min(clip.duration,frame/120)); root.updateMatrixWorld(true);
      const origin=weapon.getWorldPosition(new T.Vector3()), shaft=new T.Vector3(0,1,0).transformDirection(weapon.matrixWorld);
      for(const side of ['L','R']) {
        const hand=root.getObjectByName(`J_Bip_${side}_Hand`), upper=root.getObjectByName(`J_Bip_${side}_UpperArm`), lower=root.getObjectByName(`J_Bip_${side}_LowerArm`);
        const palm=hand.getWorldPosition(new T.Vector3()).add(new T.Vector3(side==='R'?-.045:.045,-.012,.025).applyQuaternion(hand.getWorldQuaternion(new T.Quaternion())));
        const relative=palm.sub(origin);
        assert.ok(Math.abs(relative.dot(shaft)-(side==='L'?.40:0))<.015,`${clip.name}/${frame}/${side}: grip slid along the shaft`);
        assert.ok(relative.cross(shaft).length()<.012,`${clip.name}/${frame}/${side}: palm left the shaft`);
        const a=upper.getWorldPosition(new T.Vector3()),b=lower.getWorldPosition(new T.Vector3()),c=hand.getWorldPosition(new T.Vector3());
        assert.ok(a.distanceTo(c)<(a.distanceTo(b)+b.distanceTo(c))*.995,`${clip.name}/${side}: locked elbow`);
        if(previous.has(side)) assert.ok(previous.get(side).angleTo(upper.quaternion)<.4,`${clip.name}/${frame}/${side}: elbow flipped`);
        previous.set(side,upper.quaternion.clone());
      }
    }
  }
  // Sample the actual early-cancel windows, including both crossfades. A
  // transition may relax the grip slightly, but must not fling a hand off it.
  mixer.stopAllAction(); let current = null;
  const sequence = [['azureIdle',.3],['azureSweep',HEROES.azure.chain[0].cancel],['azureRise',HEROES.azure.chain[1].cancel],['azureSlam',HEROES.azure.chain[2].duration],['azureIdle',.3]];
  for (const [index,[name,duration]] of sequence.entries()) {
    const action=mixer.clipAction(clips.find(c=>c.name===name));
    if(current&&current!==action)current.fadeOut(.14);
    action.reset().setEffectiveWeight(1).setLoop(T.LoopOnce,1).fadeIn(.14).play(); action.clampWhenFinished=true; current=action;
    for(let t=0;t<duration;t+=1/120) {
      mixer.update(1/120);root.updateMatrixWorld(true);if(index===0&&t<.14)continue;
      const hand=root.getObjectByName('J_Bip_L_Hand'), origin=weapon.getWorldPosition(new T.Vector3()),shaft=new T.Vector3(0,1,0).transformDirection(weapon.matrixWorld);
      const palm=hand.getWorldPosition(new T.Vector3()).add(new T.Vector3(.045,-.012,.025).applyQuaternion(hand.getWorldQuaternion(new T.Quaternion())));
      assert.ok(palm.sub(origin).cross(shaft).length()<.025,`${name}: grip lost during combo blend`);
    }
  }
  equipment.dispose();
});

test('authored polearm clips and ultimate clock fit the deployed relay and share the same pose on clones', async () => {
  const gltf=await loadRig(), clips=createPolearmClips(T,gltf.scene,gltf.animations), other=gltf.scene.clone(true);
  const a=new T.AnimationMixer(gltf.scene), b=new T.AnimationMixer(other);
  for (const clip of clips) {
    const packet=JSON.parse(encodeState({x:0,y:0,z:0,yaw:0,character:'azure',anim:clip.name,time:clip.duration*.57,loop:false,musou:3.05},123));
    assert.ok(packet.d.a.length<=24); assert.match(packet.d.a,/^[\w-]{1,24}$/);
    const state=decodeState(packet.d); assert.equal(state.anim,clip.name); assert.equal(state.musou,3.05);
    a.stopAllAction(); b.stopAllAction(); a.clipAction(clip).reset().play(); b.clipAction(clip).reset().play();
    a.setTime(state.time); b.setTime(state.time);
    for(const side of ['L','R']) for(const joint of ['UpperArm','LowerArm','Hand']) assert.deepEqual(gltf.scene.getObjectByName(`J_Bip_${side}_${joint}`).quaternion.toArray(),other.getObjectByName(`J_Bip_${side}_${joint}`).quaternion.toArray());
  }
});

test('ultimate silhouettes and warm/cold palettes stay distinct and pool geometry is reused through repeated casts', () => {
  const scene=new T.Scene(), fx=createHeroSpecialFx(T,scene,()=>0), pos=new T.Vector3();
  const initial=new Set(scene.children.map(o=>o));
  let compiled=false; fx.warm({ compile(s) { compiled=true; assert.equal(s.children.filter(o=>o.visible).length,2); } },new T.PerspectiveCamera());
  assert.ok(compiled); assert.equal(fx.stats().active,0);
  const styles=[];
  for(const style of ['azure','amber']) {
    fx.setStyle(style);fx.onEvent({type:'musouFinish',radius:450,facing:1},pos);
    const visible=scene.children.filter(o=>o.visible);
    assert.ok(visible.length>30);
    assert.ok(visible.some(o=>style==='azure'?o.geometry.type==='BufferGeometry'&&o.material.isMeshStandardMaterial:o.geometry.type==='ShapeGeometry'));
    const colored=visible.filter(o=>o.material.isMeshBasicMaterial).map(o=>o.material.color);
    assert.ok(colored.some(c=>style==='azure'?c.b>c.r*2:c.r>c.b*2));
    styles.push(new Set(visible.map(o=>o.geometry)));
    for(let i=0;i<30;i++){fx.onEvent({type:'musouStart',finishRadius:450,facing:1},pos);fx.onEvent({type:'swing',flurry:true,index:i%8,radius:400,facing:1,from:{x:700,y:500}},pos);fx.update(.03);}
    assert.equal(scene.children.length,initial.size); assert.ok(fx.stats().active<=96);
    fx.update(3); assert.equal(fx.stats().active,0);
  }
  assert.ok([...styles[0]].some(g=>!styles[1].has(g)));
  fx.dispose(); assert.equal(scene.children.length,0);
});

test('amber ultimate keeps grounded footwork through all eight cuts and the cross-cut finale', async () => {
  const gltf=await loadRig(), root=gltf.scene, clip=createDualBladeUltimate(T,root,gltf.animations), mixer=new T.AnimationMixer(root);
  assert.equal(clip.duration,HEROES.amber.flurry.standard.duration);
  const action=mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1).play();action.clampWhenFinished=true;
  const previous=new Map();
  for(let frame=0;frame<=336;frame++) {
    mixer.setTime(frame/120);root.updateMatrixWorld(true);
    for(const side of ['L','R']) {
      const upper=root.getObjectByName(`J_Bip_${side}_UpperArm`), hand=root.getObjectByName(`J_Bip_${side}_Hand`), foot=root.getObjectByName(`J_Bip_${side}_Foot`);
      assert.ok(hand.getWorldPosition(new T.Vector3()).toArray().every(Number.isFinite));
      assert.ok(foot.getWorldPosition(new T.Vector3()).y<.2,`${side}: unexpected kick`);
      if(previous.has(side))assert.ok(previous.get(side).angleTo(upper.quaternion)<.5,`${frame}/${side}: discontinuous cut`);
      previous.set(side,upper.quaternion.clone());
    }
  }
  const packet=JSON.parse(encodeState({x:0,y:0,z:0,yaw:0,character:'amber',anim:clip.name,time:2.35,loop:false,musou:2.35},100));
  assert.ok(packet.d.a.length<=24); assert.equal(decodeState(packet.d).anim,'amberUlt');
});


test('azure strikes transfer weight over planted staggered feet with flexed knees and a closed supporting hand', async () => {
  const gltf=await loadRig(), root=gltf.scene;
  const finger=root.getObjectByName('J_Bip_L_Index2'), open=finger.quaternion.clone();
  const clips=createPolearmClips(T,root,gltf.animations), mixer=new T.AnimationMixer(root);
  for(const clip of clips.filter(c=>c.name!=='azureRun')) {
    mixer.stopAllAction(); const action=mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1).play(); action.clampWhenFinished=true;
    const feet=new Map(); let minHip=Infinity,maxHip=-Infinity;
    for(let frame=0;frame<=Math.ceil(clip.duration*120);frame++) {
      mixer.setTime(Math.min(clip.duration,frame/120)); root.updateMatrixWorld(true);
      const hips=root.getObjectByName('J_Bip_C_Hips');minHip=Math.min(minHip,hips.position.y);maxHip=Math.max(maxHip,hips.position.y);
      for(const side of ['R','L']) {
        const upper=root.getObjectByName(`J_Bip_${side}_UpperLeg`), lower=root.getObjectByName(`J_Bip_${side}_LowerLeg`), foot=root.getObjectByName(`J_Bip_${side}_Foot`);
        const pos=foot.getWorldPosition(new T.Vector3());
        if(!feet.has(side))feet.set(side,pos.clone());
        assert.ok(feet.get(side).distanceTo(pos)<.003,`${clip.name}/${frame}/${side}: foot slid or lifted`);
        const a=upper.getWorldPosition(new T.Vector3()),b=lower.getWorldPosition(new T.Vector3());
        assert.ok(a.distanceTo(pos)<(a.distanceTo(b)+b.distanceTo(pos))*.98,`${clip.name}/${side}: knee locked`);
      }
      assert.ok(finger.quaternion.angleTo(open)>.8,`${clip.name}: supporting fingers remained open`);
    }
    const separation=feet.get('L').clone().sub(feet.get('R'));
    assert.ok(Math.abs(separation.x-.38)<.003 && Math.abs(separation.z-.30)<.003,`${clip.name}: stance is not staggered`);
    if(['azureSweep','azureRise','azureSlam','azureUlt'].includes(clip.name))assert.ok(maxHip-minHip>.015,`${clip.name}: pelvis did not transfer weight`);
  }
});
