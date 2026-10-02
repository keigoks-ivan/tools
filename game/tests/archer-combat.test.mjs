import assert from 'node:assert/strict';
import test from 'node:test';
import { Arena } from '../2d/combat.js';
import { HEROES } from '../3d-next/heroes.js';
const arenaFor=()=>{const a=new Arena({musou:true,warriorMode:true,musouFlurry:true,director:true,jump:true,heroProfile:HEROES.jade});a.hero.facing=0;return a;};
const advance=(a,seconds,input={})=>{for(let t=0;t<seconds-1e-8;t+=1/120)a.update(Math.min(1/120,seconds-t),input);};
const target=(a,d,dy=0)=>a.spawn('grunt',a.hero.x+d,a.hero.y+dy,{hp:100,fixed:true,ai:'external'});

test('bow attacks wait for release and flight, pierce two targets, and continue after an interrupt',()=>{
  const a=arenaFor(),near=target(a,260),far=target(a,400),behind=target(a,500);a.hero.facing=0;a._startAttack('attack');
  advance(a,HEROES.jade.chain[0].hits[0]);assert.equal(near.hp,100);assert.equal(far.hp,100);assert.equal(a.projectiles.length,1);
  a._startDodge(0,1);advance(a,.3);
  assert.equal(near.hp,88);assert.equal(far.hp,88);assert.equal(behind.hp,100);assert.equal(a.projectiles.length,0);
  const b=arenaFor();target(b,250);b._startAttack('attack');advance(b,HEROES.jade.chain[0].hits[0]);b.reset();assert.equal(b.projectiles.length,0);
});

test('draw direction stays on its selected target when retreat input is held',()=>{
  const a=arenaFor(),enemy=target(a,280);a.hero.facing=Math.PI;a._startAttack('attack');
  advance(a,.65,{x:-1});assert.equal(enemy.hp,88);
});

test('piercing arrows sweep fast steps, hit each enemy once and stop at three targets',()=>{
  const a=arenaFor(),enemies=[90,160,230,300].map(d=>target(a,d));
  a._fireArrows(HEROES.jade.heavy,18,'heavy');a._advanceProjectiles(.3);
  assert.deepEqual(enemies.map(e=>e.hp),[82,82,82,100]);assert.equal(a.projectiles.length,0);
  const b=arenaFor(),e=target(b,100);b._fireArrows(HEROES.jade.heavy,18,'heavy');
  for(let i=0;i<8;i++)b._advanceProjectiles(.01);assert.equal(e.hp,82);
});

test('fan arrows follow separate lanes and never apply a radial melee hit',()=>{
  const a=arenaFor(),move=HEROES.jade.chain[2];
  const enemies=[-.22,0,.22].map(angle=>target(a,320*Math.cos(angle),320*Math.sin(angle))),off=target(a,0,200);
  a._fireArrows(move,12,'heavy');assert.equal(a.projectiles.length,3);a._advanceProjectiles(.4);
  assert.deepEqual(enemies.map(e=>e.hp),[88,88,88]);assert.equal(off.hp,100);
});

test('range expiry and projectile capacity bound repeated shots',()=>{
  const a=arenaFor();for(let i=0;i<100;i++)a._fireArrows(HEROES.jade.charges[1],12,'heavy');assert.equal(a.projectiles.length,64);
  a._advanceProjectiles(1);assert.equal(a.projectiles.length,0);
  const outside=target(a,620);a._fireArrows(HEROES.jade.heavy,18,'heavy');a._advanceProjectiles(1);assert.equal(outside.hp,100);
});

test('air attack has a bow animation, releases a real arrow and preserves launch height',()=>{
  const a=arenaFor();a._startJump();advance(a,.15);a.update(1/120,{attack:true});
  assert.ok(a.drainEvents().some(e=>e.type==='airAttackStart'&&e.clip==='jadeAir'));
  advance(a,.22);const arrow=a.drainEvents().find(e=>e.type==='arrow');assert.ok(arrow);assert.ok(arrow.height>0);assert.equal(a.projectiles.length,1);
});

test('a non-piercing arrow stops at the nearest target even when enemies are stored in reverse order',()=>{
  const a=arenaFor(),far=target(a,350),near=target(a,180);
  a._fireArrows(HEROES.jade.chain[1],8,'attack');a._advanceProjectiles(.3);
  assert.equal(near.hp,92);assert.equal(far.hp,100);
});

test('movement cancels released shot recovery and preserves the next combo step',()=>{
  const a=arenaFor(),x=a.hero.x;target(a,350);a._startAttack('attack');
  advance(a,HEROES.jade.chain[0].moveCancel-.01,{x:-1});assert.equal(a.hero.action,'attack');assert.equal(a.hero.x,x);
  advance(a,.03,{x:-1});assert.equal(a.hero.action,'run');assert.ok(a.hero.x<x);
  a.update(1/120,{attack:true});assert.equal(a.hero.combo,2);assert.equal(a.attack.clip,'jadeDouble');
});

test('double shot keeps both releases before movement cancels recovery',()=>{
  const a=arenaFor();a.hero.combo=1;a.comboUntil=a.time+1;a._startAttack('attack');
  const move=HEROES.jade.chain[1],beforeSecond=move.hits[1]-.02;
  advance(a,beforeSecond,{x:1});assert.equal(a.hero.action,'attack');assert.equal(a.drainEvents().filter(e=>e.type==='arrow').length,1);
  advance(a,move.moveCancel-beforeSecond+.02,{x:1});assert.equal(a.drainEvents().filter(e=>e.type==='arrow').length,1);assert.equal(a.hero.action,'run');
});

test('a queued heavy branch has priority over movement recovery cancellation',()=>{
  const a=arenaFor();a._startAttack('attack');advance(a,HEROES.jade.chain[0].cancel+.02,{x:-1,heavy:true});
  assert.equal(a.attack.clip,'jadePierce');assert.equal(a.hero.action,'heavy');assert.equal(a.attack.charge,2);
});

test('jade shares the other heroes roll timing, displacement and invulnerability',()=>{
  const reference=new Arena({heroProfile:HEROES.violet}),jade=arenaFor();
  reference._startDodge(1,0);jade._startDodge(1,0);
  const state=a=>({x:a.hero.x,y:a.hero.y,action:a.hero.action,invulnerable:a.hero.invulnerable,cooldown:a.hero.dodgeCooldown});
  assert.deepEqual(state(jade),state(reference));assert.equal(jade.hero.x,716);
  for(let i=0;i<72;i++){reference.update(1/120,{});jade.update(1/120,{});assert.deepEqual(state(jade),state(reference));}
  assert.equal(jade.hero.action,'idle');assert.equal(jade.hero.dodgeCooldown,0);
});

test('roll remains inside map bounds',()=>{
  const a=arenaFor();a.hero.x=a.bounds.maxX-5;a.hero.y=a.bounds.maxY-5;a._startDodge(1,1);
  for(let i=0;i<40;i++){a.update(1/120,{});assert.ok(a.hero.x<=a.bounds.maxX);assert.ok(a.hero.y<=a.bounds.maxY);}
});


test('held light input plays four distinct bow stages and releases nine arrows with a brighter final shot',()=>{
  const a=arenaFor(),events=[];const duration=HEROES.jade.chain.reduce((sum,move)=>sum+(Number.isFinite(move.cancel)?move.cancel:move.duration),0);
  for(let time=0;time<duration-.03;time+=1/120){a.update(1/120,{attack:true});events.push(...a.drainEvents());}
  assert.deepEqual(events.filter(e=>e.type==='slash').map(e=>e.combo),[1,2,3,4]);
  const arrows=events.filter(e=>e.type==='arrow');assert.equal(arrows.length,9);
  assert.deepEqual(arrows.map(e=>e.fxTier),[1,2,2,3,3,3,4,4,5]);
});

test('arrow impact effects occur on the damaged enemy, preserve height, and do not repeat on pierced targets',()=>{
  const a=arenaFor(),near=target(a,140),far=target(a,250);a.hero.height=.2;
  a._fireArrows(HEROES.jade.chain[3],8,'attack',2);a.drainEvents();a._advanceProjectiles(.2);
  const hits=a.drainEvents().filter(e=>e.type==='arrowImpact');
  assert.deepEqual(hits.map(e=>e.enemyId),[near.id,far.id]);assert.equal(hits[0].x,near.x);assert.equal(hits[1].x,far.x);
  assert.ok(hits.every(e=>e.height===.2&&e.fxTier===5));a._advanceProjectiles(.1);assert.equal(a.drainEvents().filter(e=>e.type==='arrowImpact').length,0);
});
