import test from 'node:test';
import assert from 'node:assert/strict';
import { Operation } from '../lastline/operations.mjs';
import { CHAPTERS, ENCOUNTERS, MECH_CONFIGS } from '../lastline/script.js';
const point=(x,z,seconds=1)=>Object.assign([x,z],{seconds});
const work=(o,n,extra={})=>{for(let i=0;i<n;i++)o.step(.1,{player:o.point,held:true,...extra});};
test('控制站必須到場按住：放開、離開與命中重置當前站，完成的上一站保留',()=>{
 const def={kind:'console',radius:2,points:[point(0,0),point(10,0)]},o=new Operation(def);
 work(o,5);assert(o.progress>.4);work(o,1,{held:false});assert.equal(o.progress,0);
 work(o,5);work(o,1,{player:[20,0]});assert.equal(o.progress,0);
 work(o,5);work(o,1,{hurt:true});assert.equal(o.progress,0);
 work(o,10);assert.equal(o.index,1);assert(!o.done);
 work(o,5);work(o,1,{held:false});assert.equal(o.index,1);
 const s=o.snapshot(),r=new Operation(def);assert(r.restore(s));work(r,10);assert(r.done);assert.equal(r.index,2);
 assert(!r.restore({...s,index:100}));assert(!r.restore({...s,progress:Infinity}));assert(!r.restore({...s,done:true}));assert(!r.restore({...s,pos:{}}));assert(!r.restore({...s,pos:[NaN,0]}));
});
test('分區防守：待在目前據點才計時，離開和命中停止，必須依序守兩處',()=>{
 const o=new Operation({kind:'defend',radius:5,points:[point(0,0),point(20,0)]});
 work(o,6,{held:false});const progress=o.progress;work(o,10,{player:[10,0]});assert.equal(o.progress,progress);
 work(o,10,{hurt:true});assert.equal(o.progress,progress);work(o,4);assert.equal(o.index,1);
 work(o,20,{player:[0,0]});assert(!o.done);work(o,10);assert(o.done);
});
test('護送需要護衛靠近、附近威脅清除；人物依折線走，不跳到終點',()=>{
 const def={kind:'escort',radius:14,speed:2,route:[[0,0],[4,0],[4,4]]},o=new Operation(def);
 work(o,10,{player:[30,0]});assert.deepEqual(o.pos,[0,0]);work(o,10,{threat:true});assert.deepEqual(o.pos,[0,0]);
 work(o,10);assert.equal(o.index,0);assert(Math.abs(o.pos[0]-2)<1e-5);assert.equal(o.pos[1],0);
 const r=new Operation(def);assert(r.restore(o.snapshot()));assert(!r.restore({...o.snapshot(),pos:[20,0]}));
 work(r,35);assert(r.done);assert.deepEqual(r.pos,[4,4]);
});
test('暫停不呼叫更新；不合法時間與大跳躍不會瞬間完成',()=>{
 const o=new Operation({kind:'console',points:[point(0,0)]}),s=o.snapshot();
 for(const dt of [0,-1,NaN,Infinity])o.step(dt,{player:[0,0],held:true});assert.deepEqual(o.snapshot(),s);
 o.step(100,{player:[0,0],held:true});assert.equal(o.progress,.1);assert(!o.done);
});
test('七章順序、32 段步兵任務、14 組機甲波次與現場目標完整串接',()=>{
 assert.deepEqual(CHAPTERS.map(c=>c.n),[1,2,3,4,5,6,7]);assert.equal(ENCOUNTERS.length,32);
 assert.equal(new Set(ENCOUNTERS.map(e=>e.id)).size,32);assert.equal(CHAPTERS[0].end.after,'C7');
 const kinds=new Set();for(const e of ENCOUNTERS){if(e.operation)kinds.add(e.operation.kind);if(e.after)assert(ENCOUNTERS.findIndex(x=>x.id===e.after)<ENCOUNTERS.indexOf(e));}
 assert.deepEqual([...kinds].sort(),['console','defend','escort']);
 for(const n of [4,5,6,7]){const c=MECH_CONFIGS[n];assert.equal(c.waves.length,c.route.length);assert.equal(c.goal.length,2);assert.equal(c.next,n===7?undefined:n+1);assert.equal(!!c.final,n===7);}
 assert.equal(Object.values(MECH_CONFIGS).reduce((n,c)=>n+c.waves.length,0),14);
});
