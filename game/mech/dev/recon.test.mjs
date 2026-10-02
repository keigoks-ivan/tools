import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Contacts, Scout } from '../zero/recon.js';
import { HUD } from '../zero/hud.js';
import { Solid } from '../zero/kit.js';
const V = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
function fixture() {
  const G = { scene:new T.Scene(), player:{pos:V(),vel:V(),yaw:0,eyeH:1.6,dead:false}, vm:{busy:false}, hud:{note(){}}, solid:{sees:()=>true,pushOut:()=>false,floorAt:()=>0,ray:()=>null}, enemies:[] };
  return G;
}
test('radar only acquires in-frame visible enemies and keeps an unmoving last known contact through walls', () => {
  const G=fixture(),camera=new T.PerspectiveCamera(72,1,.05,400);camera.position.set(0,1.6,0);camera.lookAt(0,1.6,10);camera.updateMatrixWorld();
  const front={id:1,pos:V(0,0,20),type:'trooper'},behind={id:2,pos:V(0,0,-10)},outside={id:3,pos:V(20,0,8)};G.enemies.push(front,behind,outside);
  const C=new Contacts();C.update(.25,G,camera);assert.deepEqual([...C.items.keys()],[1]);
  G.solid.sees=()=>false;front.pos.x=8;C.update(1,G,camera);assert.equal(C.items.get(1).p.x,0);assert(!C.items.get(1).fresh);
  C.update(15,G,camera);assert.equal(C.items.size,0);
});
test('radar removes defeated actors but does not reveal previously unseen reinforcements', () => {
  const C=new Contacts(),G=fixture(),e={id:1,pos:V()};C.reveal(e,0);G.enemies=[{...e,dead:true},{id:2,pos:V(5,0,5)}];C.update(.01,G,{});assert.equal(C.items.size,0);
});
test('scout movement respects collision, altitude and tether; battery depletion returns control', () => {
  const G=fixture(),S=new Scout(G);assert(S.toggle());const body=G.player.pos.clone();const start=S.pos.clone();
  S.update(.1,{my:1,up:true});assert(S.pos.z>start.z&&S.pos.y>start.y);assert.deepEqual(G.player.pos.toArray(),body.toArray());
  const p=S.pos.clone();G.solid.ray=()=>({t:.1});S.update(.1,{my:1});assert.deepEqual(S.pos.toArray(),p.toArray());G.solid.ray=()=>null;
  S.pos.set(0,24,0);S.update(.1,{up:true});assert.equal(S.pos.y,24);
  S.pos.set(0,2,84.9);S.update(.1,{my:1});assert.equal(S.pos.z,84.9);
  S.battery=.01;S.update(.1,{});assert(!S.active);assert(!S.root.visible);assert.equal(S.battery,0);
});
test('an attack returns the scout immediately, with a redeployment cooldown and a single lightweight model', () => {
  const G=fixture(),S=new Scout(G);assert(S.toggle());S.attacked();assert(!S.active);assert(S.reason.includes('主角遭到攻擊'));assert(!S.toggle());S.update(3);assert(S.toggle());
  const meshes=[];S.root.traverse(o=>{if(o.isMesh)meshes.push(o);});assert.equal(meshes.length,5);const root=S.root;const before=G.scene.children.length;S.reset();assert.equal(S.root,root);assert.equal(G.scene.children.length,before);assert(!S.active);
  assert(meshes.reduce((n,m)=>n+(m.geometry.index?.count||m.geometry.attributes.position.count)/3*(m.count||1),0)<1500);
});
test('scout A/D strafe follows screen left/right at every heading', () => {
  for (const yaw of [0, .7, Math.PI / 2, Math.PI, -2]) for (const mx of [-1, 1]) {
    const G=fixture(),S=new Scout(G),camera=new T.PerspectiveCamera(72,1,.05,400);camera.rotation.order='YXZ';G.player.yaw=yaw;assert(S.toggle());S.camera(camera);
    const right=V().setFromMatrixColumn(camera.matrixWorld,0),start=S.pos.clone();S.update(.1,{mx});
    assert(S.pos.clone().sub(start).dot(right)*mx>.69,`heading ${yaw}, input ${mx}`);
  }
});
test('radar detects an exposed animated chest when the head is hidden, without seeing through cover', () => {
  const G=fixture(),camera=new T.PerspectiveCamera(72,1,.05,400);camera.position.set(0,3,0);camera.lookAt(0,1,20);camera.updateMatrixWorld();
  const head=V(0,1,20),chest=V(0,.65,20),e={id:1,pos:V(0,0,20),type:'trooper',s:{headPos:out=>out.copy(head),chestPos:out=>out.copy(chest)}};G.enemies=[e];
  G.solid=new Solid();G.solid.add({x0:-1,x1:1,y0:.9,y1:1.6,z0:19.5,z1:20.5});
  const C=new Contacts();C.update(.25,G,camera);assert(C.items.has(1),'visible chest acquires crouched enemy');
  C.reset();G.solid.add({x0:-2,x1:2,y0:0,y1:5,z0:8,z1:9});C.update(.25,G,camera);assert.equal(C.items.size,0,'fully hidden enemy stays unknown');
});
test('radar detects enemies at the visible edge of a wide camera', () => {
  const G=fixture(),camera=new T.PerspectiveCamera(72,3,.05,400);camera.position.set(0,1.6,0);camera.lookAt(0,1.6,10);camera.updateMatrixWorld();
  G.enemies=[{id:1,pos:V(37,0,20),type:'trooper'}];const C=new Contacts();C.update(.25,G,camera);assert(C.items.has(1));
});
test('radar blips match screen side and remain visible at acquisition range', () => {
  for(const yaw of [0,.7,Math.PI / 2,Math.PI]) {
    const camera=new T.PerspectiveCamera(72,1,.05,400);camera.rotation.order='YXZ';camera.rotation.set(0,yaw+Math.PI,0);camera.updateMatrixWorld();
    const right=V().setFromMatrixColumn(camera.matrixWorld,0),forward=camera.getWorldDirection(V()),arcs=[];
    const x=new Proxy({arc:(...args)=>arcs.push(args)},{get:(o,k)=>o[k]||(()=>{})});
    const G=fixture();G.scout={active:true,pos:V(),yaw,battery:45};G.contacts={now:0,items:new Map([[1,{p:right.clone().multiplyScalar(20).addScaledVector(forward,10),t:0,fresh:true}],[2,{p:forward.clone().multiplyScalar(95),t:0,fresh:true}]])};
    HUD.prototype._radar.call({x},800,700,G);const blips=arcs.filter(a=>a[2]===3);assert(blips[0][0]>0,'enemy on screen right plots right');assert(blips[0][1]<0,'enemy in front plots above');assert(Math.hypot(blips[1][0],blips[1][1])<52,'95 m contact not clipped by radar rim');
  }
});
