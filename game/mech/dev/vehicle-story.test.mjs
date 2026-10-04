import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VehicleStory, VEHICLE_MISSIONS, validateVehicleRoute } from '../zero/vehicle-story.mjs';
import { VEHICLE_ROUTES } from '../zero/vehicle-routes.mjs';
import { historyCard } from '../kobe-history.mjs';

const fixture=()=>Object.fromEntries(VEHICLE_MISSIONS.map(m=>[m.id,{vehicleSpawn:[0,0,0],sites:Object.fromEntries(m.stages.filter(s=>s.site).map((s,i)=>[s.site,[i*20,0,10]])),driveRoutes:Object.fromEntries(m.stages.filter(s=>s.route).map((s,i)=>[s.route,[[i*20,0,0],[i*20+10,0,0],[i*20+20,0,0]]]))}]));
const context=m=>({chapter:m.minChapter,done:new Set([...m.after,'G1']),player:[0,0,0],vehicle:{kind:m.vehicle,pos:[0,0,0],occupied:false,hp:100,maxHp:100},held:true,cleared:new Set(),bypassed:new Set()});
const finishStage=(story,ctx,{bypass=false}={})=>{
  const c=story.current;ctx.player=[...c.point];ctx.vehicle.pos=[...c.point];ctx.vehicle.occupied=c.kind==='drive';
  if(c.kind==='clear')(bypass&&c.stage.allowBypass?ctx.bypassed:ctx.cleared).add(c.token);
  for(let i=0;i<Math.max(Math.ceil((c.stage.seconds||.1)/.1)+1,c.route?.length||0)&&story.current?.id===c.id;i++) {
    if(c.kind==='drive'){ctx.vehicle.pos=[...story.current.point];ctx.player=[...ctx.vehicle.pos];}
    story.update(.1,ctx);
  }
};

test('支線只在對應里程碑後解鎖，跨步兵章仍可接，且只允許一台活動車',()=>{
  const s=new VehicleStory({campaign:'zero',routes:fixture()}),done=new Set(['D1']);
  assert.deepEqual(s.available({chapter:1,done}),[]);assert.deepEqual(s.available({chapter:2,done:new Set()}),[]);
  assert.deepEqual(s.available({chapter:5,done}).map(m=>m.id),['zero_patrol']);
  assert(!s.accept('lastline_manifest',{chapter:2,done}));assert(s.accept('zero_patrol',{chapter:2,done}));
  assert(!s.accept('zero_kitano',{chapter:3,done:new Set(['I2'])}));
  assert.equal(s.drainEvents().filter(e=>e.type==='vehicle_request').length,1);assert.deepEqual([...done],['D1']);
  assert.equal(s.current.def.id,'zero_patrol');assert.equal(s.current.stage.action,'repair');assert.equal(s.current.historyCard,'port-opening');
});

test('修理需要下車、同車型與實際站點；中斷及非法時間不會遠距操作',()=>{
  const m=VEHICLE_MISSIONS[0],s=new VehicleStory({routes:fixture()}),c=context(m);s.accept(m.id,c);s.drainEvents();
  c.player=[...s.current.point];c.vehicle.pos=[...s.current.point];
  for(const dt of [NaN,Infinity,-1,0])s.update(dt,c);assert.equal(s.current.progress,0);
  c.vehicle.occupied=true;s.update(1,c);assert.equal(s.current.progress,0);
  c.vehicle.occupied=false;c.vehicle.kind='apc';s.update(.1,c);assert.equal(s.current.progress,0);
  c.vehicle.kind='4x4';assert(!s.operate('openGate',c));assert(s.operate('repair',c));assert.equal(s.current.progress,.1);
  c.player[0]+=30;s.update(.1,c);assert.equal(s.current.progress,0);c.player=[...s.current.point];
  s.update(100,c);assert.equal(s.current.progress,.1);c.hurt=true;s.update(.1,c);assert.equal(s.current.progress,0);
  c.hurt=false;c.player[1]+=4;s.update(.1,c);assert.equal(s.current.progress,0);
});

test('駕駛逐一核對世界路點，不以步行、樓上投影或終點瞬移跳過路線',()=>{
  const m=VEHICLE_MISSIONS[0],s=new VehicleStory({routes:fixture()}),c=context(m);s.accept(m.id,c);finishStage(s,c);s.drainEvents();
  assert.equal(s.current.kind,'drive');const points=s.current.route;
  c.vehicle.occupied=true;c.vehicle.pos=points.at(-1);s.update(.1,c);assert.equal(s.current.routeIndex,0);
  c.vehicle.pos=points[0];c.vehicle.occupied=false;s.update(.1,c);assert.equal(s.current.routeIndex,0);
  c.vehicle.occupied=true;c.vehicle.pos=[points[0][0],4,points[0][2]];s.update(.1,c);assert.equal(s.current.routeIndex,0);
  c.vehicle.pos=points[0];s.update(.1,c);assert.equal(s.current.routeIndex,1);
  assert.equal(s.current.routeId,'patrol');assert(s.drainEvents().some(e=>e.type==='waypoint_changed'));
  finishStage(s,c);assert.equal(s.current.kind,'clear');
});

test('五段支線均可完整操作、接送與守點；主線 IDs 與既有撤離人數不被改寫',()=>{
  for(const m of VEHICLE_MISSIONS) {
    assert.equal(new Set(m.stages.map(s=>s.id)).size,m.stages.length,m.id+' 各階段使用不同的守軍／互動識別碼');
    const s=new VehicleStory({campaign:m.campaign,routes:fixture()}),c=context(m),original=[...c.done],events=[];
    assert(s.accept(m.id,c));events.push(...s.drainEvents());
    for(let guard=0;s.current&&guard<30;guard++){finishStage(s,c,{bypass:true});events.push(...s.drainEvents());}
    assert.equal(s.current,null,m.id);assert.deepEqual([...c.done],original);assert(s.completed.has(m.id));
    assert.equal(events.filter(e=>e.type==='vehicle_request').length,1);
    const end=events.filter(e=>e.type==='mission_complete');assert.equal(end.length,1);assert.equal(end[0].passengers,0);assert(s.support.has(m.reward.id));
    assert(!s.accept(m.id,c));assert(events.some(e=>e.type==='operation_complete'));
    if(m.id==='lastline_manifest'){assert(m.offer.includes('六十四'));assert(m.outcome.includes('兩輛'));}
    if(m.id==='zero_kitano')assert(m.outcome.includes('隼的錄音'));
  }
});

test('守點核對原主線前提，暫停與離點不累積，未清敵不能跳過',()=>{
  const m=VEHICLE_MISSIONS.find(m=>m.id==='lastline_shuttle'),s=new VehicleStory({campaign:'lastline',routes:fixture()}),c=context(m);s.accept(m.id,c);
  while(s.current.kind!=='defend')finishStage(s,c);
  c.done.delete('F3');c.player=[...s.current.point];c.vehicle.occupied=false;s.update(10,c);assert.equal(s.current.progress,0);
  c.done.add('F3');s.update(.1,c);assert.equal(s.current.progress,.1);
  c.paused=true;s.update(10,c);assert.equal(s.current.progress,.1);c.paused=false;c.player[0]+=30;s.update(.1,c);assert.equal(s.current.progress,.1);
  const patrol=new VehicleStory({routes:fixture()}),pc=context(VEHICLE_MISSIONS[0]);patrol.accept('zero_patrol',pc);finishStage(patrol,pc);finishStage(patrol,pc);
  pc.player=[...patrol.current.point];pc.cleared.add('D');patrol.update(.1,pc);assert.equal(patrol.current.kind,'clear');
});

test('損毀、放棄與進入機體章清掉支線請求，提供步行退路且可重新接取',()=>{
  for(const reason of ['vehicle_destroyed','abandoned','chapter_left']) {
    const m=VEHICLE_MISSIONS[0],s=new VehicleStory({routes:fixture()}),c=context(m);s.accept(m.id,c);
    if(reason==='abandoned')s.abandon();else {if(reason==='vehicle_destroyed')c.vehicle.hp=0;else c.chapter=6;s.update(.1,c);}
    assert.equal(s.current,null);const e=s.drainEvents();assert.deepEqual(e.map(e=>e.type),['fallback']);assert.equal(e[0].reason,reason);assert(e[0].text.includes('步行'));
    assert.equal(s.completed.size,0);assert.equal(s.support.size,0);assert(s.accept(m.id,context(m)));
  }
});

test('中途接送與路點可無副作用序列化；舊存檔預設、跨作品及損壞資料不污染狀態',()=>{
  const m=VEHICLE_MISSIONS[1],s=new VehicleStory({routes:fixture()}),c=context(m);s.accept(m.id,c);finishStage(s,c);s.drainEvents();
  c.vehicle.occupied=true;c.vehicle.pos=[...s.current.point];s.update(.1,c);s.drainEvents();
  const snapshot=JSON.parse(JSON.stringify(s.snapshot())),r=new VehicleStory({routes:fixture()});assert(r.restore(snapshot));assert.deepEqual(r.snapshot(),snapshot);assert.deepEqual(r.drainEvents(),[]);assert.equal(r.current.passengers,2);
  for(const bad of [{...snapshot,version:2},{...snapshot,campaign:'lastline'},{...snapshot,completed:['zero_kitano']},{...snapshot,support:['ground-crew']},{...snapshot,active:{...snapshot.active,passengers:4}},{...snapshot,active:{...snapshot.active,routeIndex:999}},{...snapshot,active:{...snapshot.active,progress:NaN}},{...snapshot,active:{...snapshot.active,cargo:'fake'}}]){assert(!r.restore(bad));assert.deepEqual(r.snapshot(),snapshot);}
  while(r.current)finishStage(r,c);const completed=r.snapshot(),r2=new VehicleStory({routes:fixture()});assert(r2.restore(completed));assert.deepEqual(r2.snapshot(),completed);assert.deepEqual(r2.drainEvents(),[]);
  assert(r2.restore(undefined));assert.equal(r2.completed.size,0);assert.equal(r2.current,null);
});

test('未提供道路包的任務不開啟，有限三維座標檢查與輸入副本防止外部變動',()=>{
  const f=fixture(),s=new VehicleStory({routes:f}),c=context(VEHICLE_MISSIONS[0]);assert(s.accept('zero_patrol',c));const before=s.current.point;
  f.zero_patrol.sites.repair[0]+=500;assert.deepEqual(s.current.point,before);
  assert.deepEqual(new VehicleStory().available(c),[]);assert(!validateVehicleRoute('zero_patrol',{}));
  const bad=fixture();bad.zero_patrol.driveRoutes.patrol[0]=[NaN,0,0];assert.throws(()=>new VehicleStory({routes:bad}));
});

test('已驗證世界路線包與所有支線對齊，原生巡邏車介面及北野步行導引可用',()=>{
  for(const m of VEHICLE_MISSIONS) {
    assert(validateVehicleRoute(m.id,VEHICLE_ROUTES[m.id]),m.id);
    const s=new VehicleStory({campaign:m.campaign,routes:VEHICLE_ROUTES}),c=context(m);
    c.vehicle={type:m.vehicle==='4x4'?'patrol':'apc',pos:[...VEHICLE_ROUTES[m.id].vehicleSpawn],hp:320,profile:{hp:320},occupied:false,speed:0};
    assert(s.accept(m.id,c));const spawn=s.drainEvents().find(e=>e.type==='vehicle_request');assert.equal(spawn.vehicleType,c.vehicle.type);assert.equal(spawn.yaw,VEHICLE_ROUTES[m.id].vehicleYaw);
    for(let guard=0;s.current&&guard<30;guard++) {
      const current=s.current;c.player=[...current.point];c.vehicle.occupied=current.kind==='drive';
      if(current.kind==='clear')c.cleared.add(current.token);
      if(current.id==='garden'){assert(current.walkRoute.length>2);assert.deepEqual(current.walkRoute.at(-1),current.point);assert(current.parkingPoint[1]<current.point[1]);}
      for(let i=0;i<Math.max(Math.ceil((current.stage.seconds||.1)/.1)+1,current.route?.length||0)&&s.current?.id===current.id;i++) {
        c.vehicle.pos=[...(s.current.kind==='drive'?s.current.point:s.current.parkingPoint||s.current.point)];s.update(.1,c);
      }
    }
    assert.equal(s.current,null,m.id);assert(s.completed.has(m.id));
  }
});

test('支援只給小額一次性完成事件，驚動與低車況取消相應額外獎勵',()=>{
  for(const id of ['zero_patrol','zero_kitano']) {
    const m=VEHICLE_MISSIONS.find(m=>m.id===id),s=new VehicleStory({routes:fixture()}),c=context(m);s.accept(id,c);s.drainEvents();
    c.alerted=true;c.vehicle.hp=45;const events=[];
    while(s.current){finishStage(s,c);events.push(...s.drainEvents());}
    const completion=events.find(e=>e.type==='mission_complete');assert.deepEqual(completion.rewards.map(r=>r.id),[m.reward.id]);assert.equal(s.support.size,1);
    s.update(1,c);assert.deepEqual(s.drainEvents(),[]);
  }
});

test('支線史實連到已核對圖鑑，實際階段有簡短在地說明且標明架空故事',()=>{
  for(const m of VEHICLE_MISSIONS){assert.equal(m.setting,'fiction');assert(historyCard(m.historyCard));m.stages.forEach(s=>{if(s.historyCard)assert(historyCard(s.historyCard));});}
  assert(VEHICLE_MISSIONS[0].stages.some(s=>s.radio.includes('一八六八')));
  assert(VEHICLE_MISSIONS[1].stages.some(s=>s.radio.includes('洋風與和風')));
  assert(VEHICLE_MISSIONS[2].stages.some(s=>s.radio.includes('一九九五年一月十七日是震災，不是戰爭')));
  assert(VEHICLE_MISSIONS[3].stages.some(s=>s.radio.includes('一八七四')));
  assert(VEHICLE_MISSIONS[4].stages.some(s=>s.radio.includes('協議會')));
});
