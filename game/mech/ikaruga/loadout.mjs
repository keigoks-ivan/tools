import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Combat} from '../combat.js';
import {rayCapsule} from '../flight.mjs';
import {createFootContactShadows} from '../foot-contact.mjs?v=1';
import {createShieldField} from '../shield-field.mjs';

export const IKARUGA_WEAPONS = {
  rifle: {mag:8, rof:.61, reload:1.8, range:340, near:85, dmg:850, stag:54},
  msl: {n:1, tapFire:true, lockStep:.09, cd:4, cone:.48, range:220},
  cannon: {cd:14, range:95, angle:Math.PI/3, dmg:2500, stag:160},
};

const v = () => new THREE.Vector3();
const origin=v(), aim=v(), end=v(), direction=v(), normal=v(), next=v(), right=v(), edge=v();
const COPPER = new THREE.Color(1.8,.85,.29);
const canHit = e => e && !e.dead && !e.gone && !e.frontFriendly;
const exposed = (world,from,to) => world.raycast(from,to,null)<0;
const WAVE_SEGMENTS=16, WAVE_TIME=.32;

function pressureFront() {
  const geometry=new THREE.BufferGeometry(), indices=[];
  for(let i=0;i<WAVE_SEGMENTS;i++){
    const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);
  }
  geometry.setIndex(indices);
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array((WAVE_SEGMENTS+1)*6),3).setUsage(THREE.DynamicDrawUsage));
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({
    color:0xffce92,side:THREE.DoubleSide,forceSinglePass:true,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,
  }));
  mesh.visible=false;mesh.frustumCulled=false;
  return mesh;
}

export class IkarugaCombat extends Combat {
  constructor(options) {
    super({...options,loadout:IKARUGA_WEAPONS});
    this.tow=null;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(9),3).setUsage(THREE.DynamicDrawUsage));
    this.cable=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xffc274}));
    this.cable.frustumCulled=false;
    this.cable.visible=false;
    this.wave=pressureFront();this.waveAge=WAVE_TIME;
    this.scene.add(this.cable,this.wave);
  }

  fireRifle() {
    const r=this.rifle, spec=this.weapons.rifle;
    if(this.dead || r.cd>0 || r.reload>=0)return;
    if(!r.ammo){this.startReload();return;}
    r.ammo--;
    r.cd=spec.rof*(this.od.active ? .65 : 1);
    this.stats.shots++;
    this.hero.muzzle.getWorldPosition(origin);

    // First converge on the sight line, then check the real path out of the barrel.
    aim.copy(this.eye).addScaledVector(this.aimDir,this.aimSkip);
    end.copy(aim).addScaledVector(this.aimDir,spec.range);
    const cover=this.world.raycast(aim,end,null);
    let sightRange=cover<0?spec.range:cover*spec.range, direct=false;
    for(const enemy of this.enemies){
      if(!canHit(enemy))continue;
      const t=rayCapsule(aim,this.aimDir,enemy.m.capsule(),sightRange);
      if(t>=0){sightRange=t;direct=true;}
    }
    end.copy(aim).addScaledVector(this.aimDir,sightRange);
    const assisted=this.fireTarget();
    if(!direct && canHit(assisted) && assisted.los){
      assisted.chest(next);
      if(next.distanceTo(aim)<=sightRange && exposed(this.world,aim,next))end.copy(next);
    }
    direction.subVectors(end,origin).normalize();
    end.copy(origin).addScaledVector(direction,spec.range);
    const wall=this.world.raycast(origin,end,normal);
    let distance=wall<0?spec.range:wall*spec.range, target=null;
    for(const enemy of this.enemies){
      if(!canHit(enemy))continue;
      const t=rayCapsule(origin,direction,enemy.m.capsule(),distance);
      if(t>=0){distance=t;target=enemy;}
    }
    end.copy(origin).addScaledVector(direction,distance);
    this.fx.shellTracer(origin,end,950);
    this.fx.muzzle(origin,direction,'mg');
    this.audio.cannon(origin);
    this.cockpit.kick('fire',1.15);
    this.cockpit.flashAt(COPPER,4,.42,-.28,-1.1);
    this.hero.recoil=1;
    if(target){
      const close=distance<=spec.near;
      this.damageEnemy(target,spec.dmg*(close?1.6:1)*(this.od.active?1.25:1),spec.stag*(close?2:1),end,direction);
      normal.copy(direction).negate();
      this.fx.impact(end,normal,'armor');
      this.audio.impact(end,'armor');
    }else if(wall>=0){
      this.world.hitBuilding(end,distance<=spec.near?4:2,normal);
      this.fx.impact(end,normal,normal.y>.7?'ground':'building');
    }
    if(!r.ammo)this.startReload();
  }

  launchSalvo(locks) {
    const e=locks[0] || this.fireTarget();
    this.hero.anchorPort.getWorldPosition(origin);
    const distance=canHit(e) ? e.chest(end).distanceTo(origin) : Infinity;
    if(!Number.isFinite(distance) || distance>this.weapons.msl.range || e.dropping || !e.los ||
       this.angTo(e)>this.weapons.msl.cone || !exposed(this.world,origin,end)){
      this.note('磁錨・請對準射程內的可見敵機','am');
      return;
    }
    const winch=!!(e.vehicle || e.kind==='heavy' || e.bossName || e.frontActor?.boss);
    if(winch && this.enc?.front?.ashore===false){
      this.note('跳板開啟後可收索前進','am');
      return;
    }
    this.msl.cd=0;
    this.tow={enemy:e,winch,remaining:.92};
    this.audio.ui('confirm');
    this.fx.tracer(origin,end);
    this.note(winch?'磁錨固定・收索前進':'磁錨咬合・牽回輕機','cy');
  }

  updateTow(dt) {
    const tow=this.tow;
    if(!tow)return;
    const e=tow.enemy, p=this.player;
    this.hero.anchorPort.getWorldPosition(origin);
    e.chest(end);
    if(!canHit(e) || this.dead || this.phase!=='fight' || !Number.isFinite(end.lengthSq()) || !exposed(this.world,origin,end)){
      this.tow=null;this.cable.visible=false;return;
    }
    const mover=tow.winch?p:e, fixed=tow.winch?e:p;
    direction.subVectors(fixed.pos,mover.pos);
    const airborne=mover.flying || mover.airborne;
    if(!airborne)direction.y=0;
    const distance=direction.length();
    const travel=Math.min(Math.max(0,distance-16),dt*142,tow.remaining*142);
    if(distance>0)direction.divideScalar(distance);
    // The hull samples the swept path at less than its radius, including terrain and roofs.
    let blocked=false;
    for(let walked=0;walked<travel;walked+=2){
      next.copy(mover.pos).addScaledVector(direction,Math.min(2,travel-walked));
      if(Math.abs(next.x)>700 || Math.abs(next.z)>700 || this.world.collide(next,3.5,next.y)){
        blocked=true;break;
      }
      const floor=this.world.support(next.x,next.z,3.5,next.y);
      next.y=airborne || floor<mover.pos.y-1.6 ? Math.max(floor,next.y) : floor;
      mover.pos.copy(next);
    }
    if(airborne && mover===p)p.flightAltitude=p.pos.y;
    if(!tow.winch)e.stagT=Math.max(e.stagT,.25);
    this.hero.anchorPort.getWorldPosition(origin);
    e.chest(end);
    const cable=this.cable.geometry.attributes.position;
    cable.setXYZ(0,origin.x,origin.y,origin.z);
    next.lerpVectors(origin,end,.5);next.y-=Math.min(1.5,origin.distanceTo(end)*.012);
    cable.setXYZ(1,next.x,next.y,next.z);
    cable.setXYZ(2,end.x,end.y,end.z);
    cable.needsUpdate=true;
    tow.remaining-=dt;
    this.cable.visible=!blocked && distance>16 && tow.remaining>0;
    if(!this.cable.visible)this.tow=null;
  }

  startCannon() {
    const K=this.weapons.cannon;
    this.hero.anchorPort.getWorldPosition(origin);
    this.cannon.cd=0;
    const spread=Math.cos(K.angle);
    this.stats.shots++;
    this.audio.cannon(origin);
    this.cockpit.kick('fire',1.55);
    this.cockpit.flashAt(COPPER,7,-.4,-.3,-1.0);
    this.hero.recoil=1;
    // Clip the pressure front against buildings once per discharge.
    this.waveAge=0;this.wave.position.copy(origin);
    this.wave.visible=true;this.wave.scale.setScalar(.12);
    const points=this.wave.geometry.attributes.position;
    right.set(this.aimDir.z,0,-this.aimDir.x).normalize();
    for(let i=0;i<=WAVE_SEGMENTS;i++){
      const angle=K.angle*(2*i/WAVE_SEGMENTS-1);
      edge.copy(this.aimDir).multiplyScalar(Math.cos(angle)).addScaledVector(right,Math.sin(angle));
      end.copy(origin).addScaledVector(edge,K.range);
      const t=this.world.raycast(origin,end,normal);
      edge.multiplyScalar(K.range*(t<0?1:t));
      points.setXYZ(2*i,edge.x,edge.y+1,edge.z);
      points.setXYZ(2*i+1,edge.x*.965,edge.y-1,edge.z*.965);
    }
    points.needsUpdate=true;
    let hits=0;
    for(const e of this.enemies){
      if(!canHit(e))continue;
      e.chest(end);
      direction.subVectors(end,origin);
      const d=direction.length();
      if(!d || d>K.range || direction.divideScalar(d).dot(this.aimDir)<spread || !exposed(this.world,origin,end))continue;
      this.damageEnemy(e,K.dmg*(1-.32*d/K.range),K.stag,end,direction);
      this.fx.impact(end,normal.copy(direction).negate(),'armor');
      hits++;
    }
    this.note(hits?'震波・命中 '+hits+' 機':'震波釋放','am');
  }

  update(dt,input,rdt) {
    super.update(dt,input,rdt);
    this.updateTow(dt);
    if(this.wave.visible){
      this.waveAge=Math.min(WAVE_TIME,this.waveAge+dt);
      const travel=this.waveAge/WAVE_TIME;
      this.wave.scale.setScalar(.12+.88*travel);
      this.wave.material.opacity=.7*(1-travel);
      this.wave.visible=travel<1;
    }
  }

  dispose() {
    this.cable.removeFromParent();
    this.cable.geometry.dispose();this.cable.material.dispose();
    this.wave.removeFromParent();
    this.wave.geometry.dispose();this.wave.material.dispose();
    super.dispose();
  }
}

// The pile driver, wheel and left-arm fairlead each form one rigid draw batch.
export function fitIkaruga(hero,A) {
  hero.root.name='第三裝甲連・斑鳩';
  hero.root.userData.ikaruga=true;
  hero.footContacts=createFootContactShadows(hero.root,[hero.bones.ankleR,hero.bones.ankleL]);
  hero.shieldField=createShieldField();hero.root.add(hero.shieldField.mesh);
  const removed=new Set();
  hero.weapon.traverse(o=>removed.add(o));
  hero.meshes=hero.meshes.filter(o=>!removed.has(o));
  hero.glows=hero.glows.filter(o=>!removed.has(o));
  hero.weapon.clear();

  const metal=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.47,metalness:.57,roughnessMap:A.wearM});
  const graphite=0x293139,steel=0x71818a,ivory=0xbabbb1,signal=0xd3873e,dark=0x242725;
  const parts=[];
  function piece(g,color){
    const geo=g.index?g.toNonIndexed():g;
    if(geo!==g)g.dispose();
    const c=new THREE.Color(color),attr=geo.attributes.position,colors=new Float32Array(attr.count*3);
    for(let i=0;i<attr.count;i++)c.toArray(colors,i*3);
    geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
    parts.push(geo);
  }
  function axial(radius,tail,length,z,color,x=0,y=0){
    piece(new THREE.CylinderGeometry(radius,tail,length,12).rotateX(Math.PI/2).translate(x,y,z),color);
  }
  function bake(parent,name){
    const geometry=mergeGeometries(parts);
    for(const g of parts)g.dispose();parts.length=0;
    const mesh=new THREE.Mesh(geometry,metal);mesh.name=name;
    mesh.castShadow=mesh.receiveShadow=true;mesh.userData.mech=hero;
    parent.add(mesh);hero.meshes.push(mesh);
  }
  axial(.52,.67,2.3,.2,graphite);
  axial(.39,.49,2.9,2.3,steel);
  axial(.51,.44,.75,3.88,graphite);
  axial(.39,.49,.22,4.30,signal);
  axial(.26,.26,.04,4.43,dark);
  axial(.12,.19,.08,4.46,steel);
  for(const sign of [-1,1]){
    axial(.12,.18,2.7,1.0,steel,sign*.54,-.1);
    axial(.21,.25,.95,.0,ivory,sign*.54,-.1);
    piece(new THREE.BoxGeometry(.16,.46,2.18).rotateX(-.1).translate(sign*.48,.38,.67),ivory);
    for(let j=0;j<3;j++)piece(new THREE.BoxGeometry(.04,.23,.13).rotateX(-.32).translate(sign*.58,.46,.34+j*.32),graphite);
  }
  piece(new THREE.BoxGeometry(.32,.17,.72).translate(0,.63,.08),signal);
  bake(hero.weapon,'破樁・雙導軌');
  hero.muzzle.position.set(0,0,4.51);hero.weapon.add(hero.muzzle);

  const drum=hero.bones.back;
  for(const x of [-1.05,1.05]){
    piece(new THREE.CylinderGeometry(1.18,1.18,.16,18).rotateZ(Math.PI/2).translate(x,2.45,-2.36),ivory);
    piece(new THREE.CylinderGeometry(.47,.56,.13,10).rotateZ(Math.PI/2).translate(x*1.14,2.45,-2.36),signal);
  }
  for(let i=0;i<10;i++)
    piece(new THREE.TorusGeometry(.83,.08,5,16).rotateY(Math.PI/2).translate(-.86+i*.19,2.45,-2.36),steel);
  bake(drum,'救難絞盤');

  const hand=hero.bones.handL;
  piece(new THREE.BoxGeometry(.9,.65,1.4).translate(0,-.62,.28),graphite);
  for(const x of [-.43,.43]){
    axial(.18,.26,1.3,.69,ivory,x,-.62);
    axial(.13,.17,.38,1.52,signal,x,-.62);
  }
  piece(new THREE.CylinderGeometry(.13,.13,.82,10).rotateZ(Math.PI/2).translate(0,-.64,1.37),steel);
  bake(hand,'磁錨導纜器');
  hero.anchorPort=new THREE.Object3D();hero.anchorPort.position.set(0,-.62,1.55);hand.add(hero.anchorPort);
}
