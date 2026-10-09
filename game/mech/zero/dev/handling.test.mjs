import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ViewModel, WEAPONS } from '../viewmodel.js';
import { ResponsiveHandling, HANDLING_PROFILES } from '../handling.mjs';

const V=()=>new THREE.Vector3(),idle={ads:false,fire:false},player=()=>({yaw:.4,pitch:.1,grounded:true,moveK:0,crouchK:0,sprintK:0,vel:V()});
function fixture(profile='classic'){
  const vm=Object.create(ViewModel.prototype),calls=[];
  const gun=kind=>{const model=new THREE.Group(),mag=new THREE.Group();model.add(mag);model.userData={mag,magHome:new THREE.Vector3(0,-.04,.3),scopeY:.09,sightY:.1,
    gripR:new THREE.Vector3(-.027,-.025,kind==='pistol'?-.105:.225),gripL:new THREE.Vector3(.07,-.055,kind==='pistol'?-.045:.46),muzzle:new THREE.Vector3(0,0,kind==='pistol'?.18:.7),
    glowBase:new THREE.Color(.2,.8,1),glow:{color:new THREE.Color()},ammoBar:[],ammoInstances:{instanceColor:{needsUpdate:false},setColorAt(){}}};return model;};
  const grip=Object.fromEntries(['R','L','RD','RS','LD','LS'].map(k=>[k,V()]));
  Object.assign(vm,{cur:'smg',g:{rifle:gun('rifle'),pistol:gun('pistol'),smg:gun('smg')},holder:new THREE.Group(),arms:{root:new THREE.Group(),grip,update(){calls.push('hands');}},
    audio:new Proxy({},{get:(_o,k)=>()=>calls.push(k)}),fx:{},ammo:Object.fromEntries(Object.entries(WEAPONS).map(([k,w])=>[k,w.mag])),cd:0,reloadT:-1,swapT:-1,swapTo:null,nadeT:-1,nadeGo:false,
    bloom:{rifle:0,pistol:0,smg:0},spreadNow:0,ads:0,adsWant:false,scoped:false,heat:0,kick:V(),kickV:V(),rot:V(),rotV:V(),sway:new THREE.Vector2(),bobT:0,t:0,sprintK:0,landK:0,breath:1,holding:false,lastTrigger:false});
  for(const model of Object.values(vm.g))vm.holder.add(model);vm.setHandlingProfile(profile);
  return {vm,p:player(),calls};
}
function step(vm,p,seconds,c=idle,look={x:0,y:0},fps=60){for(let i=0;i<Math.round(seconds*fps);i++)vm.update(1/fps,c,p,look);}

test('classic keeps original ADS duration, swap timing and per-frame sway math',()=>{
  const {vm,p}=fixture();vm.update(.1,{ads:true,fire:false},p,{x:.03,y:-.02});assert.equal(vm.ads,.5);assert.equal(vm.handling,null);
  assert(Math.abs(vm.sway.x-(-.03*1.6)*(1-Math.exp(-1)))<1e-12);
  vm.swap('pistol');vm.update(.23,idle,p,{x:0,y:0});assert.equal(vm.cur,'smg');vm.update(.01,idle,p,{x:0,y:0});assert.equal(vm.cur,'pistol');assert(vm.busy);
  vm.update(.33,idle,p,{x:0,y:0});assert(vm.busy);vm.update(.02,idle,p,{x:0,y:0});assert.equal(vm.busy,false);
});
test('responsive ADS reaches a stable sight position earlier and exits cleanly',()=>{
  const quick=fixture('responsive'),classic=fixture();step(quick.vm,quick.p,.15,{ads:true,fire:false});step(classic.vm,classic.p,.15,{ads:true,fire:false});
  assert.equal(quick.vm.ads,1);assert(classic.vm.ads<.8);assert(Math.abs(quick.vm.holder.position.x)<.003);
  step(quick.vm,quick.p,.13);assert.equal(quick.vm.ads,0);assert.equal(quick.vm.handlingProfile,HANDLING_PROFILES.responsive);
});
test('turn response and return to center agree at 30, 60 and 120 FPS',()=>{
  const result=[];
  for(const fps of [30,60,120]){
    const h=new ResponsiveHandling();for(let i=0;i<fps/2;i++)h.update(1/fps,{x:2/fps,y:-1/fps});
    assert(h.yaw.x<-.03&&h.pitch.x<-.015);const peak={yaw:h.yaw.x,pitch:h.pitch.x};
    for(let i=0;i<fps/2;i++)h.update(1/fps);assert(Math.abs(h.yaw.x)<.00001);assert(Math.abs(h.pitch.x)<.00001);result.push(peak);
  }
  assert(Math.max(...result.map(p=>p.yaw))-Math.min(...result.map(p=>p.yaw))<1e-9);
});
test('extreme mouse turns are bounded and ADS reduces residual motion below a tenth degree',()=>{
  const h=new ResponsiveHandling();for(let i=0;i<100;i++)h.update(1/60,{x:2,y:-2});
  const hip=h.pose(0),ads=h.pose(1);assert(Math.abs(hip.yaw)<=.060001);assert(Math.abs(hip.pitch)<=.045001);assert(Math.abs(hip.side)<.01);
  assert(Math.abs(ads.yaw)<THREE.MathUtils.degToRad(.1));assert(Math.abs(ads.pitch)<THREE.MathUtils.degToRad(.1));
});
test('each responsive shot produces immediate visible lift and a controlled return',()=>{
  for(const fps of [30,60,120]){
    const {vm,p}=fixture('responsive');const shot=vm.update(1/fps,{fire:true,ads:false},p,{x:0,y:0});
    assert(shot);assert(vm.holder.position.z>-.095,'recoil remained imperceptible');assert(vm.holder.rotation.x<-.012,'muzzle did not visibly lift');
    step(vm,p,.5,idle,{x:0,y:0},fps);assert(Math.abs(vm.holder.rotation.x)<.00001);assert(vm.handling.back.x<.00001);
  }
});
test('sustained fire is bounded and visual handling never changes bullet cadence or spread',()=>{
  const responsive=fixture('responsive'),classic=fixture(),shots=[[],[]],fixtures=[responsive,classic];
  for(let frame=0;frame<60;frame++)fixtures.forEach(({vm,p},i)=>{const shot=vm.update(1/60,{fire:true,ads:false},p,{x:0,y:0});if(shot)shots[i].push({frame,spread:shot.spread,W:shot.W});});
  assert.deepEqual(shots[0],shots[1]);assert(shots[0].length>=10);assert(responsive.vm.handling.lift.x<=HANDLING_PROFILES.responsive.recoilPitchLimit);
  assert(Math.abs(responsive.vm.holder.rotation.x)<.08);assert.equal(responsive.p.yaw,.4);assert.equal(responsive.p.pitch,.1);
});
test('responsive swap exchanges the model at 160 ms and is ready after 400 ms',()=>{
  const {vm,p}=fixture('responsive');vm.swap('pistol');vm.update(.15,idle,p,{x:0,y:0});assert.equal(vm.cur,'smg');assert(vm.busy);
  vm.update(.02,idle,p,{x:0,y:0});assert.equal(vm.cur,'pistol');assert(vm.busy);vm.update(.22,idle,p,{x:0,y:0});assert(vm.busy);vm.update(.02,idle,p,{x:0,y:0});assert.equal(vm.busy,false);
});
test('running and stopping ease the weapon pose without an abrupt bob reset',()=>{
  const {vm,p}=fixture('responsive');p.moveK=p.sprintK=1;step(vm,p,.5);assert(vm.sprintK>.99);assert(vm.handling.moveWeight>.99);
  p.moveK=p.sprintK=0;vm.update(1/60,idle,p,{x:0,y:0});assert(vm.handling.moveWeight>.75);assert(vm.sprintK>.7);
  step(vm,p,.5);assert(vm.handling.moveWeight<.002);assert(vm.sprintK<.001);
});
test('hand grip targets and world muzzle stay finite across turn, ADS, reload, sprint and swap',()=>{
  const {vm,p,calls}=fixture('responsive'),camera=new THREE.PerspectiveCamera(72,1,.01,100);camera.position.set(2,1.6,3);camera.rotation.set(.2,.6,0);camera.updateMatrixWorld(true);
  for(const c of [{...idle},{...idle,ads:true},{...idle,reload:true},{...idle,swapTo:'pistol'}]){
    if(c.reload)vm.ammo[vm.cur]-=5;
    for(let i=0;i<30;i++){
      vm.update(1/60,c,p,{x:.022,y:.01});const muzzle=vm.muzzleWorld(camera);
      assert(muzzle.toArray().every(Number.isFinite));assert(vm.holder.matrixWorld.elements.every(Number.isFinite));
      for(const key of ['R','L','RD','RS','LD','LS'])assert(vm.arms.grip[key].toArray().every(Number.isFinite));
    }
  }
  assert(calls.includes('hands'));
});
test('profile reset removes stale turn, recoil and movement while preserving ammunition',()=>{
  const {vm,p}=fixture('responsive');vm.update(1/60,{...idle,fire:true},p,{x:.04,y:.02});const ammo=vm.ammo.smg;vm.resetHandling();
  assert.equal(vm.handling.yaw.x,0);assert.equal(vm.handling.back.x,0);assert.equal(vm.sway.length(),0);assert.equal(vm.ammo.smg,ammo);
  assert.throws(()=>vm.setHandlingProfile('unknown'));vm.setHandlingProfile('classic');assert.equal(vm.handling,null);
});
