import { Vector3 } from 'three';
import { MechCompanion } from './mech-companion.mjs?v=2';
import { damp, lerpAngle } from './anim.js';

const V = (x=0,y=0,z=0) => new Vector3(x,y,z);
const BLUE = '第三裝甲連', CONTROL = '白鷺（指揮所）';
const POSTS = {
  main: { name:'正面突破', route:'沿裝卸線突破重砲與戰車', entry:[-354,42], checkpoint:[-150,19] },
  flank:{ name:'低地側擊', route:'從北側低地打開側翼通道', entry:[-354,-88], checkpoint:[-150,-91] },
};
const arsenal = {
  tank:    { ap:1450, range:325, cool:3.2, damage:430, speed:16 },
  heavy:   { ap:5100, range:370, cool:2.8, damage:570, speed:9 },
  grunt:   { ap:2070, range:265, cool:1.5, damage:265, speed:19 },
  brawler: { ap:2500, range:176, cool:1.02, damage:330, speed:23 },
  ally:    { ap:5100, range:295, cool:1.4, damage:330, speed:23 },
};
function center(unit,out) { out.copy(unit.pos); out.y += unit.vehicle ? 2.3 : 11; return out; }
const SIGHT = .3;
const inside = (p,x,z,rx,rz) => Math.abs(p.x-x)<=rx && Math.abs(p.z-z)<=rz;

export class FreightFront {
  constructor(combat, encounter) {
    this.C=combat; this.enc=encounter;
    this.lane=combat.cp?.lane ?? null;
    this.allies=[]; this.foes=[]; this.actors=[]; this.shots=[];
    this.phase='idle'; this.marker=null; this.think=0; this.aim=V(); this.dir=V();
    this.markers=Object.values(POSTS).map(e=>({name:e.name,position:this.point(...e.entry).add(V(0,16,0))}));
    this.actualShots={ ally:0, enemy:0, allyHits:0, enemyAllyHits:0 };
    this.player={pos:combat.player.pos, player:true, active:true};
  }
  point(x,z) { return V(x,this.C.world.height(x,z),z); }
  unit(kind,x,z,friendly,post='main') {
    const C=this.C, pos=this.point(x,z);
    let entity, mech;
    if (kind==='ally') {
      entity=C.companion=new MechCompanion(C,{tanks:true},{position:pos,side:1});
      mech=entity.mech;
    } else {
      const spawn={x,z,tx:x+(friendly?50:-50),tz:z,ground:true};
      entity=friendly?C.vehicles.spawn(kind,0,1,spawn):C.spawn(kind,0,1,spawn);
      entity.pos.copy(pos); mech=entity.m;
    }
    const ap=friendly&&kind==='tank'?3500:arsenal[kind].ap;
    const unit={kind,entity,mech,pos:entity.pos,vel:V(),goal:pos.clone(),route:[],friendly,post,
      active:true,fallback:false,leave:false,weapon:arsenal[kind],cool:.45+(this.allies.length+this.foes.length)%4*.34,
      ap, maxAP:ap, face:friendly?Math.PI/2:-Math.PI/2,vehicle:kind==='tank'};
    entity.frontActor=unit; entity.frontFriendly=friendly;
    unit.pose={vel:unit.vel,grounded:true,groundAt:(a,b)=>C.world.height(a,b),lean:0,boost:0,pitch:0,thrust:0};
    if (entity.vel) entity.vel.set(0,0,0);
    if (!friendly) { entity.ap=entity.apMax=unit.maxAP; entity.los=false; }
    if (unit.vehicle) { entity.speed=0; entity.yaw=unit.face; entity.tYaw=0; }
    if (mech?.bones) mech.legYaw=unit.face;
    (friendly?this.allies:this.foes).push(unit);
    this.actors.push(unit);
    return unit;
  }
  begin() {
    const resumed=this.enc.sec===1 && this.lane;
    this.wing=this.unit('ally',resumed?-145:-411,resumed?(this.lane==='flank'?-93:5):-5,true);
    this.tanks=[
      this.unit('tank',resumed?-168:-393,47,true),
      this.unit('tank',resumed?-185:-419,75,true),
    ];
    if (resumed) { this.advance('approach'); return; }
    this.phase='breach';
    this.unit('heavy',-230,52,false);
    this.unit('tank',-211,74,false);
    this.unit('grunt',-247,2,false,'screen');
    this.unit('brawler',-223,-103,false,'flank');
    this.unit('grunt',-165,-86,false,'flank');
  }
  order(unit,...points) {
    unit.route=points.map(([x,z])=>this.point(x,z));
    unit.goal.copy(unit.route.shift() ?? unit.pos);
  }
  advance(phase) {
    const { C, lane }=this;
    this.phase=phase;
    if(phase==='approach'){
      this.enc.sec=1;
      this.marker=this.point(-64,lane==='flank'?-83:10); this.marker.y+=17;
      for(const u of this.allies) if(u.fallback) {
        u.ap=Math.ceil(u.maxAP*.5); u.fallback=false;
      }
      if(lane==='main') {
        this.order(this.wing,[-123,3],[-68,6]);
        this.tanks.forEach((t,i)=>this.order(t,[-83-i*24,47+28*i]));
      } else {
        if(this.wing.pos.x<-383)this.order(this.wing,[-395,-98],[-238,-93],[-118,-83],[-61,-82]);
        else this.order(this.wing,[-118,-83],[-61,-82]);
        this.tanks.forEach((t,i)=>this.order(t,[-201-i*26,47+28*i]));
      }
      const [x,z]=POSTS[lane].checkpoint;
      if(C.cp?.sec!==1) C.cp={sec:1,x,z,yaw:Math.PI/2,lane,stats:{...C.stats},used:0};
      C.player.ap=Math.min(C.player.apMax,C.player.ap+1550);
      C.rifle.ammo=C.rifle.mag; C.rifle.reload=-1;
      C.say(lane==='main'?'中央防線突破':'北側缺口打開','前進至貨運站外圍',3,'gr');
      C.lines([[BLUE,lane==='main'?'重砲沉默了。戰車跟我壓上去。':'北側通道通了。斑鳩從側面進站，戰車留在外圍牽制。']],true);
      for(const e of this.foes) if(this.canFight(e)) {
        e.leave=true;e.target=null;
        const z=e.post==='flank'?-118:e.pos.z;
        this.order(e,[e.pos.x+25,z],[80,z]);
      }
    }else if(phase==='station'){
      this.marker=this.point(181,14); this.marker.y+=24;
      const tankLead=lane==='main';
      if(tankLead) this.tanks.forEach((t,i)=>this.order(t,[84-i*26,47+28*i]));
      else this.order(this.wing,[-46,-81],[45,-78],[114,-65]);
      if(tankLead) this.order(this.wing,[96,4]);
      this.unit('tank',99,76,false,'station');
      this.unit('grunt',80,tankLead?-12:-104,false,'station');
      const boss=this.boss=this.unit('heavy',156,19,false,'station');
      boss.boss=true;boss.maxAP=9400;boss.entity.ap=boss.entity.apMax=boss.maxAP;
      boss.entity.bossName='獵犬軍團重裝指揮機';
      C.boss=boss.entity;
      C.say('貨運站反擊','擊退重裝指揮機，打開撤離通道',3,'am');
      C.lines([[CONTROL,'重裝指揮機進站了。那台機倒下，貨站就能通行。']],true);
    }
  }
  canFight(u) { return u.active && !u.fallback && !u.leave && !u.entity.dead; }
  remove(unit) {
    unit.active=false;
    unit.entity.gone=unit.entity.remove=true;
    if(!unit.vehicle) unit.mech.root.removeFromParent();
  }
  pick(actor) {
    const { C, player }=this;
    const candidates=actor.friendly?this.foes:[...this.allies,player];
    let target=null, best=actor.weapon.range;
    for (const u of candidates) {
      if(u===player ? C.dead : !this.canFight(u)) continue;
      const d=actor.pos.distanceTo(u.pos);
      const score=d-(u===player?14:0)-(actor.friendly && C.lockTarget===u.entity?36:0);
      if (score>=best || d>actor.weapon.range) continue;
      const a=center(actor,V()), b=center(u,V());
      if (C.world.raycast(a,b,null)>=0) continue;
      best=score; target=u;
    }
    return target;
  }
  move(actor,dt) {
    const { pos, vel, goal, route }=actor, w=this.C.world, v=actor.entity;
    const dx=goal.x-pos.x,dz=goal.z-pos.z, d=Math.hypot(dx,dz);
    if(d<3.7 && route.length) goal.copy(route.shift());
    else if(d<4 && actor.leave) { this.remove(actor); return; }
    const speed=Math.min(actor.weapon.speed*(actor.leave?2:1),d*2);
    const vx=d>2?dx/d*speed:0,vz=d>2?dz/d*speed:0;
    vel.set(damp(vel.x,vx,5,dt),0,damp(vel.z,vz,5,dt));
    pos.addScaledVector(vel,dt);
    pos.y=w.height(pos.x,pos.z);
    w.collide(pos,actor.vehicle?2.4:4,pos.y);
    const aim=actor.target && (actor.target.player || this.canFight(actor.target))?center(actor.target,this.aim):null;
    const moving=vel.lengthSq()>3;
    const moveYaw=moving?Math.atan2(vel.x,vel.z):actor.face;
    const targetYaw=aim?Math.atan2(aim.x-pos.x,aim.z-pos.z):moveYaw;
    actor.face=lerpAngle(actor.face,targetYaw,1-Math.exp(-dt*5));
    if(actor.vehicle) {
      v.speed=moving?vel.length():0;v.yaw=lerpAngle(v.yaw,moveYaw,1-Math.exp(-dt*4));
      v.tYaw=lerpAngle(v.tYaw,targetYaw-v.yaw,1-Math.exp(-dt*4));
      v.rk+=dt; v.q.setFromAxisAngle(FreightFront.up,v.yaw);
    } else {
      actor.pose.aim=aim; actor.pose.torsoYaw=actor.face;
      actor.mech.animate(dt,actor.pose);
      if(actor.mech.footfall) this.C.audio.enemyStep(pos,.72);
    }
  }
  fire(actor,target) {
    const C=this.C, shell=actor.vehicle||actor.kind==='heavy', end=center(target,V());
    const muzzle=actor.mech?.muzzle;
    const from=actor.vehicle&&actor.entity.muz.lengthSq()>0?actor.entity.muz.clone():muzzle?muzzle.getWorldPosition(V()):center(actor,V());
    if(C.world.raycast(from,end,null)>=0) { actor.cool=.25;return; }
    const distance=from.distanceTo(end);
    if(this.shots.length>=14 || distance>actor.weapon.range) { actor.cool=.22;return; }
    actor.cool=actor.weapon.cool; actor.entity.rk=0;
    actor.entity.warn=0;
    if(actor.mech?.bones)actor.mech.recoil=.7;
    C.fx.muzzle(from,this.dir.subVectors(end,from).normalize(),shell?'cannon':'mg');
    if(shell){
      C.fx.shellTracer(from,end,205); C.audio.cannon(from);
    }else{
      C.fx.tracer(from,end); C.audio.mg(from);
    }
    this.shots.push({t:shell?distance/205:.09,from,end,target,shell,damage:actor.weapon.damage,ally:actor.friendly});
    this.actualShots[actor.friendly?'ally':'enemy']++;
  }
  impacts(dt) {
    const C=this.C;
    for(let i=this.shots.length-1;i>=0;i--) {
      const s=this.shots[i];s.t-=dt;
      if(s.t>0)continue;
      this.shots.splice(i,1);
      const target=s.target, w=C.world;
      if(s.shell) { C.fx.explosion(s.end,.58);C.audio.explosion(s.end,.52); }
      if(target.player ? C.dead : !this.canFight(target)) continue;
      const chest=center(target,this.aim);
      if(chest.distanceTo(s.end)>(s.shell?12:6) || w.raycast(s.from,chest,null)>=0) continue;
      C.fx.impact(chest,this.dir.subVectors(s.from,chest).normalize(),'armor');
      if(target.player){ C.hurt(s.damage,s.from,s.shell?'shell':'bullet');continue; }
      if(s.ally) {
        this.actualShots.allyHits++;
        C.damageEnemy(target.entity,s.damage,26,chest,this.dir,false,'frontline');
      } else {
        this.actualShots.enemyAllyHits++;target.ap-=s.damage;
        if(target.ap<=0) {
          target.ap=0; target.fallback=true; target.target=null;
          this.order(target,[target.pos.x-65,target.pos.z]);
          C.note((target.vehicle?'盟軍戰車':'斑鳩')+'受損後撤','am');
        }
      }
    }
  }
  update(dt) {
    const C=this.C,p=C.player.pos;
    if(this.phase==='breach') {
      if(!this.lane&&p.x>-374&&(p.z>=-27||p.z<=-65)) {
        this.lane=p.z<=-65?'flank':'main';
        C.note(POSTS[this.lane].name+'・'+POSTS[this.lane].route,'cy');
        if(this.lane==='flank') this.order(this.wing,[-384,-95],[-306,-92]);
      }
      if(this.lane && !this.foes.some(u=>u.post===this.lane&&this.canFight(u))) this.advance('approach');
    }
    if(this.phase==='approach' && p.x>-87 && Math.abs(p.z)<140) this.advance('station');
    if(this.phase==='station' && this.boss.entity.dead) {
      this.phase='capture';
      for(const e of this.foes) if(this.canFight(e)) {
        e.leave=true;e.target=null;this.order(e,[e.pos.x+28,e.pos.z],[318,e.pos.z]);
      }
      C.say('重裝指揮機倒下','進入貨運站，打開撤離路線',2.4,'gr');
    }
    if(this.phase==='capture' && inside(p,181,15,58,60)) {
      this.phase='done';this.enc.state='done';this.marker=null;
      C.lines([[BLUE,'貨站到手。救護車隊，撤離路線已開。']],true);
      return true;
    }
    this.think-=dt;
    const plan=this.think<=0;
    if(plan)this.think=SIGHT;
    for (const actor of this.actors) {
      if(!actor.active || actor.entity.dead)continue;
      if(!actor.friendly&&actor.entity.stagT>0)actor.entity.stagT-=dt;
      if(plan){
        actor.target=this.canFight(actor)?this.pick(actor):null;
        if(actor.kind==='brawler'&&actor.target&&actor.target.pos.z<-63) {
          const p=actor.target.pos;
          actor.goal.copy(this.point(Math.max(-293,p.x+32),Math.max(-120,Math.min(-65,p.z-10))));
        }
        if(actor.kind==='grunt'&&!actor.leave&&!actor.shifted&&actor.entity.ap<actor.maxAP*.58) {
          actor.shifted=true;
          this.order(actor,[actor.pos.x+21,actor.pos.z+(actor.post==='flank'?-9:7)]);
        }
        if(!actor.friendly)actor.entity.los=C.world.raycast(center(actor,V()),center(this.player,V()),null)<0;
        if(actor.boss && !actor.shifted && actor.entity.ap<actor.maxAP*.55) {
          actor.shifted=true;
          actor.weapon={...actor.weapon,damage:720,cool:1.55};
          this.order(actor,[180,24],[209,this.lane==='flank'?-7:7]);
          C.note('重裝指揮機轉移火力','am');
        }
      }
      this.move(actor,dt);
      if(!actor.active||!actor.target||!this.canFight(actor)||(!actor.target.player&&!this.canFight(actor.target)))continue;
      actor.cool-=dt;
      if(!actor.friendly)actor.entity.warn=actor.cool>0&&actor.cool<.38?.8:0;
      const heading=actor.vehicle?actor.entity.yaw+actor.entity.tYaw:actor.face;
      const bearing=Math.atan2(actor.target.pos.x-actor.pos.x,actor.target.pos.z-actor.pos.z);
      if(actor.cool<=0 && (actor.entity.stagT??0)<=0 && Math.cos(heading-bearing)>.91)this.fire(actor,actor.target);
    }
    this.impacts(dt);
    return false;
  }
  get objective() {
    if(this.phase==='idle'||this.phase==='done')return null;
    if(this.phase==='breach') return this.lane
      ? postHint(this.lane,this.foes.filter(u=>u.post===this.lane&&this.canFight(u)).length)
      : {title:'選擇突破方向',hint:'正面・裝卸線　／　左側・低地通道'};
    if(this.phase==='approach')return {title:'前線已推進',hint:this.lane==='main'?'跟上前壓的盟軍戰車':'跟上北側的斑鳩'};
    return this.phase==='station'?{title:'奪回貨運站',hint:'擊退重裝指揮機'}:{title:'封鎖解除',hint:'進入貨運站開放撤離路線'};
  }
  get waypoints() {
    if(this.phase!=='breach'||this.lane)return [];
    return this.markers;
  }
  radar(out) {
    for(const t of this.tanks??[])if(t.active&&!t.fallback)out.push({x:t.pos.x,z:t.pos.z,kind:'ally'});
  }
}
FreightFront.up=V(0,1,0);
function postHint(lane,left) { return {title:POSTS[lane].name,hint:lane==='main'?'擊毀重砲與戰車　剩 '+left:'清出北側缺口　剩 '+left}; }
