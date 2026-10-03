import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kobeCityBlocks, kobeRailway, kobeWaterfront, KOBE_CITY } from '../kobe-city.mjs';
import { decodeKobeRelief, kobeCityHeight } from '../kobe-relief.mjs';

const bytes=readFileSync(new URL('../assets/kobe-relief-v1.bin',import.meta.url));
const relief=decodeKobeRelief(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const height=(x,z)=>kobeCityHeight(relief,x,z),blocks=kobeCityBlocks(height);
test('神戶外圍是連續街廓，保留中央戰鬥區與山麓低矮住宅',()=>{
  assert(blocks.length>900&&blocks.length<1400);
  for(const b of blocks) {
    assert(b.x1<=-840||b.x0>=840||b.z1<=-840||b.z0>=840,'遠景進入可遊玩街區');
    for(const l of b.lots) {
      assert(l.x0>=b.x0&&l.x1<=b.x1&&l.z0>=b.z0&&l.z1<=b.z1);
      assert(l.H>l.ground&&l.ground<150);
      if(b.hillside)assert(l.H-l.ground<=13.61&&l.pitched);
    }
    if(!b.hillside&&b.z0!==-822) {
      const area=b.lots.reduce((s,l)=>s+(l.x1-l.x0)*(l.z1-l.z0),0);
      assert(area/((b.x1-b.x0)*(b.z1-b.z0))>.5,'平地街廓不能只有散落的單棟建築');
    }
  }
  assert(new Set(blocks.flatMap(b=>b.lots.map(l=>l.style))).size===4);
});
test('高架鐵道兩側的街屋保留走廊，港區的任務矩形也能保留',()=>{
  for(const l of blocks.flatMap(b=>b.lots))if(l.x0<2880&&l.x1>-2880)assert(l.z1<=KOBE_CITY.rail-18||l.z0>=KOBE_CITY.rail+18);
  const reserved=kobeCityBlocks(height,(x0,x1,z0,z1)=>x0<600&&x1>-300&&z0<500&&z1>-900);
  for(const b of reserved)assert(b.x1<=-300||b.x0>=600||b.z1<=-900||b.z0>=500);
});
test('靜態車站與列車輸出有限幾何，橋面、軌道與雨棚朝上',()=>{
  let triangles=0,panels=0;
  kobeRailway({box:(...a)=>{assert(a.slice(0,6).every(Number.isFinite));triangles+=10;},face:(a,b,c,d)=>{
    assert([a,b,c,d].flat().every(Number.isFinite));triangles+=2;
    const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
    const ny=u[2]*v[0]-u[0]*v[2];
    if(Math.abs(ny)>.0001){assert(ny>0,'車站屋面或橋面背向天空');panels++;}
  }},height);
  assert(panels>50&&triangles<4000);
});
test('波浪旅館的曲面立面朝外、露台與屋面朝上，整組海岸細節低於一萬三角形',()=>{
  let triangles=0,curved=0;
  kobeWaterfront({box:(...a)=>{assert(a.slice(0,6).every(Number.isFinite));triangles+=10;},face:(a,b,c,d)=>{
    assert([a,b,c,d].flat().every(Number.isFinite));triangles+=2;
    if(a[2]<975||b[2]<975)return;
    const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(Math.abs(n[1])>.001)assert(n[1]>0,'旅館露台或屋面朝下');
    else if(Math.abs(n[0])+Math.abs(n[2])>.001) {assert(n[0]*(a[0]+80)+n[2]*(a[2]-980)>=-.001,'旅館曲面立面向內');curved++;}
  }});
  assert(triangles<10000&&curved>100);
});
test('港區旋轉後的旅館碼頭連接海岸，觀覽車基座留在陸地',()=>{
  const boxes=[];
  kobeWaterfront({box:(...a)=>boxes.push(a),face:()=>{}},-280);
  const pier=boxes[0];
  assert(pier[4]+140<=680&&pier[5]+140>680,'碼頭必須跨過港區海岸線');
  const supports=[];
  kobeWaterfront({box:()=>{},face:(...a)=>supports.push(a.slice(0,4))},-280);
  const feet=supports.flat().filter(p=>p[1]<1&&p[0]<-600);
  assert(feet.length>0&&feet.every(p=>p[2]+140<680),'觀覽車基座不能漂在海上');
});
