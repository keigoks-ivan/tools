import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
import { createDualBladeClips } from '../3d-next/hero-motion.js';
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


test('dual-blade clips are distinct captures whose fastest hand lands on every hit, and the ultimate crosses both blades at 2.35 s', async () => {
  const gltf=await loadRig(), root=gltf.scene, bones=[]; root.traverse(b=>{if(b.isBone)bones.push(b);});
  const before=bones.map(b=>b.quaternion.toArray());
  const clips=createDualBladeClips(T,root), mixer=new T.AnimationMixer(root), amber=HEROES.amber;
  assert.deepEqual(bones.map(b=>b.quaternion.toArray()),before);
  const moves=[...amber.chain,...amber.charges,amber.heavy,amber.counter];
  // Six chain cuts use six different clips, so a long combo never repeats a swing.
  assert.equal(new Set(amber.chain.map(move=>move.clip)).size,6);
  for(const move of moves) assert.ok(clips.some(c=>c.name===move.clip&&c.duration===move.duration),`${move.clip}: missing or off the combat clock`);
  const ult=clips.find(c=>c.name==='amberUlt'); assert.equal(ult.duration,amber.flurry.standard.duration);
  const beats=[...Array.from({length:8},(_,i)=>.38+i*(2.05-.38)/7),amber.flurry.standard.impact];
  for(const clip of clips) {
    mixer.stopAllAction(); mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1).play();
    const speed=[], last={}, arm={};
    for(let frame=0;frame<=Math.round(clip.duration*120);frame++) {
      mixer.setTime(Math.min(frame/120,clip.duration-1e-5)); root.updateMatrixWorld(true); let fastest=0;
      for(const side of ['L','R']) {
        const hand=root.getObjectByName(`J_Bip_${side}_Hand`).getWorldPosition(new T.Vector3());
        if(last[side]) fastest=Math.max(fastest,hand.distanceTo(last[side])*120); last[side]=hand;
        const upper=root.getObjectByName(`J_Bip_${side}_UpperArm`).quaternion.clone();
        // The backflip return runs about three times faster than the capture.
        if(arm[side]) assert.ok(arm[side].angleTo(upper)<(clip.name==='amberFlip'?.5:.4),`${clip.name}/${frame}/${side}: arm snapped`); arm[side]=upper;
        assert.ok(root.getObjectByName(`J_Bip_${side}_Foot`).getWorldPosition(new T.Vector3()).y>.085,`${clip.name}/${frame}/${side}: foot below the floor`);
      }
      speed.push(fastest);
      const hips=root.getObjectByName('J_Bip_C_Hips').position;
      assert.ok(Math.hypot(hips.x,hips.z)<.13,`${clip.name}: capture travel dragged the hero off its mark`);
    }
    const hits=clip===ult?beats:moves.find(move=>move.clip===clip.name).hits;
    for(const hit of hits) {
      let best=Math.round(hit*120); for(let i=Math.round((hit-.09)*120);i<=Math.min(speed.length-1,Math.round((hit+.09)*120));i++) if(speed[i]>speed[best]) best=i;
      assert.ok(speed[best]>6,`${clip.name}@${hit}: no strike near the hit (${speed[best].toFixed(1)} m/s at ${best/120})`);
    }
  }
  // The finale is a two-handed cross: both hands are moving fast together at the impact.
  mixer.stopAllAction(); mixer.clipAction(ult).reset().setLoop(T.LoopOnce,1).play();
  const at=t=>{mixer.setTime(t);root.updateMatrixWorld(true);return ['L','R'].map(s=>root.getObjectByName(`J_Bip_${s}_Hand`).getWorldPosition(new T.Vector3()));};
  const [l0,r0]=at(amber.flurry.standard.impact-.04), [l1,r1]=at(amber.flurry.standard.impact);
  assert.ok(l0.distanceTo(l1)/.04>4 && r0.distanceTo(r1)/.04>4,'cross-cut finale does not swing both blades');
  const packet=JSON.parse(encodeState({x:0,y:0,z:0,yaw:0,character:'amber',anim:'amberCounter',time:.2,loop:false,musou:2.35},100));
  assert.ok(packet.d.a.length<=24); assert.equal(decodeState(packet.d).anim,'amberCounter');
});
