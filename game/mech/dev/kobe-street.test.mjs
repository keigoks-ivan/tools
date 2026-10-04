import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { recessedFacade, kobeStreetDetails } from '../kobe-street.mjs';
import { buildAutumnTrees, forestCanopy } from '../kobe-autumn.js';

test('近街四面窗洞的玻璃確實後退，貼圖開間和樓層保持一致',()=>{
  const walls=[],details=[],F={w:20.4,h:20.4,cols:6,rows:6};
  recessedFacade({wall:(...a)=>walls.push(a),detail:(...a)=>details.push(a)},
    {x0:0,x1:17,z0:0,z1:10.2,H:17,style:3,tint:[1,1,1],phase:1/6,exposed:[true,true,true,true]},F);
  const positions=[];
  for(const [a,b,c,d,n,uv]of walls) {
    for(const p of [a,b,c,d])assert(p.every(Number.isFinite));
    const normal=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).cross(new THREE.Vector3(...c).sub(new THREE.Vector3(...a))).normalize();
    assert(normal.dot(new THREE.Vector3(...n))>.999);
    for(let i=0;i<4;i++)assert(Math.abs(uv[i][1]-[a,b,c,d][i][1]/F.h)<1e-6);
    for(const i of [0,1,2,0,2,3])positions.push(...[a,b,c,d][i]);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial());mesh.updateMatrixWorld();
  const ray=new THREE.Raycaster(new THREE.Vector3(1.7,4.6,20),new THREE.Vector3(0,0,-1));
  const hit=ray.intersectObject(mesh)[0];assert(hit);assert(Math.abs(hit.point.z-(10.2-.24))<1e-5,'窗洞前仍殘留平面牆');
  assert(details.some(p=>p.slice(0,4).some(v=>v[2]<10.2)&&p.slice(0,4).some(v=>v[2]===10.2)),'缺少窗洞側面');
  const far=[];recessedFacade({wall:(...a)=>far.push(a),detail:()=>assert.fail('遠樓新增細節')},
    {x0:0,x1:17,z0:0,z1:10.2,H:64,style:3,tint:[1,1,1],phase:0,exposed:[true,true,true,true]},F);
  assert.equal(far.length,4);
});

test('旋轉街段的路緣、格柵和人孔蓋朝外，三街段保持小型幾何預算',()=>{
  let faces=0;
  for(const ry of [0,Math.PI/2,-Math.PI/2])kobeStreetDetails({face:(a,b,c,d)=>{
    for(const p of [a,b,c,d])assert(p.every(Number.isFinite));
    const n=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).cross(new THREE.Vector3(...c).sub(new THREE.Vector3(...a)));
    assert(n.length()>1e-7);if(a[1]===b[1]&&b[1]===c[1])assert(n.y>0,'水平主面背向天空');faces++;
  }},[[30,-20,ry,40,12]]);
  assert(faces*2<700);
});

test('秋季行道樹分成兩個實例批次，落葉固定合併且沒有碰撞或燈光',()=>{
  const scene=new THREE.Scene(),points=Array.from({length:15},(_,i)=>[i*12,30,.7]);
  const trees=buildAutumnTrees(scene,points,()=>2);
  assert.equal(trees.count,15);assert.equal(trees.meshes.length,3);
  assert.equal(trees.meshes.filter(m=>m.isInstancedMesh).reduce((n,m)=>n+m.count,0),15);
  assert(scene.children.every(o=>!o.isLight));
  for(const mesh of trees.meshes) {
    for(const a of Object.values(mesh.geometry.attributes))assert([...a.array].every(Number.isFinite));
    assert(!mesh.onBeforeRender.toString().includes('performance'));
    if(mesh.isInstancedMesh)assert(mesh.customDepthMaterial.map===mesh.material.map);
  }
});

test('六甲山林冠共用一張小型資料圖，不需要下載或新增遠山幾何',()=>{
  const map=forestCanopy();assert.strictEqual(forestCanopy(),map);
  assert.equal(map.image.width,512);assert.equal(map.image.data.byteLength,512*512*4);
  assert.equal(map.wrapS,THREE.RepeatWrapping);assert.equal(map.wrapT,THREE.RepeatWrapping);
  assert.equal(map.colorSpace,THREE.NoColorSpace);
  const heights=new Set();for(let i=0;i<map.image.data.length;i+=4)heights.add(map.image.data[i]);
  assert(heights.size>100,'林冠缺少細部高度，無法產生樹冠明暗');
});
