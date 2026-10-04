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

test('商店街兩側店屋保留中央通道，立面補強不新增碰撞，路口與店面合併在既有桶', () => {
  const mats=Object.fromEntries([...SURFACES,'glass','civic','sign','landmarkPaint'].map(k=>[k,new THREE.MeshStandardMaterial({vertexColors:true})]));
  const solid=new Solid(),b=new Builder(mats,solid),scene=new THREE.Scene();
  japaneseBuilder(b,{arcade:[0,36,0],shops:[[0,36,-4.15,1],[0,36,4.15,-1]],crossings:[[60,0,0,7]]});
  const meshes=b.build(scene),triangles=meshes.reduce((n,m)=>n+(m.geometry.index?.count||m.geometry.attributes.position.count)/3,0);
  assert(triangles<10000&&meshes.length<=6);assert(scene.children.every(o=>!o.isLight));
  for(let x=-5;x<42;x+=.5)for(const z of [-2,0,2])assert(!solid.pushOut(new THREE.Vector3(x,0,z),.36,0,1.8,.45),'店屋擋住商店街中央通道');
  assert(solid.pushOut(new THREE.Vector3(3,0,-5),.36,0,1.8,.45),'店屋本體必須有碰撞');
  const before=solid.list.length;
  japaneseBuilder(b,{shops:[[80,92,0,1,0,true]]});assert(solid.list.length===before,'貼在既有牆面的店招與窗框不新增量體');
  for(const mesh of meshes)for(const a of Object.values(mesh.geometry.attributes))assert([...a.array].every(Number.isFinite));
});

test('兩側店招從街道觀看均為正向文字，旋轉的入口標牌也保持左右與上下', () => {
  const mats=Object.fromEntries([...SURFACES,'glass','civic','sign','landmarkPaint'].map(k=>[k,new THREE.MeshStandardMaterial({vertexColors:true})]));
  const b=new Builder(mats,new Solid()),scene=new THREE.Scene();
  japaneseBuilder(b,{arcade:[0,24,0],shops:[[0,24,-4.15,1],[0,24,4.15,-1]]});b.build(scene);
  for(const name of ['sign','civic']) {
    const {position:p,normal:n,uv}=b.B[name].mesh.geometry.attributes;
    for(let i=0;i<p.count;i+=3) {
      const a=new THREE.Vector3().fromBufferAttribute(p,i),du=new THREE.Vector3().fromBufferAttribute(p,i+1).sub(a),dv=new THREE.Vector3().fromBufferAttribute(p,i+2).sub(a);
      const u1=uv.getX(i+1)-uv.getX(i),u2=uv.getX(i+2)-uv.getX(i),v1=uv.getY(i+1)-uv.getY(i),v2=uv.getY(i+2)-uv.getY(i),det=u1*v2-u2*v1;
      assert(Math.abs(det)>.00001);
      const right=du.clone().multiplyScalar(v2).addScaledVector(dv,-v1).divideScalar(det),up=dv.clone().multiplyScalar(u1).addScaledVector(du,-u2).divideScalar(det);
      const screenRight=new THREE.Vector3(0,1,0).cross(new THREE.Vector3().fromBufferAttribute(n,i));
      assert(right.dot(screenRight)>0,'店招文字鏡像');assert(up.y>0,'店招文字上下顛倒');
    }
  }
});

test('店面與轉角側窗有連續窗洞，嵌入式窗框不遮住玻璃，兩側朝街面的繞序正確', () => {
  for(const side of [-1,1]) {
    const mats=Object.fromEntries([...SURFACES,'glass','civic','sign','landmarkPaint'].map(k=>[k,new THREE.MeshStandardMaterial({vertexColors:true})]));
    const b=new Builder(mats,new Solid()),scene=new THREE.Scene();
    japaneseBuilder(b,{shops:[[0,6,0,side]]});const meshes=b.build(scene);
    scene.updateMatrixWorld(true);
    for(const [origin,direction,axis,depth]of [
      [[1.2,1.2,side*2],[0,0,-side],'z',side*-.32],
      [[2.15,4.5,side*2],[0,0,-side],'z',side*-.32],
      [[-2,4.5,side*-2],[1,0,0],'x',.26],
    ]) {
      const hits=new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction)).intersectObjects(meshes);
      assert(hits.length&&hits[0].object.name==='lvl-glass','窗洞前方不能有覆蓋玻璃的牆面或粗窗框');
      assert(Math.abs(hits[0].point[axis]-depth)<.001,'玻璃必須位於牆內而非貼在牆上');
    }
    const triangles=meshes.reduce((n,m)=>n+m.geometry.attributes.position.count/3,0);
    assert(triangles<600&&meshes.length<=4,'轉角窗與細框沿用既有材質桶和有限靜態幾何');
  }
});
