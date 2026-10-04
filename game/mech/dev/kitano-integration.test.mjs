import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Solid, SURFACES } from '../zero/kit.js';
import { Pilot } from '../zero/player.js';
import { buildMap as zeroMap } from '../zero/map.js';
import { buildMap as harborMap } from '../lastline/map.js';
import * as zeroScript from '../zero/script.js';
import * as harborScript from '../lastline/script.js';

function fixture(build,harbor,t) {
  const previous=globalThis.document,gradient={addColorStop(){}};
  const ctx=new Proxy({measureText:s=>({width:String(s).length*12}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},
    {get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
  globalThis.document={createElement:()=>({getContext:()=>ctx}),fonts:{load:()=>Promise.resolve()}};
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  const scene=new THREE.Scene(),solid=new Solid(),mats=Object.fromEntries(SURFACES.map(k=>[k,new THREE.MeshStandardMaterial({vertexColors:true})]));
  const placer={M:{nodes:new Proxy({},{get:()=>[{mat:new THREE.MeshStandardMaterial()}]}),has:()=>true},reg:[],bagWalls:[],size:()=>new THREE.Vector3(3,3,3),add:()=>null};
  return {scene,solid,map:build(scene,mats,solid,placer,harbor?{rockN:null}:null)};
}
function walk(solid,points,name) {
  const pilot=new Pilot(solid);pilot.reset(new THREE.Vector3(...points[0]),0);
  for(const [x,y,z] of points.slice(1)) {
    const limit=Math.ceil(Math.hypot(pilot.pos.x-x,pilot.pos.z-z)*30)+600;let frames=0;
    while(Math.hypot(pilot.pos.x-x,pilot.pos.z-z)>.18&&frames++<limit) {
      pilot.yaw=Math.atan2(x-pilot.pos.x,z-pilot.pos.z);
      pilot.update(1/60,{mx:0,my:1,lookX:0,lookY:0,sprint:true});
    }
    assert(frames<limit,`${name} 路徑被擋住 ${x},${y},${z}，停在 ${pilot.pos.toArray()}`);
    assert(Math.abs(pilot.pos.y-y)<.35,`${name} 路面未支撐 ${x},${y},${z}，實際 ${pilot.pos.y}`);
  }
}
for(const [name,build,script,harbor]of [['前傳',zeroMap,zeroScript,false],['續作',harborMap,harborScript,true]])
test(`${name} 北野入口與地標連續可步行，獨立預算且保留任務點與駐軍`,t=>{
  const {scene,solid,map}=fixture(build,harbor,t),K=map.kitano;
  assert(K.triangles<44000);assert(map.kitanoConnector.triangles<200);assert(map.meshes.length<=(harbor?15:31));
  assert(map.baseTriangles<(harbor?130000:320000));
  assert(K.houses.length>=14&&Object.keys(K.routes).length>=18,'洋館庭院支路不完整');
  assert(Math.hypot(K.routes.walk.at(-1)[0]-K.routes.walk[0][0],K.routes.walk.at(-1)[2]-K.routes.walk[0][2])>=270,'北野主街不夠長');
  walk(solid,map.kitanoConnector.route,'既有街道至北野入口');
  for(const [id,route]of Object.entries(K.routes)){walk(solid,route,id);walk(solid,[...route].reverse(),id+' 返回');}
  walk(solid,[...map.kitanoConnector.route].reverse(),'北野返回既有街道');
  const originalSolid=new Solid();for(const q of solid.list.slice(0,map.baseColliders))originalSolid.add({...q});
  for(const point of [K.bounds,...K.landmarks.map(l=>l.entrance),...Object.values(K.routes).flat()].flatMap(p=>Array.isArray(p)?[p]:[[p.x0,0,p.z0],[p.x1,0,p.z1]])) {
    assert(Math.max(Math.abs(point[0]),Math.abs(point[2]))<script.FOOT_EXTENT);
    const [x0,x1,z0,z1]=script.FIELD_BOUNDS;assert(point[0]>=x0&&point[0]<=x1&&point[2]>=z0&&point[2]<=z1,'戰術地圖漏掉北野');
  }
  for(const E of script.ENCOUNTERS)for(const [x,z,y=0]of [E.guide,...(E.enemies||[]).map(e=>[e.x,e.z,e.y||0])]) {
    assert(x<K.bounds.x0-.35||x>K.bounds.x1+.35||z<K.bounds.z0-.35||z>K.bounds.z1+.35,'新街區蓋住原任務／駐軍');
    const p=new THREE.Vector3(x,y,z),original=p.clone();solid.pushOut(p,.35,y,y+1.7,.45);originalSolid.pushOut(original,.35,y,y+1.7,.45);assert(p.distanceTo(original)<.01,E.id+' 北野碰撞影響舊任務路線');
  }
  if(!harbor)for(const z of [-70,-60,10,50,60])assert.equal(solid.floorAt(121,z,28.1),28,'東樓屋頂敵人承重面消失');
  scene.traverse(o=>{assert(!o.isLight);if(o.isMesh)for(const a of Object.values(o.geometry.attributes))assert([...a.array].every(Number.isFinite));});
});
