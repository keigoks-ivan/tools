import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { kobeBlockStreets } from '../kobe-street.mjs';
import { Builder, Solid, SURFACES } from '../zero/kit.js';
import { buildMap as zeroMap } from '../zero/map.js';
import { buildMap as harborMap } from '../lastline/map.js';
import * as zeroScript from '../zero/script.js';
import * as harborScript from '../lastline/script.js';

test('街緣設施旋轉後保持有效外形，鋪面朝上，只寫入既有幾何桶', () => {
  const mats=Object.fromEntries(['concrete','metal','floor','landmarkPaint'].map(k=>[k,new THREE.MeshStandardMaterial({vertexColors:true})]));
  const solid=new Solid(),b=new Builder(mats,solid),scene=new THREE.Scene();
  const materials=Object.values(mats),colliders=solid.list.slice();
  const material=col=>col[4]===1?'concrete':col[4]===2?'metal':col[4]===8?'floor':'landmarkPaint';
  let faces=0;
  const out={face(a,c,d,e,col) {
    assert([a,c,d,e,col].flat().every(Number.isFinite));
    const normal=new THREE.Vector3(...c).sub(new THREE.Vector3(...a)).cross(new THREE.Vector3(...d).sub(new THREE.Vector3(...a)));
    assert(normal.length()>1e-8,'主要三角形退化');
    if(Math.abs(a[1]-c[1])<1e-6&&Math.abs(c[1]-d[1])<1e-6)assert(normal.y>0,'水平鋪面朝下');
    b.B[material(col)].quad(a,c,d,e,normal.normalize().toArray(),[1,1,1,1],null,col.slice(0,3));faces++;
  }};
  for(const ry of [0,Math.PI/2,Math.PI,-Math.PI/2]) {
    const stats=kobeBlockStreets(out,{frontages:[{x:10,z:-20,ry,length:30,depth:1.5,ground:.15,gaps:[[-2,2]]}],
      parking:[{x:10,z:-20,ry,stalls:2}],service:[{x:10,z:-20,ry,length:20}],
      bicycles:[{x:10,z:-20,ry,count:2}],planters:[{x:10,z:-20,ry}],utilities:[{x:10,z:-20,ry}]});
    assert(stats.triangles<2000,'單一街緣組建立過量幾何');
  }
  assert(faces*2<8000);assert.deepEqual(solid.list,colliders);
  assert.deepEqual(Object.values(mats),materials);
  const meshes=b.build(scene);assert(meshes.length<=4&&meshes.every(m=>materials.includes(m.material)));
  assert(scene.children.every(o=>!o.isLight));
});

function mapFixture(build,harbor) {
  const gradient={addColorStop(){}};
  const ctx=new Proxy({measureText:s=>({width:String(s).length*12}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},
    {get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  globalThis.document={createElement:()=>({width:512,height:512,getContext:()=>ctx}),fonts:{load:()=>Promise.resolve()}};
  const scene=new THREE.Scene(),solid=new Solid(),mats=Object.fromEntries(SURFACES.map(k=>[k,new THREE.MeshStandardMaterial({vertexColors:true})]));
  const placer={M:{nodes:new Proxy({},{get:()=>[{mat:new THREE.MeshStandardMaterial()}]}),has:()=>true},reg:[],bagWalls:[],size:()=>new THREE.Vector3(3,3,3),add:()=>harbor?{hide(){}}:null};
  return build(scene,mats,solid,placer,harbor?{rockN:null}:null);
}

test('前傳與港區的自行車、植槽與表箱避開固定任務點、敵人和步兵路線', t => {
  const document=globalThis.document;t.after(()=>{if(document===undefined)delete globalThis.document;else globalThis.document=document;});
  for(const [build,script,harbor]of [[zeroMap,zeroScript,false],[harborMap,harborScript,true]]) {
    const map=mapFixture(build,harbor),bounds=[];
    assert(map.meshes.length<=(harbor?12:28),'街緣新增材質桶');
    assert(map.streetscape.frontages>=8,'街景只覆蓋零星位置');
    assert(map.streetscape.triangles<=(harbor?6500:4000),'街景超出靜態幾何預算');
    for(const key of ['bicycles','planters','utilities'])for(const site of map.streetSites[key]) {
      const box=new THREE.Box3();
      kobeBlockStreets({face:(...args)=>{for(const p of args.slice(0,4))box.expandByPoint(new THREE.Vector3(...p));}},{[key]:[site]});
      bounds.push({key,box});
    }
    let checked=0;
    const clear=(x,z,y,name)=>{checked++;for(const {key,box}of bounds)
      assert(y>=box.max.y||y+1.7<=box.min.y||x<=box.min.x-.35||x>=box.max.x+.35||z<=box.min.z-.35||z>=box.max.z+.35,name+' 與 '+key+' 視覺外形重疊');};
    for(const e of script.ENCOUNTERS) {
      clear(e.guide[0],e.guide[1],e.guide[2]||0,e.id+' 導引');
      for(const p of [...(e.enemies||[]),...(e.pressure?.list||[]),...(e.stealth?.reinforce||[]),...(e.hold?.waves.flat()||[])])clear(p.x,p.z,p.y||0,e.id+' 敵人');
      for(const key of ['route','nextRoute'])for(const p of e[key]||[])clear(p[0],p[1],p[2]||0,e.id+' '+key);
    }
    assert(checked>100);
  }
});
