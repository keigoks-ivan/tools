import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { sampleServe, sampleStroke, solveTwoBone, strokeDuration } from './athlete-motion.mjs';
import { Match } from './physics.mjs';
import { blendBodyPose, motionDefinition, readyBodyPose, sampleBodyClip } from './motion-clips.mjs';

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
  let previousMoving = -1;
  for (let frame = 1; frame <= 90; frame++) {
    const before = feet.map(world);
    actor.update(frame / 120, 1 / 120, frame / 120 * 1.0, null, true);
    const moving = actor.metrics().footMoving;
    if (moving >= 0 && (previousMoving === moving || previousMoving < 0)) {
      const planted = 1 - moving;
      assert.ok(world(feet[planted]).distanceTo(before[planted]) < 0.003, 'planted foot slides');
      stanceFrames++;
    }
    previousMoving = moving;
  }
  assert.ok(stanceFrames > 20, 'shuffle never took a step');
});

test('backhand upper arms remain in front of the jersey instead of passing through the chest', () => {
  for (const side of [-1, 1]) for (const handed of ['left', 'right']) {
    const mirror = handed === 'left' ? -1 : 1;
    const actor = createAthlete(new THREE.Scene(), side, 0x799583, handed);
    for (let frame = 0; frame < 120; frame++) actor.update(frame / 120, 1 / 120, 0, null, true);
    actor.beginSwing(1, { x: -side * mirror * 0.16, y: 1.11, z: side * 1.54, contactDelay: 0.16, handedness: 'backhand' });
    for (let frame = 1; frame <= 19; frame++) actor.update(1 + frame / 120, 1 / 120, 0, null, true);
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
    const initial = actor.freeHandWorld.clone();
    let hold, release, clear;
    for (let frame = 0; frame <= 96; frame++) {
      const time = 1 + frame / 120;
      actor.update(time, 1 / 120, 0, null, false);
      if (frame === 0) assert.ok(initial.distanceTo(actor.freeHandWorld) < 0.001, 'serve preparation snaps the palm to a new position');
      if (frame === 12) hold = actor.freeHandWorld.clone();
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

const flatPose = value => Array.isArray(value) ? value.flatMap(flatPose) : typeof value === 'object' ? Object.values(value).flatMap(flatPose) : [value];

test('separate whole-body libraries remain smooth through every stroke phase', () => {
  for (const profile of ['lin-yun-ju', 'harimoto']) for (const hand of ['forehand', 'backhand']) for (const type of ['loop', 'drive', 'counter', 'block', 'push', 'flick']) {
    const definition = motionDefinition(profile, hand, type);
    const at = time => flatPose(sampleBodyClip(profile, time, 0.16, hand, type));
    const h = 1e-5;
    for (const time of [-0.16, -0.16 * 0.48, 0, definition.followTime, definition.duration]) {
      const before = at(time - h), here = at(time), after = at(time + h);
      assert.ok([...before, ...here, ...after].every(Number.isFinite));
      assert.ok(distance(before, after) < 0.001, `${profile}/${type}: body pose jumps`);
      const incoming = here.map((v, i) => (v - before[i]) / h), outgoing = after.map((v, i) => (v - here[i]) / h);
      assert.ok(distance(incoming, outgoing) < 0.06, `${profile}/${type}: body tangent jumps`);
    }
  }
  assert.ok(distance(flatPose(readyBodyPose('lin-yun-ju')), flatPose(readyBodyPose('harimoto'))) > 0.18);
  const flick = sampleBodyClip('lin-yun-ju', -0.08, 0.16, 'backhand', 'flick');
  const push = sampleBodyClip('lin-yun-ju', -0.08, 0.16, 'backhand', 'push');
  assert.ok(flick.playingElbow[1] > push.playingElbow[1] + 0.08, 'flick and push use the same elbow load');
  assert.ok(flick.feet[0][1] > push.feet[0][1] + 0.15, 'flick lacks the playing-side forward step');
  assert.deepEqual(blendBodyPose(readyBodyPose('lin-yun-ju'), readyBodyPose('harimoto'), 0), readyBodyPose('lin-yun-ju'));
});

test('ready elbows hang below the shoulders and both profiles recover without head or limb jumps', () => {
  for (const [handed, profile] of [['left', 'lin-yun-ju'], ['right', 'harimoto']]) {
    const mirror = handed === 'left' ? -1 : 1;
    const actor = createAthlete(new THREE.Scene(), 1, 0x799583, handed, profile);
    for (let f = 0; f < 120; f++) actor.update(f / 120, 1 / 120, 0, null, true);
    for (const sign of [-1, 1]) {
      const shoulder = world(actor.root.getObjectByName(`arm-${sign}-anchor`)), elbow = world(actor.root.getObjectByName(`arm-${sign}-lower`));
      assert.ok(shoulder.y - elbow.y > 0.15, `${profile}: ready elbow is held high`);
    }
    for (const handedness of ['forehand', 'backhand']) {
      actor.beginSwing(1, { x: mirror * (handedness === 'forehand' ? 0.20 : -0.16), y: 1.11, z: 1.54, contactDelay: 0.16, handedness, shotType: 'drive' });
      const joints = ['head', 'arm--1-lower', 'arm-1-lower', 'arm--1-end', 'arm-1-end', 'leg--1-lower', 'leg-1-lower'].map(name => actor.root.getObjectByName(name));
      let previous = joints.map(world);
      for (let frame = 1; frame < 160; frame++) {
        actor.update(1 + frame / 240, 1 / 240, 0, null, true);
        const current = joints.map(world);
        for (let i = 0; i < current.length; i++) assert.ok(current[i].distanceTo(previous[i]) < 0.045, `${profile}/${handedness}: joint ${i} snaps`);
        assert.ok(Math.abs(actor.root.getObjectByName('head').rotation.x) < 0.55, 'neck hyperextends');
        previous = current;
      }
      assert.equal(actor.metrics().phase, 'ready');
    }
    actor.setProfile(profile === 'lin-yun-ju' ? 'harimoto' : 'lin-yun-ju');
    actor.reset(); actor.update(0, 1 / 120, 0, null, true);
    assert.notEqual(actor.metrics().profileId, profile);
  }
});

test('fore and aft footwork preserves the supporting foot in world XZ', () => {
  const actor = createAthlete(new THREE.Scene(), 1, 0x799583, 'left');
  const feet = [-1, 1].map(sign => actor.root.getObjectByName(`leg-${sign}-end`));
  let supporting = 0;
  let previousMoving = -1;
  for (let frame = 0; frame < 360; frame++) {
    const before = feet.map(world);
    const x = Math.sin(frame / 120 * 1.2) * 0.32, rootZ = 1.94 - Math.sin(frame / 120) * 0.32;
    actor.update(frame / 120, 1 / 120, x, null, true, null, { rootZ });
    if (frame > 0 && actor.metrics().footMoving >= 0 && (previousMoving === actor.metrics().footMoving || previousMoving < 0)) {
      const planted = 1 - actor.metrics().footMoving;
      assert.ok(world(feet[planted]).distanceTo(before[planted]) < 0.003, 'support foot slides in depth');
      supporting++;
    }
    previousMoving = actor.metrics().footMoving;
  }
  assert.ok(supporting > 50);
});

test('fast lateral reversals retain a usable stance when render frames are delayed', () => {
  for (const handed of ['left', 'right']) {
    const actor = createAthlete(new THREE.Scene(), 1, 0x799583, handed);
    let time = 0;
    for (let frame = 0; frame < 200; frame++) {
      const dt = [1 / 60, 1 / 15, 0.117, 1 / 30][frame % 4];
      time += dt;
      actor.update(time, dt, 0.54 * Math.sin(time * 3.7 / 0.54), null, true);
      const pose = actor.metrics();
      assert.ok(pose.pelvisHeight > 0.69, `${handed}: lateral transfer collapses the hips`);
      assert.ok(pose.legReachError < 1e-8, `${handed}: a planted leg loses contact`);
    }
  }
});

test('low short receives meet the ball and keep the blade above the table', () => {
  for (const side of [-1, 1]) for (const handed of ['left', 'right']) for (const type of ['flick', 'push']) for (const height of [0.82, 0.94, 1.10]) {
    const actor = createAthlete(new THREE.Scene(), side, 0x799583, handed);
    for (let f = 0; f < 120; f++) actor.update(f / 120, 1 / 120, 0, null, true, null, { rootZ: 1.60 });
    const mirror = handed === 'left' ? -1 : 1;
    const event = { x: -side * mirror * 0.16, y: height, z: side * 1.08, contactTime: 1.24, contactDelay: 0.24, handedness: 'backhand', shotType: type, spin: type === 'push' ? -0.8 : 0.8 };
    actor.beginSwing(1, event);
    const paddle = actor.root.getObjectByName('paddle');
    for (let f = 0; f <= 75; f++) {
      const t = 1 + f / 120; actor.update(t, 1 / 120, 0, null, true, null, { rootZ: 1.60 });
      paddle.traverse(mesh => {
        if (!mesh.isMesh) return;
        const vertices = mesh.geometry.attributes.position;
        for (let i = 0; i < vertices.count; i += 3) {
          const point = mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(vertices, i));
          if (Math.abs(point.z) < 1.37 && Math.abs(point.x) < 0.7625) assert.ok(point.y > 0.759, `${type}: paddle intersects the tabletop`);
        }
      });
    }
    actor.contact(1.24, event); actor.update(1.24, 0, 0, null, true, null, { rootZ: 1.60 });
    assert.ok(actor.paddleWorld.distanceTo(new THREE.Vector3(event.x, event.y, event.z)) < 0.005, 'low short receive misses contact');
    assert.ok(actor.metrics().reachError < 0.001, 'short receive is out of reach');
  }
});

test('low pushes outside the end line remain clear when their follow-through enters the table', () => {
  for (const side of [-1, 1]) for (const handed of ['left', 'right']) for (const handedness of ['forehand', 'backhand']) {
    const actor = createAthlete(new THREE.Scene(), side, 0x799583, handed), mirror = handed === 'left' ? -1 : 1;
    for (let f = 0; f < 120; f++) actor.update(f / 120, 1 / 120, 0, null, true);
    const event = { x: side * mirror * (handedness === 'forehand' ? 0.20 : -0.16), y: 0.82, z: side * 1.46, contactDelay: 0.25, handedness, shotType: 'push', spin: -0.8 };
    actor.beginSwing(1, event);
    let previous = actor.paddleWorld.clone();
    for (let frame = 0; frame < 180; frame++) {
      actor.update(1 + frame / 240, 1 / 240, 0, null, true);
      assert.ok(actor.paddleWorld.distanceTo(previous) < 0.025, 'table clearance causes the paddle to jump');
      previous.copy(actor.paddleWorld);
      if (frame === 60) assert.ok(actor.paddleWorld.distanceTo(new THREE.Vector3(event.x, event.y, event.z)) < 0.005);
      actor.root.getObjectByName('paddle').traverse(mesh => {
        if (!mesh.isMesh) return;
        const vertices = mesh.geometry.attributes.position;
        for (let i = 0; i < vertices.count; i += 3) {
          const point = mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(vertices, i));
          if (Math.abs(point.z) < 1.37 && Math.abs(point.x) < 0.7625) assert.ok(point.y > 0.759, 'push follow-through crosses the tabletop');
        }
      });
    }
  }
});

test('profile selection changes the playing hand and short-step travel works at fifteen frames per second', () => {
  for (const side of [-1, 1]) {
    const actor = createAthlete(new THREE.Scene(), side, 0x799583, 'left');
    for (const profile of ['harimoto', 'lin-yun-ju', 'harimoto']) {
      actor.setProfile(profile); actor.reset();
      const left = profile === 'lin-yun-ju';
      assert.equal(actor.root.getObjectByName('paddle').parent.name, `arm-${left ? 1 : -1}-end`);
      for (let f = 0; f < 15; f++) actor.update(f / 15, 1 / 15, 0, null, true, null, { rootZ: 1.94 });
      const event = { profileId: profile, x: 0, y: 0.91, z: side * 1.1, contactTime: 1.24, contactDelay: 0.24, handedness: 'backhand', shotType: 'flick', stance: { rootZ: 1.6 } };
      actor.beginSwing(1, event);
      for (let f = 0; f < 4; f++) actor.update(1 + f / 15, 1 / 15, 0, null, true, null, { rootZ: 1.6 });
      actor.contact(1.24, event); actor.update(1.24, 0.04, 0, null, true, null, { rootZ: 1.6 });
      assert.ok(Math.abs(actor.metrics().rootDepth - 1.6) < 1e-6, 'low FPS prevents the root arriving in time');
      assert.ok(actor.paddleWorld.distanceTo(new THREE.Vector3(event.x, event.y, event.z)) < 0.005);
      assert.equal(actor.metrics().dominantHand, left ? 'left' : 'right');
    }
  }
});

test('whole-body contact poses keep upper arms outside the chest surface', () => {
  for (const [handed, profile] of [['left', 'lin-yun-ju'], ['right', 'harimoto']]) for (const handedness of ['forehand', 'backhand']) for (const type of ['loop', 'push', 'counter', 'block']) {
    const actor = createAthlete(new THREE.Scene(), -1, 0x799583, handed, profile), mirror = handed === 'left' ? -1 : 1;
    for (let f = 0; f < 120; f++) actor.update(f / 120, 1 / 120, 0, null, true);
    actor.beginSwing(1, { x: mirror * (handedness === 'forehand' ? -0.20 : 0.16), y: 1.11, z: -1.54, contactDelay: 0.16, handedness, shotType: type, spin: type === 'push' ? -0.8 : 0.8 });
    const spine = actor.root.getObjectByName('spine');
    for (let f = 1; f <= 26; f++) {
      actor.update(1 + f / 120, 1 / 120, 0, null, true);
      if (f < 16) continue;
      for (const sign of [-1, 1]) {
        const shoulder = spine.worldToLocal(world(actor.root.getObjectByName(`arm-${sign}-anchor`))), elbow = spine.worldToLocal(world(actor.root.getObjectByName(`arm-${sign}-lower`)));
        for (const t of [0.55, 0.75, 1]) {
          const point = shoulder.clone().lerp(elbow, t);
          if (Math.abs(point.x) < 0.155 && point.y > 0.08 && point.y < 0.36) assert.ok(Math.abs(point.z) > 0.14, `${profile}/${handedness}/${type}: upper arm enters the chest`);
        }
      }
    }
  }
});

test('palm follows the actual forearm while the shakehand grip stays on the handle', () => {
  for (const side of [-1, 1]) for (const profile of ['lin-yun-ju', 'harimoto']) for (const kind of ['forehand', 'backhand', 'flick', 'push', 'serve']) {
    const left = profile === 'lin-yun-ju', mirror = left ? -1 : 1, short = ['flick', 'push'].includes(kind), serve = kind === 'serve';
    const actor = createAthlete(new THREE.Scene(), side, 0x799583, left ? 'left' : 'right', profile);
    const depth = short ? 1.65 : 1.94;
    for (let f = 0; f < 60; f++) actor.update(f / 120, 1 / 120, 0, null, true, null, { rootZ: depth });
    const event = { x: side * mirror * (['backhand', 'flick'].includes(kind) ? -0.12 : 0.27), y: short ? 0.96 : serve ? 1.15 : 1.08, z: side * (short ? 1.1 : serve ? 1.28 : 1.54), contactDelay: serve ? 0.48 : 0.24, handedness: ['backhand', 'flick'].includes(kind) ? 'backhand' : 'forehand', shotType: kind === 'forehand' ? 'loop' : kind, spin: kind === 'push' ? -1 : 1, serve };
    actor.beginSwing(0.5, event);
    const end = actor.root.getObjectByName(`arm-${-mirror}-end`), lower = actor.root.getObjectByName(`arm-${-mirror}-lower`), paddle = actor.root.getObjectByName('paddle');
    let previousNormal = null;
    for (let f = 0; f <= 120; f++) {
      actor.update(0.5 + f / 120, 1 / 120, 0, null, true, null, { rootZ: depth });
      const forearm = world(end).sub(world(lower)).normalize();
      const palm = new THREE.Vector3(0, 1, 0).applyQuaternion(end.getWorldQuaternion(new THREE.Quaternion()));
      const palmNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(end.getWorldQuaternion(new THREE.Quaternion()));
      assert.ok(palm.angleTo(forearm) < Math.PI / 6, `${profile}/${kind}: palm folds back along the forearm`);
      if (previousNormal) assert.ok(palmNormal.angleTo(previousNormal) < 0.70, `${profile}/${kind}/${f}: palm rolls abruptly around the forearm`);
      previousNormal = palmNormal;
      const grip = paddle.localToWorld(new THREE.Vector3(0, 0.026, 0.007));
      const knuckles = end.localToWorld(new THREE.Vector3(0, 0.036, 0));
      assert.ok(grip.distanceTo(knuckles) < 0.003, 'racket slides out of the palm grip');
      assert.ok(Math.abs(grip.distanceTo(world(end)) - 0.036) < 0.003, 'palm length changes');
      assert.ok(end.getObjectByName('hand-grip').userData.reachError < 0.003, `${profile}/${side}/${kind}/${f}: fingers cannot wrap the actual handle ${end.getObjectByName('hand-grip').userData.reachError}`);
    }
  }
});

test('normal forehand contacts retain room for the arm on either court side', () => {
  for (const side of [-1, 1]) for (const profile of ['lin-yun-ju', 'harimoto']) for (const y of [0.96, 1.08, 1.20]) for (const offset of [0.20, 0.27, 0.40]) {
    const left = profile === 'lin-yun-ju', mirror = left ? -1 : 1;
    const actor = createAthlete(new THREE.Scene(), side, 0x799583, left ? 'left' : 'right', profile);
    for (let f = 0; f < 60; f++) actor.update(f / 120, 1 / 120, 0, null, true);
    const event = { x: side * mirror * offset, y, z: side * 1.54, contactDelay: 0.24, handedness: 'forehand', shotType: 'loop' };
    actor.beginSwing(0.5, event);
    const feet = actor.metrics().feet;
    for (let f = 0; f <= 60; f++) actor.update(0.5 + f / 240, 1 / 240, 0, null, true);
    actor.contact(0.74, event); actor.update(0.74, 0, 0, null, true);
    const shoulder = world(actor.root.getObjectByName(`arm-${-mirror}-anchor`)), elbow = world(actor.root.getObjectByName(`arm-${-mirror}-lower`)), wrist = actor.handWorld;
    const inner = THREE.MathUtils.radToDeg(shoulder.clone().sub(elbow).angleTo(wrist.clone().sub(elbow)));
    assert.ok(inner >= 59, `${profile}/${side}/${y}/${offset}: cramped ${inner.toFixed(2)} degree elbow`);
    if (wrist.y < shoulder.y) assert.ok(elbow.y < shoulder.y, 'low forehand elbow rises above the shoulder');
    assert.ok(actor.paddleWorld.distanceTo(new THREE.Vector3(event.x, event.y, event.z)) < 0.005);
    assert.ok(actor.metrics().legReachError < 0.001);
    assert.ok(actor.metrics().contactRetreat <= 0.22);
    assert.deepEqual(actor.metrics().feet, feet, 'the shoulder clearance slides the feet');
  }
});

test('serve exits continuously at the exact clip boundary for active and idle players', () => {
  for (const side of [-1, 1]) for (const handed of ['left', 'right']) for (const active of [false, true]) {
    const actor = createAthlete(new THREE.Scene(), side, 0x799583, handed);
    for (let f = 0; f < 60; f++) actor.update(f / 120, 1 / 120, 0, null, active);
    actor.beginSwing(0.5, { serve: true, x: 0, y: 1.15, z: side * 1.28, contactDelay: 0.48 });
    const sign = handed === 'left' ? -1 : 1, freeElbow = actor.root.getObjectByName(`arm-${sign}-lower`);
    let previousHand = actor.freeHandWorld.clone(), previousElbow = world(freeElbow);
    for (let f = 0; f <= 105; f++) {
      actor.update(0.5 + f / 120, 1 / 120, 0, null, active);
      const elbow = world(freeElbow), hand = actor.freeHandWorld.clone();
      assert.ok(hand.distanceTo(previousHand) < 0.060, `${side}/${handed}/${active}/${f}: serve hand jumps between preparation, release or recovery`);
      assert.ok(elbow.distanceTo(previousElbow) < 0.060, `${side}/${handed}/${active}/${f}: serve elbow jumps between preparation, release or recovery`);
      if (f >= 92) {
        assert.ok(hand.distanceTo(previousHand) < 0.012, 'free hand resets to the ball-hold pose when serve expires');
        assert.ok(elbow.distanceTo(previousElbow) < 0.012, 'free elbow snaps at the serve clip boundary');
      }
      previousHand = hand; previousElbow = elbow;
    }
    assert.equal(actor.metrics().phase, 'ready');
    actor.reset(); actor.update(0, 1 / 120, 0, null, active);
    assert.equal(actor.metrics().phase, 'ready');
  }
});

test('the blade and both rubbers remain outside the transformed forearm skin through the stroke', () => {
  for (const side of [-1, 1]) for (const profile of ['lin-yun-ju', 'harimoto']) for (const kind of ['forehand', 'backhand', 'flick', 'push', 'serve']) {
    const left = profile === 'lin-yun-ju', mirror = left ? -1 : 1, short = ['flick', 'push'].includes(kind), serve = kind === 'serve';
    const actor = createAthlete(new THREE.Scene(), side, 0x799583, left ? 'left' : 'right', profile), depth = short ? 1.65 : 1.94;
    for (let f = 0; f < 60; f++) actor.update(f / 120, 1 / 120, 0, null, true, null, { rootZ: depth });
    const event = { x: side * mirror * (['backhand', 'flick'].includes(kind) ? -0.12 : 0.27), y: short ? 0.96 : serve ? 1.15 : 1.08, z: side * (short ? 1.1 : serve ? 1.28 : 1.54), contactDelay: serve ? 0.48 : 0.24, handedness: ['backhand', 'flick'].includes(kind) ? 'backhand' : 'forehand', shotType: kind === 'forehand' ? 'loop' : kind, spin: kind === 'push' ? -1 : 1, serve };
    actor.beginSwing(0.5, event);
    const skin = actor.root.getObjectByName(`arm-${-mirror}-skin`), paddle = actor.root.getObjectByName('paddle'), position = skin.geometry.attributes.position;
    const point = new THREE.Vector3(); let previousRotation = null;
    for (let f = 0; f <= 120; f++) {
      actor.update(0.5 + f / 120, 1 / 120, 0, null, true, null, { rootZ: depth });
      const rotation = paddle.getWorldQuaternion(new THREE.Quaternion());
      if (previousRotation) assert.ok(rotation.angleTo(previousRotation) < 0.35, `${profile}/${kind}/${f}: racket orientation jumps ${rotation.angleTo(previousRotation)} between renders`);
      previousRotation = rotation;
      skin.skeleton.update();
      for (let vertex = 0; vertex < position.count; vertex++) {
        if (position.getY(vertex) > -0.305 - 0.285 * 0.08) continue;
        point.fromBufferAttribute(position, vertex); skin.applyBoneTransform(vertex, point); point.applyMatrix4(skin.matrixWorld); paddle.worldToLocal(point);
        const wood = (point.x / 0.085) ** 2 + ((point.y - 0.127) / (0.085 * 1.13)) ** 2;
        const rubber = (point.x / 0.082) ** 2 + ((point.y - 0.127) / (0.082 * 1.13)) ** 2;
        const inWood = wood < 1 && point.z > 0.0025 && point.z < 0.0155;
        const inRubber = rubber < 1 && (point.z > 0.01625 && point.z < 0.01975 || point.z > -0.00225 && point.z < 0.00125);
        assert.ok(!inWood && !inRubber, `${profile}/${side}/${kind}/${f}: forearm vertex ${vertex} enters the blade`);
      }
    }
  }
});

test('grip clearance preserves the contact center and authored face normal', () => {
  for (const side of [-1, 1]) for (const profile of ['lin-yun-ju', 'harimoto']) for (const kind of ['forehand', 'backhand', 'flick', 'push', 'serve']) {
    const left = profile === 'lin-yun-ju', mirror = left ? -1 : 1, short = ['flick', 'push'].includes(kind), serve = kind === 'serve';
    const actor = createAthlete(new THREE.Scene(), side, 0x799583, left ? 'left' : 'right', profile), depth = short ? 1.65 : 1.94;
    for (let f = 0; f < 60; f++) actor.update(f / 120, 1 / 120, 0, null, true, null, { rootZ: depth });
    const event = { x: side * mirror * (['backhand', 'flick'].includes(kind) ? -0.12 : 0.27), y: short ? 0.82 : serve ? 1.15 : 1.08, z: side * (short ? 1.1 : serve ? 1.28 : 1.54), contactDelay: serve ? 0.48 : 0.24, handedness: ['backhand', 'flick'].includes(kind) ? 'backhand' : 'forehand', shotType: kind === 'forehand' ? 'loop' : kind, spin: kind === 'push' ? -1 : 1, serve };
    actor.beginSwing(0.5, event);
    for (let f = 0; f < event.contactDelay * 240; f++) actor.update(0.5 + f / 240, 1 / 240, 0, null, true, null, { rootZ: depth });
    actor.contact(0.5 + event.contactDelay, event); actor.update(0.5 + event.contactDelay, 1 / 240, 0, null, true, null, { rootZ: depth });
    const wrist = actor.metrics().bodyPose.wrist, tilt = short ? 1 : 0;
    const authored = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.lerp(wrist[0], 1.25, tilt), wrist[1] * mirror, wrist[2] * mirror));
    const expected = new THREE.Vector3(0, 0, 1).applyQuaternion(authored).applyQuaternion(actor.root.getWorldQuaternion(new THREE.Quaternion()));
    const actual = new THREE.Vector3(0, 0, 1).applyQuaternion(actor.root.getObjectByName('paddle').getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(actual.angleTo(expected) < 0.001, 'clearance changes the strike face instead of its in-plane grip roll');
    assert.ok(actor.paddleWorld.distanceTo(new THREE.Vector3(event.x, event.y, event.z)) < 0.005, 'clearance moves the physical impact');
  }
});

test('flick recovery extends across and up without lifting the elbow beside the head', () => {
  for (const side of [-1, 1]) for (const profile of ['lin-yun-ju', 'harimoto']) {
    const left = profile === 'lin-yun-ju', mirror = left ? -1 : 1;
    const actor = createAthlete(new THREE.Scene(), side, 0x799583, left ? 'left' : 'right', profile);
    for (let f = 0; f < 60; f++) actor.update(f / 120, 1 / 120, 0, null, true, null, { rootZ: 1.65 });
    const event = { x: -side * mirror * 0.12, y: 0.96, z: side * 1.1, contactDelay: 0.24, handedness: 'backhand', shotType: 'flick' };
    const definition = motionDefinition(profile, 'backhand', 'flick', false, true);
    actor.beginSwing(0.5, event);
    const shoulder = actor.root.getObjectByName(`arm-${-mirror}-anchor`), elbow = actor.root.getObjectByName(`arm-${-mirror}-lower`);
    for (let f = 0; f <= 90; f++) {
      actor.update(0.5 + f / 120, 1 / 120, 0, null, true, null, { rootZ: 1.65 });
      assert.ok(world(elbow).y - world(shoulder).y <= 0.056, 'flick IK places the elbow beside the head');
    }
    actor.reset();
    for (let f = 0; f < 60; f++) actor.update(f / 120, 1 / 120, 0, null, true, null, { rootZ: 1.65 });
    actor.beginSwing(0.5, event);
    const follow = 0.5 + event.contactDelay + definition.followTime;
    for (let time = 0.5; time < follow; time += 1 / 240) actor.update(time, 1 / 240, 0, null, true, null, { rootZ: 1.65 });
    actor.update(follow, 1 / 240, 0, null, true, null, { rootZ: 1.65 });
    const e = world(elbow), w = actor.handWorld;
    assert.ok(w.y > e.y + 0.015, 'flick forearm hangs vertically down at follow-through');
    assert.ok((w.z - e.z) * -side > 0.08, 'flick forearm does not extend in front of the elbow');
  }
});

test('real lab preparation and complete cycles keep both arms clear and supporting knees forward', () => {
  const clips = [['forehand', 'loop'], ['forehand', 'counter'], ['backhand', 'counter'], ['backhand', 'block'], ['backhand', 'flick'], ['forehand', 'push'], ['forehand', 'serve']];
  for (const side of [-1, 1]) for (const profile of ['lin-yun-ju', 'harimoto']) for (const [handedness, shotType] of clips) {
    const left = profile === 'lin-yun-ju', mirror = left ? -1 : 1, short = ['flick', 'push'].includes(shotType), serve = shotType === 'serve';
    const actor = createAthlete(new THREE.Scene(), side, 0x799583, left ? 'left' : 'right', profile);
    for (let i = 0; i < 24; i++) actor.update(-0.4 + i / 60, 1 / 60, 0, null, true, null, { rootZ: 1.94 });
    const lead = serve ? 0.48 : 0.24, definition = motionDefinition(profile, handedness, shotType, serve), duration = lead + definition.duration + 0.12;
    const event = { x: side * mirror * (handedness === 'backhand' ? -0.12 : 0.27), y: short ? 0.96 : serve ? 1.15 : 1.08, z: side * (short ? 1.10 : serve ? 1.28 : 1.54), contactDelay: lead, handedness, shotType, spin: shotType === 'push' ? -1 : 1, serve };
    actor.beginSwing(0, event);
    const spine = actor.root.getObjectByName('spine'), head = actor.root.getObjectByName('head');
    let previousHead = world(head), previousElbows = [-1, 1].map(sign => world(actor.root.getObjectByName(`arm-${sign}-lower`))), previousFeet = actor.metrics().feet;
    for (let f = 0; f <= Math.ceil(duration * 120); f++) {
      const at = f / 120;
      const enter = THREE.MathUtils.smoothstep(at, 0, lead * 0.85), leave = THREE.MathUtils.smoothstep(at, lead + 0.12, duration - 0.07);
      if (f === Math.ceil(lead * 120)) actor.contact(lead, event);
      actor.update(at, 1 / 120, 0, null, true, null, { rootZ: short ? 1.94 - 0.29 * enter * (1 - leave) : 1.94 });
      for (const sign of [-1, 1]) {
        const s = world(actor.root.getObjectByName(`arm-${sign}-anchor`)), e = world(actor.root.getObjectByName(`arm-${sign}-lower`)), w = world(actor.root.getObjectByName(`arm-${sign}-end`));
        assert.ok(Math.abs(s.distanceTo(e) - 0.305) < 1e-7 && Math.abs(e.distanceTo(w) - 0.285) < 1e-7);
        assert.ok(e.distanceTo(previousElbows[sign === -1 ? 0 : 1]) < 0.060, `${profile}/${shotType}/${at}: elbow jumps during playback`);
        for (const t of [0.35, 0.5, 0.65, 0.8, 1]) {
          const p = spine.worldToLocal(s.clone().lerp(e, t));
          if (Math.abs(p.x) < 0.155 && p.y > 0.08 && p.y < 0.36) assert.ok(Math.abs(p.z) > 0.14, `${profile}/${handedness}/${shotType}/${at}: upper arm enters the torso during the full cycle`);
        }
        previousElbows[sign === -1 ? 0 : 1] = e;
        const hip = actor.root.worldToLocal(world(actor.root.getObjectByName(`leg-${sign}-anchor`))), knee = actor.root.worldToLocal(world(actor.root.getObjectByName(`leg-${sign}-lower`))), ankle = actor.root.worldToLocal(world(actor.root.getObjectByName(`leg-${sign}-end`)));
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(actor.root.getObjectByName(`leg-${sign}-end`).getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(actor.root.getWorldQuaternion(new THREE.Quaternion()).invert()); forward.y = 0;
        const bend = knee.clone().sub(hip.clone().lerp(ankle, 0.5)); bend.y = 0;
        assert.ok(knee.y < hip.y && knee.y > ankle.y && bend.dot(forward) > 0, 'the supporting knee bends behind the planted foot');
        if (!short && !serve && handedness === 'forehand') assert.ok(bend.angleTo(forward) < 0.30, 'forehand knee turns away from its supporting foot');
      }
      assert.ok(world(head).distanceTo(previousHead) < 0.060, 'head or neck jumps in the lab cycle'); previousHead = world(head);
      const feet = actor.metrics().feet;
      if (!short) assert.deepEqual(feet, previousFeet, 'stationary lab motion slides the supporting feet');
      previousFeet = feet;
    }
  }
});
