import test from 'node:test';
import assert from 'node:assert/strict';
import { World, defaultProject, generateMap, clone } from './core.mjs';

function setup() {
  const p=defaultProject();p.map=generateMap(128);p.map.tiles.fill('grass');
  Object.assign(p.rules,{ai:'off',fog:false,startAge:0});
  const w=new World(p);for(const u of w.units)u.stance='passive';return w;
}
function troop(w,team,point,id='swordsman') {
  const u=w.spawn(id,team,point);assert.ok(u);u.stance='aggressive';return u;
}
function staleSearch(w,u) {
  w.routeSearches ||= new Map();
  w.routeSearches.set(u.id,{step(){assert.fail('A superseded combat route must not be reused');}});
}
function until(w,condition,seconds=3) {
  for(let i=0;i<seconds*20&&!condition();i++)w.tick(.05);
  assert.ok(condition());
}

test('an AI unit counterattacks while preserving its building objective and queued orders',()=>{
  const w=setup(),victim=troop(w,1,{x:30,y:30}),attacker=troop(w,0,{x:31,y:30});attacker.stance='passive';
  const town=w.buildings.find(b=>b.team===0&&b.type==='town');
  w.command([victim.id],{type:'attack',target:town.id,aiObjective:town.id});
  w.command([victim.id],{type:'move',x:50,y:30},true);
  const order=clone(victim.order),queued=clone(victim.queued);
  victim.path=[{x:30,y:40}];victim.pathGoal={x:town.x,y:town.y,radius:1};staleSearch(w,victim);
  w.strike(attacker,victim,attacker.blueprint.attack,attacker.blueprint.range,attacker.blueprint.cooldown);
  assert.equal(victim.recentAttacker,attacker.id);assert.equal(victim.recentAttackAt,w.time);
  assert.equal(victim.autoTarget,attacker.id);assert.equal(victim.pathGoal,null);assert.equal(w.routeSearches.has(victim.id),false);
  assert.deepEqual(victim.order,order);assert.deepEqual(victim.queued,queued);
  until(w,()=>attacker.hp<attacker.maxHp);
  assert.deepEqual(victim.order,order);assert.deepEqual(victim.queued,queued);
});

test('dead, garrisoned or newly allied automatic targets release their routes and resume movement',()=>{
  for(const invalid of ['dead','garrisoned','allied']) {
    const w=setup(),victim=troop(w,1,{x:30,y:30}),attacker=troop(w,0,{x:38,y:30});
    w.command([victim.id],{type:'attackMove',x:50,y:30});w.retaliate(victim,attacker);
    victim.pathGoal={x:attacker.x,y:attacker.y,radius:victim.blueprint.range};staleSearch(w,victim);
    if(invalid==='dead')attacker.hp=0;
    else if(invalid==='garrisoned')attacker.garrison=999;
    else attacker.team=2;
    w.tick(.05);
    assert.equal(victim.autoTarget,null,invalid);assert.equal(w.routeSearches.has(victim.id),false,invalid);
    assert.equal(victim.order.type,'attackMove',invalid);assert.ok(victim.x>30,invalid);
    assert.deepEqual(victim.pathGoal,{x:50,y:30,radius:.2},invalid);
  }
});

test('hostile hits record danger without replacing move, player precision or passive orders',()=>{
  for(const mode of ['move','playerAttack','passive','worker','trader','retreat','kite']) {
    const w=setup(),team=mode==='playerAttack'?0:1,id=mode==='worker'?'villager':mode==='trader'?'trade-cart':'swordsman';
    const victim=troop(w,team,{x:30,y:30},id),attacker=troop(w,team===0?1:0,{x:31,y:30});
    if(mode==='playerAttack')w.command([victim.id],{type:'attack',target:w.buildings.find(b=>b.team===1&&b.type==='town').id});
    else if(['move','retreat','kite'].includes(mode))w.command([victim.id],{type:'move',x:50,y:30,...(mode==='retreat'?{aiRetreat:true}:mode==='kite'?{aiKite:true}:{})});
    if(['passive','retreat','kite'].includes(mode))victim.stance='passive';
    victim.path=[{x:40,y:30}];victim.pathGoal={x:50,y:30,radius:.2};
    const order=clone(victim.order),path=victim.path,goal=victim.pathGoal;
    w.strike(attacker,victim,1,1,1);
    assert.equal(victim.recentAttacker,attacker.id,mode);assert.ok(victim.autoTarget==null,mode);
    assert.deepEqual(victim.order,order,mode);assert.equal(victim.path,path,mode);assert.equal(victim.pathGoal,goal,mode);
  }
});

test('repeated hits and another nearby opponent preserve an existing military engagement',()=>{
  const w=setup(),victim=troop(w,1,{x:30,y:30}),first=troop(w,0,{x:31,y:30}),second=troop(w,0,{x:32,y:30});
  w.command([victim.id],{type:'attackMove',x:50,y:30});w.retaliate(victim,first);
  victim.path=[{x:31,y:30}];victim.pathGoal={x:31,y:30,radius:1};const path=victim.path,goal=victim.pathGoal;
  w.retaliate(victim,first);assert.equal(victim.path,path);assert.equal(victim.pathGoal,goal);
  w.time=2;w.retaliate(victim,second);
  assert.equal(victim.autoTarget,first.id);assert.equal(victim.recentAttacker,second.id);assert.equal(victim.recentAttackAt,2);
  assert.equal(victim.path,path);assert.equal(victim.pathGoal,goal);
});

test('allied enemy kingdoms take siege splash without retaliating against their ally',()=>{
  const w=setup(),siege=troop(w,1,{x:30,y:30},'mangonel'),target=troop(w,0,{x:35,y:30},'knight'),ally=troop(w,2,{x:35,y:30.4},'knight');
  ally.recentAttacker=target.id;ally.recentAttackAt=7;
  w.strike(siege,target,siege.blueprint.attack,siege.blueprint.range,siege.blueprint.cooldown);
  assert.ok(target.hp<target.maxHp);assert.ok(ally.hp<ally.maxHp);
  assert.ok(ally.autoTarget==null);assert.equal(ally.recentAttacker,target.id);assert.equal(ally.recentAttackAt,7);
  assert.equal(target.recentAttacker,siege.id);
});

test('ground attack damage triggers hostile response while respecting allied splash',()=>{
  const w=setup(),siege=troop(w,0,{x:30,y:30},'mangonel'),enemy=troop(w,1,{x:35,y:30},'knight'),ally=troop(w,0,{x:35,y:30.4},'knight');
  siege.stance='passive';ally.stance='passive';w.command([siege.id],{type:'attackGround',x:35,y:30});
  w.tick(.05);
  assert.ok(enemy.hp<enemy.maxHp);assert.ok(ally.hp<ally.maxHp);
  assert.equal(enemy.recentAttacker,siege.id);assert.equal(enemy.autoTarget,siege.id);
  assert.ok(ally.autoTarget==null);assert.equal(ally.recentAttacker,undefined);
});

test('a legacy battle with no danger metadata gains counterattacks and preserves them on saving',()=>{
  const w=setup(),victim=troop(w,1,{x:30,y:30}),attacker=troop(w,0,{x:31,y:30});attacker.stance='passive';
  const town=w.buildings.find(b=>b.team===0&&b.type==='town');w.command([victim.id],{type:'attack',target:town.id});
  const old=JSON.parse(JSON.stringify(w.saveState()));for(const u of old.units){delete u.recentAttacker;delete u.recentAttackAt;}
  const loaded=World.fromState(old),v=loaded.entity(victim.id),a=loaded.entity(attacker.id);
  loaded.strike(a,v,1,1,1);assert.equal(v.autoTarget,a.id);assert.equal(v.order.target,town.id);
  const restored=World.fromState(JSON.parse(JSON.stringify(loaded.saveState()))),r=restored.entity(v.id);
  assert.equal(r.recentAttacker,a.id);assert.equal(r.recentAttackAt,loaded.time);assert.equal(r.autoTarget,a.id);
  until(restored,()=>restored.entity(a.id).hp<a.maxHp);assert.equal(r.order.target,town.id);
});

test('saved passive tactical movements continue after a hit without being pulled into combat',()=>{
  for(const kind of ['aiRetreat','aiKite']) {
    const w=setup(),victim=troop(w,1,{x:30,y:30}),attacker=troop(w,0,{x:31,y:30});attacker.stance='passive';
    victim.stance='passive';victim[kind]={resume:{type:'attackMove',x:50,y:50},stance:'aggressive',...(kind==='aiRetreat'?{anchor:w.buildings.find(b=>b.team===1).id,started:0}:{until:2})};
    w.command([victim.id],{type:'move',x:40,y:30,[kind]:true});
    const loaded=World.fromState(JSON.parse(JSON.stringify(w.saveState()))),v=loaded.entity(victim.id),a=loaded.entity(attacker.id),state=clone(v[kind]);
    loaded.strike(a,v,1,1,1);loaded.tick(.1);
    assert.equal(v.autoTarget,null);assert.equal(v.order.type,'move');assert.equal(v.order[kind],true);
    assert.deepEqual(v[kind],state);assert.equal(v.stance,'passive');assert.ok(v.x>30);
  }
});
