import test from 'node:test';
import assert from 'node:assert/strict';
import { FxState, LIMITS, damageStage, damageProfile, fireSpots, smokeSpots, corpsePose, ruinAlpha, ARROW_FLIGHT, ROCK_FLIGHT, STUCK_LIFE, RUIN_LIFE } from './fx.mjs';
import { constructionStage, constructionReveal } from './renderer.js';

const seeded = () => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const state = () => { const fx = new FxState(); fx.rand = seeded(); return fx; };

test('buildings smoke at half health and burn at a quarter', () => {
  assert.equal(damageStage(100, 100), 0);
  assert.equal(damageStage(51, 100), 0);
  assert.equal(damageStage(50, 100), 1);
  assert.equal(damageStage(26, 100), 1);
  assert.equal(damageStage(25, 100), 2);
  assert.equal(damageStage(1, 100), 2);
  assert.equal(damageStage(0, 100), 0);
});

test('smoking buildings emit smoke only; burning ones add embers, and a healthy building emits nothing', () => {
  const fx = state(), size = { width: 100, height: 80 };
  const kinds = b => { const f = state(); for (let i = 0; i < 60; i++) { f.emitDamage(b, size, .05); f.update(i * .05); } return new Set(f.particles.map(p => p.type)); };
  assert.deepEqual([...kinds({ id: 1, x: 5, y: 5, hp: 40, maxHp: 100 })], ['smoke']);
  const burning = kinds({ id: 2, x: 5, y: 5, hp: 10, maxHp: 100 });
  assert.ok(burning.has('smoke') && burning.has('ember') && !burning.has('flame'), 'fires are painted on the sprite, particles are smoke and embers');
  fx.emitDamage({ id: 3, x: 1, y: 1, hp: 100, maxHp: 100 }, size, 1); assert.equal(fx.particles.length, 0);
});

test('particle counts are capped globally and per building, and particles expire', () => {
  const fx = state(), size = { width: 150, height: 100 };
  for (let frame = 0; frame < 200; frame++) { for (let id = 1; id <= 30; id++) fx.emitDamage({ id, x: id, y: id, hp: 5, maxHp: 100 }, size, .05); fx.update(frame * .05); assert.ok(fx.particles.length <= LIMITS.particles); }
  for (let id = 1; id <= 30; id++) assert.ok(fx.particles.filter(p => p.owner === id).length <= LIMITS.perBuilding);
  fx.update(100); fx.update(100.1); assert.ok(fx.particles.length <= LIMITS.particles);
  const quiet = state(); quiet.spawn({ type: 'dust', wx: 0, wy: 0, life: .3, size: 4 }); quiet.update(0); quiet.update(.1); assert.equal(quiet.particles.length, 1); quiet.update(.2); quiet.update(.3); quiet.update(.4); assert.equal(quiet.particles.length, 0);
});

test('an arrow leaves exactly one stuck arrow where it lands, which disappears after a short while', () => {
  const fx = state(), arrow = { type: 'arrow', x: 1, y: 1, tx: 8, ty: 6, age: 0 };
  fx.observeEffects([arrow], 10); assert.equal(fx.stuck.length, 0, 'still flying');
  arrow.age = ARROW_FLIGHT + .02; fx.observeEffects([arrow], 10.3); fx.observeEffects([arrow], 10.35);
  assert.equal(fx.stuck.length, 1);
  assert.ok(Math.hypot(fx.stuck[0].x - 8, fx.stuck[0].y - 6) < .5);
  fx.update(10.4); assert.equal(fx.stuck.length, 1);
  fx.update(10.3 + STUCK_LIFE + .1); assert.equal(fx.stuck.length, 0);
  for (let i = 0; i < 200; i++) fx.observeEffects([{ type: 'arrow', x: i, y: 1, tx: i, ty: 3, age: .3 }], 20);
  assert.ok(fx.stuck.length <= LIMITS.stuck);
});

test('stones raise dust and chips on landing, melee hits throw sparks, each only once', () => {
  const fx = state(), rock = { type: 'rock', x: 1, y: 1, tx: 9, ty: 9, age: ROCK_FLIGHT - .05 };
  fx.observeEffects([rock], 1); assert.equal(fx.particles.length, 0);
  rock.age = ROCK_FLIGHT + .01; fx.observeEffects([rock], 1.4); const after = fx.particles.length;
  assert.ok(after >= 8 && fx.particles.some(p => p.type === 'dust') && fx.particles.some(p => p.type === 'chip'));
  fx.observeEffects([rock], 1.45); assert.equal(fx.particles.length, after);
  const hit = { type: 'hit', x: 1, y: 1, tx: 2, ty: 2, age: 0 };
  fx.observeEffects([hit], 2); assert.ok(fx.particles.filter(p => p.type === 'spark').length >= 4);
  const n = fx.particles.length; fx.observeEffects([hit], 2.05); assert.equal(fx.particles.length, n);
});

test('a destroyed building leaves a ruin for a while; unfinished or still-standing ones do not', () => {
  const fx = state(), world = { buildings: [{ id: 5, type: 'barracks', team: 1, x: 10, y: 10, hp: 100, maxHp: 100, progress: 1 }, { id: 6, type: 'house', team: 1, x: 20, y: 20, hp: 10, maxHp: 100, progress: .3 }] };
  fx.observeBuildings(world, () => true, 1); assert.equal(fx.ruins.size, 0);
  world.buildings = [world.buildings[1]]; fx.observeBuildings(world, () => false, 2); assert.equal(fx.ruins.size, 0, 'destroyed out of sight: nothing drawn yet');
  fx.observeBuildings(world, () => true, 3); assert.equal(fx.ruins.size, 1);
  assert.ok(fx.particles.some(p => p.type === 'smoke'), 'collapse throws up smoke');
  world.buildings = []; fx.observeBuildings(world, () => true, 4); assert.equal(fx.ruins.size, 1, 'a cancelled foundation is not a ruin');
  fx.update(3 + RUIN_LIFE + 1); assert.equal(fx.ruins.size, 0);
  assert.equal(ruinAlpha(0), 1); assert.equal(ruinAlpha(RUIN_LIFE - 2), .5); assert.equal(ruinAlpha(RUIN_LIFE), 0);
});

test('units fall over then fade; they are lying flat before the fade starts', () => {
  assert.equal(corpsePose(0).angle, 0);
  assert.ok(corpsePose(.3).angle > 1.4 && corpsePose(.3).alpha === 1);
  assert.ok(corpsePose(1.2).alpha === 1 && corpsePose(1.2).angle === corpsePose(.5).angle);
  assert.ok(corpsePose(1.7).alpha < 1 && corpsePose(1.99).alpha < .05);
  assert.ok(corpsePose(.15).angle > 0 && corpsePose(.15).angle < corpsePose(.3).angle);
});

test('construction runs through four stages and reveals the building from the ground up', () => {
  assert.deepEqual([0, .24, .25, .49, .5, .79, .8, .99].map(constructionStage), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.equal(constructionReveal(.1), 0);
  let last = 0; for (let p = 0; p <= 1; p += .05) { const r = constructionReveal(p); assert.ok(r >= last); last = r; }
  assert.equal(constructionReveal(1), 1);
});

test('the four construction stages differ clearly in how much of the building is up', () => {
  const [s0, s1, s2, s3] = [.12, .38, .65, .9].map(constructionReveal);
  assert.equal(s0, 0, 'foundation only');
  assert.ok(s1 > .25 && s1 < .45, 'low walls');
  assert.ok(s2 > .6 && s2 < .8, 'most walls up, roof still open');
  assert.ok(s3 > .9 && s3 < 1, 'nearly finished');
  assert.ok(s1 - s0 > .25 && s2 - s1 > .25 && s3 - s2 > .2, 'every stage adds a visible chunk');
  for (const p of [.249, .499, .799]) assert.ok(constructionReveal(p + .002) - constructionReveal(p) < .2 + 1e-9);
});

test('fire grows with damage: one or two smoke columns at half, two to four fires at a quarter, many at a tenth', () => {
  assert.equal(damageProfile(.6).smoke, 0);
  const half = damageProfile(.45), third = damageProfile(.3), quarter = damageProfile(.25), low = damageProfile(.15), tenth = damageProfile(.1), dying = damageProfile(.04);
  assert.ok(half.smoke >= 1 && half.smoke <= 2 && half.flames === 0 && third.smoke <= 2 && third.flames === 0);
  assert.ok(quarter.flames >= 2 && quarter.flames <= 4 && low.flames <= 4 && low.flames >= quarter.flames);
  assert.ok(tenth.flames > 4 && dying.flames >= tenth.flames && dying.scale > quarter.scale && dying.smoke >= quarter.smoke);
  let flames = 0, smoke = 0; for (let r = .5; r > 0; r -= .01) { const p = damageProfile(r); assert.ok(p.flames >= flames && p.smoke >= smoke); flames = p.flames; smoke = p.smoke; }
  const size = { width: 100, height: 80 }, a = fireSpots(7, 3, size), b = fireSpots(7, 8, size);
  assert.deepEqual(b.slice(0, 3), a, 'adding fires never moves the existing ones');
  assert.deepEqual(smokeSpots(7, 2, size), smokeSpots(7, 5, size).slice(0, 2));
  for (const s of b) assert.ok(Math.abs(s.dx) <= size.width * .3 && s.up >= 0 && s.up <= size.height);
});

test('a heavily burning building spreads smoke over several columns and stays within its particle budget', () => {
  const fx = state(), size = { width: 150, height: 100, bottom: 27 }, b = { id: 9, x: 10, y: 10, hp: 20, maxHp: 1000 };
  const xs = new Set(); let peak = 0;
  for (let i = 0; i < 200; i++) { fx.emitDamage(b, size, .05); fx.update(i * .05); peak = Math.max(peak, fx.particles.length); for (const p of fx.particles) if (p.type === 'smoke') xs.add(Math.round((p.wx - p.wy) * 21 / 8)); }
  assert.ok(peak <= LIMITS.perBuilding && peak >= 15, `peak ${peak}`);
  assert.ok(xs.size >= 4, 'smoke rises from different places on the roof');
  const crowded = state(); for (let i = 0; i < LIMITS.particles; i++) crowded.spawn({ type: 'dust', wx: 0, wy: 0, life: 9, size: 2 });
  const before = crowded.particles.length; crowded.particles.length = LIMITS.particles - 10; crowded.emitDamage(b, size, 1); assert.ok(crowded.particles.length <= LIMITS.particles - LIMITS.reserve + 0 || crowded.particles.length === LIMITS.particles - 10, 'fire leaves room for combat effects');
  assert.ok(before > 0);
});
