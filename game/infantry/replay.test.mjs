import test from 'node:test';
import assert from 'node:assert/strict';
import { OPERATION_RULES, operationFor } from './operations.mjs';
import { SCENARIOS, DIFFICULTIES, Mission } from './scenarios.mjs';
import { REPLAY_CONDITIONS, replayPlan } from './replay.mjs';

const MODES = ['defend', 'assault'];
const DIFFICULTY_IDS = Object.keys(DIFFICULTIES);
const TYPES = new Set(['line', 'flank', 'support', 'sniper', 'heavy']);
const CLOSED = new Set(['alley-sweep', 'trench-storm', 'hangar-breach', 'isolation-lockdown', 'machinery-sweep', 'rationed-infiltration']);
const sample = (operation, mode = 'defend') => Array.from({ length: 4 }, (_, stage) =>
  Array.from({ length: 24 }, (_, index) => [operation.enemyType(stage + 1, index, mode), operation.spawnSide(stage + 1, index, mode)]));
const serial = plan => ({ ...plan, operation: { ...plan.operation, enemyType: undefined, spawnSide: undefined }, attackers: sample(plan.operation, plan.choice.mode) });

function* matrix(seeds = 32) {
  for (const { id: scene } of SCENARIOS) for (const mode of MODES) for (const difficulty of DIFFICULTY_IDS)
    for (let variant = 0; variant < 3; variant++) for (let seed = 0; seed < seeds; seed++)
      yield { scene, mode, difficulty, variant, seed };
}

test('the replay API supplies complete bilingual conditions and a stable finite resource contract', () => {
  assert.equal(REPLAY_CONDITIONS.length, 8);
  assert.equal(new Set(REPLAY_CONDITIONS.map(condition => condition.id)).size, 8);
  for (const condition of REPLAY_CONDITIONS) for (const language of ['zh', 'en']) {
    assert(condition.name[language].trim().length >= 4);
    assert(condition.brief[language].trim().length >= 35);
  }
  for (const kind of ['normal', 'remix', 'daily']) {
    const plan = replayPlan({ kind, seed: 71, date: new Date('2026-10-10T04:00:00Z') });
    assert.deepEqual(Object.keys(plan).sort(), ['kind', 'seed', 'choice', 'variant', 'conditions', 'operation', 'scoreMultiplier', 'sideKind', 'supportCharges', 'startGrenades', 'dailyKey', 'dailyTitle'].sort());
    assert.equal(plan.kind, kind); assert.equal(plan.supportCharges, 2);
    assert([2, 3].includes(plan.startGrenades)); assert(['intel', 'cache', 'relay'].includes(plan.sideKind));
    assert.equal(plan.conditions.length, kind === 'normal' ? 0 : 2);
    assert.equal(new Set(plan.conditions.map(condition => condition.id)).size, plan.conditions.length);
    assert(plan.dailyTitle.zh.length > 0 && plan.dailyTitle.en.length > 0);
    assert.equal(plan.dailyKey === null, kind !== 'daily');
    assert(plan.scoreMultiplier >= 1 && plan.scoreMultiplier <= 1.35);
  }
});

test('remix seeds reproduce the entire plan independently of calls, language and wall-clock date', () => {
  for (const scene of SCENARIOS) for (const mode of MODES) for (const seed of [0, 1, 22, 20261010, 0xffffffff, 'greyline-repeat']) {
    const options = { scene: scene.id, mode, difficulty: 'veteran', variant: 2, seed };
    const first = replayPlan({ ...options, date: new Date('2026-10-09T00:00:00Z') });
    replayPlan({ scene: 'rail', seed: 9999, kind: 'daily', date: new Date('2027-01-01T00:00:00Z') });
    const again = replayPlan({ ...options, date: new Date('2029-12-31T00:00:00Z') });
    assert.deepEqual(serial(first), serial(again));
    const expected = sample(first.operation, mode);
    for (let stage = 4; stage > 0; stage--) for (let index = 23; index >= 0; index--) {
      assert.equal(again.operation.enemyType(stage, index, mode), expected[stage - 1][index][0]);
      assert.equal(again.operation.spawnSide(stage, index, mode), expected[stage - 1][index][1]);
    }
  }
  const plans = Array.from({ length: 64 }, (_, seed) => replayPlan({ scene: 'forest', seed, variant: 0 }));
  const signatures = new Set(plans.map(plan => JSON.stringify({
    conditions: plan.conditions.map(condition => condition.id), attackers: sample(plan.operation),
    count: plan.operation.countMultiplier, supply: plan.operation.supplyMultiplier,
  })));
  assert(signatures.size > 32, 'seeded plans vary actual attackers and rules, not just their seed label');
  assert.equal(new Set(plans.map(plan => plan.sideKind)).size, 3);
  assert.equal(new Set(plans.map(plan => plan.startGrenades)).size, 2);
});

test('daily challenges change at UTC+8 midnight and ignore caller seed, selection and reload order', () => {
  const before = replayPlan({ kind: 'daily', date: new Date('2026-10-09T15:59:59.999Z') });
  const midnight = replayPlan({ kind: 'daily', date: new Date('2026-10-09T16:00:00.000Z') });
  assert.equal(before.dailyKey, '2026-10-09'); assert.equal(midnight.dailyKey, '2026-10-10');
  assert.notEqual(before.seed, midnight.seed);
  for (const seed of [0, 123, 'other-player', 0xffffffff]) {
    const reloaded = replayPlan({ kind: 'daily', scene: 'underground', mode: 'assault', difficulty: 'veteran', variant: 2, seed, date: new Date('2026-10-10T15:59:59.999Z') });
    assert.deepEqual(serial(reloaded), serial(midnight));
    assert.equal(reloaded.choice.difficulty, 'regular'); assert.equal(reloaded.conditions.length, 2);
    assert.equal(reloaded.operation.seed, reloaded.seed); assert.equal(reloaded.operation.variantIndex, reloaded.variant);
  }
  const next = replayPlan({ kind: 'daily', date: new Date('2026-10-10T16:00:00Z') });
  assert.equal(next.dailyKey, '2026-10-11'); assert.notEqual(next.seed, midnight.seed);
  const scenes = new Set(), modes = new Set(), variants = new Set();
  for (let day = 0; day < 365; day++) {
    const daily = replayPlan({ kind: 'daily', date: new Date(Date.UTC(2026, 0, 1) + day * 86400000) });
    scenes.add(daily.choice.scene); modes.add(daily.choice.mode); variants.add(daily.variant);
    assert.equal(daily.choice.difficulty, 'regular');
  }
  assert.equal(scenes.size, 7); assert.equal(modes.size, 2); assert.equal(variants.size, 3);
});

test('normal mode preserves all authored operation rules, bonus goals, rosters and approaches', () => {
  for (const options of matrix(3)) {
    const plan = replayPlan({ ...options, kind: 'normal' }), original = operationFor(options.scene, options.seed, options.variant);
    assert.deepEqual(plan.choice, { scene: options.scene, mode: options.mode, difficulty: options.difficulty });
    assert.deepEqual({ ...plan.operation, enemyType: undefined, spawnSide: undefined }, { ...original, enemyType: undefined, spawnSide: undefined });
    assert.deepEqual(sample(plan.operation, options.mode), sample(original, options.mode));
    assert.deepEqual(plan.conditions, []); assert.equal(plan.scoreMultiplier, 1);
    assert.equal(plan.startGrenades, 3); assert.equal(plan.dailyKey, null);
  }
});

test('all eight conditions have real combat or resource effects while preserving original bonus variants', () => {
  const found = new Map();
  for (let seed = 0; seed < 256; seed++) {
    const plan = replayPlan({ scene: 'pass', variant: 0, seed });
    for (const condition of plan.conditions) if (!found.has(condition.id)) found.set(condition.id, plan);
  }
  assert.equal(found.size, 8);
  for (const [id, plan] of found) {
    const base = operationFor('pass', plan.seed, 0), operation = plan.operation;
    assert.equal(operation.id, base.id); assert.equal(operation.doctrine, base.doctrine);
    assert.deepEqual(operation.bonusGoal, base.bonusGoal); assert.deepEqual(operation.bonusIdByMode, base.bonusIdByMode);
    const changed = ['countMultiplier', 'spawnInterval', 'reinforceInterval', 'captureMultiplier', 'supplyMultiplier', 'pressureMultiplier'].some(key => operation[key] !== base[key]);
    assert(changed || JSON.stringify(sample(operation)) !== JSON.stringify(sample(base)), id);
    if (id === 'suppression') assert.equal(operation.enemyType(2, 3), 'support');
    if (id === 'armor-column') assert.equal(operation.enemyType(2, 4), 'heavy');
    if (id === 'overwatch') assert.equal(operation.enemyType(2, 5), 'sniper');
    if (id === 'supply-delay') { assert.equal(plan.startGrenades, 2); assert(operation.supplyMultiplier > base.supplyMultiplier); }
    if (id === 'counterpush') assert(operation.reinforceInterval < base.reinforceInterval);
    if (id === 'surge') assert(operation.spawnInterval < base.spawnInterval);
    if (id === 'lane-shift') assert.notEqual(operation.spawnSide(1, 0), operation.spawnSide(2, 0));
  }
  const pairs = new Set(Array.from({ length: 512 }, (_, seed) => replayPlan({ seed }).conditions.map(condition => condition.id).join('|')));
  assert.equal(pairs.size, 28, 'all distinct pairs can occur');
});

test('7 maps × 2 modes × 3 difficulties × 3 variants × 32 seeds keep bounded modifiers and safe physical rosters', () => {
  let plans = 0;
  for (const options of matrix()) {
    const plan = replayPlan(options), operation = plan.operation, base = operationFor(options.scene, options.seed, options.variant);
    for (const [key, low, high] of [
      ['countMultiplier', .75, 1.3], ['spawnInterval', .75, 2.1], ['reinforceInterval', 20, 55],
      ['captureMultiplier', .8, 1.3], ['supplyMultiplier', .65, 1.45], ['pressureMultiplier', .75, 1.3],
    ]) assert(Number.isFinite(operation[key]) && operation[key] >= low && operation[key] <= high, `${options.scene}/${key}`);
    assert.equal(operation.maxActors, 14); assert.equal(operation.waveCount, 4);
    assert.equal(operation.variantId, base.variantId); assert.equal(operation.bonusId, base.bonusId);
    assert.deepEqual(operation.bonusTime, base.bonusTime); assert.deepEqual(operation.bonusGoalByMode, base.bonusGoalByMode);
    const directions = new Set();
    for (let stage = 1; stage <= 4; stage++) for (let index = 0; index < 48; index++) {
      const type = operation.enemyType(stage, index, options.mode), side = operation.spawnSide(stage, index, options.mode);
      assert(TYPES.has(type)); assert([0, 1, 2].includes(side)); directions.add(side);
      if (index === 0) assert.equal(type, 'line');
      if (index < 3) assert(!['sniper', 'heavy'].includes(type));
      if (stage === 1) assert.notEqual(type, 'heavy');
      if (CLOSED.has(operation.variantId)) assert.notEqual(type, 'sniper');
      if (operation.variantId === 'rationed-infiltration') assert.notEqual(type, 'heavy');
    }
    assert.equal(directions.size, 3, `${options.scene}: all approaches remain physical lanes`); plans++;
  }
  assert.equal(plans, 4032);
});

test('all 4032 remix missions can finish, never exceed 14 actors and never add reinforcement batches', () => {
  let capped = 0;
  for (const options of matrix()) {
    const plan = replayPlan(options), mission = new Mission({ ...plan.choice, operation: plan.operation });
    let alive = 0, peak = 0, frames = 0, stageFrames = 0;
    const batches = new Map();
    while (mission.status === 'playing' && frames++ < 12000) {
      const events = mission.update(.1, { alive, near: true, contested: alive > 0, interact: true });
      if (events.includes('wave') || events.includes('objective')) stageFrames = 0;
      for (const event of events) {
        if (event === 'spawn') {
          assert(alive < 14); alive++; peak = Math.max(peak, alive); mission.spawned();
        }
        if (event === 'reinforce') {
          const stage = mission.objective + 1;
          batches.set(stage, (batches.get(stage) || 0) + 1);
          assert(batches.get(stage) <= DIFFICULTIES[options.difficulty].reinforcementBatches);
        }
      }
      // Hold each wave long enough to fill the physical actor cap, then clear it.
      // Capture is contested until the real simulated defenders have been removed.
      if (stageFrames++ >= 280 && stageFrames % 3 === 0 && alive > 0) alive--;
    }
    assert.equal(mission.status, 'won', JSON.stringify(options));
    assert(peak <= 14); if (peak === 14) capped++;
    assert.equal(mission.waveCount, 4); assert.equal(mission.rules.reinforcementBatches, DIFFICULTIES[options.difficulty].reinforcementBatches);
  }
  assert(capped > 2000, 'actor-cap backpressure was exercised, not just instantly cleared plans');
});

test('reinforcements exhaust their finite budget and last-two cleanup never creates fresh enemies', () => {
  for (const { id: scene } of SCENARIOS) for (const difficulty of DIFFICULTY_IDS) for (let variant = 0; variant < 3; variant++) {
    const plan = replayPlan({ scene, mode: 'assault', difficulty, variant, seed: 17 });
    const mission = new Mission({ ...plan.choice, operation: plan.operation });
    let alive = 0, batches = 0, frames = 0;
    while (frames++ < 12000 && !(mission.stageStarted && mission.pending === 0 && mission.reinforcementsLeft === 0)) {
      for (const event of mission.update(.1, { alive })) {
        if (event === 'spawn') { alive = Math.min(9, alive + 1); mission.spawned(); }
        if (event === 'reinforce') batches++;
      }
    }
    assert.equal(batches, DIFFICULTIES[difficulty].reinforcementBatches, `${scene}/${difficulty}/${variant}`);
    assert.equal(mission.pending, 0); assert.equal(mission.reinforcementsLeft, 0);
    alive = 2;
    for (let frame = 0; frame < 1000; frame++) {
      const events = mission.update(.1, { alive });
      assert(!events.includes('reinforce') && !events.includes('spawn'));
      assert.equal(mission.pending, 0);
    }
    assert(mission.reinforcementsClosed); assert.equal(mission.status, 'playing');
  }
});

test('plans and catalog cannot mutate shared operation rules; malformed persisted options recover deterministically', () => {
  const snapshot = JSON.stringify(OPERATION_RULES), plan = replayPlan({ scene: 'rail', seed: 'immutability', variant: 0 });
  assert(Object.isFrozen(plan)); assert(Object.isFrozen(plan.conditions)); assert(Object.isFrozen(plan.operation));
  assert.throws(() => { plan.operation.supplyMultiplier = 0; }, TypeError);
  assert.throws(() => { plan.conditions[0].brief.zh = 'changed'; }, TypeError);
  assert.throws(() => { REPLAY_CONDITIONS[0].name.en = 'changed'; }, TypeError);
  assert.equal(JSON.stringify(OPERATION_RULES), snapshot);
  const invalid = replayPlan({ scene: '__proto__', mode: '__proto__', difficulty: 'unknown', variant: Infinity, seed: NaN, kind: 'corrupt' });
  assert.deepEqual(invalid.choice, { scene: 'pass', mode: 'defend', difficulty: 'regular' });
  assert.equal(invalid.kind, 'normal'); assert.equal(invalid.seed, 1); assert.equal(invalid.variant, 1);
  assert.doesNotThrow(() => replayPlan(null));
  const badDate = replayPlan({ kind: 'daily', date: new Date(NaN) });
  assert.equal(badDate.dailyKey, '1970-01-01');
  assert.deepEqual(serial(badDate), serial(replayPlan({ kind: 'daily', date: 'invalid' })));
  assert(TYPES.has(plan.operation.enemyType(NaN, Infinity)));
  assert([0, 1, 2].includes(plan.operation.spawnSide(-3, -1)));
});
