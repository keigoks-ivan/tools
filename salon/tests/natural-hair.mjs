import assert from 'node:assert/strict';
import {HairSystem,TIE_MODES} from '../js/hair.js';
import {guests} from '../js/looks.js';
const length=s=>s.rest.reduce((a,b)=>a+b,0);
const turn=(a,b,c)=>{const ux=b.x-a.x,uy=b.y-a.y,vx=c.x-b.x,vy=c.y-b.y;return Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy)/(Math.hypot(ux,uy)*Math.hypot(vx,vy)||1))))*180/Math.PI};
for(const guest of guests){
 for(const mode of TIE_MODES.filter(m=>m!=='loose')){
  const hair=new HairSystem(guest),lengths=hair.strands.map(length);hair.dye(100,340,[233,97,179],.8);hair.tie(mode);
  for(let frame=0;frame<180;frame++)hair.step(1/60);
  hair.strands.forEach((s,i)=>{
   assert.ok(Math.abs(length(s)-lengths[i])<1e-8,`${guest.id}/${mode}: material length`);
   for(let j=1;j<s.nodes.length;j++){
    const a=s.nodes[j-1],b=s.nodes[j],stretch=Math.hypot(b.x-a.x,b.y-a.y)/Math.max(.1,s.rest[j-1]);
    assert.ok(stretch<1.08,`${guest.id}/${mode}: stretched segment ${stretch}`);
    if(s.tie&&!s.tie.fixed&&j>s.tie.index&&j<s.nodes.length-1)assert.ok(turn(a,b,s.nodes[j+1])<65,`${guest.id}/${mode}: kinked tail`);
    if(s.tie?.guided&&j<=s.tie.index)assert.ok(Math.hypot(b.x-b.bx,b.y-b.by)<1e-8,'scalp curve must stay anchored');
   }
  });
  const saved=hair.snapshot(),restored=new HairSystem(guest);assert.ok(restored.restore(saved));assert.deepEqual(restored.strands.map(s=>({tie:s.tie,rest:s.rest,nodes:s.nodes.map(p=>[p.x,p.y,p.c])})),hair.strands.map(s=>({tie:s.tie,rest:s.rest,nodes:s.nodes.map(p=>[p.x,p.y,p.c])})));
  const colors=hair.strands.map(s=>s.nodes.map(p=>p.c));hair.untie();assert.deepEqual(hair.strands.map(s=>s.nodes.map(p=>p.c)),colors,'untying preserves local dye');assert.equal(hair.activeTies().length,0);
 }
 const hair=new HairSystem(guest),lengths=hair.strands.map(length),roots=hair.strands.map(s=>[s.rootX,s.rootY]);
 for(let stroke=0;stroke<12;stroke++){const x=stroke%2?280:110;for(let j=0;j<35;j++){hair.comb({x,y:220+j*8},{x:x+(stroke%2?6:-6),y:228+j*8});hair.step(1/60)}}
 hair.strands.forEach((s,i)=>{assert.equal(length(s),lengths[i]);assert.deepEqual([s.nodes[0].x,s.nodes[0].y],roots[i]);if(s.groomed)for(let j=1;j<=3;j++)assert.deepEqual([s.nodes[j].x,s.nodes[j].y],[s.nodes[j].paintX,s.nodes[j].paintY],'brush must preserve the scalp silhouette');for(let j=3;j<s.nodes.length-1;j++)if(!s.bang)assert.ok(turn(s.nodes[j-1],s.nodes[j],s.nodes[j+1])<40,'repeated brushing must stay smooth')});
 assert.equal(hair.stats().upwardSegments,0);assert.ok(hair.stats().finite);
}
const hair=new HairSystem();hair.tie('double');const old=hair.snapshot();for(const s of old.strands)if(s.tie){delete s.tie.guided;for(const p of s.nodes){delete p.bx;delete p.by}}
const restored=new HairSystem();assert.ok(restored.restore(old));assert.ok(restored.strands.every(s=>!s.tie||s.tie.guided),'old tied drafts must migrate');
restored.cut({x:0,y:320},{x:390,y:320});assert.equal(restored.activeTies().length,0);assert.ok(restored.strands.every(s=>s.tie||s.nodes.every(p=>p.bx===undefined)),'cutting above a band must release every scalp anchor');
console.log('PASS: 24 profile/style shapes, smooth short tails, anchored scalp curves, material length and local dye, repeated brushing, snapshot round trips, old draft migration and cut release');
