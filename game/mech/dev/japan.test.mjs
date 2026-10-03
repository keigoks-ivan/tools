import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { japaneseScenery, japaneseBuilder } from '../japan.js';
import { Builder, Solid, SURFACES } from '../zero/kit.js';
import { shopUV, civicUV } from '../urban.js';

test('橫式店招的裁切比例符合街面尺寸，路牌維持完整圖格', () => {
  for (const id of [0,1,2,3,6,7]) {
    const uv=shopUV(id), aspect=(uv[1][0]-uv[0][0])*1024/((uv[2][1]-uv[0][1])*512);
    assert(Math.abs(aspect-5.6/1.2)<.15);
    const full=civicUV(id);assert(full[2][1]-full[0][1]>.49);
  }
});

test('神戶地標幾何有限、沒有退化主面，全部新增場景低於兩萬三角形', () => {
  let triangles=0, min=Infinity, max=-Infinity;
  japaneseScenery({
    face(a,b,c,d) {
      for(const p of [a,b,c,d]) {assert(p.every(Number.isFinite));min=Math.min(min,p[1]);max=Math.max(max,p[1]);}
      const u=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),v=new THREE.Vector3(...c).sub(new THREE.Vector3(...a));
      assert(u.cross(v).length()>.000001);triangles+=2;
    },
    box(x0,x1,y0,y1,z0,z1) {assert([x0,x1,y0,y1,z0,z1].every(Number.isFinite));assert(x1>x0&&y1>y0&&z1>z0);triangles+=12;},
    sign(p,id) {assert(id>=0&&id<8);assert(p.flat().every(Number.isFinite));triangles+=2;},
  },{tower:[0,0],shrine:[100,0],maritime:[200,0],arcade:[300,350,0],streets:[[400,0],[400,60]]});
  assert(min>=-.06);assert(Math.abs(max-108)<.02);assert(triangles<20000);
});

test('路牌使用有效圖集 UV，港塔保留紅漆，拱棚中央與鳥居通道不被碰撞封住', () => {
  const mats=Object.fromEntries([...SURFACES,'glass','civic','landmarkPaint'].map(k=>[k,new THREE.MeshStandardMaterial({vertexColors:true})]));
  const solid=new Solid(),b=new Builder(mats,solid),scene=new THREE.Scene();
  japaneseBuilder(b,{tower:[0,0],shrine:[100,0],arcade:[150,200,0],streets:[[220,0,0,0,0]]});
  const meshes=b.build(scene);
  for(const m of meshes)for(const a of Object.values(m.geometry.attributes))assert([...a.array].every(Number.isFinite));
  const uv=b.B.civic.mesh.geometry.attributes.uv;
  assert([...uv.array].every(v=>v>0&&v<1));
  assert(b.B.landmarkPaint.c.some((v,i)=>i%3===0&&v>.6&&b.B.landmarkPaint.c[i+1]<.05),'神戶港塔鋼管有紅色頂點漆面');
  for(const [x,z]of [[100,0],[175,0]]) {const p=new THREE.Vector3(x,0,z);assert(!solid.pushOut(p,.36,0,1.8,.45));}
  const p=new THREE.Vector3(0,0,0);assert(solid.pushOut(p,.36,0,1.8,.45),'港塔基座不能穿過');
});
