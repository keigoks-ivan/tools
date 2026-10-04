import test from 'node:test';
import assert from 'node:assert/strict';
import { Match, TABLE, serverFor, shotVelocity, advanceBall } from './physics.mjs';

test('service changes every two points, then every point at deuce', () => {
  assert.equal(serverFor([0, 0]), 1);
  assert.equal(serverFor([1, 0]), 1);
  assert.equal(serverFor([1, 1]), -1);
  assert.equal(serverFor([2, 2]), 1);
  assert.equal(serverFor([10, 10]), 1);
  assert.equal(serverFor([11, 10]), -1);
  assert.equal(serverFor([11, 11]), 1);
});

test('a serve bounces on both halves before the first return', () => {
  const events = [];
  const match = new Match({ random: () => 0.5, onEvent: e => events.push(e) });
  match.start(); match.serve();
  for (let i = 0; i < 220 && !events.some(e => e.type === 'hit'); i++) match.step(1 / 240);
  const bounces = events.filter(e => e.type === 'bounce');
  assert.equal(bounces.length, 2);
  assert.ok(bounces[0].z > 0);
  assert.ok(bounces[1].z < 0);
  assert.ok(events.some(e => e.type === 'hit' && e.side === -1));
});

test('spin-aware shots land at the requested target', () => {
  for (const spin of [-2.7, 0, 2.7]) {
    const origin = { x: 0.27, y: 1.05, z: 1.2 };
    const target = { x: -0.59, z: -0.93 };
    const flight = 0.64;
    const ball = { ...origin, ...shotVelocity(origin, target, flight, spin), spin, sideSpin: 0 };
    for (let i = 0; i < 154; i++) advanceBall(ball, flight / 154);
    assert.ok(Math.abs(ball.x - target.x) < 0.003);
    assert.ok(Math.abs(ball.z - target.z) < 0.003);
    assert.ok(Math.abs(ball.y - TABLE.height - TABLE.radius) < 0.006);
  }
});

test('the opponent and assisted player sustain a physical rally', () => {
  const match = new Match({ random: () => 0.5 });
  match.start(); match.serve();
  for (let i = 0; i < 3600; i++) {
    if (match.ball?.hitter === -1 && match.queuedShot === null) match.strike({ assist: true });
    match.step(1 / 240, match.ball?.hitter === -1 ? match.ball.x : 0);
  }
  assert.ok(match.best >= 12);
  assert.deepEqual(match.score, [0, 0]);
});

test('standing out of reach prevents an assisted return', () => {
  const events = [];
  const match = new Match({ random: () => 0.5, onEvent: e => events.push(e) });
  match.start(); match.serve();
  for (let i = 0; i < 1800 && match.phase === 'rally'; i++) {
    if (match.ball?.hitter === -1 && !match.queuedShot) match.strike({ assist: true });
    match.step(1 / 240, 1.1);
  }
  assert.deepEqual(match.score, [0, 1]);
  assert.ok(events.some(e => e.type === 'miss' && e.reason === 'reach'));
});

test('net faults, long shots and missed legal balls award the correct player', () => {
  for (const [ball, expected, reason] of [
    [{ x: 0, y: 0.85, z: 0.01, vx: 0, vy: 0, vz: -3, hitter: 1, received: 0 }, [0, 1], 'net'],
    [{ x: 0, y: 0.2, z: -2.64, vx: 0, vy: -1, vz: -3, hitter: 1, received: 0 }, [0, 1], 'out'],
    [{ x: 0, y: 0.2, z: 2.64, vx: 0, vy: -1, vz: 3, hitter: -1, received: 1 }, [0, 1], 'missed'],
  ]) {
    const events = []; const match = new Match({ onEvent: e => events.push(e) }); match.start();
    match.phase = 'rally'; match.ball = { ...ball, spin: 0, sideSpin: 0, isServe: false };
    match.step(1 / 120);
    assert.deepEqual(match.score, expected);
    assert.ok(events.some(e => e.type === 'point' && e.reason === reason));
  }
});

test('a game requires 11 points and a two-point lead', () => {
  const match = new Match(); match.start();
  match.score = [10, 10]; match.phase = 'rally'; match.point(1, 'out'); assert.equal(match.phase, 'point');
  match.phase = 'rally'; match.point(1, 'out'); assert.equal(match.phase, 'over');
  assert.deepEqual(match.score, [12, 10]);
});

test('restart clears score, pending shots and rally statistics', () => {
  const match = new Match(); match.start('hard'); match.serve(); match.score = [4, 8]; match.best = 22;
  match.start('normal');
  assert.deepEqual(match.score, [0, 0]); assert.equal(match.best, 0);
  assert.equal(match.queuedShot, null); assert.equal(match.ball, null); assert.equal(match.level, 'normal');
});
