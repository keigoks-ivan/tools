import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FXL } from '../mech/zero/fxl.js';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function effects() {
  // Canvas pixels are not needed to check particle physics and GPU instance lifetimes.
  const previous=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){},beginPath(){},arc(){},fill(){}})})};
  try{return new FXL(new THREE.Scene());}
  finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
}
function spark(p=V(),v=V(1,-2,1)) {return {p,v,t:0,life:1,w:.01,c:[3,1,.5],grav:9};}

test('FXL spark bounce samples elevated and below-sea-level terrain at its current position',()=>{
  for(const base of [9,-3]){
    const fx=effects(),s=spark(V(2,base+.1,4)),samples=[];fx.sparks.push(s);
    fx.update(.1,(x,z)=>{samples.push([x,z]);return base+x*.1+z*.05;});
    assert.deepEqual(samples,[[2.1,4.1]]);assert(Math.abs(s.p.y-(base+2.1*.1+4.1*.05+.02))<1e-12);
    assert(Math.abs(s.v.y-.87)<1e-12);assert.equal(s.v.x,.5);assert.equal(s.v.z,.5);assert.equal(fx.streak.mesh.geometry.instanceCount,1);
  }
});
test('FXL preserves true flat-floor bounce and false/omitted free-flight behavior',()=>{
  for(const floor of [true,false,undefined]){
    const fx=effects(),s=spark();fx.sparks.push(s);fx.update(.1,floor);
    if(floor){assert.equal(s.p.y,.02);assert(s.v.y>0);assert.equal(s.v.x,.5);}
    else{assert(Math.abs(s.p.y+.29)<1e-12);assert(s.v.y<0);assert.equal(s.v.x,1);}
  }
});
test('FXL clear immediately resets all rendered instances and lights without disposing scene resources',()=>{
  const fx=effects();fx.beam(V(0,2,0),V(0,2,8));fx.explode(V(0,2,2));
  fx.bolts.push({p:V(1,2,3),dir:V(0,0,1),len:.8,w:.02,c:[.5,2,3]});
  fx.decals.add(V(1,0,1),V(0,1,0),.3);fx.decals.hot.push({});fx.flash(V(1,2,3),0xffffff,30);
  fx.update(.01,true);
  assert(fx.streak.mesh.geometry.instanceCount>0);assert(fx.smoke.mesh.geometry.instanceCount>0);assert(fx.glow.mesh.geometry.instanceCount>0);assert(fx.lights.some(L=>L.l.intensity>0));
  const children=[...fx.scene.children],resources=new Set();let disposed=0;
  for(const child of children){if(child.geometry)resources.add(child.geometry);if(child.material){resources.add(child.material);if(child.material.map)resources.add(child.material.map);if(child.material.uniforms?.tex)resources.add(child.material.uniforms.tex.value);}}
  for(const resource of resources)resource.addEventListener('dispose',()=>disposed++);
  fx.clear();
  for(const list of [fx.sparks,fx.beams,fx.bolts,fx.smoke.list,fx.glow.list,fx.decals.hot])assert.equal(list.length,0);
  assert.equal(fx.streak.n,0);assert.equal(fx.streak.mesh.geometry.instanceCount,0);assert.equal(fx.smoke.mesh.geometry.instanceCount,0);assert.equal(fx.glow.mesh.geometry.instanceCount,0);assert.equal(fx.decals.mesh.count,0);assert.equal(fx.decals.i,0);assert.equal(fx.li,0);
  for(const L of fx.lights){assert.equal(L.l.intensity,0);assert.equal(L.I,0);assert.equal(L.t,0);assert.equal(L.life,0);}
  fx.update(0,true);assert.equal(fx.streak.mesh.geometry.instanceCount,0);assert(fx.lights.every(L=>L.l.intensity===0));assert.deepEqual(fx.scene.children,children);assert.equal(disposed,0);
});
