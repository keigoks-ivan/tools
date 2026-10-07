import {splitPolygon,area,contains} from './simulation.js?v=7';
export const stages=['choose','chop','crack','whisk','pour','cook','plate','feed','done'];
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const outline=()=>Array.from({length:32},(_,i)=>({x:Math.cos(i*Math.PI/16)*140,y:Math.sin(i*Math.PI/16)*112}));
export function createRecipe(){return {stage:'choose',picked:{tomato:false,egg:false},pieces:[{uid:1,x:0,y:0,ox:0,oy:0,poly:outline(),cut:false}],nextId:2,cracked:false,mix:0,poured:{tomato:false,egg:false},heat:false,cooked:0,scramble:0,food:[],bites:0,chew:0,transfer:null};}
export function pick(s,id){if(s.stage!=='choose'||!Object.hasOwn(s.picked,id)||s.picked[id])return false;s.picked[id]=true;return true;}
export function ready(s){return s.stage==='choose'?Object.values(s.picked).every(Boolean):s.stage==='chop'?s.pieces.some(p=>p.cut):s.stage==='crack'?s.cracked:s.stage==='whisk'?s.mix>=.95:s.stage==='pour'?Object.values(s.poured).every(Boolean)&&!s.transfer:s.stage==='cook'?s.cooked>=.95&&s.scramble>=.15:s.stage==='plate'?s.plated&&!s.transfer:s.stage==='feed'?s.bites>=3&&s.chew===0:s.stage==='done';}
export function advance(s){if(!ready(s)||s.stage==='done')return false;s.stage=stages[stages.indexOf(s.stage)+1];return true;}
export function chop(s,a,b){
  if(s.stage!=='chop'||s.pieces.length>=12||Math.hypot(b.x-a.x,b.y-a.y)<18)return 0;
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);let cuts=0;
  s.pieces=s.pieces.flatMap(p=>{
    const aa={x:a.x-p.x,y:a.y-p.y},bb={x:b.x-p.x,y:b.y-p.y};
    if(!contains(p.poly,aa)&&!contains(p.poly,bb)&&!p.poly.some((q,i)=>{const r=p.poly[(i+1)%p.poly.length],cross=(u,v,w)=>(v.x-u.x)*(w.y-u.y)-(v.y-u.y)*(w.x-u.x);return Math.max(aa.x,bb.x)>=Math.min(q.x,r.x)&&Math.min(aa.x,bb.x)<=Math.max(q.x,r.x)&&Math.max(aa.y,bb.y)>=Math.min(q.y,r.y)&&Math.min(aa.y,bb.y)<=Math.max(q.y,r.y)&&cross(aa,bb,q)*cross(aa,bb,r)<=0&&cross(q,r,aa)*cross(q,r,bb)<=0;}))return [p];
    const parts=splitPolygon(p.poly,aa,bb);if(!parts||parts.some(poly=>area(poly)<450)||s.pieces.length+cuts>=12)return [p];cuts++;
    return parts.map((poly,i)=>{const x=poly.reduce((n,q)=>n+q.x,0)/poly.length,y=poly.reduce((n,q)=>n+q.y,0)/poly.length,sign=i?-1:1;return {uid:s.nextId++,x:p.x+x-dy/len*sign*9,y:p.y+y+dx/len*sign*9,ox:p.ox-x,oy:p.oy-y,poly:poly.map(q=>({x:q.x-x,y:q.y-y})),cut:true};});
  });return cuts;
}
export function crack(s){if(s.stage!=='crack'||s.cracked)return false;s.cracked=true;return true;}
export function stir(s,distance){if(s.stage!=='whisk')return false;s.mix=clamp(s.mix+Math.max(0,distance)/1000,0,1);return true;}
export function pour(s,id){
  if(s.stage!=='pour'||!Object.hasOwn(s.poured,id)||s.poured[id]||s.transfer)return false;
  s.poured[id]=true;s.transfer={id,t:0};
  if(id==='tomato')s.food.push(...s.pieces.map((p,i)=>({kind:'tomato',piece:p,x:Math.cos(i*2.4)*85,y:Math.sin(i*2.4)*60,angle:i*.8,vx:0,vy:0})));
  else s.food.push(...Array.from({length:18},(_,i)=>({kind:'egg',x:Math.cos(i*2.4)*(35+i%4*24),y:Math.sin(i*2.4)*(20+i%3*25),angle:i*1.2,vx:0,vy:0,size:16+i%4*5})));
  return true;
}
export function push(s,a,b){
  if(s.stage!=='cook')return false;const dx=b.x-a.x,dy=b.y-a.y;
  if(s.heat)s.scramble=clamp(s.scramble+Math.hypot(dx,dy)/1300,0,1);
  for(const p of s.food)if(Math.hypot(p.x-b.x,p.y-b.y)<100){p.vx+=dx*5;p.vy+=dy*5;p.angle+=dx*.006;}
  return true;
}
export function plate(s){if(s.stage!=='plate'||s.plated||s.transfer)return false;s.heat=false;s.plated=true;s.transfer={id:'plate',t:0};return true;}
export function feed(s){if(s.stage!=='feed'||s.bites>=3||s.chew>0)return false;s.bites++;s.chew=1.6;return true;}
export function stepRecipe(s,dt){
  dt=clamp(dt,0,.05);if(s.transfer){s.transfer.t+=dt;if(s.transfer.t>=1.05)s.transfer=null;}
  s.chew=Math.max(0,s.chew-dt);
  if(s.stage==='cook'&&s.heat&&s.poured.egg&&s.poured.tomato)s.cooked=clamp(s.cooked+dt/12,0,1);
  for(const p of s.food){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.exp(-dt*6);p.vy*=Math.exp(-dt*6);const d=Math.hypot(p.x,p.y*1.25);if(d>165){p.x*=165/d;p.y*=165/d;p.vx*=-.4;p.vy*=-.4;}}
  if(dt>0)for(let i=0;i<s.food.length;i++)for(let j=i+1;j<s.food.length;j++){const a=s.food[i],b=s.food[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),spacing=(a.kind==='egg'?22:30)+(b.kind==='egg'?22:30);if(d<spacing){const nx=d>.01?dx/d:1,ny=d>.01?dy/d:0,amount=(spacing-d)*Math.min(.24,dt*8);a.x-=nx*amount;a.y-=ny*amount;b.x+=nx*amount;b.y+=ny*amount;}}
}
