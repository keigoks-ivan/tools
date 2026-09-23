import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MAX_ACTIVE_ENEMIES, canSpawnEnemy, countActiveEnemies } from '../encounter-policy.js';

const source = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name} in game source`);
  const brace = source.indexOf('{', start);
  let depth = 0, quote = null, escaped = false;
  for (let i = brace; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function harness({ functions, values = {} }) {
  const context = vm.createContext({ Math, ...values });
  vm.runInContext(functions.map(functionSource).join('\n'), context);
  return context;
}

test('stage-one horde waves only activate after the previous wave is done', () => {
  const calls = [];
  const first = { type: 'horde', state: 'done', name: 'wave 1', need: 30, phase: 0, pos: [0, 0] };
  const second = { type: 'horde', state: 'dormant', name: 'wave 2', need: 30, phase: 1, pos: [0, 0] };
  const third = { type: 'horde', state: 'dormant', name: 'wave 3', need: 30, phase: 2, pos: [0, 0] };
  const c = harness({
    functions: ['updateLevel', 'activateObjective'],
    values: {
      STAGES: [{ bossLabel: 'boss' }], stageIdx: 0,
      level: { bossPhase: false, objs: [first, second, third] }, enemies: [],
      player: { x: 0, z: 0, y: 0 }, MAX_ACTIVE_ENEMIES,
      countActiveEnemies, encounterStepReady: (steps, index) => steps.slice(0, index).every(o => o.state === 'done'),
      spawnHordeGroup(o, n) { calls.push([o, n]); }, spawnKindFor: () => 'minion',
      showToast() {}, S: { zone() {} }, Math: Object.assign(Object.create(Math), { random: () => 0.99 }),
      setObjective() {}, completeObjective() {}, startBossPhase() { throw new Error('premature boss phase'); },
      hud: { bossfill: { style: {} } },
    },
  });

  c.updateLevel(0.01);
  assert.equal(second.state, 'active');
  assert.equal(third.state, 'dormant');
  assert.deepEqual(calls.map(([, count]) => count), [10], 'only the newly activated wave receives its opening group');

  second.state = 'done';
  c.updateLevel(0.01);
  assert.equal(third.state, 'active');
});

test('kill objective retries after active-enemy capacity frees instead of losing progress', () => {
  const objective = { type: 'kill', state: 'active', name: 'clear the squad', need: 5, spawned: 0, kills: 0, pos: [0, 0] };
  const enemies = [
    ...Array.from({ length: 15 }, () => ({ st: 'chase', kindName: 'minion' })),
    ...Array.from({ length: 3 }, () => ({ st: 'chase', kindName: 'boss' })),
  ];
  const random = Object.assign(Object.create(Math), { random: () => 0.1 });
  const c = harness({
    functions: ['updateLevel', 'objSpawn'],
    values: {
      STAGES: [{ bossLabel: 'boss' }], stageIdx: 1,
      level: { bossPhase: false, objs: [objective] }, enemies,
      player: { x: 0, z: 0 }, MAX_ACTIVE_ENEMIES, countActiveEnemies,
      Math: random, spawnKindFor: () => 'minion', MAP_HALF: 50,
      canSpawnEnemy,
      spawnEnemy(kindName, x, z, role = 'regular') {
        if (!canSpawnEnemy(enemies, kindName, role)) return null;
        const enemy = { kindName, x, z, st: 'spawn', spawnRole: role };
        enemies.push(enemy);
        return enemy;
      },
      setObjective() {}, completeObjective() {}, startBossPhase() { throw new Error('premature boss phase'); },
      showToast() {}, S: { roar() {} },
      hud: { bossfill: { style: {} } },
    },
  });

  c.updateLevel(0.016);
  assert.equal(objective.spawned, 0, 'the full active cap rejects additional units');
  assert.equal(enemies.length, MAX_ACTIVE_ENEMIES);

  enemies.shift();
  c.updateLevel(0.016);
  assert.equal(objective.spawned, 1, 'the objective retries once an enemy slot is available');
  assert.equal(enemies.at(-1).obj, objective, 'the successful spawn is assigned to the objective');
});

test('officer objective leaves its quota pending when the cap blocks activation spawns', () => {
  const objective = {
    type: 'officer', state: 'dormant', name: 'officer squad', officers: 3,
    officersLeft: 3, officersSpawned: 0, pos: [0, 0],
  };
  const enemies = [
    ...Array.from({ length: 15 }, () => ({ st: 'chase', kindName: 'minion' })),
    ...Array.from({ length: 3 }, () => ({ st: 'chase', kindName: 'boss' })),
  ];
  const c = harness({
    functions: ['updateLevel', 'activateObjective', 'spawnObjectiveOfficer', 'objSpawn'],
    values: {
      STAGES: [{ bossLabel: 'boss' }], stageIdx: 1,
      level: { bossPhase: false, objs: [objective] }, enemies,
      player: { x: 0, z: 0 }, MAX_ACTIVE_ENEMIES, MAX_OFFICERS: 3, countActiveEnemies,
      OFFICER_KINDS: ['brute', 'sentinel'], OFFICER_NAMES: ['Leader'],
      Math: Object.assign(Object.create(Math), { random: () => 0.99 }),
      spawnKindFor: () => 'minion', makeOfficerBar() {}, MAP_HALF: 50,
      canSpawnEnemy,
      spawnEnemy(kindName, x, z, role = 'regular') {
        if (!canSpawnEnemy(enemies, kindName, role)) return null;
        const enemy = { kindName, x, z, st: 'spawn', spawnRole: role };
        enemies.push(enemy);
        return enemy;
      },
      setObjective() {}, completeObjective() {}, startBossPhase() { throw new Error('premature boss phase'); },
      showToast() {}, S: { zone() {} }, hud: { bossfill: { style: {} } },
    },
  });

  c.updateLevel(0.016);
  assert.equal(objective.state, 'active');
  assert.equal(objective.officersSpawned, 0, 'a rejected spawn does not consume the officer quota');

  enemies.length = 0;
  c.updateLevel(0.016);
  assert.equal(objective.officersSpawned, 3, 'the active objective retries the pending officers');
  assert.equal(enemies.filter(enemy => enemy.obj === objective && enemy.officer).length, 3);
});

test('boss phase retries a rejected boss spawn and only opens its UI after success', () => {
  const enemies = Array.from({ length: MAX_ACTIVE_ENEMIES }, () => ({ st: 'chase', kindName: 'minion' }));
  const calls = { roars: 0, toasts: 0, dialogs: 0 };
  const bossWrap = { style: { display: 'none' } };
  const c = harness({
    functions: ['updateLevel', 'startBossPhase'],
    values: {
      STAGES: [{ bossLabel: 'Boss', bossKind: 'boss', bossPos: [0, 0] }], stageIdx: 0,
      level: { bossPhase: false, boss: null, objs: [{ type: 'horde', state: 'done', pos: [0, 0] }] },
      enemies, player: { x: 0, z: 0 }, MAX_ACTIVE_ENEMIES, countActiveEnemies,
      Math: Object.assign(Object.create(Math), { random: () => 0.99 }), MAP_HALF: 50,
      canSpawnEnemy,
      spawnEnemy(kindName, x, z, role = 'regular') {
        if (!canSpawnEnemy(enemies, kindName, role)) return null;
        const enemy = { kindName, x, z, st: 'spawn', hp: 100, hpMax: 100, spawnRole: role };
        enemies.push(enemy);
        return enemy;
      },
      document: { getElementById: () => ({ textContent: '' }) },
      hud: { bosswrap: bossWrap, bossfill: { style: {} } },
      S: { roar() { calls.roars++; } },
      STORY: { s1boss: ['intro'] },
      showToast() { calls.toasts++; }, showDialog() { calls.dialogs++; },
      setObjective() {},
    },
  });

  c.updateLevel(0.016);
  assert.equal(c.level.bossPhase, false, 'a rejected boss spawn leaves the transition pending');
  assert.equal(c.level.boss, null);
  assert.equal(bossWrap.style.display, 'none');
  assert.deepEqual(calls, { roars: 0, toasts: 0, dialogs: 0 });

  enemies.shift();
  c.updateLevel(0.016);
  assert.equal(c.level.bossPhase, true);
  assert.equal(c.level.boss.kindName, 'boss');
  assert.equal(bossWrap.style.display, 'block');
  assert.deepEqual(calls, { roars: 1, toasts: 1, dialogs: 1 });
});
