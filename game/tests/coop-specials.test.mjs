// 三人頁的特殊敵人（弓箭手／盾兵／自爆兵／召喚師）：單人版從不出現；兩人以上依節奏出場，各自的招式照規格運作。
import test from 'node:test';
import assert from 'node:assert/strict';
import { MarchDirector, TUNING, toWorld } from '../3d-next/march.js';
import { COOP_SPECIALS, applySupplyScale, snapshotSupply } from '../3d-next/net/scaling.js';
import { TYPES, enemyType, recipeFor } from '../3d-next/net/world.js';
import { SPECIAL_ROLES, SPECIAL_UNITS, inLine } from '../3d-next/specials.js';

const STEP = 1 / 60;
const specials = march => march.arena.enemies.filter(e => e.special && e.action !== 'dead');
/** 跑 seconds 秒；每格清掉一般小兵（不讓它們干擾），收集事件 */
function run(march, seconds, { clearGrunts = true, each = null } = {}) {
  const events = [];
  for (let t = 0; t < seconds; t += STEP) {
    if (clearGrunts) for (const e of [...march.arena.enemies]) if (!e.special && !e.prop && e.action !== 'dead') march._removeUnit(e, 'despawn');
    each?.(march);
    march.update(STEP, {});
    events.push(...march.drainEvents());
  }
  return events;
}
function withSpecials(players, fn) {
  const base = snapshotSupply(TUNING);
  applySupplyScale(TUNING, base, players);
  try { return fn(); } finally { applySupplyScale(TUNING, base, 1); }
}
function spawnNear(march, role, dx, dz) {
  const hero = toWorld(march.arena.hero.x, march.arena.hero.y);
  return march._spawnUnit(role, hero.x + dx, hero.z + dz, recipeFor(TYPES.indexOf(role), TUNING).options);
}

test('single player never spawns special enemies', () => {
  assert.equal(TUNING.specials, null);
  const march = new MarchDirector({ seed: 11 });
  run(march, 40, { each: m => { m.arena.hero.invulnerable = 10; } });
  assert.equal(specials(march).length, 0);
});

test('co-op pacing: first special after `first` s, never more than maxAlive, not counted in the market quota', () => {
  withSpecials(3, () => {
    assert.equal(TUNING.specials.maxAlive, COOP_SPECIALS.maxAlive[3]);
    const march = new MarchDirector({ seed: 12 });
    run(march, COOP_SPECIALS.first - 1, { each: m => { m.arena.hero.invulnerable = 10; } });
    assert.equal(specials(march).length, 0, 'nothing special before `first` seconds');
    let peak = 0;
    run(march, 40, { each: m => { m.arena.hero.invulnerable = 10; peak = Math.max(peak, specials(m).length); } });
    assert.ok(peak >= 1 && peak <= COOP_SPECIALS.maxAlive[3], `peak ${peak}`);
    for (const e of specials(march)) assert.ok(COOP_SPECIALS.mix[0].includes(e.role));
    const kills = march.seg.kills;
    for (const e of specials(march)) march.arena._damageEnemy(e, 9999, 'heavy');
    run(march, STEP);
    assert.equal(march.seg.kills, kills, 'special kills do not advance the market quota');
  });
});

test('every special type round-trips through the wire type table', () => {
  for (const role of SPECIAL_ROLES) {
    const recipe = recipeFor(TYPES.indexOf(role), TUNING);
    assert.equal(recipe.role, role);
    assert.equal(recipe.options.special, true);
    assert.equal(enemyType({ role, kind: role }), TYPES.indexOf(role));
  }
  assert.equal(recipeFor(TYPES.indexOf('shield'), TUNING).options.guard, true, 'shield bearer blocks from the front');
  assert.equal(recipeFor(TYPES.indexOf('shield'), TUNING).options.ai, undefined, 'shield bearer uses the Arena melee AI');
});

test('archer: telegraphs a line, then the arrow hits whoever stands in it; a hit during the aim cancels the shot', () => {
  const march = new MarchDirector({ seed: 13 });
  const archer = spawnNear(march, 'archer', 0, -7);
  const hp = march.arena.hero.hp;
  let events = run(march, 3.2, { each: m => { m.arena.hero.invulnerable = 0; } });
  assert.ok(events.some(e => e.type === 'groundTelegraph' && e.attack === 'arrow'));
  const arrow = events.find(e => e.type === 'arrow');
  assert.ok(arrow, 'arrow released');
  assert.equal(march.arena.hero.hp, hp - SPECIAL_UNITS.archer.damage);

  // 瞄準中被砍：紅線消失、不會放箭
  archer.cooldown = 0; archer.mode = 'move';
  events = run(march, 0.3);
  assert.equal(archer.mode, 'aim');
  march.arena._damageEnemy(archer, 1, 'attack');
  events = run(march, 0.05);
  assert.equal(archer.mode, 'flinch');
  assert.ok(!march.hazards.some(h => h.ownerId === archer.id), 'red line removed');
  events = run(march, 1.2, { each: m => { m.arena.hero.invulnerable = 0; } });
  assert.ok(!events.some(e => e.type === 'arrow'), 'no arrow right after being interrupted');
});

test('arrow line test: inside the strip hits, beside it misses', () => {
  const from = { x: 0, y: 0 };
  assert.ok(inLine(300, 10, from, 0, 720, 54));
  assert.ok(!inLine(300, 120, from, 0, 720, 54));
  assert.ok(!inLine(-200, 0, from, 0, 720, 54), 'behind the archer');
  assert.ok(inLine(0, 400, from, Math.PI / 2, 720, 54), 'rotated');
});

test('bomber: rushes in, lights a red circle, explodes and removes itself; killed before the fuse ends it never explodes', () => {
  let march = new MarchDirector({ seed: 14 });
  const bomber = spawnNear(march, 'bomber', 0, -5);
  const hp = march.arena.hero.hp;
  let events = run(march, 2.5, { each: m => { m.arena.hero.invulnerable = 0; } });
  assert.ok(events.some(e => e.type === 'groundTelegraph' && e.attack === 'blast'));
  assert.ok(events.some(e => e.type === 'bomberBlast'));
  assert.ok(events.some(e => e.type === 'despawn' && e.enemyId === bomber.id));
  assert.ok(!march.arena.enemies.includes(bomber));
  assert.equal(march.arena.hero.hp, hp - SPECIAL_UNITS.bomber.damage);

  march = new MarchDirector({ seed: 15 });
  const second = spawnNear(march, 'bomber', 0, -5);
  events = run(march, 5, { each: m => { if (second.mode === 'fuse' && second.hp > 0) m.arena._damageEnemy(second, 9999, 'heavy'); } });
  assert.ok(events.some(e => e.type === 'kill' && e.enemyId === second.id));
  assert.ok(!events.some(e => e.type === 'bomberBlast'));
});

test('summoner: keeps its distance and calls grunts after a cast', () => {
  const march = new MarchDirector({ seed: 16 });
  spawnNear(march, 'summoner', 0, -8);
  const events = run(march, 5, { clearGrunts: false, each: m => { m.arena.hero.invulnerable = 10; } });
  const summon = events.find(e => e.type === 'summon');
  assert.ok(summon && summon.count === SPECIAL_UNITS.summoner.count);
});
