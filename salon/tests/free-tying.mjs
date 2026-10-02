import assert from 'node:assert/strict';
import {HairSystem} from '../js/hair.js';
import {guests} from '../js/looks.js';
import {createTie} from '../js/tools/tie.js';
const length=s=>s.rest.reduce((a,b)=>a+b,0);
const material=h=>h.strands.map(s=>({length:length(s),root:s.nodes[0].c}));
for(const guest of guests){
 const h=new HairSystem(guest),before=material(h);h.dye(110,300,[239,100,180],.8);
 assert.ok(h.tieAt({x:100,y:300},2)>0);assert.ok(h.tieAt({x:290,y:205},4)>0);
 const [left,right]=h.tieHandles(),rightState=h.strands.filter(s=>s.tie?.band===right.index).map(s=>structuredClone(s));
 assert.ok(h.tieAt({x:85,y:200},left.color,left.index)>0);
 assert.deepEqual(h.strands.filter(s=>s.tie?.band===right.index),rightState,'moving one band preserves the other side');
 for(let i=0;i<180;i++)h.step(1/60);
 h.strands.forEach((s,i)=>{assert.ok(Math.abs(length(s)-before[i].length)<1e-8,'material length');assert.deepEqual(s.nodes[0].c,before[i].root);for(let j=1;j<s.nodes.length;j++){const a=s.nodes[j-1],b=s.nodes[j];assert.ok(Math.hypot(b.x-a.x,b.y-a.y)<s.rest[j-1]*1.08+.001,'free ties must not stretch hair')}});
 const saved=h.snapshot(),restored=new HairSystem(guest);assert.ok(restored.restore(saved));assert.deepEqual(restored.tieHandles(),h.tieHandles());assert.deepEqual(restored.strands.map(s=>s.nodes.map(p=>[p.x,p.y,p.c])),h.strands.map(s=>s.nodes.map(p=>[p.x,p.y,p.c])));
 const unchanged=h.snapshot();for(const point of [{x:195,y:290},{x:-100,y:200},{x:300,y:600},{x:NaN,y:200}])assert.equal(h.tieAt(point),0);assert.deepEqual(h.snapshot(),unchanged,'invalid drops never alter the haircut');
 assert.equal(h.tieAt({x:340,y:500},left.color,left.index),0,'unreachable movement must keep the original band');assert.deepEqual(h.snapshot(),unchanged);
 assert.ok(h.releaseTie(left.index)>0);assert.equal(h.tieHandles().length,1);assert.equal(h.tieHandles()[0].index,right.index);
 h.untie();assert.equal(h.tieHandles().length,0);
 assert.ok(h.tieAt({x:195,y:165},3)>0,'top gathering');assert.equal(h.tieHandles().length,1);assert.ok(h.strands.filter(s=>s.tie).some(s=>s.side<0));assert.ok(h.strands.filter(s=>s.tie).some(s=>s.side>0));
 const bad=h.snapshot();bad.ties[h.tieHandles()[0].index].color=99;assert.equal(new HairSystem(guest).restore(bad),false,'reject corrupt band colors');
 h.cut({x:0,y:150},{x:390,y:150});assert.ok(new HairSystem(guest).restore(h.snapshot()),'cut free ties remain restorable');
}
// Existing bubble rings must not be overwritten by a new free band on the other side.
const h=new HairSystem();h.tie('braids');const protectedRings=h.strands.filter(s=>s.side>0&&s.tie).flatMap(s=>s.tie.extra||[]).map(e=>[e.band,structuredClone(h.ties[e.band])]);h.tieAt({x:80,y:240},0);for(const [index,band] of protectedRings)assert.deepEqual(h.ties[index],band);
h.untie();const tool=createTie({hair:h,colorIndex:1,react(){}}),original=h.snapshot();tool.onDown({x:90,y:180},{spawn:true});tool.onMove({x:100,y:300});tool.onUp({cancel:true});assert.deepEqual(h.snapshot(),original,'cancelled drags do not create bands');
tool.onDown({x:100,y:300});tool.onUp();assert.equal(h.tieHandles().length,1,'tap hair to tie');const band=h.tieHandles()[0];tool.onDown({x:band.x,y:band.y});tool.onUp();assert.equal(h.tieHandles().length,0,'tap band to release');
for(let i=0;i<40;i++){h.tieAt({x:100,y:300},i%6);h.tieAt({x:90,y:230},i%6,h.tieHandles()[0].index);h.releaseTie(h.tieHandles()[0].index)}assert.ok(h.ties.length<5,'reuse inactive band slots');
console.log('PASS: free positions across three guests, independent bands, natural lengths, saved color and shapes, invalid and unreachable drops, cut/restore, bubble ring isolation, cancelled drags, tap actions and slot reuse');
