import { segmentBox } from '../mech/tactics.js';

// The player and infantry have circular feet. A square-expanded AABB wrongly
// rejects legal contact at a box face or its rounded corner. Test the whole
// swept disc analytically, allowing only a 10-micrometre contact tolerance.
export function sweptDiscBox(from,to,box,r=.34){
  r=Math.max(0,r-1e-5);
  if(!segmentBox(from.x,from.z,to.x,to.z,box,r))return false;
  if(segmentBox(from.x,from.z,to.x,to.z,box,0))return true;
  const pointBox=p=>Math.max(box.x0-p.x,0,p.x-box.x1)**2+Math.max(box.z0-p.z,0,p.z-box.z1)**2;
  let distance=Math.min(pointBox(from),pointBox(to));
  const dx=to.x-from.x,dz=to.z-from.z,length=dx*dx+dz*dz;
  for(const x of [box.x0,box.x1])for(const z of [box.z0,box.z1]){
    const t=length>1e-12?Math.max(0,Math.min(1,((x-from.x)*dx+(z-from.z)*dz)/length)):0;
    distance=Math.min(distance,(x-from.x-dx*t)**2+(z-from.z-dz*t)**2);
  }
  return distance<r*r;
}

// Tactical rhythm changes positions and teamwork, never enemy health or damage.
export const BATTLE_TACTICS={
  pass:{flank:13,line:18,support:26,sniper:31,sight:78,cycle:[9,8,9,5]},
  city:{flank:8,line:14,support:20,sniper:25,sight:54,cycle:[7,7,9,5]},
  forest:{flank:15,line:17,support:23,sniper:29,sight:63,cycle:[8,8,11,5]},
  dam:{flank:9,line:19,support:27,sniper:34,sight:82,cycle:[10,9,9,6]},
  airfield:{flank:16,line:20,support:28,sniper:35,sight:88,cycle:[9,9,11,6]},
  underground:{flank:6,line:11,support:17,sniper:22,sight:44,cycle:[7,6,8,5]},
  rail:{flank:10,line:15,support:22,sniper:28,sight:66,cycle:[8,8,10,5]},
};
const PHASES=['advance','suppress','flank','regroup'];
// Preset values live in DIFFICULTIES. Missing/invalid values retain legacy timing;
// friendly soldiers do not inherit the selected enemy difficulty.
export function aiMultiplier(difficulty,key,friendly=false){
  const value=difficulty?.[key];
  return friendly||!Number.isFinite(value)?1:Math.max(.35,Math.min(2,value));
}

// One maneuvering soldier per side leaves the rest of that group available to
// cover the movement. A rifleman fills an empty flank role; guards use a short
// local counterpush instead of abandoning their own sector.
export function maneuverLeader(actors,side,{guard=false,defend=false,target=null,anchor=null,time=0,planInterval=1}={}){
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  const visible=a=>a.sees&&a.target&&!a.target.dead;
  const blocked=a=>(a.laneBlocked||0)>=.8*planInterval;
  const group=actors.filter(a=>{
    if(a.dead||a.friendly||a.side!==side)return false;
    if(guard){
      if(!a.guard||!['line','heavy'].includes(a.type))return false;
      if(anchor&&distance(a.guardAnchor||a.home||a.pos,anchor)>7)return false;
    }else if(a.guard&&a.type!=='flank'||!['line','flank'].includes(a.type)||defend&&a.id%3===0)return false;
    return true;
  });
  // Reserve the lane before filtering by the caller's target. Two soldiers
  // shooting different squadmates still share one physical approach lane.
  const reservations=group.filter(a=>visible(a)&&!blocked(a)&&(guard
    ?a.intent==='counterpush'&&time<(a.counterUntil||0)&&(!anchor||distance(a.target.pos,anchor)<14)
    :a.flankGoal&&['flank','crossfire'].includes(a.intent)&&time<(a.flankUntil||0)&&a.flankContact&&distance(a.flankContact,a.target.pos)<6));
  if(reservations.length){reservations.sort((a,b)=>a.id-b.id);return reservations[0];}
  const candidates=group.filter(a=>visible(a)&&!blocked(a)&&(!target||a.target===target||distance(a.target.pos,target.pos)<=6)
    &&(guard||distance(a.pos,a.target.pos)>9&&distance(a.pos,a.target.pos)<45));
  candidates.sort((a,b)=>{
    const priority=a=>guard?(a.type==='line'?0:1):(a.type==='flank'?0:1);
    return priority(a)-priority(b)||a.id-b.id;
  });
  return candidates[0]||null;
}

export function coveringFire(actors,actor,time,tempo=1){
  if(!actor.target?.pos)return false;
  return actors.some(mate=>mate!==actor&&!mate.dead&&!mate.friendly&&mate.sees&&mate.target&&mate.type!=='flank'&&mate.type!=='sniper'
    &&(mate.target===actor.target||Math.hypot(mate.target.pos.x-actor.target.pos.x,mate.target.pos.z-actor.target.pos.z)<=6)
    &&time-(mate.lastShotTime??-99)<1.1&&(mate.firePressure||0)>=1.2/Math.max(.35,tempo));
}
export class TacticalDirector {
  constructor(){this.wave=0;this.epoch=0;this.key='';this.phase='advance';this.sceneId='pass';this.profile=BATTLE_TACTICS.pass;this.side=1;}
  update(time,wave,operation,mapKind='pass',tempo=1){
    this.sceneId=operation?.sceneId||operation?.scenario?.id||operation?.scene||(typeof operation==='string'?operation:mapKind)||'pass';
    this.profile=BATTLE_TACTICS[this.sceneId]||BATTLE_TACTICS.pass;
    const seed=Number.isFinite(operation?.seed)?operation.seed:0,key=`${this.sceneId}:${operation?.variantId||''}:${seed}`;
    wave=Math.max(1,Math.floor(Number(wave)||1));
    if(wave!==this.wave||key!==this.key){this.wave=wave;this.key=key;this.epoch=time;}
    const durations=this.profile.cycle,period=durations.reduce((a,b)=>a+b,0);
    tempo=Number.isFinite(tempo)?Math.max(.35,Math.min(2,tempo)):1;
    let offset=(Math.max(0,time-this.epoch)*tempo)%period,index=0;
    while(index<durations.length-1&&offset>=durations[index])offset-=durations[index++];
    this.phase=PHASES[index];this.progress=offset/durations[index];this.side=((Math.abs(seed)+wave)%2)?1:-1;
    return this;
  }
}

// Navigation's node grid is an art-independent input. Every graph edge is checked
// against the physical infantry capsule, including thin walls between grid nodes.
export class PhysicalRoutes {
  constructor(nav,clear){
    this.nav=nav;this.clear=clear;this.nodes=nav.nodes;this.edges=this.nodes.map(()=>[]);this.components=new Int32Array(this.nodes.length).fill(-1);
    for(let i=0;i<this.nodes.length;i++){
      const a=this.nodes[i];if(a.blocked||!clear(a,a))continue;
      const x=i%nav.width,z=Math.floor(i/nav.width);
      for(const [dx,dz]of [[1,0],[0,1]]){
        const xx=x+dx,zz=z+dz;if(xx>=nav.width||zz>=nav.height)continue;
        const j=zz*nav.width+xx,b=this.nodes[j];
        if(b.blocked||!clear(b,b)||Math.abs(b.y-a.y)>1.1||!clear(a,b))continue;
        this.edges[i].push(j);this.edges[j].push(i);
      }
    }
    let component=0;
    for(let i=0;i<this.nodes.length;i++){
      if(this.components[i]>=0||this.nodes[i].blocked||!clear(this.nodes[i],this.nodes[i]))continue;
      const queue=[i];this.components[i]=component;
      for(let k=0;k<queue.length;k++)for(const j of this.edges[queue[k]])if(this.components[j]<0){this.components[j]=component;queue.push(j);}
      component++;
    }
  }
  nearest(p,component=null,visible=false){
    let best=-1,distance=Infinity;
    for(let i=0;i<this.nodes.length;i++){
      if(this.components[i]<0||(component!=null&&this.components[i]!==component))continue;
      const n=this.nodes[i],d=(n.x-p.x)**2+(n.z-p.z)**2;
      if(d<distance&&(!visible||this.clear(p,n))){distance=d;best=i;}
    }
    return best;
  }
  route(from,to){
    const start=this.nearest(from,null,true);if(start<0)return [];
    const end=this.nearest(to,this.components[start]);if(end<0||end===start)return [];
    const open=new Set([start]),cost=new Map([[start,0]]),previous=new Map(),closed=new Set(),goal=this.nodes[end];
    while(open.size){
      let current=-1,best=Infinity;
      for(const i of open){const n=this.nodes[i],f=cost.get(i)+Math.hypot(n.x-goal.x,n.z-goal.z);if(f<best){best=f;current=i;}}
      if(current===end){const path=[];while(current!==start){path.push(this.nodes[current]);current=previous.get(current);}return path.reverse();}
      open.delete(current);closed.add(current);
      for(const next of this.edges[current]){if(closed.has(next))continue;const g=cost.get(current)+this.nav.cell;if(g<(cost.get(next)??Infinity)){cost.set(next,g);previous.set(next,current);open.add(next);}}
    }
    return [];
  }
}
