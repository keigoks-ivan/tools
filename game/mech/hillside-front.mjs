import { BattleLine } from './battle-line.mjs?v=3';
import { HILL_LINES, HILL_EXIT, HILL_VANGUARD, HILL_RAID, HILL_RELIEF } from './hillside-layout.mjs';

const COMMAND='白鷺（指揮所）';
const TANKS='第三裝甲連';
const WAVES=['先遣隊接近','主力下坡','側翼突擊','最後梯隊'];

export class HillsideFront extends BattleLine {
  constructor(combat,encounter) {
    super(combat,encounter);
    this.site=combat.world.hillsideSite;
    this.reinforcements.gap=2.1;
  }
  begin() {
    const {sec}=this.enc, start=this.C.cp;
    const x=start?.x??-550,z=start?.z??10;
    this.integrity=start?.integrity??3;
    this.wing=this.unit('ally',x-10,z-16,true);
    this.tanks=[this.unit('tank',x+9,z+13,true),this.unit('tank',x-18,z+21,true)];
    this.site.reset(sec);
    for(let i=0;i<sec;i++)for(let j=0;j<2;j++)this.site.signal(i,j,true);
    this.startLine(sec);
  }
  startLine(sec) {
    this.enc.sec=sec;
    this.line=HILL_LINES[sec];
    this.phase='deploy';this.echelon=-1;this.boss=null;
    this.posts=this.line.posts.map(([x,z,name],i)=>{
      const position=this.point(x,z);position.y+=16;
      this.site.signal(sec,i,true);
      return {x,z,name,i,breached:false,waypoint:{name,position}};
    });
    const [road,path]=this.posts;
    this.order(this.tanks[0],[road.x-10,road.z+6]);
    this.order(this.tanks[1],[road.x-30,road.z-4]);
    this.order(this.wing,[path.x-11,path.z+4]);
    this.marker=this.point((road.x+path.x)/2,(road.z+path.z)/2);this.marker.y+=14;
    if(!sec)this.attack();
    else this.C.say(this.line.name,'車隊正在轉移，前往任一翼接防',3,'cy');
  }
  attack() {
    this.phase='line';this.marker=null;this.echelon++;
    const wave=this.echelon;
    const kinds=[HILL_VANGUARD,this.line.reserves,HILL_RAID,HILL_RELIEF][wave];
    const lead=(wave+this.enc.sec)%2;
    for(const lane of [lead,1-lead]){
      const p=this.posts[lane],depth=[204,184,154,211][wave];
      this.platoon(kinds[lane],[p.x+depth,p.z+(lane?-1:1)*(wave===2?28:8)],lane,[p.x,p.z]);
    }
    this.C.say(this.line.name+'・'+WAVES[wave],this.posts[lead].name+'先接敵，留意另一翼',2.6,'am');
  }
  entryPoint(x,z,kind) {
    // 先找到整台機體都容得下的入口，並留出下坡的第一步。只在增援進場時查詢。
    const w=this.C.world,r=kind==='tank'?2.6:4.2;
    const spot=this.point(x,z);
    for(const side of [0,18,-18])for(let step=0;step<=8;step++){
      const px=Math.min(693,x)-step*7,pz=z+side;
      spot.set(px-7,w.height(px-7,pz),pz);
      if(w.collide(spot,r,spot.y))continue;
      spot.set(px,w.height(px,pz),pz);
      if(!w.collide(spot,r,spot.y))return spot;
    }
    return spot;
  }
  unit(kind,x,z,friendly,post,assignment) {
    if(!friendly){const entry=this.entryPoint(x,z,kind);x=entry.x;z=entry.z;}
    const u=super.unit(kind,x,z,friendly,post,assignment);
    if(!friendly){u.marchSpeed=u.weapon.speed;u.weapon={...u.weapon};}
    if(!friendly&&kind==='heavy'&&this.enc.sec===HILL_LINES.length-1&&this.echelon===3&&!this.boss){
      this.boss=u;u.boss=true;u.maxAP=11200;u.entity.ap=u.entity.apMax=u.maxAP;
      u.entity.bossName='突擊隊長・赤嶺';this.C.boss=u.entity;
    }
    return u;
  }
  react(a) {
    if(this.phase!=='line'||a.friendly||!this.canFight(a))return;
    const p=this.posts[a.post],convoy=this.site.convoyPosition;
    a.weapon.speed=a.marchSpeed*(a.entity.stagT>0?.22:a.target&&!a.through?.72:.9);
    if(!a.through&&this.nearby(a.pos,[p.x,p.z],21)){
      a.through=true;a.maneuver=null;
      if(!p.breached)this.C.say(p.name+'被突破','攔下越線敵機，救護車在後方！',3,'rd');
      p.breached=true;this.site.signal(this.enc.sec,p.i,false);
      this.order(a,[convoy.x,convoy.z]);
    }
    if(!a.through||a.struck)return;
    if(!a.maneuver&&Math.hypot(a.goal.x-convoy.x,a.goal.z-convoy.z)>12)this.order(a,[convoy.x,convoy.z]);
    if(!this.nearby(a.pos,[convoy.x,convoy.z],19))return;
    // 進入車列、而且地物沒有隔開，才算實際突入。每個敵人只造成一次損失。
    this.aim.copy(convoy);this.aim.y+=2;
    this.dir.copy(a.pos);this.dir.y+=a.vehicle?2.3:11;
    if(this.C.world.raycast(this.dir,this.aim,null)>=0)return;
    a.struck=true;this.integrity--;
    if(this.integrity>0)this.C.say('救護車遭突入',this.integrity===1?'最後警戒！再被突入一次就會失守':'車列仍能移動，立即截擊後續敵機',3,'rd');
    else {
      this.phase='lost';this.C.phase='done';
      this.C.say('疏散線失守','敵機已切斷車列，傷員無法撤離',4,'rd');
      this.C.events.push({t:2.2,fn:()=>this.C.onEnd(false)});
    }
  }
  pressure() {
    const live=this.foes.filter(a=>this.canFight(a));
    for(const p of this.posts){
      const broken=live.some(a=>a.post===p.i&&a.through&&!a.struck);
      if(p.breached!==broken)this.site.signal(this.enc.sec,p.i,!broken);
      p.breached=broken;
      p.waypoint.name=p.name+(broken?'・追擊越線敵機':'・防線');
    }
    if(this.reinforcements.pending.length)return;
    if(this.echelon<3){
      if(live.length<=2)this.attack();
      return;
    }
    if(live.length)return;
    const sec=this.enc.sec+1;
    this.resupply(2100);this.site.advance(sec);
    if(sec===HILL_LINES.length){
      this.phase='evacuate';this.marker=this.point(...HILL_EXIT);this.marker.y+=13;
      this.C.say('敵軍撤退','最後一段已安全，去隧道口接應救護車',3,'gr');
    }else{
      const [x,z]=this.line.posts[0];
      this.setCheckpoint(sec,x-16,z,Math.PI/2,{integrity:this.integrity});
      this.C.lines([[TANKS,'這一段守住了。讓救護車先走，我們到下一翼接防。']],true,2.3);
      this.startLine(sec);
    }
  }
  update(dt) {
    if(this.C.dead||this.phase==='lost')return false;
    const planning=this.stepBattle(dt);
    if(this.phase==='deploy'&&planning&&this.posts.some(p=>this.nearby(this.C.player.pos,[p.x,p.z],115)))this.attack();
    else if(this.phase==='line'&&planning)this.pressure();
    if(this.phase==='evacuate'){
      if(this.nearby(this.C.player.pos,HILL_EXIT,39))this.site.advance(HILL_LINES.length+2);
      if(this.site.evacuated){
        this.phase=this.enc.state='done';this.marker=null;
        this.C.lines([[COMMAND,'車隊已過隧道。山腳醫院回報，最後一輛也到了。']],true);
        return true;
      }
    }
    this.site.update(dt);return false;
  }
  get objective() {
    if(this.phase==='evacuate')return {title:'山麓防線守住了',hint:'到隧道入口接應最後一輛救護車'};
    if(this.phase==='deploy')return {title:this.line.name+'・接防',hint:'跟隨車隊，前往公路或山側的識別燈'};
    if(this.phase!=='line')return null;
    const threat=this.posts.find(p=>p.breached);
    return {title:(this.enc.sec+1)+'/6　'+this.line.name+'　車隊 '+this.integrity+'/3',
      hint:threat?threat.name+'已破，攔下標記敵機':WAVES[this.echelon]+'　守住公路和山側'};
  }
  get waypoints(){
    if(this.phase==='deploy')return this.posts.map(p=>p.waypoint);
    if(this.phase!=='line')return [];
    const threats=this.foes.filter(a=>this.canFight(a)&&a.through&&!a.struck);
    if(threats.length)return threats.map(a=>({name:'攔截',position:a.pos}));
    const last=this.echelon===3?this.lastDefenders():[];
    return last.length?last.map(p=>({...p,name:p.name==='指揮機'?p.name:'殘存敵軍'})):this.posts.map(p=>p.waypoint);
  }
  radar(out){for(const t of this.tanks??[])if(this.canFight(t))out.push({x:t.pos.x,z:t.pos.z,kind:'ally'});}
}
