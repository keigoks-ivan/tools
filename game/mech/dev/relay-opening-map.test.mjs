import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildMap } from '../lastline/map.js';
import { lastLineEncounters, RELAY_CUSTOMS, RELAY_RESTORE } from '../lastline/script.js';
import { Solid, SURFACES } from '../zero/kit.js';
import { Pilot } from '../zero/player.js';
import { syncMissionProps } from '../zero/mission-props.mjs';

function harbor() {
  const scene = new THREE.Scene(), solid = new Solid();
  const mats = Object.fromEntries(SURFACES.map(k => [k, new THREE.MeshStandardMaterial({ vertexColors: true })]));
  const map = buildMap(scene, mats, solid, { add: () => null }, { rockN: null });
  return { solid, map };
}
function walk(pilot, targets) {
  for (const { x, z } of targets) {
    const limit = Math.ceil(Math.hypot(pilot.pos.x - x, pilot.pos.z - z) * 35) + 400;
    for (let frames = 0; Math.hypot(pilot.pos.x - x, pilot.pos.z - z) > .18; frames++) {
      assert(frames < limit, `route blocked at ${pilot.pos.toArray()}`);
      pilot.yaw = Math.atan2(x - pilot.pos.x, z - pilot.pos.z);
      pilot.update(1 / 60, { mx: 0, my: 1, lookX: 0, lookY: 0 });
    }
    assert(pilot.pos.y < .4);
  }
}
const buffer = r => r.bucket.mesh.geometry.attributes.position.array.slice(r.start, r.start + r.positions.length);

test('受損開場的備用電台可步行操作，接通與重玩會同步實體道具', () => {
  const { solid, map } = harbor();
  const id = RELAY_RESTORE.id, damaged = lastLineEncounters('damaged');
  assert.equal(map.operationProps[id], undefined);
  map.setRelayOpening('damaged');
  const [relay] = map.operationProps[id];
  assert(relay.body.visible && !relay.installed && relay.triangles < 200);
  assert(relay.body.bounds.distanceToPoint(relay.p) < 1 && relay.body.bounds.min.z > relay.p.z + .35);
  assert(relay.body.ranges.every(r => buffer(r).some(Boolean)));

  const pilot = new Pilot(solid);
  pilot.reset(map.marks.start.clone(), 0);
  walk(pilot, [relay.p, map.items.port_call.p]);
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

test('兩條海關入口皆可步行，現場只顯示並載入本路線的設備狀態', () => {
  const { solid, map } = harbor(), id = RELAY_CUSTOMS.intact.id;
  const from = map.items.port_call.p.clone(); from.y = 0;
  const check = (mode, kind) => {
    const encounter = RELAY_CUSTOMS[mode];
    map.setRelayOpening(mode);
    const [handle] = map.operationProps[id];
    assert(handle.kind === kind && handle.body.visible && !handle.installed && handle.triangles < 220);
    assert(handle.body.bounds.distanceToPoint(handle.p) < 1);
    assert(handle.body.ranges.every(r => buffer(r).some(Boolean)));
    const pilot = new Pilot(solid);
    pilot.reset(from.clone(), 0);
    walk(pilot, [...(encounter.route || []), encounter.guide].map(([x,z]) => ({ x,z })));
    assert(encounter.trigger(pilot.pos));
    assert(!RELAY_CUSTOMS[mode === 'intact' ? 'damaged' : 'intact'].trigger(pilot.pos));
    walk(pilot, [handle.p]);
    syncMissionProps(map, lastLineEncounters(mode), new Set(['B', id]), new Set());
    assert(handle.installed && handle.lamp.visible);
    return handle;
  };
  assert.equal(map.operationProps[id], undefined);
  const log = check('intact', 'customsLog');
  const reader = log.p.clone().setY(1.4);
  for (const guard of RELAY_CUSTOMS.intact.enemies)
    assert(!solid.sees(new THREE.Vector3(guard.x, 1.6, guard.z), reader), 'the duty desk has cover from the original guards');
  const fax = check('damaged', 'transferFax');
  assert(!log.body.visible && !log.lamp.visible && log.body.ranges.every(r => !buffer(r).some(Boolean)));
  map.setRelayOpening(null);
  assert.equal(map.operationProps[id], undefined);
  assert(!fax.body.visible && !fax.lamp.visible && fax.body.ranges.every(r => !buffer(r).some(Boolean)));
  map.setRelayOpening('intact');
  assert.equal(map.operationProps[id][0], log);
  assert(!log.installed && log.body.visible);
});
