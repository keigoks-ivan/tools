import test from 'node:test';
import assert from 'node:assert/strict';
import { World, defaultProject, generateMap, BUILDINGS, setTile } from './core.mjs';

function setup() {
  const project = defaultProject();
  project.map = generateMap(1280);
  project.map.template = 'grass';
  project.map.patches = {};
  Object.assign(project.rules, { ai: 'off', starting: 2000, startAge: 4, victory: 'conquest' });
  const world = new World(project), worker = world.units.find(u => u.team === 0 && u.blueprint.role === 'worker');
  return { world, worker, town: world.buildings.find(b => b.team === 0 && b.type === 'town') };
}
function until(world, predicate, seconds = 150) {
  for (let i = 0; i < seconds * 10 && !predicate(); i++) world.tick(.1);
  assert.ok(predicate(), `Condition not met after ${seconds} game seconds`);
}

test('builders continue nearby unfinished foundations without a Shift queue', () => {
  const { world, worker } = setup();
  const a = world.addBuilding('house', 0, worker.x + 5, worker.y + 3);
  const b = world.addBuilding('house', 0, worker.x + 8, worker.y + 3);
  world.command([worker.id], { type: 'build', target: b.id });
  until(world, () => a.progress === 1 && b.progress === 1);
});
test('explicit queued work takes priority over automatic nearby construction', () => {
  const { world, worker } = setup();
  const a = world.addBuilding('house', 0, worker.x + 5, worker.y + 3);
  const b = world.addBuilding('house', 0, worker.x + 8, worker.y + 3);
  const destination = { x: worker.x + 4, y: worker.y - 6 };
  world.command([worker.id], { type: 'build', target: a.id });
  world.command([worker.id], { type: 'move', ...destination }, true);
  until(world, () => a.progress === 1);
  assert.equal(worker.order?.type, 'move');
  assert.equal(b.progress, 0);
  until(world, () => !worker.order);
  assert.ok(Math.hypot(worker.x - destination.x, worker.y - destination.y) < .25);
});
test('Shift queued foundations are constructed in order', () => {
  const { world, worker } = setup();
  assert.equal(world.build([worker.id], 'house', worker.x + 5, worker.y + 3), null);
  const first = world.buildings.at(-1);
  assert.equal(world.build([worker.id], 'house', worker.x + 8, worker.y + 3, true), null);
  const second = world.buildings.at(-1);
  until(world, () => first.progress === 1);
  assert.equal(worker.order?.target, second.id);
  until(world, () => second.progress === 1);
});
test('all builders leave a completed building and continue, including workers who did not finish the last tick', () => {
  const { world, worker } = setup();
  const workers = world.units.filter(u => u.team === 0 && u.blueprint.role === 'worker');
  const first = world.addBuilding('house', 0, worker.x + 5, worker.y + 3);
  const second = world.addBuilding('house', 0, worker.x + 8, worker.y + 3);
  world.command(workers.map(u => u.id), { type: 'build', target: first.id });
  until(world, () => first.progress === 1 && second.progress === 1);
});
test('stopping a builder does not automatically restart nearby construction', () => {
  const { world, worker } = setup();
  const foundation = world.addBuilding('house', 0, worker.x + 5, worker.y + 3);
  world.command([worker.id], { type: 'build', target: foundation.id });
  world.command([worker.id], null);
  for (let i = 0; i < 30; i++) world.tick(.1);
  assert.equal(foundation.progress, 0);
  assert.equal(worker.order, null);
});
test('one farmer stays on each completed farm while other builders finish the remaining farms', () => {
  const { world, worker } = setup();
  const workers = world.units.filter(u => u.team === 0 && u.blueprint.role === 'worker');
  const farms = [5, 9, 13].map(dx => world.addBuilding('farm', 0, worker.x + dx, worker.y + 3));
  for (const farm of farms) world.command(workers.map(u => u.id), { type: 'build', target: farm.id }, farm !== farms[0]);
  until(world, () => farms.every(b => b.progress === 1));
  for (let i = 0; i < 15; i++) world.tick(.1);
  for (const farm of farms) assert.equal(workers.filter(u => u.order?.target === farm.id || u.order?.resume?.target === farm.id).length, 1);
});
test('a completed resource camp deposits carried resources and starts gathering the matching resource', () => {
  const { world, worker } = setup();
  const camp = world.addBuilding('lumber', 0, worker.x + 4, worker.y + 3);
  setTile(world.map, worker.x + 7, worker.y + 3, 'forest');
  const before = world.stocks[0].wood;
  worker.carried = 10; worker.carrying = 'wood';
  world.command([worker.id], { type: 'build', target: camp.id });
  until(world, () => camp.progress === 1);
  assert.equal(world.stocks[0].wood, before + 10);
  assert.equal(worker.carried, 0);
  assert.equal(worker.order?.type, 'gather');
  assert.equal(world.tile(worker.order.x, worker.order.y), 'forest');
});
test('destroying a town center does not defeat surviving villagers in Conquest', () => {
  const { world, town } = setup();
  town.hp = 0; world.tick(.1);
  assert.equal(world.result, null);
});
test('a destroyed team with only walls and towers remaining is defeated', () => {
  const { world, worker } = setup();
  world.addBuilding('tower', 0, worker.x + 8, worker.y + 3, true);
  world.units.filter(u => u.team === 0).forEach(u => { u.hp = 0; });
  world.buildings.filter(b => b.team === 0 && b.type !== 'tower').forEach(b => { b.hp = 0; });
  world.tick(.1);
  assert.equal(world.result, 'defeat');
});
test('a house provides five population slots', () => {
  assert.equal(BUILDINGS.house.pop, 5);
  assert.equal(BUILDINGS.town.pop, 5);
});
test('training can be queued at the population cap and waits without advancing', () => {
  const { world, town } = setup();
  world.project.rules.population = world.population(0);
  assert.equal(world.train(town.id, 'villager'), null);
  const left = town.queue[0].left;
  world.tick(1);
  assert.equal(town.queue[0].left, left);
  world.units.find(u => u.team === 0).hp = 0;
  until(world, () => town.queue.length === 0);
});
test('a technology cannot be researched in two buildings for the same team', () => {
  const { world, worker } = setup();
  world.researched[0].delete('loom'); world.modCache = null;
  const towns = [world.buildings.find(b => b.team === 0), world.addBuilding('town', 0, worker.x + 10, worker.y + 3, true)];
  assert.equal(world.research(towns[0].id, 'loom'), null);
  const gold = world.stocks[0].gold;
  assert.ok(world.research(towns[1].id, 'loom'));
  assert.equal(world.stocks[0].gold, gold);
});
test('cancelling research refunds its resources exactly once', () => {
  const { world, town } = setup();
  world.researched[0].delete('loom');
  const gold = world.stocks[0].gold;
  assert.equal(world.research(town.id, 'loom'), null);
  assert.equal(world.cancelResearch(town.id), null);
  assert.equal(world.stocks[0].gold, gold);
  assert.ok(world.cancelResearch(town.id));
  assert.equal(world.stocks[0].gold, gold);
});

test('auto scouting explores new terrain and manual orders replace it', () => {
  const { world } = setup(); const scout=world.units.find(u=>u.team===0&&u.blueprint.id==='scout');
  const start={x:scout.x,y:scout.y};world.command([scout.id],{type:'autoScout'});
  for(let i=0;i<80;i++) world.tick(.1);
  assert.ok(Math.hypot(scout.x-start.x,scout.y-start.y)>2);
  world.command([scout.id],{type:'move',x:start.x,y:start.y});assert.equal(scout.order.type,'move');
});
test('attack ground hits units around its coordinates and stop ends firing', () => {
  const { world, worker }=setup();const engine=world.spawn('mangonel',0,{x:worker.x+3,y:worker.y+5});
  const victim=world.units.find(u=>u.team===1&&u.blueprint.role==='worker');Object.assign(victim,{x:engine.x+3,y:engine.y});
  world.command([engine.id],{type:'attackGround',x:victim.x,y:victim.y});world.tick(.1);
  assert.ok(victim.hp<victim.maxHp);world.command([engine.id],null);assert.equal(engine.order,null);
});
test('fog updates clear lost sight while preserving explored terrain', () => {
  const { world, worker }=setup();world.project.rules.fog=true;world.updateVision();
  const x=Math.round(worker.x),y=Math.round(worker.y),old=y*world.map.size+x;
  for(const u of world.units.filter(u=>u.team===0)) Object.assign(u,{x:x+30,y:y+30});
  for(const b of world.buildings.filter(b=>b.team===0)) Object.assign(b,{x:x+30,y:y+30});
  world.updateVision();assert.equal(world.visible[old],0);assert.equal(world.explored[old],1);
  assert.equal(world.visible[(y+30)*world.map.size+x+30],1);
});

test('dragged wall foundations retain every segment in the construction queue',()=>{
  const {world,worker}=setup();const result=world.buildWall([worker.id],{x:worker.x+5,y:worker.y+3},{x:worker.x+8,y:worker.y+3});
  assert.equal(result.error,null);assert.equal(result.count,4);assert.equal(worker.queued.length,3);
  until(world,()=>world.buildings.filter(b=>b.type==='wall').every(b=>b.progress===1));
  assert.equal(world.buildings.filter(b=>b.type==='wall'&&b.progress===1).length,4);
});

test('a new command or stop clears an obsolete unreachable warning', () => {
  const {world,worker}=setup();worker.failed=true;
  world.command([worker.id],{type:'move',x:worker.x+3,y:worker.y});
  assert.equal(worker.failed,false);
  worker.failed=true;world.command([worker.id],null);
  assert.equal(worker.failed,false);
});
test('any completed drop site or farm deposits builders carried resources in their original type', () => {
  for (const type of ['lumber','mining','mill','farm']) {
    const {world,worker}=setup();const before=world.stocks[0].gold;
    worker.carried=12;worker.carrying='gold';
    const b=world.addBuilding(type,0,worker.x+5,worker.y+3);
    world.command([worker.id],{type:'build',target:b.id});
    until(world,()=>b.progress===1);
    assert.equal(world.stocks[0].gold,before+12,type);
    assert.equal(worker.carried,0,type);
  }
});
test('switching resource keeps the old load while walking but never converts it into the new resource', () => {
  const {world,worker}=setup(); const target={x:worker.x+5,y:worker.y+3};setTile(world.map,target.x,target.y,'gold');
  worker.carried=12;worker.carrying='wood';
  world.command([worker.id],{type:'gather',...target});world.tick(.1);
  assert.equal(worker.carried,12);assert.equal(worker.carrying,'wood');
  until(world,()=>worker.carrying==='gold');
  assert.ok(worker.carried > 0 && worker.carried < 1);
});
test('entering the town center deposits carried resources once', () => {
  const {world,worker,town}=setup();const before=world.stocks[0].wood;
  worker.carried=18;worker.carrying='wood';
  world.command([worker.id],{type:'garrison',target:town.id});
  until(world,()=>worker.garrison===town.id);
  assert.equal(world.stocks[0].wood,before+18);assert.equal(worker.carried,0);
  world.ungarrison(town.id);for(let i=0;i<10;i++)world.tick(.1);
  assert.equal(world.stocks[0].wood,before+18);
});
test('a garrisoned villager cannot place foundations or spend construction resources', () => {
  const {world,worker,town}=setup();world.command([worker.id],{type:'garrison',target:town.id});
  until(world,()=>worker.garrison===town.id);
  const before=world.stocks[0].wood,count=world.buildings.length;
  assert.equal(world.build([worker.id],'house',town.x+8,town.y+8),'請先選取村民。');
  assert.equal(world.stocks[0].wood,before);assert.equal(world.buildings.length,count);
});
