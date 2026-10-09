// Infantry combat uses Iron Dusk's captured soldier motion, hand/foot IK and bone hitboxes.
// Living units always move along physical routes; wave cleanup never kills or relocates them.
import * as THREE from 'three';
import { Soldier, lerpAngle } from '../mech/zero/human.js';
import { Trooper } from '../mech/zero/ai.js';
import { makeEnemyRifle } from '../mech/zero/guns.js';
import { allyInLane, segmentBox } from '../mech/tactics.js';
import { TacticalDirector, PhysicalRoutes } from './combat-tactics.mjs';

const clamp = THREE.MathUtils.clamp;
const random = (a,b) => a + Math.random() * (b-a);
const UP = new THREE.Vector3(0,1,0);
const MAX_BOLTS = 96, MAX_SPARKS = 64;
const TYPES = {
  line:    {hp:115,walk:1.65,run:4.6,range:19,mag:24,burst:3,gap:.2,damage:7,speed:78,spread:.04,aim:.55,look:'trooper',gun:'carbine'},
  flank:   {hp:100,walk:1.9,run:5.1,range:13,mag:24,burst:4,gap:.18,damage:7,speed:80,spread:.047,aim:.65,look:'officer',gun:'carbine'},
  support: {hp:150,walk:1.5,run:4.1,range:25,mag:36,burst:5,gap:.16,damage:6,speed:74,spread:.052,aim:.65,look:'trooper',gun:'heavy'},
  sniper:  {hp:90,walk:1.4,run:3.7,range:36,mag:4,burst:1,gap:1.4,damage:34,speed:115,spread:.009,aim:1.3,look:'sniper',gun:'sniper'},
  heavy:   {hp:280,walk:1.2,run:2.75,range:21,mag:48,burst:6,gap:.14,damage:6,speed:68,spread:.059,aim:.8,look:'heavy',gun:'heavy',armor:.72,scale:1.06},
  ally:    {hp:185,walk:1.9,run:4.8,range:19,mag:24,burst:3,gap:.23,damage:13,speed:82,spread:.026,aim:.65,look:'pilot',gun:'carbine'},
};
const TYPE_ALIAS={trooper:'line',officer:'flank'};
const ROLE_ORDER=['line','line','flank','support','line','sniper','heavy'];
// These meshes/materials are shared across replays just like the soldier and rifle resources.
const TRACE_GEO=new THREE.CylinderGeometry(.018,.018,1,4);
const SPARK_GEO=new THREE.IcosahedronGeometry(.035,0);
const FLASH_GEO=new THREE.IcosahedronGeometry(1,0);
const red=new THREE.Color(3.8,.46,.13),blue=new THREE.Color(.24,2.8,3.6),gold=new THREE.Color(4.2,2.25,.7);
const IMPACT_COLORS={body:[3.4,1.3,.45],head:[4,2.4,.9],armor:[2.4,2.8,3.4],concrete:[1.2,2.2,3.5],metal:[1.2,2.2,3.5],glass:[1.1,2.5,3.5]};
const surfaceKind=mat=>/metal|rust|corr|olive/.test(mat||'')?'metal':mat==='glass'?'glass':'concrete';
const TRACE_MAT=new THREE.MeshBasicMaterial({color:0xffffff,vertexColors:true,toneMapped:true,blending:THREE.AdditiveBlending,transparent:true,opacity:.9,depthWrite:false});
const SPARK_MAT=new THREE.MeshBasicMaterial({color:0xffffff,vertexColors:true,toneMapped:true,blending:THREE.AdditiveBlending,transparent:true,opacity:.8,depthWrite:false});
const FRIEND_GLOW=new THREE.MeshBasicMaterial({color:blue,toneMapped:true});
const LASER_MAT=new THREE.LineBasicMaterial({color:0xff5137,transparent:true,opacity:.38,blending:THREE.AdditiveBlending,depthWrite:false});

export class InfantryActor {
  constructor(combat,def,friendly=false) {
    this.combat=combat;this.id=combat.nextId++;this.friendly=friendly;
    const requested=TYPE_ALIAS[def.type]||def.type;
    this.type=friendly?'ally':Object.hasOwn(TYPES,requested)?requested:ROLE_ORDER[(this.id-1)%ROLE_ORDER.length];
    this.T=TYPES[this.type];this.role=friendly?'line':this.type;this.side=this.id%2?1:-1;
    this.s=new Soldier(combat.kit,this.T.look,{weapon:makeEnemyRifle(this.T.gun),scale:this.T.scale||1,world:combat.map.solid});
    if(friendly)this.s.weapon.traverse(o=>{if(o.isMesh&&o.material?.isMeshBasicMaterial)o.material=FRIEND_GLOW;});
    this.pos=this.s.pos;this.pos.copy(combat._spawnPosition(def));
    this.s.yaw=this.s.aimYaw=this.s.bodyYaw=def.yaw??(friendly?0:Math.PI);
    this.s.root.rotation.y=this.s.bodyYaw;combat.scene.add(this.s.root,this.s.weapon);
    this.hp=this.hp0=this.T.hp;this.dead=false;this.barT=0;this.guard=!!def.guard;
    this.home=this.pos.clone();this.lastSeen=this.pos.clone();this.lastContact=-99;
    this.target=null;this.sees=false;this.senseT=random(0,.18);this.goal=this.pos.clone();
    this.path=[];this.pathT=0;this.pathGoal=this.pos.clone();this.planT=random(0,.3);this.aimT=0;
    this.ammo=this.T.mag;this.burst=0;this.shotT=random(.1,.4);this.restT=.5;
    this.suppression=0;this.stagger=0;this.stagV=new THREE.Vector3();this.hitFlash=0;this.phase='advance';this.phaseT=random(1,2);this.cover=null;
    this.stuckT=0;this.progressPos=this.pos.clone();this.lastProgress=0;this.searchT=0;this.stepPhase=0;
    this.deathAge=0;this.contactRadioT=0;this.formationIndex=def.formationIndex||0;
    this.intent='advance';this.station=null;this.stationContact=this.pos.clone();this.stationUntil=0;this.laneBlocked=0;
    if(this.type==='sniper'){
      this.laser=new THREE.Line(new THREE.BufferGeometry().setFromPoints([UP,UP]),LASER_MAT);
      this.laser.visible=false;this.laser.frustumCulled=false;combat.scene.add(this.laser);
    }
    this.s.update(0); // Bone matrices exist before the first shot or visibility query.
  }
  get alive(){return !this.dead;}
  hitTest(o,d,max){return Trooper.prototype.hitTest.call(this,o,d,max);}
  damage(damage,dir,part='chest') {
    if(this.dead||!Number.isFinite(damage)||damage<=0)return false;
    const armor=this.T.armor&&part!=='head';if(armor)damage*=this.T.armor;
    this.hp=Math.max(0,this.hp-damage);this.barT=2.6;this.hitFlash=.15;this.lastHitKind=armor?'armor':part==='head'?'head':'hit';this.suppression=Math.min(2,this.suppression+.8);
    this.s.impact(dir,clamp(damage/75,.25,1.3),part==='head');this.s.flash(!!armor);
    if(damage>20){this.stagger=this.type==='heavy'?.12:.27;this.stagV.copy(dir).setY(0).normalize().multiplyScalar(this.type==='heavy'?1:2.4);}
    this.aimT=0;this.burst=0;
    if(!this.friendly){this.lastSeen.copy(this.combat.player.pos);this.lastContact=this.combat.time;this.pathT=0;}
    if(this.hp<=0){
      this.dead=true;this.deathAge=0;this.s.vel.multiplyScalar(.4);
      this.s.die(dir,clamp(damage/100,.65,1.5),part==='head'?'head':part==='limb'&&this.legHit?'legs':'chest',this.combat.map.solid);
      if(this.laser)this.laser.visible=false;
      this.combat.audio?.bodyFall?.(this.pos);
      if(!this.friendly)this.combat.onKill?.(this);
      return true;
    }
    if(this.cover){this.phase='hide';this.phaseT=.8;}
    return false;
  }
  dispose() {
    this.s.mixer.stopAllAction();this.s.mixer.uncacheRoot(this.s.model);
    this.s.root.removeFromParent();this.s.weapon?.removeFromParent();
    // Skeleton bone textures belong to this clone. Mesh, material and rifle caches do not.
    for(const m of this.s.meshes)m.skeleton?.dispose();
    if(this.laser){this.laser.removeFromParent();this.laser.geometry.dispose();}
    for(const material of this.fadeMaterials?.values()||[])material.dispose();
  }
  fade(amount) {
    if(!this.dead||amount<=0)return;
    if(!this.fadeMaterials){
      this.fadeMaterials=new Map();
      const fadeMaterial=original=>{
        if(this.fadeMaterials.has(original))return this.fadeMaterials.get(original);
        const material=original.clone();material.onBeforeCompile=original.onBeforeCompile;material.customProgramCacheKey=original.customProgramCacheKey;
        material.transparent=true;material.depthWrite=false;material.userData.infantryFadeOpacity=original.opacity;
        this.fadeMaterials.set(original,material);return material;
      };
      const meshes=new Set();
      for(const root of [this.s.root,this.s.weapon])root?.traverse(o=>{if(!o.isMesh||meshes.has(o))return;meshes.add(o);o.material=Array.isArray(o.material)?o.material.map(fadeMaterial):fadeMaterial(o.material);o.castShadow=false;});
    }
    for(const material of this.fadeMaterials.values())material.opacity=material.userData.infantryFadeOpacity*(1-clamp(amount,0,1));
  }
}

export class Combat {
  constructor({scene,map,kit,audio,fx=null,player,onPlayerHurt,onKill,difficulty={damage:1}}) {
    Object.assign(this,{scene,map,kit,audio,fx,player,onPlayerHurt,onKill,difficulty});
    this.enemies=[];this.allies=[];this.bolts=[];this.sparks=[];this.flashes=[];this.nextId=1;this.time=0;
    this.mode='defend';this.objective=new THREE.Vector3(0,0,-39);this.cleanup=false;
    this.director=new TacticalDirector();this.tacticalPhase='advance';this.squadMode='follow';this.squadCommand={mode:'follow',target:null};this.routes=null;
    this._matrix=new THREE.Matrix4();this._rotation=new THREE.Quaternion();this._scale=new THREE.Vector3();this._vector=new THREE.Vector3();
    this._ensureFX();
  }
  _ensureFX(){
    if(this.fxRoot)return;
    this.fxRoot=new THREE.Group();this.fxRoot.name='infantry-combat-effects';this.scene.add(this.fxRoot);
    this.traces=new THREE.InstancedMesh(TRACE_GEO,TRACE_MAT,MAX_BOLTS);this.traces.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.traces.frustumCulled=false;this.traces.count=0;
    this.sparkMesh=new THREE.InstancedMesh(SPARK_GEO,SPARK_MAT,MAX_SPARKS);this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.sparkMesh.frustumCulled=false;this.sparkMesh.count=0;
    this.flashMesh=new THREE.InstancedMesh(FLASH_GEO,TRACE_MAT,32);this.flashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.flashMesh.frustumCulled=false;this.flashMesh.count=0;
    this.fxRoot.add(this.traces,this.sparkMesh,this.flashMesh);
  }
  spawnEnemy(def={}){if(this.enemies.filter(a=>!a.dead).length>=14)return null;this._ensureFX();const a=new InfantryActor(this,def);this.enemies.push(a);return a;}
  spawnSquad(start){
    this._ensureFX();
    for(let i=this.allies.length;i<3;i++)this.allies.push(new InfantryActor(this,{x:start.x+(i-1)*2.2,z:start.z-1.7-Math.abs(i-1),yaw:0,formationIndex:i},true));
    return this.allies;
  }
  _spawnPosition(def) {
    const nav=this.map.nav,b=this.map.bounds,routes=this._routes();
    const wanted=new THREE.Vector3(clamp(def.x??0,b.x0+.6,b.x1-.6),0,clamp(def.z??55,b.z0+.6,b.z1-.6));
    const playerNode=routes.nearest(this.player.pos,null,true),component=routes.components[playerNode];
    // Reject disconnected islands at spawn, so every living unit can reach the battle.
    const candidates=nav.nodes.map((n,i)=>({n,i,d:(n.x-wanted.x)**2+(n.z-wanted.z)**2})).filter(x=>routes.components[x.i]===component&&component>=0&&x.n.x>b.x0+.45&&x.n.x<b.x1-.45&&x.n.z>b.z0+.45&&x.n.z<b.z1-.45).sort((a,b)=>a.d-b.d);
    let chosen=null,reachableFallback=null;
    for(const {n} of candidates){reachableFallback??=n;if([...this.enemies,...this.allies].some(a=>!a.dead&&Math.hypot(a.pos.x-n.x,a.pos.z-n.z)<1.1))continue;chosen=n;break;}
    chosen??=reachableFallback;
    if(!chosen)throw new Error('Battlefield has no accessible infantry spawn');
    return new THREE.Vector3(chosen.x,this.map.solid.floorAt(chosen.x,chosen.z,(chosen.y??this.map.ground(chosen.x,chosen.z))+.5),chosen.z);
  }
  _eye(actor,out=new THREE.Vector3()) {
    if(actor===this.player)return out.copy(actor.pos).add(new THREE.Vector3(0,actor.eyeH??1.58,0));
    return actor.s.headPos(out);
  }
  _aimPoint(actor,out=new THREE.Vector3()) {
    if(actor===this.player)return out.copy(actor.pos).add(new THREE.Vector3(0,(actor.eyeH??1.58)*.74,0));
    return actor.s.chestPos(out);
  }
  _sense(a) {
    const candidates=a.friendly?this.enemies:[this.player,...this.allies],eye=this._eye(a);
    let target=null,score=Infinity;
    for(const p of candidates){
      if(p.dead)continue;const d=eye.distanceToSquared(this._eye(p));
      const range=this.director.profile.sight;
      if(d>range*range||d>score||!this.map.solid.sees(eye,this._aimPoint(p)))continue;
      target=p;score=d*(p===this.player?.8:1);
    }
    a.sees=!!target;a.target=target;
    if(target){a.lastSeen.copy(target.pos);a.lastContact=this.time;a.searchT=0;
      if(!a.friendly&&this.time>a.contactRadioT){
        a.contactRadioT=this.time+1.4;
        for(const mate of this.enemies)if(mate!==a&&!mate.dead&&mate.pos.distanceToSquared(a.pos)<38*38){mate.lastSeen.copy(a.lastSeen);mate.lastContact=this.time;}
      }
    }
  }
  _safePoint(p,from) {
    const routes=this._routes(),start=routes.nearest(from,null,true),component=routes.components[start];
    const index=start<0?-1:routes.nearest(p,component),n=this.map.nav.nodes[index];if(!n)return from.clone();
    return new THREE.Vector3(n.x,n.y??this.map.ground(n.x,n.z),n.z);
  }
  _routes(){return this.routes||(this.routes=new PhysicalRoutes(this.map.nav,(a,b)=>this._clearSegment(a,b)));}
  _clearSegment(from,to,r=.34) {
    const solid=this.map.solid,ground=this.map.ground;
    const y=Math.min(from.y,to.y),boxes=[];
    for(const b of solid.near((from.x+to.x)/2,(from.z+to.z)/2,Math.hypot(to.x-from.x,to.z-from.z)/2+r,boxes)){
      if(b.noMove||b.ramp||b.y1<=y+.48||b.y0>=y+1.75)continue;
      if(segmentBox(from.x,from.z,to.x,to.z,b,r))return false;
    }
    const b=this.map.bounds;if(to.x<b.x0+r||to.x>b.x1-r||to.z<b.z0+r||to.z>b.z1-r)return false;
    return Math.abs(ground(to.x,to.z)-ground(from.x,from.z))<1.1;
  }
  _coverGoal(a,contact,ideal=a.T.range,anchor=null,radius=Infinity) {
    let best=null,score=-Infinity;
    for(const cover of this.map.cover||[]){
      const centerZ=cover.z+1.1,side=contact.z<centerZ?1:-1;
      const p=this._safePoint({x:cover.x,z:centerZ+side*1.6},a.pos),dist=p.distanceTo(a.pos);
      if(dist>20||p.distanceTo(contact)<6||anchor&&p.distanceTo(anchor)>radius||Math.hypot(p.x-cover.x,p.z-(centerZ+side*1.6))>3)continue;
      const standing=p.clone().add(new THREE.Vector3(0,1.55,0)),kneeling=p.clone().add(new THREE.Vector3(0,.8,0)),target=contact.clone().add(new THREE.Vector3(0,1.1,0));
      const protectedLow=!this.map.solid.sees(kneeling,target),canFire=this.map.solid.sees(standing,target);
      if(!canFire)continue;
      const crowd=[...this.enemies,...this.allies].some(e=>e!==a&&!e.dead&&e.goal.distanceToSquared(p)<5);
      const value=(protectedLow?6:0)-dist*.35-Math.abs(p.distanceTo(contact)-ideal)*.25-(crowd?5:0);
      if(value>score){score=value;best=p;best.protected=protectedLow;}
    }
    return best;
  }
  _stationGoal(a,contact,ideal,anchor=null,radius=Infinity) {
    const cover=this._coverGoal(a,contact,ideal,anchor,radius);if(cover)return cover;
    // Firing positions are evaluated on the same physical component as the actor.
    const base=Math.atan2(a.pos.x-contact.x,a.pos.z-contact.z),target=contact.clone().add(new THREE.Vector3(0,1.2,0));
    let best=null,score=-Infinity;
    const candidates=[a.pos.clone()];
    for(const offset of [0,a.side*.3,-a.side*.3,a.side*.65,-a.side*.65])for(const r of [ideal,ideal-4,ideal+4])candidates.push(this._safePoint({x:contact.x+Math.sin(base+offset)*r,z:contact.z+Math.cos(base+offset)*r},a.pos));
    for(const p of candidates){
      if(anchor&&p.distanceTo(anchor)>radius||p.distanceTo(contact)<5||!this.map.solid.sees(p.clone().add(new THREE.Vector3(0,1.55,0)),target))continue;
      const movement=p.distanceTo(a.pos),range=p.distanceTo(contact),crowd=[...this.enemies,...this.allies].filter(e=>e!==a&&!e.dead&&e.goal.distanceToSquared(p)<8).length;
      const lane=allyInLane(p.clone().add(new THREE.Vector3(0,1.4,0)),target,a.friendly?this.allies:this.enemies,a,.55,1.85);
      const value=-Math.abs(range-ideal)*.45-movement*.15-crowd*3-(lane?6:0)+(p.y-a.pos.y)*.3;
      if(value>score){score=value;best=p;}
    }
    return best||a.pos.clone();
  }
  _planFriendly(a) {
    const command=this.squadCommand,mode=this.squadMode,p=this.player.pos,yaw=this.player.yaw??0;
    const target=a.target,offset=(a.formationIndex-1)*2.8;
    let anchor=p.clone(),radius=10;
    if(mode==='hold'){anchor.copy(command.target||p);radius=6;}
    if(mode==='advance'){
      const destination=command.target||this.objective;anchor.copy(destination);radius=7;
      if(target&&target.pos.distanceTo(a.pos)<25){
        // Advance by short bounds under fire, then continue once the lane clears.
        const dx=destination.x-a.pos.x,dz=destination.z-a.pos.z,L=Math.max(1,Math.hypot(dx,dz));
        anchor.set(a.pos.x+dx/L*Math.min(L,7),0,a.pos.z+dz/L*Math.min(L,7));
      }
      anchor.y=this.map.ground(anchor.x,anchor.z);
    }
    if(target&&target.pos.distanceTo(anchor)<36&&a.pos.distanceTo(anchor)<20){
      // Left/right soldiers open crossfire lanes; the middle soldier holds cover.
      const ideal=Math.max(10,this.director.profile.line-2),cover=this._coverGoal(a,target.pos,ideal,anchor,radius);
      if(cover){a.cover=cover;a.goal.copy(cover);a.intent='cover';return;}
      const to=target.pos.clone().sub(anchor).setY(0).normalize(),side=new THREE.Vector3(to.z,0,-to.x);
      const spot=this._safePoint(anchor.clone().addScaledVector(side,offset).addScaledVector(to,a.formationIndex===1?-2:1.5),a.pos);
      if(spot.distanceTo(anchor)<=radius&&this.map.solid.sees(spot.clone().add(new THREE.Vector3(0,1.5,0)),this._aimPoint(target))){a.cover=null;a.goal.copy(spot);a.intent=mode==='hold'?'hold':'cover';return;}
    }
    const follow=mode==='follow'?{x:p.x+Math.cos(yaw)*offset-Math.sin(yaw)*3,z:p.z-Math.sin(yaw)*offset-Math.cos(yaw)*3}:anchor.clone().add(new THREE.Vector3(offset,0,-1.5));
    a.cover=null;a.goal.copy(this._safePoint(follow,a.pos));a.intent=mode;
  }
  _plan(a) {
    const target=a.target,contact=a.lastSeen,dtSeen=this.time-a.lastContact;
    if(a.friendly){this._planFriendly(a);return;}
    if(this.cleanup){
      // Radio marks the last attackers for the HUD. Their AI advances along real paths.
      a.guard=false;a.cover=null;a.goal.copy(this._safePoint(this.player.pos,a.pos));a.phase='advance';a.intent='pressure';a.pathT=0;return;
    }
    if(!a.sees&&dtSeen>8){a.guard=false;a.cover=null;a.goal.copy(this._safePoint(this.objective,a.pos));a.phase='advance';a.intent='advance';return;}
    if(!a.sees&&dtSeen<8){
      a.cover=null;
      if(a.pos.distanceToSquared(contact)>3*3)a.goal.copy(this._safePoint(contact,a.pos));
      else{const angle=a.id*2.39996+Math.floor(a.searchT/3)*a.side;const p={x:contact.x+Math.sin(angle)*5,z:contact.z+Math.cos(angle)*5};a.goal.copy(this._safePoint(p,a.pos));}
      a.phase='advance';a.intent='search';return;
    }
    const dist=a.pos.distanceTo(target.pos),profile=this.director.profile,phase=this.tacticalPhase;
    // Assault posts may reposition near their home; they do not become stationary forever.
    if(a.guard&&dist<42&&this.time-a.lastContact>1){a.goal.copy(a.home);a.cover=null;a.intent='hold';return;}
    if(a.type==='support'||a.type==='sniper'){
      const ideal=a.type==='support'?profile.support:profile.sniper;
      const stale=!a.station||a.stationUntil<this.time||a.stationContact?.distanceTo(contact)>6||a.laneBlocked>.8||a.suppression>1.3;
      if(stale){a.station=this._stationGoal(a,contact,ideal);a.stationContact=contact.clone();a.stationUntil=this.time+(a.type==='sniper'?9:7);a.laneBlocked=0;}
      a.goal.copy(a.station);a.cover=a.station.protected?a.station:null;a.intent=a.pos.distanceTo(a.goal)>1?'relocate':'suppress';
      if(phase==='regroup'&&a.cover&&a.s.reloadT>=0){a.phase='hide';a.phaseT=Math.max(a.phaseT,.5);}return;
    }
    if(a.type==='heavy'){
      const ideal=phase==='regroup'?13:10,dx=a.pos.x-contact.x,dz=a.pos.z-contact.z,L=Math.max(1,Math.hypot(dx,dz));
      a.cover=null;a.goal.copy(this._safePoint({x:contact.x+dx/L*ideal,z:contact.z+dz/L*ideal},a.pos));a.intent='pressure';return;
    }
    if(a.type==='flank'&&dist>9&&dist<45){
      const flankers=this.enemies.filter(e=>!e.dead&&e!==a&&e.type==='flank'&&e.side===a.side);
      const canPush=!flankers.some(e=>e.id<a.id&&e.phase==='advance');
      const support=this.enemies.some(e=>!e.dead&&e!==a&&e.sees&&e.role!=='flank'&&(e.burst>0||e.aimT>.4));
      const activeSide=a.side===this.director.side||this.director.progress>.4;
      if(canPush&&(phase==='flank'&&activeSide||support&&phase==='advance')){
        const angle=Math.atan2(a.pos.x-contact.x,a.pos.z-contact.z),forward=phase==='flank'?10:16;
        const point={x:contact.x+Math.sin(angle)*forward+Math.cos(angle)*profile.flank*a.side,z:contact.z+Math.cos(angle)*forward-Math.sin(angle)*profile.flank*a.side};
        a.cover=null;a.goal.copy(this._safePoint(point,a.pos));a.phase='advance';a.intent='flank';return;
      }
    }
    const ideal=profile.line+(phase==='advance'?-4:phase==='regroup'?4:0);
    a.cover=this._coverGoal(a,contact,ideal);
    if(a.cover){a.goal.copy(a.cover);a.intent='cover';return;}
    if(dist>ideal+4||dist<7||phase==='regroup')a.goal.copy(this._stationGoal(a,contact,ideal));else a.goal.copy(a.pos);
    a.intent=phase==='suppress'?'suppress':phase==='regroup'?'regroup':'advance';
  }
  _route(a) {
    if(a.pathT>0&&a.pathGoal.distanceToSquared(a.goal)<9)return;
    a.pathT=this.cleanup?.55:1.2+((a.id%3)*.1);a.pathGoal.copy(a.goal);
    if(this._clearSegment(a.pos,a.goal)){a.path=[a.goal.clone()];return;}
    a.path=this._routes().route(a.pos,a.goal).map(n=>new THREE.Vector3(n.x,n.y??this.map.ground(n.x,n.z),n.z));
    const start=this.map.nav.nodes[this._routes().nearest(a.pos,null,true)];
    if(start&&Math.hypot(start.x-a.pos.x,start.z-a.pos.z)>.45&&this._clearSegment(a.pos,start))a.path.unshift(new THREE.Vector3(start.x,start.y,start.z));
  }
  _move(a,dt) {
    const s=a.s,T=a.T,distance=Math.hypot(a.goal.x-a.pos.x,a.goal.z-a.pos.z);
    let movement=new THREE.Vector3();
    if(distance>.7&&a.phase!=='hide'&&a.stagger<=0){
      this._route(a);
      while(a.path.length&&Math.hypot(a.path[0].x-a.pos.x,a.path[0].z-a.pos.z)<.42)a.path.shift();
      let next=a.path[0];
      if(next){
        // Skip only a physically clear waypoint; never cut the corner of a wall.
        if(a.path.length>1&&this._clearSegment(a.pos,a.path[1])){a.path.shift();next=a.path[0];}
        movement.subVectors(next,a.pos).setY(0).normalize();
        const peers=a.friendly?this.allies:this.enemies;
        for(const p of peers){if(p===a||p.dead)continue;const dx=a.pos.x-p.pos.x,dz=a.pos.z-p.pos.z,d2=dx*dx+dz*dz;if(d2>1e-5&&d2<1.1){const L=Math.sqrt(d2);movement.x+=dx/L*.6;movement.z+=dz/L*.6;}}
        if(a.friendly){const dx=a.pos.x-this.player.pos.x,dz=a.pos.z-this.player.pos.z,L=Math.hypot(dx,dz);if(L<1.2&&L>.001){movement.x+=dx/L;movement.z+=dz/L;}}
        const slowPressure=a.type==='heavy'&&a.sees;
        movement.normalize().multiplyScalar(slowPressure?T.walk:a.sees&&distance<7?T.walk:T.run*(a.suppression>.8?.75:1));
      }
    }
    // Series hit recoil is a short physical step, checked against the same walls as walking.
    const recoiling=a.stagger>0&&a.stagV?.lengthSq()>1e-5;
    const before=a.pos.clone(),velocity=recoiling?a.stagV.clone():s.vel.clone().lerp(movement,1-Math.exp(-dt*8));
    const steps=Math.max(1,Math.ceil(velocity.length()*dt/.16));
    for(let i=0;i<steps;i++){
      const next=a.pos.clone().addScaledVector(velocity,dt/steps);next.y=this.map.solid.floorAt(next.x,next.z,a.pos.y+.5);
      if(this._clearSegment(a.pos,next)){a.pos.copy(next);continue;}
      const x=next.clone();x.z=a.pos.z;x.y=this.map.solid.floorAt(x.x,x.z,a.pos.y+.5);
      const z=next.clone();z.x=a.pos.x;z.y=this.map.solid.floorAt(z.x,z.z,a.pos.y+.5);
      if(this._clearSegment(a.pos,x))a.pos.copy(x);else if(this._clearSegment(a.pos,z))a.pos.copy(z);else{a.pathT=0;break;}
    }
    if(a.stagV){if(a.stagger>0)a.stagV.multiplyScalar(Math.exp(-dt*10));else a.stagV.set(0,0,0);}
    s.vel.copy(a.pos).sub(before).multiplyScalar(1/Math.max(dt,.001));
    if(distance>1.2){
      a.stuckT+=dt;
      if(a.stuckT>=1){
        const progress=a.pos.distanceTo(a.progressPos);a.stuckT=0;a.progressPos.copy(a.pos);
        if(progress<.22){a.pathT=0;a.planT=0;a.cover=null;a.phase='advance';a.lastProgress+=1;
          // Try an adjacent reachable grid point to separate from a crowded waypoint.
          const nearby=this.map.nav.nodes.filter(n=>!n.blocked&&Math.hypot(n.x-a.pos.x,n.z-a.pos.z)>1&&Math.hypot(n.x-a.pos.x,n.z-a.pos.z)<3.5&&this._clearSegment(a.pos,n));
          nearby.sort((p,q)=>Math.hypot(p.x-a.goal.x,p.z-a.goal.z)-Math.hypot(q.x-a.goal.x,q.z-a.goal.z));
          if(nearby.length){const n=nearby[a.lastProgress%Math.min(2,nearby.length)];a.path=[new THREE.Vector3(n.x,n.y,n.z),...a.path];a.pathT=.5;}
        }else a.lastProgress=0;
      }
    }else{a.stuckT=0;a.progressPos.copy(a.pos);}
    const moving=s.vel.lengthSq()>.3;
    const aim=a.target?this._aimPoint(a.target):a.lastContact>this.time-8?a.lastSeen.clone().add(new THREE.Vector3(0,1.1,0)):a.goal.clone().add(new THREE.Vector3(0,1.1,0));
    const to=aim.sub(a.pos),yaw=Math.atan2(to.x,to.z);
    s.aimYaw=lerpAngle(s.aimYaw,yaw,1-Math.exp(-dt*7));
    s.aimPitch=THREE.MathUtils.damp(s.aimPitch,Math.atan2(to.y-1.35,Math.max(.5,Math.hypot(to.x,to.z))),8,dt);
    s.yaw=moving?Math.atan2(s.vel.x,s.vel.z):s.aimYaw;
    s.mode=a.sees&&(!moving||distance<7||a.type==='heavy')?'aim':moving?'run':'patrol';
    s.crouchT=a.phase==='hide'||(a.cover&&distance<1&&a.type!=='heavy'&&(!a.sees||a.suppression>.4))?1:0;
    s.lean=a.cover&&a.phase==='aim'?a.side*.2:0;
    a.stepPhase+=dt*Math.hypot(s.vel.x,s.vel.z)/1.5;
    if(a.stepPhase>=1){a.stepPhase%=1;if(a.pos.distanceToSquared(this.player.pos)<24*24)this.audio?.trooperStep?.(a.pos);}
    s.update(dt,a.pos.distanceToSquared(this.player.pos)>45*45);
  }
  _shootActor(a,dt) {
    const s=a.s,T=a.T;
    a.shotT-=dt;a.restT-=dt;
    if(a.laser)a.laser.visible=false;
    if(s.reloadT>=0||a.stagger>0||!a.target||a.target.dead||!a.sees||s.mode!=='aim'||a.phase==='hide'){
      a.aimT=Math.max(0,a.aimT-dt*3);a.burst=0;return;
    }
    const from=s.muzzle(new THREE.Vector3()),point=this._aimPoint(a.target);
    const team=a.friendly?this.allies:this.enemies;
    const blocked=allyInLane(from,point,team,a,.4,1.85)||(a.friendly&&allyInLane(from,point,[this.player],null,.4,(this.player.eyeH??1.58)+.15));
    if(blocked||!this.map.solid.sees(from,point)){a.aimT=0;a.burst=0;a.laneBlocked=(a.laneBlocked||0)+dt;return;}
    a.laneBlocked=Math.max(0,(a.laneBlocked||0)-dt*2);
    a.aimT+=dt;
    if(a.laser&&a.aimT>0){
      const p=a.laser.geometry.attributes.position;p.setXYZ(0,from.x,from.y,from.z);p.setXYZ(1,point.x,point.y,point.z);p.needsUpdate=true;a.laser.visible=true;
      if(!a.glint){this.audio?.sniperGlint?.(from);a.glint=true;}
    }
    if(a.burst===0&&a.aimT>=T.aim&&a.restT<=0&&s.aimW>.84){a.burst=Math.min(a.ammo,T.burst);a.glint=false;}
    if(a.burst<=0||a.shotT>0)return;
    const dist=from.distanceTo(point),targetVel=a.target===this.player?this.player.vel:a.target.s.vel;
    point.addScaledVector(targetVel,dist/T.speed*.35);
    const dir=point.sub(from).normalize(),spread=T.spread*(a.suppression>.5?1.4:1)*(a.target===this.player&&this.player.sprintK>.4?1.5:1);
    dir.x+=random(-spread,spread);dir.y+=random(-spread*.6,spread*.6);dir.z+=random(-spread,spread);dir.normalize();
    this._bolt(from,dir,T.speed,T.damage*(a.friendly?1:this.difficulty.damage??1),a);
    s.recoil=1;a.burst--;a.ammo--;a.shotT=T.gap*random(.9,1.13);
    this.audio?.enemyShot?.(from,T.gun==='sniper'?'sniper':T.gun==='heavy'?'heavy':'rifle');
    if(this.fx?.muzzle)this.fx.muzzle(from,dir,a.friendly?[.5,2.2,3.8]:[3.8,.46,.13],T.gun==='sniper');
    else this.flashes.push({p:from.clone(),t:.055,size:T.gun==='sniper'?.14:.1,color:a.friendly?blue:red});
    if(a.burst===0){a.aimT=0;a.restT=random(.65,1.1);if(a.cover){a.phase='hide';a.phaseT=random(.45,.85);}}
    if(a.ammo<=0){a.ammo=T.mag;s.reloadT=0;a.burst=0;a.aimT=0;a.restT=1.75;if(a.cover){a.phase='hide';a.phaseT=1.75;}}
  }
  _bolt(p,dir,speed,damage,from) {
    if(this.bolts.length>=MAX_BOLTS)return;
    this.bolts.push({p:p.clone(),dir:dir.clone(),speed,damage,from,left:110,whizzed:false});
  }
  _playerHit(o,d,max) {
    if(this.player.dead)return null;
    // The player uses a physical vertical capsule, matching Pilot's collision/eye height.
    const r=.29,p=this.player.pos,h=(this.player.eyeH??1.58)+.13;
    return rayCapsule(o,d,new THREE.Vector3(p.x,p.y+r,p.z),new THREE.Vector3(p.x,p.y+h-r,p.z),r,max);
  }
  _projectiles(dt) {
    for(let i=this.bolts.length-1;i>=0;i--){
      const b=this.bolts[i],L=Math.min(b.left,b.speed*dt),wall=this.map.solid.ray(b.p,b.dir,L);let limit=wall?.t??L,actor=null,part='chest';
      // Team members physically stop shots too, in case they cross the lane after firing.
      for(const a of [...this.enemies,...this.allies]){if(a===b.from||a.dead)continue;const h=a.hitTest(b.p,b.dir,limit);if(h){limit=h.t;actor=a;part=h.part;}}
      const player=this._playerHit(b.p,b.dir,limit);if(player!=null){limit=player;actor=this.player;}
      const end=b.p.clone().addScaledVector(b.dir,limit);
      if(actor){
        if(actor===this.player){if(!b.from.friendly)this.onPlayerHurt?.(b.damage,b.from.pos);}
        else if(actor.friendly!==b.from.friendly){actor.damage(b.damage*(part==='head'?1.6:part==='limb'?.75:1),b.dir,part);}
        const armored=!!(actor.T?.armor&&part!=='head'),kind=armored?'armor':'body';
        this._impact(end,kind,b.dir.clone().negate(),b.from.type==='sniper'?.85:.55,actor===this.player?[4,.6,.3]:IMPACT_COLORS[armored?'armor':part==='head'?'head':'body']);
        this.bolts.splice(i,1);continue;
      }
      if(wall){const kind=surfaceKind(wall.mat);this._impact(end,kind,wall.n,.55,[4,.7,.3]);this.audio?.hit?.(end,kind);this.bolts.splice(i,1);continue;}
      if(!b.whizzed&&!b.from.friendly){
        const ear=this._eye(this.player),along=clamp(ear.clone().sub(b.p).dot(b.dir),0,L),near=b.p.clone().addScaledVector(b.dir,along);
        if(ear.distanceToSquared(near)<1.4*1.4){this.audio?.whiz?.(near);b.whizzed=true;}
      }
      b.p.copy(end);b.left-=L;if(b.left<=0)this.bolts.splice(i,1);
    }
  }
  _impact(p,kind='concrete',normal=UP,scale=1,color=IMPACT_COLORS[kind]||IMPACT_COLORS.concrete) {
    if(this.fx?.impact){this.fx.impact(p,normal,kind,color,scale);return;}
    const count=Math.round((kind==='armor'||kind==='metal'?14:9)*scale),c=new THREE.Color(...color);
    for(let i=0;i<count&&this.sparks.length<MAX_SPARKS;i++){
      const v=new THREE.Vector3(random(-1,1),random(-1,1),random(-1,1)).normalize().addScaledVector(normal,1.3).normalize().multiplyScalar(random(2,6)*scale);
      this.sparks.push({p:p.clone(),v,t:random(.18,.4),color:c});
    }
  }
  shoot(origin,dir,weapon={},feedback={}) {
    const range=weapon.range??110,wall=this.map.solid.ray(origin,dir,range);let t=wall?.t??range,actor=null,part=null;
    for(const a of [...this.enemies,...this.allies]){const h=a.hitTest(origin,dir,t);if(h){t=h.t;actor=a;part=h.part;}}
    let killed=false;
    // Iron Dusk's WEAPONS stores head/limb as absolute damage, not multipliers.
    if(actor){const base=weapon.dmg??40,d=part==='head'?(weapon.head??base*2):part==='limb'?(weapon.limb??base*.75):base;killed=actor.damage(d*(actor.friendly?.12:1),dir,part);}
    const point=origin.clone().addScaledVector(dir,t),normal=actor?dir.clone().negate():wall?.n?.clone()||dir.clone().negate();
    const armored=!!(actor?.T?.armor&&part!=='head'),impactKind=actor?(armored?'armor':'body'):wall?surfaceKind(wall.mat):null;
    const markerKind=actor?(killed?'kill':part==='head'?'head':armored?'armor':'hit'):null;
    const rifle=feedback.weapon==='rifle',scale=rifle?1.25:.85;
    // Draw from the actual weapon muzzle. Ray tests continue to use the eye for aiming.
    if(feedback.muzzle){
      this.fx?.beam?.(feedback.muzzle,point,rifle?'rifle':'pistol');
      this.fx?.muzzle?.(feedback.muzzle,dir,rifle?[.6,2.6,4.2]:[.5,2.2,3.8],rifle);
      if(!this.fx?.muzzle)this.flashes.push({p:feedback.muzzle.clone(),t:.055,size:rifle?.14:.1,color:blue});
    }
    let audioHandled=false;
    if(impactKind){
      const color=actor?IMPACT_COLORS[armored?'armor':part==='head'?'head':'body']:IMPACT_COLORS[impactKind];
      this._impact(point,impactKind,normal,actor?scale*(armored?1.2:part==='head'?1.4:1):rifle?1.1:.6,color);
      if(this.audio?.hit){
        const sound=actor?part==='head'?'head':armored?'armor':'body':impactKind;
        this.audio.hit(actor?origin.clone().addScaledVector(dir,Math.min(t,3)):point,sound);audioHandled=true;
      }
    }
    return {t,actor,part,killed,wall:actor?null:wall,point,normal,armored,impactKind,markerKind,audioHandled};
  }
  explode(pos,radius=8) {
    const center=pos.clone();center.y+=.12;
    for(const a of [...this.enemies,...this.allies]){
      if(a.dead)continue;const chest=this._aimPoint(a),distance=chest.distanceTo(center);if(distance>=radius||!this.map.solid.sees(center,chest))continue;
      const dir=chest.clone().sub(center).normalize();a.damage(220*(1-distance/radius)*(a.friendly?.3:1),dir,'chest');a.suppression=2;
    }
    const point=this._aimPoint(this.player),distance=point.distanceTo(center);
    if(distance<radius&&!this.player.dead&&this.map.solid.sees(center,point))this.onPlayerHurt?.(75*(1-distance/radius),center);
    if(this.fx?.explode)this.fx.explode(center,radius/8);else this._impact(center,'metal',UP,1.6,[3,1.3,.4]);
  }
  update(dt,{mode=this.mode,target=this.objective,cleanup=false,time,wave=1,operation=null,squadCommand=null}={}) {
    dt=clamp(Number.isFinite(dt)?dt:0,0,.1);if(!dt)return;
    this.time=Number.isFinite(time)?time:this.time+dt;this.mode=mode;this.cleanup=!!cleanup;
    if(target)this.objective.set(target.x,this.map.ground(target.x,target.z),target.z);
    const previousPhase=this.tacticalPhase;this.director.update(this.time,wave,operation,this.map.kind);this.tacticalPhase=this.director.phase;
    if(previousPhase!==this.tacticalPhase)for(const a of this.enemies)a.planT=0;
    if(squadCommand){
      const commandMode=['follow','hold','advance'].includes(squadCommand.mode)?squadCommand.mode:'follow',position=squadCommand.target;
      const key=`${commandMode}:${position?.x??''}:${position?.z??''}`;
      if(key!==this.commandKey){
        this.commandKey=key;this.squadMode=commandMode;
        this.squadCommand={mode:commandMode,target:position?new THREE.Vector3(position.x,this.map.ground(position.x,position.z),position.z):null};
        for(const a of this.allies){a.planT=0;a.pathT=0;a.phase='advance';a.cover=null;}
      }
    }
    for(const a of [...this.enemies,...this.allies]){
      if(a.dead){a.deathAge+=dt;if(a.deathAge<6)a.s.update(dt);if(a.deathAge>18)a.fade?.((a.deathAge-18)/2);continue;}
      a.barT=Math.max(0,a.barT-dt);a.hitFlash=Math.max(0,(a.hitFlash||0)-dt);a.stagger=Math.max(0,a.stagger-dt);a.suppression=Math.max(0,a.suppression-dt*.35);
      a.senseT-=dt;a.planT-=dt;a.pathT-=dt;a.phaseT-=dt;a.searchT+=dt;
      if(a.senseT<=0){a.senseT=.18+(a.id%3)*.012;this._sense(a);}
      if(a.phaseT<=0){a.phase=a.phase==='hide'?'aim':'advance';a.phaseT=random(1.2,2.5);}
      if(a.planT<=0){a.planT=.9+(a.id%4)*.1;this._plan(a);}
      this._move(a,dt);this._shootActor(a,dt);
    }
    this._projectiles(dt);this._drawFX(dt);
    // Old bodies are removed only after the physical death animation and ragdoll settle.
    for(let i=this.enemies.length-1;i>=0;i--)if(this.enemies[i].dead&&this.enemies[i].deathAge>20){this.enemies[i].dispose();this.enemies.splice(i,1);}
  }
  _drawFX(dt) {
    if(!this.fxRoot)return;
    for(let i=0;i<this.bolts.length;i++){
      const b=this.bolts[i],len=Math.min(1.8,b.speed*.016);this._vector.copy(b.p).addScaledVector(b.dir,-len*.5);this._rotation.setFromUnitVectors(UP,b.dir);this._scale.set(1,len,1);
      this._matrix.compose(this._vector,this._rotation,this._scale);this.traces.setMatrixAt(i,this._matrix);this.traces.setColorAt(i,b.from.friendly?blue:red);
    }
    this.traces.count=this.bolts.length;this.traces.instanceMatrix.needsUpdate=true;if(this.traces.instanceColor)this.traces.instanceColor.needsUpdate=true;
    for(let i=this.sparks.length-1;i>=0;i--){const p=this.sparks[i];p.t-=dt;p.v.y-=dt*5;p.p.addScaledVector(p.v,dt);if(p.t<=0)this.sparks.splice(i,1);}
    this._rotation.identity();
    for(let i=0;i<this.sparks.length;i++){const p=this.sparks[i];this._scale.setScalar(Math.min(1,p.t*8));this._matrix.compose(p.p,this._rotation,this._scale);this.sparkMesh.setMatrixAt(i,this._matrix);this.sparkMesh.setColorAt(i,p.color||gold);}
    this.sparkMesh.count=this.sparks.length;this.sparkMesh.instanceMatrix.needsUpdate=true;if(this.sparkMesh.instanceColor)this.sparkMesh.instanceColor.needsUpdate=true;
    for(let i=this.flashes.length-1;i>=0;i--)if((this.flashes[i].t-=dt)<=0)this.flashes.splice(i,1);
    for(let i=0;i<Math.min(32,this.flashes.length);i++){const f=this.flashes[i];this._scale.set(f.size,f.size*.55,f.size*1.8);this._matrix.compose(f.p,this._rotation,this._scale);this.flashMesh.setMatrixAt(i,this._matrix);this.flashMesh.setColorAt(i,f.color);}
    this.flashMesh.count=Math.min(32,this.flashes.length);this.flashMesh.instanceMatrix.needsUpdate=true;if(this.flashMesh.instanceColor)this.flashMesh.instanceColor.needsUpdate=true;
  }
  clear() {
    for(const a of [...this.enemies,...this.allies])a.dispose();this.enemies.length=this.allies.length=this.bolts.length=this.sparks.length=this.flashes.length=0;
    // Instancing buffers are per battle; the underlying geometries/materials remain cached.
    if(this.fxRoot){this.fxRoot.removeFromParent();this.traces.dispose();this.sparkMesh.dispose();this.flashMesh.dispose();this.fxRoot=null;}
    // The caller owns FXL and its materials; clearing only resets this battle's particles.
    this.fx?.clear?.();
  }
}

// Ray/capsule intersection for Pilot's collision body. Direction must be normalized.
function rayCapsule(o,d,a,b,r,max) {
  const ba=b.clone().sub(a),oa=o.clone().sub(a),baba=ba.dot(ba),bard=ba.dot(d),baoa=ba.dot(oa),rdoa=d.dot(oa),oaoa=oa.dot(oa);
  const A=baba-bard*bard,B=baba*rdoa-baoa*bard,C=baba*oaoa-baoa*baoa-r*r*baba,H=B*B-A*C;
  if(Math.abs(A)>1e-9&&H>=0){const t=(-B-Math.sqrt(H))/A,y=baoa+t*bard;if(t>=0&&t<max&&y>0&&y<baba)return t;}
  let best=max;
  for(const center of [a,b]){const v=o.clone().sub(center),q=d.dot(v),h=q*q-v.lengthSq()+r*r;if(h<0)continue;const t=-q-Math.sqrt(h);if(t>=0&&t<best)best=t;}
  return best<max?best:null;
}
