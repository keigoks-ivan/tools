import {bottle} from './visual.js?v=6';
import {palette} from '../data.js?v=6';
import {playSfx} from '../sfx.js?v=6';
export function createColor(env){let p=null,time=0;
 const spray=(q,dt)=>env.hair.dye(q.x,q.y,palette[env.colorIndex],dt);
 return {onDown(q){p=q;spray(q,.08);playSfx('spray')},onMove(q){if(p){let dx=q.x-p.x,dy=q.y-p.y,n=Math.max(1,Math.ceil(Math.hypot(dx,dy)/9));for(let i=1;i<=n;i++)spray({x:p.x+dx*i/n,y:p.y+dy*i/n},.05)}p=q},onUp(){p=null},update(dt){if(!p)return;time+=dt;spray(p,dt);if(time>.045){time=0;let c=palette[env.colorIndex];for(let i=0;i<4;i++){let a=Math.random()*Math.PI*2,r=Math.random()*38;env.hair.particles.push({x:p.x+18+Math.random()*4,y:p.y+30,vx:-50+(Math.random()-.5)*100,vy:-100+(Math.random()-.5)*90,life:.3+Math.random()*.4,color:`rgb(${c.join(',')})`,size:1+Math.random()*2})}}},drawOverlay(ctx){if(p)bottle(ctx,p,`rgb(${palette[env.colorIndex].join(',')})`)}}}
