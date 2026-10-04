import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { sampleServe, sampleStroke, solveTwoBone, strokeDuration } from './athlete-motion.mjs';
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
    for (const spin of [-1, 0, 1]) {
    const motion = t => sampleStroke(t, 0.16, [-0.2, 1.10, 0.40], [-0.18, 1.04, 0.34], handedness, spin);
    const at = t => motion(t).center;
    const h = 1e-5;
    assert.ok(distance(at(0), [-0.2, 1.10, 0.40]) < 1e-8);
    const before = at(0).map((v, i) => (v - at(-h)[i]) / h);
    const after = at(h).map((v, i) => (v - at(0)[i]) / h);
    assert.ok(distance(before, after) < 0.01, `${handedness}: velocity changes at impact`);
    const poseBefore = motion(-h);
    const poseAfter = motion(h);
    assert.ok(Math.abs(poseBefore.rise - poseAfter.rise) < 1e-5, 'weight transfer snaps at contact');
    assert.ok(Math.abs(poseBefore.turn - poseAfter.turn) < 0.0001, 'shoulder rotation snaps at contact');
    assert.ok(Math.abs(poseBefore.load - poseAfter.load) < 0.0001, 'body load snaps at contact');
    assert.ok(distance(at(-0.16), at(-0.16 + h)) < 1e-5);
    const end = strokeDuration(handedness, spin);
    assert.ok(distance(at(end), at(end - h)) < 1e-5);
    }
  }
});

test('loop, drive, push and backhand have visibly different follow-through paths', () => {
  const contact = [-0.2, 1.10, 0.40], ready = [-0.18, 1.04, 0.34];
  const sample = (handedness, spin, age) => sampleStroke(age, 0.16, contact, ready, handedness, spin);
  const loop = sample('forehand', 1, 0.165), drive = sample('forehand', 0, 0.12), push = sample('forehand', -1, 0.11), backhand = sample('backhand', 1, 0.10);
  assert.ok(loop.center[1] > contact[1] + 0.24, 'loop does not rise across the body');
  assert.ok(Math.abs(drive.center[1] - contact[1]) < 0.04, 'flat drive is not horizontal');
  assert.ok(push.center[1] < contact[1] - 0.11, 'push does not cut downward');
  assert.ok(backhand.center[2] > contact[2] + 0.12, 'backhand does not extend forward');
  assert.ok(Math.abs(backhand.turn) < Math.abs(loop.turn) * 0.5, 'backhand uses a full forehand coil');
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

test('backhand upper arms remain in front of the jersey instead of passing through the chest', () => {
  for (const side of [-1, 1]) for (const handed of ['left', 'right']) {
    const mirror = handed === 'left' ? -1 : 1;
    const actor = createAthlete(new THREE.Scene(), side, 0x799583, handed);
    for (let frame = 0; frame < 120; frame++) actor.update(frame / 120, 1 / 120, 0, null, true);
    actor.beginSwing(1, { x: -side * mirror * 0.16, y: 1.11, z: side * 1.54, contactDelay: 0.16, handedness: 'backhand' });
    actor.update(1.16, 1 / 120, 0, null, true);
    const spine = actor.root.getObjectByName('spine');
    const shoulder = spine.worldToLocal(world(actor.root.getObjectByName(`arm-${-mirror}-anchor`)));
    const elbow = spine.worldToLocal(world(actor.root.getObjectByName(`arm-${-mirror}-lower`)));
    assert.ok(elbow.z > 0.23, 'elbow pole pulls the arm behind the torso');
    assert.ok(shoulder.clone().lerp(elbow, 0.55).z > 0.13, 'upper arm crosses the chest surface');
  }
});

test('serve holds the palm through release, clears the toss and meets the ball with fixed arm lengths', () => {
  for (const side of [-1, 1]) for (const handed of ['left', 'right']) {
    const actor = createAthlete(new THREE.Scene(), side, 0x799583, handed);
    for (let frame = 0; frame < 120; frame++) actor.update(frame / 120, 1 / 120, 0, null, false);
    const event = { serve: true, x: 0, y: 1.15, z: side * 1.28, contactTime: 1.48, contactDelay: 0.48, spin: -0.6 };
    actor.beginSwing(1, event);
    let hold, release, clear;
    for (let frame = 0; frame <= 96; frame++) {
      const time = 1 + frame / 120;
      actor.update(time, 1 / 120, 0, null, false);
      if (frame === 0) hold = actor.freeHandWorld.clone();
      if (frame === 21) release = actor.freeHandWorld.clone();
      if (frame === 39) clear = actor.freeHandWorld.clone();
      if (frame === 58) {
        actor.contact(1.48, event); actor.update(1.48, 0, 0, null, false);
        assert.ok(actor.paddleWorld.distanceTo(new THREE.Vector3(event.x, event.y, event.z)) < 0.005, 'serve paddle misses physical contact');
        assert.ok(actor.metrics().reachError < 0.001, 'serve stretches beyond the arm reach');
      }
    }
    assert.ok(hold.distanceTo(release) < 0.02, 'palm lets go before the scene releases the ball');
    assert.ok(Math.hypot(release.x - event.x, release.z - event.z) < 0.07, 'toss has a large horizontal drift');
    assert.ok(Math.abs(clear.z - release.z) > 0.29, 'free hand remains under the moving ball');
    assert.equal(actor.metrics().phase, 'ready');
  }
  const at = age => sampleServe(age, 0.48, [-0.2, 1.15, 0.66], [-0.18, 1.04, 0.34]).center;
  const h = 1e-5;
  const before = at(0).map((v, i) => (v - at(-h)[i]) / h);
  const after = at(h).map((v, i) => (v - at(0)[i]) / h);
  assert.ok(distance(before, after) < 0.01, 'serve stroke changes velocity at impact');
});

test('continuous limb skin has normalized joint weights and fits the model triangle budget', () => {
  const actor = createAthlete(new THREE.Scene(), 1, 0x799583, 'left');
  let skinCount = 0, meshCount = 0, triangles = 0;
  actor.root.traverse(mesh => {
    if (!mesh.isMesh) return;
    meshCount++;
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
    if (!mesh.isSkinnedMesh) return;
    skinCount++;
    const weights = mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < weights.count; i++) assert.ok(Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1) < 1e-6, 'joint skin has an unweighted vertex');
    assert.equal(mesh.skeleton.bones.length, 2);
  });
  assert.equal(skinCount, 4, 'limbs reverted to separate rigid segments');
  assert.ok(meshCount < 40, `model has ${meshCount} separate draw meshes`);
  assert.ok(triangles < 34000, `model has ${triangles} triangles`);
});
