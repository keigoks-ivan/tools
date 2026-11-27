import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Combat,W} from '../combat.js';
import {createShieldField} from '../shield-field.mjs';
import {createFootContactShadows} from '../foot-contact.mjs?v=1';

export const FALCON_WEAPONS = {
  rifle:{mobile:true,mag:48,rof:.155,reload:1.65,dmg:276,stag:18},
  msl:{...W.msl,n:1,tapFire:true,cd:6,lockStep:.08,cone:.51,range:850,dmg:680,stag:57,offsets:[0,.045,.25,.295,.50,.545]},
  cannon:{cd:24,range:720,chainRange:140,pulses:3,interval:.36,dmg:1450},
};
const source=new THREE.Vector3(),contact=new THREE.Vector3();
export class FalconCombat extends Combat {
  constructor(options){super({...options,loadout:FALCON_WEAPONS});this.marked=null;this.markFor=0;
    this.releaseSector=this.enc.E.secs.findIndex(c=>c.pickup?.releaseFerry);
  }
  prep(){
    super.prep();this.world.taipeiRiver?.reset(this.enc.sec>this.releaseSector);
  }
  playerWeapons(dt,input){
    this.markFor=Math.max(0,this.markFor-dt);
    if(!this.markFor||this.marked?.dead||this.marked?.gone){this.marked=null;this.markFor=0;}
    super.playerWeapons(dt,input);
  }
  launchSalvo(locks){
    const e=locks[0] || this.fireTarget();
    this.hero.designator.getWorldPosition(source);
    const guided=e && !e.dead && !e.gone && e.los && !e.dropping &&
      e.chest(contact).distanceTo(source)<=this.weapons.msl.range && this.clearArc(source,contact);
    this.msl.cd=0;
    if(guided){
      this.marked=e;this.markFor=8;
      this.fx.tracer(source,contact);this.audio.ui('confirm');
    }
    this.queueMissiles(guided?[e]:[],6);
    this.note(guided?'羽標鎖定・六彈齊射':'羽標齊射・未鎖定','cy');
  }
  clearArc(from,to){
    const hit=this.world.raycast(from,to,null);
    return hit<0 || hit>=.98;
  }
  arcTarget(from,range,visited,forward,preferred){
    let best=null,lowest=Infinity;
    const delta=new THREE.Vector3();
    for(const e of this.enemies){
      if(e.dead || e.gone || visited.has(e))continue;
      const p=e.chest(contact),dist=delta.subVectors(p,from).length();
      if(dist>range || !this.clearArc(from,p))continue;
      if(e===preferred)return e;
      const alignment=delta.normalize().dot(this.aimDir);
      if(forward && alignment<.65)continue;
      const rank=forward?dist/range+2*(1-alignment):dist;
      if(rank<lowest){lowest=rank;best=e;}
    }
    return best;
  }
  startCannon(){
    const K=this.weapons.cannon,visited=new Set();
    const origin=this.hero.missilePorts[0].getWorldPosition(new THREE.Vector3());
    const primary=this.arcTarget(origin,K.range,visited,true,this.marked);
    if(!primary){this.note('羽陣・請面向敵機或先用羽標','am');return;}
    this.cannon.cd=0;
    this.audio.ui('confirm');this.note('白夜羽陣・三輪放電','cy');
    for(let pulse=0;pulse<K.pulses;pulse++){
      this.events.push({t:pulse*K.interval,fn:()=>{
        if(this.dead || this.phase!=='fight')return;
        visited.clear();
        this.hero.missilePorts[pulse%2].getWorldPosition(origin);
        let e=this.arcTarget(origin,K.range,visited,true,primary);
        if(e)this.cockpit.kick('fire',.60);
        for(let hop=0;e && hop<3;hop++){
          visited.add(e);
          const hit=e.chest(new THREE.Vector3()),dir=hit.clone().sub(origin).normalize();
          this.fx.wingArc(origin,hit);this.audio.impact(hit,'beam');this.stats.shots++;
          this.damageEnemy(e,K.dmg*(1-.2*hop),60,hit,dir);
          origin.copy(hit);
          if(hop<2)e=this.arcTarget(origin,K.chainRange,visited,false,null);
        }
      }});
    }
  }
  get echoActive(){
    return !!this.boss&&!this.boss.dead&&this.boss.ap<this.boss.apMax*.52&&this.enc.fightT%10<6&&this.marked!==this.boss;
  }
  damageEnemy(e,dmg,stag,pos,dir,crit=false,support=false){
    const echo=e===this.boss&&this.echoActive;
    super.damageEnemy(e,echo?dmg*.34:dmg,echo?stag*.3:stag,pos,dir,crit,support);
  }
  update(dt,input,rdt){
    super.update(dt,input,rdt);
    if(this.world.taipeiRiver){
      const E=this.enc;this.world.taipeiRiver.tick(dt,E&&(E.sec>this.releaseSector||E.sec===this.releaseSector&&E.collected||E.state==='done'));
    }
  }
}

// Chamfered hull sections use the same dimensions at their joints as the visible apertures.
function shell(lengths){
  const pos=[],idx=[];
  for(const [z,x,y,w,h] of lengths){
    const bx=w*.29,by=h*.30;
    for(const [dx,dy] of [[-w+bx,-h],[w-bx,-h],[w,-h+by],[w,h-by],[w-bx,h],[-w+bx,h],[-w,h-by],[-w,-h+by]])pos.push(x+dx,y+dy,z);
  }
  for(let j=1;j<lengths.length;j++)for(let i=0;i<8;i++){
    const a=(j-1)*8+i,b=(j-1)*8+(i+1)%8;idx.push(a,b,b+8,a,b+8,a+8);
  }
  const end=(lengths.length-1)*8;
  for(let i=1;i<7;i++)idx.push(0,i+1,i,end,end+i,end+i+1);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);
  const g=geo.toNonIndexed();g.computeVertexNormals();return g;
}
export function fitFalcon(hero,A){
  hero.root.name='第三裝甲連・白隼';
  hero.footContacts=createFootContactShadows(hero.root,[hero.bones.ankleR,hero.bones.ankleL]);
  hero.shieldField=createShieldField();hero.root.add(hero.shieldField.mesh);
  const shared=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.52,roughness:.56,roughnessMap:A.wearM});
  const parts=[];
  function add(g,color){
    if(g.index)g=g.toNonIndexed();g.deleteAttribute('uv');
    const n=g.attributes.position.count,c=new THREE.Color(color),colors=new Float32Array(n*3);
    for(let i=0;i<n;i++)c.toArray(colors,i*3);
    g.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(g);
  }
  function bake(parent){
    const g=mergeGeometries(parts);parts.length=0;
    // World-space wear modulates all pieces without a separate texture atlas.
    const p=g.attributes.position,uvs=new Float32Array(p.count*2);
    for(let i=0;i<p.count;i++){uvs[2*i]=(p.getX(i)+p.getZ(i))*.2;uvs[2*i+1]=p.getY(i)*.3;}
    g.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
    const mesh=new THREE.Mesh(g,shared);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.mech=hero;parent.add(mesh);hero.meshes.push(mesh);
  }
  const old=new Set();hero.weapon.traverse(o=>old.add(o));hero.meshes=hero.meshes.filter(m=>!old.has(m));hero.glows=hero.glows.filter(m=>!old.has(m));
  hero.weapon.clear();
  const enamel=0xc2ccc6,steel=0x42525a,teal=0x39656b,gold=0xc39852;
  add(shell([[-1.9,0,.13,.27,.38],[-.6,0,.2,.43,.54],[2.55,0,.27,.43,.43],[3.4,0,.21,.21,.22]]),steel);
  for(const s of [-1,1]){
    add(shell([[-.55,s*.35,.37,.11,.22],[.25,s*.39,.35,.16,.35],[2.28,s*.37,.25,.15,.25],[3.65,s*.23,.26,.055,.10]]),enamel);
    for(let i=0;i<4;i++)add(new THREE.BoxGeometry(.035,.26,.12).rotateX(-.3).translate(s*.555,.37,.32+i*.31),teal);
  }
  add(shell([[2.25,0,.19,.21,.22],[4.6,0,.19,.19,.18],[4.88,0,.19,.32,.30],[5.72,0,.19,.27,.24]]),steel);
  add(shell([[5.725,0,.19,.20,.16],[5.74,0,.19,.2,.16]]),0x122329);
  add(new THREE.BoxGeometry(.22,.10,1.48).translate(0,.78,.64),gold);bake(hero.weapon);
  hero.muzzle.position.set(0,.19,5.78);hero.weapon.add(hero.muzzle);
  hero.missilePorts=[];
  for(const s of [-1,1]){
    const wing=new THREE.Group();wing.position.set(s*2.40,4.45,-1.64);wing.rotation.z=s*-.26;hero.bones.torso.add(wing);
    add(shell([[-5.5,s*2.25,.4,.20,.43],[-4.6,s*1.75,.32,.45,.68],[-.9,s*.5,.15,.70,.84],[.3,0,.08,.70,.65]]),enamel);
    add(shell([[-4.7,s*1.68,.33,.13,.73],[-2.1,s*.92,.3,.26,.89],[-.38,s*.29,.2,.25,.91]]),teal);
    for(let j=0;j<3;j++){
      const px=(j-1)*.38;
      add(new THREE.CylinderGeometry(.19,.21,.37,10).rotateX(Math.PI/2).translate(px,.08,.4),steel);
      add(new THREE.CylinderGeometry(.135,.135,.025,10).rotateX(Math.PI/2).translate(px,.08,.6),0x15272b);
      const port=new THREE.Object3D();port.position.set(px,.08,.67);wing.add(port);hero.missilePorts[j*2+(s>0?1:0)]=port;
    }
    bake(wing);
  }
  hero.designator=new THREE.Object3D();hero.designator.position.set(.26,-1.04,1.05);hero.bones.handL.add(hero.designator);
  add(shell([[-.4,0,0,.20,.18],[.3,0,0,.27,.22],[.54,0,0,.20,.16]]),teal);
  add(new THREE.BoxGeometry(.25,.16,.04).translate(0,0,.57),gold);bake(hero.designator);
}
export function falconTitle(renderer,hero,world){
  const st={vel:new THREE.Vector3(),grounded:true,boost:0,torsoYaw:2.78,pitch:0,thrust:0,aim:null,lean:0};
  let time=0;
  return {scene:world.scene,hero,render(dt,camera){
    time+=dt;const [x,z]=world.fieldRoute.pts[0];hero.root.position.set(x,world.height(x,z),z);
    hero.legYaw=st.torsoYaw;hero.animate(dt,st);const p=hero.root.position;
    camera.position.set(p.x+12+Math.sin(time*.12)*.8,p.y+9.4,p.z-25);
    camera.lookAt(p.x,p.y+9,p.z);world.skyDome.position.copy(camera.position);world.followShadow(p);
    renderer.render(world.scene,camera);
  }};
}
