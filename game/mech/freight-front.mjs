import { Vector3 } from 'three';
import { BattleLine } from './battle-line.mjs?v=2';

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
    this.C.say('第一波・貨站外圍','正面走裝卸線，左側走北側低地',3,'cy');
  }

  counter() {
    const {C,lane}=this, flank=lane==='flank', z=flank?-94:42;
    this.phase='counter';
    this.marker=this.point(-177,z);this.marker.y+=17;
    const first=this.unit(flank?'brawler':'tank',-192,z,false,'counter');
    const second=this.unit(flank?'grunt':'heavy',-130,z+(flank?-17:35),false,'counter');
    const screen=this.unit('grunt',-153,flank?-61:16,false,'counter');
    first.entity.label=flank?'北線攔截機':'調車場裝甲反擊';
    second.entity.label=flank?'低地火力組':'裝卸線重砲';
    this.order(first,[-219,z],[-246,z]);this.order(second,[-181,z+(flank?-10:29)]);
    this.order(screen,[-198,flank?-74:23]);
    this.currentWave=[first,second,screen];
    this.order(this.wing,[-217,flank?-91:11],[-191,flank?-90:15]);
    if(!flank)this.tanks.forEach((t,i)=>this.order(t,[-217-i*24,47+28*i]));
    C.say('第二波・站外預備隊',flank?'敵機轉進低地，清出北側通道':'戰車沿裝卸線壓上，和盟軍一起擊退它們',3,'am');
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
    }else if(phase==='platform'){
      const flank=lane==='flank';
      this.marker=this.point(87,flank?-75:12); this.marker.y+=20;
      const postZ=flank?-100:62;
      const mobile=this.unit(flank?'brawler':'grunt',61,postZ,false,'platform');
      const covering=this.unit('grunt',104,flank?-46:-17,false,'platform');
      const heavy=this.unit('tank',94,77,false,'platform');
      this.order(mobile,[18,postZ],[-12,flank?-83:48]);
      this.order(covering,[64,flank?-77:9]);
      this.order(heavy,[56,76]);
      this.currentWave=[mobile,covering,heavy];
      if(flank)this.order(this.wing,[-42,-85],[36,-81],[77,-72]);
      else{
        this.order(this.wing,[-25,7],[60,10]);
        this.tanks.forEach((t,i)=>this.order(t,[45-i*18,47+28*i]));
      }
      C.say('第三波・月台反擊','敵軍正在調車線和北側月台之間換位',3,'am');
    }else if(phase==='station'){
      this.marker=this.point(181,14); this.marker.y+=24;
      const tankLead=lane==='main';
      if(tankLead) this.tanks.forEach((t,i)=>this.order(t,[84-i*26,47+28*i]));
      else this.order(this.wing,[-46,-81],[45,-78],[114,-65]);
      if(tankLead) this.order(this.wing,[96,4]);
      const guard=this.unit(tankLead?'tank':'brawler',158,tankLead?64:-72,false,'station');
      this.order(guard,[141,tankLead?54:-47],[134,tankLead?37:-34]);
      this.currentWave=[guard];
      const boss=this.boss=this.unit('heavy',179,19,false,'station');
      boss.boss=true;boss.maxAP=10500;boss.entity.ap=boss.entity.apMax=boss.maxAP;
      boss.weapon={...boss.weapon,damage:540,range:340};
      boss.entity.bossName='獵犬軍團重裝指揮機';
      C.boss=boss.entity;
      C.say('第四波・車棚指揮機','突破重裝機和護衛，打開撤離通道',3,'am');
      C.lines([[CONTROL,'重裝指揮機進站了。那台機倒下，貨站就能通行。']],true);
    }
  }
  react(actor) {
    if(!actor.friendly&&!actor.leave&&actor.kind==='brawler'&&actor.post==='flank'&&actor.target&&actor.target.pos.z<-63) {
      const p=actor.target.pos;
      actor.goal.copy(this.point(Math.max(-293,p.x+26),Math.max(-118,Math.min(-70,p.z-14))));
    }
    if(actor.kind==='grunt'&&!actor.leave&&!actor.shifted&&actor.entity.ap<actor.maxAP*.58) {
      actor.shifted=true;
      this.order(actor,[actor.pos.x+21,actor.pos.z+(actor.post==='flank'?-9:7)]);
    }
  }
  stationReserve() {
    const boss=this.boss,z=this.lane==='flank'?51:-47;
    boss.shifted=true;
    boss.weapon={...boss.weapon,damage:700,cool:1.62,speed:13};
    this.order(boss,[210,20],[234,7]);
    const lead=this.unit('brawler',235,z,false,'station');
    const backup=this.unit('grunt',252,-z*.68,false,'station');
    this.order(lead,[193,z*.77],[174,z*.52]);
    this.order(backup,[220,-z*.53],[179,-z*.44]);
    this.currentWave.push(lead,backup);
    this.C.say('第五波・貨站最後反擊','重裝指揮機轉移，兩側護衛支援進場',3,'am');
  }
  update(dt) {
    const C=this.C,p=C.player.pos;
    if(this.phase==='breach') {
      if(!this.lane&&p.x>-361&&(p.z>=-18||p.z<=-65)) {
        this.lane=p.z<=-65?'flank':'main';
        C.note(POSTS[this.lane].name+'・'+POSTS[this.lane].route,'cy');
        if(this.lane==='flank') this.order(this.wing,[-384,-95],[-306,-92]);
      }
      if(this.lane&&p.x>-285&&!this.foes.some(u=>u.post===this.lane&&this.canFight(u)))this.counter();
    }
    if(this.phase==='counter'&&p.x>-212&&this.currentWave.every(u=>u.entity.dead))this.advance('approach');
    if(this.phase==='approach'&&p.x>-87&&Math.abs(p.z)<140)this.advance('platform');
    if(this.phase==='platform'&&p.x>42&&Math.abs(p.z)<140&&this.currentWave.every(u=>u.entity.dead))this.advance('station');
    if(this.phase==='station'&&!this.boss.shifted&&this.boss.entity.ap<this.boss.maxAP*.55)this.stationReserve();
    if(this.phase==='station'&&this.boss.entity.dead&&this.currentWave.every(u=>u.entity.dead)) {
      this.phase='capture';
      this.marker=this.point(222,15);this.marker.y+=21;
      for(const e of this.foes) if(this.canFight(e)) {
        e.leave=true;e.target=null;this.order(e,[e.pos.x+28,e.pos.z],[318,e.pos.z]);
      }
      C.say('重裝指揮機倒下','進入貨運站，打開撤離路線',2.4,'gr');
    }
    if(this.phase==='capture' && inside(p,222,15,17,28)) {
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
    if(this.phase==='counter')return {title:'站外預備隊反擊',hint:'擊退預備隊，向貨站推進'};
    if(this.phase==='platform')return {title:'穿越月台',hint:'清除調車線和月台上的敵機'};
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
