import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, TABLE, serverFor, shotVelocity, advanceBall, predictContact } from './physics.mjs';

const DT = 1 / 240;
function setup(practice = false) {
  const events = [];
  const match = new Match({ random: () => 0.5, onEvent: event => events.push({ ...event, at: match.clock }) });
  match.start('easy', { practice }); match.serve();
  return { match, events };
}
function until(match, condition, seconds = 3, target = () => 0) {
  for (let i = 0; i < seconds / DT && !condition(); i++) match.step(DT, target());
  assert.ok(condition(), 'expected simulation condition within timeout');
}
function followContact(match) { return match.contact(1)?.x ?? 0; }

test('service changes every two points, then every point at deuce', () => {
  assert.equal(serverFor([0, 0]), 1);
  assert.equal(serverFor([1, 0]), 1);
  assert.equal(serverFor([1, 1]), -1);
  assert.equal(serverFor([2, 2]), 1);
  assert.equal(serverFor([10, 10]), 1);
  assert.equal(serverFor([11, 10]), -1);
  assert.equal(serverFor([11, 11]), 1);
});

test('a serve bounces on both halves and the opponent swings before actual contact', () => {
  const { match, events } = setup();
  const prediction = predictContact(match.ball, -1);
  assert.equal(prediction.legal, true);
  assert.ok(prediction.time > 0.9);
  until(match, () => events.some(e => e.type === 'hit'));
  const bounces = events.filter(e => e.type === 'bounce');
  assert.equal(bounces.length, 2);
  assert.ok(bounces[0].z > 0);
  assert.ok(bounces[1].z < 0);
  const swing = events.find(e => e.type === 'swing' && e.side === -1);
  const hit = events.find(e => e.type === 'hit' && e.side === -1);
  assert.ok(swing);
  assert.equal(swing.contactTime, swing.at + swing.contactDelay);
  assert.ok(swing.contactTime > swing.at);
  assert.ok(hit.at - swing.at >= 0.12);
  assert.ok(hit.at - swing.at <= 0.20);
  assert.ok(Math.abs(hit.z) >= 1.54 && Math.abs(hit.z) <= 1.78);
  assert.ok(Math.abs(hit.at - swing.at - swing.contactDelay) < DT * 2);
  assert.ok(Math.abs(hit.y - swing.y) < 0.015);
});

test('a serve input starts a visible preparation before launching the ball and preserves recovery', () => {
  const events = [];
  const match = new Match({ random: () => 0.5, onEvent: event => events.push({ ...event, at: match.clock }) });
  match.start('easy', { playerHand: 'left' });
  assert.equal(match.strike(), true);
  assert.equal(match.phase, 'ready');
  assert.equal(match.ball, null);
  assert.equal(match.inputReady, false);
  assert.equal(match.strike(), false);
  const swing = events.find(e => e.type === 'swing');
  assert.equal(swing.at, 0);
  assert.equal(swing.contactTime, 0.48);
  assert.equal(swing.contactDelay, 0.48);
  assert.equal(swing.duration, 0.78);
  assert.equal(swing.serve, true);
  assert.equal(swing.handedness, 'forehand');
  for (let i = 0; i < 115; i++) {
    match.step(DT);
    assert.equal(match.strike(), false, 'inputs during preparation cannot queue another serve');
  }
  assert.equal(match.ball, null);
  until(match, () => match.phase === 'rally', 0.1);
  const serve = events.find(e => e.type === 'serve');
  assert.ok(serve.at >= 0.48 && serve.at < 0.48 + DT);
  assert.deepEqual([serve.x, serve.y, serve.z], [swing.x, swing.y, swing.z]);
  assert.equal(match.pendingServe, null);
  assert.equal(match.playerSwing.hit, true);
  assert.equal(match.playerSwing.serve, true);
  assert.equal(match.playerSwing.until, 0.78);
  assert.equal(match.inputReady, false, 'the visible follow-through continues after launch');
  assert.equal(match.serve(), false, 'the launched serve cannot be struck twice');
  until(match, () => match.inputReady, 0.31);
  assert.equal(events.filter(e => e.type === 'serve').length, 1);
  assert.equal(events.filter(e => e.type === 'miss').length, 0);
  assert.equal(match.strike(), true);
  assert.equal(events.at(-1).type, 'swing');
  assert.equal(events.at(-1).at, match.clock, 'the first input after recovery starts immediately');
});

test('automatic practice and opponent serves each prepare once before launch', () => {
  for (const server of [1, -1]) {
    const events = [];
    const match = new Match({ random: () => 0.5, onEvent: event => events.push({ ...event, at: match.clock }) });
    match.start('easy', { practice: server === 1 });
    match.server = server;
    until(match, () => match.pendingServe, 1);
    const swing = events.find(e => e.type === 'swing');
    assert.equal(swing.side, server);
    assert.equal(match.ball, null);
    match.step(0.1);
    assert.equal(match.ball, null);
    until(match, () => match.phase === 'rally', 0.4);
    const serve = events.find(e => e.type === 'serve');
    assert.ok(serve.at - swing.at >= 0.48);
    assert.ok(serve.at - swing.at < 0.48 + DT);
    assert.ok(serve.at >= match.autoServeAt && serve.at < match.autoServeAt + DT * 2);
    assert.equal(events.filter(e => e.type === 'swing').length, 1);
    assert.equal(events.filter(e => e.type === 'serve').length, 1);
    assert.ok(server === 1 ? match.playerSwing : match.opponentSwing);
  }
});

test('spin-aware shots land at the requested target', () => {
  for (const spin of [-2.7, 0, 2.7]) {
    const origin = { x: 0.27, y: 1.05, z: 1.54 };
    const target = { x: -0.59, z: -0.93 };
    const flight = 0.49;
    const ball = { ...origin, ...shotVelocity(origin, target, flight, spin), spin, sideSpin: 0 };
    for (let i = 0; i < 118; i++) advanceBall(ball, flight / 118);
    assert.ok(Math.abs(ball.x - target.x) < 0.003);
    assert.ok(Math.abs(ball.z - target.z) < 0.003);
    assert.ok(Math.abs(ball.y - TABLE.height - TABLE.radius) < 0.006);
  }
});

test('clicking too early makes an immediate finite swing and never a delayed return', () => {
  const { match, events } = setup();
  until(match, () => match.ball?.hitter === -1);
  assert.ok(match.contact(1).time > 0.55);
  const clickedAt = match.clock;
  assert.equal(match.strike(), true);
  const swing = events.find(e => e.type === 'swing' && e.side === 1);
  assert.equal(swing.at, clickedAt);
  assert.equal(swing.contactTime, clickedAt + 0.33, 'early swings use a bounded absolute contact timestamp');
  assert.equal(match.strike(), false, 'repeated clicks cannot queue another shot during recovery');
  assert.equal(match.totalHits, 0);
  until(match, () => match.phase === 'point', 3, () => followContact(match));
  assert.equal(match.totalHits, 0);
  assert.equal(match.playerSwing, null);
  assert.ok(events.some(e => e.type === 'miss' && e.reason === 'timing'));
  assert.deepEqual(match.score, [0, 1]);
});

test('one click in a forgiving lead window returns the ball after a visible windup', () => {
  for (const lead of [0.10, 0.18, 0.28, 0.33]) {
    const { match, events } = setup(true);
    until(match, () => match.contact(1)?.legal && match.contact(1).time <= lead, 3, () => followContact(match));
    assert.equal(match.timingReady, true);
    const clickedAt = match.clock;
    assert.equal(match.strike(), true);
    assert.equal(match.totalHits, 0, 'the click cannot teleport the ball before the swing');
    until(match, () => match.totalHits === 1, 1, () => followContact(match));
    const hit = events.find(e => e.type === 'hit' && e.side === 1);
    assert.ok(hit.at - clickedAt >= 0.12 - 1e-9);
    assert.ok(hit.at - clickedAt <= 0.34);
    assert.equal(events.filter(e => e.type === 'swing' && e.side === 1).length, 1);
    assert.equal(match.ball.hitter, 1);
    assert.equal(match.ball.received, 0);
  }
});

test('practice sustains a flat physical rally with one input per return and alternates placement', () => {
  const { match, events } = setup(true);
  let clicks = 0;
  let maxHeight = 0;
  for (let i = 0; i < 25 / DT; i++) {
    const contact = match.contact(1);
    if (contact?.legal && contact.time <= 0.22 && match.inputReady) { match.strike(); clicks++; }
    match.step(DT, contact?.x ?? 0);
    maxHeight = Math.max(maxHeight, match.ball?.y ?? 0);
  }
  assert.ok(match.best >= 30);
  assert.deepEqual(match.score, [0, 0]);
  assert.equal(clicks, match.totalHits);
  assert.ok(maxHeight < 1.43, 'practice shots should travel above the net without exaggerated float arcs');
  const opponentSwings = events.filter(e => e.type === 'swing' && e.side === -1);
  const playerHits = events.filter(e => e.type === 'hit' && e.side === 1);
  assert.ok(playerHits.some(e => e.x > 0.25));
  assert.ok(playerHits.some(e => e.x < -0.25));
  assert.ok(opponentSwings.some(e => e.handedness === 'forehand'));
  assert.ok(opponentSwings.some(e => e.handedness === 'backhand'));
});

test('assistance cannot repeatedly pull an out-of-reach player toward the ball', () => {
  const { match, events } = setup();
  until(match, () => match.contact(1)?.legal && match.contact(1).time <= 0.22, 3, () => 1.1);
  match.strike();
  until(match, () => match.phase === 'point', 3, () => 1.1);
  assert.deepEqual(match.score, [0, 1]);
  assert.equal(match.totalHits, 0);
  assert.ok(events.some(e => e.type === 'miss' && e.reason === 'reach'));
});

test('physical contact requires the legal receiving bounce and an active swing', () => {
  const { match, events } = setup();
  match.ball = { x: 0, y: 1.05, z: 1.56, vx: 0, vy: 0, vz: 4, spin: 0, sideSpin: 0, hitter: -1, received: 0, isServe: false };
  assert.equal(match.canHit(1), false);
  assert.equal(match.contact(1).legal, false);
  assert.equal(match.hit(1), false);
  match.ball.received = 1;
  assert.equal(match.canHit(1), true);
  assert.equal(match.hit(1), false, 'a legal ball cannot reverse without a visible swing');
  match.strike();
  assert.equal(match.hit(1), false, 'windup precedes paddle contact');
  assert.equal(events.filter(e => e.type === 'hit').length, 0);
});

test('left-handed players use the opposite forehand side while opponents retain their right hand', () => {
  for (const [hand, x, expected] of [['left', -0.3, 'forehand'], ['left', 0.3, 'backhand'], ['right', 0.3, 'forehand'], ['right', -0.3, 'backhand']]) {
    const events = [];
    const match = new Match({ onEvent: event => events.push(event) });
    match.start('easy', { playerHand: hand });
    match.phase = 'rally';
    match.ball = { x, y: 1.1, z: 1.0, vx: 0, vy: 0, vz: 4, spin: 0, sideSpin: 0, hitter: -1, received: 1, isServe: false };
    match.strike();
    assert.equal(events.find(e => e.type === 'swing').handedness, expected);
    match.opponentSwing = null;
    match.ball = { ...match.ball, x: -0.3, z: -1.0, vz: -4, hitter: 1 };
    match.beginSwing(-1, { aim: 0, spin: 1, power: 0.5 });
    assert.equal(events.find(e => e.type === 'swing' && e.side === -1).handedness, 'forehand');
  }
});

test('net, short, double-bounce, long and missed-ball faults award the correct player', () => {
  for (const [ball, expected, reason] of [
    [{ x: 0, y: 0.85, z: 0.01, vx: 0, vy: 0, vz: -3, hitter: 1, received: 0 }, [0, 1], 'net'],
    [{ x: 0, y: 0.79, z: 0.8, vx: 0, vy: -4, vz: -3, hitter: 1, received: 0 }, [0, 1], 'short'],
    [{ x: 0, y: 0.79, z: -0.8, vx: 0, vy: -4, vz: -3, hitter: 1, received: 1 }, [1, 0], 'double'],
    [{ x: 0, y: 0.2, z: -2.64, vx: 0, vy: -1, vz: -3, hitter: 1, received: 0 }, [0, 1], 'out'],
    [{ x: 0, y: 0.2, z: 2.64, vx: 0, vy: -1, vz: 3, hitter: -1, received: 1 }, [0, 1], 'missed'],
  ]) {
    const { match, events } = setup();
    match.ball = { ...ball, spin: 0, sideSpin: 0, isServe: false };
    match.step(1 / 120);
    assert.deepEqual(match.score, expected);
    assert.ok(events.some(e => e.type === 'point' && e.reason === reason));
  }
});

test('a net-touch serve is a let and practice starts another serve after a point', () => {
  const { match, events } = setup(true);
  match.ball = { x: 0, y: 0.85, z: 0.01, vx: 0, vy: 0, vz: -3, hitter: 1, received: 0, serveStage: 1, spin: 0, sideSpin: 0, isServe: true };
  match.step(1 / 120);
  assert.equal(match.phase, 'ready');
  assert.deepEqual(match.score, [0, 0]);
  assert.ok(events.some(e => e.type === 'let'));
  until(match, () => match.phase === 'rally');
  match.score = [10, 0]; match.point(1, 'missed');
  assert.equal(match.phase, 'point', 'practice does not end at eleven');
  const rallies = match.rallies;
  until(match, () => match.rallies > rallies);
  assert.equal(match.phase, 'rally');
  assert.deepEqual(match.score, [11, 0]);
});

test('fixed simulation steps give identical outcomes at different render rates', () => {
  function simulate(dt, prepared = false) {
    const { match, events } = setup();
    if (prepared) { match.start('easy'); events.length = 0; match.strike(); }
    for (let i = 0; i < Math.round(1.2 / dt); i++) match.step(dt, 0.3);
    return { ball: match.ball, playerX: match.playerX, opponentX: match.opponentX, clock: match.clock,
      events: events.map(e => ({ type: e.type, side: e.side, at: e.at })) };
  }
  assert.deepEqual(simulate(1 / 60), simulate(1 / 120));
  assert.deepEqual(simulate(1 / 30), simulate(1 / 240));
  assert.deepEqual(simulate(1 / 60, true), simulate(1 / 120, true));
  assert.deepEqual(simulate(1 / 30, true), simulate(1 / 240, true));
});

test('a cached contact prediction counts down and is refreshed after each bounce', () => {
  const { match } = setup();
  let sawBounce = false;
  for (let i = 0; i < 200; i++) {
    const prediction = match.contact(-1);
    const fresh = predictContact(match.ball, -1);
    assert.equal(prediction.legal, fresh.legal);
    assert.ok(Math.abs(prediction.time - fresh.time) < DT + 1e-9);
    assert.ok(Math.abs(prediction.x - fresh.x) < 0.001);
    assert.ok(Math.abs(prediction.y - fresh.y) < 0.001);
    const beforeStage = match.ball.serveStage;
    const beforeReceived = match.ball.received;
    match.step(DT);
    if (match.ball.serveStage !== beforeStage || match.ball.received !== beforeReceived) sawBounce = true;
  }
  assert.ok(sawBounce);
});

test('a game requires 11 points and a two-point lead', () => {
  const match = new Match(); match.start();
  match.score = [10, 10]; match.phase = 'rally'; match.point(1, 'out'); assert.equal(match.phase, 'point');
  match.phase = 'rally'; match.point(1, 'out'); assert.equal(match.phase, 'over');
  assert.deepEqual(match.score, [12, 10]);
});

test('restart clears score, swing recovery, prediction and rally statistics', () => {
  const { match } = setup(true);
  match.strike(); match.score = [4, 8]; match.best = 22;
  match.start('normal');
  assert.deepEqual(match.score, [0, 0]); assert.equal(match.best, 0);
  assert.equal(match.playerSwing, null); assert.equal(match.opponentSwing, null);
  assert.equal(match.ball, null); assert.equal(match.contact(1), null);
  assert.equal(match.level, 'normal'); assert.equal(match.practice, false);
});
