import { Vector3 } from 'three';
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
      active:true,fallback:false,leave:false,weapon:arsenal[kind],cool:.45+(this.allies.length+this.foes.length)%4*.34,
      ap, maxAP:ap, shots:0, hits:0, face:friendly?Math.PI/2:-Math.PI/2,vehicle:kind==='tank'};
    entity.frontActor=unit; entity.frontFriendly=friendly;
    unit.pose={vel:unit.vel,grounded:true,groundAt:(a,b)=>this.floor(unit,a,b),lean:0,boost:0,pitch:0,thrust:0};
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
    unit.route=points.map(([x,z])=>this.point(x,z));
    unit.goal.copy(unit.route.shift() ?? unit.pos);
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
    pos.y=this.floor(actor,pos.x,pos.z);
    w.collide(pos,actor.vehicle?2.4:4,pos.y);
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

  stepBattle(dt) {
    const C=this.C;
    this.think-=dt;
    const plan=this.think<=0;
    if(plan)this.think=SIGHT;
    for (const actor of this.actors) {
      if(!actor.active || actor.entity.dead)continue;
      if(!actor.friendly&&actor.entity.stagT>0)actor.entity.stagT-=dt;
      if(plan){
        actor.target=this.canFight(actor)?this.pick(actor):null;
        if(!actor.friendly)actor.entity.los=C.world.raycast(center(actor,V()),center(this.player,V()),null)<0;
        this.react(actor);
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
  }
}
BattleLine.up=V(0,1,0);
