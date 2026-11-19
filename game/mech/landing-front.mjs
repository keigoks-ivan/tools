import { BattleLine } from './battle-line.mjs?v=1';
import { LANDING } from './landing-layout.mjs?v=1';

const COMMAND = '白鷺（指揮所）';
const DOG = '鐵獒（獵犬軍團）';
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));

export class LandingFront extends BattleLine {
  constructor(combat, encounter) {
    super(combat, encounter);
    this.travel=0;
    this.lower=0;
    this.ashore=Boolean(combat.cp?.sec);
    this.defenders=[];
    this.boss=null;
  }

  prepare() {
    this.site=this.C.world.landingSite;
    this.wallMarkers=[{name:'左側缺口',position:this.point(LANDING.seawall,LANDING.northGap)},
      {name:'右側缺口',position:this.point(LANDING.seawall,LANDING.southGap)}];
    this.wallMarkers.forEach(m=>{m.position.y+=12;});
    if(this.ashore) {
      this.travel=LANDING.travel; this.lower=1;
      this.site.setPose(1,1);
    } else {
      this.site.setPose(0,0);
      this.carryPilot();
    }
  }

  carryPilot() {
    const pilot=this.C.player;
    pilot.pos.set(this.site.ship.position.x+LANDING.offset,LANDING.deck+this.site.ship.position.y,0);
    pilot.vel.set(0,0,0);
    pilot.grounded=true;
  }

  // 接岸時保留瞄準和武器。跳板完全放平時恢復原本的地面與飛行操作。
  pilot(dt, input) {
    if(!this.site)return input;
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
      ally.pos.x=this.site.ship.position.x-21;
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

  begin() {
    const C=this.C;
    if(!this.site)this.prepare();
    const checkpoint=this.enc.sec;
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
    }
    if(checkpoint===2) { this.enterYard(false);return; }
    if(checkpoint===1) { this.enterSeawall(false);return; }
    this.phase='inbound';
    const guard=this.unit('grunt',-224,21,false,'beach');
    const cannon=this.unit('heavy',-179,-44,false,'beach');
    const tank=this.unit('tank',-195,59,false,'beach');
    cannon.entity.ap=cannon.entity.apMax=5600;
    cannon.entity.label='岸防重裝機'; guard.entity.label='灘岸反應機';
    tank.entity.ap=tank.entity.apMax=1750;
    this.defenders=[cannon,guard];
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
    this.C.say('跳板放下','穿過濕灘，擊破岸防火力',2.6,'cy');
    this.C.lines([['斑鳩','我走左側。蒼焰，跟我把那台重裝機打下來。'],['白隼','右側我來。射線一打開就往前。']],true,2.7);
  }

  checkpoint(sec,x,z) {
    const C=this.C;
    if(C.cp?.sec===sec)return;
    C.cp={sec,x,z,yaw:Math.PI/2,stats:{...C.stats},used:0};
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
    this.waypoint(LANDING.seawall,LANDING.northGap);
    this.regroup();
    if(save) {
      this.checkpoint(1,-171,0);
      this.retire((e,z)=>[[e.pos.x+32,z],[-85,z],[6,z],[143,z]]);
    }
    this.order(this.ikaru,[-187,-31],[-129,-55],[-75,-61],[-13,-61]);
    this.order(this.hayabusa,[-188,29],[-126,55],[-75,63],[-10,63]);
    const north=this.unit('brawler',-14,-60,false,'seawall');
    const south=this.unit('grunt',11,65,false,'seawall');
    const support=this.unit('tank',72,87,false,'seawall');
    north.entity.label='左側反擊機'; south.entity.label='右側反擊機';
    north.entity.ap=north.entity.apMax=3650; south.entity.ap=south.entity.apMax=3150;
    support.entity.ap=support.entity.apMax=2100;
    this.order(north,[-22,-60],[-32,-60]);
    this.order(south,[-17,63]);
    this.defenders=[north,south];
    this.C.say('兩翼推進','清掉海堤缺口的反擊部隊，穿過海堤',3,'cy');
    this.C.lines([[COMMAND,'岸防機倒下。斑鳩去左側缺口，白隼從右側進。蒼焰，選一處跟上。']],true,3.2);
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
    const boss=this.boss=this.unit('heavy',230,4,false,'yard');
    boss.boss=true;
    boss.entity.bossName='鐵獒';
    boss.maxAP=12300; boss.entity.ap=boss.entity.apMax=boss.maxAP;
    boss.weapon={...boss.weapon,damage:750,cool:2.55,range:390,speed:14};
    this.C.boss=boss.entity;
    const screen=this.unit('grunt',158,22,false,'yard');
    screen.entity.ap=screen.entity.apMax=3150;
    this.unit('tank',209,43,false,'yard');
    this.C.say('港區反擊','擊退鐵獒，打開港區通道',3,'am');
    this.C.lines([[DOG,'都到海堤了？那就讓我看看，你們打算從哪裡過去。']],true,3.5);
  }

  react(actor) {
    if(actor.boss&&!actor.shifted&&actor.entity.ap<actor.maxAP*.55) {
      actor.shifted=true;
      actor.weapon={...actor.weapon,damage:900,cool:1.65,speed:18};
      this.order(actor,[257,0],[287,-26]);
      this.C.note('鐵獒轉移陣地・重砲加速','am');
      this.C.lines([[DOG,'主路交給支援組。我換陣地。']],true,2.8);
    }
    if(actor.kind==='brawler'&&actor.post==='seawall'&&!actor.leave&&actor.target&&actor.target.pos.z<-33) {
      actor.goal.copy(this.point(clamp(actor.target.pos.x+36,-91,-10),LANDING.northGap));
    }
  }

  update(dt) {
    const p=this.C.player.pos;
    if(this.phase==='beach'&&p.x>-261&&Math.abs(p.z)<115&&this.defenders.every(u=>u.entity.dead))this.enterSeawall();
    if(this.phase==='seawall'&&p.x>3&&Math.abs(p.z)<113&&this.defenders.every(u=>u.entity.dead))this.enterYard();
    if(this.phase==='yard'&&this.boss.entity.dead) {
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
    if(this.phase==='seawall')return {title:'推過海堤',hint:'摧毀兩翼反擊機，穿過任一缺口'};
    if(this.phase==='yard')return {title:'奪回外港裝卸區',hint:'擊退鐵獒'};
    if(this.phase==='capture')return {title:'港區通道打開',hint:'跟盟軍進入裝卸區'};
    return null;
  }

  get waypoints() { return this.phase==='seawall'?this.wallMarkers:[]; }
  // 兩台僚機沿用 Combat 的雷達標記。
  radar() {}
}
