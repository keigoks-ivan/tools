// The workshop owns physical food pieces, rather than a sequence of tap counters.
import {foods} from './model.js?v=7';
import {sprites} from './food-sprites.js?v=7';
export const foodIds=Object.keys(foods);
const circle=(rx,ry,n=20)=>Array.from({length:n},(_,i)=>({x:Math.cos(i*Math.PI*2/n)*rx,y:Math.sin(i*Math.PI*2/n)*ry}));
export function polygon(id){return sprites[id]?sprites[id].poly.map(([x,y])=>({x,y})):circle(86,90);}
export function area(poly){return Math.abs(poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p.x*q.y-q.x*p.y;},0))/2;}
function center(poly){return {x:poly.reduce((n,p)=>n+p.x,0)/poly.length,y:poly.reduce((n,p)=>n+p.y,0)/poly.length};}
export function localPoint(piece,point){const c=Math.cos(-piece.angle),s=Math.sin(-piece.angle),x=(point.x-piece.x)/piece.scale,y=(point.y-piece.y)/piece.scale;return {x:x*c-y*s,y:x*s+y*c};}
export function contains(poly,p){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
export function hitPiece(pieces,point){return [...pieces].reverse().find(p=>contains(p.poly,localPoint(p,point)));}
export function splitPolygon(poly,a,b){
  const side=p=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
  function clip(sign){const out=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],sp=side(p)*sign,sq=side(q)*sign,pIn=sp>=-1e-8,qIn=sq>=-1e-8;if(pIn)out.push({...p});if(pIn!==qIn){const t=sp/(sp-sq);out.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});}}return out;}
  const left=clip(1),right=clip(-1);
  return left.length>=3&&right.length>=3&&area(left)>90&&area(right)>90?[left,right]:null;
}
function segmentTouches(poly,a,b){
  if(contains(poly,a)||contains(poly,b))return true;
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  return poly.some((p,i)=>{const q=poly[(i+1)%poly.length];return Math.max(a.x,b.x)>=Math.min(p.x,q.x)&&Math.min(a.x,b.x)<=Math.max(p.x,q.x)&&Math.max(a.y,b.y)>=Math.min(p.y,q.y)&&Math.min(a.y,b.y)<=Math.max(p.y,q.y)&&cross(a,b,p)*cross(a,b,q)<=0&&cross(p,q,a)*cross(p,q,b)<=0;});
}
export function createWorkshop(){return {station:'fridge',board:[],vessels:{pan:[],pot:[],blender:[]},plate:[],method:'pan',heat:{pan:0,pot:0},liquid:{pan:0,pot:0,blender:0},seasoning:0,blending:false,blend:0,juice:false,nextId:1,served:0};}
export function addFood(s,id){
  if(!foodIds.includes(id)||s.board.length>=24)return null;
  const n=s.board.length,p={uid:s.nextId++,id,x:360+(n?Math.sin(n*2.4)*140:0),y:270+(n?Math.cos(n*2.4)*75:0),scale:n?1.3:2.05,angle:0,poly:polygon(id),tex:{x:-100,y:-100},vx:0,vy:0,spin:0,cooked:0,blended:0,cut:0};
  s.board.push(p);s.station='board';return p;
}
export function cutFood(s,a,b){
  if(Math.hypot(b.x-a.x,b.y-a.y)<24||s.board.length>=40)return 0;
  let cuts=0,available=40-s.board.length;const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),normal={x:-dy/len,y:dx/len};
  s.board=s.board.flatMap(p=>{
    if(['milk','flour','rice'].includes(p.id)||available<1)return [p];
    const la=localPoint(p,a),lb=localPoint(p,b);
    if(!segmentTouches(p.poly,la,lb))return [p];
    if(p.id==='egg'&&!p.cracked){p.cracked=true;p.poured=true;p.poly=circle(75,58);p.tex={x:-100,y:-100};cuts++;return [p];}
    const parts=splitPolygon(p.poly,la,lb);if(!parts)return [p];cuts++;available--;
    return parts.map((poly,i)=>{const c=center(poly),cos=Math.cos(p.angle),sin=Math.sin(p.angle),sign=i?1:-1,shift=v=>({x:v.x-c.x,y:v.y-c.y}),onLine=poly.filter(v=>Math.abs((lb.x-la.x)*(v.y-la.y)-(lb.y-la.y)*(v.x-la.x))<1e-5),edges=(p.edges||[]).map(edge=>({a:shift(edge.a),b:shift(edge.b)}));if(onLine.length>=2)edges.push({a:shift(onLine[0]),b:shift(onLine[onLine.length-1])});return {...p,uid:s.nextId++,x:p.x+(c.x*cos-c.y*sin)*p.scale+normal.x*sign*11,y:p.y+(c.x*sin+c.y*cos)*p.scale+normal.y*sign*11,poly:poly.map(shift),tex:{x:p.tex.x-c.x,y:p.tex.y-c.y},edges,vx:normal.x*sign*90,vy:normal.y*sign*90,spin:sign*.16,cut:p.cut+1};});
  });return cuts;
}
function vesselPlace(p,index){p.x=350+Math.cos(index*2.4)*(40+index%4*25);p.y=245+Math.sin(index*2.4)*(35+index%3*18);p.scale=Math.min(p.scale,1.2);p.vx=(index%2?1:-1)*70;p.vy=-30;p.angle=index*.4;}
export function transferToCooker(s,uid=null){
  const moving=uid===null?[...s.board]:s.board.filter(p=>p.uid===uid);if(!moving.length)return 0;
  const ids=new Set(moving.map(p=>p.uid));s.board=s.board.filter(p=>!ids.has(p.uid));
  for(const p of moving){if(['milk','flour','rice'].includes(p.id)||p.id==='egg'&&!p.cracked){p.poured=true;p.cracked=p.id==='egg';p.poly=circle(65,60);p.tex={x:-100,y:-100};}vesselPlace(p,s.vessels[s.method].length);s.vessels[s.method].push(p);}
  if(s.method==='pan'&&s.vessels.pan.some(p=>p.id==='flour')&&s.vessels.pan.some(p=>p.id==='milk'))for(const p of s.vessels.pan)if(['flour','milk'].includes(p.id)){p.pancake=true;p.poly=circle(70,50);}
  s.juice=false;return moving.length;
}
export function addLiquid(s,kind,amount=.35){const method=s.method;if(kind==='water'&&method==='pan')return false;if(kind==='oil'&&method!=='pan')return false;s.liquid[method]=Math.min(1,s.liquid[method]+amount);return true;}
export function pushFood(s,from,to){
  const pieces=s.vessels[s.method],dx=to.x-from.x,dy=to.y-from.y;
  for(const p of pieces){const distance=Math.hypot(p.x-to.x,p.y-to.y);if(distance<110){const strength=1-distance/150;p.vx+=dx*10*strength;p.vy+=dy*10*strength;p.spin+=dx*.007;}}
}
export function tossFood(s,amount=1){for(const p of s.vessels[s.method]){p.vy-=220*amount;p.vx+=(p.x-350)*amount;p.spin+=.8*amount;}}
export function plateFood(s){
  const pieces=s.vessels[s.method];if(!pieces.length)return false;
  s.plate.push(...pieces);s.vessels[s.method]=[];s.plateMethod=s.method;s.plateLiquid=s.liquid[s.method];s.plateBlend=s.blend;if(s.method!=='blender')s.heat[s.method]=0;s.blending=false;
  if(s.method!=='pan')s.liquid[s.method]=0;
  s.plate.forEach((p,i)=>{p.x=340+Math.cos(i*2.4)*(45+i%4*22);p.y=285+Math.sin(i*2.4)*(35+i%3*17);p.scale=Math.min(p.scale,.82);p.vx=0;p.vy=0;});s.station='serve';return true;
}
export function stepWorkshop(s,dt){
  dt=Math.max(0,Math.min(dt,.05));
  for(const [location,pieces] of [['board',s.board],...Object.entries(s.vessels)]){
    for(const p of pieces){
      if(location!=='board'&&s.heat[location])p.cooked=Math.min(1,p.cooked+dt*s.heat[location]/10);
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.angle+=p.spin*dt;p.vx*=Math.exp(-dt*5);p.vy*=Math.exp(-dt*5);p.spin*=Math.exp(-dt*5);
      if(location==='board'){p.x=Math.max(115,Math.min(605,p.x));p.y=Math.max(s.boardBounds?.top??110,Math.min(s.boardBounds?.bottom??420,p.y));}
      else if(location==='blender'){p.x+=(350-p.x)*dt*2;p.y+=(245-p.y)*dt*2;if(s.blending){p.blended=Math.min(1,p.blended+dt/3);p.angle+=dt*16;p.x+=Math.cos(p.uid+s.blend*35)*dt*220;p.y+=Math.sin(p.uid+s.blend*35)*dt*160;}}
      else{const dx=p.x-350,dy=(p.y-245)*1.35,d=Math.hypot(dx,dy);if(d>140){p.x=350+dx/d*140;p.y=245+dy/d*104;p.vx*=-.55;p.vy*=-.55;}}
    }
  }
  // Soft contact keeps a spoon from pushing every piece into one unreadable pile.
  for(const location of ['pan','pot']){const pieces=s.vessels[location];for(let i=0;i<pieces.length;i++)for(let j=i+1;j<pieces.length;j++){const a=pieces[i],b=pieces[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),r=(Math.sqrt(area(a.poly))*a.scale+Math.sqrt(area(b.poly))*b.scale)*.4;if(d<r){const nx=d>1e-6?dx/d:1,ny=d>1e-6?dy/d:0,push=(r-d)*.3;a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;}}}
  if(s.vessels.blender.length){s.blend=s.vessels.blender.reduce((n,p)=>n+p.blended,0)/s.vessels.blender.length;s.juice=s.blend>=.99;}
}
