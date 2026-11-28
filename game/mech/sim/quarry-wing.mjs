import {MechCompanion,companionSpawn} from '../mech-companion.mjs?v=2';
import {rayCapsule} from '../flight.mjs';
import {fitFalcon} from '../taipei/falcon.mjs';
import {fitIkaruga} from '../ikaruga/loadout.mjs';

const formations=[
  {name:'蒼焰',range:360,flank:23,lead:45,alt:0,cadence:1.1,damage:280},
  {name:'白隼',range:520,flank:68,lead:27,alt:34,cadence:1.65,damage:350},
  {name:'斑鳩',range:740,flank:43,lead:-42,alt:0,cadence:3.6,damage:670},
];
class QuarryWing extends MechCompanion{
  constructor(C,order,spawn){
    const gear=[],materials=new Set();
    super(C,{...order,supportBoss:true},spawn,m=>{
      const original=new Set(m.meshes);
      if(order.name==='白隼')fitFalcon(m,C.world.A);
      if(order.name==='斑鳩')fitIkaruga(m,C.world.A);
      for(const mesh of m.meshes)if(!original.has(mesh)){gear.push(mesh.geometry);materials.add(mesh.material);}
    });
    this.gear=gear;this.materials=materials;this.shots=0;
  }
  plan(){
    super.plan();
    const C=this.combat,o=this.order,p=C.player.pos;
    // Form on the line from the pilot to the adversary, independent of the pilot's camera yaw.
    const enemy=C.lockTarget&&!C.lockTarget.dead?C.lockTarget:C.boss;
    if(!enemy||enemy.dead)return;
    const dx=enemy.pos.x-p.x,dz=enemy.pos.z-p.z,len=Math.max(1,Math.hypot(dx,dz));
    const lead=Math.min(o.lead,len*.48);
    this.goal.set(p.x+(dx*lead+dz*o.flank*this.side)/len,this.pos.y,p.z+(dz*lead-dx*o.flank*this.side)/len);
    this.direction.subVectors(this.goal,this.pos);this.direction.y=0;
    const distance=this.direction.length();
    const probe=this.from.copy(this.pos).addScaledVector(this.direction,Math.min(1,9/Math.max(1,distance)));
    if(!C.world.collide(probe,3.5,this.pos.y))this.move.copy(this.direction).multiplyScalar(Math.min(1.5,40/Math.max(1,distance)));
    this.flightY=o.alt?C.world.height(this.pos.x,this.pos.z)+o.alt:this.flightY;
    this.from.copy(this.pos);this.from.y+=11;
    if(this.canSupport(enemy)&&enemy.chest(this.aim).distanceTo(this.from)<o.range&&C.world.raycast(this.from,this.aim)<0)this.target=enemy;
  }
  fire(target){
    const C=this.combat,o=this.order;
    this.mech.muzzle.getWorldPosition(this.from);this.direction.subVectors(this.aim,this.from);
    const distance=this.direction.length();this.fireIn=.24;
    if(distance<1||distance>o.range||C.world.raycast(this.from,this.aim)>=0)return;
    this.direction.divideScalar(distance);
    if(rayCapsule(this.from,this.direction,C.hero.capsule(),distance)>=0)return;
    this.shots++;this.fireIn=o.cadence;this.mech.recoil=.8;
    if(o.name==='白隼')C.fx.wingArc(this.from,this.aim);
    else if(o.name==='斑鳩')C.fx.beam(this.from,this.aim,'ally');
    else C.fx.tracer(this.from,this.aim);
    C.fx.muzzle(this.from,this.direction,'mg');C.audio.mg(this.from);
    C.fx.impact(this.aim,this.hitNormal.copy(this.direction).negate(),'armor');
    C.damageEnemy(target,o.damage,38,this.aim,this.direction,false,target===C.boss?'frontline':true);
  }
  dispose(){
    this.mech.footContacts.mesh.dispose();
    this.mech.shieldField?.mesh.material.dispose();
    for(const g of this.gear)g.dispose();
    for(const m of this.materials)m.dispose();
    super.dispose();
  }
}
export function muster(C,crew){
  for(const order of formations){
    if(order.name===C.def.pilot||crew.some(w=>w.name===order.name))continue;
    const spawn=companionSpawn(C.world,C.player,crew.length?-crew[0].side:1,crew[0]?.pos);
    if(spawn)crew.push(new QuarryWing(C,order,spawn));
  }
}
