import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {rayCapsule} from '../flight.mjs';

const v=()=>new THREE.Vector3();
export class EchoTape {
  constructor(){this.frames=[];this.shots=[];this.interval=.12;this.duration=0;}
  recordPose(t,p,force=false){
    const frames=this.frames;
    if(!force&&frames.length&&t-frames.at(-1).t<this.interval)return;
    if(frames.length>=512){this.frames=frames.filter((_,i)=>i%2===0);this.interval*=2;}
    this.frames.push({t,x:p.pos.x,y:p.pos.y,z:p.pos.z,yaw:p.yaw});this.duration=t;
  }
  capture(t,C,dir,damage=0){
    // Preserve impacts when long bursts fill the cosmetic tracer budget.
    if(!damage&&this.shots.length>=256)return;
    if(this.shots.length>=512){
      const expendable=this.shots.findIndex(s=>!s.damage);
      if(expendable===-1)return;
      this.shots.splice(expendable,1);
    }
    this.shots.push({t,origin:C.hero.muzzle.getWorldPosition(v()),dir:dir.clone(),damage});
  }
  record(t,C,previous){
    this.recordPose(t,C.player);
    const last=this.shots.at(-1);
    if(C.stats.shots>previous&&(!last?.damage||t-last.t>.12))this.capture(t,C,C.aimDir);
  }
  pose(t,model){
    const a=this.frames;if(!a.length)return;
    let lo=0,hi=a.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(a[mid].t<t)lo=mid+1;else hi=mid;}
    const end=a[lo],start=a[Math.max(0,lo-1)];
    const f=THREE.MathUtils.clamp((t-start.t)/(end.t-start.t||1),0,1);
    model.position.set(THREE.MathUtils.lerp(start.x,end.x,f),THREE.MathUtils.lerp(start.y,end.y,f),THREE.MathUtils.lerp(start.z,end.z,f));
    const d=end.yaw-start.yaw;model.rotation.y=start.yaw+Math.atan2(Math.sin(d),Math.cos(d))*f;
    const speed=Math.hypot(end.x-start.x,end.z-start.z)/(end.t-start.t||1);
    const swing=t<this.duration?Math.min(.45,speed*.017)*Math.sin(t*7):0;
    model.userData.legs.forEach((leg,i)=>leg.rotation.x=i?swing:-swing);
  }
}
export function echoFigure(root,hero){
  // Bake the selected mech into three position-only batches. The echo needs no second rig or textures.
  hero.root.updateWorldMatrix(true,true);
  const figure=new THREE.Group(),mat=new THREE.MeshBasicMaterial({color:0x59edff,transparent:true,opacity:.47,depthWrite:false});
  const inverse=hero.root.matrixWorld.clone().invert();
  const hips=[hero.bones.hipL,hero.bones.hipR];
  const legs=hips.map(hip=>{
    const leg=new THREE.Group();leg.position.setFromMatrixPosition(hip.matrixWorld).applyMatrix4(inverse);
    figure.add(leg);return leg;
  });
  const groups=[figure,...legs],pieces=groups.map(()=>[]);
  for(const mesh of hero.meshes){
    let ancestor=mesh;
    while(ancestor&&ancestor!==hero.root&&!hips.includes(ancestor))ancestor=ancestor.parent;
    const index=hips.indexOf(ancestor)+1,parent=groups[index];
    const local=new THREE.Matrix4().makeTranslation(-parent.position.x,-parent.position.y,-parent.position.z)
      .multiply(inverse).multiply(mesh.matrixWorld);
    const geometry=new THREE.BufferGeometry(),source=mesh.geometry;
    geometry.setAttribute('position',source.attributes.position.clone().applyMatrix4(local));
    geometry.setIndex(source.index || Array.from({length:source.attributes.position.count},(_,i)=>i));
    pieces[index].push(geometry);
  }
  const geometries=[];
  groups.forEach((parent,i)=>{
    if(!pieces[i].length)return;
    const result=mergeGeometries(pieces[i]);
    pieces[i].forEach(piece=>piece.dispose());
    parent.add(new THREE.Mesh(result,mat));geometries.push(result);
  });
  figure.userData.legs=legs;figure.userData.release=()=>{figure.removeFromParent();geometries.forEach(g=>g.dispose());mat.dispose();};
  figure.visible=false;root.add(figure);return figure;
}
export function replayShot(C,shot){
  const {origin,dir,damage}=shot,end=origin.clone().addScaledVector(dir,1200);
  const wall=C.world.raycast(origin,end,null);
  let nearest=wall<0?1200:wall*1200,target=null;
  for(const e of C.enc.mine){
    if(e.dead||e.gone)continue;
    const d=rayCapsule(origin,dir,e.m.capsule(),nearest);
    if(d>=0){nearest=d;target=e;}
  }
  end.copy(origin).addScaledVector(dir,nearest);C.fx.beam(origin,end,'player');
  if(target&&damage){C.damageEnemy(target,damage,0,end,dir,false,'frontline');C.fx.impact(end,dir.clone().negate(),'armor');}
}
