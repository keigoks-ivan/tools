import assert from 'node:assert/strict';
import {createLayout,toWorld,inStage} from '../js/layout.js';
const sizes=[[320,568],[360,640],[390,844],[430,932],[820,1180],[1180,820],[844,390],[667,320],[1440,900],[520,900]];
for(const [w,h] of sizes){
 const l=createLayout(w,h,true);
 assert.equal(l.buttons.length,9,'all nine tools must be visible');
 assert.ok(l.world.scale>0);
 for(const b of l.buttons){assert.ok(b.r*2>=64);assert.ok(b.x-b.r>=0&&b.x+b.r<=w);assert.ok(b.y-b.r>=0&&b.y+b.r<=h);assert.equal(inStage(b,l),false)}
 for(const c of l.colors){assert.ok(c.x-c.r>=0&&c.x+c.r<=w&&c.y-c.r>=0&&c.y+c.r<=h);assert.equal(inStage(c,l),false)}
 const controls=[...l.buttons,...l.colors];
 for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=a.r+b.r,`overlap at ${w}x${h}`)}
 for(const p of [{x:195,y:123},{x:80,y:430},{x:310,y:603}]){
  const screen={x:p.x*l.world.scale+l.world.x,y:p.y*l.world.scale+l.world.y};
  assert.ok(inStage(screen,l),`hair cropped at ${w}x${h}`);
  const back=toWorld(screen,l);assert.ok(Math.abs(back.x-p.x)<1e-8&&Math.abs(back.y-p.y)<1e-8);
 }
}
console.log('PASS: 10 screen sizes, nine visible 64px tools, no clipped/overlapping controls, visible hair, exact pointer mapping');
