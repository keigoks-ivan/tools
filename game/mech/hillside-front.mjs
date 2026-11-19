import { BattleLine } from './battle-line.mjs?v=3';
import { HILL_LINES, HILL_EXIT, HILL_GARRISON, HILL_RAID, HILL_RELIEF } from './hillside-layout.mjs';

const COMMAND='白鷺（指揮所）';
const TANKS='第三裝甲連';

export class HillsideFront extends BattleLine {
  constructor(combat,encounter) {
    super(combat,encounter);
    this.site=combat.world.hillsideSite;
  }
  begin() {
    const {sec}=this.enc, start=this.C.cp;
    const x=start?.x??-550,z=start?.z??10;
    this.wing=this.unit('ally',x-10,z-16,true);
    this.tanks=[this.unit('tank',x+9,z+13,true),this.unit('tank',x-18,z+21,true)];
    for(let i=0;i<HILL_LINES.length;i++)for(let j=0;j<2;j++)this.site?.signal(i,j,i<sec);
    this.site?.reset(sec);
    this.startLine(sec);
  }
  startLine(sec) {
    this.enc.sec=sec;
    this.phase='line';
    this.line=HILL_LINES[sec];
    this.posts=this.line.posts.map(([x,z,name],i)=>({x,z,name,i,owned:false,taken:false,contested:false,
      waypoint:{name,position:this.point(x,z)}}));
    this.reserve=false;this.raid=false;this.relief=false;this.first=null;
    this.visited=false;this.boss=null;
    const [road,path]=this.posts;
    this.order(this.tanks[0],[road.x-48,road.z-6]);
    this.order(this.tanks[1],[road.x-58,road.z+10]);
    this.order(this.wing,[path.x-52,path.z+9]);
    for(const p of this.posts) {
      p.waypoint.position.y+=16;
      for(const [i,kind] of HILL_GARRISON[p.i].split(' ').entries()){
        const u=this.unit(kind,p.x+(i-1)*14,p.z+(i===1?13:-9),false,p.i);
        u.garrison=true;
      }
    }
    if(sec===HILL_LINES.length-1) {
      const u=this.boss=this.foes.find(a=>a.garrison&&a.kind==='heavy'&&this.canFight(a));
      u.boss=true;u.maxAP=11200;u.entity.ap=u.entity.apMax=u.maxAP;u.entity.bossName='隧道守備隊長・赤嶺';
      this.C.boss=u.entity;
    }
    this.C.say(this.line.name,'裝甲連走公路，斑鳩走山側。兩處陣地都得拿下',3,'cy');
  }
  send(i,kinds,depth,offset=0) {
    const p=this.posts[i];
    this.platoon(kinds,[p.x+depth,p.z+offset],i,[p.x,p.z]);
  }
  orderForward() {
    const [road,path]=this.posts;
    this.order(this.tanks[0],[road.x-5,road.z+7]);
    this.order(this.tanks[1],[road.x-15,road.z-7]);
    this.order(this.wing,[path.x-6,path.z+5]);
  }
  pressure() {
    const C=this.C, pending=this.reinforcements.pending.length;
    const live=this.foes.filter(a=>this.canFight(a));
    for(const p of this.posts) {
      const position=[p.x,p.z], pilot=this.nearby(C.player.pos,position,30);
      if(pilot)this.visited=true;
      const friends=this.allies.filter(a=>this.canFight(a)&&this.nearby(a.pos,position,29)).length;
      const opposition=live.filter(a=>this.nearby(a.pos,position,30)).length;
      p.contested=opposition>0&&(pilot||friends>0);
      if(p.owned&&opposition>friends+(pilot?3:0)) {
        p.owned=false;
        C.say(p.name+'失守','敵軍已佔回陣地，回到標記處重新奪取',2.8,'am');
        this.site?.signal(this.enc.sec,p.i,false);
      } else if(!p.owned&&!opposition&&(pilot||friends)) {
        p.owned=p.taken=true;
        this.first??=p.i;
        this.site?.signal(this.enc.sec,p.i,true);
        C.note(p.name+'已升起盟軍識別燈','gr');
      }
      const state=p.owned?(p.contested?'交戰中':'我軍'):p.contested?'爭奪中':'敵軍';
      p.waypoint.name=p.name+'・'+state;
    }
    if(!this.reserve&&live.length<=3) {
      this.reserve=true;
      this.posts.forEach(p=>this.send(p.i,this.line.reserves[p.i],74,p.i?-14:14));
      this.orderForward();
    } else if(this.first!==null&&this.reserve&&!this.raid&&pending===0&&live.length<=4) {
      this.raid=true;
      this.send(this.first,HILL_RAID[0],83,this.first?29:-29);
      this.send(1-this.first,HILL_RAID[1],68);
      C.say('敵軍反奪'+this.posts[this.first].name,'留意後方識別燈，兩翼必須連成一線',3,'am');
    } else if(this.raid&&!this.relief&&pending===0&&live.length<=2) {
      this.relief=true;
      this.send(1-this.first,HILL_RELIEF[0],72,18);
      this.send(this.first,HILL_RELIEF[1],63,-19);
      C.note('最後一支預備隊已進場','am');
    } else if(this.relief&&!pending&&!live.length&&this.visited&&this.posts.every(p=>p.owned)) {
      const sec=this.enc.sec+1;
      this.C.lines([[TANKS,this.line.name+'兩翼接通，裝甲連向前移動。']],true,2.3);
      this.resupply(2100);
      this.site?.advance(sec);
      if(sec===HILL_LINES.length) {
        this.phase='evacuate';
        this.marker=this.point(...HILL_EXIT);this.marker.y+=13;
        this.C.say('隧道口已解封','帶救護車穿過最後一段引道',3,'gr');
      } else {
        const {x,z}=this.posts[this.first];
        this.setCheckpoint(sec,x,z,Math.PI/2);
        this.startLine(sec);
      }
    }
  }
  react(a) {
    if(this.phase!=='line'||a.friendly||a.leave||a.garrison||a.boss)return;
    const post=this.posts[a.post];
    if(!post)return;
    // 反攻隊以佔地為先，無視遠方誘餌。受創的單位在陣地邊緣換射角。
    if(!a.shifted&&a.entity.ap<a.maxAP*.55&&this.nearby(a.pos,[post.x,post.z],26)) {
      a.shifted=true;this.order(a,[post.x+13,post.z+(a.kind==='brawler'?-13:12)]);
    }
  }
  changeAngle(a,dt) {
    if(a.garrison||this.phase==='line'&&!a.friendly&&this.nearby(a.pos,[this.posts[a.post].x,this.posts[a.post].z],30))return;
    super.changeAngle(a,dt);
  }
  update(dt) {
    const planning=this.stepBattle(dt);
    if(this.phase==='line'&&planning)this.pressure();
    if(this.phase==='evacuate') {
      if(this.nearby(this.C.player.pos,HILL_EXIT,39))this.site.advance(HILL_LINES.length+2);
      if(this.site.evacuated){
        this.phase=this.enc.state='done';this.marker=null;
        this.C.lines([[COMMAND,'車隊已過隧道。山腳醫院回報，最後一輛也到了。']],true);
        return true;
      }
    }
    this.site?.update(dt);
    return false;
  }
  get objective() {
    if(this.phase==='evacuate')return {title:'打通山麓疏散線',hint:'到隧道入口接應救護車'};
    if(this.phase!=='line')return null;
    const n=this.posts.filter(p=>p.owned).length;
    return {title:(this.enc.sec+1)+'/6　'+this.line.name+'　'+n+'/2',hint:this.raid?'反攻中，奪回失地並擊退預備隊':'公路有戰車支援，山側有斑鳩；清掉守軍後進入陣地'};
  }
  get waypoints(){
    if(this.phase!=='line')return [];
    const posts=this.posts.map(p=>p.waypoint);
    return this.relief?posts.concat(this.lastDefenders()):posts;
  }
  radar(out){for(const t of this.tanks??[])if(this.canFight(t))out.push({x:t.pos.x,z:t.pos.z,kind:'ally'});}
}
