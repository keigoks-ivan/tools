import assert from 'node:assert/strict';
import test from 'node:test';
import { MarchDirector, SIEGE_GATE, toWorld, toPx } from '../3d-next/march.js';
import { CHAPTERS, chapterTuning } from '../3d-next/campaign.js';
import { HEROES } from '../3d-next/heroes.js';
import { levelStatus, decodeLevel, enemyType, recipeFor, TYPES } from '../3d-next/net/world.js';

const chapter = id => CHAPTERS.findIndex(c => c.id === id);
const director = id => new MarchDirector({ seed: 3, tuning: chapterTuning(chapter(id)), heroProfile: HEROES.azure });
const step = (march, seconds) => { for (let i = 0; i < Math.round(seconds * 60); i++) march.update(1 / 60, {}); };

test('every chapter has its own scenery and the first keeps the original night market', () => {
  assert.equal(CHAPTERS[0].environment, undefined);
  assert.deepEqual(CHAPTERS.slice(1).map(c => c.environment), ['ember', 'rift', 'frost', 'citadel']);
});

test('赤月圍城: the stairs ask the team to break the city gate, then its officer appears', () => {
  const march = director('ember'); march.skipTo(2);
  const gate = march.arena.enemies.find(e => e.lanternIndex === SIEGE_GATE.index);
  assert.ok(gate && gate.prop); assert.equal(gate.hp, march.tuning.stairs.gateHp);
  assert.equal(march.hud().timer, null); assert.equal(march.hud().lamp, null);
  assert.equal(march.hud().objective, '打破赤月城門'); assert.equal(march.hud().foe.name, '赤月城門');
  assert.ok(march.view().lamp.hidden); assert.equal(march.view().siegeGate.broken, false);
  step(march, 8);
  assert.ok(march.arena.enemies.every(e => e.kind !== 'raider'), 'nobody raids a soul lamp that is not there');
  march.arena._damageEnemy(gate, 9999, 'heavy'); step(march, 2);
  assert.ok(march.seg.secured); assert.ok(march.view().siegeGate.broken);
  assert.ok(march.arena.enemies.some(e => e.kind === 'officer' && e.action !== 'dead'), 'gate officer did not appear');
});

test('虛空封魂: five rifts must all be sealed before the officer comes', () => {
  const march = director('rift'); march.skipTo(1);
  const rifts = march.arena.enemies.filter(e => e.kind === 'lantern');
  assert.equal(rifts.length, 5); assert.equal(march.view().objectiveStyle, 'rift'); assert.equal(march.view().lanterns.length, 5);
  assert.equal(march.hud().objective, '封住裂隙 0／5');
  for (const rift of rifts.slice(0, 4)) march.arena._damageEnemy(rift, 9999, 'heavy');
  step(march, 2);
  assert.equal(march.hud().objective, '封住裂隙 4／5'); assert.ok(!march.arena.enemies.some(e => e.kind === 'officer'));
  march.arena._damageEnemy(rifts[4], 9999, 'heavy'); step(march, 2);
  assert.ok(march.arena.enemies.some(e => e.kind === 'officer' && e.action !== 'dead'));
});

test('霜橋追魂: the boss runs, escapes twice at each third of its health, then retreats and opens the gate', () => {
  const march = director('frost');
  step(march, 2.5);
  const chaser = march.arena.enemies.find(e => e.chase);
  assert.ok(chaser); assert.equal(chaser.name, '霜橋鎮魂使');
  // Walk up to it: it backs away toward the far end of the street.
  const start = toWorld(chaser.x, chaser.y).z;
  march.arena.hero.x = chaser.x; march.arena.hero.y = chaser.y + 150; step(march, 0.6);
  assert.ok(toWorld(chaser.x, chaser.y).z < start - 0.3, 'it did not flee');
  for (const escapes of [1, 2]) {
    chaser.hp = Math.floor(chaser.maxHp * (3 - escapes) / 3) - 1; step(march, 0.1);
    assert.equal(chaser.escapes, escapes); assert.equal(march.seg.escapes, escapes);
    assert.match(march.hud().objective, new RegExp(`${escapes}／2`));
  }
  assert.ok(!march.gates[0].open);
  march.arena._damageEnemy(chaser, 9999, 'heavy'); step(march, 0.5);
  assert.ok(march.gates[0].open, 'gate stays shut after the chase');
  const status = decodeLevel(levelStatus(march)); assert.equal(status.escapes, 2);
  assert.equal(TYPES[enemyType(chaser)], 'officer:chase');
  assert.equal(recipeFor(enemyType(chaser), march.tuning).options.name, '霜橋鎮魂使');
});

test('天闕決戰: three officers enter together and the gate waits for all of them', () => {
  const march = director('citadel'); march.skipTo(1);
  for (const lantern of march.arena.enemies.filter(e => e.kind === 'lantern')) march.arena._damageEnemy(lantern, 9999, 'heavy');
  step(march, 2);
  const officers = march.arena.enemies.filter(e => e.kind === 'officer' && e.action !== 'dead');
  assert.equal(officers.length, 3); assert.deepEqual(new Set(officers.map(o => o.variant)), new Set(['red', 'market', 'shadow']));
  assert.equal(march.hud().objective, '擊倒敵將（剩 3 名）');
  for (const [k, officer] of officers.entries()) {
    march.arena._damageEnemy(officer, 9999, 'heavy'); step(march, 0.2);
    assert.equal(march.gates[1].open, k === 2, `gate after ${k + 1} officers`);
  }
});

test('赤月圍城 street: no kill count — reaching the far end under arrow volleys opens the gate', () => {
  const march = director('ember');
  assert.match(march.hud().objective, /^頂著箭雨衝到街底/);
  step(march, 3);
  const volleys = march.hazards.filter(h => h.attack === 'volley');
  assert.equal(volleys.length, 2, 'two red circles per hero per volley');
  // Standing in a circle when it lands hurts; the arrows stay stuck for the renderer.
  const hero = march.arena.hero, hp = hero.hp;
  Object.assign(hero, { x: volleys[0].x, y: volleys[0].y });
  step(march, 1.2);
  assert.ok(hero.hp < hp, 'volley did not hurt'); assert.ok(march.view().impacts.length >= 1);
  assert.ok(!march.gates[0].open);
  Object.assign(hero, toPx(0, -28)); step(march, 0.1);
  assert.ok(march.gates[0].open, 'reaching the end did not open the gate');
});

test('赤月圍城 plaza: beacons fill while a hero stands in them, drain while only enemies hold them', () => {
  const march = director('ember'); march.skipTo(1);
  assert.equal(march.hud().objective, '點燃烽火台 0／3');
  assert.ok(march.arena.enemies.every(e => e.kind !== 'lantern'), 'no lanterns to break');
  const spot = march.objectiveSpots[0], hero = march.arena.hero;
  Object.assign(hero, toPx(spot.x + 1, spot.z)); march.arena.enemies.length = 0; march.units.clear();
  step(march, 5);
  const half = march.seg.beacons[0].progress; assert.ok(half > 0.4 && half < 0.6, `progress ${half}`);
  march.seg.nextSpawnAt = march.seg.nextSpawnAt.map(() => Infinity); march.arena.enemies.length = 0; march.units.clear();
  Object.assign(hero, toPx(0, -34)); step(march, 1);
  assert.equal(march.seg.beacons[0].progress, half, 'an empty circle should hold its fill');
  const guard = march._grunt(spot.x, spot.z, 0); guard.ai = 'external'; step(march, 1);
  assert.ok(march.seg.beacons[0].progress < half, 'an enemy standing in the circle should drain it');
  march.arena.enemies.length = 0; march.units.clear();
  march.seg.beacons[0].progress = half;
  Object.assign(hero, toPx(spot.x + 1, spot.z)); step(march, 6);
  assert.ok(march.seg.beacons[0].lit); assert.equal(march.hud().objective, '點燃烽火台 1／3');
  for (const b of march.seg.beacons.slice(1)) b.progress = 0.999;
  for (const [k, s] of march.objectiveSpots.slice(1).entries()) { Object.assign(hero, toPx(s.x + 1, s.z)); step(march, 0.3); assert.ok(march.seg.beacons[k + 1].lit); }
  step(march, 2);
  assert.ok(march.arena.enemies.some(e => e.kind === 'officer' && e.action !== 'dead'));
  const lv = decodeLevel(levelStatus(march)); assert.deepEqual(lv.beacons, [1, 1, 1]);
});

test('赤月圍城 boss fight keeps lighter volleys; other chapters have none', () => {
  const ember = director('ember'); ember.skipTo(3); step(ember, 3.5);
  assert.equal(ember.hazards.filter(h => h.attack === 'volley').length, 1);
  for (const id of ['night', 'rift', 'frost', 'citadel']) { const m = director(id); step(m, 4); assert.ok(!m.hazards.some(h => h.attack === 'volley'), id); }
});
