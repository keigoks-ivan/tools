import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { autumnTreeTint, autumnTreeGeometry, gardenPlanting, buildAutumnTrees, forestCanopy } from '../kobe-autumn.js';
import { fieldTreeGeometry } from '../fieldart.js';
import { kobeCityBlocks, KOBE_CITY } from '../kobe-city.mjs';
import { decodeKobeRelief, kobeCityHeight } from '../kobe-relief.mjs';

const bytes=readFileSync(new URL('../assets/kobe-relief-v1.bin',import.meta.url));
const relief=decodeKobeRelief(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const height=(x,z)=>kobeCityHeight(relief,x,z);

test('行道樹保留兩批次，固定位置產生不同高寬與綠、金、紅色群落',()=>{
  const points=Array.from({length:30},(_,i)=>[i*24-360,i%3*80-160,.7]);
  const a=buildAutumnTrees(new THREE.Scene(),points),b=buildAutumnTrees(new THREE.Scene(),points);
  assert.equal(a.meshes.filter(m=>m.isInstancedMesh).length,2);
  const aspect=[];
  for(let k=0;k<2;k++) {
    assert.deepEqual(a.meshes[k].instanceMatrix.array,b.meshes[k].instanceMatrix.array);
    assert.deepEqual(a.meshes[k].instanceColor.array,b.meshes[k].instanceColor.array);
    const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
    for(let i=0;i<a.meshes[k].count;i++) {
      a.meshes[k].getMatrixAt(i,matrix);matrix.decompose(position,rotation,scale);aspect.push(scale.y/scale.x);
    }
  }
  assert(Math.max(...aspect)-Math.min(...aspect)>.25,'每棵樹的高寬仍過度一致');
  const tones=[];
  for(let x=-480;x<=480;x+=32)for(let z=-320;z<=320;z+=32)tones.push(autumnTreeTint(x,z));
  assert(tones.some(c=>c.g>c.r*1.15),'缺少保留綠葉的群落');
  assert(tones.some(c=>c.r>c.g*1.15),'缺少紅葉群落');
  assert(tones.some(c=>Math.abs(c.r-c.g)<.01&&c.b<c.r*.85),'缺少金黃色群落');
  for(const result of [a,b])for(const mesh of result.meshes)mesh.geometry.dispose();
});

test('偏冠樹形留出可見枝幹，三種輪廓不增加三角形，落葉貼地集中成堆',()=>{
  const shapes=[0,1,2].map(v=>fieldTreeGeometry(false,v)),ratios=[];
  for(const g of shapes) {
    assert.equal(g.index.count/3,324);
    g.computeBoundingBox();const size=g.boundingBox.getSize(new THREE.Vector3());ratios.push(size.x/size.y);
    const p=g.attributes.position,leaf=g.attributes.leaf;
    const leafy=Array.from({length:p.count},(_,i)=>i).filter(i=>leaf.getX(i)>.5);
    assert(Math.min(...leafy.map(i=>p.getY(i)))>3,'低處枝幹被樹冠蓋滿');
    assert(Math.abs(g.boundingBox.max.x+g.boundingBox.min.x)>.3,'冠緣仍左右完全對稱');
    g.dispose();
  }
  assert(Math.max(...ratios)-Math.min(...ratios)>.25,'寬冠與高冠輪廓不足');
  const ground=(x,z)=>x*.12+z*.08,result=buildAutumnTrees(new THREE.Scene(),[[0,0,.7]],ground);
  const litter=result.meshes.find(m=>!m.isInstancedMesh),p=litter.geometry.attributes.position,centers=[];
  assert.equal(p.count/3,32);
  for(let i=0;i<p.count;i++)assert(Math.abs(p.getY(i)-ground(p.getX(i),p.getZ(i))-.022)<.002,'落葉浮離斜坡');
  for(let i=0;i<16;i++) {
    let x=0,z=0;for(let j=0;j<6;j++){x+=p.getX(i*6+j)/6;z+=p.getZ(i*6+j)/6;}centers.push([x,z]);
  }
  const groups=[centers.slice(0,6),centers.slice(6,12),centers.slice(12)],means=groups.map(g=>g.reduce((a,p)=>[a[0]+p[0]/g.length,a[1]+p[1]/g.length],[0,0]));
  const within=groups.flatMap((g,i)=>g.map(p=>Math.hypot(p[0]-means[i][0],p[1]-means[i][1])));
  assert(Math.max(...within)<.4,'落葉沒有集中在小堆中');
  assert(Math.hypot(means[0][0]-means[2][0],means[0][1]-means[2][1])>.8,'落葉退回規則圓環');
  result.meshes.forEach(m=>m.geometry.dispose());
});

test('山麓住宅沿平緩地形錯落，保留林間空隙與作戰、鐵道走廊',()=>{
  const blocks=kobeCityBlocks(height),hills=blocks.filter(b=>b.hillside);
  assert.deepEqual(blocks,kobeCityBlocks(height),'街廓配置不能每次載入跳動');
  assert(hills.length>200&&hills.length<400,'山麓需要住宅群與連續林隙');
  const setbacks=hills.map(b=>b.lots[0].x0-b.x0);
  assert(Math.max(...setbacks)-Math.min(...setbacks)>40,'山麓房屋仍排成固定前緣');
  const levels=new Set();
  for(const b of blocks) {
    assert(b.x0>=-KOBE_CITY.half&&b.x1<=KOBE_CITY.half&&b.z0>=KOBE_CITY.north&&b.z1<=KOBE_CITY.south);
    assert(b.x1<=-840||b.x0>=840||b.z1<=-840||b.z0>=840);
    for(const l of b.lots) {
      if(l.x0<2880&&l.x1>-2880)assert(l.z1<=KOBE_CITY.rail-18||l.z0>=KOBE_CITY.rail+18);
      if(!b.hillside)continue;
      const samples=[[l.x0,l.z0],[l.x1,l.z0],[l.x0,l.z1],[l.x1,l.z1],[(l.x0+l.x1)/2,(l.z0+l.z1)/2]].map(([x,z])=>height(x,z));
      assert(Math.max(...samples)-Math.min(...samples)<=2,'房屋跨越陡坡形成懸空基座');
      assert.equal(l.ground,Math.max(...samples));levels.add(Math.round((l.H-l.ground)/3.4));
    }
    if(b.hillside)for(let i=0;i<b.lots.length;i++)for(let j=i+1;j<b.lots.length;j++) {
      const a=b.lots[i],c=b.lots[j];assert(a.x1+3<=c.x0||a.x0-3>=c.x1||a.z1+3<=c.z0||a.z0-3>=c.z1,'山麓房屋及樹間小徑重疊');
    }
  }
  assert.deepEqual([...levels].sort(),[1,2,3]);
});

test('遠山冠層保持一張512資料圖，冠隙和樹種色帶都可讀取',()=>{
  const map=forestCanopy(),data=map.image.data;
  assert.strictEqual(map,forestCanopy());assert.equal(data.byteLength,512*512*4);
  let openings=0;const species=new Set();
  for(let i=0;i<data.length;i+=4){if(data[i]<40)openings++;species.add(data[i+1]);}
  assert(openings>512*512*.10&&openings<512*512*.45,'林冠需要大小不一的開口');
  assert(species.size>100,'樹種色帶不能只剩固定兩色');
});

test('新楓樹和松樹留出彎曲枝幹與小葉簇，近遠景幾何均不高於舊預算',()=>{
  for(const pine of [false,true])for(const variant of [0,1,2]) {
    const g=autumnTreeGeometry(pine,variant),old=fieldTreeGeometry(pine,variant),p=g.attributes.position;
    assert(g.index.count<=old.index.count,'枝葉細化增加每樹三角形');
    for(const a of Object.values(g.attributes))assert([...a.array].every(Number.isFinite));
    const cards=[],centers=[];
    for(let i=0;i<p.count;i+=4)if(g.attributes.leaf.getX(i)>.5) {
      const points=Array.from({length:4},(_,k)=>new THREE.Vector3().fromBufferAttribute(p,i+k));
      const w=Math.max(...points.flatMap(a=>points.map(b=>a.distanceTo(b))));
      assert(w<(pine?1.8:3.8),'葉團退回巨大片狀剪影');cards.push(points);
      centers.push(points.reduce((sum,q)=>sum.add(q),new THREE.Vector3()).multiplyScalar(.25));
      for(const q of points)assert(q.y>(pine?2:3),'低枝葉片擋住樹幹與街道視野');
    }
    assert.equal(cards.length,pine?24:42);
    if(!pine)assert(centers.filter(c=>Math.hypot(c.x,c.z)<1.6).length>=12,'楓冠內部沒有層疊葉簇，只在枝梢形成稀疏小團');
    g.computeBoundingBox();assert(g.boundingBox.min.y>=0);
    const size=g.boundingBox.getSize(new THREE.Vector3());assert(size.y>7&&size.y<12&&size.x<8);
    for(let i=0;i<g.attributes.uv.count;i++) {
      const u=g.attributes.uv.getX(i),v=g.attributes.uv.getY(i);
      assert(u>=0&&u<=1&&v>=0&&v<=1);
      if(g.attributes.leaf.getX(i)>.5) {
        assert(pine?v>.75&&u<.5:v<.5,'松枝或楓冠採樣到錯誤圖集區');
        if(!pine)assert(variant===1?u>.5:u<.5,'同棵樹的主色應一致，不混成紅黃綠花球');
      }
    }
    g.dispose();old.dispose();
  }
});

test('庭院與窄花槽的細草、灌木和疏花穗固定生長在土面內，沒有新材質或碰撞',()=>{
  for(const [length,width,height,kind]of [[3.4,3,.8,'mixed'],[1.8,.44,.38,'grass'],[2.2,.44,.42,'shrub']])for(const ry of [0,Math.PI/2,.73]) {
    const site={x:12,z:-34,ground:7,length,width,height,kind,ry},faces=[],colors=new Set();
    const result=gardenPlanting({face:(a,b,c,d,col)=>{
      for(const p of [a,b,c,d]) {
        assert(p.every(Number.isFinite));const x=p[0]-site.x,z=p[2]-site.z,u=x*Math.cos(ry)-z*Math.sin(ry),v=x*Math.sin(ry)+z*Math.cos(ry);
        assert(Math.abs(u)<=length/2+.001&&Math.abs(v)<=width/2+.001,'植栽伸出花槽擋住通路');
        assert(p[1]>=site.ground&&p[1]<=site.ground+height*1.15,'植栽浮空或超過預定高度');
      }
      const normal=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).cross(new THREE.Vector3(...c).sub(new THREE.Vector3(...a)));
      assert(normal.length()>1e-8,'草葉或花穗主三角形退化');assert.equal(col[4],6);colors.add(col.slice(0,3).join(','));faces.push([a,b,c,d,col]);
    }},{sites:[site]});
    const repeated=[];gardenPlanting({face:(...args)=>repeated.push(args)},{sites:[site]});assert.deepEqual(faces,repeated);
    assert(result.plants>=3&&result.plants<=10);assert(result.triangles<=700);assert.equal(result.triangles,faces.length*2);
    assert(colors.size>=2,'所有植栽成了同一種綠色');
  }
});
