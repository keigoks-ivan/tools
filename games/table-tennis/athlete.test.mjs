import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { sampleStroke, solveTwoBone } from './athlete-motion.mjs';
import { Match } from './physics.mjs';

register('../../game/tests/three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { createAthlete } = await import('./athlete.js');

const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const world = object => object.getWorldPosition(new THREE.Vector3());

test('two bone IK preserves anatomy at reachable and unreachable targets', () => {
  for (const target of [[0.3, -0.2, 0.3], [-0.5, -0.4, 0.4], [0, -0.1, 0], [1.2, 0.1, 0.6]]) {
    const pose = solveTwoBone([0, 0, 0], target, [-0.5, -0.5, -0.5], 0.305, 0.285);
    assert.ok(Math.abs(distance([0, 0, 0], pose.joint) - 0.305) < 1e-8);
    assert.ok(Math.abs(distance(pose.joint, pose.end) - 0.285) < 1e-8);
  }
});

test('stroke passes through contact with continuous incoming and outgoing velocity', () => {
  for (const handedness of ['forehand', 'backhand']) {
    const at = t => sampleStroke(t, 0.16, [-0.2, 1.10, 0.40], [-0.18, 1.04, 0.34], handedness).center;
    const h = 1e-5;
    assert.ok(distance(at(0), [-0.2, 1.10, 0.40]) < 1e-8);
    const before = at(0).map((v, i) => (v - at(-h)[i]) / h);
    const after = at(h).map((v, i) => (v - at(0)[i]) / h);
    assert.ok(distance(before, after) < 0.01, `${handedness}: velocity changes at impact`);
    const poseBefore = sampleStroke(-h, 0.16, [-0.2, 1.10, 0.40], [-0.18, 1.04, 0.34], handedness);
    const poseAfter = sampleStroke(h, 0.16, [-0.2, 1.10, 0.40], [-0.18, 1.04, 0.34], handedness);
    assert.ok(Math.abs(poseBefore.rise - poseAfter.rise) < 1e-5, 'weight transfer snaps at contact');
    assert.ok(Math.abs(poseBefore.turn - poseAfter.turn) < 0.0001, 'shoulder rotation snaps at contact');
    assert.ok(distance(at(-0.16), at(-0.16 + h)) < 1e-5);
    assert.ok(distance(at(0.43), at(0.43 - h)) < 1e-5);
  }
});

test('both athletes use a hand attached paddle and contact on both sides of the body', () => {
  for (const side of [-1, 1]) {
    for (const handed of ['right', 'left']) {
    for (const handedness of ['forehand', 'backhand']) {
      const actor = createAthlete(new THREE.Scene(), side, 0x799583, handed);
      const mirror = handed === 'left' ? -1 : 1;
      const x = side * mirror * (handedness === 'forehand' ? 0.20 : -0.16);
      const event = { x, y: 1.11, z: side * 1.54, contactDelay: 0.16, handedness, spin: handedness === 'backhand' ? -1 : 1 };
      actor.update(0, 1 / 120, 0, null, true);
      actor.beginSwing(0, event);
      for (let frame = 1; frame <= 19; frame++) actor.update(frame / 120, 1 / 120, 0, null, true);
      const clip = actor.metrics().strokeId;
      actor.contact(0.16, event);
      actor.update(0.16, 1 / 120, 0, null, true);
      assert.equal(actor.metrics().strokeId, clip, 'impact restarted the clip');
      assert.ok(actor.paddleWorld.distanceTo(new THREE.Vector3(event.x, event.y, event.z)) < 0.005, `${side}/${handedness}: paddle misses contact`);
      const anchor = actor.root.getObjectByName(`arm-${-mirror}-anchor`);
      const lower = actor.root.getObjectByName(`arm-${-mirror}-lower`);
      const end = actor.root.getObjectByName(`arm-${-mirror}-end`);
      assert.ok(Math.abs(world(anchor).distanceTo(world(lower)) - 0.305) < 1e-8);
      assert.ok(Math.abs(world(lower).distanceTo(world(end)) - 0.285) < 1e-8);
      assert.equal(actor.root.getObjectByName('paddle').parent, end);
      assert.equal(actor.metrics().dominantHand, handed);
      actor.update(0.20, 1 / 120, 0, null, true);
      assert.equal(actor.metrics().phase, 'follow-through');
      actor.reset(); actor.update(0, 1 / 120, 0, null, true);
      assert.equal(actor.metrics().phase, 'ready');
    }
    }
  }
});

test('left handed player and right handed opponent keep physical contacts across a real rally', () => {
  const player = createAthlete(new THREE.Scene(), 1, 0x799583, 'left');
  const opponent = createAthlete(new THREE.Scene(), -1, 0x799583, 'right');
  let match, hits = 0;
  match = new Match({ random: () => 0.5, onEvent(event) {
    const actor = event.side === 1 ? player : opponent;
    if (event.type === 'swing') actor.beginSwing(match.clock, event);
    if (event.type === 'hit') {
      actor.contact(match.clock, event);
      actor.update(match.clock, 0, event.side === 1 ? match.playerX : match.opponentX, match.ball, true);
      assert.ok(actor.paddleWorld.distanceTo(new THREE.Vector3(event.x, event.y, event.z)) < 0.005, `physical hit ${hits} misses paddle`);
      hits++;
    }
  } });
  match.start('easy', { practice: true, playerHand: 'left' });
  for (let frame = 0; frame < 120 * 20; frame++) {
    const receive = match.contact(1);
    const bodyX = receive?.legal ? receive.x + (receive.x >= 0 ? -0.16 : 0.22) : match.playerX;
    if (receive?.legal && receive.time < 0.16 && match.inputReady) match.strike({ aim: Math.sin(frame * 0.1) * 0.55, assist: true, power: 0.3, spin: 1 });
    match.step(1 / 120, bodyX);
    player.update(match.clock, 1 / 120, match.playerX, match.ball, match.phase === 'rally');
    opponent.update(match.clock, 1 / 120, match.opponentX, match.ball, match.phase === 'rally');
  }
  assert.ok(hits > 20, `only ${hits} physical contacts were exercised`);
});

test('the stance keeps a planted foot still while the other executes a shuffle', () => {
  const actor = createAthlete(new THREE.Scene(), 1, 0x799583);
  actor.update(0, 1 / 120, 0, null, true);
  const feet = [-1, 1].map(sign => actor.root.getObjectByName(`leg-${sign}-end`));
  let stanceFrames = 0;
  for (let frame = 1; frame <= 90; frame++) {
    const before = feet.map(world);
    actor.update(frame / 120, 1 / 120, frame / 120 * 1.0, null, true);
    const moving = actor.metrics().footMoving;
    if (moving >= 0) {
      const planted = 1 - moving;
      assert.ok(world(feet[planted]).distanceTo(before[planted]) < 0.003, 'planted foot slides');
      stanceFrames++;
    }
  }
  assert.ok(stanceFrames > 20, 'shuffle never took a step');
});
