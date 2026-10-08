import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import * as THREE from './vendor/three.module.js';
import { TRACKS } from './track.mjs';
register('data:text/javascript,'+encodeURIComponent(`
  let three;
  export function initialize(data){three=data.three;}
  export function resolve(specifier,context,next){return next(specifier==='three'?three:specifier,context);}
`),{parentURL:import.meta.url,data:{three:new URL('./vendor/three.module.js',import.meta.url).href}});
const {addRoadDetails}=await import('./world-road.js');
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){}})})};

test('Taipei shows closed-course blocks at the physical boundary without motorway rails or racing curbs',()=>{
  const scene=new THREE.Scene(),track=TRACKS.taipei,concrete=new THREE.MeshStandardMaterial();
  addRoadDetails({scene,track,materials:{concrete}});
  assert.equal(scene.children.length,2,'one instanced barrier batch and one faint road-wear mesh');
  const blocks=scene.getObjectByName('taipei-short-concrete-race-barriers');
  assert.ok(blocks?.isInstancedMesh);
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3();
  for(let i=0;i<blocks.count;i++){
    blocks.getMatrixAt(i,matrix);assert.ok(matrix.elements.every(Number.isFinite));position.setFromMatrixPosition(matrix);
    const near=track.nearest(position.x,position.z);
    assert.ok(Math.abs(near.distance-track.wallOffset)<.35,'visible blocks follow the same wall offset as driving collisions');
    assert.ok(Math.abs(position.y-near.y-.28)<.03,'low blocks follow the locally graded street');
  }
  assert.ok(blocks.instanceColor.array.every(Number.isFinite));
  for(const mesh of scene.children){mesh.geometry.dispose();mesh.material.map?.dispose();mesh.material.dispose();mesh.dispose?.();}
  concrete.dispose();
});

test('the original scenic roads retain their rail and corner-curb construction',()=>{
  const scene=new THREE.Scene(),concrete=new THREE.MeshStandardMaterial();
  addRoadDetails({scene,track:TRACKS.costa,materials:{concrete}});
  assert.equal(scene.children.filter(mesh=>mesh.isInstancedMesh).length,4);
  assert.ok(scene.children.some(mesh=>mesh.geometry.attributes.color?.count>0),'original coloured corner curb remains');
  assert.equal(scene.getObjectByName('taipei-short-concrete-race-barriers'),undefined);
  const resources=new Set([concrete]);
  for(const mesh of scene.children){resources.add(mesh.geometry);resources.add(mesh.material);if(mesh.material.map)resources.add(mesh.material.map);mesh.dispose?.();}
  resources.forEach(resource=>resource.dispose());
});

for(const id of ['kualalumpur','kobe','london','sydney','goldcoast','melbourne','paris','prague','newcastle','bangkok','sanfrancisco','newyork','vancouver','hanoi','lisbon','marseille','nice','warwick'])test(`${id}: street barriers match collisions and local road grade`,()=>{
  const scene=new THREE.Scene(),track=TRACKS[id],concrete=new THREE.MeshStandardMaterial();addRoadDetails({scene,track,materials:{concrete}});
  assert.equal(scene.children.length,2);const blocks=scene.getObjectByName(`${id}-closed-street-barriers`);assert.ok(blocks?.isInstancedMesh);
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),forward=new THREE.Vector3();
  for(let i=0;i<blocks.count;i++){
    blocks.getMatrixAt(i,matrix);assert.ok(matrix.elements.every(Number.isFinite));position.setFromMatrixPosition(matrix);
    const near=track.nearest(position.x,position.z);assert.ok(Math.abs(near.distance-track.wallOffset)<.4);assert.ok(Math.abs(position.y-near.y-.33)<.06);
    forward.set(0,0,1).transformDirection(matrix);assert.ok(Number.isFinite(forward.y));
  }
  assert.ok((blocks.geometry.index?.count||blocks.geometry.attributes.position.count)/3<50,'one small reusable barrier profile');
  for(const mesh of scene.children){mesh.geometry.dispose();mesh.material.map?.dispose();mesh.material.dispose();mesh.dispose?.();}concrete.dispose();
});
