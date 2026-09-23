import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MAX_ACTIVE_ENEMIES, canSpawnEnemy, countActiveEnemies,
  encounterStepReady, hordeKindAt, attackTelegraphMaxRadius,
} from '../encounter-policy.js';

const mainSource = fs.readFileSync(fileURLToPath(new URL('../main.js', import.meta.url)), 'utf8');
const policySource = fs.readFileSync(fileURLToPath(new URL('../encounter-policy.js', import.meta.url)), 'utf8');
const grunt = (kindName = 'minion', obj = null) => ({ st: 'chase', kindName, obj });

test('global admission counts spawn-in enemies and bosses, but frees dead slots', () => {
  const enemies = Array.from({ length: MAX_ACTIVE_ENEMIES }, (_, i) => grunt(i === 0 ? 'boss' : 'minion'));
  enemies[0].st = 'spawn';
  assert.equal(countActiveEnemies(enemies), MAX_ACTIVE_ENEMIES);
  assert.equal(canSpawnEnemy(enemies, 'runner'), false);
  enemies[0].st = 'dead';
  assert.equal(countActiveEnemies(enemies), MAX_ACTIVE_ENEMIES - 1);
  assert.equal(canSpawnEnemy(enemies, 'runner'), false, 'the common-enemy ceiling remains enforced');
  assert.equal(canSpawnEnemy(enemies, 'boss', 'boss'), true, 'a boss may use the reserved final slot');
});

test('assault policy preserves two elite slots and can admit officer leaders', () => {
  const enemies = Array.from({ length: 15 }, () => grunt());
  assert.equal(canSpawnEnemy(enemies, 'runner'), false);
  enemies.push(grunt('elite'), grunt('shade'));
  assert.equal(canSpawnEnemy(enemies, 'elite'), false);
  assert.equal(canSpawnEnemy(enemies, 'minion', 'officer'), true);
  enemies.push({ ...grunt('elite'), spawnRole: 'officer', officer: true });
  assert.equal(canSpawnEnemy(enemies, 'elite', 'officer'), false, 'officer count and hard cap both apply');
  assert.equal(countActiveEnemies(enemies), MAX_ACTIVE_ENEMIES);
});

test('stage-one waves wait for the previous objective and use weak cleavable squads with limited elites', () => {
  const firstStage = mainSource.match(/name: '第一關　首爾夜市・突圍戰',[\s\S]*?objectives: \[([\s\S]*?)\],\s*bossPos/);
  assert.ok(firstStage, 'stage one keeps a declared objective sequence');
  assert.equal((firstStage[1].match(/type: 'horde', need: 30/g) || []).length, 3);
  const waves = [
    { name: '夜市突圍・第一波', type: 'horde', need: 30, phase: 0 },
    { name: '夜市突圍・第二波', type: 'horde', need: 30, phase: 1 },
    { name: '夜市突圍・第三波', type: 'horde', need: 30, phase: 2 },
  ];
  assert.equal(encounterStepReady(waves, 0), true);
  assert.equal(encounterStepReady(waves, 1), false);
  waves[0].state = 'done';
  assert.equal(encounterStepReady(waves, 1), true);
  assert.equal(encounterStepReady(waves, 2), false);
  waves[1].state = 'done';
  assert.equal(encounterStepReady(waves, 2), true);
  assert.match(policySource, /MAX_ACTIVE_ENEMIES\s*=\s*18/);
  assert.match(mainSource, /level\.boss = spawnEnemy\(cfg\.bossKind,[^;]*'boss'\)/);
  assert.doesNotMatch(mainSource, /千人斬|千人斩|need:\s*1000/);
  for (const phase of [0, 0.5, 1]) {
    const squad = Array.from({ length: 4 }, (_, i) => hordeKindAt(phase, i));
    assert.equal(squad.length, 4);
    assert.ok(squad.filter(kind => kind === 'minion').length >= 1);
    assert.ok(squad.filter(kind => ['elite', 'shade'].includes(kind)).length <= 2);
  }
  assert.ok(Array.from({ length: 12 }, (_, i) => hordeKindAt(1, i)).every(kind => ['minion', 'runner', 'elite'].includes(kind)));
  assert.match(mainSource, /const STAGE_ASSETS = \[\s*\['minion', 'warrior'\]/);
  for (const hitRange of [2.1, 2.3, 2.9, 3.5]) {
    const atImpact = 1 + attackTelegraphMaxRadius(hitRange) * (0.45 / 0.7);
    assert.ok(Math.abs(atImpact - hitRange) < 1e-10, 'warning ring reaches its actual damage radius on impact');
  }
});
