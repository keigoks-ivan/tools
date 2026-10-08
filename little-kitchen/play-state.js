import {foods} from './model.js?v=7';
import {createWorkshop,addFood,cutFood,transferToCooker,plateFood,stepWorkshop,pushFood,area,polygon} from './simulation.js?v=11';

export const shelves=[['tomato','egg','carrot','broccoli','potato','corn'],['strawberry','banana','apple','orange','cucumber','pepper'],['fish','chicken','shrimp','tofu','onion','mushroom'],['milk','flour','rice','bread','cheese','seaweed']];
export const friends=[{id:'bear',name:'小熊',likes:['strawberry','banana','milk','flour'],color:'#c18b5b'},{id:'bunny',name:'小兔',likes:['carrot','broccoli','corn','apple'],color:'#c7bd9c'}];
const fruit=['strawberry','banana','apple','orange'];
const meat=['chicken','fish','shrimp'];
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const mass=p=>area(p.poly)/area(polygon(p.id))*(p.remaining??1);
const average=(pieces,key)=>pieces.length?pieces.reduce((n,p)=>n+(p[key]||0)*mass(p),0)/pieces.reduce((n,p)=>n+mass(p),0):0;
export function createPlay(){const s=createWorkshop();return {...s,station:'board',spices:{pan:{salt:0,pepper:0,lemon:0},pot:{salt:0,pepper:0,lemon:0},blender:{salt:0,pepper:0,lemon:0}},plateSpices:{salt:0,pepper:0,lemon:0},friend:0,reaction:null,chew:0,bites:0};}
export function ingredients(s,id,target=s.station==='stove'?s.method:s.station==='serve'?'plate':'board'){
  if(!Object.hasOwn(foods,id)||!['board','pan','pot','blender','plate'].includes(target))return false;
  if(s.board.length+Object.values(s.vessels).reduce((n,v)=>n+v.length,0)+s.plate.length>=72)return false;
  const station=s.station,method=s.method,p=addFood(s,id);if(!p)return false;
  p.mixed=0;p.browned=0;p.preparation=target==='plate'?'raw':target;
  if(target!=='board'){
    if(target==='plate'){s.board=s.board.filter(q=>q.uid!==p.uid);s.plate.push(p);s.plateMethod??='raw';placePlate(s);}
    else{s.method=target;transferToCooker(s,p.uid);s.method=method;}
  }
  s.station=station;s.reaction=null;return p;
}
export function chop(s,a,b){return cutFood(s,a,b);}
export function moveBoard(s,target,uid=null){
  if(!['pan','pot','blender','plate'].includes(target))return 0;
  const moving=s.board.filter(p=>uid===null||p.uid===uid);if(!moving.length)return 0;
  if(target==='plate'){const ids=new Set(moving.map(p=>p.uid));s.board=s.board.filter(p=>!ids.has(p.uid));s.plate.push(...moving);s.plateMethod??='raw';placePlate(s);return moving.length;}
  for(const p of moving)p.preparation=target;
  const old=s.method;s.method=target;const n=transferToCooker(s,uid);s.method=old;return n;
}
function fitPiece(p,rx,ry){
  const cos=Math.cos(p.angle),sin=Math.sin(p.angle),extent=Math.max(...p.poly.map(v=>Math.hypot((v.x*cos-v.y*sin)*p.scale/rx,(v.x*sin+v.y*cos)*p.scale/ry)));
  if(extent>.84)p.scale*=.84/extent;
  const room=1-Math.min(extent,.84),dx=p.x-350,dy=p.y-245,d=Math.hypot(dx/rx,dy/ry);
  if(d>room){p.x=350+dx*room/d;p.y=245+dy*room/d;}
}
function placePlate(s){s.plate.forEach((p,i)=>{p.x=350+Math.cos(i*2.4)*(25+i%4*26);p.y=245+Math.sin(i*2.4)*(18+i%3*24);p.scale=Math.min(p.scale,.82);p.vx=p.vy=p.spin=0;fitPiece(p,165*.82,165*.57);});}
export function pour(s,method=s.method){
  if(!s.vessels[method]?.length)return false;
  const old=s.method;s.method=method;const already=s.plate.length,previous={...s.plateSpices};
  if(!plateFood(s)){s.method=old;return false;}
  for(const key of ['salt','pepper','lemon'])s.plateSpices[key]=already?Math.max(previous[key],s.spices[method][key]):s.spices[method][key];
  s.spices[method]={salt:0,pepper:0,lemon:0};s.method=old;s.reaction=null;s.bites=0;placePlate(s);return true;
}
export function season(s,key){
  if(!['salt','pepper','lemon'].includes(key))return false;
  const target=s.station==='serve'?s.plateSpices:s.spices[s.method],pieces=s.station==='serve'?s.plate:s.vessels[s.method];
  if(!pieces.length)return false;target[key]=clamp(target[key]+.35,0,1.4);s.reaction=null;return true;
}
export function stir(s,a,b){pushFood(s,a,b);const d=Math.hypot(a.x-b.x,a.y-b.y);for(const p of s.vessels[s.method])if(p.id==='egg'&&Math.hypot(p.x-b.x,p.y-b.y)<165)p.mixed=clamp((p.mixed||0)+d/1200);}
export function tick(s,dt){
  dt=clamp(dt,0,.05);stepWorkshop(s,dt);s.chew=Math.max(0,s.chew-dt);
  // Account for the whole piece, so a large egg or cutlet stays inside the photographed pan opening.
  for(const method of ['pan','pot'])for(const p of s.vessels[method])fitPiece(p,...(method==='pan'?[175*.92,175*.66]:[195*.70,195*.43]));
  for(const method of ['pan','pot'])if(s.heat[method])for(const p of s.vessels[method])if(p.cooked>=.98&&method==='pan')p.browned=clamp((p.browned||0)+dt*s.heat[method]/32);
}
export function describe(pieces,method='raw',spices={}){
  if(!pieces.length)return null;
  const ids=[...new Set(pieces.map(p=>p.id))],has=id=>ids.includes(id),cooked=average(pieces,'cooked'),blend=average(pieces,'blended');
  let kind=method==='pot'?'soup':method==='blender'&&blend>.35?'juice':'salad';
  if(method==='blender'&&blend>.35&&has('milk')&&ids.some(id=>fruit.includes(id)))kind='smoothie';
  if(method==='pan')kind=has('flour')&&has('milk')?'pancake':has('rice')?'fried-rice':has('bread')&&ids.length>1?'sandwich':has('egg')?(average(pieces.filter(p=>p.id==='egg'),'mixed')>.22?'scrambled-egg':'fried-egg'):'stir-fry';
  const total=pieces.reduce((n,p)=>n+mass(p),0)||1;
  const color='#'+[0,1,2].map(i=>Math.round(pieces.reduce((n,p)=>n+parseInt(foods[p.id][3].slice(1+i*2,3+i*2),16)*mass(p),0)/total).toString(16).padStart(2,'0')).join('');
  return {kind,ids,color,cooked,blend,browned:average(pieces,'browned'),spices:{salt:spices.salt||0,pepper:spices.pepper||0,lemon:spices.lemon||0},rawMeat:pieces.some(p=>meat.includes(p.id)&&p.cooked<.35)};
}
export function taste(dish,friend=0){
  if(!dish)return null;
  if(dish.spices.pepper>=.7)return 'spicy';
  if(dish.spices.lemon>=.7)return 'sour';
  if(dish.spices.salt>1)return 'salty';
  if(dish.browned>.65)return 'smoky';
  if(dish.rawMeat||['juice','smoothie'].includes(dish.kind)&&dish.ids.some(id=>meat.includes(id)||id==='onion'))return 'surprise';
  if(dish.ids.some(id=>friends[friend%friends.length].likes.includes(id)))return 'love';
  return 'yum';
}
export function feed(s){
  if(!s.plate.length||s.chew>0)return false;
  const dish=describe(s.plate,s.plateMethod,s.plateSpices);s.reaction=taste(dish,s.friend);s.chew=1.5;s.bites++;
  // Consume a portion of each ingredient, so one bite does not turn a milkshake into a different dish.
  s.lastDish=dish;for(const p of s.plate)p.remaining=Math.max(0,(p.remaining??1)-.34);s.plate=s.plate.filter(p=>p.remaining>.01);return s.reaction;
}
export function clearPlace(s){
  if(s.station==='board')s.board=[];
  else if(s.station==='stove'){s.vessels[s.method]=[];s.liquid[s.method]=0;s.spices[s.method]={salt:0,pepper:0,lemon:0};if(s.method!=='blender')s.heat[s.method]=0;s.blending=false;}
  else{s.plate=[];s.plateSpices={salt:0,pepper:0,lemon:0};s.plateMethod=null;s.reaction=null;s.bites=0;}
}
