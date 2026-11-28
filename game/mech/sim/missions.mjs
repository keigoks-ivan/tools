import * as THREE from 'three';
import {HEIGHT,DECK,DOCK_GATES,SUMMIT_TOWER,SUMMIT_APPROACHES} from './campaign.mjs';
import {HAUL} from './quarry.mjs';
import {muster} from './quarry-wing.mjs';
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
    if(p.pos.y<this.site.recoveryHeight){
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
class Dock extends Exercise {
  prepare(){
    this.lane=this.C.cp?.lane??0;
    this.open=DOCK_GATES.map((_,i)=>i===0?this.sec>=2:!!this.C.cp?.opened?.includes(i));
    this.open.forEach((up,i)=>this.site.lift(i,up?26:0));
  }
  enter(){
    this.clearPoint();
    if(this.sec===0){
      this.text('外塢・引水道','沿黃線進塢，擊破巡邏機與護航機');
      this.unit('grunt','引水道巡機',-28,0,-164,14);this.unit('grunt','外塢護航機',34,0,-149,9);
    }else if(this.sec===1||this.sec===3){
      const inner=this.sec===3;
      this.text(inner?'內塢・雙閘分流':'外塢・起閘',inner?'任選一側擊破控閘機，沿該側閘門底下進入內塢':'擊破左方高台的監控機，再從黃黑鋼閘下方通過');
      this.locks=(inner?[1,2]:[0]).map(i=>{
        const g=DOCK_GATES[i],x=inner?g.x:-45,z=inner?g.z-36:-129;
        return {i,unit:this.unit('ace',i===0?'外塢監控機':i===1?'西閘控機':'東閘控機',x,inner?0:9,z,inner?7:0)};
      });
      this.previous=this.p.pos.clone();
    }else if(this.sec===2){
      this.checkpoint();this.text('維修廊・雙側夾擊','左方重機扼住通道，右方機體從維修台開火');
      this.unit('heavy','船腹重機',-35,0,36,11);this.unit('grunt','維修台哨機',52,9,20);
    }else{
      for(const lock of this.locks||[])if(lock.unit.dead)this.open[lock.i]=true;
      const opened=[1,2].filter(i=>this.open[i]);
      const sign=this.lane===1?-1:1;
      const flank=this.E.mine.find(e=>!e.dead);
      const escort=flank?{x:flank.pos.x,z:flank.pos.z,ap:flank.ap}:this.C.cp?.escort;
      this.checkpoint({lane:this.lane,opened,escort});
      this.text('沉錨・最後一座船台','塢長佔住船首，當心另一道閘後方的僚機');
      if(!escort)this.text('沉錨・孤立的塢長','兩側控閘機都已擊破。集中火力攻擊船首的沉錨');
      this.boss(this.unit('heavy','沉錨',sign*19,0,263,20),1.65);
      if(escort){
        this.escort=flank||this.unit('ace','控閘僚機',escort.x,0,escort.z);
        this.open[this.lane===1?2:1]=true;
        this.escort.ap=escort.ap;
        this.escort.frontActor.station.slide=12;
      }
    }
  }
  get waypoints(){
    if(this.sec!==1&&this.sec!==3)return [];
    return this.locks.map(({i,unit:e})=>{
      const {x,z}=DOCK_GATES[i];
      return {name:e.dead?'穿過閘門':e.label,position:e.dead?V(x,5,z):e.pos.clone().add(V(0,16,0))};
    });
  }
  step(dt){
    const feet=this.p.pos;
    if(this.p.grounded&&feet.y<1&&(Math.abs(feet.x)>103||feet.z< -374||feet.z>446)){
      this.relocate(clamp(feet.x,-84,84),0,clamp(feet.z,-360,432),this.p.yaw);
      this.previous?.copy(feet);this.C.note('落水回收・已返回塢岸','am');
    }
    for(let i=0;i<this.open.length;i++)if(this.open[i]&&this.site.gates[i].box.bottom<26){
      this.site.lift(i,Math.min(26,this.site.gates[i].box.bottom+dt*16));
    }
    if(this.sec===1||this.sec===3){
      const p=this.p.pos;
      for(const {i,unit:e} of this.locks){
        if(!e.dead)continue;
        if(!this.open[i]){this.open[i]=true;this.C.note(e.label+'離線・閘門上升','gr');}
        const {x,z}=DOCK_GATES[i],from=this.previous;
        // Intersect the swept path with the opening, including high-speed boosts.
        if(from.z<=z&&p.z>=z&&p.z>from.z){
          const f=(z-from.z)/(p.z-from.z);
          if(Math.abs(from.x+(p.x-from.x)*f-x)<20&&from.y+(p.y-from.y)*f+18<=this.site.gates[i].box.bottom){
            if(i)this.lane=i;
            return this.next();
          }
        }
      }
      this.previous.copy(p);
      return false;
    }
    if(this.escort&&!this.escort.dead){
      const s=this.escort.frontActor.station;
      if(this.site.gates[this.lane===1?2:1].box.bottom>=19)s.z=Math.min(206,s.z+dt*14);
    }
    if(this.E.mine.every(e=>e.dead))return this.next();
    return false;
  }
}

class Summit extends Exercise {
  prepare(){this.side=this.C.cp?.side||1;this.patrol=[];}
  flyer(name,kind,path){
    const {cx,cz,y,r,angle}=path;
    const e=this.unit(kind,name,cx+r*Math.cos(angle),y,cz+r*Math.sin(angle));
    e.airborne=true;e.grounded=false;e.frontActor.station.air=true;
    this.patrol.push({e,...path});return e;
  }
  enter(){
    this.clearPoint();
    this.patrol=this.patrol.filter(a=>!a.e.dead);
    const {x:cx,z:cz}=SUMMIT_TOWER;
    if(this.sec===0){
      this.text('山麓・掠脊來襲','擊破進場道上的警戒機，留意從穹頂旁切入的低飛機');
      this.unit('grunt','山麓警戒機',-21,0,-128,14);
      this.flyer('掠脊機','ace',{cx:18,cz:-87,y:24,r:35,angle:.4,speed:.23});
    }else if(this.sec===1){
      this.text('起飛・選擇進場線','起飛爬升至約 65 公尺，從任一側兩根青色翼燈之間飛過');
    }else if(this.sec===2){
      this.checkpoint({side:this.side});this.text('穹頂・雙向截擊','兩台敵機以相反方向繞塔。塔身可遮蔽射線，左右平台可降落回能');
      for(const s of [-1,1])this.flyer(s<0?'內圈截擊機':'外圈截擊機','ace',{cx,cz,y:s<0?56:88,r:s<0?65:100,angle:s*this.side*1.4,speed:s*.20});
    }else if(this.sec===3){
      this.text('北側平台・貼地突襲','敵方重機已登上平台。擊破重機與從後山切入的低空僚機');
      this.unit('heavy','平台重機',-this.side*90,35,159,11);
      this.flyer('後山僚機','grunt',{cx:0,cz:238,y:30,r:52,angle:1.2,speed:.26});
    }else{
      this.checkpoint({side:this.side});
      this.text('長空・越頂追擊','長空在大穹頂後方盤旋。趁它轉彎時瞄準，留意推進器點火拔高');
      this.leader=this.flyer('長空','ace',{cx:0,cz:207,y:64,r:100,angle:this.side*Math.PI*.25,speed:this.side*.17});
      this.boss(this.leader,1.95);this.climbing=false;
    }
  }
  get waypoints(){return this.sec===1?SUMMIT_APPROACHES.map(({x,y,z})=>({name:x<0?'西進場線':'東進場線',position:V(x,y,z)})):[];}
  step(dt){
    if(this.leader&&!this.climbing&&this.leader.ap<=this.leader.apMax*.5&&!this.leader.dead){
      this.climbing=true;this.C.note('長空拔高・航線收窄','am');
    }
    for(const a of this.patrol){
      if(a.e.dead)continue;
      const climb=a.e===this.leader&&this.climbing;
      const agility=a.e.components?.booster?.disabled ? .38 : 1;
      a.angle+=dt*a.speed*(climb?1.65:1)*agility;
      if(climb){a.y=Math.min(122,a.y+dt*14);a.r=Math.max(58,a.r-dt*8);}
      const s=a.e.frontActor.station;
      s.x=a.cx+a.r*Math.cos(a.angle);s.z=a.cz+a.r*Math.sin(a.angle);s.y=a.y+5*Math.sin(2*a.angle);
    }
    if(this.sec===1){
      for(const {x,y,z} of SUMMIT_APPROACHES)if(!this.p.grounded&&this.at(x,y,z,17)){
        this.side=Math.sign(x);return this.next();
      }
    }else if(this.E.mine.every(e=>e.dead))return this.next();
    return false;
  }
}
class Quarry extends Exercise{
  prepare(){
    this.crew=[];this.recruitAt=0;this.foe=null;this.mode='ready';this.aim=V();this.origin=V();this.way=1;
    this.site.moveTruck(this.sec?1:0);this.site.parkRig();this.site.markStrike(null);
    muster(this.C,this.crew);
  }
  radar(out){super.radar(out);for(const w of this.crew)out.push({kind:'ally',x:w.pos.x,z:w.pos.z});}
  spawnBoss(x,z,hp){
    const e=this.unit('heavy','裂顎',x,this.site.heightAt(x,z),z);
    e.m.root.scale.setScalar(2.05);this.boss(e,4.8);e.ap=hp??e.apMax;
    e.frontActor.station.mobile=true;e.supportFloor=1;e.groundAt=this.site.heightAt;
    this.foe=e;return e;
  }
  setPosition(e,x,z,offset=0){
    const s=e.frontActor.station;
    s.x=x;s.z=z;e.pos.y=this.site.heightAt(x,z)+offset;e.grounded=offset<.1;
  }
  resumeBoss(x,z,hpFraction){
    if(!this.foe){
      const e=this.spawnBoss(x,z,this.C.cp?.bossHP);
      if(this.C.cp?.bossHP==null)e.ap=Math.round(e.apMax*hpFraction);
    }
    return this.foe;
  }
  enter(){
    this.clearPoint();this.mode='ready';this.site.markStrike(null);this.attackIn=3.8;
    if(this.sec===0){
      this.text('坑口・熄火的礦車','注意前方車斗，兩名僚機已就位');
    }else if(this.sec===1){
      const e=this.spawnBoss(0,-264);this.setPosition(e,0,-264,-18);
      e.retreatAP=Math.ceil(e.apMax*.68);this.text('坑口交鋒','打傷裂顎，逼它離開裝卸坪。紅圈鎖定後可以閃避或集中火力打斷');
      this.C.say('裂顎','採掘重裝機　近距離接觸',2,'am');
    }else if(this.sec===2){
      const e=this.resumeBoss(0,-264,.68);
      this.checkpoint({bossHP:e.ap});this.way=1;
      e.retreatAP=Math.ceil(e.apMax*.48);
      this.text('坡道追擊','裂顎正沿運礦路下切。擊破兩台掩護機，飛越採坑或沿坡道追擊');
      this.guards=[['ace','東壁截擊機',94,-128],['grunt','碎石線守衛',-125,34]].map(([kind,name,x,z])=>this.unit(kind,name,x,this.site.heightAt(x,z),z));
    }else if(this.sec===3){
      const e=this.resumeBoss(22,136,.55);
      this.checkpoint({bossHP:e.ap});e.retreatAP=Math.ceil(e.apMax*.31);
      this.text('坑底・碎石線','裂顎繞著積水區轉身，遠距會齊射，近距會躍擊。牆後可以斷開射線');
    }else{
      const e=this.resumeBoss(22,136,.31);
      this.checkpoint({bossHP:e.ap});e.retreatAP=0;
      this.text('末段・裂顎過載','裂顎正在縮短蓄力時間。與隊友夾擊，親手完成最後一擊');
      this.C.note('裂顎過載・攻勢加快','am');
    }
  }
  recordImpact(e,damage){
    if(e!==this.foe||this.mode!=='charge')return;
    this.interruptHP-=damage;
    if(this.interruptHP<=0){
      this.mode='stumble';this.remaining=2.7;this.site.markStrike(null);e.stagT=2.7;
      const s=e.frontActor.station;this.setPosition(e,s.x,s.z);
      this.C.note('已打斷・關節失衡','gr');this.C.fx.dust(e.pos,1);
    }
  }
  attack(dt){
    const e=this.foe,p=this.p.pos,s=e.frontActor.station;
    if(this.mode==='stumble'){
      if((this.remaining-=dt)<=0){this.mode='ready';this.attackIn=3.6;}
      return;
    }
    if(this.mode==='ready'){
      if((this.attackIn-=dt)>0)return;
      this.attackIn=.55;
      const chest=e.chest(this.origin);this.aim.copy(p);this.aim.y+=9;
      if(this.C.world.raycast(chest,this.aim)>=0)return;
      this.mode='charge';this.leap=Math.hypot(p.x-s.x,p.z-s.z)<123&&p.y-this.site.heightAt(p.x,p.z)<36;
      this.aim.y=this.leap?this.site.heightAt(p.x,p.z):p.y+9;
      this.origin.copy(e.pos);this.remaining=this.sec===4?1.8:2.6;
      this.interruptHP=this.sec===4?1500:1080;
      this.site.markStrike(this.aim,this.leap?32:12);this.C.note(this.leap?'裂顎壓低雙肩・離開落點':'裂顎架炮・離開射線','am');
    }
    e.fireCd=Math.max(e.fireCd,1);
    if(this.mode==='charge'){
      this.remaining-=dt;
      this.setPosition(e,s.x,s.z,-2.3);
      if(this.remaining>0)return;
      if(!this.leap){
        e.m.muzzle.getWorldPosition(this.origin);
        this.salvo=0;this.mode='salvo';this.remaining=0;
      }else{this.mode='jump';this.remaining=0;}
    }
    if(this.mode==='salvo'){
      if((this.remaining-=dt)>0)return;
      this.C.shell(e,this.origin,this.aim,227,480,false);this.salvo++;this.remaining=.24;
      if(this.salvo<(this.sec===4?4:3))return;
      this.setPosition(e,s.x,s.z);
    }
    if(this.mode==='jump'){
      const t=Math.min(1,(this.remaining+=dt)/1.05);
      this.setPosition(e,THREE.MathUtils.lerp(this.origin.x,this.aim.x,t),THREE.MathUtils.lerp(this.origin.z,this.aim.z,t),Math.sin(t*Math.PI)*24);
      if(t<1)return;
      this.C.fx.dust(e.pos,1.5);this.C.audio.explosion(e.pos,.8);
      if(this.p.pos.distanceTo(this.aim)<32)this.C.hurt(770,this.aim,'裂顎落擊');
    }
    this.site.markStrike(null);this.mode='ready';this.attackIn=this.sec===4?3.1:5;
  }
  step(dt){
    this.site.ripple(this.clock);
    if(this.crew.length<2&&this.clock>=this.recruitAt){this.recruitAt=this.clock+.6;muster(this.C,this.crew);}
    for(const w of this.crew)w.update(dt);
    if(this.sec===0){
      const t=clamp((this.age-.5)/2.2,0,1);
      this.site.moveTruck(t*t*(3-2*t));
      if(t===1){this.C.fx.dust(V(28,82,-287),.8);return this.next();}
      return false;
    }
    const e=this.foe,s=e.frontActor.station;
    if(e.dead){this.site.parkRig();this.site.markStrike(null);return this.next();}
    this.site.poseRig(e);
    if(this.sec===2){
      const [gx,gz]=HAUL[this.way],dx=gx-s.x,dz=gz-s.z,len=Math.hypot(dx,dz);
      const travel=Math.min(len,dt*21);
      if(len>.01)this.setPosition(e,s.x+travel*dx/len,s.z+travel*dz/len);
      if(len<=travel+.01){
        if(this.way<HAUL.length-1)this.way++;
        else if(this.guards.every(g=>g.dead))return this.next();
      }
      return false;
    }
    if(this.sec===1&&this.age<1.1){this.setPosition(e,0,-264,-18*(1-this.age/1.1));return false;}
    if(this.mode==='ready'&&this.sec>=3){
      const x=22+56*Math.sin(this.age*.17),z=136+23*Math.sin(this.age*.31);
      const dx=x-s.x,dz=z-s.z,k=Math.min(1,dt*16/Math.max(.01,Math.hypot(dx,dz)));
      this.setPosition(e,s.x+dx*k,s.z+dz*k);
    }
    if(e.retreatAP&&e.ap<=e.retreatAP)return this.next();
    this.attack(dt);return false;
  }
  dispose(){
    for(const w of this.crew||[])w.dispose();
    this.site.parkRig();this.site.markStrike(null);
  }
}
export function createExercise(id,site,C,E){
  const Type={fold:Fold,echo:Echo,rail:Rail,dock:Dock,summit:Summit,quarry:Quarry}[id];return new Type(site,C,E);
}
