import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
import { createGreatswordClips } from '../3d-next/hero-motion.js';
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

const tipOf = weapon => new T.Vector3(0, 1.2, 0).applyMatrix4(weapon.matrixWorld);

test('great sword clips come from capture data without altering the source rig, and each strike peaks on its hit time', async () => {
  const gltf=await loadRig(), root=gltf.scene, bones=[]; root.traverse(b=>{if(b.isBone)bones.push(b);});
  const before=bones.map(b=>b.quaternion.toArray()), sourceTracks=gltf.animations.map(c=>c.tracks.map(t=>Array.from(t.values)));
  const clips=createGreatswordClips(T,root);
  assert.deepEqual(bones.map(b=>b.quaternion.toArray()),before);
  assert.deepEqual(gltf.animations.map(c=>c.tracks.map(t=>Array.from(t.values))),sourceTracks);
  assert.deepEqual(clips.map(c=>c.name),['azureIdle','azureRun','azureSweep','azureRise','azureSlam','azureGuard','azureUlt']);
  const equipment=createHeroEquipment(T,root,root.getObjectByName('Hero_sword')); equipment.apply(HEROES.azure);
  const mixer=new T.AnimationMixer(root), weapon=root.getObjectByName('azure_J_Bip_R_Hand_weapon'), azure=HEROES.azure;
  // The strike clocks the combat code uses; the capture is warped so the blade is fastest on the hit.
  const strikes=new Map([...azure.chain,azure.counter].map(move=>[move.clip,move])), ult=[.9,1.65,2.4,3.05];
  for (const clip of clips) {
    const move=strikes.get(clip.name); if(move) assert.equal(clip.duration,move.duration,`${clip.name}: clip and combat clock disagree`);
    if(clip.name==='azureUlt') assert.equal(clip.duration,azure.flurry.standard.duration);
    mixer.stopAllAction(); const action=mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1).play(); action.clampWhenFinished=true;
    let previousTip=null; const speed=[], previous=new Map();
    for (let frame=0;frame<=Math.round(clip.duration*120);frame++) {
      mixer.setTime(Math.min(frame/120,clip.duration-1e-5)); root.updateMatrixWorld(true); equipment.update(); root.updateMatrixWorld(true);
      const tip=tipOf(weapon); speed.push(previousTip?tip.distanceTo(previousTip)*120:0); previousTip=tip;
      // Every capture holds the sword two-handed: the left palm stays on the 34 cm grip below the right hand.
      const palm=weapon.worldToLocal(new T.Vector3(.045,-.012,.025).applyMatrix4(root.getObjectByName('J_Bip_L_Hand').matrixWorld));
      const gap=Math.hypot(palm.x,palm.z,palm.y-T.MathUtils.clamp(palm.y,-.21,-.03));
      // The landing after the leap stretches the left arm to its full reach; allow a few centimetres there.
      assert.ok(gap<(clip.name==='azureUlt'?.05:.025),`${clip.name}/${frame}: left hand left the grip (${gap.toFixed(3)} m)`);
      for(const side of ['L','R']) {
        const upper=root.getObjectByName(`J_Bip_${side}_UpperArm`);
        if(previous.has(side)) assert.ok(previous.get(side).angleTo(upper.quaternion)<.4,`${clip.name}/${frame}/${side}: arm snapped`);
        previous.set(side,upper.quaternion.clone());
        assert.ok(root.getObjectByName(`J_Bip_${side}_Foot`).getWorldPosition(new T.Vector3()).y>.075,`${clip.name}/${side}: foot below the floor`);
      }
      const hips=root.getObjectByName('J_Bip_C_Hips').position;
      assert.ok(Math.hypot(hips.x,hips.z)<.13,`${clip.name}/${frame}: capture travel dragged the hero off its mark`);
    }
    const peakAt=(from,to)=>{let best=from;for(let i=Math.round(from*120);i<=Math.min(speed.length-1,Math.round(to*120));i++)if(speed[i]>speed[Math.round(best*120)])best=i/120;return best;};
    if(move) assert.ok(Math.abs(peakAt(0,clip.duration)-move.hits[0])<.05,`${clip.name}: blade peaks at ${peakAt(0,clip.duration)}, hit at ${move.hits[0]}`);
    if(clip.name==='azureUlt') for(const hit of ult) {
      const at=peakAt(hit-.2,hit+.2); assert.ok(Math.abs(at-hit)<.08,`ultimate cut at ${hit} peaks at ${at}`);
      assert.ok(speed[Math.round(at*120)]>20,`ultimate cut at ${hit} is too slow`);
    }
  }
  equipment.dispose();
});

test('great sword clips fit the deployed relay and share the same pose on clones', async () => {
  const gltf=await loadRig(), clips=createGreatswordClips(T,gltf.scene), other=gltf.scene.clone(true);
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

test('the heavy slam swings the raised blade down to a low strike in front of the hero', async () => {
  const gltf=await loadRig(), root=gltf.scene, clips=createGreatswordClips(T,root), mixer=new T.AnimationMixer(root);
  const equipment=createHeroEquipment(T,root,root.getObjectByName('Hero_sword')); equipment.apply(HEROES.azure);
  const weapon=root.getObjectByName('azure_J_Bip_R_Hand_weapon');
  for(const [name,raised,impact] of [['azureSlam',.40,.72]]) {
    mixer.stopAllAction(); mixer.clipAction(clips.find(c=>c.name===name)).reset().setLoop(T.LoopOnce,1).play();
    mixer.setTime(raised); root.updateMatrixWorld(true); equipment.update();
    assert.ok(tipOf(weapon).y>1.6,`${name}: blade not raised overhead before the strike`);
    mixer.setTime(impact); root.updateMatrixWorld(true); equipment.update();
    const tip=tipOf(weapon); assert.ok(tip.y<1,`${name}: blade did not come down (${tip.y})`); assert.ok(tip.z>1,`${name}: strike landed behind the hero`);
  }
  // The finale leaps: the hips rise well above standing height before the 3.05 s strike.
  mixer.stopAllAction(); mixer.clipAction(clips.find(c=>c.name==='azureUlt')).reset().setLoop(T.LoopOnce,1).play();
  let top=0; for(let at=2.6;at<3.05;at+=1/60){mixer.setTime(at);root.updateMatrixWorld(true);top=Math.max(top,root.getObjectByName('J_Bip_C_Hips').position.y);}
  mixer.setTime(.2);root.updateMatrixWorld(true);const stand=root.getObjectByName('J_Bip_C_Hips').position.y;
  assert.ok(top>stand+.15,`ultimate finale does not leave the ground (${top} vs ${stand})`);
  equipment.dispose();
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

