// 隊長：魔王以外每段出幾個，帶兵出場、輕攻擊打不斷出招、倒下震暈小兵並掉護符；護衛不算市集擊倒目標；連線時更多更快。
import test from 'node:test';
import assert from 'node:assert/strict';
import { MarchDirector, TUNING } from '../3d-next/march.js';
import { COOP_CAPTAINS, applySupplyScale, snapshotSupply } from '../3d-next/net/scaling.js';
import { TYPES, enemyType, recipeFor } from '../3d-next/net/world.js';
import { CAPTAIN } from '../3d-next/specials.js';

const STEP = 1 / 60;
const captains = march => march.arena.enemies.filter(e => e.captain && e.action !== 'dead');
function run(march, seconds, each = null) {
  const events = [];
  for (let t = 0; t < seconds; t += STEP) { each?.(march); march.update(STEP, {}); events.push(...march.drainEvents()); }
  return events;
}
// 無敵＋像玩家一樣清掉一般小兵（隊長與護衛留著），不然場上滿了隊長擠不進來
const god = m => {
  m.arena.hero.invulnerable = 10;
  for (const e of [...m.arena.enemies]) if (!e.captain && !e.escort && !e.special && !e.prop && e.action !== 'dead' && e.kind !== 'boss') m._removeUnit(e, 'despawn');
};

test('single player: first captain after `first` s with escorts, one at a time, count per segment, none in the boss fight', () => {
  assert.deepEqual(TUNING.captains.count, [2, 2, 2, 0]);
  const march = new MarchDirector({ seed: 21 });
  run(march, TUNING.captains.first - 1, god);
  assert.equal(captains(march).length, 0);
  const events = run(march, 2, god);
  assert.equal(captains(march).length, 1);
  const escorts = march.arena.enemies.filter(e => e.escort);
  assert.equal(escorts.length, CAPTAIN.escorts);
  assert.ok(events.some(e => e.type === 'hint'));
  run(march, TUNING.captains.every + 2, god);
  assert.equal(captains(march).length, 1, 'never two at once');
  for (const c of captains(march)) march.arena._damageEnemy(c, 9999, 'heavy');
  run(march, TUNING.captains.every + 2, god);
  assert.equal(march.captainsLeft, 0, 'both market captains came out');
  const boss = new MarchDirector({ seed: 22 });
  boss.skipTo(3);
  run(boss, 60, god);
  assert.equal(captains(boss).length, 0);
});

test('captain armour: a light hit during its wind-up lands but does not interrupt; a heavy hit does', () => {
  const march = new MarchDirector({ seed: 23 });
  const hero = march.arena.hero;
  const c = march.arena.spawn('captain', hero.x, hero.y - 60, recipeFor(TYPES.indexOf('captain'), TUNING).options);
  c.action = 'telegraph'; c.telegraph = 0.5;
  march.arena._damageEnemy(c, 2, 'attack');
  assert.equal(c.action, 'telegraph');
  assert.equal(c.hp, CAPTAIN.hp - 2);
  march.arena._damageEnemy(c, 2, 'heavy');
  assert.equal(c.action, 'hit');
});

test('captain down: staggers nearby grunts, drops a heal charm, escorts never count toward the market quota', () => {
  const march = new MarchDirector({ seed: 24 });
  run(march, TUNING.captains.first + 0.5, god);
  const [c] = captains(march);
  assert.ok(c);
  const kills = march.seg.kills;
  for (const e of march.arena.enemies.filter(e => e.escort)) march.arena._damageEnemy(e, 9999, 'heavy');
  march.arena._damageEnemy(c, 9999, 'heavy');
  const events = run(march, STEP, god);
  assert.equal(march.seg.kills, kills);
  assert.ok(events.some(e => e.type === 'stagger'));
  assert.ok(events.some(e => e.type === 'drop' && e.amount === CAPTAIN.heal), 'heal charm');
  assert.ok(events.some(e => JSON.stringify(e).includes('擊破')), 'captain-down call-out');
});

test('co-op: more captains, sooner; back to single-player values at 1 player; wire type round-trips', () => {
  const base = snapshotSupply(TUNING);
  applySupplyScale(TUNING, base, 3);
  try {
    assert.deepEqual(TUNING.captains, { count: COOP_CAPTAINS.count, first: COOP_CAPTAINS.first, every: COOP_CAPTAINS.every[3] });
  } finally { applySupplyScale(TUNING, base, 1); }
  assert.deepEqual(TUNING.captains, { count: [2, 2, 2, 0], first: 20, every: 30 });
  const recipe = recipeFor(TYPES.indexOf('captain'), TUNING);
  assert.equal(recipe.role, 'captain');
  assert.equal(recipe.options.armor, true);
  assert.equal(enemyType({ role: 'captain', kind: 'captain' }), TYPES.indexOf('captain'));
});
