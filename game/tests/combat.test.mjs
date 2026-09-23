import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

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

function constSource(name) {
  const start = source.indexOf(`const ${name} =`);
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

function combatHarness() {
  const calls = [];
  const move = id => ({ id, clip: id, ts: 1 });
  const context = vm.createContext({
    COMBAT_INPUT_BUFFER: 0.15,
    COMBO_INPUT_BUFFER: 0.42,
    combatBuffer: { dodge: 0, jump: 0, light: 0, heavy: 0 },
    atkPressed: false, heavyPressed: false, jumpPressed: false, dodgePressed: false, musouPressed: false, heavyHold: false,
    musou: 0, weapon: 'melee',
    MOVES: {
      rumi: { light: ['rL1', 'rL2', 'rL3', 'rL4'].map(move), heavySolo: move('rHeavy'), dash: move('rDash'), heavyFinish: move('rFinish'), rheavy: move('rRanged') },
      mira: { light: ['mL1', 'mL2', 'mL3'].map(move), heavySolo: move('mHeavy'), dash: move('mDash'), heavyFinish: move('mFinish'), rheavy: move('mRanged') },
      zoey: { light: ['zL1', 'zL2', 'zL3', 'zL4', 'zL5', 'zL6'].map(move), heavySolo: move('zHeavy'), dash: move('zDash'), heavyFinish: move('zFinish'), rheavy: move('zRanged') },
    },
    curChar: { key: 'rumi', atkTs: 1 },
    player: { st: 'idle', x: 0, z: 0, yaw: 0, rig: {}, invuln: 0 },
    lockTarget: null,
    clipDur() { return 0.4; },
    startMusou() { calls.push({ action: 'musou' }); },
    play() {}, S: { jump() {}, roll() {} }, JUMP_V: 9.5,
  });
  vm.runInContext(`const curMoves = () => MOVES[curChar.key];
    const curLight = () => weapon === 'melee' ? curMoves().light : ['rangedLight'];
    ${constSource('COMBO_HEAVY_ROUTES')}
    ${functionSource('clearCombatBuffer')}
    ${functionSource('bufferCombatInputs')}
    ${functionSource('takeBufferedCombatInput')}
    ${functionSource('startJump')}
    ${functionSource('startAttack')}
    ${functionSource('startDodge')}
    ${functionSource('comboHeavyMove')}
    ${functionSource('resolveGroundCombatInput')}
    ${functionSource('resolveAttackCombatInput')}
    ${functionSource('cancelChargeForDodge')}
    this.inspect = () => ({ ...combatBuffer });`, context);
  return { context, calls, buffer: () => JSON.parse(JSON.stringify(context.inspect())) };
}

test('light and heavy inputs expire after the short buffer window', () => {
  const h = combatHarness();
  h.context.atkPressed = true;
  h.context.bufferCombatInputs(0.016);
  h.context.atkPressed = false;
  assert.equal(h.buffer().light, 0.15);
  for (let i = 0; i < 8; i++) h.context.bufferCombatInputs(0.016);
  assert.equal(h.context.takeBufferedCombatInput('light'), true);
  assert.equal(h.context.takeBufferedCombatInput('light'), false, 'an action can be consumed only once');

  h.context.heavyPressed = true;
  h.context.bufferCombatInputs(0.016);
  h.context.heavyPressed = false;
  for (let i = 0; i < 10; i++) h.context.bufferCombatInputs(0.016);
  assert.equal(h.context.takeBufferedCombatInput('heavy'), false, 'unconsumed inputs must not become stale attacks');
});

test('attack follow-up waits for a confirmed hit and accepts a buffered light at the combo window', () => {
  const h = combatHarness();
  h.context.atkPressed = true;
  h.context.bufferCombatInputs(0.016);
  h.context.atkPressed = false;
  const attack = { didHit: false, atkT: 0.7, atkDur: 1, atkStage: 0 };
  assert.equal(h.context.resolveAttackCombatInput(attack, 0, 1, 1), null);
  assert.equal(h.context.player.st, 'idle', 'a follow-up cannot replace an unconfirmed hit');
  assert.equal(h.buffer().light > 0, true);

  attack.didHit = true;
  attack.atkT = 0.49;
  assert.equal(h.context.resolveAttackCombatInput(attack, 0, 1, 1), null, 'follow-ups wait for the recovery window');
  attack.atkT = 0.5;
  assert.equal(h.context.resolveAttackCombatInput(attack, 0, 1, 1), 'light');
  assert.equal(h.context.player.st, 'atk');
  assert.equal(h.context.player.curAtk.id, 'rL2');
  assert.equal(h.context.player.atkStage, 1);
});

test('an early combo tap stays buffered across a long attack until its confirmed recovery window', () => {
  const h = combatHarness();
  h.context.atkPressed = true;
  h.context.bufferCombatInputs(0.016, true);
  h.context.atkPressed = false;
  for (let i = 0; i < 15; i++) h.context.bufferCombatInputs(0.016, true);
  assert.ok(h.buffer().light > 0, 'the combo window must accommodate slower character animations');
  assert.equal(h.context.resolveAttackCombatInput({ didHit: true, atkT: 0.5, atkDur: 1, atkStage: 0 }, 0, 0, 0), 'light');
  assert.equal(h.context.player.curAtk.id, 'rL2');
  assert.equal(h.context.player.atkStage, 1);
});

test('a buffered dodge wins over attacks and special input', () => {
  const h = combatHarness();
  h.context.atkPressed = h.context.heavyPressed = h.context.jumpPressed = h.context.dodgePressed = true;
  h.context.musouPressed = true;
  h.context.musou = 100;
  h.context.bufferCombatInputs(0.016);
  h.context.atkPressed = h.context.heavyPressed = h.context.jumpPressed = h.context.dodgePressed = false;
  const action = h.context.resolveGroundCombatInput({ st: 'idle' }, 0, 0, 0);
  assert.equal(action, 'dodge');
  assert.equal(h.context.player.st, 'dodge');

  const h2 = combatHarness();
  h2.context.dodgePressed = h2.context.heavyPressed = true;
  h2.context.bufferCombatInputs(0.016);
  h2.context.dodgePressed = h2.context.heavyPressed = false;
  const attack = { didHit: true, atkT: 0.8, atkDur: 1, atkStage: 0 };
  assert.equal(h2.context.resolveAttackCombatInput(attack, 0, 0, 0), 'dodge');
  assert.equal(h2.context.player.st, 'dodge');
});

test('dodge cancels a charge and clears the charge cue', () => {
  const h = combatHarness();
  h.context.dodgePressed = true;
  h.context.bufferCombatInputs(0.016);
  h.context.dodgePressed = false;
  h.context.player.chargeCue = true;
  assert.equal(h.context.cancelChargeForDodge(h.context.player, 1, 0, 1), true);
  assert.equal(h.context.player.chargeCue, false);
  assert.equal(h.context.player.st, 'dodge');
  assert.equal(h.buffer().dodge, 0);
});

test('heavy follow-up routes into distinct character branches without changing ranged heavy', () => {
  const h = combatHarness();
  const branches = {
    rumi: ['rHeavy', 'rDash', 'rFinish', 'rFinish'],
    mira: ['mHeavy', 'mDash', 'mFinish'],
    zoey: ['zHeavy', 'zDash', 'zFinish', 'zFinish', 'zFinish', 'zFinish'],
  };
  for (const [character, expected] of Object.entries(branches)) {
    h.context.curChar.key = character;
    expected.forEach((moveId, stage) => assert.equal(h.context.comboHeavyMove(stage).id, moveId));
  }
  h.context.weapon = 'ranged';
  h.context.curChar.key = 'mira';
  h.context.heavyPressed = true;
  h.context.bufferCombatInputs(0.016);
  h.context.heavyPressed = false;
  const attack = { didHit: true, atkT: 0.7, atkDur: 1, atkStage: 2 };
  assert.equal(h.context.resolveAttackCombatInput(attack, 0, 0, 0), 'heavy');
  assert.equal(h.context.player.curAtk.id, 'mRanged');
  assert.equal(h.context.player.atkStage, -1);
});

test('stage and lifecycle reset clears every buffered combat action', () => {
  const h = combatHarness();
  Object.assign(h.context.combatBuffer, { dodge: 0.15, jump: 0.12, light: 0.1, heavy: 0.08 });
  h.context.clearCombatBuffer();
  assert.deepEqual(h.buffer(), { dodge: 0, jump: 0, light: 0, heavy: 0 });
});
