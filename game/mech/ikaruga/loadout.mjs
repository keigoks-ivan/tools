import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Combat} from '../combat.js';
import {rayCapsule} from '../flight.mjs';
import {createFootContactShadows} from '../foot-contact.mjs?v=1';
import {createShieldField} from '../shield-field.mjs';

export const IKARUGA_WEAPONS = {
  rifle:{mag:36,rof:.23,reload:1.85,range:650,dmg:460,stag:18},
  msl:{n:0,cd:1.8,range:1200,dmg:1760,stag:76},
  cannon:{cd:12},
};

const V=()=>new THREE.Vector3(), sight=V(), axis=V(), far=V(), muzzle=V(), bore=V(), point=V(), check=V();
const normal=V(), secondNormal=V(), localRay=new THREE.Ray(), inverse=new THREE.Matrix4();
const amber=new THREE.Color(1.8,.85,.29);
const graphite=0x28363b, steel=0x8196a0, ivory=0xc4c5b7, orange=0xd8833d, black=0x1a2025;
const shoulderHP=1150, boosterHP=930;

// One static draw batch per moving assembly; the same two component meshes are instanced by reference across enemies.
function batch(){
  const pieces=[];
  function add(source,color){
    const geometry=source.index?source.toNonIndexed():source;
    if(geometry!==source)source.dispose();
    const c=new THREE.Color(color), colors=new Float32Array(geometry.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3)c.toArray(colors,i);
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    pieces.push(geometry);
  }
  return {
    box(x,y,z,w,h,d,color,tilt=0){add(new THREE.BoxGeometry(w,h,d).rotateX(tilt).translate(x,y,z),color);},
    axial(x,y,z,r,tail,length,color){add(new THREE.CylinderGeometry(r,tail,length,10).rotateX(Math.PI/2).translate(x,y,z),color);},
    finish(){
      const geometry=mergeGeometries(pieces);
      for(const piece of pieces)piece.dispose();
      pieces.length=0;
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
      return geometry;
    },
  };
}

function componentKit(){
  const b=batch(), material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.51,metalness:.57});
  b.box(0,-.36,-.7,2.7,1.85,4.1,graphite);
  b.axial(0,.23,.8,1.03,1.27,4.95,steel);
  b.axial(0,.23,2.4,1.16,1.24,1.65,orange);
  b.axial(0,.23,3.38,.93,1.1,.43,black);
  for(const x of [-1.17,1.17])b.box(x,.35,-.4,.45,1.02,3.9,ivory);
  const cannon=b.finish();
  b.box(0,.13,.66,2.32,3.65,1.8,graphite,.09);
  b.axial(0,.02,-.18,1.55,1.43,3.05,steel);
  b.axial(0,.02,-1.39,1.6,1.66,.86,orange);
  b.axial(0,.02,-1.86,1.34,1.3,.12,black);
  b.axial(0,.02,-1.95,.86,.8,.1,0x52d6ca);
  for(const x of [-1,1])b.box(x,.12,.26,.47,3.1,2.7,ivory);
  return {cannon,booster:b.finish(),material};
}

function attachPart(kit,enemy,key,name,hp,x,y,z){
  const mesh=new THREE.Mesh(kit[key],kit.material);
  mesh.name=name;mesh.position.set(x,y,z);
  mesh.castShadow=mesh.receiveShadow=true;
  enemy.m.bones.torso.add(mesh);
  const part={key,name,hp,maxHP:hp,mesh,position:V(),radius:(key==='cannon'?1.6:1.75)*enemy.scale,disabled:false};
  if(key==='cannon'){
    part.muzzle=new THREE.Object3D();part.muzzle.position.set(0,.23,3.64);mesh.add(part.muzzle);
  }
  return part;
}

// A short train of bound triangles per part. A box-only hit would count empty space around the nozzle.
function partDistance(part,from,dir,limit){
  if(part.disabled)return -1;
  const mesh=part.mesh, geometry=mesh.geometry;
  mesh.updateWorldMatrix(true,false);
  localRay.set(from,dir).applyMatrix4(inverse.copy(mesh.matrixWorld).invert());
  if(!localRay.intersectsBox(geometry.boundingBox))return -1;
  const vertices=geometry.attributes.position;
  let best=Infinity;
  for(let i=0;i<vertices.count;i+=3){
    triangle.a.fromBufferAttribute(vertices,i);triangle.b.fromBufferAttribute(vertices,i+1);triangle.c.fromBufferAttribute(vertices,i+2);
    if(localRay.intersectTriangle(triangle.a,triangle.b,triangle.c,false,triangleHit)){
      const d=triangleHit.applyMatrix4(mesh.matrixWorld).distanceTo(from);
      if(d<=limit && d<best)best=d;
    }
  }
  return best===Infinity?-1:best;
}
const triangle=new THREE.Triangle(), triangleHit=V();
function bodyHit(enemy,from,dir,range){
  const cap=enemy.m.capsule();
  // The broad phase encloses the shoulder tips and rear module, including torso rotation.
  if(rayCapsule(from,dir,{...cap,r:cap.r+6.8*(enemy.scale||1)},range)<0)return null;
  let distance=rayCapsule(from,dir,cap,range), part=null;
  if(enemy.components){
    for(const component of [enemy.components.cannon,enemy.components.booster]){
      const d=partDistance(component,from,dir,distance<0?range:distance);
      if(d>=0){distance=d;part=component;}
    }
  }
  return distance<0?null:{enemy,part,distance};
}

export class IkarugaCombat extends Combat {
  constructor(options){
    super({...options,loadout:IKARUGA_WEAPONS});
    this.componentKit=componentKit();
    this.scopeActive=false;this.scopeContact=null;this.penetratorArmed=false;
    this.slide=0;
  }

  spawn(kind,i,n,at=null){
    const e=super.spawn(kind,i,n,at);
    if(!e.vehicle)e.components={
      cannon:attachPart(this.componentKit,e,'cannon','肩炮',shoulderHP,-4.05,5.6,.35),
      booster:attachPart(this.componentKit,e,'booster','背部推進器',boosterHP,2.35,3.5,-3.35),
    };
    return e;
  }

  aimAssist(dt){
    if(!this.precisionFrame)super.aimAssist(dt);
  }

  getSight(){
    if(this.camera){
      this.camera.getWorldPosition(sight);
      this.camera.getWorldDirection(axis);
    }else{sight.copy(this.eye);axis.copy(this.aimDir);}
    sight.addScaledVector(axis,this.aimSkip||0);
  }

  contacts(from,dir,range){
    const hits=[];
    for(const e of this.enemies){
      if(e.dead||e.gone||e.frontFriendly)continue;
      const hit=bodyHit(e,from,dir,range);
      if(hit)hits.push(hit);
    }
    return hits.sort((a,b)=>a.distance-b.distance);
  }

  readScope(){
    const range=this.weapons.msl.range;
    this.getSight();
    const hits=this.contacts(sight,axis,range);
    let selected=hits[0];
    if(selected){
      point.copy(sight).addScaledVector(axis,selected.distance);
      if(this.world.raycast(sight,point,null)>=0)selected=null;
    }
    if(!selected){
      let angleBest=.046;
      for(const enemy of this.enemies){
        if(enemy.dead||enemy.gone||enemy.frontFriendly)continue;
        enemy.chest(point);check.subVectors(point,sight);
        const distance=check.length(), axial=check.dot(axis);
        if(axial<=0||distance>range)continue;
        const angle=Math.sqrt(Math.max(0,(distance-axial)*(distance+axial)))/axial;
        if(angle>=angleBest||this.world.raycast(sight,point,null)>=0)continue;
        selected={enemy,distance,part:null};angleBest=angle;
      }
    }
    if(!selected)return null;
    const {enemy}=selected, parts=[];
    for(const part of Object.values(enemy.components||{})){
      part.mesh.getWorldPosition(part.position);
      check.subVectors(part.position,sight);
      const d=check.length();
      if(d<.01||this.world.raycast(sight,part.position,null)>=0)continue;
      check.divideScalar(d);
      const hull=rayCapsule(sight,check,enemy.m.capsule(),d);
      const partAt=part.disabled?-1:partDistance(part,sight,check,d);
      if(hull<0 || part===selected.part || (partAt>=0&&partAt<hull))parts.push(part);
    }
    return {...selected,parts};
  }

  playerWeapons(dt,inp){
    const release=!!inp.lockRelease && (this.scopeActive||inp.lockPress);
    this.scopeActive=!!inp.lockHold && !inp.lockRelease;
    this.precisionFrame=this.scopeActive||release;
    if(inp.cannon)this.startCannon();
    super.playerWeapons(dt,{...inp,lockHold:false,lockRelease:false,cannon:false,fire:!this.precisionFrame&&inp.fire});
    this.slide=THREE.MathUtils.damp(this.slide,this.precisionFrame?1:0,15,dt);
    this.hero.railSlide.position.z=this.slide*2.7;
    this.scopeContact=this.scopeActive?this.readScope():null;
    if(release&&this.msl.cd>=1&&!this.dead){
      this.msl.cd=0;this.shoot(true);
    }
  }

  startCannon(){
    if(this.dead||this.penetratorArmed||this.cannon.cd<1)return;
    this.penetratorArmed=true;
    this.audio.reload();this.note('貫穿彈入膛','am');
  }

  fireRifle(){
    const r=this.rifle;
    if(this.dead||r.cd>0||r.reload>=0)return;
    if(r.ammo<=0){this.startReload();return;}
    r.ammo--;r.cd=this.weapons.rifle.rof*(this.od.active?.65:1);
    this.shoot(false);
    if(!r.ammo)this.startReload();
  }

  shoot(precision){
    const spec=precision?this.weapons.msl:this.weapons.rifle, ap=this.penetratorArmed;
    this.stats.shots++;
    if(ap){this.penetratorArmed=false;this.cannon.cd=0;}
    this.getSight();
    // Zero the offset barrel on the reticle within 30 m. Beyond that distance every target
    // on the sight line stays on it, including a second target behind a penetrated screen.
    const nearLimit=30, nearHit=this.contacts(sight,axis,nearLimit)[0];
    far.copy(sight).addScaledVector(axis,nearLimit);
    const nearWall=this.world.raycast(sight,far,null);
    const zero=Math.min(nearLimit,nearHit?.distance??nearLimit,nearWall<0?nearLimit:nearWall*nearLimit);
    const join=sight.clone().addScaledVector(axis,zero);
    this.hero.muzzle.getWorldPosition(muzzle);
    bore.subVectors(join,muzzle);
    // With an obstruction almost touching the sight, the muzzle can already be past it.
    // Start at the sight in that case so the point-blank obstruction is still respected.
    const from=bore.dot(axis)>0?muzzle:sight;
    bore.subVectors(join,from).normalize();
    const shot={pierced:null,damaged:new Set(),blocked:false};
    const feed=(start,dir,length)=>{
      if(length<.001)return;
      far.copy(start).addScaledVector(dir,length);
      const first={},second={};
      const wall=this.world.raycast(start,far,normal,shot.pierced,first);
      const pass=ap&&!shot.pierced&&wall>=0&&(first.box?.penetrable||first.box?.bld?.st===0);
      const nextWall=pass?this.world.raycast(start,far,secondNormal,first.box,second):-1;
      const stop=pass?nextWall:wall;
      let travel=stop<0?length:stop*length;
      for(const hit of this.contacts(start,dir,travel)){
        if(shot.damaged.has(hit.enemy))continue;
        const dmg=spec.dmg*(ap?1.16:1)*(this.od.active?1.25:1)*Math.pow(.82,shot.damaged.size);
        point.copy(start).addScaledVector(dir,hit.distance);
        if(hit.part)this.damagePart(hit.enemy,hit.part,dmg);
        const enemy=hit.enemy;
        const lethal=precision && !hit.part && !shot.damaged.size && !enemy.vehicle && enemy!==this.boss && !enemy.bossName && !enemy.fleeAt;
        const damage=lethal ? enemy.ap : hit.part ? dmg*.23 : dmg;
        this.damageEnemy(enemy,damage,spec.stag,point,dir,!!hit.part);
        this.fx.impact(point,check.copy(dir).negate(),'armor');this.audio.impact(point,'armor');
        shot.damaged.add(hit.enemy);
        if(shot.damaged.size===(ap?3:1)){travel=hit.distance;shot.blocked=true;break;}
      }
      const hitWall=(fraction,box,n)=>{
        if(fraction<0||fraction*length>travel+.001)return;
        point.copy(start).addScaledVector(dir,fraction*length);
        const amount=ap?4:precision?2:1;
        if(box?.hit)box.hit(amount,point,n);
        else if(box?.bld)this.world.hitBuilding(point,amount,n);
        this.fx.impact(point,n,n.y>.7?'ground':'building');
      };
      hitWall(wall,first.box,normal);
      if(pass){shot.pierced=first.box;hitWall(nextWall,second.box,secondNormal);}
      if(stop>=0)shot.blocked=true;
      far.copy(start).addScaledVector(dir,travel);
    };
    feed(from,bore,from.distanceTo(join));
    if(!shot.blocked)feed(join,axis,spec.range-zero);
    this.fx.shellTracer(muzzle,far,precision?1800:1250);this.fx.muzzle(muzzle,bore,precision?'cannon':'mg');
    if(precision)this.audio.cannon(muzzle);else this.audio.mg(muzzle);
    this.cockpit.kick('fire',precision?1.35:.62);
    this.cockpit.flashAt(amber,precision?4:2,.4,-.27,-1.1);
    this.hero.recoil=precision?1.2:.58;
  }

  damagePart(enemy,part,damage){
    part.hp=Math.max(0,part.hp-damage);
    if(part.hp>0)return;
    part.disabled=true;part.mesh.visible=false;
    if(part.key==='cannon')enemy.burst=enemy.charge=enemy.volley=enemy.warn=0;
    else enemy.qbT=enemy.boostT=enemy.lunge=enemy.rushT=0;
    this.note(part.name+'損毀','am');
  }

  cancelScope(){
    this.scopeActive=false;this.precisionFrame=false;this.scopeContact=null;
  }

  update(dt,input,rdt){
    if(!input||this.dead||this.phase==='done')this.cancelScope();
    super.update(dt,input,rdt);
  }

  dispose(){
    this.cancelScope();this.hero.railSlide.position.z=0;
    super.dispose();
    this.componentKit.cannon.dispose();this.componentKit.booster.dispose();this.componentKit.material.dispose();
  }
}

export function fitIkaruga(hero,A){
  hero.root.name='第三裝甲連・斑鳩';hero.root.userData.ikaruga=true;
  hero.footContacts=createFootContactShadows(hero.root,[hero.bones.ankleR,hero.bones.ankleL]);
  hero.shieldField=createShieldField();hero.root.add(hero.shieldField.mesh);
  const removed=new Set();
  hero.weapon.traverse(o=>removed.add(o));
  hero.meshes=hero.meshes.filter(o=>!removed.has(o));hero.glows=hero.glows.filter(o=>!removed.has(o));
  hero.weapon.clear();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.44,metalness:.62,roughnessMap:A.wearM});
  const b=batch();
  function mount(parent,name){
    const m=new THREE.Mesh(b.finish(),material);m.name=name;
    m.castShadow=m.receiveShadow=true;m.userData.mech=hero;parent.add(m);hero.meshes.push(m);
  }
  b.axial(0,0,.7,.78,.63,3.4,graphite);
  b.box(0,-.45,-.61,1,.88,1.75,steel,.14);
  for(const x of [-.56,.56]){
    b.box(x,.18,1.18,.4,.69,3.4,ivory,-.035);
    b.axial(x,.04,2.72,.22,.28,1.9,steel);
    for(let i=0;i<4;i++)b.box(x*1.37,.2,.15+i*.42,.06,.3,.18,black,-.25);
  }
  b.box(0,.76,.1,.48,.32,.98,orange);
  mount(hero.weapon,'平射炮・承架');
  hero.railSlide=new THREE.Group();hero.weapon.add(hero.railSlide);
  b.axial(0,0,3.7,.31,.46,4.05,steel);
  for(const x of [-.38,.38]){
    b.box(x,.07,3.8,.23,.58,3.6,graphite);
    b.box(x,.11,5.43,.27,.62,.65,orange);
  }
  b.axial(0,0,5.67,.42,.48,.57,graphite);b.axial(0,0,5.97,.29,.29,.04,black);
  mount(hero.railSlide,'精準炮・伸縮炮管');
  hero.muzzle.position.set(0,0,6);hero.railSlide.add(hero.muzzle);
  b.box(0,-.52,.26,1.05,.64,1.65,graphite);
  b.axial(0,-.43,.74,.33,.41,1.15,ivory);
  b.axial(0,-.43,1.35,.24,.29,.09,0x64c5bc);
  mount(hero.bones.handL,'光學測距儀');
}
