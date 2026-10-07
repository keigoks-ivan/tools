import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT, SwipeMatch, sweptCircleContact } from './swipe-match.mjs';

const DT = 1 / 240, RADIUS = COURT.paddleRadius + COURT.ballRadius;
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
function create(level = 'normal', mode = 'practice') {
  const events = [];
  const match = new SwipeMatch({ random: () => .5, onEvent: event => events.push({ ...event }) });
  match.start({ level, mode });
  return { match, events };
}
function incoming(match, x = 0, z = .96, speed = 3.15) {
  match.phase = 'rally'; match.ball = { x, z, vx: 0, vz: speed, spin: 0, hitter: -1 };
  match.slowUsed = true; match.slowRemaining = 0;
}
function gestureShot(vx, vz, slow = false) {
  const { match, events } = create();
  match.player.x = -vx * .1; match.player.z = 1.7; match.cancelInput();
  for (let frame = 0; frame < 24; frame++) {
    match.setPaddleTarget(match.player.x + vx * DT, match.player.z + vz * DT);
    match.step(DT);
  }
  incoming(match, match.player.x, match.player.z - RADIUS, 3.15);
  if (slow) { match.slowUsed = false; match.slowRemaining = 1; }
  match.setPaddleTarget(match.player.x + vx * DT, match.player.z + vz * DT);
  match.step(DT);
  return { match, hit: events.find(event => event.type === 'hit' && event.side === 1) };
}

test('relative sweep catches moving-circle crossing, tangent, and ignores unrelated paths', () => {
  close(sweptCircleContact({x:-1,z:0},{x:1,z:0},{x:0,z:-1},{x:0,z:1},.2), .5 - .2 / Math.sqrt(8));
  close(sweptCircleContact({x:-1,z:.2},{x:1,z:.2},{x:0,z:0},{x:0,z:0},.2), .5);
  assert.equal(sweptCircleContact({x:-1,z:.4},{x:1,z:.4},{x:0,z:0},{x:0,z:0},.2), null);
  assert.equal(sweptCircleContact({x:1,z:0},{x:1,z:0},{x:0,z:0},{x:0,z:0},.2), null);
});

test('target jumps are speed-limited and cannot catch the ball along the requested teleport path', () => {
  const { match, events } = create();
  match.player.x = -.9; match.player.z = 1.18; match.cancelInput();
  incoming(match, 0, 1.18);
  match.setPaddleTarget(.9, 1.18); match.step(1 / 60);
  close(match.player.x, -.9 + 5.5 / 60);
  assert.ok(Math.hypot(match.player.vx, match.player.vz) <= 5.5 + 1e-8);
  assert.equal(events.filter(event => event.type === 'hit').length, 0);
});

test('all awarded player hits have real contact and finite actual paddle motion', () => {
  const { match, events } = create();
  match.player.x = -.35; match.player.z = 1.1; match.cancelInput();
  incoming(match, 0, .8, 8);
  match.setPaddleTarget(.4, 1.1); match.step(.09);
  const hit = events.find(event => event.type === 'hit');
  assert.ok(hit);
  assert.equal(hit.side, 1); assert.equal(hit.swept, true);
  assert.ok(hit.contactDistance <= RADIUS + 1e-6);
  close(Math.hypot(hit.x - hit.paddleX, hit.z - hit.paddleZ), hit.contactDistance);
  assert.ok(Math.hypot(hit.paddleVx, hit.paddleVz) > .2);
  assert.ok(hit.vz < 0);
});

test('holding the correct position and giving no input loses a five-point match', () => {
  for (const level of ['easy', 'normal', 'hard']) {
    const { match, events } = create(level, 'match');
    for (let time = 0; time < 30 && match.phase !== 'over'; time += 1 / 30) match.step(1 / 30);
    assert.equal(match.phase, 'over'); assert.deepEqual(match.score, [0, 5]);
    assert.equal(match.playerHits, 0); assert.equal(events.filter(event => event.type === 'hit').length, 0);
    assert.equal(events.filter(event => event.type === 'over').length, 1);
  }
});

test('lateral motion changes angle and curve; forward speed changes power without slow-time amplification', () => {
  const left = gestureShot(-2, -2), right = gestureShot(2, -2);
  assert.ok(left.hit && right.hit);
  assert.ok(left.hit.vx < 0 && right.hit.vx > 0);
  assert.ok(left.hit.spin < 0 && right.hit.spin > 0);
  const soft = gestureShot(0, -.8), fast = gestureShot(0, -4.5), slowed = gestureShot(0, -4.5, true);
  assert.ok(soft.hit && fast.hit && slowed.hit);
  assert.ok(fast.hit.power > soft.hit.power + .25);
  close(fast.hit.power, slowed.hit.power);
  close(fast.hit.paddleVz, slowed.hit.paddleVz);
  close(fast.match.ball.z, slowed.match.ball.z);
  assert.equal(slowed.match.timeScale, 1); assert.equal(slowed.match.slowRemaining, 0);
});

test('sparse 15/30/60 Hz target updates preserve fast versus slow drag semantics', () => {
  const powers = { slow: [], fast: [] };
  for (const fps of [15,30,60]) {
    const results = [];
    for (const duration of [.64,.20]) {
      const { match, events } = create();
      match.player.z = 1.45; match.cancelInput();
      incoming(match, 0, .883);
      match.slowUsed = false; match.slowRemaining = 1;
      for (let elapsed = 0; elapsed < duration + .2; elapsed += 1 / fps) {
        match.setPaddleTarget(0, 1.45 - .72 * Math.min((elapsed + 1 / fps) / duration, 1));
        match.step(1 / fps);
      }
      const hit = events.find(event => event.type === 'hit' && event.side === 1);
      assert.ok(hit); assert.ok(hit.contactDistance <= RADIUS + 1e-6);
      results.push(hit);
      powers[duration === .64 ? 'slow' : 'fast'].push(hit.power);
    }
    const [slow, fast] = results;
    assert.ok(fast.power > slow.power + .14);
    assert.ok(Math.abs(fast.gestureVz) > Math.abs(slow.gestureVz) * 1.8);
    assert.ok(Math.abs(slow.gestureVz) < 1.5);
  }
  for (const values of Object.values(powers)) assert.ok(Math.max(...values) - Math.min(...values) < .06);
});

test('stopping decays the averaged gesture instead of retaining the latest catch-up burst', () => {
  const { match } = create();
  match.setPaddleTarget(0, .7); match.step(.09);
  assert.ok(Math.abs(match.gestureVelocity.vz) > 1);
  match.step(.3);
  assert.ok(Math.abs(match.gestureVelocity.vz) < .1);
  const snapshot = match.snapshot(); snapshot.gestureVelocity.vz = -99;
  assert.ok(Math.abs(match.gestureVelocity.vz) < .1);
  match.cancelInput(); assert.deepEqual(match.gestureVelocity, {vx:0,vz:0});
});

test('moving into an interception point and then resting expires gesture eligibility', () => {
  const { match, events } = create();
  incoming(match, .4, -.2, .8);
  match.setPaddleTarget(.4, 1.18);
  match.step(.3);
  assert.ok(match.wallClock - match.lastPlayerMove > .18);
  for (let time = 0; time < 2.8 && match.phase === 'rally'; time += 1 / 60) match.step(1 / 60);
  assert.equal(events.filter(event => event.type === 'hit').length, 0);
  assert.equal(events.find(event => event.type === 'point')?.winner, -1);
});

test('AI does not move toward a newly struck ball before its reaction delay', () => {
  const { match, hit } = gestureShot(2, -2);
  assert.ok(hit);
  match.step(.12);
  close(match.opponent.x, 0); close(match.opponent.z, -1.25);
  match.step(.12);
  assert.ok(match.opponent.x > 0);
});

test('slow time belongs to one incoming leg, expires in wall time at 15/30/60 Hz, and does not restart on target updates', () => {
  for (const fps of [15,30,60]) {
    const { match } = create();
    match.serve(); match.ball.z = .31; match.ball.vz = .5;
    const legId = match.legId, start = match.wallClock;
    let slowDuration = 0;
    for (let frame = 0; frame < fps * 2; frame++) {
      match.setPaddleTarget(frame % 2 ? -.8 : .8, 1.78);
      const before = match.snapshot(); match.step(1 / fps);
      slowDuration += Math.max(0, before.slowRemaining - match.slowRemaining);
    }
    close(match.wallClock - start, 2);
    close(slowDuration, 1);
    assert.equal(match.legId, legId); assert.equal(match.slowUsed, true);
    assert.equal(match.slowRemaining, 0); assert.equal(match.timeScale, 1);
  }
});

test('cancel input clears velocity, target travel, and recent movement without renewing slow budget', () => {
  const { match, events } = create();
  incoming(match, 0, .9);
  match.setPaddleTarget(.6, 1.4); match.step(.025);
  const position = {x:match.player.x,z:match.player.z}, slow = match.slowRemaining;
  match.cancelInput();
  match.ball.x = position.x; match.ball.z = position.z - RADIUS;
  match.step(.05);
  close(match.player.x, position.x); close(match.player.z, position.z);
  assert.equal(match.player.vx, 0); assert.equal(match.player.vz, 0);
  assert.deepEqual(match.gestureVelocity, {vx:0,vz:0});
  assert.equal(events.filter(event => event.type === 'hit').length, 0);
  assert.equal(match.slowRemaining, slow);
  assert.ok(match.snapshot().movementAge > 1);
});

test('AI has finite movement and can lose points to actual angled paddle contacts', () => {
  const { match, events } = create('easy', 'match');
  let maxAIMove = 0;
  for (let time = 0; time < 35 && match.phase !== 'over'; time += DT) {
    if (match.phase === 'ready') match.serve();
    if (match.ball?.hitter === -1 && match.ball.vz > 0) {
      const predictedX = match.ball.x + match.ball.vx * Math.max(0, (1.1 - match.ball.z) / match.ball.vz);
      match.setPaddleTarget(predictedX + (match.ball.z < .96 ? -.1 : .2), match.ball.z < .96 ? 1.4 : .7);
    }
    const previousX = match.opponent.x, previousPhase = match.phase;
    match.step(DT);
    if (previousPhase === 'rally' && match.phase === 'rally') maxAIMove = Math.max(maxAIMove, Math.abs(match.opponent.x - previousX));
  }
  assert.ok(match.score[0] > 0); assert.equal(match.phase, 'over');
  assert.ok(match.playerHits >= match.score[0]);
  assert.ok(maxAIMove <= 1.25 * DT + 1e-8);
  const hits = events.filter(event => event.type === 'hit');
  assert.ok(hits.every(event => event.contactDistance <= RADIUS + 1e-6));
  assert.ok(events.some(event => event.type === 'point' && event.winner === 1 && event.reason === 'missed'));
});

test('snapshot is independent and reset removes slow leg, score, input history, and pending restart', () => {
  const { match } = create(); match.serve();
  const snapshot = match.snapshot(); snapshot.score[0] = 99; snapshot.player.x = 99; snapshot.ball.x = 99;
  assert.equal(match.score[0], 0); assert.equal(match.player.x, 0); assert.equal(match.ball.x, 0);
  match.reset();
  assert.equal(match.phase, 'idle'); assert.equal(match.ball, null); assert.equal(match.legId, 0);
  assert.equal(match.timeScale, 1); assert.equal(match.slowRemaining, 0); assert.equal(match.nextAt, 0);
  assert.ok(match.snapshot().movementAge > 1);
});
