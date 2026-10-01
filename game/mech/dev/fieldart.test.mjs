import test from 'node:test';
import assert from 'node:assert/strict';
import {fieldTreeGeometry,fieldRockGeometry,fieldArchitecture,fieldRadar} from '../fieldart.js';

test('mixed trees and weathered rocks have complete finite geometry within the instance budget',()=>{
  const counts=[];
  for(const g of [fieldTreeGeometry(true),fieldTreeGeometry(false),fieldRockGeometry()]) {
    const n=g.attributes.position.count;
    for(const a of Object.values(g.attributes)){assert.equal(a.count,n);assert([...a.array].every(Number.isFinite));}
    assert([...g.attributes.normal.array].some(v=>Math.abs(v)>.5));
    g.computeBoundingBox();assert(g.boundingBox.min.y>=-.01);assert(g.boundingBox.max.y>.8);
    const tris=(g.index?.count||n)/3;assert(tris<=1100);counts.push(tris);g.dispose();
  }
  assert(counts[0]*840+counts[1]*360<700000,counts.join(','));
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
