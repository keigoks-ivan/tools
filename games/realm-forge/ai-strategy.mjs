const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const cavalry = u => u.blueprint.family==='cavalry'||u.blueprint.look==='knight';
const siege = u => u.blueprint.family==='siege'||u.blueprint.look==='siege';
const healthy = u => u.hp >= (u.maxHp||u.blueprint.hp||u.hp)*.8;

// Search only a few nearby cells. Route finding remains the simulation's job.
function openPoint(w,point,size) {
  const center={x:clamp(Math.round(point.x),0,size-1),y:clamp(Math.round(point.y),0,size-1)};
  for(let r=0;r<=3;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    if(r&&Math.abs(dx)!==r&&Math.abs(dy)!==r)continue;
    const x=center.x+dx,y=center.y+dy;if(x<0||y<0||x>=size||y>=size)continue;
    if(!w.blocked?.(x,y))return {x,y};
  }
  return null;
}

function localCounts(units) {
  const bins=new Map(),key=(x,y)=>`${x}:${y}`;
  for(const u of units){const k=key(Math.floor(u.x/3),Math.floor(u.y/3));if(!bins.has(k))bins.set(k,[]);bins.get(k).push(u);}
  return u=>{
    const x=Math.floor(u.x/3),y=Math.floor(u.y/3),home=bins.get(key(x,y))||[];
    let count=Math.min(3,home.length);if(count>=3)return count;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      if(!dx&&!dy)continue;
      for(const ally of bins.get(key(x+dx,y+dy))||[]){if(distance(u,ally)<=6&&++count>=3)return count;}
    }
    return count;
  };
}

/** Read-only strategic waypoints; combat and retreat take precedence upstream. */
export function strategicOrders(w,team,army,objective) {
  const orders=new Map();
  if(!objective||objective.hp<=0||!Number.isFinite(objective.x)||!Number.isFinite(objective.y))return orders;
  const troops=(army||[]).filter(u=>u?.blueprint&&u.team===team&&u.hp>0&&!u.garrison&&!['worker','trader','healer'].includes(u.blueprint.role)&&Number.isFinite(u.x)&&Number.isFinite(u.y));
  if(!troops.length)return orders;
  const size=w.map?.size||w.project?.map?.size||128,sites=w.buildings||[];
  const origin=sites.find(b=>b.team===team&&b.type==='town'&&b.hp>0&&(b.progress===1||b.progress===undefined))||w.map?.spawns?.[team]||troops[0];
  const length=distance(origin,objective),direction={x:(objective.x-origin.x)/(length||1),y:(objective.y-origin.y)/(length||1)};
  const progress=u=>(u.x-origin.x)*direction.x+(u.y-origin.y)*direction.y;
  const advance=openPoint(w,objective,size);if(!advance)return orders;
  const campaign=length>18,flankers=troops.filter(u=>cavalry(u)&&healthy(u));
  const flankDistance=length*.48,offset=clamp(length*.14,5,8),side=team%2?1:-1;
  const flank=campaign&&flankers.length>=3?openPoint(w,{x:origin.x+direction.x*flankDistance-direction.y*offset*side,y:origin.y+direction.y*flankDistance+direction.x*offset*side},size):null;
  const production=sites.find(b=>b.team===team&&b.hp>0&&b.progress===1&&['barracks','archery','stable'].includes(b.type)&&distance(b,origin)<=14);
  const rally=openPoint(w,production?{x:production.x+direction.x*3,y:production.y+direction.y*3}:{x:origin.x+direction.x*6,y:origin.y+direction.y*6},size);
  const fighters=troops.filter(u=>!siege(u)),countNearby=localCounts(fighters),now=Number.isFinite(w.time)?w.time:0;
  const main=fighters.filter(u=>!flank||!cavalry(u)||!healthy(u)),body=main.length>=2?main:fighters;
  let leading=-Infinity;for(const u of body)leading=Math.max(leading,progress(u));
  const front=body.filter(u=>progress(u)>=leading-8);
  const center=front.length?{x:front.reduce((n,u)=>n+u.x,0)/front.length,y:front.reduce((n,u)=>n+u.y,0)/front.length}:null;
  const escort=center?openPoint(w,{x:center.x-direction.x*3.5,y:center.y-direction.y*3.5},size):null;
  const make=(point,tactic,metadata={})=>({type:'attackMove',...point,aiObjective:objective.id,aiTactic:tactic,...metadata});
  for(const u of troops){
    const same=u.order?.aiObjective===objective.id,old=same?u.order:null;
    const failedRally=u.failed&&old?.aiTactic==='rally',released=Boolean(old?.aiRallyReleased||failedRally);
    const nearHome=distance(u,origin)<=12,group=!siege(u)&&nearHome?countNearby(u):3;
    // A rally order can finish while its unit waits at the meeting point. The
    // shared 12-second window still releases it after that order is cleared.
    const since=old?.aiTactic==='rally'&&Number.isFinite(old.aiRallySince)&&old.aiRallySince>=0&&old.aiRallySince<=now?old.aiRallySince:Math.floor(now/16)*16;
    const waiting=campaign&&fighters.length>=3&&!siege(u)&&nearHome&&group<3&&!released&&now-since<12;
    if(waiting&&rally){orders.set(u.id,make(rally,'rally',{aiRallySince:since}));continue;}
    const groupReady=campaign&&nearHome&&fighters.length>=3&&group>=3;
    const timedRelease=campaign&&!siege(u)&&nearHome&&fighters.length>=3&&now-since>=12;
    const release=old?.aiTactic==='rally'||released||groupReady||timedRelease?{aiRallyReleased:true}:{};
    if(siege(u)&&campaign&&escort&&front.length>=2&&distance(u,objective)>(u.blueprint.range||1)+3){
      orders.set(u.id,make(escort,'escort',release));continue;
    }
    const passed=old?.aiFlankPassed||old?.aiTactic==='flank'&&(u.failed||distance(u,old)<=2.5)||flank&&distance(u,flank)<=2.5||progress(u)>=flankDistance+1;
    if(flank&&cavalry(u)&&healthy(u)&&!passed&&distance(u,objective)>length*.4){
      // Keep a saved, reachable flank waypoint steady until that stage finishes.
      const point=old?.aiTactic==='flank'&&!u.failed&&Number.isFinite(old.x)&&Number.isFinite(old.y)?{x:old.x,y:old.y}:flank;
      orders.set(u.id,make(point,'flank',release));
    }else orders.set(u.id,make(advance,'advance',{...release,...(passed&&cavalry(u)?{aiFlankPassed:true}:{})}));
  }
  return orders;
}
