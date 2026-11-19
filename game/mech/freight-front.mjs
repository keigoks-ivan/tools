import { Vector3 } from 'three';
import { BattleLine } from './battle-line.mjs?v=1';

const BLUE = '第三裝甲連', CONTROL = '白鷺（指揮所）';
const POSTS = {
  main: { name:'正面突破', route:'沿裝卸線突破重砲與戰車', entry:[-354,42], checkpoint:[-150,19] },
  flank:{ name:'低地側擊', route:'從北側低地打開側翼通道', entry:[-354,-88], checkpoint:[-150,-91] },
};
const inside = (p,x,z,rx,rz) => Math.abs(p.x-x)<=rx && Math.abs(p.z-z)<=rz;

export class FreightFront extends BattleLine {
  constructor(combat, encounter) {
    super(combat, encounter);
    this.lane=combat.cp?.lane ?? null;
    this.markers=Object.values(POSTS).map(e=>({name:e.name,position:this.point(...e.entry).add(new Vector3(0,16,0))}));
  }
  begin() {
    const resumed=this.enc.sec===1 && this.lane;
    this.wing=this.unit('ally',resumed?-145:-411,resumed?(this.lane==='flank'?-93:5):-5,true);
    this.tanks=[
      this.unit('tank',resumed?-168:-393,47,true),
      this.unit('tank',resumed?-185:-419,75,true),
    ];
    if (resumed) { this.advance('approach'); return; }
    this.phase='breach';
    this.unit('heavy',-230,52,false);
    this.unit('tank',-211,74,false);
    this.unit('grunt',-247,2,false,'screen');
    this.unit('brawler',-223,-103,false,'flank');
    this.unit('grunt',-165,-86,false,'flank');
  }
  advance(phase) {
    const { C, lane }=this;
    this.phase=phase;
    if(phase==='approach'){
      this.enc.sec=1;
      this.marker=this.point(-64,lane==='flank'?-83:10); this.marker.y+=17;
      for(const u of this.allies) if(u.fallback) {
        u.ap=Math.ceil(u.maxAP*.5); u.fallback=false;
      }
      if(lane==='main') {
        this.order(this.wing,[-123,3],[-68,6]);
        this.tanks.forEach((t,i)=>this.order(t,[-83-i*24,47+28*i]));
      } else {
        if(this.wing.pos.x<-383)this.order(this.wing,[-395,-98],[-238,-93],[-118,-83],[-61,-82]);
        else this.order(this.wing,[-118,-83],[-61,-82]);
        this.tanks.forEach((t,i)=>this.order(t,[-201-i*26,47+28*i]));
      }
      const [x,z]=POSTS[lane].checkpoint;
      if(C.cp?.sec!==1) C.cp={sec:1,x,z,yaw:Math.PI/2,lane,stats:{...C.stats},used:0};
      C.player.ap=Math.min(C.player.apMax,C.player.ap+1550);
      C.rifle.ammo=C.rifle.mag; C.rifle.reload=-1;
      C.say(lane==='main'?'中央防線突破':'北側缺口打開','前進至貨運站外圍',3,'gr');
      C.lines([[BLUE,lane==='main'?'重砲沉默了。戰車跟我壓上去。':'北側通道通了。斑鳩從側面進站，戰車留在外圍牽制。']],true);
      for(const e of this.foes) if(this.canFight(e)) {
        e.leave=true;e.target=null;
        const z=e.post==='flank'?-118:e.pos.z;
        this.order(e,[e.pos.x+25,z],[80,z]);
      }
    }else if(phase==='station'){
      this.marker=this.point(181,14); this.marker.y+=24;
      const tankLead=lane==='main';
      if(tankLead) this.tanks.forEach((t,i)=>this.order(t,[84-i*26,47+28*i]));
      else this.order(this.wing,[-46,-81],[45,-78],[114,-65]);
      if(tankLead) this.order(this.wing,[96,4]);
      this.unit('tank',99,76,false,'station');
      this.unit('grunt',80,tankLead?-12:-104,false,'station');
      const boss=this.boss=this.unit('heavy',156,19,false,'station');
      boss.boss=true;boss.maxAP=9400;boss.entity.ap=boss.entity.apMax=boss.maxAP;
      boss.entity.bossName='獵犬軍團重裝指揮機';
      C.boss=boss.entity;
      C.say('貨運站反擊','擊退重裝指揮機，打開撤離通道',3,'am');
      C.lines([[CONTROL,'重裝指揮機進站了。那台機倒下，貨站就能通行。']],true);
    }
  }
  react(actor) {
    const C=this.C;
    if(actor.kind==='brawler'&&actor.target&&actor.target.pos.z<-63) {
      const p=actor.target.pos;
      actor.goal.copy(this.point(Math.max(-293,p.x+32),Math.max(-120,Math.min(-65,p.z-10))));
    }
    if(actor.kind==='grunt'&&!actor.leave&&!actor.shifted&&actor.entity.ap<actor.maxAP*.58) {
      actor.shifted=true;
      this.order(actor,[actor.pos.x+21,actor.pos.z+(actor.post==='flank'?-9:7)]);
    }
    if(actor.boss && !actor.shifted && actor.entity.ap<actor.maxAP*.55) {
      actor.shifted=true;
      actor.weapon={...actor.weapon,damage:720,cool:1.55};
      this.order(actor,[180,24],[209,this.lane==='flank'?-7:7]);
      C.note('重裝指揮機轉移火力','am');
    }
  }
  update(dt) {
    const C=this.C,p=C.player.pos;
    if(this.phase==='breach') {
      if(!this.lane&&p.x>-374&&(p.z>=-27||p.z<=-65)) {
        this.lane=p.z<=-65?'flank':'main';
        C.note(POSTS[this.lane].name+'・'+POSTS[this.lane].route,'cy');
        if(this.lane==='flank') this.order(this.wing,[-384,-95],[-306,-92]);
      }
      if(this.lane && !this.foes.some(u=>u.post===this.lane&&this.canFight(u))) this.advance('approach');
    }
    if(this.phase==='approach' && p.x>-87 && Math.abs(p.z)<140) this.advance('station');
    if(this.phase==='station' && this.boss.entity.dead) {
      this.phase='capture';
      for(const e of this.foes) if(this.canFight(e)) {
        e.leave=true;e.target=null;this.order(e,[e.pos.x+28,e.pos.z],[318,e.pos.z]);
      }
      C.say('重裝指揮機倒下','進入貨運站，打開撤離路線',2.4,'gr');
    }
    if(this.phase==='capture' && inside(p,181,15,58,60)) {
      this.phase='done';this.enc.state='done';this.marker=null;
      C.lines([[BLUE,'貨站到手。救護車隊，撤離路線已開。']],true);
      return true;
    }
    this.stepBattle(dt);
    return false;
  }
  get objective() {
    if(this.phase==='idle'||this.phase==='done')return null;
    if(this.phase==='breach') return this.lane
      ? postHint(this.lane,this.foes.filter(u=>u.post===this.lane&&this.canFight(u)).length)
      : {title:'選擇突破方向',hint:'正面・裝卸線　／　左側・低地通道'};
    if(this.phase==='approach')return {title:'前線已推進',hint:this.lane==='main'?'跟上前壓的盟軍戰車':'跟上北側的斑鳩'};
    return this.phase==='station'?{title:'奪回貨運站',hint:'擊退重裝指揮機'}:{title:'封鎖解除',hint:'進入貨運站開放撤離路線'};
  }
  get waypoints() {
    if(this.phase!=='breach'||this.lane)return [];
    return this.markers;
  }
  radar(out) {
    for(const t of this.tanks??[])if(t.active&&!t.fallback)out.push({x:t.pos.x,z:t.pos.z,kind:'ally'});
  }
}
function postHint(lane,left) { return {title:POSTS[lane].name,hint:lane==='main'?'擊毀重砲與戰車　剩 '+left:'清出北側缺口　剩 '+left}; }
