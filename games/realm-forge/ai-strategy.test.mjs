import test from 'node:test';
import assert from 'node:assert/strict';
import { strategicOrders } from './ai-strategy.mjs';

function unit(id,kind,x,y,team=1,hp=100) {
  const types={foot:{family:'infantry',look:'soldier',role:'melee',range:1.1},bow:{family:'archer',look:'archer',role:'ranged',range:5},horse:{family:'cavalry',look:'knight',role:'melee',range:1.3},siege:{family:'siege',look:'siege',role:'ranged',range:7}};
  return {id,kind:'unit',team,x,y,hp,maxHp:100,blueprint:{hp:100,...types[kind]},order:null};
}
function scenario(army,team=1,origin={x:10,y:10},objective={id:99,x:60,y:10,hp:5000}) {
  const w={map:{size:80,spawns:[{x:60,y:10},origin]},buildings:[{id:90,team,type:'town',hp:5000,progress:1,...origin}],time:0,blocked:()=>false};
  return {w,army,team,objective};
}
const orders=s=>strategicOrders(s.w,s.team,s.army,s.objective);

test('infantry and archers advance together while three healthy cavalry approach from the flank',()=>{
  const army=[unit(1,'foot',20,10),unit(2,'bow',20,11),unit(3,'foot',21,10),unit(4,'horse',12,10),unit(5,'horse',13,10),unit(6,'horse',14,10)],s=scenario(army);
  const before=JSON.stringify({army,buildings:s.w.buildings,objective:s.objective}),plan=orders(s);
  for(const id of [1,2,3])assert.equal(plan.get(id).aiTactic,'advance');
  for(const id of [4,5,6]){const o=plan.get(id);assert.equal(o.aiTactic,'flank');assert.ok(o.y>=15&&o.y<=18);assert.ok(o.x>s.w.buildings[0].x&&o.x<s.objective.x);}
  assert.deepEqual(plan.get(4),plan.get(5));assert.equal(JSON.stringify({army,buildings:s.w.buildings,objective:s.objective}),before);
});

test('cavalry finish the flank waypoint then keep advancing instead of circling back',()=>{
  const s=scenario([unit(1,'horse',12,10),unit(2,'horse',13,10),unit(3,'horse',14,10)]),first=orders(s);
  for(const u of s.army){u.order=first.get(u.id);u.x=u.order.x;u.y=u.order.y;}
  const second=orders(s);for(const u of s.army){assert.equal(second.get(u.id).aiTactic,'advance');assert.equal(second.get(u.id).aiFlankPassed,true);u.order=second.get(u.id);u.x+=4;}
  for(const o of orders(s).values())assert.equal(o.aiTactic,'advance');
});

test('too few healthy cavalry rejoin the main route and nearby threats do not trigger a distant flank',()=>{
  const s=scenario([unit(1,'horse',12,10),unit(2,'horse',13,10),unit(3,'horse',14,10,1,60)]);
  for(const o of orders(s).values())assert.equal(o.aiTactic,'advance');
  s.army[2].hp=100;s.objective={id:100,x:17,y:10,hp:100};
  for(const o of orders(s).values())assert.equal(o.aiTactic,'advance');
});

test('allied teams choose opposite fixed sides and blocked or edge waypoints stay legal',()=>{
  const first=scenario([unit(1,'horse',12,10),unit(2,'horse',13,10),unit(3,'horse',14,10)]),second=scenario(first.army.map(u=>({...u,team:2})),2);
  assert.ok(orders(first).get(1).y>10);assert.ok(orders(second).get(1).y<10);
  first.w.blocked=(x,y)=>x>=31&&x<=37&&y>=14&&y<=20;
  for(const o of orders(first).values())assert.equal(o.aiTactic,'advance');
  const edge=scenario([unit(1,'horse',1,2),unit(2,'horse',2,2),unit(3,'horse',2,3)],1,{x:1,y:1},{id:99,x:2,y:70,hp:5000});
  for(const o of orders(edge).values())assert.ok(o.x>=0&&o.y>=0&&o.x<80&&o.y<80);
});

test('isolated reinforcements rally, then three nearby units leave as a group',()=>{
  const s=scenario([unit(1,'foot',40,10),unit(2,'bow',41,11),unit(3,'foot',42,9),unit(4,'foot',11,10),unit(5,'bow',12,10)]),first=orders(s);
  assert.equal(first.get(4).aiTactic,'rally');assert.equal(first.get(5).aiTactic,'rally');
  for(const id of [4,5]){const u=s.army.find(u=>u.id===id);u.order=first.get(id);u.x=u.order.x;u.y=u.order.y;}
  s.army.push(unit(6,'foot',s.army[3].x+.5,s.army[3].y));
  const released=orders(s);for(const id of [4,5,6]){assert.equal(released.get(id).aiTactic,'advance');assert.equal(released.get(id).aiRallyReleased,true);}
});

test('a rally still releases after its arrival order clears, including a full army with no new recruits',()=>{
  const s=scenario([unit(1,'foot',40,10),unit(2,'bow',41,11),unit(3,'foot',42,9),unit(4,'foot',11,10)]),waiting=orders(s).get(4),recruit=s.army[3];
  recruit.x=waiting.x;recruit.y=waiting.y;recruit.order=null;s.w.time=13;
  const released=orders(s).get(4);assert.equal(released.aiTactic,'advance');
  recruit.order=released;s.w.time=17;assert.equal(orders(s).get(4).aiTactic,'advance');
});

test('siege remains behind the moving main force until it reaches firing range',()=>{
  const s=scenario([unit(1,'foot',35,10),unit(2,'bow',36,11),unit(3,'foot',37,9),unit(4,'siege',15,10)]),first=orders(s).get(4);
  assert.equal(first.aiTactic,'escort');assert.equal(first.type,'attackMove');assert.ok(first.x<35);
  const engine=s.army[3];engine.order=first;engine.x=first.x;engine.y=first.y;
  assert.equal(orders(s).get(4).aiTactic,'escort');
  for(const u of s.army.slice(0,3))u.x+=10;
  assert.ok(orders(s).get(4).x>first.x);engine.x=52;
  assert.equal(orders(s).get(4).aiTactic,'advance');
});

test('failed flank orders and old saves with partial metadata produce usable finite waypoints',()=>{
  const s=scenario([unit(1,'horse',12,10),unit(2,'horse',13,10),unit(3,'horse',14,10)]);
  s.army[0].order={type:'attackMove',aiTactic:'flank',aiObjective:99,x:34,y:17};s.army[0].failed=true;
  assert.equal(orders(s).get(1).aiTactic,'advance');
  s.army[0].failed=false;s.army[0].order={aiTactic:'flank',aiObjective:99};
  for(const o of orders(s).values())assert.ok(Number.isFinite(o.x)&&Number.isFinite(o.y));
  assert.equal(strategicOrders(s.w,1,s.army,null).size,0);
});

test('planning a crowded army uses a fixed number of terrain probes without invoking route search',()=>{
  const s=scenario(Array.from({length:300},(_,i)=>unit(i+1,i%4?'foot':'horse',12+(i%12)*.1,10+Math.floor(i/12)*.1)));let probes=0;
  s.w.blocked=()=>{probes++;return false;};s.w.nearestOpen=()=>{throw new Error('planner must not search routes');};
  assert.equal(orders(s).size,300);assert.ok(probes<250,`terrain probes: ${probes}`);
});
