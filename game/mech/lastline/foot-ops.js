import * as THREE from 'three';
import { Soldier } from '../zero/human.js';
import { Operation } from './operations.mjs';

export function createFootOperation(E,G,input) {
  const def=E.operation,task=new Operation(def),crew=[];
  const props=G.operationProps?.[E.id]||[];
  for(const h of props)h.reset();
  let shownIndex=task.index;
  if(def.kind==='escort')for(let i=0;i<2;i++) {
    const s=new Soldier(G.kit,'pilot',{world:G.solid});s.eye.visible=false;
    s.root.position.set(task.pos[0]+i*.65,0,task.pos[1]-i*.7);G.scene.add(s.root);crew.push(s);
  }
  let rewarded=false;
  return {
    task,crew,get done(){return task.done;},get status(){return def.kind==='escort'?'護送救援人員・靠近帶隊，清除前方威脅':task.done?'操作完成':`${def.points[task.index].label}　${Math.round(task.fraction*100)}%`;},
    update(dt) {
      const p=G.player.pos,at=task.point;
      const threat=def.kind==='escort'&&G.enemies.some(e=>!e.dead&&Math.hypot(e.pos.x-at[0],e.pos.z-at[1])<10&&G.solid.sees(e.pos.clone().add(new THREE.Vector3(0,1.4,0)),new THREE.Vector3(at[0],1.2,at[1])));
      task.step(dt,{player:[p.x,p.z],held:input.keys.has('KeyE')||input.keys.has('Tlock'),hurt:G.player.hurtT<.25,threat});
      if(task.index!==shownIndex){for(let i=shownIndex;i<task.index;i++)props[i]?.install();shownIndex=task.index;}
      for(const [i,s] of crew.entries()) {
        const previous=s.pos.clone(),x=task.pos[0]+i*.65,z=task.pos[1]-i*.7;
        s.pos.set(x,G.solid.floorAt(x,z,1),z);G.solid.pushOut(s.pos,.3,s.pos.y,s.pos.y+1.7,.45);
        s.vel.copy(s.pos).sub(previous).multiplyScalar(1/Math.max(dt,.001));
        if(s.vel.lengthSq()>.04)s.yaw=s.aimYaw=Math.atan2(s.vel.x,s.vel.z);
        s.update(dt);G.hud.pins.push({p:s.pos,h:2});
      }
      if(!task.done) {
        const point=task.point,prop=props[task.index];G.hud.pins.push({p:prop?.pin||prop?.p||new THREE.Vector3(point[0],point.y||0,point[1]),h:prop?.pin ? .25 : 1.2});
        if(Math.hypot(p.x-point[0],p.z-point[1])<(def.radius||2)&&def.kind==='console')G.hud.prompt=`按住 E　${point.label} ${Math.round(task.fraction*100)}%`;
      }
    },
    complete() {
      if(!rewarded) {
        rewarded=true;
        if(def.reward)try{const record=JSON.parse(localStorage.getItem('lastline.operations'))||{};record[def.reward]=true;localStorage.setItem('lastline.operations',JSON.stringify(record));}catch{}
        G.hud.note(def.success||'現場任務完成','#a5d9ad');
      }
    },
    dispose(){for(const s of crew){s.mixer.stopAllAction();s.mixer.uncacheRoot(s.model);s.root.removeFromParent();s.meshes.forEach(m=>m.skeleton.dispose());}}
  };
}
