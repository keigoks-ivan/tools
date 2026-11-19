import { BattleLine } from './battle-line.mjs?v=2';
import { LANDING, landingShore } from './landing-layout.mjs?v=2';

const COMMAND = '白鷺（指揮所）';
const DOG = '鐵獒（獵犬軍團）';
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
const lanes={left:LANDING.northGap,right:LANDING.southGap};
const cleared=units=>units.every(u=>u.entity.dead);
const barrage=[
  [.34,-395,32],[.97,-395,-34],[1.82,-374,70],[2.65,-324,-38],
  [3.6,-291,39],[4.63,-345,29],[5.7,-302,-54],[6.75,-357,-35],
  [7.54,-320,43],[8.46,-280,64],[9.52,-280,-52],[10.7,-245,45],
];

export class LandingFront extends BattleLine {
  constructor(combat, encounter) {
    super(combat, encounter);
    this.travel=0;
    this.lower=0;
    this.ashore=Boolean(combat.cp?.sec);
    this.lane=combat.cp?.lane??null;
    this.defenders=[];
    this.boss=null;
    this.barrageTime=0;this.nextBurst=0;this.bursts=[];
  }

  prepare() {
    this.site=this.C.world.landingSite;
    this.wallMarkers=[{name:'左側・攔截機',position:this.point(LANDING.seawall,lanes.left)},
      {name:'右側・裝甲車',position:this.point(LANDING.seawall,lanes.right)}];
    this.wallMarkers.forEach(m=>{m.position.y+=12;});
    if(this.ashore) {
      this.travel=LANDING.travel; this.lower=1;
      this.site.setPose(1,1);
    } else {
      this.phase='inbound';
      this.site.setPose(0,0);
      this.carryPilot();
      this.deployAllies(0);
    }
  }

  carryPilot() {
    const pilot=this.C.player,x=this.site.ship.position.x+LANDING.offset,y=LANDING.deck+this.site.ship.position.y;
    this.C.hero?.motion?.carry(x-pilot.pos.x,y-pilot.pos.y,-pilot.pos.z);
    pilot.pos.set(x,y,0);
    pilot.vel.set(0,0,0);
    pilot.grounded=true;
  }

  shoreFire(dt) {
    const { C }=this;
    this.barrageTime+=dt;
    while(this.nextBurst<barrage.length&&this.barrageTime>=barrage[this.nextBurst][0]){
      const [,x,z]=barrage[this.nextBurst++];
      const water=x<landingShore(z);
      const hit=this.point(x,z);
      hit.y=water?.10:hit.y+.25;
      const streak=this.point(-118,z*.7+39);
      streak.y+=34;
      C.fx.shellTracer(streak,hit,390);
      this.bursts.push({hit,water,delay:streak.distanceTo(hit)/390});
    }
    for(let i=this.bursts.length-1;i>=0;i--){
      const b=this.bursts[i];
      b.delay-=dt;
      if(b.delay>0)continue;
      if(b.water)C.fx.waterImpact?.(b.hit);
      else C.fx.explosion(b.hit,.74);
      C.audio.explosion(b.hit,b.water?.42:.57);
      this.bursts.splice(i,1);
    }
  }

  // 接岸時保留瞄準和武器。跳板完全放平時恢復原本的地面與飛行操作。
  pilot(dt, input) {
    if(!this.site)return input;
    if(!this.C.cp&&this.phase!=='done'&&(this.nextBurst<barrage.length||this.bursts.length))this.shoreFire(dt);
    if(this.phase==='inbound') {
      this.travel=Math.min(LANDING.travel,this.travel+dt);
      if(this.travel>=LANDING.travel) {
        this.phase='ramp';
        this.C.say('登陸艇已接岸','跳板正在放下',1.8,'cy');
        this.C.audio.ui('confirm');
      }
    } else if(this.phase==='ramp') this.lower=Math.min(1,this.lower+dt*.68);
    const p=this.travel/LANDING.travel;
    const position=p*p*(3-2*p);
    const open=this.lower*this.lower*(3-2*this.lower);
    this.site.setPose(position,open,dt);
    if(this.C.dead||this.ashore)return input;
    this.carryPilot();
    for(const ally of this.allies) {
      const x=this.site.ship.position.x-21,y=LANDING.deck+this.site.ship.position.y;
      ally.mech.motion.carry(x-ally.pos.x,y-ally.pos.y,0);
      ally.pos.set(x,y,ally.pos.z);
      ally.goal.copy(ally.pos);
    }
    if(this.phase==='ramp'&&this.lower>=1) {
      this.ashore=true;this.enterBeach();
      return input;
    }
    return {...input,mx:0,my:0,qb:false,boost:false,jump:false,hover:false,flight:false,descend:false,flightBlocked:true};
  }

  floor(actor,x,z) {
    if(actor.friendly&&this.site) {
      const deck=this.site.floorAt(x,z,actor.pos.y+1.0);
      if(Number.isFinite(deck))return Math.max(deck,this.C.world.height(x,z));
    }
    return super.floor(actor,x,z);
  }

  deployAllies(checkpoint) {
    const pair=checkpoint===2?[[54,-45],[52,48]]
      :checkpoint===1?[[-159,-46],[-175,51]]
        :[[this.site.ship.position.x-21,-12],[this.site.ship.position.x-21,12]];
    this.ikaru=this.unit('ally',...pair[0],true,'blue',{name:'斑鳩',tanks:true});
    this.hayabusa=this.unit('ally',...pair[1],true,'blue',{name:'白隼',aggressors:true});
    for(const [i,a] of this.allies.entries()) {
      if(!checkpoint)a.pos.y=LANDING.deck+this.site.ship.position.y;
      a.ap=a.maxAP=6000;
      a.weapon={...a.weapon,speed:26,cool:i===0?1.34:1.17,damage:i===0?390:300};
      a.cool=.35+i*.19;
      a.goal.copy(a.pos);
      a.mech.animate(1/60,{...a.pose,torsoYaw:a.face});
    }
  }

  begin() {
    const C=this.C;
    if(!this.site)this.prepare();
    const checkpoint=this.enc.sec;
    if(!this.ikaru)this.deployAllies(checkpoint);
    if(checkpoint===2) { this.enterYard(false);return; }
    if(checkpoint===1) { this.enterSeawall(false);return; }
    this.phase='inbound';
    const guard=this.unit('grunt',-224,21,false,'beach');
    const cannon=this.unit('heavy',-179,-44,false,'beach');
    const tank=this.unit('tank',-195,59,false,'beach');
    cannon.entity.ap=cannon.entity.apMax=5600;
    cannon.entity.label='岸防重裝機'; guard.entity.label='灘岸反應機';
    tank.entity.ap=tank.entity.apMax=1750;
    this.defenders=[cannon,guard,tank];
    this.order(guard,[-250,20],[-246,38]);
    this.order(tank,[-219,61],[-226,60]);
    C.say('神戶外港・登陸','斑鳩、白隼，與蒼焰同艇進場',3,'cy');
  }

  waypoint(x,z) {
    this.marker=this.point(x,z);
    this.marker.y+=13;
  }

  enterBeach() {
    this.phase='beach';
    this.waypoint(-203,-1);
    this.order(this.ikaru,[-324,-14],[-274,-21],[-230,-16]);
    this.order(this.hayabusa,[-324,13],[-268,24],[-230,18]);
    this.C.say('第一波・跳板放下','穿過濕灘，擊破岸防火力',2.6,'cy');
    this.C.lines([['斑鳩','我走左側。蒼焰，跟我把那台重裝機打下來。'],['白隼','右側我來。射線一打開就往前。']],true,2.7);
  }

  checkpoint(sec,x,z) {
    const C=this.C;
    if(C.cp?.sec===sec)return;
    C.cp={sec,x,z,yaw:Math.PI/2,lane:this.lane,stats:{...C.stats},used:0};
    C.player.ap=Math.min(C.player.apMax,C.player.ap+1850);
    C.rifle.ammo=C.rifle.mag; C.rifle.reload=-1;
    C.note('檢查點・重整彈藥','gr');
  }

  regroup() {
    for(const a of this.allies) {
      if(a.fallback)a.ap=Math.ceil(a.maxAP*.57);
      a.fallback=false;
    }
  }

  beachCounter() {
    this.phase='beachCounter';
    this.waypoint(-167,-9);
    this.order(this.ikaru,[-220,-24],[-181,-31]);
    this.order(this.hayabusa,[-218,24],[-176,38]);
    const left=this.unit('grunt',-155,-81,false,'beachCounter');
    const right=this.unit('brawler',-139,67,false,'beachCounter');
    const gun=this.unit('heavy',-123,-18,false,'beachCounter');
    left.entity.label='灘岸側擊機';right.entity.label='岸防快速反應機';gun.entity.label='岸防預備隊';
    this.order(left,[-183,-66],[-201,-52]);this.order(right,[-158,54],[-193,49]);
    this.order(gun,[-143,-14]);
    this.defenders=[left,right,gun];
    this.C.say('第二波・灘岸反擊','敵機正在兩側出現，與僚機一起清出前路',3,'am');
  }

  retire(positions) {
    for(const e of this.foes) if(this.canFight(e)){
      const z=e.pos.z<0?LANDING.northGap:LANDING.southGap;
      e.leave=true;e.target=null;
      this.order(e,...positions(e,z));
    }
  }

  enterSeawall(save=true) {
    this.phase='seawall';
    this.enc.sec=1;
    this.marker=null;
    this.regroup();
    if(save) {
      this.checkpoint(1,-171,0);
      this.retire((e,z)=>[[e.pos.x+32,z],[-85,z],[6,z],[143,z]]);
    }
    this.order(this.ikaru,[-187,-31],[-129,-55],[-75,-61],[-13,-61]);
    this.order(this.hayabusa,[-188,29],[-126,55],[-75,63],[-10,63]);
    const north=this.unit('brawler',-16,-61,false,'seawall');
    const northSupport=this.unit('grunt',9,-78,false,'seawall');
    const south=this.unit('tank',-16,63,false,'seawall');
    const southSupport=this.unit('tank',21,62,false,'seawall');
    north.entity.label='左側反擊機'; south.entity.label='右側岸防戰車';
    north.entity.ap=north.entity.apMax=3850; south.entity.ap=south.entity.apMax=2550;
    this.order(north,[-27,-61],[-62,-61]);this.order(northSupport,[-19,-62]);
    this.order(south,[-25,63]);this.order(southSupport,[4,64]);
    this.wallGuards={left:[north,northSupport],right:[south,southSupport]};
    this.C.say('第三波・兩翼破口','左側是攔截機，右側是戰車。選一側打穿海堤',3,'cy');
    this.C.lines([[COMMAND,'斑鳩從左側攔截機那邊走，白隼去對付右側的戰車。蒼焰，選一側跟上。']],true,3.2);
  }

  crossWall(lane) {
    this.lane=lane;
    this.phase='crossing';
    const z=lanes[lane], lead=lane==='left'?this.ikaru:this.hayabusa;
    this.waypoint(48,z);
    this.retire((e,ez)=>[[Math.max(e.pos.x+24,12),ez],[145,ez]]);
    this.order(lead,[-15,z],[24,z],[66,z*.73]);
    const guard=this.unit('grunt',55,z*.58,false,'crossing');
    const reserve=this.unit(lane==='left'?'brawler':'tank',75,z*1.49,false,'crossing');
    this.order(guard,[35,z*.79],[21,z*.67]);this.order(reserve,[47,z*1.13]);
    this.defenders=[guard,reserve];
    this.C.say('第四波・海堤後方反擊','擊退內側預備隊，往裝卸區推進',3,'am');
  }

  enterYard(save=true) {
    this.phase='yard';
    this.enc.sec=2;
    this.waypoint(LANDING.yard,4);
    this.regroup();
    if(save) {
      this.checkpoint(2,52,6);
      this.retire((e,z)=>[[Math.max(e.pos.x+22,35),z],[191,z],[345,z]]);
    }
    this.order(this.ikaru,[41,-61],[95,-48],[161,-22]);
    this.order(this.hayabusa,[43,65],[96,56],[166,35]);
    const guard=this.unit('heavy',175,-8,false,'yard');
    const screen=this.unit('grunt',151,22,false,'yard');
    const tank=this.unit('tank',195,46,false,'yard');
    this.order(guard,[152,-5]);this.order(screen,[118,18],[136,41]);
    this.order(tank,[160,39]);
    this.defenders=[guard,screen,tank];
    this.C.say('第五波・裝卸區防線','穿過貨櫃通道，打掉鐵獒的前衛',3,'am');
  }

  beginBoss() {
    this.phase='boss';
    this.waypoint(234,4);
    const boss=this.boss=this.unit('heavy',236,4,false,'boss');
    boss.boss=true;
    boss.entity.bossName='鐵獒';
    boss.maxAP=12300; boss.entity.ap=boss.entity.apMax=boss.maxAP;
    boss.weapon={...boss.weapon,damage:750,cool:2.55,range:390,speed:14};
    this.C.boss=boss.entity;
    const screen=this.unit('grunt',204,this.lane==='right'?-52:56,false,'boss');
    this.order(screen,[190,this.lane==='right'?-31:30]);
    this.defenders=[screen];
    this.C.say('第六波・鐵獒迎擊','小心重砲，兩台僚機會分頭牽制',3,'am');
    this.C.lines([[DOG,'都到海堤了？那就讓我看看，你們打算從哪裡過去。']],true,3.5);
  }

  bossReserve() {
    const boss=this.boss;
    boss.shifted=true;
    boss.weapon={...boss.weapon,damage:900,cool:1.65,speed:18};
    this.order(boss,[257,0],[287,-26]);
    const side=this.lane==='right'?-1:1;
    const reserve=this.unit('brawler',267,side*65,false,'boss');
    this.order(reserve,[238,side*47],[204,side*27]);
    this.defenders.push(reserve);
    this.C.say('第七波・港區最後反撲','護衛機從側面進場，清出最後通道',3,'am');
    if(!boss.entity.dead)this.C.lines([[DOG,'主路交給支援組。我換陣地。']],true,2.8);
  }

  react(actor) {
    if(actor.kind==='brawler'&&actor.post==='seawall'&&!actor.leave&&actor.target&&actor.target.pos.z<-33) {
      actor.goal.copy(this.point(clamp(actor.target.pos.x+36,-100,-14),lanes.left));
    }
    if(!actor.friendly&&actor.kind==='grunt'&&!actor.leave&&!actor.shifted&&actor.target&&actor.entity.ap<actor.maxAP*.62){
      actor.shifted=true;
      const side=actor.pos.z>actor.target.pos.z?1:-1;
      this.order(actor,[actor.pos.x+14,actor.pos.z+side*16],[actor.pos.x+26,actor.pos.z+side*21]);
    }
  }

  update(dt) {
    const p=this.C.player.pos;
    if(this.phase==='beach'&&p.x>-261&&Math.abs(p.z)<115&&cleared(this.defenders))this.beachCounter();
    else if(this.phase==='beachCounter'&&p.x>-212&&cleared(this.defenders))this.enterSeawall();
    else if(this.phase==='seawall'&&p.x>-78){
      const lane=p.z<0?'left':'right';
      if(Math.abs(p.z-lanes[lane])<29&&cleared(this.wallGuards[lane]))this.crossWall(lane);
    } else if(this.phase==='crossing'&&p.x>20&&Math.abs(p.z)<116&&cleared(this.defenders))this.enterYard();
    else if(this.phase==='yard'&&p.x>91&&Math.abs(p.z)<116&&cleared(this.defenders))this.beginBoss();
    if(this.phase==='boss'&&!this.boss.shifted&&this.boss.entity.ap<this.boss.maxAP*.55)this.bossReserve();
    if(this.phase==='boss'&&this.boss.entity.dead&&cleared(this.defenders)) {
      this.phase='capture';
      this.retire((e,z)=>[[e.pos.x+25,e.pos.z],[361,z]]);
      this.C.say('鐵獒倒下','進入裝卸區，完成登陸',2.8,'gr');
    }
    if(this.phase==='capture'&&p.x>LANDING.yard-35&&Math.abs(p.z)<94){
      this.phase='done';this.marker=null;this.enc.state='done';
      return true;
    }
    this.stepBattle(dt);
    return false;
  }

  get objective() {
    if(this.phase==='inbound')return {title:'近岸登陸',hint:'可瞄準與開火，準備跨過跳板'};
    if(this.phase==='ramp')return {title:'接岸',hint:'艏部跳板正在下降'};
    if(this.phase==='beach')return {title:'突破灘岸',hint:'擊破岸防重裝機和快速反應機'};
    if(this.phase==='beachCounter')return {title:'灘岸反擊',hint:'擊退第二線的預備隊，往海堤靠近'};
    if(this.phase==='seawall')return {title:'選一側突破海堤',hint:'左側攔截機　／　右側岸防戰車'};
    if(this.phase==='crossing')return {title:'海堤內側反擊',hint:'清掉缺口後方的預備隊'};
    if(this.phase==='yard')return {title:'攻入外港裝卸區',hint:'擊破鐵獒的前衛再往前推'};
    if(this.phase==='boss')return {title:'奪回外港裝卸區',hint:'擊退鐵獒和護衛機'};
    if(this.phase==='capture')return {title:'港區通道打開',hint:'跟盟軍進入裝卸區'};
    return null;
  }

  get waypoints() { return this.phase==='seawall'?this.wallMarkers:[]; }
  // 兩台僚機沿用 Combat 的雷達標記。
  radar() {}
}
