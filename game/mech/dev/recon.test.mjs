import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Contacts, Scout } from '../zero/recon.js';
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
