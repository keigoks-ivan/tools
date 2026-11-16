import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildMap } from '../lastline/map.js';
import { lastLineEncounters, RELAY_RESTORE } from '../lastline/script.js';
import { Solid, SURFACES } from '../zero/kit.js';
import { Pilot } from '../zero/player.js';
import { syncMissionProps } from '../zero/mission-props.mjs';

test('受損開場的備用電台可步行操作，接通與重玩會同步實體道具', () => {
  const scene = new THREE.Scene(), solid = new Solid();
  const mats = Object.fromEntries(SURFACES.map(k => [k, new THREE.MeshStandardMaterial({ vertexColors: true })]));
  const map = buildMap(scene, mats, solid, { add: () => null }, { rockN: null });
  const id = RELAY_RESTORE.id, damaged = lastLineEncounters('damaged');
  const buffer = r => r.bucket.mesh.geometry.attributes.position.array.slice(r.start, r.start + r.positions.length);
  assert.equal(map.operationProps[id], undefined);
  map.setRelayOpening('damaged');
  const [relay] = map.operationProps[id];
  assert(relay.body.visible && !relay.installed && relay.triangles < 200);
  assert(relay.body.bounds.distanceToPoint(relay.p) < 1 && relay.body.bounds.min.z > relay.p.z + .35);
  assert(relay.body.ranges.every(r => buffer(r).some(Boolean)));

  const pilot = new Pilot(solid);
  pilot.reset(map.marks.start.clone(), 0);
  const truckRadio = map.items.port_call.p;
  for (const target of [relay.p, truckRadio]) {
    for (let frames = 0; Math.hypot(pilot.pos.x - target.x, pilot.pos.z - target.z) > .18; frames++) {
      assert(frames < 720, `route blocked at ${pilot.pos.toArray()}`);
      pilot.yaw = Math.atan2(target.x - pilot.pos.x, target.z - pilot.pos.z);
      pilot.update(1 / 60, { mx: 0, my: 1, lookX: 0, lookY: 0 });
    }
    assert(pilot.pos.y < .4);
  }
  syncMissionProps(map, damaged, new Set([id]), new Set());
  assert(relay.installed && relay.lamp.visible);
  map.setRelayOpening('intact');
  syncMissionProps(map, lastLineEncounters('intact'), new Set(), new Set());
  assert.equal(map.operationProps[id], undefined);
  assert(!relay.body.visible && relay.body.ranges.every(r => !buffer(r).some(Boolean)));
  map.setRelayOpening('damaged');
  syncMissionProps(map, damaged, new Set(), new Set());
  assert.equal(map.operationProps[id][0], relay);
  assert(relay.body.visible && !relay.installed);
});
