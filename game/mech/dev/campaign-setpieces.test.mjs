import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCampaignSetpiece } from '../campaign-setpieces.mjs';
import { STAGE_DATA } from '../stages.js';

function fixture(stage, x, z) {
  const pos = new THREE.Vector3(x, 0, z), beams = [];
  const world = { height: () => 0, boxes: [], addCollider(b) { this.boxes.push(b); } };
  const scene = new THREE.Scene(), player = { pos, flying: false };
  const noop = () => {};
  const combat = { world, player, scene, note: noop, audio: { ui: noop, explosion: noop },
    fx: { beam: (from, to) => beams.push([from, to]), explosion: noop } };
  const { operation } = STAGE_DATA[stage - 1].route.secs.find(s => s.operation);
  const make = () => createCampaignSetpiece(combat, operation);
  const op = make();
  function aim(center) {
    const origin = pos.clone(); origin.y += 11;
    return op.aim(origin, center.clone().sub(origin).normalize(), 0);
  }
  return { op, world, player, beams, aim, make };
}

test('rescue shots redirect from the active plate to its covered power cell', () => {
  const { op, beams, aim, player } = fixture(3, -360, 106);
  assert.equal(aim(op.pairs[0].receiver), null);
  const first = aim(op.marker);
  op.hit(first);
  assert.deepEqual(beams, [[first.center, first.receiver]]);
  player.pos.z = 43;
  op.hit(aim(op.marker));
  assert.equal(op.state, 'done');
  assert.equal(beams.length, 2);
  op.dispose();
  assert.equal(op.root.parent, null);
});

test('the depot core only accepts shots while open and expiry resets a partial volley', () => {
  const { op, world, aim, make } = fixture(6, 409, -600);
  assert.equal(aim(op.core.center), null);
  op.hit(aim(op.panel.center));
  assert.equal(aim(op.core.center), null);
  op.update(.6);
  assert.ok(op.collider.top < 0);
  const core = aim(op.core.center);
  op.hit(core); op.hit(core);
  assert.equal(op.hits, 2);
  op.update(op.window);
  assert.equal(op.hits, 0);
  assert.ok(op.collider.top > 0);
  op.hit(aim(op.panel.center)); op.update(.6);
  op.hit(core); op.hit(core); op.hit(core);
  assert.equal(op.state, 'done');
  op.dispose();
  assert.ok(op.collider.top < 0);
  const replay = make();
  assert.equal(world.boxes.length, 1);
  assert.ok(replay.collider.top > 0);
  replay.dispose();
});

test('the airborne target moves and only accepts hits within its flight band', () => {
  const { op, player, aim } = fixture(8, 60, -60);
  const before = op.marker.clone();
  op.update(1);
  assert.ok(op.marker.distanceTo(before) > 3);
  assert.equal(op.hit(aim(op.marker)), false);
  player.flying = true;
  player.pos.y = op.marker.y - 11;
  assert.equal(op.hit(aim(op.marker)), true);
  assert.equal(op.hit(aim(op.marker)), false);
  while (op.state === 'active') {
    player.pos.y = op.marker.y - 11;
    assert.equal(op.hit(aim(op.marker)), true);
  }
  assert.equal(op.index, 3);
  op.dispose();
});
