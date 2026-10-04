import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { autumnTreeTint, buildAutumnTrees, forestCanopy } from '../kobe-autumn.js';
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
