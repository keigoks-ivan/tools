import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_PROFILES, getPlayerProfile, chooseShot } from './player-profiles.mjs';

const rally = { side: 1, incoming: { x: 0, height: 1.10, spin: 0.6, speed: 6, length: 'long' },
  position: 0, opponentPosition: 0, rallyPhase: 'rally', previousShots: [] };

test('profiles retain their own handedness and identify qualitative evidence limits', () => {
  assert.equal(getPlayerProfile('lin').hand, 'left');
  assert.equal(getPlayerProfile('harimoto').hand, 'right');
  assert.equal(getPlayerProfile('unknown'), null);
  assert.equal(getPlayerProfile('__proto__'), null);
  assert.ok(Object.isFrozen(PLAYER_PROFILES.lin.evidence.sources));
  assert.ok(PLAYER_PROFILES.lin.evidence.limitations.some(text => text.includes('not athlete usage statistics')));
});

test('the same neutral rally produces distinct timing, placement and compact versus flowing strokes', () => {
  const lin = chooseShot('lin', rally), harimoto = chooseShot('harimoto', rally);
  assert.equal(lin.type, 'loop'); assert.equal(harimoto.type, 'counter');
  assert.ok(harimoto.contactDepth < lin.contactDepth);
  assert.ok(harimoto.contactDelay < lin.contactDelay);
  assert.notEqual(lin.aim, harimoto.aim);
  assert.notEqual(lin.stance.readyBias, harimoto.stance.readyBias);
});

test('Lin mixes backhand flicks with low, wide forehand and anticipated-flick push receives', () => {
  const short = { ...rally, incoming: { ...rally.incoming, length: 'short', height: 1.03, spin: -0.3, bounceDepth: 0.6 } };
  const flick = chooseShot('lin', short);
  assert.equal(flick.type, 'flick'); assert.equal(flick.handedness, 'backhand');
  assert.equal(flick.contactPolicy, 'short'); assert.ok(flick.stance.rootZ < 1.76);
  assert.equal(chooseShot('lin', { ...short, incoming: { ...short.incoming, height: 0.84 } }).type, 'push');
  const wide = chooseShot('lin', { ...short, incoming: { ...short.incoming, x: -0.6 } });
  assert.equal(wide.type, 'push'); assert.equal(wide.handedness, 'forehand');
  assert.equal(wide.reason, 'wide-forehand-short-receive');
  const waiting = chooseShot('lin', { ...short, incoming: { ...short.incoming, spin: -0.7 }, opponentPosition: 0.354, previousShots: [{ side: 1, type: 'flick', aim: 0.6 }] });
  assert.equal(waiting.type, 'push'); assert.equal(waiting.reason, 'change-the-expected-flick');
  assert.ok(waiting.landingDepth > wide.landingDepth, 'a long push changes the receiver’s familiar flick lane');
  assert.ok(Math.abs(waiting.spin) < 0.5, 'a speed-focused push is not always heavy underspin');
});

test('Harimoto uses both hands and absorbs a fast low ball instead of attacking every ball', () => {
  const backhand = chooseShot('harimoto', rally);
  const forehand = chooseShot('harimoto', { ...rally, position: 0.3, incoming: { ...rally.incoming, x: 0.55, height: 1.35 } });
  const block = chooseShot('harimoto', { ...rally, incoming: { ...rally.incoming, speed: 9, height: 0.98 } });
  assert.equal(backhand.handedness, 'backhand'); assert.equal(forehand.handedness, 'forehand');
  assert.equal(forehand.type, 'drive'); assert.equal(block.type, 'block');
  assert.ok(block.power < backhand.power);
});

test('placement responds to the opponent and previous shots, while explicit player controls take precedence', () => {
  for (const id of ['lin', 'harimoto']) assert.ok(chooseShot(id, { ...rally, opponentPosition: 0.5 }).aim < -0.5);
  const third = chooseShot('harimoto', { ...rally, rallyPhase: 'third-ball' });
  assert.notEqual(third.aim, chooseShot('harimoto', rally).aim);
  assert.notEqual(chooseShot('lin', { ...rally, shotIndex: 0 }).aim, chooseShot('lin', { ...rally, shotIndex: 4 }).aim);
  const controlled = chooseShot('lin', { ...rally, controls: { aim: -0.75, power: 0.8, spin: -1 } });
  assert.equal(controlled.aim, -0.75); assert.equal(controlled.power, 0.8); assert.equal(controlled.spin, -1); assert.equal(controlled.type, 'push');
  assert.deepEqual(rally.previousShots, [], 'the planner does not mutate input history');
});

test('both sides expose positive root depth and stance offsets consistent with the playing hand', () => {
  for (const id of ['lin', 'harimoto']) for (const side of [1, -1]) {
    const plan = chooseShot(id, { ...rally, side });
    const direction = side * (getPlayerProfile(id).hand === 'left' ? -1 : 1);
    assert.ok(plan.stance.rootZ >= 1.55 && plan.stance.rootZ <= 2.04);
    assert.ok((0 - plan.stance.bodyX) * direction < 0, 'a centered backhand has the correct body offset');
  }
});

test('missing or malformed inputs produce a finite bounded fallback', () => {
  const plan = chooseShot('__proto__', { incoming: { x: NaN, height: Infinity, spin: NaN, speed: Infinity } });
  for (const value of [plan.aim, plan.power, plan.spin, plan.contactDepth, plan.contactDelay, plan.stance.bodyX, plan.stance.rootZ]) assert.ok(Number.isFinite(value));
  assert.equal(plan.profileId, 'club');
});
