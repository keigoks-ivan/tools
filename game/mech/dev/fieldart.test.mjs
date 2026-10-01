import test from 'node:test';
import assert from 'node:assert/strict';
import {fieldTreeGeometry,fieldShrubGeometry,fieldRockGeometry,fieldArchitecture,fieldRadar} from '../fieldart.js';

test('mixed trees and weathered rocks have complete finite geometry within the instance budget',()=>{
  const counts=[];
  for(const g of [...[0,1,2].flatMap(v=>[fieldTreeGeometry(true,v),fieldTreeGeometry(false,v)]),fieldRockGeometry()]) {
    const n=g.attributes.position.count;
    for(const a of Object.values(g.attributes)){assert.equal(a.count,n);assert([...a.array].every(Number.isFinite));}
    assert([...g.attributes.normal.array].some(v=>Math.abs(v)>.5));
    if(g.attributes.leaf)for(let i=0;i<n;i++)if(g.attributes.leaf.getX(i))assert(g.attributes.normal.getY(i)>.5,'葉片法線保持樹冠朝向，不能用平面背面法線變成黑片');
    g.computeBoundingBox();assert(g.boundingBox.min.y>=-.01);assert(g.boundingBox.max.y>.8);
    const tris=(g.index?.count||n)/3;assert(tris<=1100);counts.push(tris);g.dispose();
  }
  assert(counts.slice(0,6).reduce((s,n)=>s+n*200,0)+counts[3]*300<700000,counts.join(','));
});
test('tree variants change silhouette without generating more vertices',()=>{
  for(const pine of [false,true]) {
    const variants=[0,1,2].map(v=>fieldTreeGeometry(pine,v));
    assert(variants.every(g=>g.attributes.position.count===variants[0].attributes.position.count));
    assert(variants.slice(1).every(g=>g.attributes.position.array.some((v,i)=>v!==variants[0].attributes.position.array[i])));
    variants.forEach(g=>g.dispose());
  }
});
test('undergrowth has a low crown and no tree trunk within the shared leaf geometry budget',()=>{
  const g=fieldShrubGeometry();g.computeBoundingBox();
  assert(g.boundingBox.max.y<3&&g.boundingBox.min.y>=0);assert([...g.attributes.leaf.array].every(v=>v===1));
  assert(g.attributes.position.array.every(Number.isFinite));assert(g.attributes.position.count/3<100);g.dispose();
});
test('six facility styles emit bounded architecture, and hangars have curved roof profiles',()=>{
  let hangarHeights=new Set();
  for(const profile of ['valley','forest','depot','badlands','airfield','fortress']) {
    let faces=0,boxes=0;
    const box=(...a)=>{boxes++;assert(a.slice(0,6).every(Number.isFinite));assert(a[1]>=a[0] && a[3]>=a[2] && a[5]>=a[4]);};
    const face=(...a)=>{faces++;for(const p of a.slice(0,4)){assert(p.every(Number.isFinite));if(profile==='airfield')hangarHeights.add(p[1]);}};
    fieldArchitecture({x0:-24,x1:24,z0:-17,z1:17,target:false},profile,16,box,face,()=>{});
    assert(faces>0 && faces<100);assert(boxes>5 && boxes<150);
  }
  assert(hangarHeights.size>6);
});

test('radar dishes and lattice masts emit finite surfaces within a small shared geometry budget',()=>{
  for(const communications of [false,true]) {
    let faces=0;
    const face=(...args)=>{faces++;for(const p of args.slice(0,4))assert(p.every(Number.isFinite));};
    const box=(...args)=>assert(args.slice(0,6).every(Number.isFinite));
    fieldRadar(100,-200,15,face,box,communications);assert(faces>30 && faces<200);
  }
});
test('control towers and hardened bunkers have distinct bounded heights and solid bases',()=>{
  for(const [kind,H] of [['tower',28],['bunker',10],['office',9],['workshop',11]]) {
    let max=0,count=0;
    const box=(x0,x1,y0,y1,z0,z1)=>{count++;assert(x1>=x0&&y1>=y0&&z1>=z0);max=Math.max(max,y1);};
    const face=(...args)=>{for(const p of args.slice(0,4)){assert(p.every(Number.isFinite));max=Math.max(max,p[1]);}};
    fieldArchitecture({x0:-15,x1:15,z0:-16,z1:16,kind,target:true},'airfield',H,box,face,()=>{});
    assert.equal(max,H);assert(count<150);
  }
});
