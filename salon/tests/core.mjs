import assert from 'node:assert/strict';
import {HairSystem} from '../js/hair.js';
const h=new HairSystem();assert.equal(h.strands.length,208);assert.ok(h.strands.every(s=>s.nodes.length>=8&&s.nodes.length<=16));
const cutY=430,affected=h.strands.filter(s=>s.nodes[0].y<cutY&&s.nodes.at(-1).y>cutY);
assert.ok(h.cut({x:0,y:cutY},{x:390,y:cutY})>100);
for(const s of affected)assert.ok(Math.abs(s.nodes.at(-1).y-cutY)<1e-6);
assert.ok(h.fallen.length>0);
const node=h.strands.find(s=>!s.bang).nodes[3],near=[...node.c],remote=h.strands.find(s=>s.bang).nodes[0],far=[...remote.c];
h.dye(node.x,node.y,[244,105,180],1);assert.notDeepEqual(node.c,near);assert.deepEqual(remote.c,far);
const strand=affected[0],initial=strand.nodes.at(-1).y;
for(let i=0;i<800;i++){const p=strand.nodes.at(-1);h.grow(p.x,p.y,1/60);h.step(1/60);}
assert.ok(strand.nodes.at(-1).y>initial+40);assert.ok(h.strands.every(s=>s.nodes.length<=16));assert.equal(h.stats().upwardSegments,0);assert.ok(h.stats().finite);
for(let i=0;i<180;i++){h.comb({x:0,y:580},{x:390,y:180});h.step(1/60);}
assert.equal(h.stats().upwardSegments,0);assert.ok(h.stats().finite);h.reset();assert.equal(h.cutCount,0);assert.equal(h.fallen.length,0);assert.equal(h.strands.length,208);
console.log('PASS: strand count, exact intersection, detached tails, local color, gradual growth cap, comb stability, reset');
