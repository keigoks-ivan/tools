import assert from 'node:assert/strict';
import {HairSystem} from '../js/hair.js';
import {guests} from '../js/looks.js';
import {FoamSystem} from '../js/foam.js';
import {createWash,createShape} from '../js/tools/care.js';
const length=s=>s.rest.reduce((a,b)=>a+b,0);
for(const profile of guests)for(const mode of ['loose','double','braids'])for(const curly of [true,false]){
 const h=new HairSystem(profile);if(mode!=='loose')h.tie(mode);h.dye(100,400,[239,120,180],.8);const lengths=h.strands.map(length),colors=h.strands.map(s=>s.nodes.map(n=>[...n.c])),pins=h.strands.map(s=>s.nodes.filter(n=>n.bx!==undefined).map(n=>[n.bx,n.by]));
 const tool=createShape({hair:h,react(){}},curly);tool.onDown({x:100,y:300});for(let y=320;y<550;y+=20)tool.onMove({x:100,y});tool.onUp();for(let i=0;i<180;i++)h.step(1/60);
 assert.ok(h.stats().finite);assert.equal(h.stats().upwardSegments,0);
 h.strands.forEach((s,i)=>{assert.ok(Math.abs(length(s)-lengths[i])<1e-8);assert.deepEqual(s.nodes.map(n=>n.c),colors[i]);assert.deepEqual(s.nodes.filter(n=>n.bx!==undefined).map(n=>[n.bx,n.by]),pins[i]);for(let j=1;j<s.nodes.length;j++){const a=s.nodes[j-1],b=s.nodes[j];assert.ok(Math.hypot(b.x-a.x,b.y-a.y)<s.rest[j-1]*1.08+.01)}});
 const saved=h.snapshot(),restored=new HairSystem(profile);assert.ok(restored.restore(saved));assert.deepEqual(restored.strands.map(s=>s.nodes.map(n=>[n.x,n.y,n.c])),h.strands.map(s=>s.nodes.map(n=>[n.x,n.y,n.c])));
}
const straight=new HairSystem(),curled=new HairSystem();assert.ok(straight.shape({x:100,y:430},false)>0);assert.ok(curled.shape({x:100,y:430},true)>0);assert.notDeepEqual(straight.snapshot(),curled.snapshot(),'curl and straighten must produce distinct shapes');
const h=new HairSystem(),foam=new FoamSystem(h),env={hair:h,foam,react(){}};const before=h.snapshot(),wash=createWash(env);wash.onDown({x:100,y:430});for(let i=0;i<100;i++)wash.update(.1);wash.onUp();assert.ok(foam.bubbles.length>0&&foam.bubbles.length<=180);assert.deepEqual(h.snapshot(),before,'washing preserves cut, dye and shape');
const saved=foam.snapshot();foam.restore([...saved,{strand:999,u:1,dx:0,dy:0,size:5},{...saved[0],size:NaN}]);assert.deepEqual(foam.snapshot(),saved);h.shape({x:100,y:430},true);assert.ok(foam.bubbles.every(b=>{const p=foam.point(b);return Number.isFinite(p.x+p.y)}),'bubbles follow styled hair');
const rinse=createWash(env,true);for(const b of [...foam.bubbles]){const p=foam.point(b);rinse.onDown(p);rinse.onUp()}assert.equal(foam.bubbles.length,0);foam.restore(saved);assert.equal(foam.bubbles.length,saved.length,'undo can restore bubbles');
assert.equal(foam.lather({x:-500,y:-500}),0);foam.restore(null);assert.equal(foam.bubbles.length,0);
console.log('PASS: curl and straight shapes across three guests and tied styles, material and dye preservation, saved shapes, bounded bubbles, rinse, bubble undo and invalid-state protection');
