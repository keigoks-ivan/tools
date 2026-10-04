import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Solid } from '../zero/kit.js';
import { VehicleOps } from '../zero/vehicle-ops.mjs';
import { carMaterials } from '../zero/props.js';

function props(missionId,action) {
  const surfaces=Object.fromEntries(['metal','painted','fabric'].map(k=>[k,new THREE.MeshStandardMaterial({vertexColors:true})])),point=[9,2,-7];
  const f={story:{current:{missionId,action,kind:'operate',point,token:missionId+':'+action}},props:[],surfaces,materials:carMaterials(),G:{solid:new Solid(),scene:new THREE.Scene()}};
  VehicleOps.prototype._stage.call(f);f.G.scene.updateMatrixWorld(true);return f;
}
const boxOf=f=>new THREE.Box3().setFromObject(f.G.scene);
const tris=f=>f.props.reduce((s,m)=>s+m.geometry.attributes.position.count/3,0);
function localHits(f,x,y,z,d) {return new THREE.Raycaster(new THREE.Vector3(x+9,y+2,z-7),new THREE.Vector3(...d),0,10).intersectObjects(f.props);}

test('Kitano injured passengers retain two stretchers but living engineers never become stretcher props',()=>{
  for(const action of ['loadPassengers','unloadPassengers']) {
    const injured=props('zero_kitano',action),cloth=injured.props.find(m=>m.material===injured.surfaces.fabric);
    assert(cloth,'only the wounded transfer needs blanket-covered stretchers');cloth.geometry.computeBoundingBox();
    assert(cloth.geometry.boundingBox.min.x<9-1.6&&cloth.geometry.boundingBox.max.x>9+1.6,'two separate beds must be visible');
    for(const mission of ['lastline_manifest','lastline_shuttle']) {
      const crew=props(mission,action);assert(!crew.props.some(m=>m.material===crew.surfaces.fabric));
      assert(localHits(crew,1.4,.6,3,[0,0,-1]).some(h=>h.point.z>-7+1.1),'the supplies have an actual physical object beyond the desk');
    }
  }
});

test('oxygen rack uses three round bottle bodies, narrower shoulders and visible top valves',()=>{
  const f=props('lastline_manifest','loadPassengers');
  for(const x of [1.11,1.46,1.81]) {
    const body=localHits(f,x,.62,2.5,[0,0,-1])[0];assert(body);assert(Math.abs(body.point.z-(-7+1.735))<1e-5,'each medical cylinder has a real circular cross-section');
    const neck=localHits(f,x,1.28,2.5,[0,0,-1])[0];assert(neck);assert(neck.point.z<body.point.z-.07,'a narrow valve neck sits above the shoulder');
    assert(localHits(f,x,1.38,2.5,[0,0,-1]).length>0,'the top handwheel is actual geometry');
  }
  assert.equal(f.props.length,2);assert(tris(f)<=1600);
  assert(f.props.some(m=>m.material===f.materials.carPaint));assert(f.props.some(m=>m.material===f.materials.carMetal));
  assert(f.props.every(m=>!m.material.map),'usable medical equipment does not inherit the environment rust photograph');
});

test('engineer transfer has stacked tool cases, cable coils, spool flanges and a stand',()=>{
  const f=props('lastline_shuttle','loadPassengers'),b=boxOf(f);
  assert(b.min.x<9-1.5&&b.max.x>9+1.6);assert(localHits(f,-1.27,.66,2.5,[0,0,-1]).length>0,'upper maintenance case has its own silhouette');
  assert(localHits(f,1.35,.53,2.5,[0,0,-1]).length>0,'wound cable fills the centre of the reel');
  assert(localHits(f,1.63,.81,2.5,[0,0,-1]).length>0,'large side flange is outside the cable drum');
  assert(localHits(f,1.07,.22,2.5,[0,0,-1]).length>0,'the reel is supported by a ground stand');
  assert.equal(f.props.length,2);assert(tris(f)<=1600);
});

test('gate handwheel and signal antenna make E operations recognizable without new collisions or lights',()=>{
  const gate=props('lastline_shuttle','openGate'),signal=props('lastline_signal','copySignal');
  assert(localHits(gate,-.52,1.30,.8,[0,0,-1]).length>0,'the raised handwheel ring is in front of its lock housing');
  assert(localHits(gate,-.52,.96,.8,[0,0,-1]).length>0,'a manual locking bolt lies below the wheel');
  assert(boxOf(signal).max.y>2+2.1,'the antenna visibly rises above the desk');
  assert(localHits(signal,.70,2.04,.8,[0,0,-1]).length>0,'antenna crossbars are real geometry');
  for(const f of [gate,signal]) {assert.equal(f.G.solid.list.length,0);assert.equal(f.props.length,2);assert(tris(f)<=1600);f.G.scene.traverse(o=>assert(!o.isLight));}
});

test('collecting a box stays compact and stage replacement disposes old merged geometry',()=>{
  const f=props('zero_kitano','collectCargo'),b=boxOf(f);assert(b.max.z<-7+.5,'cargo retrieval never silently creates two patient beds');assert.equal(f.props.length,2);
  const old=[...f.props],disposed=new Set();for(const m of old)m.geometry.addEventListener('dispose',()=>disposed.add(m));
  f.story.current={missionId:'zero_kitano',kind:'drive',point:[0,0,0],token:'drive'};VehicleOps.prototype._stage.call(f);
  assert.equal(disposed.size,old.length);assert.equal(f.props.length,0);assert.equal(f.G.scene.children.length,0);
  for(const mission of ['zero_kitano','lastline_manifest','lastline_shuttle','lastline_signal']) {
    const p=props(mission,mission==='lastline_signal'?'copySignal':'loadPassengers');
    for(const mesh of p.props)for(const a of Object.values(mesh.geometry.attributes))assert([...a.array].every(Number.isFinite));
  }
});
