import assert from 'node:assert/strict';
import {HairSystem} from '../js/hair.js';
import {guests} from '../js/looks.js';
for(const guest of guests){const h=new HairSystem(guest);assert.ok(h.strands.length>=150);const colors=h.strands[0].nodes[0].c;assert.deepEqual(colors,guest.hair.color);
 for(const mode of ['double','single']){h.reset();const rests=h.strands.map(s=>[...s.rest]);const count=h.tie(mode);assert.ok(count>0||guest.id==='honey'&&mode==='single',guest.id+' '+mode);for(let i=0;i<600;i++)h.step(1/60);assert.ok(h.stats().finite);assert.equal(h.stats().upwardSegments,0);h.strands.forEach((s,i)=>assert.ok(Math.abs(s.rest.reduce((a,b)=>a+b,0)-rests[i].reduce((a,b)=>a+b,0))<1e-8));
 const tied=h.strands.find(s=>s.tie);if(tied){const p=tied.nodes[tied.tie.index];assert.ok(Math.hypot(p.x-tied.tie.x,p.y-tied.tie.y)<.01)}
 const snapshot=h.snapshot();const restored=new HairSystem(guest);assert.ok(restored.restore(snapshot));assert.deepEqual(restored.strands.map(s=>s.nodes.map(p=>[p.x,p.y,p.c])),h.strands.map(s=>s.nodes.map(p=>[p.x,p.y,p.c])));h.untie();assert.equal(h.activeTies().length,0);
 }
}
const h=new HairSystem(),s=h.strands.find(s=>s.front&&!s.bang&&s.side===-1),n=s.nodes[7],before={x:n.x,y:n.y};
for(let i=0;i<8;i++){const p={x:n.x,y:n.y};h.comb(p,{x:p.x-18,y:p.y+25});h.step(1/60)}
const groomed={x:n.x,y:n.y};for(let i=0;i<600;i++)h.step(1/60);
assert.ok(Math.hypot(n.x-before.x,n.y-before.y)>8,'groomed shape should persist');assert.ok(Math.hypot(n.x-groomed.x,n.y-groomed.y)<12,'must not spring back');
h.reset();h.tie('double');assert.equal(h.activeTies().length,2);h.cut({x:0,y:320},{x:390,y:320});assert.equal(h.activeTies().length,0,'cut above bands frees the hair');
const bad=h.snapshot();bad.strands[0].nodes[1].x=NaN;assert.equal(h.restore(bad),false);
console.log('PASS: distinct profiles, persistent grooming, physical ties, preserved lengths, cut releases bands, editable snapshots, invalid snapshot protection');
