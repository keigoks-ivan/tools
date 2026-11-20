import { Vector3 } from 'three';
import { segmentBox, routeDirection, allyInLane, brakeForTurn } from './tactics.js';
import { Reinforcements } from './reinforcements.mjs';
import { MechCompanion } from './mech-companion.mjs?v=2';
import { damp, lerpAngle } from './anim.js';

const V = (x=0,y=0,z=0) => new Vector3(x,y,z);
const arsenal = {
  tank:    { ap:1450, range:325, cool:3.2, damage:430, speed:16 },
  heavy:   { ap:5100, range:370, cool:2.8, damage:570, speed:9 },
  grunt:   { ap:2070, range:265, cool:1.5, damage:265, speed:19 },
  brawler: { ap:2500, range:176, cool:1.02, damage:330, speed:23 },
  ally:    { ap:5100, range:295, cool:1.4, damage:330, speed:23 },
};
function center(unit,out) { out.copy(unit.pos); out.y += unit.vehicle ? 2.3 : 11; return out; }
const SIGHT = .3;

export class BattleLine {
  constructor(combat, encounter) {
    this.C=combat; this.enc=encounter;
    this.allies=[]; this.foes=[]; this.actors=[]; this.shots=[];
    this.phase='idle'; this.marker=null; this.think=0; this.aim=V(); this.dir=V();
    this.actualShots={ ally:0, enemy:0, allyHits:0, enemyAllyHits:0 };
    this.reinforcements=new Reinforcements(7,1.05);
    this.clock=0;
    this.player={pos:combat.player.pos, player:true, active:true};
  }
  point(x,z) { return V(x,this.C.world.height(x,z),z); }
  unit(kind,x,z,friendly,post='main',assignment=null) {
    const C=this.C, pos=this.point(x,z);
    let entity, mech;
    if (kind==='ally') {
      const side=C.companion?-1:1;
      entity=new MechCompanion(C,assignment??{tanks:true},{position:pos,side});
      if (C.companion) C.secondaryCompanion=entity;
      else C.companion=entity;
      mech=entity.mech;
    } else {
      const spawn={x,z,tx:x+(friendly?50:-50),tz:z,ground:true};
      entity=friendly?C.vehicles.spawn(kind,0,1,spawn):C.spawn(kind,0,1,spawn);
      entity.pos.copy(pos); mech=entity.m;
    }
    const ap=friendly&&kind==='tank'?3500:arsenal[kind].ap;
    const unit={kind,entity,mech,pos:entity.pos,vel:V(),goal:pos.clone(),route:[],friendly,post,
      scale:entity.scale??1,active:true,fallback:false,leave:false,weapon:arsenal[kind],cool:.45+(this.allies.length+this.foes.length)%4*.34,
      ap, maxAP:ap, shots:0, hits:0, face:friendly?Math.PI/2:-Math.PI/2,vehicle:kind==='tank'};
    unit.path={}; unit.boxes=[];
    unit.contact=V();unit.contactAt=-100;unit.maneuverAt=1+(this.actors.length%4)*.6;
    unit.origin=pos.clone();unit.changeAt=2.8+this.actors.length%4*.43;
    entity.frontActor=unit; entity.frontFriendly=friendly;
    unit.pose={vel:V(),grounded:true,groundAt:(a,b)=>this.floor(unit,a,b),lean:0,boost:0,pitch:0,thrust:0};
    if (entity.vel) entity.vel.set(0,0,0);
    if (!friendly) { entity.ap=entity.apMax=unit.maxAP; entity.los=false; }
    if (unit.vehicle) { entity.speed=0; entity.yaw=unit.face; entity.tYaw=0; }
    if (mech?.bones) mech.legYaw=unit.face;
    (friendly?this.allies:this.foes).push(unit);
    this.actors.push(unit);
    return unit;
  }
  floor(actor,x,z) { return this.C.world.height(x,z); }

  order(unit,...points) {
    unit.detour=null; unit.stuck=false;
    unit.route=points.map(([x,z])=>this.point(x,z));
    unit.goal.copy(unit.route.shift() ?? unit.pos);
  }
  // 增援從實際入口走向陣地。只為已入場的單位建立模型和執行 AI。
  platoon(kinds,entry,post,position) {
    const defs=kinds.split(' ').map((kind,i)=>({kind,post,
      x:entry[0]+(i%3-1)*10,z:entry[1]+(i%2?7:-7),
      goal:[position[0]+(i%3-1)*8,position[1]+(i%2?5:-5)]}));
    this.reinforcements.add(defs,this.clock);
  }
  nearby(p,[x,z],radius) { return Math.hypot(p.x-x,p.z-z)<radius && Math.abs(p.y-this.C.world.height(x,z))<24; }
  lastDefenders() {
    if(this.reinforcements.pending.length)return [];
    const alive=this.foes.filter(a=>this.canFight(a));
    if(!alive.length||alive.length>2)return [];
    return alive.map(a=>({name:a.boss?'指揮機':'殘存守軍',position:center(a,V())}));
  }
  resupply(repair) {
    const C=this.C;
    C.player.ap=Math.min(C.player.apMax,C.player.ap+repair);
    C.rifle.ammo=C.rifle.mag; C.rifle.reload=-1;
    for(const ally of this.allies) {
      ally.ap=Math.min(ally.maxAP,Math.max(ally.ap,0)+ally.maxAP*.55);
      ally.fallback=false;
    }
  }
  setCheckpoint(sec,x,z,yaw,extra={}) {
    this.C.cp={sec,x,z,yaw,...extra,stats:{...this.C.stats},used:0};
    this.C.note('已記錄檢查點','gr');
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
      const score=d-(u===actor.target?13:0)-(u===player?14:0)-(actor.friendly && C.lockTarget===u.entity?36:0);
      if (score>=best || d>actor.weapon.range) continue;
      const a=center(actor,V()), b=center(u,V());
      if (C.world.raycast(a,b,null)>=0) continue;
      best=score; target=u;
    }
    return target;
  }
  move(actor,dt) {
    const { pos, vel, goal, route }=actor, w=this.C.world, v=actor.entity;
    const x0=pos.x,z0=pos.z;
    if(route.length && Math.hypot(goal.x-pos.x,goal.z-pos.z)<3.7) goal.copy(route.shift());
    const dx=goal.x-pos.x,dz=goal.z-pos.z, d=Math.hypot(dx,dz);
    if(d<4 && !route.length && actor.leave) { this.remove(actor); return; }
    const dash=actor.maneuver?.kind==='dash';
    const brace=!actor.friendly&&!actor.vehicle&&actor.kind==='heavy'&&actor.target&&actor.cool<.52;
    const speed=Math.min(actor.weapon.speed*(actor.leave?2:dash?2.15:brace?.32:1),d*2);
    if(actor.stuck&&this.clock>=(actor.navAt??0)&&d>5){
      actor.navAt=this.clock+.32;
      w.nearBoxes(pos.x,pos.z,150,actor.boxes);
      const pad=actor.vehicle?2.25:3.85;
      const clear=(ax,az,bx,bz)=>!actor.boxes.some(b=>{
        if(b.top<=Math.min(pos.y,w.height(bx,bz))+1.5)return false;
        if(!segmentBox(ax,az,bx,bz,b,pad))return false;
        // 圓柱可以貼在牆角；從膨脹盒內向外走不算穿牆。
        if(!segmentBox(ax,az,ax,az,b,pad))return true;
        return segmentBox(ax,az,bx,bz,b,0)||segmentBox(bx,bz,bx,bz,b,pad);
      });
      if(clear(pos.x,pos.z,goal.x,goal.z)){actor.stuck=false;actor.detour=null;}
      else actor.detour=routeDirection(actor.path,pos,goal,clear,this.clock,11);
    }
    const vx=d>2?(actor.detour?.x??dx/d)*speed:0,vz=d>2?(actor.detour?.z??dz/d)*speed:0;
    const steering = actor.vehicle ? 5 : 5 + brakeForTurn(vel,vx,vz) * (actor.kind==='heavy' ? 2 : 5);
    vel.set(damp(vel.x,vx,steering,dt),0,damp(vel.z,vz,steering,dt));
    pos.addScaledVector(vel,dt);
    pos.y=this.floor(actor,pos.x,pos.z);
    if(w.collide(pos,actor.vehicle?2.4:4,pos.y)&&d>5)actor.stuck=true;
    const aim=actor.target && (actor.target.player || this.canFight(actor.target))?center(actor.target,this.aim):null;
    const moving=vel.lengthSq()>3;
    const moveYaw=moving?Math.atan2(vel.x,vel.z):actor.face;
    const targetYaw=aim?Math.atan2(aim.x-pos.x,aim.z-pos.z):moveYaw;
    actor.face=lerpAngle(actor.face,targetYaw,1-Math.exp(-dt*5));
    if(actor.vehicle) {
      v.speed=moving?vel.length():0;v.yaw=lerpAngle(v.yaw,moveYaw,1-Math.exp(-dt*4));
      v.tYaw=lerpAngle(v.tYaw,targetYaw-v.yaw,1-Math.exp(-dt*4));
      v.rk+=dt; v.q.setFromAxisAngle(BattleLine.up,v.yaw);
    } else {
      if(dt>0)actor.pose.vel.set((pos.x-x0)/dt,0,(pos.z-z0)/dt).clampLength(0,Math.max(speed,vel.length()));
      actor.pose.aim=aim;actor.pose.torsoYaw=actor.face;
      actor.pose.brace=brace?1:aim&&actor.cool<.3?.65:0;
      actor.pose.low=actor.maneuver?.kind==='cover'?.8:brace?.55:0;
      actor.pose.boost=actor.pose.thrust=dash?.75:0;
      actor.pose.lean=dash?.14:actor.entity.stagT>0?.19:0;
      actor.mech.animate(dt,actor.pose);
      if(actor.mech.footfall) this.C.audio.enemyStep(pos,.72);
    }
  }
  fire(actor,target) {
    const C=this.C, shell=actor.vehicle||actor.kind==='heavy', end=center(target,V());
    const muzzle=actor.mech?.muzzle;
    const from=actor.vehicle&&actor.entity.muz.lengthSq()>0?actor.entity.muz.clone():muzzle?muzzle.getWorldPosition(V()):center(actor,V());
    if(shell&&!actor.friendly){
      const velocity=target.player?C.player.vel:target.vel;
      if(velocity)end.addScaledVector(velocity,Math.min(.31,from.distanceTo(end)/205*.48));
    }
    const squad=actor.friendly?this.allies:this.foes;
    if(allyInLane(from,end,squad,actor,3.7,17)){
      actor.cool=.32;actor.masked=true;return;
    }
    actor.masked=false;
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
    this.shots.push({t:shell?distance/205:.09,from,end,target,shell,damage:actor.weapon.damage,actor});
    actor.shots++;
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
      s.actor.hits++;
      if(s.actor.friendly) {
        this.actualShots.allyHits++;
        C.damageEnemy(target.entity,s.damage,26,chest,this.dir,false,'frontline');
      } else {
        this.actualShots.enemyAllyHits++;target.ap-=s.damage;
        if(target.ap<=0) {
          target.ap=0; target.fallback=true; target.target=null;
          this.order(target,[target.pos.x-65,target.pos.z]);
          C.note((target.vehicle?'盟軍戰車':target.entity.name)+'受損後撤','am');
        }
      }
    }
  }
  react() {}

  maneuver(actor) {
    if(actor.friendly||actor.vehicle||actor.leave||actor.entity.dead)return;
    const target=actor.target, now=this.clock, e=actor.entity;
    if(target){actor.contact.copy(center(target,this.aim));actor.contactAt=now;}
    if(actor.maneuver) {
      const action=actor.maneuver;
      if(now<action.until)return;
      actor.maneuver=null;
      this.order(actor,...action.resume);
      return;
    }
    if(actor.boss||actor.post==='seawall'||now<actor.maneuverAt||e.stagT>0)return;
    actor.maneuverAt=now+1.35+(e.id%3)*.25;
    if(!target&&now-actor.contactAt>4) {
      const scout=this.foes.find(u=>u!==actor&&u.target&&this.canFight(u)&&actor.pos.distanceToSquared(u.pos)<155*155);
      if(!scout)return;
      center(scout.target,actor.contact);actor.contactAt=now;
    }
    const w=this.C.world, pos=actor.pos;
    const resume=[actor.goal,...actor.route].map(q=>[q.x,q.z]);
    const underFire=e.ap<(actor.observedAP??e.apMax)||e.locks>0;
    actor.observedAP=e.ap;
    if(underFire&&actor.kind!=='brawler'){
      const cover=this.C.enemyCover(e,actor.contact);
      if(cover&&cover.distanceTo(pos)>5&&(!actor.garrison||cover.distanceTo(actor.origin)<25)){
        this.order(actor,[cover.x,cover.z]);
        actor.maneuver={kind:'cover',until:now+Math.min(4.5,cover.distanceTo(pos)/actor.weapon.speed+1.2),resume};
        actor.maneuverAt=now+6;
        return;
      }
    }
    const flank=actor.kind==='brawler'&&target&&(underFire||this.foes.some(o=>o!==actor&&o.target===target&&o.shots>0));
    if(!flank&&!actor.masked&&(target||!actor.garrison&&pos.distanceToSquared(actor.goal)>40))return;
    if(this.foes.some(o=>o!==actor&&o.maneuver?.kind==='dash'&&o.target===target))return;
    const dx=actor.contact.x-pos.x,dz=actor.contact.z-pos.z,length=Math.hypot(dx,dz);
    if(length<8)return;
    const step=actor.garrison?13:flank?24:21,advance=flank&&!actor.garrison?11:0;
    const first=e.id%2===0?1:-1,from=center(actor,this.aim);
    for(const sign of [first,-first]){
      const spot=this.point(pos.x+(dx*advance+dz*step*sign)/length,pos.z+(dz*advance-dx*step*sign)/length);
      if(actor.garrison&&spot.distanceTo(actor.origin)>24||Math.abs(spot.y-pos.y)>4)continue;
      if(w.collide(spot,4,spot.y))continue;
      spot.y+=8;
      if(w.raycast(from,spot,null)>=0||w.raycast(spot,actor.contact,null)>=0)continue;
      this.order(actor,[spot.x,spot.z]);
      actor.maneuver={kind:flank?'dash':'peek',until:now+(flank?1.05:2.6),resume};
      actor.maneuverAt=now+(flank?5.8:4.3);
      return;
    }
  }

  changeAngle(actor,dt) {
    if(actor.maneuver||actor.friendly||actor.vehicle||actor.boss||actor.leave||actor.post==='seawall'||this.phase==='inbound'||this.phase==='ramp')return;
    actor.changeAt-=dt;
    if(actor.changeAt>0||actor.route.length||actor.pos.distanceToSquared(actor.goal)>25)return;
    const target=actor.target;
    if(!target)return;
    actor.changeAt=3.1+actor.shots%3*.5;
    const from=center(actor,this.aim), aim=center(target,this.dir);
    const dx=aim.x-from.x,dz=aim.z-from.z,len=Math.hypot(dx,dz);
    if(len<10)return;
    const side=actor.shots%2===0?1:-1, moving=actor.kind==='brawler'&&len>44?12:-3;
    for(const sign of [side,-side]){
      const x=actor.pos.x+(dx*moving+dz*sign*17)/len,z=actor.pos.z+(dz*moving-dx*sign*17)/len;
      const goal=this.point(x,z);
      if(goal.distanceToSquared(actor.origin)>105**2||Math.abs(goal.y-actor.pos.y)>4)continue;
      const w=this.C.world;
      goal.y+=5;
      if(w.raycast(from,goal,null)>=0||w.raycast(goal,aim,null)>=0)continue;
      this.order(actor,[x,z]);
      break;
    }
  }

  stepBattle(dt) {
    const C=this.C;
    this.clock+=dt;
    if(this.reinforcements.pending.length) {
      const live=this.foes.reduce((n,u)=>n+(u.active&&!u.entity.dead),0);
      this.reinforcements.tick(this.clock,live,({kind,x,z,post,goal})=>{
        const a=this.unit(kind,x,z,false,post);
        this.order(a,goal);
        return a;
      });
    }
    this.think-=dt;
    const plan=this.think<=0;
    if(plan){
      this.think=SIGHT;
      this.foes=this.foes.filter(a=>a.active&&!a.entity.dead);
      this.actors=this.actors.filter(a=>a.active&&!a.entity.dead);
    }
    for (const actor of this.actors) {
      if(!actor.active || actor.entity.dead)continue;
      if(!actor.friendly&&actor.entity.stagT>0)actor.entity.stagT-=dt;
      if(plan){
        actor.target=this.canFight(actor)?this.pick(actor):null;
        if(!actor.friendly)actor.entity.los=C.world.raycast(center(actor,V()),center(this.player,V()),null)<0;
        this.react(actor);
        this.maneuver(actor);
      }
      this.changeAngle(actor,dt);
      this.move(actor,dt);
      if(!actor.active||!actor.target||!this.canFight(actor)||actor.maneuver?.kind==='cover'||actor.maneuver?.kind==='dash'||(!actor.target.player&&!this.canFight(actor.target)))continue;
      actor.cool-=dt;
      if(!actor.friendly)actor.entity.warn=actor.cool>0&&actor.cool<.38?.8:0;
      const heading=actor.vehicle?actor.entity.yaw+actor.entity.tYaw:actor.face;
      const bearing=Math.atan2(actor.target.pos.x-actor.pos.x,actor.target.pos.z-actor.pos.z);
      if(actor.cool<=0 && (actor.entity.stagT??0)<=0 && Math.cos(heading-bearing)>.91)this.fire(actor,actor.target);
    }
    this.impacts(dt);
    return plan;
  }
}
BattleLine.up=V(0,1,0);
