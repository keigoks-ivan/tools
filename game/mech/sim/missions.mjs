import * as THREE from 'three';
import {HEIGHT,DECK} from './campaign.mjs';
import {EchoTape,echoFigure,replayShot} from './tape.mjs';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const clamp=THREE.MathUtils.clamp;
class Exercise {
  constructor(site,C,E){this.site=site;this.C=C;this.E=E;this.p=C.player;this.clock=0;this.age=0;this.mark=V();this.objective={title:'演習準備',hint:''};}
  get sec(){return this.E.sec;}
  get marker(){return this.target?this.mark:null;}
  get waypoints(){return [];}
  radar(out){if(this.target)out.push({x:this.mark.x,z:this.mark.z,kind:'ally'});}
  text(title,hint){this.objective={title,hint};}
  point(x,y,z){this.target=true;this.mark.set(x,y,z);}
  clearPoint(){this.target=false;}
  at(x,y,z,r){return Math.hypot(this.p.pos.x-x,this.p.pos.y-y,this.p.pos.z-z)<r;}
  unit(kind,name,x,y,z,slide=0){
    const post={kind,name,x,y,z,slide};
    this.E.spawnPost(post,post);
    const e=this.E.mine.at(-1);e.groundAt=()=>e.pos.y;
    return e;
  }
  boss(e,scale){e.ap=e.apMax=Math.round(e.apMax*scale);e.bossName=e.label;this.C.boss=e;e.frontActor.boss=true;}
  begin(){this.enter();}
  next(){
    if(this.sec+1===this.E.N){this.E.state='done';this.clearPoint();return true;}
    this.E.sec++;this.E.mine=this.E.mine.filter(e=>!e.dead&&!e.gone);this.age=0;
    this.p.ap=Math.min(this.p.apMax,this.p.ap+this.p.apMax*.12);this.C.audio.ui('confirm');this.enter();return false;
  }
  checkpoint(extra={}){
    if(this.C.cp?.sec===this.sec)return;
    const p=this.p;
    this.C.cp={sec:this.sec,x:p.pos.x,y:p.pos.y,z:p.pos.z,yaw:p.yaw,stats:{...this.C.stats},used:0,...extra};
    this.C.note('檢查點已記錄','gr');
  }
  update(dt){
    this.clock+=dt;this.age+=dt;
    const complete=this.step(dt);
    this.E.updatePosts(dt);
    return complete;
  }
  relocate(x,y,z,yaw){
    const p=this.p;p.pos.set(x,y,z);p.vel.set(0,0,0);p.yaw=yaw;p.pitch=0;p.grounded=true;p.flying=false;p.flightAltitude=y;p.lockMove=0;
    this.C.hero.legYaw=yaw;
  }
}
class Fold extends Exercise {
  prepare(){this.upper=!!this.C.cp?.upper;this.site.setLayer(this.upper);this.rollTime=0;this.gateLatch=false;}
  mount(e,upper){
    const pivot=new THREE.Group();
    for(const o of [...e.m.root.children])pivot.add(o);
    e.m.root.add(pivot);e.foldMount=pivot;e.upper=upper;
    this.poseUnit(e);
  }
  poseUnit(e,angle){
    const opposite=e.upper!==this.upper;
    const a=angle??(opposite?Math.PI:0);
    e.foldMount.rotation.z=a;e.foldMount.position.y=9*(1-Math.cos(a));
    e.pos.y=(HEIGHT-18*e.scale)*(1-Math.cos(a))*.5;
  }
  flip(){
    const p=this.p;
    this.upper=!this.upper;this.site.setLayer(this.upper);
    p.pos.set(-p.pos.x,HEIGHT-18-p.pos.y,p.pos.z);p.yaw=-p.yaw;p.pitch=-p.pitch;p.vel.x*=-1;p.vel.y*=-1;
    p.flying=false;p.grounded=false;p.flightAltitude=p.pos.y;this.C.hero.legYaw=p.yaw;
    for(const e of this.E.mine)if(!e.dead&&e.foldMount){
      const s=e.frontActor.station;s.x=-s.x;e.pos.x=-e.pos.x;this.poseUnit(e);
    }
    for(const m of this.C.missiles){
      m.pos.x*=-1;m.pos.y=HEIGHT-m.pos.y;m.vel.x*=-1;m.vel.y*=-1;
      for(const v of [m.aim,m.from])if(v?.isVector3){v.x*=-1;v.y=HEIGHT-v.y;}
    }
    this.rollTime=.8;this.C.note(this.upper?'上城重力接合':'下城重力接合','cy');
  }
  get cameraRoll(){return Math.PI*Math.max(0,this.rollTime||0)/.8;}
  enter(){
    const s=this.sec;
    if(s===0){
      this.text('倒懸城・墜向天空','擊破街口巡機與正在轉移的哨機');
      this.mount(this.unit('grunt','街口巡機',-26,0,-102,16),false);
      this.scout=this.unit('grunt','逆落哨機',14,0,-54,12);this.mount(this.scout,true);
    }else if(s===1||s===3){
      this.gateZ=s===1?-96:195;this.point(0,HEIGHT/2,this.gateZ);
      this.text(s===1?'接通上城':'返回下城','起飛並升高，穿過標示的重力環中心');
    }else if(s===2){
      this.checkpoint({upper:this.upper});
      this.clearPoint();this.text('上城・逆向截擊','上層街面與對街屋頂各有一台守機');
      this.mount(this.unit('ace','上城護衛',-26,0,86,23),true);
      this.mount(this.unit('heavy','對岸炮手',32,0,157,12),false);
    }else{
      this.checkpoint({upper:this.upper});this.clearPoint();
      this.text('倒影・雙機交替','先削弱其中一具機身的推進器，迫使兩機停止換層');
      this.twins=[this.unit('heavy','倒影・重殼',-24,0,340,16),this.unit('ace','倒影・疾翼',31,0,374,24)];
      this.twins.forEach((e,i)=>{this.mount(e,!!i);this.boss(e,i?1.30:1.45);});this.first=null;this.swapAt=7.5;
    }
  }
  step(dt){
    this.rollTime=Math.max(0,this.rollTime-dt);
    if(this.p.pos.y>HEIGHT-19){this.p.pos.y=HEIGHT-19;this.p.vel.y=Math.min(0,this.p.vel.y);}
    if(this.sec===1||this.sec===3){
      if(this.at(0,HEIGHT/2,this.gateZ,20)){this.flip();return this.next();}
      return false;
    }
    if(this.sec===0&&!this.scout.dead)this.poseUnit(this.scout,clamp((this.age-.9)/3,0,1)*Math.PI);
    if(this.sec===4){
      const inGate=this.at(0,HEIGHT/2,314,20);
      if(inGate&&!this.gateLatch)this.flip();
      this.gateLatch=inGate;
      for(const [i,e] of this.twins.entries()){
        if(!this.first&&(e.dead||e.ap<e.apMax*.55||e.components?.booster?.disabled)){
          this.first=e;this.C.note(e.label+'推進器失效','am');
          this.text('倒影・連結已斷',i?'疾翼被釘住，重殼改用急射':'重殼失去換層能力，疾翼開始高速橫移');
          const other=this.twins[1-i];other.frontActor.station.slide=i?8:48;
        }
        if(e.dead)continue;
        if(!this.first && Math.floor(this.age/3.7)%2!==i)e.fireCd=Math.max(e.fireCd,1.1);
        if(this.first&&e!==this.first&&i===0)e.fireCd-=dt*.7;
        if(this.first===e)e.frontActor.station.slide=0;
      }
      if(!this.first&&this.age>=this.swapAt){
        this.swapAt+=7.5;
        for(const e of this.twins){e.upper=!e.upper;this.poseUnit(e);this.C.fx.wingArc(e.chest(V()),V(e.pos.x,HEIGHT/2,e.pos.z));}
      }
      this.C.boss=this.twins.find(e=>!e.dead)||null;
    }
    if(this.E.mine.every(e=>e.dead))return this.next();
    return false;
  }
}
class Echo extends Exercise {
  prepare(){
    this.tape=this.C.cp?.tape||new EchoTape();this.side=this.C.cp?.side||0;
    this.site.cells.forEach(c=>c.visible=true);this.ghost=echoFigure(this.C.world.fieldGroup,this.C.hero);
    this.shots=this.C.stats.shots;this.replayTime=0;this.shotIndex=0;
  }
  recordImpact(e,dmg){
    if(this.sec!==0 || !this.defenders?.includes(e))return;
    const dir=e.chest(V()).sub(this.C.hero.muzzle.getWorldPosition(V())).normalize();
    this.tape.capture(this.age,this.C,dir,Math.min(e.ap,dmg));
  }
  guards(){return [-1,1].map(s=>this.unit('grunt',s<0?'西翼鎖衛':'東翼鎖衛',s*88,0,111));}
  enter(){
    this.clearPoint();
    if(this.sec===0){
      this.text('第一次通行・錄製中','選左翼或右翼，擊破該側鎖衛，踏上同側識別台');
      this.defenders=this.guards();
    }else if(this.sec===1){
      this.relocate(0,0,-215,0);this.ghost.visible=true;
      this.checkpoint({tape:this.tape,side:this.side});
      this.text('第二次通行・殘影上線','走另一翼，擊破鎖衛並踏上識別台，踏穩後加速回放');
      this.defenders=this.guards();this.point(-this.side*88,1,158);
    }else if(this.sec===2){
      this.site.cells.forEach(c=>c.visible=false);
      this.text('雙翼解鎖','穿過中廊，擊破突入的兩台截擊機');
      this.unit('ace','左翼截擊',-44,0,215,21);this.unit('heavy','右翼截擊',42,0,252,16);
    }else{
      this.text('終端回聲','擊破守在出口的指令機');
      this.boss(this.unit('heavy','終端指令機',0,0,296,34),1.6);
    }
  }
  get waypoints(){return this.sec===0?[-1,1].map(s=>({name:s<0?'西翼救援台':'東翼救援台',position:V(s*88,3,158)})):[];}
  rewind(){
    for(const e of this.E.mine){e.m.root.removeFromParent();e.gone=true;}
    for(const m of this.C.missiles)this.C.fx.missileEnd(m.h);
    this.C.missiles.length=0;this.C.soft=this.C.lockTarget=null;
    this.C.note('倒帶完成・另一翼交給你','cy');
  }
  step(dt){
    if(this.sec===0){
      this.tape.record(this.age,this.C,this.shots);this.shots=this.C.stats.shots;
      for(const [i,e] of this.defenders.entries()){
        const side=i?1:-1;
        if(e.dead&&this.at(side*88,1,158,15)){
          this.side=side;this.tape.recordPose(this.age,this.p,true);this.rewind();return this.next();
        }
      }
    }else{
      const waiting=this.sec===1&&this.at(-this.side*88,1,158,16);
      this.replayTime+=dt*(waiting?3:1);
      this.tape.pose(this.replayTime,this.ghost);
      while(this.shotIndex<this.tape.shots.length&&this.tape.shots[this.shotIndex].t<=this.replayTime)
        replayShot(this.C,this.tape.shots[this.shotIndex++]);
      if(this.sec===1){
        const arrived=this.replayTime>=this.tape.duration;
        if(arrived)this.site.cells[this.side<0?0:1].visible=false;
        if(arrived&&this.defenders.every(e=>e.dead)&&this.at(-this.side*88,1,158,16)){
          this.site.cells.forEach(c=>c.visible=false);return this.next();
        }
      }else if(this.E.mine.every(e=>e.dead))return this.next();
    }
    return false;
  }
  radar(out){super.radar(out);if(this.ghost?.visible)out.push({x:this.ghost.position.x,z:this.ghost.position.z,kind:'ally'});}
  dispose(){this.ghost?.userData.release();}
}
class Rail extends Exercise{
  prepare(){
    this.time=this.C.cp?.railTime||0;this.site.moveTrains(this.time);this.safeLane=this.C.cp?.lane??0;this.safeZ=this.C.cp?.localZ??-174;
    if(!this.C.cp)this.relocate(0,DECK,-174,0);
    this.boarded=null;
  }
  train(lane){return this.site.trains[lane+1].train.position;}
  onboard(lane,z,tolerance=32){
    const p=this.p,t=this.train(lane);
    return p.grounded&&Math.abs(p.pos.y-DECK)<2&&this.site.deckAt(p.pos.x,p.pos.z)?.lane===lane&&Math.abs(p.pos.z-t.z-z)<tolerance;
  }
  pilot(dt,inp){
    if(this.C.phase!=='fight'||this.C.dead)return inp;
    const p=this.p,ride=p.grounded&&Math.abs(p.pos.y-DECK)<2&&this.site.deckAt(p.pos.x,p.pos.z);
    const old=ride?.train?.position,x=old?.x,z=old?.z;
    this.time+=dt;this.site.moveTrains(this.time);
    if(ride){p.pos.x+=old.x-x;p.pos.z+=old.z-z;this.safeLane=ride.lane;this.safeZ=p.pos.z-old.z;}
    if(p.pos.y<5){
      const t=this.train(this.safeLane);this.relocate(t.x,DECK,t.z+this.safeZ,p.yaw);
      this.C.note('磁索回收・返回上一節車頂','am');p.en=Math.max(20,p.en-12);
    }
    return inp;
  }
  rider(kind,name,lane,z){
    const t=this.train(lane),e=this.unit(kind,name,t.x,DECK,t.z+z);
    e.rail={lane,z};return e;
  }
  enter(){
    const s=this.sec;
    if(s===0){
      this.text('中央列車・尾段','沿車頂往前，擊破兩台押車機');
      this.rider('grunt','尾段哨機',0,-58);this.rider('grunt','押車一號',-1,0);
    }else if(s===1||s===3){
      this.goalLane=s===1?-1:1;this.goalZ=s===1?0:174;
      this.text(s===1?'換乘琥珀列車':'跨上紫色前車','擊破攔截機，起飛換車並降落在標示的車廂');
      this.rider(s===1?'grunt':'heavy','前方攔截機',this.goalLane,this.goalZ+39);
    }else if(s===2){
      this.checkpoint({railTime:this.time,lane:-1,localZ:this.p.pos.z-this.train(-1).z});
      this.clearPoint();this.text('琥珀列車・並行交火','擊破不同車道上的兩台截擊機');
      this.rider('ace','追車手',0,116);this.rider('ace','切線手',1,174);
    }else{
      this.clearPoint();this.text('車頂決鬥・斷軌','頭目將跳上你所在的車。換車或拉開距離迎擊');
      this.duelist=this.rider('heavy','斷軌',0,174);this.boss(this.duelist,1.85);this.leapAt=2.5;this.leap=null;
      this.rider('ace','斷軌僚機',-1,232);
    }
  }
  step(dt){
    for(const e of this.E.mine){
      if(e.dead||!e.rail)continue;
      const t=this.train(e.rail.lane),station=e.frontActor.station;
      station.x=t.x+2.4*Math.sin(this.time*.6+e.id);station.z=t.z+e.rail.z;e.pos.y=DECK;
    }
    if(this.sec===1||this.sec===3){
      const t=this.train(this.goalLane);this.point(t.x,DECK+2,t.z+this.goalZ);
      if(this.onboard(this.goalLane,this.goalZ)&&this.E.mine.every(e=>e.dead))return this.next();
    }else if(this.sec===4&&this.duelist&&!this.duelist.dead){
      const e=this.duelist,s=e.frontActor.station;
      if(!this.leap&&this.age>=this.leapAt){
        const lane=this.site.deckAt(this.p.pos.x,this.p.pos.z)?.lane??this.safeLane,t=this.train(lane);
        const z=clamp(Math.round((this.p.pos.z-t.z+24)/58)*58,-174,232);
        this.leap={from:e.pos.clone(),lane,z,t:0};this.leapAt=this.age+8;
        this.C.note('斷軌起跳・離開落點','am');
      }
      if(this.leap){
        const k=this.leap,t=this.train(k.lane),f=Math.min(1,(k.t+=dt)/1.55);
        s.x=THREE.MathUtils.lerp(k.from.x,t.x,f);s.z=THREE.MathUtils.lerp(k.from.z,t.z+k.z,f);e.pos.y=DECK+Math.sin(f*Math.PI)*31;
        if(f===1){e.rail={lane:k.lane,z:k.z};this.leap=null;this.C.fx.dust(V(s.x,DECK,s.z),1.5);}
      }
    }
    if(this.sec!==1&&this.sec!==3&&this.E.mine.every(e=>e.dead))return this.next();
    return false;
  }
}
export function createExercise(id,site,C,E){
  const Type={fold:Fold,echo:Echo,rail:Rail}[id];return new Type(site,C,E);
}
