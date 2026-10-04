// 輪式支線的場景與操作層；主線、子彈傷害及檢查點仍由 main.js 管理。
import * as THREE from 'three';
import { Builder } from './kit.js';
import { GroundVehicle, validVehicleSnapshot, sweepVehiclePose } from './ground-vehicle.mjs';
import { createGroundVehicleModel } from './vehicle-model.mjs';
import { VehicleStory, VEHICLE_MISSIONS } from './vehicle-story.mjs';
import { VEHICLE_ROUTES } from './vehicle-routes.mjs';
import { HistoryReader } from '../kobe-history.mjs';
import { createHistoryPlaques } from '../kobe-history-plaques.mjs';
import { Patrols } from './patrol.js';

const V = p => new THREE.Vector3(...p), near = (a,b,r) => a.distanceToSquared(b)<r*r;
const hitQ=new THREE.Quaternion(),hitEuler=new THREE.Euler(0,0,0,'YXZ'),hitOrigin=new THREE.Vector3(),hitDirection=new THREE.Vector3();
const style = `#vehicleMenu[hidden]{display:none}#vehicleMenu{position:fixed;inset:0;z-index:140;background:#0b1722ee;color:#efe9da;font:16px/1.7 "Noto Sans TC",system-ui,sans-serif;padding:20px;overflow:auto}#vehicleMenu>div{max-width:880px;margin:auto}#vehicleMenu h2{margin:5px 0}#vehicleMenu button{font:inherit;padding:10px 16px;background:#253847;color:#fff;border:1px solid #9bacae;border-radius:5px;cursor:pointer}#vehicleMenu button:disabled{opacity:.55;cursor:default}#vehicleMenu article{border:1px solid #62707b;padding:16px;margin:16px 0;border-radius:5px}#vehicleMenu h3{margin:0}#vehicleMenu small{color:#bfcbd3}.groundShortcuts{position:fixed;top:8px;right:150px;display:flex;gap:5px;z-index:20}.groundShortcuts[hidden]{display:none}.groundShortcuts button{color:#ebeddf;background:#102330c9;border:1px solid #7e929c;border-radius:5px;padding:8px;font:13px "Noto Sans TC",sans-serif;touch-action:none}.groundSeats{position:fixed;right:20px;bottom:205px;display:flex;gap:8px;z-index:26}.groundSeats[hidden]{display:none}.groundSeats button{font:15px "Noto Sans TC",sans-serif;color:#fff;background:#193b48dd;border:1px solid #a7d2db;border-radius:8px;padding:13px;touch-action:none}@media(max-width:700px){.groundShortcuts{right:8px;top:46px}.groundSeats{bottom:188px;right:8px}}`;

export class VehicleOps {
  constructor({G, campaign, materials, surfaces, map, input, camera, pause, resume, canOpen, changed, spawn, shoot, fallback}) {
    Object.assign(this,{G,campaign,materials,surfaces,map,input,camera,pause,resume,canOpen,changed,spawn,shoot,fallback});
    this.story=new VehicleStory({campaign,routes:VEHICLE_ROUTES});this.vehicle=null;this.models=new Map();
    this.cleared=new Set();this.bypassed=new Set();this.guards=new Map();this.sidePatrols=new Map();this.currentKey=null;this.props=[];this.known=new Set();this.saveT=0;this.bypassT=0;
    const s=document.createElement('style');s.textContent=style;document.head.append(s);
    this.reader=new HistoryReader({onOpen:()=>{pause();input.unlock();},onClose:()=>{input.reset();resume();},onRead:()=>this.changed?.()});
    this.menu=document.createElement('section');this.menu.id='vehicleMenu';this.menu.hidden=true;this.menu.setAttribute('role','dialog');this.menu.setAttribute('aria-modal','true');this.menu.setAttribute('aria-label','地面接駁支線');document.body.append(this.menu);
    this.shortcuts=document.createElement('nav');this.shortcuts.className='groundShortcuts';this.shortcuts.hidden=true;
    for(const [text,fn] of [['接駁支線 K',()=>this.openMenu()],['神戶史實 J',()=>this.reader.open(this.historyId())]]){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{if(this.canOpen())fn();};this.shortcuts.append(b);}document.body.append(this.shortcuts);
    this.seats=document.createElement('div');this.seats.className='groundSeats';this.seats.hidden=true;
    for(const [text,key] of [['上下車','Tvehicle'],['駕駛／機槍','Tgun']]){const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();input.keys.add(key);input.down.add(key);b.setPointerCapture(e.pointerId);});const off=()=>input.keys.delete(key);b.addEventListener('pointerup',off);b.addEventListener('pointercancel',off);this.seats.append(b);}document.body.append(this.seats);
    this._roads();
    this.historyPlaques=map.kitano?createHistoryPlaques(G.scene,map.kitano,{materials:surfaces,solid:G.solid}):{items:[],meshes:[]};
  }
  context() {const v=this.vehicle;return {chapter:this.chapter,done:this.done,player:this.G.player.pos,vehicle:v&&{kind:v.type==='patrol'?'4x4':'apc',pos:v.pos,occupied:v.occupied,seatMode:v.seatMode,speed:v.speed,hp:v.hp,maxHp:v.profile.hp},held:this.input.held('KeyE')||this.input.held('Tlock'),hurt:this.G.player.hurtT<.25,cleared:this.cleared,bypassed:this.bypassed,alerted:[...this.guards.values()].flat().some(e=>!e.dead&&e.state==='combat')};}
  get occupied(){return !!this.vehicle?.occupied;}
  historyId(){const p=this.G.player.pos;return this.historyPlaques.items.find(it=>p.distanceTo(it.p)<5)?.id||this.story.current?.historyCard;}
  get warningSeconds(){return Math.min(5,VEHICLE_MISSIONS.flatMap(m=>[m.reward,m.bonus]).filter(r=>r&&this.story.support.has(r.id)).reduce((n,r)=>n+(r.warningSeconds||0),0));}
  _roads() {
    const b=new Builder({floor:this.surfaces.floor,metal:this.surfaces.metal,painted:this.surfaces.painted||this.surfaces.metal},this.G.solid);
    const packs=this.campaign==='zero'?[VEHICLE_ROUTES.zero_patrol]:[VEHICLE_ROUTES.lastline_manifest,VEHICLE_ROUTES.lastline_channel,VEHICLE_ROUTES.lastline_shuttle];
    const routes=packs.flatMap(p=>Object.values(p.driveRoutes)),seen=new Set();
    for(const route of routes)for(let i=1;i<route.length;i++){
      const a=route[i-1],c=route[i],key=[a.join(','),c.join(',')].sort().join('|'),L=Math.hypot(c[0]-a[0],c[2]-a[2]),yaw=Math.atan2(c[0]-a[0],c[2]-a[2]);if(!L||seen.has(key))continue;seen.add(key);
      b.obox('floor',(a[0]+c[0])/2,.018,(a[2]+c[2])/2,3.5,.015,L/2+.18,yaw,{solid:false,tint:[.40,.43,.45],shade:()=>1});
      for(const side of [-1,1]) {const dx=Math.cos(yaw)*side*3.55,dz=-Math.sin(yaw)*side*3.55;
        b.obox('painted',(a[0]+c[0])/2+dx,.027,(a[2]+c[2])/2+dz,.055,.01,L/2,yaw,{solid:false,tint:[.85,.77,.52],shade:()=>1});}
    }
    this.roadMeshes=b.build(this.G.scene);for(const m of this.roadMeshes){m.name='vehicle-service-road';m.castShadow=false;}
  }
  openMenu() {
    if(!this.canOpen()||this.reader.isOpen)return;
    this.pause();this.input.unlock();this.menu.hidden=false;this.refreshMenu();
  }
  closeMenu(resume=true){this.menu.hidden=true;this.input.reset();if(resume)this.resume();}
  refreshMenu(){
    const root=document.createElement('div'),h=document.createElement('h2');h.textContent='地面接駁支線 · 作戰暫停';root.append(h);
    const p=document.createElement('p');p.textContent='未來架空任務。巡邏車配機槍；裝甲運輸車載人與物資。窄巷、石階與室內下車通行。W 前進、S 倒車、A／D 轉向、空白鍵煞車、E 上下車、F 切換駕駛與停車機槍。北野入口較窄，倒車駛出；車毀仍可走主線。';root.append(p);
    const close=document.createElement('button');close.type='button';close.textContent='返回遊戲（K／Esc）';close.onclick=()=>this.closeMenu();root.append(close);
    if(this.story.current){const c=this.story.current,info=document.createElement('p');info.textContent=`進行中：${c.title} · ${c.label}`;root.append(info);const abandon=document.createElement('button');abandon.textContent='結束接駁，返回徒步主線';abandon.onclick=()=>{this.leave(true);this.story.abandon();this.events();this.closeMenu();};root.append(abandon);}
    const available=this.story.available(this.context());
    for(const m of VEHICLE_MISSIONS.filter(m=>m.campaign===this.campaign)){
      const card=document.createElement('article'),title=document.createElement('h3');title.textContent=m.title;card.append(title);
      const text=document.createElement('p');text.textContent=m.offer;card.append(text);
      const b=document.createElement('button');b.dataset.mission=m.id;b.textContent=this.story.completed.has(m.id)?'接駁已完成':available.some(a=>a.id===m.id)?'接受接駁':'尚未開放';b.disabled=!available.some(a=>a.id===m.id);b.onclick=()=>{if(this.accept(m.id))this.closeMenu();};card.append(b);
      const note=document.createElement('small');note.textContent=`第 ${m.minChapter} 章起 · ${m.vehicle==='4x4'?'四輪巡邏車':'輪式裝甲運輸車'} · ${this.story.completed.has(m.id)?m.outcome:'完成當前主線段落後，可選擇這條接駁路線。'}`;card.append(document.createElement('br'),note);root.append(card);
    }
    this.menu.replaceChildren(root);close.focus();
  }
  accept(id){if(!this.story.accept(id,this.context()))return false;this.cleared.clear();this.bypassed.clear();this.events();this.changed?.();return true;}
  _vehicle(type,id,pos,yaw,saved=null){
    this.leave(true);if(this.vehicle)this.vehicle.model.root.visible=false;
    let model=this.models.get(type);if(!model){model=createGroundVehicleModel(type,{materials:this.materials});this.models.set(type,model);this.G.scene.add(model.root);}
    model.root.visible=true;const extent=this.G.footExtent-2;this.vehicle=new GroundVehicle({type,id,pos:V(pos),yaw,solid:this.G.solid,model,groundAt:(x,z,ref)=>Math.abs(x)<extent&&Math.abs(z)<extent?this.G.solid.floorAt(x,z,ref):NaN});if(saved)this.vehicle.reset(saved);
  }
  events(){for(const e of this.story.drainEvents()){
    if(e.type==='vehicle_request'){const pack=VEHICLE_ROUTES[e.missionId];this._vehicle(e.kind==='4x4'?'patrol':'apc',e.id,e.spawn,pack.vehicleYaw||0);if(this.story.current?.action==='repair')this.vehicle.hp=this.vehicle.profile.hp*.65;this._prepareGuards(e.missionId);this.G.hud.note('已標示接駁車；K 可查看任務或返回徒步主線','#e3c991');}
    if(e.type==='stage_changed'){this._stage();this.changed?.();}
    if(e.type==='radio'){this.G.hud.say('地面頻道',e.text,5);this.G.audio.radio('in');}
    if(e.type==='encounter_request')this._guards(e.id,e.definition);
    if(e.type==='operation_complete'){if(e.effect?.repairFraction&&this.vehicle)this.vehicle.hp=Math.min(this.vehicle.profile.hp,this.vehicle.hp+this.vehicle.profile.hp*e.effect.repairFraction);this.G.audio.swap();}
    if(e.type==='mission_complete'){this.leave();for(const r of e.rewards){if(r.healing)this.G.player.hp=Math.min(100,this.G.player.hp+r.healing);if(r.repairFraction&&this.vehicle)this.vehicle.hp=Math.min(this.vehicle.profile.hp,this.vehicle.hp+this.vehicle.profile.hp*r.repairFraction);this.G.hud.note(r.label,'#b7efad');}this.G.hud.say('地面頻道',e.outcome,6);this._stage();this.changed?.();}
    if(e.type==='fallback'){this.leave();this.G.hud.say('地面頻道',e.text,6,true);this._stage();this.changed?.();}
  }}
  _prepareGuards(id,saved){if(this.sidePatrols.has(id))return;const defs=Object.entries(VEHICLE_ROUTES[id].encounters||{}).map(([stage,def])=>({id:id+':'+stage,enemies:def.enemies||[]})),p=new Patrols(this.G,defs,this.spawn);p.reset(this.cleared,saved);this.sidePatrols.set(id,p);for(const E of defs)this.guards.set(E.id,p.group(E));}
  _guards(token){const c=this.story.current;if(!c)return;this._prepareGuards(c.missionId);if(c.kind==='defend')for(const r of this.guards.get(token)||[]){r.data.state='combat';r.data.lastSeen=c.point.slice();r.actor?.alert?.(V(c.point),1);}}
  _stage(){
    this.currentKey=this.story.current?.token||null;this.bypassT=0;this.footIndex=0;
    for(const m of this.props){m.removeFromParent();m.geometry.dispose();}this.props=[];
    const c=this.story.current;if(!c||c.kind==='drive')return;
    const p=c.point,b=new Builder({metal:this.materials.carMetal,painted:this.surfaces.landmarkPaint||this.materials.carPaint,fabric:this.surfaces.fabric},this.G.solid),box=(mat,x,y,z,w,h,d,tint)=>b.obox(mat,p[0]+x,p[1]+y,p[2]+z,w/2,h/2,d/2,0,{solid:false,shade:()=>1,tint});
    const geo=(mat,g,x,y,z,tint)=>{b.mesh(mat,g,p[0]+x,p[1]+y,p[2]+z,0,{solid:false,shade:1,tint});g.dispose();};
    const cyl=(mat,x,y,z,r,h,tint,axis='y',top=r)=>{const g=new THREE.CylinderGeometry(top,r,h,12);if(axis==='x')g.rotateZ(Math.PI/2);if(axis==='z')g.rotateX(Math.PI/2);geo(mat,g,x,y,z,tint);};
    // 實物工作站：框架、抽屜、接線端、把手、電瓶與醫療箱均有獨立輪廓。
    box('metal',0,.73,0,1.35,.06,.7,[.6,.65,.65]);for(const x of [-.57,.57])for(const z of [-.27,.27])box('metal',x,.36,z,.045,.7,.045,[.26,.3,.3]);
    const cases=c.action==='loadPassengers'||c.action==='unloadPassengers'||c.action==='collectCargo';
    box('painted',-.25,.91,0,.5,.3,.34,cases?[.34,.46,.38]:[.26,.32,.35]);box('metal',-.25,1.085,0,.2,.018,.08,[.15,.2,.2]);
    for(const x of [-.46,-.04])box('metal',x,.92,.182,.025,.12,.018,[.64,.65,.58]);
    box('painted',.38,.88,0,.24,.25,.31,[.2,.26,.24]);for(const x of [.32,.44])box('metal',x,1.03,0,.045,.04,.06,[.7,.61,.42]);
    for(let i=0;i<5;i++)box('metal',.38,.81+i*.03,.168,.17,.007,.012,[.08,.1,.11]);
    if(c.kind==='clear'||c.action==='openGate'||c.action==='copySignal'){
      box('metal',0,1.25,-.3,.05,1,.05,[.39,.43,.43]);box('painted',0,1.5,-.29,.58,.43,.08,[.31,.37,.39]);for(let i=0;i<4;i++)box('metal',-.2+i*.13,1.52,-.232,.035,.09,.014,[.7,.55,.22]);
    }
    if(c.action==='openGate'){
      // 手動制動器有軸、手輪與可見鎖栓，與接線控制台有不同輪廓。
      box('painted',-.52,1.15,-.24,.29,.29,.16,[.26,.31,.29]);cyl('metal',-.52,1.15,-.12,.045,.16,[.55,.53,.43],'z');
      geo('metal',new THREE.TorusGeometry(.16,.018,4,12),-.52,1.15,-.023,[.58,.50,.31]);
      for(let i=0;i<3;i++)geo('metal',new THREE.BoxGeometry(.018,.27,.018).rotateZ(i*Math.PI/3),-.52,1.15,-.023,[.48,.46,.34]);
      box('metal',-.52,.96,-.2,.32,.045,.045,[.46,.47,.41]);for(const x of [-.68,-.36])box('metal',x,.96,-.2,.035,.13,.075,[.31,.35,.33]);
      box('painted',-.7,1.11,-.15,.065,.19,.05,[.65,.41,.12]);
    }
    if(c.action==='copySignal'){
      // 收訊天線、同軸插座與真正繞線的接線端。
      cyl('metal',.54,1.46,-.33,.018,1.35,[.35,.41,.42]);
      for(const y of [1.83,2.04]){box('metal',.54,y,-.33,.46,.018,.018,[.53,.59,.57]);box('metal',.76,y,-.33,.018,.12,.018,[.44,.51,.49]);}
      box('painted',.44,1.03,-.20,.20,.22,.12,[.20,.27,.30]);
      for(const x of [.37,.49]){cyl('metal',x,1.04,-.122,.024,.025,[.67,.58,.37],'z');box('metal',x,.97,-.117,.022,.022,.024,[.48,.54,.48]);}
      geo('painted',new THREE.TorusGeometry(.13,.014,3,12),.44,.88,-.13,[.06,.09,.085]);
      box('painted',.56,.91,-.13,.027,.13,.028,[.06,.09,.085]);
    }
    if(cases&&c.action!=='collectCargo'&&c.missionId==='zero_kitano')for(const x of [-1.4,1.4]){
      box('metal',x,.47,1.6,.62,.04,1.9,[.62,.64,.61]);for(const z of [.8,2.4])for(const sx of [-.24,.24])box('metal',x+sx,.23,z,.04,.45,.04,[.35,.4,.4]);
      box('fabric',x,.58,1.6,.5,.20,1.4,[.33,.4,.32]);box('fabric',x,.68,2.23,.25,.18,.25,[.48,.42,.32]);
    }
    if(cases&&c.action!=='collectCargo'&&c.missionId==='lastline_manifest'){
      // 備用氧氣是三支帶肩部、頂閥和調壓器的鋼瓶，工程兵仍是活人。
      box('metal',1.46,.10,1.62,1.14,.08,.60,[.37,.43,.41]);
      for(const x of [.92,2.0]){box('metal',x,.65,1.41,.035,1.10,.035,[.32,.38,.36]);box('metal',x,.65,1.83,.035,1.10,.035,[.32,.38,.36]);}
      for(const y of [.43,.96])box('metal',1.46,y,1.79,1.12,.042,.035,[.45,.51,.48]);
      for(const x of [1.11,1.46,1.81]){
        cyl('painted',x,.62,1.61,.125,1.0,[.72,.76,.72]);cyl('painted',x,1.18,1.61,.125,.14,[.32,.46,.35],'y',.055);
        cyl('metal',x,1.285,1.61,.038,.08,[.53,.48,.30]);box('metal',x,1.34,1.61,.12,.035,.035,[.65,.58,.35]);
        geo('painted',new THREE.TorusGeometry(.060,.012,3,10).rotateX(Math.PI/2),x,1.38,1.61,[.18,.37,.26]);
        cyl('metal',x+.061,1.31,1.61,.034,.022,[.73,.74,.66],'x');
        geo('metal',new THREE.TorusGeometry(.129,.011,3,12).rotateX(Math.PI/2),x,.89,1.61,[.34,.41,.37]);
      }
    }
    if(cases&&c.action!=='collectCargo'&&c.missionId==='lastline_shuttle'){
      // 活工程兵接駁點以維修箱與電纜捲架表示，不擺傷員擔架。
      for(const [y,tint]of [[.28,[.31,.40,.36]],[.66,[.56,.43,.23]]]){
        box('painted',-1.27,y,1.55,.68,.32,.46,tint);box('metal',-1.27,y+.172,1.55,.24,.027,.10,[.32,.38,.36]);
        for(const x of [-1.53,-1.01])box('metal',x,y,1.79,.030,.10,.024,[.66,.66,.53]);
      }
      for(const x of [1.07,1.63]){
        box('metal',x,.27,1.55,.035,.46,.045,[.42,.48,.45]);box('metal',x,.054,1.55,.30,.045,.43,[.34,.41,.38]);
        cyl('metal',x,.53,1.55,.32,.025,[.44,.51,.46],'x');
      }
      cyl('metal',1.35,.53,1.55,.055,.64,[.58,.59,.51],'x');cyl('painted',1.35,.53,1.55,.26,.45,[.055,.075,.066],'x');
      for(const x of [1.15,1.25,1.35,1.45,1.55])geo('painted',new THREE.TorusGeometry(.263,.013,3,12).rotateY(Math.PI/2),x,.53,1.55,[.085,.11,.092]);
      geo('metal',new THREE.TorusGeometry(.12,.014,3,10).rotateY(Math.PI/2),1.69,.53,1.55,[.59,.55,.36]);
      box('metal',1.69,.53,1.55,.023,.22,.025,[.54,.54,.43]);
    }
    this.props=b.build(this.G.scene);for(const m of this.props)m.name='vehicle-operation-'+c.token;
  }
  leave(force=false){const v=this.vehicle;if(!v?.occupied)return true;if(force)v.speed=0;const p=v.exit(this.fallback());if(!p){this.G.hud.note('先煞停，確認車旁有安全空間','#e3c991');return false;}const P=this.G.player;P.pos.copy(p);P.vel.set(0,0,0);P.yaw=v.viewYaw;P.pitch=0;P.frozen=false;P.moveK=P.sprintK=0;this.G.vm.scoped=false;this.G.vm.ads=0;return true;}
  controls(dt,ctl){
    const v=this.vehicle,P=this.G.player;
    if(v){
      if(this.input.pressed('KeyF')||this.input.pressed('Tgun'))v.setMode(v.seatMode==='gun'?'drive':'gun');
      const press=this.input.pressed('KeyE')||this.input.pressed('Tlock')||this.input.pressed('Tvehicle');
      let used=false;
      if(v.occupied&&press){this.leave();used=true;}
      else if(press&&!v.occupied&&!this.G.scout.active&&v.canEnter(P.pos)&&(!this._workingNear()||this.input.pressed('Tvehicle'))){v.enter(P.pos);used=true;P.frozen=true;P.vel.set(0,0,0);this.G.vm.scoped=false;this.G.vm.ads=0;}
      if(used)for(const k of ['KeyE','Tlock','Tvehicle']){this.input.down.delete(k);this.input.keys.delete(k);}
      if(v.occupied||v.speed||v.cooldown||v.overheat)v.update(dt,{...ctl,brake:this.input.held('Space')||this.input.held('Tjump')});
      if(v.occupied){P.pos.copy(v.pos);P.yaw=v.viewYaw;P.pitch=v.viewPitch;P.hurtT+=dt;P.sprintK=P.moveK=0;}
    }
    this.seats.hidden=!this.input.touch.on||!v||(!v.occupied&&!v.canEnter(P.pos));
    return this.occupied;
  }
  _workingNear(){const c=this.story.current;return c&&c.kind==='operate'&&near(this.G.player.pos,V(c.point),c.radius);}
  cameraOverride(){if(!this.occupied)return;const v=this.vehicle,c=v.camera();this.camera.position.copy(c.position);this.camera.lookAt(c.target);this.camera.fov=c.fov;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();this.G.playerEye.set(v.pos.x,v.pos.y+v.profile.turretY+.3,v.pos.z);this.G.vm.holder.visible=false;this.G.vm.arms.root.visible=false;if(this.input.held('M0')||this.input.held('Tfire')){const d=this.camera.getWorldDirection(new THREE.Vector3()),h=this.G.shotRay(this.camera.position,d,v.profile.range),target=this.camera.position.clone().addScaledVector(d,h?.t??v.profile.range),shot=v.fire(target);if(shot)this.shoot(shot);}}
  update(dt,chapter,done){
    this.chapter=chapter;this.done=done;this.shortcuts.hidden=false;
    for(const p of this.sidePatrols.values())p.update(dt);
    const c=this.story.current;if(c){const guards=this.guards.get(c.token);if(guards?.length&&guards.every(e=>e.dead))this.cleared.add(c.token);
      const working=this._workingNear();if(working&&!this.occupied){this.G.hud.prompt=`按住 E ${c.label} ${Math.round(c.fraction*100)}%`;}
      if(c.allowBypass&&!this.occupied&&near(this.G.player.pos,V(c.point),2.8)&&this.context().held){this.bypassT+=dt;this.G.hud.prompt=`按住 E 解除支路警報 ${Math.round(this.bypassT/4*100)}%`;if(this.bypassT>=4)this.bypassed.add(c.token);}else this.bypassT=0;
      this.story.update(dt,this.context());this.events();
    }
    const v=this.vehicle;if(v&&!v.occupied&&v.canEnter(this.G.player.pos)&&!this._workingNear()&&!this.G.scout.active&&!this.G.hud.prompt)this.G.hud.prompt=v.destroyed?'車輛毀損，返回徒步主線':'按 E 駕駛接駁車';
    if(!this.occupied&&!this.G.scout.active&&!this.G.hud.prompt){const it=this.historyPlaques.items.find(it=>near(this.G.player.pos,it.p,2.8));if(it){this.G.hud.prompt='按 E 閱讀神戶史實牌';if(this.input.pressed('KeyE')||this.input.pressed('Tlock'))this.reader.open(it.id);}}
    for(const m of this.story.available(this.context()))if(!this.known.has(m.id)){this.known.add(m.id);this.G.hud.note(`新增接駁：${m.title} · K`,'#e3c991');this.G.hud.say('地面頻道',m.offer,6);}
    this.saveT+=dt;if(this.saveT>6&&this.story.current){this.saveT=0;this.changed?.();}
  }
  // 輪式車體用獨立 OBB 子彈判定，不每幀重建 Solid 空間網格。
  hitTest(o,d,range){const v=this.vehicle;if(!v||!v.visible)return null;const q=hitQ.setFromEuler(hitEuler.set(v.pitch,v.yaw,v.roll)).invert(),p=hitOrigin.copy(o).sub(v.pos).applyQuaternion(q),r=hitDirection.copy(d).applyQuaternion(q);let lo=0,hi=range;
    for(const [a0,r0,mn,mx] of [[p.x,r.x,-v.profile.width/2,v.profile.width/2],[p.y,r.y,.34,v.profile.height],[p.z,r.z,-v.profile.length/2,v.profile.length/2]]){if(Math.abs(r0)<1e-9){if(a0<mn||a0>mx)return null;continue;}let a=(mn-a0)/r0,b=(mx-a0)/r0;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return null;}return lo;
  }
  damage(n){const v=this.vehicle;if(!v)return false;if(v.destroyed)return true;v.damage(n);if(v.occupied)this.G.player.hurtT=0;if(v.destroyed){this.leave();this.story.abandon('vehicle_destroyed');this.events();this.G.hud.note('接駁車毀損，已返回徒步視角','#ff9175');}return true;}
  blockFoot(actor){const v=this.vehicle;if(!v||v.occupied&&actor===this.G.player||actor.dead||Math.abs(actor.pos.y-v.pos.y)>v.profile.height)return;const p=actor.pos,c=Math.cos(v.yaw),s=Math.sin(v.yaw),dx=p.x-v.pos.x,dz=p.z-v.pos.z;let x=dx*c-dz*s,z=dx*s+dz*c;const w=v.profile.width/2+.35,l=v.profile.length/2+.35;if(Math.abs(x)>=w||Math.abs(z)>=l)return;if(w-Math.abs(x)<l-Math.abs(z))x=Math.sign(x||1)*w;else z=Math.sign(z||1)*l;p.x=v.pos.x+x*c+z*s;p.z=v.pos.z-x*s+z*c;}
  draw(hud,W,H){
    const x=hud.x,c=this.story.current,v=this.vehicle;x.save();x.font='500 13px "Noto Sans TC",sans-serif';x.fillStyle='#e3c991';
    if(c){x.fillText(`接駁：${c.title}`,34,128);x.fillText(c.label+(c.kind==='operate'?` ${Math.round(c.fraction*100)}%`:''),34,149);const route=c.walkRoute;
      let p=V(c.point);if(route){while(this.footIndex<route.length-1&&this.G.player.pos.distanceTo(V(route[this.footIndex]))<4)this.footIndex++;p=V(route[this.footIndex]);}hud._pin(W,H,p.clone().add(new THREE.Vector3(0,1.2,0)),this.G.player.pos.distanceTo(p),'#e3c991',9,true,c.label);
      if(v&&!v.occupied){const q=v.pos.clone().add(new THREE.Vector3(0,2.6,0));hud._pin(W,H,q,this.G.player.pos.distanceTo(v.pos),'#91d7ce',9,true,'接駁車');}
      if(c.requires?.some(id=>!this.done?.has(id)))x.fillText('先完成修船吊架主線，再守住接應帶',34,170);
    }
    if(v?.occupied){x.fillStyle='#07141de8';x.fillRect(W-292,H-156,276,140);x.textAlign='right';x.fillStyle='#b7e7de';x.fillText(`${v.profile.label} · ${v.seatMode==='gun'?'停車機槍':'駕駛'}`,W-30,H-133);x.fillStyle='#f4eedf';x.fillText(`耐久 ${Math.ceil(v.hp)} / ${v.profile.hp}　彈藥 ${v.ammo}`,W-30,H-108);x.fillText(`${Math.round(Math.abs(v.speed)*3.6)} km/h　熱量 ${Math.round(v.overheat*100)}%`,W-30,H-85);x.fillText(`接駁 ${c?.passengers||0} 人　${c?.cargo?'物資已裝載':'無載貨'}`,W-30,H-63);x.fillText('E 下車　F 駕駛／機槍　空白鍵 煞車',W-30,H-40);x.textAlign='left';if(v.seatMode==='gun'){x.strokeStyle=v.heatLocked?'#fa9d6d':'#a5ede6';x.lineWidth=1.5;x.beginPath();x.arc(W/2,H/2,7,0,Math.PI*2);x.stroke();x.fillRect(W/2-1,H/2-1,2,2);}}
    x.restore();
  }
  snapshot(){return {version:1,story:this.story.snapshot(),vehicle:this.vehicle?.snapshot()||null,cleared:[...this.cleared],bypassed:[...this.bypassed],patrols:Object.fromEntries([...this.sidePatrols].map(([id,p])=>[id,p.snapshot()])),history:this.reader.snapshot()};}
  restore(s){
    this.leave(true);this.G.player.frozen=false;for(const p of this.sidePatrols.values())for(const r of p.records)if(r.actor&&this.G.enemies.includes(r.actor))p.release(r);this.sidePatrols.clear();this.guards.clear();this.cleared.clear();this.bypassed.clear();
    if(this.vehicle)this.vehicle.model.root.visible=false;this.vehicle=null;
    if(!s||s.version!==1||!this.story.restore(s.story)){this.story.reset();this._stage();return false;}
    this.reader.restore(s.history);const a=this.story.active,m=VEHICLE_MISSIONS.find(m=>m.campaign===this.campaign&&(a?m.id===a.id:this.story.completed.has(m.id)&&s.vehicle?.id===m.id+':vehicle'));
    if(m){const pack=VEHICLE_ROUTES[m.id],type=m.vehicle==='4x4'?'patrol':'apc',id=m.id+':vehicle',extent=this.G.footExtent-2,saved=validVehicleSnapshot(s.vehicle)&&s.vehicle.id===id&&s.vehicle.type===type&&Math.abs(s.vehicle.pos[0])<extent&&Math.abs(s.vehicle.pos[2])<extent?s.vehicle:null;
      const pose=saved&&{x:saved.pos[0],y:saved.pos[1],z:saved.pos[2],yaw:saved.yaw,pitch:saved.pitch||0,roll:saved.roll||0},safe=pose&&sweepVehiclePose(this.G.solid,pose,pose,type,{groundAt:(x,z,ref)=>Math.abs(x)<extent&&Math.abs(z)<extent?this.G.solid.floorAt(x,z,ref):NaN});
      if(!saved||!safe.ok||Math.abs(safe.pose.y-pose.y)>.12){if(a)this.story.abandon('invalid_vehicle_save');}
      else {this._vehicle(type,id,pack.vehicleSpawn,pack.vehicleYaw,saved);if(a&&this.vehicle.destroyed)this.story.abandon('vehicle_destroyed');}}
    const tokens=new Set(VEHICLE_MISSIONS.filter(m=>m.campaign===this.campaign).flatMap(m=>m.stages.filter(s=>s.kind==='clear'||s.kind==='defend').map(s=>m.id+':'+s.id)));
    for(const [set,values] of [[this.cleared,s.cleared],[this.bypassed,s.bypassed]])for(const id of Array.isArray(values)?values:[])if(tokens.has(id))set.add(id);
    const c=this.story.current;if(c)this._prepareGuards(c.missionId,s.patrols?.[c.missionId]);this._stage();this.events();if(c&&(c.kind==='clear'||c.kind==='defend'))this._guards(c.token);return true;
  }
  reset(){this.leave(true);this.story.reset();this.restore(null);this.known.clear();for(const m of [...this.roadMeshes,...this.historyPlaques.meshes])m.visible=true;}
  suspend(){this.leave(true);this.shortcuts.hidden=true;this.seats.hidden=true;this.closeMenu(false);if(this.vehicle)this.vehicle.model.root.visible=false;for(const m of [...this.props,...this.roadMeshes,...this.historyPlaques.meshes])m.visible=false;}
}
