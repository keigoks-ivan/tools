// Optional infantry stories. Coordinates are injected by vehicle-routes.mjs as world [x,y,z].
// The caller owns vehicles, enemies and rewards; this module never changes main-story done IDs.
const freeze=o=>{Object.values(o).forEach(v=>{if(v&&typeof v==='object')freeze(v);});return Object.freeze(o);};
const op=(id,site,action,label,seconds,radio,more={})=>({id,kind:'operate',site,action,label,seconds,radius:2.8,radio,...more});
const drive=(id,route,label,radio)=>({id,kind:'drive',route,label,radius:5,radio});
const clear=(id,site,label,radio,more={})=>({id,kind:'clear',site,label,radius:18,radio,...more});
const defend=(id,site,label,seconds,radio,more={})=>({id,kind:'defend',site,label,seconds,radius:12,radio,...more});

export const VEHICLE_MISSIONS=freeze([
  {
    id:'zero_patrol',campaign:'zero',setting:'fiction',title:'奪回巡邏車',vehicle:'4x4',capacity:2,minChapter:2,maxChapter:5,after:['D1'],historyCard:'port-opening',
    offer:'白鷺：封鎖鏈路斷了。外圈維修站有一台四輪巡邏車，修好就能替步行路線清出另一個出口。要不要接這一趟？',
    outcome:'外圈出口已開。巡邏車留在街邊，商場與機庫仍要靠你徒步進去。',fallback:'這台車走不了了。沿原來的步行路線前進，支線不會擋住機庫任務。',
    reward:{id:'spare-parts',label:'維修備料',repairFraction:.15},bonus:{id:'quiet-patrol',label:'安靜通行',condition:'quiet',warningSeconds:2},
    stages:[
      op('repair','repair','repair','接回電瓶，解除巡邏車制動',4,'零號：電瓶接頭燒了，車架還完整。我能把它修起來。',{effect:{repairFraction:.35}}),
      drive('patrol','patrol','駕駛巡邏車沿維修外圈前進','白鷺：神戶港一八六八年開港，是人與貨物往來的入口。那段歷史不是今天的封鎖；沿外圈走，別把車開進商場。'),
      clear('roadblock','roadblock','清除外圈路障守軍','白鷺：在停車帶下車，先處理路障旁的守軍。別追進居民巷。'),
      drive('gateApproach','gateApproach','沿外圈支路抵達維修閘鎖','白鷺：路障清了。回車上，下一道閘鎖還在前面的支路。'),
      op('gate','gate','openGate','打開維修通道的機械閘鎖',3,'零號：手動閘鎖。打開之後，這條路不用再靠軍方授權。'),
      drive('return','return','把巡邏車停回安全停車帶','白鷺：出口記下了。把車停妥，再回去接原來的路線。'),
      op('park','park','parkVehicle','拉住駐車煞車，留下備用工具',2,'零號：工具放在座椅下。下一個走到這裡的人，也許用得上。'),
    ],
  },
  {
    id:'zero_kitano',campaign:'zero',setting:'fiction',title:'北野山麓接應',vehicle:'4x4',capacity:2,minChapter:3,maxChapter:5,after:['I2'],historyCard:'moegi',
    offer:'白鷺：院外還有兩名傷員，山麓接應站能收留他們。隼留下的金鑰已在你手上；這一趟接的是仍然活著的人。',
    outcome:'兩名傷員已交給山麓接應隊。隼的錄音與金鑰仍由你帶往第七機庫。',fallback:'接應隊改走步行備線。你繼續往高架道路，隼留下的任務沒有改變。',
    reward:{id:'first-aid',label:'接應隊急救包',healing:15},bonus:{id:'careful-rescue',label:'平穩接送',condition:'vehicle',repairFraction:.1},
    stages:[
      op('load','load','loadPassengers','扶兩名傷員上車',4,'零號：後座只能坐兩個。我會慢一點，讓他們撐到接應站。',{effect:{passengers:2}}),
      drive('kitano','kitano','沿外圈道路抵達北野入口停車帶','白鷺：北野的歷史街景由洋風與和風住宅共同形成。車留在山麓，坡上的石階與庭院只能步行。'),
      op('garden','garden','collectCargo','步行到庭園邊，取回接應醫療箱',3,'接應隊：萌黃之館建於一九〇三年，原是美國領事住宅。醫療箱放在庭園邊，不要穿過住宅，也別把車開上石階。',{effect:{cargo:'medical-kit'},historyCard:'moegi'}),
      drive('return','return','把傷員送回山麓接應站','零號：醫療箱拿到了。白鷺，確認接應隊的位置。'),
      op('unload','unload','unloadPassengers','把傷員與醫療箱交給接應隊',4,'接應隊：兩個人都到了。我們會接手，你去完成隼留下的事。',{effect:{passengers:0,cargo:null}}),
    ],
  },
  {
    id:'lastline_manifest',campaign:'lastline',setting:'fiction',title:'六十四個名字',vehicle:'apc',capacity:4,minChapter:1,maxChapter:3,after:['B5'],historyCard:'reconstruction',
    offer:'米拉：六十四名倖存者仍在兩輛醫療車上。另一台裝甲運輸車能替我們運送備用氧氣和兩名工程兵，先替接應站開路。',
    outcome:'備用氧氣與工程兵抵達接應站。六十四人的名單與兩輛醫療車維持原來的撤離安排。',fallback:'物資改由地面隊搬運。兩輛醫療車繼續依原定名單撤離，不會等這台運輸車。',
    reward:{id:'oxygen-reserve',label:'接應站備用醫療物資',healing:15},bonus:{id:'safe-cargo',label:'完整運抵',condition:'vehicle',repairFraction:.1},
    stages:[
      op('load','load','loadPassengers','裝載備用氧氣，讓兩名工程兵上車',5,'楠：這批是備用物資，不占醫療車的位置。運輸車只載我們兩個。',{effect:{passengers:2,cargo:'oxygen'}}),
      drive('gateA','gateA','駕駛裝甲運輸車到第一道貨運閘','白鷺：沿裝卸外圈走。靠近閘門就停車，下車開鎖。'),
      op('openA','gateA','openGate','打開第一道貨運閘鎖',3,'楠：第一道閘鎖的線還在，我替你看著車。'),
      drive('gateB','gateB','抵達第二道貨運閘','米拉：醫療車不走這條支路。把物資送到接應站就好。'),
      op('openB','gateB','openGate','解除第二道貨運閘的手動制動',4,'零號：第二道也開了。接應站就在下一段路。'),
      drive('medical','medical','把備用氧氣送到外圈接應站','米拉：一九九五年一月十七日是震災，不是戰爭。這座城後來重建了住宅和社區。今天也要替人留路；到了先卸氧氣。'),
      op('unload','medical','unloadPassengers','卸下氧氣，讓工程兵進接應站',4,'楠：備用氧氣接手。我們守住這裡，你不用改動醫療車的名單。',{effect:{passengers:0,cargo:null}}),
      defend('defend','medical','在接應站外守住卸貨作業',18,'白鷺：守住卸貨帶十八秒。不要追離站點。'),
    ],
  },
  {
    id:'lastline_channel',campaign:'lastline',setting:'fiction',title:'識別頻道',vehicle:'4x4',capacity:2,minChapter:2,maxChapter:3,after:['D2C'],historyCard:'railway-industry',
    offer:'白鷺：識別頻道副本已留下。外圈還有一座監聽端，可以提前看見封鎖車隊的呼叫。開巡邏車去確認，不要炸掉終端。',
    outcome:'外圈監聽端保留了頻道副本。這份預警只替地面隊爭取時間，蒼焰的離線授權仍要照原流程解除。',fallback:'監聽支路先放下。原始識別副本仍在，回醫療站完成離線授權。',
    reward:{id:'channel-warning',label:'地面頻道預警',warningSeconds:2},bonus:{id:'quiet-channel',label:'未驚動監聽哨',condition:'quiet',warningSeconds:1},
    stages:[
      op('repair','repair','repair','接上巡邏車的備用通訊電源',3,'零號：通訊電源接回去了。這台車一次只能帶一組人。',{effect:{repairFraction:.2}}),
      drive('relay','relay','沿港區支路抵達監聽端','白鷺：大阪至神戶的鐵路一八七四年開業，交通網帶動港口與產業。今天的監聽端只是軍方設備；停車下去確認，別炸掉它。'),
      op('listen','relay','copySignal','把識別副本接到外圈監聽端',4,'零號：只接副本，不動原始授權。戰鬥紀錄也留在終端裡。'),
      drive('interceptApproach','intercept','抵達外圈攔截點','白鷺：前方有個小哨站。能從側邊解除警報，就不用把整條支路驚醒。'),
      clear('intercept','intercept','清除守軍，或安靜解除支路警報','白鷺：守軍撤離或警報旁路完成，都能通過。不要拿巡邏車去撞裝甲機。',{allowBypass:true}),
      drive('return','return','回到安全停車帶，保留監聽設備','白鷺：把車停回去。醫療站的金鑰與遠端限制，仍得你親自處理。'),
      op('park','park','parkVehicle','停妥巡邏車，保存頻道紀錄',2,'零號：頻道紀錄留下了。接下來回到主線。'),
    ],
  },
  {
    id:'lastline_shuttle',campaign:'lastline',setting:'fiction',title:'最後一趟接駁',vehicle:'apc',capacity:4,minChapter:3,maxChapter:3,after:['F3'],historyCard:'reconstruction',
    offer:'楠：吊架能手動操作了。外圈運輸車還能跑一趟，把兩名維修工程兵和工具送到修船棚外。棚內電源仍得你徒步接回去。',
    outcome:'維修工程兵已在棚外接手。運輸車停在裝卸帶，蒼焰與兩輛醫療車繼續原定撤離任務。',fallback:'工程兵走棚外的步行備線。別為這台車留在裝卸場，回去接通蒼焰。',
    reward:{id:'ground-crew',label:'地面維修支援',repairFraction:.15},bonus:{id:'shuttle-tools',label:'工具完整抵達',condition:'vehicle',repairFraction:.1},
    stages:[
      op('load','load','loadPassengers','裝載維修工具，接兩名工程兵上車',4,'楠：只送到棚外。我們留在地面，不跟你進蒼焰駕駛艙。',{effect:{passengers:2,cargo:'tools'}}),
      drive('dock','dock','沿外圈裝卸路抵達修船接應帶','白鷺：看到機動裝甲就用貨櫃遮住視線。這台運輸車扛不住它的砲。'),
      op('gate','gate','openGate','解除外圈裝卸閘的手動制動',3,'零號：外圈閘已開。棚內拖吊發電機仍按原計畫處理。'),
      defend('defend','dock','守住棚外維修隊的接應帶',20,'楠：給我們二十秒卸下外圈備料。棚內拖吊仍按原計畫處理，先守住車旁。',{requires:['F3']}),
      drive('hangar','hangar','把運輸車停到修船棚外停車帶','楠：過去震災後的街區重建，居民也透過協議會提出構想。那段民間復興已是歷史；這一趟我們送工具，接電和冷卻仍要下車做。'),
      op('unload','hangar','unloadPassengers','交接工程兵與工具，結束接駁',4,'楠：工具交接完了。地面隊會留下來，下一段由你開蒼焰。',{effect:{passengers:0,cargo:null}}),
    ],
  },
]);

const byId=new Map(VEHICLE_MISSIONS.map(m=>[m.id,m]));
const xyz=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)?p:p&&[p.x,p.y,p.z].every(Number.isFinite)?[p.x,p.y,p.z]:null;
const near=(a,b,r)=>{a=xyz(a);b=xyz(b);return !!a&&!!b&&Math.abs(a[1]-b[1])<2.5&&Math.hypot(a[0]-b[0],a[2]-b[2])<=r;};
const has=(collection,id)=>collection instanceof Set?collection.has(id):Array.isArray(collection)&&collection.includes(id);
const copy=o=>JSON.parse(JSON.stringify(o));
const vehicleKind=v=>{const k=v?.kind||v?.type;return k==='patrol'?'4x4':k;};
const routeKeys=m=>[...new Set(m.stages.filter(s=>s.route).map(s=>s.route))];
const siteKeys=m=>[...new Set(m.stages.filter(s=>s.site).map(s=>s.site))];

export function validateVehicleRoute(id,pack) {
  const m=byId.get(id);
  if(!m||!pack||!xyz(pack.vehicleSpawn)||!pack.sites||!pack.driveRoutes)return false;
  if(siteKeys(m).some(k=>!xyz(pack.sites[k])))return false;
  if(pack.vehicleYaw!==undefined&&!Number.isFinite(pack.vehicleYaw))return false;
  if(pack.parking&&Object.values(pack.parking).some(p=>!xyz(p)))return false;
  if(pack.walkRoutes&&Object.values(pack.walkRoutes).some(r=>!Array.isArray(r)||r.length<2||r.some(p=>!xyz(p))))return false;
  return routeKeys(m).every(k=>Array.isArray(pack.driveRoutes[k])&&pack.driveRoutes[k].length>=2&&pack.driveRoutes[k].every(p=>!!xyz(p)));
}

// update context: {chapter,done,player,vehicle:{kind,pos,occupied,hp,maxHp},held,
// action?,hurt,paused,cleared:Set<string>,bypassed:Set<string>,alerted}.
// Encounter tokens are `${missionId}:${stageId}`. Only consume caller-confirmed side encounters.
export class VehicleStory {
  constructor({campaign='zero',routes={}}={}) {
    if(!['zero','lastline'].includes(campaign))throw new TypeError('Unknown vehicle-story campaign');
    this.campaign=campaign;this.routes={};
    for(const m of VEHICLE_MISSIONS.filter(m=>m.campaign===campaign))if(routes[m.id]) {
      if(!validateVehicleRoute(m.id,routes[m.id]))throw new TypeError(`Invalid vehicle route: ${m.id}`);
      const p=routes[m.id];this.routes[m.id]={vehicleSpawn:[...xyz(p.vehicleSpawn)],vehicleYaw:p.vehicleYaw||0,vehicleType:m.vehicle==='4x4'?'patrol':'apc',sites:Object.fromEntries(siteKeys(m).map(k=>[k,[...xyz(p.sites[k])]])),driveRoutes:Object.fromEntries(routeKeys(m).map(k=>[k,p.driveRoutes[k].map(v=>[...xyz(v)])])),parking:p.parking?Object.fromEntries(Object.entries(p.parking).map(([k,v])=>[k,[...xyz(v)]])):{},walkRoutes:p.walkRoutes?Object.fromEntries(Object.entries(p.walkRoutes).map(([k,r])=>[k,r.map(v=>[...xyz(v)])])):{},encounters:p.encounters?copy(p.encounters):{}};
    }
    freeze(this.routes);this.reset();
  }
  reset(){this.active=null;this.completed=new Set();this.support=new Set();this.events=[];}
  available({chapter,done}={}) {
    if(this.active)return [];
    return VEHICLE_MISSIONS.filter(m=>m.campaign===this.campaign&&this.routes[m.id]&&!this.completed.has(m.id)&&Number.isInteger(chapter)&&chapter>=m.minChapter&&chapter<=m.maxChapter&&m.after.every(id=>has(done,id)));
  }
  accept(id,context) {
    if(!this.available(context).some(m=>m.id===id))return false;
    const m=byId.get(id);this.active={id,stage:0,routeIndex:0,progress:0,time:0,passengers:0,cargo:null,quiet:true,vehicleHealth:1};
    this.events.push({type:'vehicle_request',id:`${id}:vehicle`,missionId:id,kind:m.vehicle,vehicleType:this.routes[id].vehicleType,spawn:[...this.routes[id].vehicleSpawn],yaw:this.routes[id].vehicleYaw,replace:true,capacity:m.capacity});
    this._enter();return true;
  }
  get current() {
    const a=this.active;if(!a)return null;
    const m=byId.get(a.id),s=m.stages[a.stage],p=this.routes[a.id],route=s.route?p.driveRoutes[s.route]:null;
    return {missionId:a.id,title:m.title,vehicle:m.vehicle,vehicleType:p.vehicleType,def:m,stage:s,...s,siteId:s.site||null,routeId:s.route||null,token:`${a.id}:${s.id}`,point:[...(route?route[a.routeIndex]:p.sites[s.site])],route,walkRoute:p.walkRoutes[s.site]||null,parkingPoint:p.parking[s.site]||route?.at(-1)||null,routeIndex:a.routeIndex,progress:a.progress,fraction:s.seconds?a.progress/s.seconds:route?a.routeIndex/(route.length-1):0,passengers:a.passengers,cargo:a.cargo,historyCard:s.historyCard||m.historyCard};
  }
  update(dt,context={}) {
    const a=this.active;if(!a||context.paused||!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,.1);
    const m=byId.get(a.id),s=m.stages[a.stage],v=context.vehicle,p=this.current.point;
    if(Number.isInteger(context.chapter)&&context.chapter>m.maxChapter){this.abandon('chapter_left');return;}
    if(v&&Number.isFinite(v.hp)&&v.hp<=0){this.abandon('vehicle_destroyed');return;}
    if(context.alerted)a.quiet=false;
    const maxHp=v?.maxHp??v?.profile?.hp;
    if(v&&vehicleKind(v)===m.vehicle&&Number.isFinite(v.hp)&&Number.isFinite(maxHp)&&maxHp>0)a.vehicleHealth=Math.min(a.vehicleHealth,Math.max(0,Math.min(1,v.hp/maxHp)));
    if((s.requires||[]).some(id=>!has(context.done,id))){a.progress=0;return;}
    a.time+=dt;
    const onFoot=!v?.occupied;
    if(s.kind==='drive') {
      if(!v||vehicleKind(v)!==m.vehicle||!v.occupied||(v.seatMode&&v.seatMode!=='drive')||!near(v.pos,p,s.radius))return;
      const route=this.routes[a.id].driveRoutes[s.route];
      if(a.routeIndex===route.length-1)this._advance();
      else {a.routeIndex++;this.events.push({type:'waypoint_changed',missionId:a.id,stageId:s.id,point:[...route[a.routeIndex]],routeIndex:a.routeIndex});}
      return;
    }
    if(s.kind==='clear') {
      if(!near(context.player,p,s.radius))return;
      const token=`${a.id}:${s.id}`;
      if(has(context.cleared,token))this._advance();
      else if(s.allowBypass&&has(context.bypassed,token))this._advance();
      return;
    }
    const vehicleOperation=['repair','loadPassengers','unloadPassengers','parkVehicle'].includes(s.action);
    const vehicleReady=!vehicleOperation||(v&&vehicleKind(v)===m.vehicle&&Math.abs(v.speed||0)<.35&&near(v.pos,p,12));
    const working=onFoot&&near(context.player,p,s.radius)&&!context.hurt&&vehicleReady&&(s.kind==='defend'||(context.held&&(!context.action||context.action===s.action)));
    if(!working){if(s.kind==='operate')a.progress=0;return;}
    a.progress+=dt;
    if(a.progress+1e-6<s.seconds)return;
    if(s.kind==='operate') {
      if(s.effect&&'passengers' in s.effect)a.passengers=s.effect.passengers;
      if(s.effect&&'cargo' in s.effect)a.cargo=s.effect.cargo;
      this.events.push({type:'operation_complete',id:`${a.id}:${s.id}:operate`,missionId:a.id,stageId:s.id,action:s.action,point:[...p],effect:copy(s.effect||{})});
    }
    this._advance();
  }
  operate(action,context={},dt=.1) {
    if(this.current?.kind!=='operate'||this.current.action!==action)return false;
    this.update(dt,{...context,held:true,action});return true;
  }
  _enter() {
    const c=this.current;this.events.push({type:'stage_changed',id:`${c.missionId}:${c.id}:enter`,...c});
    if(c.radio)this.events.push({type:'radio',missionId:c.missionId,text:c.radio});
    if(c.kind==='clear'||c.kind==='defend')this.events.push({type:'encounter_request',id:c.token,missionId:c.missionId,stageId:c.id,kind:c.kind,point:[...c.point],allowBypass:!!c.allowBypass,definition:copy(this.routes[c.missionId].encounters[c.id]||null)});
  }
  _advance() {
    const a=this.active,m=byId.get(a.id);a.stage++;a.routeIndex=0;a.progress=0;
    if(a.stage<m.stages.length){this._enter();return;}
    this.completed.add(a.id);
    const rewards=[m.reward],bonus=m.bonus;
    if(bonus&&((bonus.condition==='quiet'&&a.quiet)||(bonus.condition==='vehicle'&&a.vehicleHealth>=.5)))rewards.push(bonus);
    rewards.forEach(r=>this.support.add(r.id));
    this.events.push({type:'mission_complete',id:`${a.id}:complete`,missionId:a.id,title:m.title,outcome:m.outcome,rewards:copy(rewards),passengers:0,cargo:null});
    this.active=null;
  }
  abandon(reason='abandoned') {
    if(!this.active)return false;
    const m=byId.get(this.active.id);this.events=this.events.filter(e=>e.missionId!==m.id);this.events.push({type:'fallback',id:`${m.id}:fallback`,missionId:m.id,reason,text:m.fallback,passengers:0,cargo:null});this.active=null;return true;
  }
  drainEvents(){const e=this.events;this.events=[];return e;}
  snapshot(){return {version:1,campaign:this.campaign,active:this.active&&copy(this.active),completed:[...this.completed],support:[...this.support]};}
  restore(s) {
    // Old saves have no side story. Malformed or future versions leave current state untouched.
    if(s===undefined||s===null){this.reset();return true;}
    const ms=VEHICLE_MISSIONS.filter(m=>m.campaign===this.campaign),ids=new Set(ms.map(m=>m.id));
    if(s.version!==1||s.campaign!==this.campaign||!Array.isArray(s.completed)||new Set(s.completed).size!==s.completed.length||s.completed.some(id=>!ids.has(id))||!Array.isArray(s.support)||new Set(s.support).size!==s.support.length)return false;
    const allowed=new Set(ms.filter(m=>s.completed.includes(m.id)).flatMap(m=>[m.reward.id,m.bonus?.id].filter(Boolean)));
    if(s.support.some(id=>!allowed.has(id))||ms.some(m=>s.completed.includes(m.id)&&!s.support.includes(m.reward.id)))return false;
    if(s.active!==null) {
      const a=s.active,m=a&&byId.get(a.id);
      if(!m||m.campaign!==this.campaign||!this.routes[a.id]||s.completed.includes(a.id)||!Number.isInteger(a.stage)||a.stage<0||a.stage>=m.stages.length||!Number.isInteger(a.routeIndex)||a.routeIndex<0||!Number.isFinite(a.progress)||a.progress<0||!Number.isFinite(a.time)||a.time<0||!Number.isInteger(a.passengers)||a.passengers<0||a.passengers>m.capacity||typeof a.quiet!=='boolean'||!Number.isFinite(a.vehicleHealth)||a.vehicleHealth<0||a.vehicleHealth>1)return false;
      const stage=m.stages[a.stage],route=stage.route&&this.routes[a.id].driveRoutes[stage.route];
      if(route?a.routeIndex>=route.length:a.routeIndex!==0)return false;
      if(stage.seconds?a.progress>=stage.seconds:a.progress!==0)return false;
      const finished=m.stages.slice(0,a.stage).filter(v=>v.effect),passengers=finished.reduce((n,v)=>v.effect.passengers??n,0),cargo=finished.reduce((n,v)=>'cargo' in v.effect?v.effect.cargo:n,null);
      if(a.passengers!==passengers||a.cargo!==cargo)return false;
    }
    this.active=s.active&&copy(s.active);this.completed=new Set(s.completed);this.support=new Set(s.support);this.events=[];return true;
  }
}
